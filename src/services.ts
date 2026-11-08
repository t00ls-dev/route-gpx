import { WeatherCache, weatherCoordinateKey } from './weather-cache';
import {
  RADAR_METADATA_URL,
  RADAR_REQUEST_SPACING,
  RadarImageCache,
  parseRadarTimeline,
  type RadarTimeline,
} from './radar';
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
  type Route,
  type State,
  type Step,
  serverUrl,
  validCoord,
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
async function json(url: string): Promise<unknown> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    credentials: 'omit',
    referrerPolicy: 'strict-origin-when-cross-origin',
  });
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
        maneuver?: { type?: string };
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
  const r = d.routes[0];
  return {
    segments: [r.geometry.coordinates.map(([lon, lat]) => [lat, lon])],
    steps: r.legs.flatMap((l) =>
      l.steps.map((s) => ({
        name: s.name || 'Unnamed road',
        ref: s.ref || '',
        distance: s.distance,
        duration: s.duration,
        kind: s.maneuver?.type,
      })),
    ),
    distance: r.distance,
    duration: r.duration,
    provider: 'OSRM',
    snapped: d.waypoints.map((w) => [w.location[1], w.location[0]]),
  };
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
  const steps: Step[] = t.legs.flatMap((l) =>
    l.maneuvers.map((m) => ({
      name: m.street_names?.join(' / ') || 'Unnamed road',
      ref: (m.street_names ?? [])
        .filter((n) => /\b[A-Z]{1,3}[ -]?\d{1,4}\b/.test(n))
        .join(';'),
      distance: m.length * 1000,
      duration: m.time,
    })),
  );
  return {
    segments: t.legs.map((l) => decodePolyline(l.shape)),
    steps,
    distance: t.summary.length * 1000,
    duration: t.summary.time,
    provider: 'Valhalla (fallback)',
  };
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const url = new URL(regionUrl(endpoint));
      url.searchParams.set('fields', 'success,latitude,longitude,city,region');
      const response = await fetch(url.href, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: controller.signal,
      });
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
    } finally {
      clearTimeout(timeout);
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
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
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
export const WEATHER_VARIABLES = {
  temperature: 'temperature_2m',
  probability: 'precipitation_probability',
  precipitation: 'precipitation',
  code: 'weather_code',
  wind: 'wind_speed_10m',
  windDirection: 'wind_direction_10m',
  gusts: 'wind_gusts_10m',
  visibility: 'visibility',
} as const;
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
          [value.precipitation, value.wind, value.gusts, value.visibility].some(
            (v) => v !== null && v < 0,
          ) ||
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
      const now = Date.now();
      // Conservative whole-call accounting per location, including >14-day ranges.
      const cost =
        needed.length * Math.ceil((end - start + HOUR) / (14 * 24 * HOUR));
      for (const [window, limit] of [
        [60000, 599],
        [HOUR, 4999],
        [24 * HOUR, 9999],
        [31 * 24 * HOUR, 299999],
      ]) {
        if (
          weatherUsage
            .filter((u) => now - u.time < window)
            .reduce((n, u) => n + u.cost, cost) > limit
        )
          throw new Error('Weather usage limit reached. Try again later.');
      }
      weatherUsage.push({ time: now, cost });
      while (
        weatherUsage.length &&
        now - weatherUsage[0].time >= 31 * 24 * HOUR
      )
        weatherUsage.shift();
      try {
        const response = await fetch(url, {
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        });
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

// Metadata, coverage and visible radar tiles share the same conservative budget.
const radarQueue = new RequestQueue(RADAR_REQUEST_SPACING);
const radarImages = new RadarImageCache();
let radarTimeline: { value: RadarTimeline; fetched: number } | undefined;
async function radarResponse(
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  signal.throwIfAborted();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (response.status === 429)
      throw new Error('Radar usage limit reached. Try again later.');
    if (!response.ok) throw new Error('Radar unavailable. Try again.');
    return response;
  } catch (error) {
    if (signal.aborted) throw error;
    if (
      error instanceof DOMException &&
      ['AbortError', 'TimeoutError'].includes(error.name)
    )
      throw new Error('Radar request timed out. Try again.', { cause: error });
    if (error instanceof TypeError)
      throw new Error(
        'Radar network error. Check your connection and try again.',
        { cause: error },
      );
    throw error;
  }
}
export async function fetchRadarTimeline(
  signal: AbortSignal,
): Promise<RadarTimeline> {
  signal.throwIfAborted();
  if (radarTimeline && Date.now() - radarTimeline.fetched < 120000)
    return radarTimeline.value;
  return radarQueue.run(
    async () => {
      signal.throwIfAborted();
      if (radarTimeline && Date.now() - radarTimeline.fetched < 120000)
        return radarTimeline.value;
      const response = await radarResponse(RADAR_METADATA_URL, signal);
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error('Radar service returned an invalid response.');
      }
      const value = parseRadarTimeline(data);
      signal.throwIfAborted();
      radarTimeline = { value, fetched: Date.now() };
      return value;
    },
    () => !signal.aborted,
  );
}
export async function fetchRadarImage(
  url: string,
  signal: AbortSignal,
): Promise<Blob> {
  // Only provider-controlled image paths; never fetch arbitrary hosts from metadata.
  if (
    !/^https:\/\/tilecache\.rainviewer\.com\/v2\/(?:radar\/[\w-]{1,64}|coverage\/0)\/512\/[0-7]\/\d+\/\d+\/[02]\/0_0\.png$/.test(
      url,
    )
  )
    throw new Error('Radar service returned an invalid response.');
  signal.throwIfAborted();
  const cached = radarImages.get(url);
  if (cached) return cached;
  return radarQueue.run(
    async () => {
      signal.throwIfAborted();
      const hit = radarImages.get(url);
      if (hit) return hit;
      const response = await radarResponse(url, signal);
      const blob = await response.blob();
      signal.throwIfAborted();
      if (
        blob.type !== 'image/png' ||
        blob.size === 0 ||
        blob.size > 2 * 1024 * 1024
      )
        throw new Error('Radar service returned an invalid response.');
      // Validate actual image bytes before caching, including malformed image responses.
      try {
        const image = await createImageBitmap(blob);
        image.close();
      } catch {
        throw new Error('Radar service returned an invalid response.');
      }
      signal.throwIfAborted();
      radarImages.set(url, blob);
      return blob;
    },
    () => !signal.aborted,
  );
}
