import { meters, type Coord, type Point, type Route } from './core';
import { travelTimeSeconds } from './travel-time';
import { bearingBetween } from './weather-wind';
import { indexTrack, pointAtDistance } from './track-position';
const FORECAST_DAYS = 16;
const PAST_WEATHER_DAYS = 90;
export const HOUR = 3_600_000;
export const MAX_WEATHER_POINTS = 20;
export const DEFAULT_WEATHER_URL = 'https://api.open-meteo.com';
export interface WeatherPoint {
  coord: Coord;
  distance: number;
  name?: string;
  bearing?: number | null;
  /** A route point (start, stop or destination), not an interpolated sample. */
  stop?: boolean;
  /** Placed just after a sharp bend, so the wind relation follows the turn. */
  bend?: boolean;
}
export interface WeatherHour {
  time: number;
  temperature: number | null;
  probability: number | null;
  precipitation: number | null;
  code: number | null;
  wind: number | null;
  windDirection: number | null;
  gusts: number | null;
  visibility: number | null;
  /** UV index, mean of the preceding hour; optional (null when the provider has none). */
  uv: number | null;
}
export interface WeatherForecast {
  hours: WeatherHour[][];
  start: number;
  end: number;
}
/** UTC calendar days: today through day 15, inclusive. */
export function forecastBounds(now = Date.now()): {
  start: number;
  end: number;
} {
  const day = new Date(now).setUTCHours(0, 0, 0, 0);
  return { start: day, end: day + FORECAST_DAYS * 24 * HOUR - HOUR };
}
export function departureError(value: string, now = Date.now()): string | null {
  const time = Date.parse(value);
  if (!value || !Number.isFinite(time))
    return 'Choose a departure date and time.';
  if (time < forecastBounds(now).start - PAST_WEATHER_DAYS * 24 * HOUR)
    return 'Departure must be within the last 90 days.';
  if (time + HOUR > forecastBounds(now).end)
    return 'Departure and arrival, including the weather margin, must fit within the 16-day forecast.';
  return null;
}
/**
 * Suggested departure: the next :00 or :30 at or after `now`, in the device's
 * local time (10:07 → 10:30, 10:40 → 11:00, 10:30:00 stays).
 */
export function nextDepartureSlot(now = Date.now()): number {
  const date = new Date(now);
  if (date.getMinutes() % 30 || date.getSeconds() || date.getMilliseconds()) {
    date.setSeconds(0, 0);
    date.setMinutes(date.getMinutes() < 30 ? 30 : 60);
  }
  return date.getTime();
}
export function localDateTime(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** No distance is invented across separate GPX segments. */
export function cumulativeTrack(segments: Coord[][]): WeatherPoint[] {
  let distance = 0;
  return segments.flatMap((segment) =>
    segment.map((coord, i) => {
      if (i) distance += meters(segment[i - 1], coord);
      return { coord, distance };
    }),
  );
}
export function passageTime(
  point: WeatherPoint,
  departure: number,
  speedKmh: number,
): number {
  return departure + travelTimeSeconds(point.distance, speedKmh) * 1000;
}
const longitudeDelta = (from: number, to: number) =>
  ((to - from + 540) % 360) - 180;
const wrapLongitude = (longitude: number) => ((longitude + 540) % 360) - 180;
/** Prefer 20 km or one hour of travel, whichever is shorter; the point cap takes priority. */
export function sampleRoute(
  route: Route,
  controls: Point[],
  speedKmh = 60,
): WeatherPoint[] {
  return sampleRouteStops(route, controls, speedKmh).samples;
}

/**
 * Sharp bends: a turn of at least 60° (enough to move the wind relation
 * across its 45° classes) between the 300 m before and after a point, checked
 * every 100 m, keeping one bend per kilometre.
 */
export const BEND_THRESHOLDS = {
  turn: 60,
  window: 300,
  step: 100,
  apart: 1000,
} as const;
/**
 * Sharp bends along the track, largest turn first. Never across GPX segment
 * gaps and never within the window of either end.
 */
export function routeBends(
  segments: Coord[][],
): { distance: number; turn: number }[] {
  const index = indexTrack(segments);
  const { turn: minimum, window, step, apart } = BEND_THRESHOLDS;
  const found: { distance: number; turn: number }[] = [];
  for (let d = window; d <= index.total - window; d += step) {
    const a = pointAtDistance(index, d - window)!,
      b = pointAtDistance(index, d)!,
      c = pointAtDistance(index, d + window)!;
    if (a.segment !== b.segment || b.segment !== c.segment) continue;
    const before = bearingBetween(a.coord, b.coord),
      after = bearingBetween(b.coord, c.coord);
    if (before === null || after === null) continue;
    const difference = Math.abs(after - before) % 360;
    const turn = difference > 180 ? 360 - difference : difference;
    if (turn >= minimum) found.push({ distance: d, turn });
  }
  // One bend per curve: the sharpest point within a kilometre (earliest on ties).
  return found
    .filter(
      (bend) =>
        !found.some(
          (other) =>
            other !== bend &&
            Math.abs(other.distance - bend.distance) < apart &&
            (other.turn > bend.turn ||
              (other.turn === bend.turn && other.distance < bend.distance)),
        ),
    )
    .sort((x, y) => y.turn - x.turn || x.distance - y.distance);
}

/** Automatic stops placed on an imported track, as opposed to named ones. */
const AUTOMATIC_STOP = /^Stop \d+$/;

/**
 * Keeps start and destination and, when there are too many stops, the stops
 * closest to evenly spaced targets along the route, preferring named stops
 * near each target over automatic ones. Deterministic for the same input.
 */
function chooseStops(stops: WeatherPoint[], total: number): WeatherPoint[] {
  const inner = stops.slice(1, -1);
  const slots = MAX_WEATHER_POINTS - 2;
  const window = total / (slots + 1) / 2;
  const chosen: WeatherPoint[] = [];
  for (let k = 1; k <= slots; k++) {
    const target = (total * k) / (slots + 1);
    let best = -1,
      score = Infinity;
    inner.forEach((p, i) => {
      if (chosen.includes(p)) return;
      const off = Math.abs(p.distance - target);
      // Within the slot, a named stop beats an automatic one.
      const penalty =
        off <= window && AUTOMATIC_STOP.test(p.name ?? '') ? window : 0;
      if (off + penalty < score) [best, score] = [i, off + penalty];
    });
    if (best >= 0) chosen.push(inner[best]);
  }
  return [stops[0], ...chosen, stops.at(-1)!];
}

/** Weather samples plus the number of distinct route stops they represent. */
export function sampleRouteStops(
  route: Route,
  controls: Point[],
  speedKmh = 60,
): { samples: WeatherPoint[]; stops: number } {
  travelTimeSeconds(0, speedKmh);
  const preferredSpacing = Math.min(20000, speedKmh * 1000);
  const track = cumulativeTrack(route.segments);
  if (track.length < 2) throw new Error('Calculate or import a route first.');
  const total = track.at(-1)!.distance;
  const interpolate = (distance: number): WeatherPoint => {
    const i = track.findIndex((p) => p.distance >= distance);
    if (i <= 0) return { ...track[0] };
    const a = track[i - 1],
      b = track[i];
    const ratio = (distance - a.distance) / (b.distance - a.distance || 1);
    return {
      distance,
      coord: [
        a.coord[0] + (b.coord[0] - a.coord[0]) * ratio,
        wrapLongitude(
          a.coord[1] + longitudeDelta(a.coord[1], b.coord[1]) * ratio,
        ),
      ],
    };
  };
  // Project controls onto each real edge, in itinerary order (also handles loops).
  let offset = 0;
  const edges = route.segments.flatMap((segment) =>
    segment.slice(1).map((b, i) => {
      const a = segment[i],
        length = meters(a, b),
        start = offset;
      offset += length;
      return { a, b, length, start, end: offset };
    }),
  );
  let minimum = 0;
  const samples: WeatherPoint[] = [
    { ...track[0], name: controls[0]?.name, stop: true },
  ];
  for (const control of controls.slice(1, -1)) {
    if (!control.coord) continue;
    let best = Infinity,
      chosen: WeatherPoint | undefined;
    for (const { a, b, length, start } of edges) {
      const scale = Math.cos((control.coord[0] * Math.PI) / 180);
      const x = longitudeDelta(a[1], b[1]) * scale,
        y = b[0] - a[0];
      const ratio = Math.max(
        0,
        Math.min(
          1,
          (longitudeDelta(a[1], control.coord[1]) * scale * x +
            (control.coord[0] - a[0]) * y) /
            (x * x + y * y || 1),
        ),
      );
      const coord: Coord = [
        a[0] + y * ratio,
        wrapLongitude(a[1] + longitudeDelta(a[1], b[1]) * ratio),
      ];
      const distance = start + length * ratio;
      const error = meters(control.coord, coord);
      if (distance >= minimum - 0.01 && error < best) {
        best = error;
        chosen = { coord, distance, name: control.name, stop: true };
      }
    }
    if (chosen) {
      samples.push(chosen);
      minimum = chosen.distance;
    }
  }
  samples.push({ ...track.at(-1)!, name: controls.at(-1)?.name, stop: true });
  const distinct = samples.filter(
    (p, i) =>
      !samples
        .slice(0, i)
        .some((other) => Math.abs(other.distance - p.distance) < 0.01),
  );
  // A copy: samples added below must not count as route stops.
  const unique =
    distinct.length > MAX_WEATHER_POINTS
      ? chooseStops(distinct, total)
      : [...distinct];
  const remaining = MAX_WEATHER_POINTS - unique.length;
  if (remaining > 0 && total > 0) {
    // Grow the spacing in multiples of the preferred one so every route point fits within the cap.
    const spacing = Math.max(
      preferredSpacing,
      Math.ceil(total / (remaining + 1) / preferredSpacing) * preferredSpacing,
    );
    // Even spacing within each leg between route points: no sample lands
    // beside a stop (same place and hour), and no gap exceeds the spacing
    // while the cap allows; moving a stop only changes its neighbouring legs.
    const ends = [...unique].sort((a, b) => a.distance - b.distance);
    for (let i = 1; i < ends.length; i++) {
      const from = ends[i - 1].distance,
        leg = ends[i].distance - from;
      const parts = Math.ceil(leg / spacing - 1e-9);
      for (let k = 1; k < parts; k++) {
        if (unique.length >= MAX_WEATHER_POINTS) break;
        unique.push(interpolate(from + (leg * k) / parts));
      }
    }
    if (unique.length === 2 && total < preferredSpacing)
      unique.push(interpolate(total / 2));
  }
  // Free slots go to sharp bends, largest first, just past each turn so the
  // sample takes the new direction; never next to another sample.
  if (unique.length < MAX_WEATHER_POINTS) {
    const gap = Math.max(2000, preferredSpacing / 4);
    for (const bend of routeBends(route.segments)) {
      if (unique.length >= MAX_WEATHER_POINTS) break;
      const at = Math.min(total, bend.distance + BEND_THRESHOLDS.step);
      if (unique.some((point) => Math.abs(point.distance - at) < gap)) continue;
      unique.push({ ...interpolate(at), bend: true });
    }
  }
  const result = unique
    .sort((a, b) => a.distance - b.distance)
    .map((point) => {
      let incoming: (typeof edges)[number] | undefined;
      for (const edge of edges) {
        if (edge.length < 0.01) continue;
        if (edge.end <= point.distance + 0.01) incoming = edge;
        // Prefer the outgoing edge at a bend, but never bridge separate GPX segments.
        if (
          edge.start <= point.distance + 0.01 &&
          edge.end > point.distance + 0.01 &&
          (edge.start < point.distance - 0.01 ||
            meters(edge.a, point.coord) < 1)
        )
          return { ...point, bearing: bearingBetween(point.coord, edge.b) };
      }
      const reverse =
        incoming && meters(incoming.b, point.coord) < 1
          ? bearingBetween(incoming.b, incoming.a)
          : null;
      return {
        ...point,
        bearing: reverse == null ? null : (reverse + 180) % 360,
      };
    });
  return { samples: result, stops: distinct.length };
}
export function nearestHour(hours: WeatherHour[], time: number): WeatherHour {
  if (!hours.length)
    throw new Error('Weather service returned an invalid response.');
  return hours.reduce((a, b) =>
    Math.abs(b.time - time) < Math.abs(a.time - time) ? b : a,
  );
}
/** Include every hourly cell touching the uncertainty window, conservatively rounded outward. */
export function weatherWindow(
  hours: WeatherHour[],
  time: number,
): WeatherHour[] {
  return hours.filter(
    (h) =>
      h.time >= Math.floor((time - HOUR) / HOUR) * HOUR &&
      h.time <= Math.ceil((time + HOUR) / HOUR) * HOUR,
  );
}
export function forecastInterval(
  departure: number,
  arrival: number,
  now = Date.now(),
): { start: number; end: number } {
  const bounds = forecastBounds(now);
  const start = Math.floor((departure - HOUR) / HOUR) * HOUR;
  // Full UTC days leave room for local speed adjustments without another request.
  const lastHour = Math.ceil((arrival + HOUR) / HOUR) * HOUR;
  const end = Math.ceil((lastHour + 1) / (24 * HOUR)) * 24 * HOUR - HOUR;
  const error = departureError(new Date(departure).toISOString(), now);
  if (error) throw new Error(error);
  if (arrival < departure || arrival + HOUR > bounds.end || end > bounds.end)
    throw new Error(
      'Departure and arrival, including the weather margin, must fit within the 16-day forecast.',
    );
  return { start, end };
}
