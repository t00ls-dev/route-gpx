import {
  isValidAverageSpeedKmh,
  AVERAGE_SPEED_ERROR,
  speedToKmh,
  speedFromKmh,
  snapSpeed,
} from './travel-time';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
export type Coord = [number, number]; // latitude, longitude
export interface Point {
  name: string;
  coord: Coord | null;
}
export interface State {
  departure?: string;
  averageSpeedKmh?: number;
  units?: 'metric' | 'imperial';
  language?: 'en' | 'pt';
  version: 1;
  points: Point[];
  prefer: boolean;
  name: string;
  osrm: string;
  valhalla: string;
  nominatim: string;
}
export interface Step {
  name: string;
  ref: string;
  distance: number;
  duration: number;
  kind?: string;
  roadClass?: string;
}
export interface Route {
  segments: Coord[][];
  steps: Step[];
  distance: number;
  duration: number | null;
  provider: string;
  snapped?: Coord[];
}
export const defaults = (): State => ({
  version: 1,
  units: 'metric',
  points: [
    { name: 'Start', coord: null },
    { name: 'Destination', coord: null },
  ],
  prefer: true,
  name: '',
  osrm: 'https://router.project-osrm.org',
  valhalla: 'https://valhalla1.openstreetmap.de',
  nominatim: 'https://nominatim.openstreetmap.org',
});
export function validCoord(v: unknown): v is Coord {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180
  );
}
const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
/** Shape check for routes from routers and backups before they are drawn, saved or exported. */
export function validRoute(value: unknown): value is Route {
  const route = value as Route | null;
  return (
    !!route &&
    typeof route === 'object' &&
    Array.isArray(route.segments) &&
    route.segments.length > 0 &&
    route.segments.every(
      (s) => Array.isArray(s) && s.length >= 2 && s.every(validCoord),
    ) &&
    validAmount(route.distance) &&
    (route.duration === null || validAmount(route.duration)) &&
    typeof route.provider === 'string' &&
    Array.isArray(route.steps) &&
    route.steps.every(
      (s) =>
        !!s &&
        typeof s.name === 'string' &&
        typeof s.ref === 'string' &&
        validAmount(s.distance) &&
        validAmount(s.duration) &&
        (s.kind === undefined || typeof s.kind === 'string'),
    ) &&
    (route.snapped === undefined ||
      (Array.isArray(route.snapped) && route.snapped.every(validCoord)))
  );
}
export function parseCoordinates(text: string): Coord | null {
  const match = text
    .trim()
    .match(/^\(?\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)?$/);
  if (!match) return null;
  const c: Coord = [Number(match[1]), Number(match[2])];
  return validCoord(c) ? c : null;
}
export function serverUrl(text: string): string {
  const u = new URL(text);
  if (
    !['https:', 'http:'].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new Error(
      'Use an HTTP(S) server URL without credentials, query or hash.',
    );
  if (
    typeof location !== 'undefined' &&
    location.protocol === 'https:' &&
    u.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  )
    throw new Error('Use HTTPS for a server accessed from this site.');
  return u.href.replace(/\/$/, '');
}
const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
const SERVER_KEYS = ['osrm', 'valhalla', 'nominatim'] as const;
const MAX_V1_LINK = 60000;
const MAX_V2_LINK = 8000;
const MAX_V2_JSON_BYTES = 256 * 1024;
const roundCoordinate = (n: number) => Math.round(n * 1e6) / 1e6;
const INVALID_LINK = 'This route link is invalid or too large.';
/** Legacy `#v1=` writer: base64url JSON of the complete State. Links in this format stay readable. */
export function encodeStateV1(state: State): string {
  return '#v1=' + toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}
/**
 * `#v2=` link: base64url raw DEFLATE of a positional JSON array
 * `[points, prefer, name, units, language, speed, departure, servers]`.
 * Points are `[name, lat, lon]` (6 decimals) or `[name]`; absent options are 0
 * and trailing ones are dropped; servers are omitted when all are defaults and
 * otherwise use "" for each default. Decoding reuses `validateState`.
 */
export function encodeState(state: State): string {
  const initial = defaults();
  const servers = SERVER_KEYS.map((key) =>
    state[key] === initial[key] ? '' : state[key],
  );
  const payload: unknown[] = [
    state.points.map((p) =>
      p.coord
        ? [p.name, roundCoordinate(p.coord[0]), roundCoordinate(p.coord[1])]
        : [p.name],
    ),
    state.prefer === true ? 1 : state.prefer === false ? 0 : state.prefer,
    state.name,
    state.units === 'imperial'
      ? 'i'
      : state.units === 'metric'
        ? 'm'
        : (state.units ?? 0),
    state.language ?? 0,
    state.averageSpeedKmh ?? 0,
    state.departure ?? 0,
    servers.some(Boolean) ? servers : 0,
  ];
  while (payload.at(-1) === 0) payload.pop();
  return (
    '#v2=' +
    toBase64Url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }))
  );
}
/** Maps a `#v2=` payload back to the State shape; anything unexpected is left for `validateState` to reject. */
function decodeV2(text: string): unknown {
  // fflate truncates to the output buffer, so one spare byte detects oversized payloads.
  const out = new Uint8Array(MAX_V2_JSON_BYTES + 1);
  const bytes = inflateSync(fromBase64Url(text), { out });
  if (bytes.length > MAX_V2_JSON_BYTES) throw new Error(INVALID_LINK);
  const x: unknown = JSON.parse(strFromU8(bytes));
  if (!Array.isArray(x) || !Array.isArray(x[0])) throw new Error(INVALID_LINK);
  const [points, prefer, name, units, language, speed, departure, servers] =
    x as unknown[];
  if (servers !== undefined && servers !== 0 && !Array.isArray(servers))
    throw new Error(INVALID_LINK);
  const optional = (value: unknown) =>
    value === 0 || value === undefined ? undefined : value;
  const initial = defaults();
  const server = (index: number) =>
    Array.isArray(servers) && servers[index] !== ''
      ? servers[index]
      : initial[SERVER_KEYS[index]];
  return {
    version: 1,
    points: (points as unknown[]).map((p) =>
      Array.isArray(p)
        ? { name: p[0], coord: p.length === 1 ? null : p.slice(1) }
        : p,
    ),
    prefer: prefer === 1 ? true : prefer === 0 ? false : prefer,
    name,
    units:
      units === 'm' ? 'metric' : units === 'i' ? 'imperial' : optional(units),
    language: optional(language),
    averageSpeedKmh: optional(speed),
    departure: optional(departure),
    osrm: server(0),
    valhalla: server(1),
    nominatim: server(2),
  };
}
export type ServerUrls = Pick<State, (typeof SERVER_KEYS)[number]>;
/** All three servers when any differs from the defaults, or null when a state uses only defaults. */
export function linkServerOverrides(state: State): ServerUrls | null {
  const initial = defaults();
  return SERVER_KEYS.some((key) => state[key] !== initial[key])
    ? { osrm: state.osrm, valhalla: state.valhalla, nominatim: state.nominatim }
    : null;
}
export function decodeState(hash: string, resetInvalidSpeed = false): State {
  if (!hash || hash === '#') return defaults();
  if (hash.startsWith('#v2=') && hash.length <= MAX_V2_LINK)
    return validateState(decodeV2(hash.slice(4)), resetInvalidSpeed);
  if (!hash.startsWith('#v1=') || hash.length > MAX_V1_LINK)
    throw new Error(INVALID_LINK);
  return validateState(
    JSON.parse(new TextDecoder().decode(fromBase64Url(hash.slice(4)))),
    resetInvalidSpeed,
  );
}
/** Validates untrusted state from links, the JSON editor or backups. */
export function validateState(raw: unknown, resetInvalidSpeed = false): State {
  if (!raw || typeof raw !== 'object')
    throw new Error('This route link contains invalid points or options.');
  const x = { ...raw } as State;
  if (
    x.averageSpeedKmh !== undefined &&
    !isValidAverageSpeedKmh(x.averageSpeedKmh, x.units)
  ) {
    if (resetInvalidSpeed) delete x.averageSpeedKmh;
    else throw new Error(AVERAGE_SPEED_ERROR);
  }
  if (
    (x.units !== undefined && !['metric', 'imperial'].includes(x.units)) ||
    (x.language !== undefined && !['en', 'pt'].includes(x.language)) ||
    (x.departure !== undefined &&
      (typeof x.departure !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x.departure) ||
        !Number.isFinite(Date.parse(x.departure)) ||
        new Date(x.departure).toISOString() !== x.departure)) ||
    x.version !== 1 ||
    !Array.isArray(x.points) ||
    x.points.length < 2 ||
    x.points.length > 50 ||
    !x.points.every(
      (p) =>
        typeof p.name === 'string' &&
        p.name.length <= 240 &&
        (p.coord === null || validCoord(p.coord)),
    ) ||
    typeof x.prefer !== 'boolean' ||
    typeof x.name !== 'string' ||
    x.name.length > 160
  )
    throw new Error('This route link contains invalid points or options.');
  if (x.averageSpeedKmh !== undefined)
    x.averageSpeedKmh = speedToKmh(
      snapSpeed(speedFromKmh(x.averageSpeedKmh, x.units), x.units),
      x.units,
    );
  return {
    version: 1,
    points: x.points.map((p) => ({ name: p.name, coord: p.coord })),
    prefer: x.prefer,
    name: x.name,
    ...(x.units !== undefined ? { units: x.units } : {}),
    ...(x.language !== undefined ? { language: x.language } : {}),
    ...(x.averageSpeedKmh !== undefined
      ? { averageSpeedKmh: x.averageSpeedKmh }
      : {}),
    ...(x.departure !== undefined ? { departure: x.departure } : {}),
    osrm: serverUrl(x.osrm),
    valhalla: serverUrl(x.valhalla),
    nominatim: serverUrl(x.nominatim),
  };
}
export function highways(steps: Step[]): string[] {
  return [
    ...new Set(
      steps.flatMap((s) =>
        Array.from(
          s.ref.matchAll(/\b([A-Z]{1,3})[ -]?(\d{1,4}[A-Za-z]?)\b/g),
          (m) => `${m[1]}-${m[2]}`,
        ),
      ),
    ),
  ];
}
export function localSections(steps: Step[], threshold = 500): Step[] {
  return steps.filter(
    (s) =>
      s.distance >= threshold &&
      !s.ref &&
      !/motorway|trunk|ramp/.test(s.roadClass ?? s.kind ?? '') &&
      !/rodovia|highway|motorway|freeway/i.test(s.name),
  );
}
function escapeXml(s: string): string {
  return s
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[c]!,
    )
    .split('')
    .filter((c) => c.charCodeAt(0) >= 32 || '\t\n\r'.includes(c))
    .join('');
}
export function generateGpx(
  route: Route,
  points: Point[],
  name: string,
  date = new Date(),
): string {
  if (
    !route.segments.length ||
    route.segments.some((s) => s.length < 2 || s.some((p) => !validCoord(p)))
  )
    throw new Error('No valid route geometry to export.');
  const tag = (s: string) => escapeXml(s);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="route-gpx"><metadata><name>${tag(name)}</name><time>${date.toISOString()}</time><keywords>driving,route-gpx</keywords></metadata>${points
    .filter((p) => p.coord)
    .map(
      (p) =>
        `<wpt lat="${p.coord![0]}" lon="${p.coord![1]}"><name>${tag(p.name)}</name></wpt>`,
    )
    .join(
      '',
    )}<trk><name>${tag(name)}</name>${route.segments.map((s) => `<trkseg>${s.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg>`).join('')}</trk></gpx>\n`;
}
export function filename(points: Point[], customName = ''): string {
  const clean = (s: string, limit = 48) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, limit) || 'point';
  if (customName.trim())
    return `${clean(customName.trim().replace(/\.gpx$/i, ''), 160)}.gpx`;
  return `${clean(points[0].name)}-to-${clean(points.at(-1)!.name)}.gpx`;
}
export function meters(a: Coord, b: Coord): number {
  const rad = Math.PI / 180,
    lat = (b[0] - a[0]) * rad,
    lon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function importGpx(xml: string): {
  route: Route;
  points: Point[];
  name: string;
} {
  if (xml.length > 10_000_000)
    throw new Error('Choose a GPX smaller than 10 MB.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (
    doc.querySelector('parsererror') ||
    doc.documentElement.localName !== 'gpx'
  )
    throw new Error('This file is not a valid GPX.');
  const all = (node: Document | Element, tag: string) =>
    Array.from(node.getElementsByTagNameNS('*', tag));
  const coord = (e: Element): Coord => {
    if (!e.hasAttribute('lat') || !e.hasAttribute('lon'))
      throw new Error('GPX point without coordinates.');
    const c: Coord = [
      Number(e.getAttribute('lat')),
      Number(e.getAttribute('lon')),
    ];
    if (!validCoord(c))
      throw new Error('The GPX contains invalid coordinates.');
    return c;
  };
  let segments = all(doc, 'trkseg')
    .map((seg) => all(seg, 'trkpt').map(coord))
    .filter((s) => s.length >= 2);
  if (!segments.length)
    segments = all(doc, 'rte')
      .map((seg) => all(seg, 'rtept').map(coord))
      .filter((s) => s.length >= 2);
  if (!segments.length)
    throw new Error('No track or route geometry found in this GPX.');
  const flat = segments.flat();
  const wpts = all(doc, 'wpt').map((w) => ({
    name: (all(w, 'name')[0]?.textContent || 'Stop').slice(0, 240),
    coord: coord(w),
  }));
  // Always preserve track endpoints, even if a file has unrelated waypoints.
  const inner = wpts
    .filter(
      (w) =>
        meters(w.coord, flat[0]) > 30 && meters(w.coord, flat.at(-1)!) > 30,
    )
    .slice(0, 23);
  const points: Point[] = [
    { name: 'Start', coord: flat[0] },
    ...inner,
    { name: 'Destination', coord: flat.at(-1)! },
  ];
  // With no waypoints, sample control points; original geometry stays intact until edited.
  if (!inner.length) {
    for (let i = 1; i <= Math.min(10, Math.floor(flat.length / 50)); i++) {
      const j = Math.round(
        (i * (flat.length - 1)) /
          (Math.min(10, Math.floor(flat.length / 50)) + 1),
      );
      points.splice(points.length - 1, 0, {
        name: `Stop ${i}`,
        coord: flat[j],
      });
    }
  }
  return {
    route: {
      segments,
      steps: [],
      distance: segments.reduce(
        (sum, s) =>
          sum + s.slice(1).reduce((n, p, i) => n + meters(s[i], p), 0),
        0,
      ),
      duration: null,
      provider: 'Imported GPX',
    },
    points,
    name: (all(doc, 'name')[0]?.textContent || 'Imported route').slice(0, 160),
  };
}
