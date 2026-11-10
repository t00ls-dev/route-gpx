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
