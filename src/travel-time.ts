import type { DistanceUnits } from './units';
export const MIN_AVERAGE_SPEED_KMH = 1;
export const MAX_AVERAGE_SPEED_KMH = 200;
export const AVERAGE_SPEED_ERROR =
  'Average speed must be between 1 and 200 km/h.';
export function isValidAverageSpeedKmh(speed: unknown): speed is number {
  return (
    typeof speed === 'number' &&
    Number.isFinite(speed) &&
    speed >= MIN_AVERAGE_SPEED_KMH - 1e-9 &&
    speed <= MAX_AVERAGE_SPEED_KMH + 1e-9
  );
}
export function speedInputBounds(units: DistanceUnits = 'metric'): {
  min: number;
  max: number;
} {
  return {
    min: speedFromKmh(MIN_AVERAGE_SPEED_KMH, units),
    max: speedFromKmh(MAX_AVERAGE_SPEED_KMH, units),
  };
}
export function speedInputValue(
  speedKmh: number,
  units: DistanceUnits = 'metric',
): string {
  const { min, max } = speedInputBounds(units);
  let value = Number(speedFromKmh(speedKmh, units).toFixed(2));
  if (value < min) value = Math.ceil(min * 1e6) / 1e6;
  if (value > max) value = Math.floor(max * 1e6) / 1e6;
  return String(value);
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
  if (!isValidAverageSpeedKmh(speedKmh))
    throw new RangeError(AVERAGE_SPEED_ERROR);
  return distanceMeters / (speedKmh / 3.6);
}
