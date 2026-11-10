export type DistanceUnits = 'metric' | 'imperial';
export function distanceLabel(
  meters: number,
  units: DistanceUnits = 'metric',
  locale = 'en',
  precision = 1,
): string {
  const value = units === 'imperial' ? meters / 1609.344 : meters / 1000;
  return `${value.toLocaleString(locale, { minimumFractionDigits: precision === 2 ? 2 : 0, maximumFractionDigits: precision })} ${units === 'imperial' ? 'mi' : 'km'}`;
}
/** Compact step length: meters (or feet) for short steps, one decimal otherwise. */
export function stepDistanceLabel(
  meters: number,
  units: DistanceUnits = 'metric',
  locale = 'en',
): string {
  if (units === 'imperial') {
    const feet = meters * 3.280839895;
    if (feet < 1000) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  } else if (meters < 1000)
    return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return distanceLabel(meters, units, locale, 1);
}
/** Position along the route, unit first like a road marker: "km 12.3", "mi 7.6". */
export function milepostLabel(
  meters: number,
  units: DistanceUnits = 'metric',
  locale = 'en',
): string {
  const value = units === 'imperial' ? meters / 1609.344 : meters / 1000;
  return `${units === 'imperial' ? 'mi' : 'km'} ${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}
export function shortDistanceLabel(
  meters: number,
  units: DistanceUnits = 'metric',
): string {
  return `${Math.round(units === 'imperial' ? meters * 3.280839895 : meters)} ${units === 'imperial' ? 'ft' : 'm'}`;
}
/** Altitude in meters or feet, rounded to whole units. */
export function elevationLabel(
  meters: number,
  units: DistanceUnits = 'metric',
  locale = 'en',
): string {
  const value = Math.round(
    units === 'imperial' ? meters * 3.280839895 : meters,
  );
  return `${value.toLocaleString(locale)} ${units === 'imperial' ? 'ft' : 'm'}`;
}
