import type { DistanceUnits, TemperatureUnits } from './units';

export type DistanceChoice = DistanceUnits | 'auto';
export type TemperatureChoice = TemperatureUnits | 'auto';

const DISTANCE_KEY = 'distance-units';
const TEMPERATURE_KEY = 'temperature-units';
/** Regions that use miles on roads, after CLDR's road length preferences. */
const MILE_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);
/** Regions that read weather temperatures in Fahrenheit, after CLDR. */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PR', 'PW']);
/** Time zones used only when no preferred language names a region. */
const US_ZONES =
  /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Adak|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+|Menominee|Metlakatla|Yakutat)|Pacific\/Honolulu)$/;

function regionOf(language: string): string | null {
  const region = language
    .split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
}

/**
 * Units inferred locally, without requests: the first preferred language that
 * names a region decides; otherwise the time zone; otherwise metric.
 */
export function detectUnits(
  languages: readonly string[],
  timeZone: string,
): { distance: DistanceUnits; temperature: TemperatureUnits } {
  let region = languages.map(regionOf).find(Boolean) ?? null;
  if (!region)
    region = US_ZONES.test(timeZone)
      ? 'US'
      : timeZone === 'Europe/London'
        ? 'GB'
        : null;
  return {
    distance: region && MILE_REGIONS.has(region) ? 'imperial' : 'metric',
    temperature:
      region && FAHRENHEIT_REGIONS.has(region) ? 'fahrenheit' : 'celsius',
  };
}

/** What Automatic resolves to on this device. */
export function detectedUnits() {
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    /* Detection falls back to metric. */
  }
  return detectUnits(navigator.languages ?? [navigator.language], timeZone);
}

function read(key: string, allowed: readonly string[]): string {
  try {
    const value = localStorage.getItem(key);
    if (value && allowed.includes(value)) return value;
  } catch {
    /* Optional preference. */
  }
  return 'auto';
}
function write(key: string, value: string): void {
  try {
    if (value === 'auto') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Optional preference. */
  }
}

/** Device preferences: never part of links, saved routes or backups. */
export const chosenDistanceUnits = (): DistanceChoice =>
  read(DISTANCE_KEY, ['metric', 'imperial']) as DistanceChoice;
export const chosenTemperatureUnits = (): TemperatureChoice =>
  read(TEMPERATURE_KEY, ['celsius', 'fahrenheit']) as TemperatureChoice;
export const rememberDistanceUnits = (choice: DistanceChoice): void =>
  write(DISTANCE_KEY, choice);
export const rememberTemperatureUnits = (choice: TemperatureChoice): void =>
  write(TEMPERATURE_KEY, choice);

export function distanceUnits(): DistanceUnits {
  const choice = chosenDistanceUnits();
  return choice === 'auto' ? detectedUnits().distance : choice;
}
export function temperatureUnits(): TemperatureUnits {
  const choice = chosenTemperatureUnits();
  return choice === 'auto' ? detectedUnits().temperature : choice;
}
