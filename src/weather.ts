import { meters, type Coord, type Point, type Route } from './core';
import { travelTimeSeconds } from './travel-time';
import { bearingBetween } from './weather-wind';
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
  const samples: WeatherPoint[] = [{ ...track[0], name: controls[0]?.name }];
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
        chosen = { coord, distance, name: control.name };
      }
    }
    if (chosen) {
      samples.push(chosen);
      minimum = chosen.distance;
    }
  }
  samples.push({ ...track.at(-1)!, name: controls.at(-1)?.name });
  const unique = samples.filter(
    (p, i) =>
      !samples
        .slice(0, i)
        .some((other) => Math.abs(other.distance - p.distance) < 0.01),
  );
  if (unique.length > MAX_WEATHER_POINTS)
    throw new Error(
      'Weather supports at most 20 distinct route stops. Reduce the stops and try again.',
    );
  const remaining = MAX_WEATHER_POINTS - unique.length;
  if (remaining > 0 && total > 0) {
    // Expand in multiples of the preferred spacing to retain every mandatory point within the cap.
    const spacing = Math.max(
      preferredSpacing,
      Math.ceil(total / (remaining + 1) / preferredSpacing) * preferredSpacing,
    );
    for (
      let distance = spacing;
      distance < total && unique.length < MAX_WEATHER_POINTS;
      distance += spacing
    ) {
      if (!unique.some((point) => Math.abs(point.distance - distance) < 1))
        unique.push(interpolate(distance));
    }
    if (unique.length === 2 && total < preferredSpacing)
      unique.push(interpolate(total / 2));
  }
  return unique
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
