import type { Coord } from './core';

/** Meteorological direction is where wind comes FROM, clockwise from north. */
const WIND_DIRECTION_THRESHOLDS = {
  calmKmh: 1,
  alignedDegrees: 45,
} as const;

/** Initial great-circle bearing. Coincident/antipodal points have no unique bearing. */
export function bearingBetween(a: Coord, b: Coord): number | null {
  const rad = Math.PI / 180;
  const latA = a[0] * rad,
    latB = b[0] * rad,
    longitude = (b[1] - a[1]) * rad;
  const x = Math.sin(longitude) * Math.cos(latB);
  const y =
    Math.cos(latA) * Math.sin(latB) -
    Math.sin(latA) * Math.cos(latB) * Math.cos(longitude);
  if (Math.hypot(x, y) < 1e-12) return null;
  const angle = (Math.atan2(x, y) / rad + 360) % 360;
  // Treat floating-point noise around the north/360° boundary consistently.
  return angle < 1e-9 || angle > 360 - 1e-9 ? 0 : angle;
}

export function windRelation(
  speedKmh: number | null,
  windFrom: number | null,
  heading: number | null | undefined,
): string {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0)
    return 'Wind unavailable';
  if (speedKmh < WIND_DIRECTION_THRESHOLDS.calmKmh) return 'Calm wind';
  if (
    windFrom === null ||
    !Number.isFinite(windFrom) ||
    windFrom < 0 ||
    windFrom > 360 ||
    heading == null ||
    !Number.isFinite(heading)
  )
    return 'Wind direction unavailable';
  const difference = Math.abs(((windFrom - heading + 540) % 360) - 180);
  if (difference <= WIND_DIRECTION_THRESHOLDS.alignedDegrees) return 'Headwind';
  if (difference >= 180 - WIND_DIRECTION_THRESHOLDS.alignedDegrees)
    return 'Tailwind';
  return 'Crosswind';
}

/** Simplified display bands using Beaufort boundaries; not official warnings. SI: km/h. */
const WIND_STRENGTH_THRESHOLDS = {
  moderate: 20,
  strong: 39,
  veryStrong: 62,
} as const;
export function windStrength(speedKmh: number | null): {
  level: string;
  text: string;
} {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0)
    return { level: 'unknown', text: 'Wind unavailable' };
  if (speedKmh < WIND_DIRECTION_THRESHOLDS.calmKmh)
    return { level: 'calm', text: 'Calm wind' };
  if (speedKmh < WIND_STRENGTH_THRESHOLDS.moderate)
    return { level: 'light', text: 'Light wind' };
  if (speedKmh < WIND_STRENGTH_THRESHOLDS.strong)
    return { level: 'moderate', text: 'Moderate wind' };
  if (speedKmh < WIND_STRENGTH_THRESHOLDS.veryStrong)
    return { level: 'strong', text: 'Strong wind' };
  return { level: 'very-strong', text: 'Very strong wind' };
}
export function windFlowDirection(
  windFrom: number | null,
): { degrees: number; compass: string } | null {
  if (
    windFrom === null ||
    !Number.isFinite(windFrom) ||
    windFrom < 0 ||
    windFrom > 360
  )
    return null;
  const degrees = (windFrom + 180) % 360;
  const compass = [
    'North',
    'North-east',
    'East',
    'South-east',
    'South',
    'South-west',
    'West',
    'North-west',
  ][Math.round(degrees / 45) % 8];
  return { degrees, compass };
}
