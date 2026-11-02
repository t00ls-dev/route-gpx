import type { DistanceUnits } from './units';
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
