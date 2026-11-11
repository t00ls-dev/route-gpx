export type DistanceUnits = 'metric' | 'imperial';
export type TemperatureUnits = 'celsius' | 'fahrenheit';
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
/** Weather temperature from °C, at most one decimal; `—` when unknown. */
export function temperatureLabel(
  celsius: number | null,
  units: TemperatureUnits = 'celsius',
  locale = 'en',
): string {
  if (celsius === null) return `— ${units === 'fahrenheit' ? '°F' : '°C'}`;
  const value = units === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius;
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units === 'fahrenheit' ? '°F' : '°C'}`;
}
/**
 * Precipitation from mm, in inches with the Fahrenheit choice (as weather
 * reports there do): at most one decimal in mm, two in inches.
 */
export function precipitationLabel(
  mm: number | null,
  units: TemperatureUnits = 'celsius',
  locale = 'en',
): string {
  const unit = units === 'fahrenheit' ? 'in' : 'mm';
  if (mm === null) return `— ${unit}`;
  const value = units === 'fahrenheit' ? mm / 25.4 : mm;
  return `${value.toLocaleString(locale, { maximumFractionDigits: units === 'fahrenheit' ? 2 : 1 })} ${unit}`;
}
