export type Coord = [number, number]; // latitude, longitude
export interface Point {
  name: string;
  coord: Coord | null;
}
export interface State {
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
export function encodeState(state: State): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  return (
    '#v1=' +
    btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  );
}
export function decodeState(hash: string): State {
  if (!hash || hash === '#') return defaults();
  if (!hash.startsWith('#v1=') || hash.length > 60000)
    throw new Error('This route link is invalid or too large.');
  const raw = atob(hash.slice(4).replaceAll('-', '+').replaceAll('_', '/'));
  const x = JSON.parse(
    new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))),
  ) as State;
  if (
    (x.averageSpeedKmh !== undefined &&
      (typeof x.averageSpeedKmh !== 'number' ||
        !Number.isFinite(x.averageSpeedKmh) ||
        x.averageSpeedKmh <= 0 ||
        x.averageSpeedKmh > 500)) ||
    (x.units !== undefined && !['metric', 'imperial'].includes(x.units)) ||
    (x.language !== undefined && !['en', 'pt'].includes(x.language)) ||
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
    ...x,
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
export function escapeXml(s: string): string {
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
export function filename(points: Point[]): string {
  const clean = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'point';
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
export const examplePoints: Point[] = [
  { name: 'Metrô Uruguai', coord: [-22.930929, -43.2382858] },
  { name: 'Alto da Boa Vista', coord: [-22.961775, -43.273554] },
  { name: 'Postinho do Alto', coord: [-22.962444, -43.27473] },
  { name: 'Estrada das Furnas', coord: [-22.9869954, -43.301937] },
  { name: 'Barra da Tijuca', coord: [-22.999789, -43.360381] },
  { name: 'Prainha', coord: [-23.040932, -43.506052] },
  { name: 'Grumari', coord: [-23.0501597, -43.5352397] },
];
