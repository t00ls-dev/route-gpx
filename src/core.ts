import {
  deflateSync,
  gunzipSync,
  inflateSync,
  strFromU8,
  strToU8,
  unzipSync,
} from 'fflate';
import { decodeFit, isFit } from './fit';
export type Coord = [number, number]; // latitude, longitude
export interface Point {
  name: string;
  coord: Coord | null;
}
export interface State {
  departure?: string;
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
/** Normalized turn directions shared by the routing adapters (OSRM's set). */
const MODIFIERS = [
  'uturn',
  'sharp right',
  'right',
  'slight right',
  'straight',
  'slight left',
  'left',
  'sharp left',
] as const;
export type Modifier = (typeof MODIFIERS)[number];
export const isModifier = (value: unknown): value is Modifier =>
  (MODIFIERS as readonly unknown[]).includes(value);
/** Roundabout exit numbers kept from routers. */
export const isExit = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20;
export interface Step {
  name: string;
  ref: string;
  distance: number;
  duration: number;
  /** Maneuver type in OSRM's vocabulary (depart, turn, roundabout, on ramp…). */
  kind?: string;
  roadClass?: string;
  /** Turn direction of the maneuver that starts this step. */
  modifier?: Modifier;
  /** Roundabout exit to take. */
  exit?: number;
  /** Maneuver location on the route. */
  at?: Coord;
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
        (s.kind === undefined || typeof s.kind === 'string') &&
        (s.modifier === undefined || isModifier(s.modifier)) &&
        (s.exit === undefined || isExit(s.exit)) &&
        (s.at === undefined || validCoord(s.at)),
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
    0, // Former average speed slot, kept so positions stay compatible.
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
  // Index 5 held the average speed, now a device preference that links ignore.
  const [points, prefer, name, units, language, , departure, servers] =
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
export function decodeState(hash: string): State {
  if (!hash || hash === '#') return defaults();
  if (hash.startsWith('#v2=') && hash.length <= MAX_V2_LINK)
    return validateState(decodeV2(hash.slice(4)));
  if (!hash.startsWith('#v1=') || hash.length > MAX_V1_LINK)
    throw new Error(INVALID_LINK);
  return validateState(
    JSON.parse(new TextDecoder().decode(fromBase64Url(hash.slice(4)))),
  );
}
/**
 * Validates untrusted state from links, the JSON editor or backups. A legacy
 * `averageSpeedKmh` (any value) is ignored: the speed is a device preference.
 */
export function validateState(raw: unknown): State {
  if (!raw || typeof raw !== 'object')
    throw new Error('This route link contains invalid points or options.');
  const x = { ...raw } as State;
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
  return {
    version: 1,
    points: x.points.map((p) => ({ name: p.name, coord: p.coord })),
    prefer: x.prefer,
    name: x.name,
    ...(x.units !== undefined ? { units: x.units } : {}),
    ...(x.language !== undefined ? { language: x.language } : {}),
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
/**
 * Interior track indices for control points of an imported track without
 * waypoints. The track is first divided evenly by distance so that no leg is
 * longer than `maxSpacing` (a leg spanning several laps would be replaced
 * wholesale when one of its points is edited); Douglas–Peucker then spends the
 * remaining points on the vertices farthest from the line between neighbours,
 * so loops, out-and-back spurs and large bends get a point and a full reroute
 * follows the original shape. No point is placed within `minSpacing` metres of
 * another, so repeated laps and out-and-back sections do not stack markers.
 */
export function controlIndices(
  flat: Coord[],
  max = 20,
  tolerance = 50,
  maxSpacing = 10_000,
  minSpacing = 150,
): number[] {
  // Short tracks (under 50 points) keep only their endpoints, as before.
  if (flat.length < 50) return [];
  const rad = Math.PI / 180,
    k = Math.cos(flat[0][0] * rad) * 6371000 * rad;
  const xy = flat.map(([lat, lon]) => [lon * k, lat * 6371000 * rad]);
  const deviation = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = dx * dx + dy * dy;
    const t = len
      ? Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len),
        )
      : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const keep = [0, flat.length - 1];
  const near = (i: number) =>
    keep.some(
      (j) => Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]) < minSpacing,
    );
  const along = [0];
  for (let i = 1; i < flat.length; i++)
    along.push(along[i - 1] + meters(flat[i - 1], flat[i]));
  const total = along.at(-1)!;
  const pieces = Math.min(max + 1, Math.ceil(total / maxSpacing));
  for (let n = 1, m = 0; n < pieces; n++) {
    const target = (total * n) / pieces,
      half = total / pieces / 2;
    while (m < flat.length - 1 && along[m] < target) m++;
    // Closest vertex to the target that keeps the minimum spacing.
    for (let d = 0; ; d++) {
      const up = m + d < flat.length - 1 && along[m + d] - target < half,
        down = m - d > 0 && target - along[m - d] < half;
      if (!up && !down) break;
      const j = up && !near(m + d) ? m + d : down && !near(m - d) ? m - d : -1;
      if (j >= 0) {
        keep.push(j);
        break;
      }
    }
  }
  keep.sort((a, b) => a - b);
  const farthest = (a: number, b: number) => {
    let best = -1,
      distance = 0;
    for (let i = a + 1; i < b; i++) {
      const d = deviation(xy[i], xy[a], xy[b]);
      if (d > distance && !near(i)) [best, distance] = [i, d];
    }
    return { best, distance };
  };
  while (keep.length - 2 < max) {
    let pick = { best: -1, distance: tolerance };
    for (let n = 0; n < keep.length - 1; n++) {
      const f = farthest(keep[n], keep[n + 1]);
      if (f.distance > pick.distance) pick = f;
    }
    if (pick.best < 0) break;
    keep.push(pick.best);
    keep.sort((a, b) => a - b);
  }
  return keep.slice(1, -1);
}
/** Result of importing a GPX, TCX or FIT file. */
export interface ImportedTrack {
  route: Route;
  points: Point[];
  name: string;
  /** Flat track index of every point, when the points were placed on the track. */
  indices?: number[];
  /** Recorded elevation per track point, parallel to `route.segments`; only when most points have one. */
  elevations?: (number | null)[][];
}

/** Geometry, names and elevation read from a file, before shared processing. */
interface ParsedTrack {
  format: 'GPX' | 'TCX' | 'FIT';
  name: string;
  segments: Coord[][];
  elevations: (number | null)[][];
  waypoints: { name: string; coord: Coord }[];
}

const MAX_IMPORT_BYTES = 10_000_000;

const recordedElevation = (value: number): number | null =>
  Number.isFinite(value) && value > -500 && value < 9000 ? value : null;

const xmlAll = (node: Document | Element, tag: string) =>
  Array.from(node.getElementsByTagNameNS('*', tag));

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.querySelector('parsererror') ? null : doc;
}

function parseGpx(doc: Document): ParsedTrack {
  const all = xmlAll;
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
  let elements = all(doc, 'trkseg')
    .map((seg) => all(seg, 'trkpt'))
    .filter((s) => s.length >= 2);
  if (!elements.length)
    elements = all(doc, 'rte')
      .map((seg) => all(seg, 'rtept'))
      .filter((s) => s.length >= 2);
  const ele = (e: Element): number | null => {
    const text = all(e, 'ele')[0]?.textContent?.trim();
    return text ? recordedElevation(Number(text)) : null;
  };
  return {
    format: 'GPX',
    name: all(doc, 'name')[0]?.textContent || '',
    segments: elements.map((s) => s.map(coord)),
    elevations: elements.map((s) => s.map(ele)),
    waypoints: all(doc, 'wpt').map((w) => ({
      name: all(w, 'name')[0]?.textContent || 'Stop',
      coord: coord(w),
    })),
  };
}

/** TCX: each `Track` is a segment; course points become named points. */
function parseTcx(doc: Document): ParsedTrack {
  const all = xmlAll;
  const child = (e: Element, tag: string) =>
    Array.from(e.children).find((c) => c.localName === tag);
  const position = (e: Element): Coord | null => {
    const p = child(e, 'Position');
    if (!p) return null;
    const c: Coord = [
      Number(child(p, 'LatitudeDegrees')?.textContent),
      Number(child(p, 'LongitudeDegrees')?.textContent),
    ];
    if (!validCoord(c))
      throw new Error('The TCX contains invalid coordinates.');
    return c;
  };
  const segments: Coord[][] = [],
    elevations: (number | null)[][] = [];
  for (const track of all(doc, 'Track')) {
    const coords: Coord[] = [],
      eles: (number | null)[] = [];
    for (const point of all(track, 'Trackpoint')) {
      const c = position(point);
      if (!c) continue;
      const text = child(point, 'AltitudeMeters')?.textContent?.trim();
      coords.push(c);
      eles.push(text ? recordedElevation(Number(text)) : null);
    }
    if (coords.length >= 2) {
      segments.push(coords);
      elevations.push(eles);
    }
  }
  const course = all(doc, 'Course')[0];
  return {
    format: 'TCX',
    name: (course && child(course, 'Name')?.textContent?.trim()) || '',
    segments,
    elevations,
    waypoints: all(doc, 'CoursePoint').flatMap((p) => {
      const c = position(p);
      return c
        ? [{ name: child(p, 'Name')?.textContent?.trim() || 'Stop', coord: c }]
        : [];
    }),
  };
}

/** Shared processing: endpoints, waypoints, control points and distance. */
function finishImport(parsed: ParsedTrack): ImportedTrack {
  const keep = parsed.segments.flatMap((s, i) => (s.length >= 2 ? [i] : []));
  const segments = keep.map((i) => parsed.segments[i]);
  const elevationRows = keep.map((i) => parsed.elevations[i]);
  if (!segments.length)
    throw new Error(
      `No track or route geometry found in this ${parsed.format}.`,
    );
  const flat = segments.flat();
  const withElevation = elevationRows.flat().filter((v) => v !== null).length;
  const wpts = parsed.waypoints.map((w) => ({
    name: w.name.slice(0, 240),
    coord: w.coord,
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
  // With no waypoints, place control points where the track shape needs them;
  // original geometry stays intact until edited. Their exact track indices
  // let edits keep unchanged legs without locating points on the track.
  let indices: number[] | undefined;
  if (!inner.length) {
    const controls = controlIndices(flat);
    points.splice(
      1,
      0,
      ...controls.map((j, i) => ({
        name: `Stop ${i + 1}`,
        coord: flat[j],
      })),
    );
    indices = [0, ...controls, flat.length - 1];
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
      provider: `Imported ${parsed.format}`,
    },
    points,
    // Empty when the file has no name; the interface supplies a localized default.
    name: parsed.name.slice(0, 160),
    indices,
    ...(withElevation >= 0.8 * flat.length
      ? { elevations: elevationRows }
      : {}),
  };
}

export function importGpx(xml: string): ImportedTrack {
  if (xml.length > MAX_IMPORT_BYTES)
    throw new Error('Choose a GPX smaller than 10 MB.');
  const doc = parseXml(xml);
  if (!doc || doc.documentElement.localName !== 'gpx')
    throw new Error('This file is not a valid GPX.');
  return finishImport(parseGpx(doc));
}

/**
 * Imports a GPX, TCX or FIT file, detected by content rather than extension.
 * Only geometry, names, course points and recorded elevation are read.
 */
export function importTrackFile(input: Uint8Array): ImportedTrack {
  if (input.length > MAX_IMPORT_BYTES)
    throw new Error('Choose a file smaller than 10 MB.');
  const bytes = unpack(input);
  if (isFit(bytes)) {
    const fit = decodeFit(bytes, meters);
    return finishImport({ format: 'FIT', ...fit });
  }
  // Like File.text(): UTF-8, with invalid bytes replaced. Some exported TCX
  // files start with spaces before the XML declaration, which XML rejects.
  const doc = parseXml(new TextDecoder().decode(bytes).trimStart());
  const root = doc?.documentElement.localName;
  if (doc && root === 'gpx') return finishImport(parseGpx(doc));
  if (doc && root === 'TrainingCenterDatabase')
    return finishImport(parseTcx(doc));
  throw new Error('This file is not a valid GPX, TCX or FIT file.');
}

const TRACK_FILE = /\.(gpx|fit|tcx)$/i;

/**
 * Exports often come compressed: Strava's original files as `.fit.gz` or
 * `.gpx.gz`, Garmin Connect as a `.zip` with one file. Unpacks one level,
 * bounded to the same 10 MB as an uncompressed file.
 */
function unpack(bytes: Uint8Array): Uint8Array {
  const tooLarge = () => new Error('Choose a file smaller than 10 MB.');
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // The gzip trailer holds the uncompressed size (modulo 4 GiB).
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    if (
      bytes.length < 18 ||
      view.getUint32(bytes.length - 4, true) > MAX_IMPORT_BYTES
    )
      throw tooLarge();
    let out: Uint8Array;
    try {
      out = gunzipSync(bytes);
    } catch {
      throw new Error('This file is not a valid GPX, TCX or FIT file.');
    }
    if (out.length > MAX_IMPORT_BYTES) throw tooLarge();
    return out;
  }
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    let found = false;
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes, {
        // Only the first track file, and only when its stated size fits.
        filter: (file) => {
          // Skips macOS metadata entries (`__MACOSX/`, `._name`).
          if (
            found ||
            !TRACK_FILE.test(file.name) ||
            /(^|\/)(__MACOSX\/|\._)/.test(file.name)
          )
            return false;
          if (file.originalSize > MAX_IMPORT_BYTES) throw tooLarge();
          return (found = true);
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('10 MB'))
        throw error;
      throw new Error('This file is not a valid GPX, TCX or FIT file.', {
        cause: error,
      });
    }
    const out = Object.values(files)[0];
    if (!out) throw new Error('This ZIP has no GPX, TCX or FIT file.');
    if (out.length > MAX_IMPORT_BYTES) throw tooLarge();
    return out;
  }
  return bytes;
}

/** True for the provider label of an imported file, possibly with rerouted parts. */
export const importedProvider = (provider: string): string | null =>
  /^Imported (GPX|TCX|FIT)(?= \+ |$)/.exec(provider)?.[0] ?? null;
