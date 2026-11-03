import type { View } from './default-view';
import {
  type Coord,
  type Route,
  type State,
  type Step,
  serverUrl,
} from './core';
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private last = 0;
  constructor(private interval = 1200) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tail
      .catch(() => {})
      .then(async () => {
        await pause(Math.max(0, this.interval - (Date.now() - this.last)));
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
export function osrmUrl(state: State): string {
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
