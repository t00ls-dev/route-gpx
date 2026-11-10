import { WeatherCache, weatherCoordinateKey } from './weather-cache';
import {
  HOUR,
  MAX_WEATHER_POINTS,
  type WeatherForecast,
  type WeatherHour,
  type WeatherPoint,
} from './weather';
import type { View } from './default-view';
import {
  type Coord,
  type Modifier,
  type Route,
  type State,
  type Step,
  isExit,
  isModifier,
  serverUrl,
  validCoord,
  validRoute,
} from './core';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private interval = 1200) {}
  run<T>(
    fn: () => Promise<T>,
    isCurrent: () => boolean = () => true,
  ): Promise<T> {
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
        await pause(Math.max(0, this.interval - (Date.now() - this.last)));
        if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
        this.last = Date.now();
        return fn();
      });
    this.tail = task;
    return task;
  }
}
const routing = new RequestQueue(1500),
  searching = new RequestQueue(1100);
/**
 * Every external request omits credentials and has a deadline. Routing and
 * Nominatim receive the page origin as referrer, which the Nominatim usage
 * policy asks applications to provide; other providers receive no referrer.
 */
function request(
  url: string | URL,
  timeoutMs: number,
  options: {
    signal?: AbortSignal;
    sendOrigin?: boolean;
    noStore?: boolean;
  } = {},
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    credentials: 'omit',
    referrerPolicy: options.sendOrigin
      ? 'strict-origin-when-cross-origin'
      : 'no-referrer',
    ...(options.noStore ? { cache: 'no-store' as const } : {}),
    signal: options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline,
  });
}
async function json(url: string): Promise<unknown> {
  const r = await request(url, 30000, { sendOrigin: true });
  if (!r.ok) throw new Error(`Server returned HTTP ${r.status}.`);
  return r.json();
}
interface OsrmResponse {
  code: string;
  message?: string;
  waypoints: { location: [number, number]; distance: number }[];
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: {
      steps: {
        name?: string;
        ref?: string;
        distance: number;
        duration: number;
        maneuver?: {
          type?: string;
          modifier?: string;
          exit?: number;
          location?: [number, number];
        };
      }[];
    }[];
  }[];
}
function osrmUrl(state: State): string {
  const pts = state.points
    .map((p) => `${p.coord![1]},${p.coord![0]}`)
    .join(';');
  return `${serverUrl(state.osrm)}/route/v1/driving/${pts}?overview=full&geometries=geojson&steps=true&continue_straight=true`;
}
export async function osrmRoute(state: State): Promise<Route> {
  const d = (await json(osrmUrl(state))) as OsrmResponse;
  if (d.code !== 'Ok' || !d.routes?.length)
    throw new Error(
      d.code === 'NoRoute'
        ? 'No driving route connects these points.'
        : `OSRM: ${d.code || 'invalid response'}`,
    );
  return checkedRoute('OSRM', () => {
    const r = d.routes[0];
    if (d.waypoints.length !== state.points.length) throw new Error();
    return {
      segments: [r.geometry.coordinates.map(([lon, lat]) => [lat, lon])],
      steps: r.legs.flatMap((l) =>
        l.steps.map((s) => ({
          name: s.name || 'Unnamed road',
          ref: s.ref || '',
          distance: s.distance,
          duration: s.duration,
          kind: s.maneuver?.type,
          ...maneuverDetails(
            s.maneuver?.modifier,
            s.maneuver?.exit,
            s.maneuver?.location &&
              ([s.maneuver.location[1], s.maneuver.location[0]] as Coord),
          ),
        })),
      ),
      distance: r.distance,
      duration: r.duration,
      provider: 'OSRM',
      snapped: d.waypoints.map((w) => [w.location[1], w.location[0]]),
    };
  });
}
/**
 * Optional maneuver fields from untrusted router data: values outside the
 * shared vocabulary are omitted rather than failing the route.
 */
function maneuverDetails(
  modifier: unknown,
  exit: unknown,
  at: Coord | undefined,
): Pick<Step, 'modifier' | 'exit' | 'at'> {
  return {
    ...(isModifier(modifier) ? { modifier } : {}),
    ...(isExit(exit) ? { exit } : {}),
    ...(at && validCoord(at) ? { at } : {}),
  };
}
/** Valhalla maneuver types in the shared vocabulary (OSRM kinds and modifiers). */
const VALHALLA_TYPES: Record<number, [kind: string, modifier?: Modifier]> = {
  1: ['depart'],
  2: ['depart', 'right'],
  3: ['depart', 'left'],
  4: ['arrive'],
  5: ['arrive', 'right'],
  6: ['arrive', 'left'],
  7: ['new name'],
  8: ['continue', 'straight'],
  9: ['turn', 'slight right'],
  10: ['turn', 'right'],
  11: ['turn', 'sharp right'],
  12: ['turn', 'uturn'],
  13: ['turn', 'uturn'],
  14: ['turn', 'sharp left'],
  15: ['turn', 'left'],
  16: ['turn', 'slight left'],
  17: ['on ramp', 'straight'],
  18: ['on ramp', 'right'],
  19: ['on ramp', 'left'],
  20: ['off ramp', 'right'],
  21: ['off ramp', 'left'],
  22: ['fork', 'straight'],
  23: ['fork', 'right'],
  24: ['fork', 'left'],
  25: ['merge'],
  26: ['roundabout'],
  27: ['exit roundabout'],
  37: ['merge', 'right'],
  38: ['merge', 'left'],
};
/** Builds a route from untrusted router JSON; malformed shapes and values become one clear error. */
function checkedRoute(
  server: 'OSRM' | 'Valhalla',
  build: () => unknown,
): Route {
  let route: unknown;
  try {
    route = build();
  } catch {
    route = undefined;
  }
  if (!validRoute(route))
    throw new Error(`${server} returned an invalid route.`);
  return route;
}
export function decodePolyline(str: string): Coord[] {
  let i = 0,
    lat = 0,
    lon = 0;
  const out: Coord[] = [];
  const next = () => {
    let result = 0,
      shift = 0,
      b: number;
    do {
      if (i >= str.length || shift > 30)
        throw new Error('Invalid route geometry.');
      b = str.charCodeAt(i++) - 63;
      result |= (b & 31) << shift;
      shift += 5;
    } while (b >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lon += next();
    out.push([lat / 1e6, lon / 1e6]);
  }
  return out;
}
interface ValhallaResponse {
  error?: string;
  trip?: {
    status: number;
    summary: { length: number; time: number };
    legs: {
      shape: string;
      maneuvers: {
        street_names?: string[];
        length: number;
        time: number;
        type: number;
        begin_shape_index?: number;
        roundabout_exit_count?: number;
      }[];
    }[];
  };
}
export async function valhallaRoute(state: State): Promise<Route> {
  const body = {
    locations: state.points.map((p) => ({
      lat: p.coord![0],
      lon: p.coord![1],
      type: 'break',
    })),
    costing: 'auto',
    costing_options: { auto: { use_highways: state.prefer ? 1 : 0.5 } },
    units: 'kilometers',
    language: 'en-US',
  };
  const d = (await json(
    `${serverUrl(state.valhalla)}/route?json=${encodeURIComponent(JSON.stringify(body))}`,
  )) as ValhallaResponse;
  if (!d.trip || d.trip.status !== 0)
    throw new Error(d.error || 'Valhalla could not find a route.');
  const t = d.trip;
  return checkedRoute('Valhalla', () => {
    const segments = t.legs.map((l) => decodePolyline(l.shape));
    const steps: Step[] = t.legs.flatMap((l, leg) =>
      l.maneuvers.map((m) => {
        const [kind, modifier] = VALHALLA_TYPES[m.type] ?? [];
        return {
          name: m.street_names?.join(' / ') || 'Unnamed road',
          ref: (m.street_names ?? [])
            .filter((n) => /\b[A-Z]{1,3}[ -]?\d{1,4}\b/.test(n))
            .join(';'),
          distance: m.length * 1000,
          duration: m.time,
          ...(kind ? { kind } : {}),
          ...maneuverDetails(
            modifier,
            m.type === 26 ? m.roundabout_exit_count : undefined,
            Number.isInteger(m.begin_shape_index)
              ? segments[leg][m.begin_shape_index!]
              : undefined,
          ),
        };
      }),
    );
    return {
      segments,
      steps,
      distance: t.summary.length * 1000,
      duration: t.summary.time,
      provider: 'Valhalla (fallback)',
    };
  });
}
export async function calculate(
  state: State,
  isCurrent: () => boolean = () => true,
): Promise<Route> {
  return routing.run(async () => {
    if (!isCurrent()) throw new Error('Superseded route');
    try {
      return await osrmRoute(state);
    } catch (e) {
      if (!isCurrent()) throw e;
      await pause(1500);
      if (!isCurrent()) throw e;
      try {
        return await valhallaRoute(state);
      } catch {
        throw new Error(
          `No route available. Check the points or try again later. ${e instanceof Error ? e.message : ''} The fallback server also failed.`,
        );
      }
    }
  });
}
export interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}
const cache = new Map<string, SearchResult[]>();
export async function searchAddress(
  query: string,
  base: string,
): Promise<SearchResult[]> {
  const key = `${base}:${query.toLowerCase().trim()}`;
  if (cache.has(key)) return cache.get(key)!;
  return searching.run(async () => {
    const request = async () => {
      // Coordinate tabs where Web Locks is available. No location data stored.
      let last = 0;
      try {
        last = Number(localStorage.getItem('route-gpx-last-search') || 0);
      } catch {
        /* storage can be disabled */
      }
      await pause(Math.max(0, 1100 - (Date.now() - last)));
      try {
        localStorage.setItem('route-gpx-last-search', String(Date.now()));
      } catch {
        /* optional */
      }
      if (cache.has(key)) return cache.get(key)!;
      const u = new URL(`${serverUrl(base)}/search`);
      u.search = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '5',
        'accept-language': 'en',
      }).toString();
      const d = (await json(u.href)) as SearchResult[];
      if (!Array.isArray(d))
        throw new Error('The search server returned an invalid response.');
      cache.set(key, d);
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
      return d;
    };
    return navigator.locks
      ? navigator.locks.request('route-gpx-nominatim', request)
      : request();
  });
}

// One attempt per tab session, including failures. Only the coarse result lives in memory.
export const defaultRegionUrl = 'https://ipwho.is/';
let regionAttempt: Promise<View | null> | undefined;
export function regionUrl(value: string): string {
  const url = new URL(serverUrl(value));
  if (url.protocol !== 'https:')
    throw new Error('Region service requires HTTPS.');
  return url.href;
}
export function approximateRegion(
  enabled: boolean,
  endpoint: string,
): Promise<View | null> {
  if (!enabled) return Promise.resolve(null);
  if (regionAttempt) return regionAttempt;
  regionAttempt = (async () => {
    try {
      if (sessionStorage.getItem('region-attempted')) return null;
      sessionStorage.setItem('region-attempted', 'true');
    } catch {
      /* Memory still limits attempts if storage is blocked. */
    }
    try {
      const url = new URL(regionUrl(endpoint));
      url.searchParams.set('fields', 'success,latitude,longitude,city,region');
      const response = await request(url.href, 3000, { noStore: true });
      if (!response.ok) return null;
      const data = await response.json();
      if (
        data.success !== true ||
        ![data.city, data.region].some(
          (name) => typeof name === 'string' && name.trim().length > 0,
        ) ||
        typeof data.latitude !== 'number' ||
        !Number.isFinite(data.latitude) ||
        Math.abs(data.latitude) > 90 ||
        typeof data.longitude !== 'number' ||
        !Number.isFinite(data.longitude) ||
        Math.abs(data.longitude) > 180
      )
        return null;
      return {
        center: [
          Math.round(data.latitude * 10) / 10,
          Math.round(data.longitude * 10) / 10,
        ] as Coord,
        zoom: 10,
      };
    } catch {
      return null;
    }
  })();
  return regionAttempt;
}

export const defaultPhotonUrl = 'https://photon.komoot.io';
const photonQueue = new RequestQueue(1000);
const photonCache = new Map<string, SearchResult[]>();
/** Serialized, cancellable search-as-you-type. Bias is deliberately city-scale. */
export async function photonSearch(
  query: string,
  base: string,
  center: Coord,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const bias = center.map((n) => Math.round(n * 10) / 10);
  const key = JSON.stringify([base, query.trim().toLowerCase(), bias]);
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (photonCache.has(key)) return photonCache.get(key)!;
  return photonQueue.run(async () => {
    signal.throwIfAborted();
    if (photonCache.has(key)) return photonCache.get(key)!;
    const url = new URL(`${serverUrl(base)}/api/`);
    url.search = new URLSearchParams({
      q: query.trim(),
      limit: '5',
      lat: String(bias[0]),
      lon: String(bias[1]),
    }).toString();
    const response = await request(url, 8000, { signal });
    if (!response.ok) throw new Error('Photon unavailable');
    const data = await response.json();
    if (!Array.isArray(data?.features))
      throw new Error('Invalid Photon response');
    const results: SearchResult[] = [];
    for (const feature of data.features.slice(0, 5)) {
      const coords = feature?.geometry?.coordinates;
      const p = feature?.properties;
      if (
        feature?.geometry?.type !== 'Point' ||
        !Array.isArray(coords) ||
        coords.length < 2 ||
        !coords
          .slice(0, 2)
          .every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) ||
        Math.abs(coords[0]) > 180 ||
        Math.abs(coords[1]) > 90 ||
        !p ||
        typeof p.name !== 'string'
      )
        continue;
      const name = [
        ...new Set(
          [p.name, p.street, p.city, p.state, p.country].filter(
            (v) => typeof v === 'string' && v,
          ),
        ),
      ].join(', ');
      results.push({
        display_name: name,
        lat: String(coords[1]),
        lon: String(coords[0]),
      });
    }
    signal.throwIfAborted();
    photonCache.set(key, results);
    if (photonCache.size > 100)
      photonCache.delete(photonCache.keys().next().value!);
    return results;
  });
}

// Weather stays in page memory. Never use HTTP/storage caches for route samples.
// Serialized starts plus rolling per-location budgets bound both short and long intervals.
const weatherQueue = new RequestQueue(6000);
const weatherCache = new WeatherCache();
const weatherUsage: { time: number; cost: number }[] = [];
/**
 * Open-Meteo counts each location as one call (600 per minute and larger
 * hourly, daily and monthly budgets). Weather and elevation share this page
 * budget; returns false, reserving nothing, when the cost would exceed it.
 */
function reserveOpenMeteo(cost: number): boolean {
  const now = Date.now();
  for (const [window, limit] of [
    [60000, 599],
    [HOUR, 4999],
    [24 * HOUR, 9999],
    [31 * 24 * HOUR, 299999],
  ])
    if (
      weatherUsage
        .filter((u) => now - u.time < window)
        .reduce((n, u) => n + u.cost, cost) > limit
    )
      return false;
  weatherUsage.push({ time: now, cost });
  while (weatherUsage.length && now - weatherUsage[0].time >= 31 * 24 * HOUR)
    weatherUsage.shift();
  return true;
}
export const WEATHER_VARIABLES = {
  temperature: 'temperature_2m',
  probability: 'precipitation_probability',
  precipitation: 'precipitation',
  code: 'weather_code',
  wind: 'wind_speed_10m',
  windDirection: 'wind_direction_10m',
  gusts: 'wind_gusts_10m',
  visibility: 'visibility',
  uv: 'uv_index',
} as const;
/** Variables that may be missing (e.g. for some past dates) without failing the forecast. */
const OPTIONAL_WEATHER_VARIABLES: ReadonlySet<string> = new Set(['uv_index']);
export function weatherUrl(
  base: string,
  points: WeatherPoint[],
  start: number,
  end: number,
): string {
  if (
    !points.length ||
    points.length > MAX_WEATHER_POINTS ||
    points.some((p) => !validCoord(p.coord)) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    start % HOUR !== 0 ||
    end % HOUR !== 0
  )
    throw new Error('Weather service returned an invalid response.');
  const url = new URL(`${serverUrl(base)}/v1/forecast`);
  const hour = (time: number) =>
    new Date(time).toISOString().slice(0, 13) + ':00';
  url.search = new URLSearchParams({
    latitude: points.map((p) => p.coord[0].toFixed(3)).join(','),
    longitude: points.map((p) => p.coord[1].toFixed(3)).join(','),
    hourly: Object.values(WEATHER_VARIABLES).join(','),
    start_hour: hour(start),
    end_hour: hour(end),
    timezone: 'GMT',
    timeformat: 'unixtime',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  }).toString();
  return url.href;
}
export function parseWeather(
  data: unknown,
  count: number,
  start: number,
  end: number,
): WeatherForecast {
  const rows = Array.isArray(data) ? data : [data];
  const invalid = () =>
    new Error('Weather service returned an invalid response.');
  if (rows.length !== count) throw invalid();
  const hours = rows.map(
    (row: {
      hourly?: Record<string, unknown>;
      utc_offset_seconds?: number;
    }) => {
      if (!row || row.utc_offset_seconds !== 0 || !row.hourly) throw invalid();
      const h = row.hourly,
        times = h.time;
      if (
        !Array.isArray(times) ||
        times.length !== Math.round((end - start) / HOUR) + 1 ||
        times.some(
          (v, i) => typeof v !== 'number' || v * 1000 !== start + i * HOUR,
        )
      )
        throw invalid();
      for (const variable of Object.values(WEATHER_VARIABLES)) {
        if (
          h[variable] === undefined &&
          OPTIONAL_WEATHER_VARIABLES.has(variable)
        )
          h[variable] = times.map(() => null);
        const values = h[variable];
        if (
          !Array.isArray(values) ||
          values.length !== times.length ||
          values.some(
            (v) => v !== null && (typeof v !== 'number' || !Number.isFinite(v)),
          )
        )
          throw invalid();
      }
      return times.map((time, i) => {
        const value = Object.fromEntries(
          Object.entries(WEATHER_VARIABLES).map(([key, variable]) => [
            key,
            (h[variable] as (number | null)[])[i],
          ]),
        ) as Omit<WeatherHour, 'time'>;
        if (
          (value.probability !== null &&
            (value.probability < 0 || value.probability > 100)) ||
          [
            value.precipitation,
            value.wind,
            value.gusts,
            value.visibility,
            value.uv,
          ].some((v) => v !== null && v < 0) ||
          (value.windDirection !== null &&
            (value.windDirection < 0 || value.windDirection > 360)) ||
          (value.code !== null &&
            (!Number.isInteger(value.code) ||
              value.code < 0 ||
              value.code > 99))
        )
          throw invalid();
        return { time: time * 1000, ...value };
      });
    },
  );
  return { hours, start, end };
}
export async function weatherForecast(
  base: string,
  points: WeatherPoint[],
  start: number,
  end: number,
  signal: AbortSignal,
  isCurrent: () => boolean,
): Promise<WeatherForecast> {
  signal.throwIfAborted();
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  weatherUrl(base, points, start, end); // Validate before cache lookup.
  const cached = () =>
    points.map((point) => weatherCache.get(base, point, start, end));
  const hit = cached();
  if (hit.every((hours) => hours !== undefined))
    return { hours: hit as WeatherHour[][], start, end };
  return weatherQueue.run(
    async () => {
      signal.throwIfAborted();
      if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
      const hours = cached();
      const missing = new Map<string, WeatherPoint>();
      points.forEach((point, i) => {
        if (!hours[i]) missing.set(weatherCoordinateKey(point), point);
      });
      if (!missing.size) return { hours: hours as WeatherHour[][], start, end };
      const needed = [...missing.values()];
      const url = weatherUrl(base, needed, start, end);
      // Conservative whole-call accounting per location, including >14-day ranges.
      const cost =
        needed.length * Math.ceil((end - start + HOUR) / (14 * 24 * HOUR));
      if (!reserveOpenMeteo(cost))
        throw new Error('Weather usage limit reached. Try again later.');
      try {
        const response = await request(url, 20000, { signal, noStore: true });
        if (response.status === 429)
          throw new Error('Weather usage limit reached. Try again later.');
        if (!response.ok) throw new Error('Weather unavailable. Try again.');
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new Error('Weather service returned an invalid response.');
        }
        const forecast = parseWeather(data, needed.length, start, end);
        signal.throwIfAborted();
        if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
        needed.forEach((point, i) =>
          weatherCache.set(base, point, forecast.hours[i]),
        );
        const fresh = new Map(
          needed.map((point, i) => [
            weatherCoordinateKey(point),
            forecast.hours[i],
          ]),
        );
        return {
          hours: points.map(
            (point, i) => hours[i] ?? fresh.get(weatherCoordinateKey(point))!,
          ),
          start,
          end,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error instanceof DOMException &&
          ['TimeoutError', 'AbortError'].includes(error.name)
        )
          throw new Error('Weather request timed out. Try again.', {
            cause: error,
          });
        if (error instanceof TypeError)
          throw new Error(
            'Weather network error. Check your connection and try again.',
            { cause: error },
          );
        throw error;
      }
    },
    () => !signal.aborted && isCurrent(),
  );
}

/**
 * Elevation (Open-Meteo `/v1/elevation`, Copernicus DEM GLO-90): requested
 * only when the user opens Elevation, in chunks of 100 coordinates,
 * serialized, without retries. Values stay in a bounded page-memory cache.
 */
const ELEVATION_CHUNK = 100,
  ELEVATION_CACHE = 5000,
  ELEVATION_TTL = 10 * 60 * 1000;
const elevationQueue = new RequestQueue(1100);
const elevationCache = new Map<string, { value: number | null; at: number }>();
const elevationKey = ([lat, lon]: Coord) =>
  `${lat.toFixed(4)},${lon.toFixed(4)}`;
export function elevationUrl(base: string, coords: Coord[]): string {
  if (
    !coords.length ||
    coords.length > ELEVATION_CHUNK ||
    coords.some((c) => !validCoord(c))
  )
    throw new Error('Elevation unavailable. Try again.');
  const url = new URL(`${serverUrl(base)}/v1/elevation`);
  url.search = new URLSearchParams({
    latitude: coords.map((c) => c[0].toFixed(4)).join(','),
    longitude: coords.map((c) => c[1].toFixed(4)).join(','),
  }).toString();
  return url.href;
}
export function parseElevation(
  data: unknown,
  count: number,
): (number | null)[] {
  const values = (data as { elevation?: unknown })?.elevation;
  if (
    !Array.isArray(values) ||
    values.length !== count ||
    values.some(
      (v) =>
        v !== null &&
        (typeof v !== 'number' || !Number.isFinite(v) || v < -500 || v > 9000),
    )
  )
    throw new Error('Elevation service returned an invalid response.');
  return values as (number | null)[];
}
export async function fetchElevations(
  base: string,
  coords: Coord[],
  signal: AbortSignal,
  isCurrent: () => boolean,
): Promise<(number | null)[]> {
  const now = () => Date.now();
  const fresh = (key: string) => {
    const hit = elevationCache.get(key);
    return hit && now() - hit.at < ELEVATION_TTL ? hit : undefined;
  };
  const missing = [
    ...new Map(
      coords
        .filter((c) => !fresh(elevationKey(c)))
        .map((c) => [elevationKey(c), c]),
    ).values(),
  ];
  for (let i = 0; i < missing.length; i += ELEVATION_CHUNK) {
    const chunk = missing.slice(i, i + ELEVATION_CHUNK);
    const url = elevationUrl(base, chunk);
    const values = await elevationQueue.run(
      async () => {
        signal.throwIfAborted();
        // Each coordinate counts against the shared Open-Meteo budget.
        if (!reserveOpenMeteo(chunk.length))
          throw new Error('Elevation usage limit reached. Try again later.');
        let response: Response;
        try {
          response = await request(url, 20000, { signal, noStore: true });
        } catch (error) {
          if ((error as Error).name === 'AbortError' && signal.aborted)
            throw error;
          throw new Error('Elevation unavailable. Try again.', {
            cause: error,
          });
        }
        if (response.status === 429)
          throw new Error('Elevation usage limit reached. Try again later.');
        if (!response.ok) throw new Error('Elevation unavailable. Try again.');
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new Error('Elevation service returned an invalid response.');
        }
        return parseElevation(data, chunk.length);
      },
      () => !signal.aborted && isCurrent(),
    );
    chunk.forEach((c, j) =>
      elevationCache.set(elevationKey(c), { value: values[j], at: now() }),
    );
    // Bounded: drop the oldest entries first.
    while (elevationCache.size > ELEVATION_CACHE)
      elevationCache.delete(elevationCache.keys().next().value!);
  }
  return coords.map((c) => fresh(elevationKey(c))?.value ?? null);
}
