import type { DistanceUnits } from './units';
export const AVERAGE_SPEED_ERROR =
  'Average speed must be between 1 and 200 km/h or 1 and 130 mph.';
export function speedInputBounds(units: DistanceUnits = 'metric'): {
  min: number;
  max: number;
} {
  return { min: 1, max: units === 'imperial' ? 130 : 200 };
}
export function snapSpeed(
  value: number,
  units: DistanceUnits = 'metric',
): number {
  const { max } = speedInputBounds(units);
  return Math.max(1, Math.min(max, Math.round(value / 5) * 5));
}
export function isValidAverageSpeedKmh(
  speed: unknown,
  units: DistanceUnits = 'metric',
): speed is number {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return false;
  const value = speedFromKmh(speed, units),
    bounds = speedInputBounds(units);
  return value >= bounds.min - 1e-9 && value <= bounds.max + 1e-9;
}
export function speedToKmh(
  speed: number,
  units: DistanceUnits = 'metric',
): number {
  return units === 'imperial' ? speed * 1.609344 : speed;
}
export function speedFromKmh(
  speed: number,
  units: DistanceUnits = 'metric',
): number {
  return units === 'imperial' ? speed / 1.609344 : speed;
}
export function travelTimeSeconds(
  distanceMeters: number,
  speedKmh: number,
): number {
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    !Number.isFinite(speedKmh) ||
    speedKmh <= 0
  )
    throw new RangeError(
      'Distance and average speed must be valid positive numbers.',
    );
  return distanceMeters / (speedKmh / 3.6);
}
