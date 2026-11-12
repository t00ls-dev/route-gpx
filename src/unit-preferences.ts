import type { DistanceUnits, TemperatureUnits } from './units';

export type DistanceChoice = DistanceUnits | 'auto';
export type TemperatureChoice = TemperatureUnits | 'auto';

const DISTANCE_KEY = 'distance-units';
const TEMPERATURE_KEY = 'temperature-units';
/** Regions that use miles on roads, after CLDR's road length preferences. */
const MILE_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);
/** Regions that read weather temperatures in Fahrenheit, after CLDR. */
const FAHRENHEIT_REGIONS = new Set(['US', 'BS', 'BZ', 'KY', 'PR', 'PW']);
/** United States time zones, including legacy aliases some systems report. */
const US_ZONES =
  /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Boise|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Adak|Atka|Indiana\/.+|Indianapolis|Fort_Wayne|Knox_IN|Kentucky\/.+|Louisville|North_Dakota\/.+|Menominee|Metlakatla|Yakutat|Shiprock)|Pacific\/Honolulu|US\/.+|Navajo)$/;
/** Other time zones of the mile and Fahrenheit regions above. */
const ZONE_REGIONS = new Map([
  ['Europe/London', 'GB'],
  ['Europe/Belfast', 'GB'],
  ['GB', 'GB'],
  ['GB-Eire', 'GB'],
  ['Africa/Monrovia', 'LR'],
  ['Asia/Yangon', 'MM'],
  ['Asia/Rangoon', 'MM'],
  ['America/Nassau', 'BS'],
  ['America/Belize', 'BZ'],
  ['America/Cayman', 'KY'],
  ['America/Puerto_Rico', 'PR'],
  ['Pacific/Palau', 'PW'],
]);
/** Time zones that name a place, unlike UTC, Etc/GMT+5 or EST5EDT. */
const PLACE_ZONES =
  /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Brazil|Canada|Chile|Mexico)\//;

function regionOf(language: string): string | null {
  const region = language
    .split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));
  return region ? region.toUpperCase() : null;
}

/**
 * The region a time zone places the device in: a code when it matters for
 * units, '' for any other place, null when the zone names no place.
 */
function zoneRegion(timeZone: string): string | null {
  if (US_ZONES.test(timeZone)) return 'US';
  const region = ZONE_REGIONS.get(timeZone);
  if (region) return region;
  return PLACE_ZONES.test(timeZone) ? '' : null;
}

/**
 * Units inferred locally, without requests. The time zone says where the
 * device is and decides; a language region often names only a variety of the
 * language (en-GB in Australia), so it decides only when the time zone names
 * no place (UTC, often under fingerprinting protection). Otherwise metric.
 */
export function detectUnits(
  languages: readonly string[],
  timeZone: string,
): { distance: DistanceUnits; temperature: TemperatureUnits } {
  const region =
    zoneRegion(timeZone) ?? languages.map(regionOf).find(Boolean) ?? null;
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
