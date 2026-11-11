import type { WeatherHour } from './weather';
/** Review aids, not official warnings. SI units: °C, mm/hour, km/h, metres. */
export const WEATHER_THRESHOLDS = {
  rainProbability: 60,
  rain: 1,
  heavyRain: 10,
  fogVisibility: 1000,
  strongGusts: 60,
  iceTemperature: 2,
  extremeHeat: 40,
  /** WHO UV index categories: 8–10 very high, 11+ extreme. */
  veryHighUv: 8,
  extremeUv: 11,
} as const;
export interface WeatherRisk {
  severity: number;
  text: string;
}
export function classifyWeather(hours: WeatherHour[]): WeatherRisk[] {
  const risks = new Map<string, number>();
  const add = (text: string, severity: number) => risks.set(text, severity);
  const t = WEATHER_THRESHOLDS;
  for (const h of hours) {
    if ([95, 96, 99].includes(h.code ?? -1)) add('Thunderstorm', 3);
    if (h.precipitation !== null && h.precipitation >= t.heavyRain)
      add('Heavy rain', 3);
    else if (
      (h.probability !== null && h.probability >= t.rainProbability) ||
      (h.precipitation !== null && h.precipitation >= t.rain)
    )
      add('Rain risk', 1);
    if (
      [45, 48].includes(h.code ?? -1) ||
      (h.visibility !== null && h.visibility <= t.fogVisibility)
    )
      add('Fog / low visibility', 2);
    if (h.gusts !== null && h.gusts >= t.strongGusts)
      add('Strong wind gusts', 2);
    if (
      (h.temperature !== null && h.temperature <= t.iceTemperature) ||
      [48, 56, 57, 66, 67].includes(h.code ?? -1)
    )
      add('Cold / possible ice', 2);
    if (h.temperature !== null && h.temperature >= t.extremeHeat)
      add('Extreme heat', 2);
    if (h.uv !== null && h.uv >= t.extremeUv) add('Extreme UV', 2);
    else if (h.uv !== null && h.uv >= t.veryHighUv) add('Very high UV', 1);
    // UV is optional data: its absence alone is not reported.
    if (
      Object.entries(h).some(([key, value]) => key !== 'uv' && value === null)
    )
      add('Some weather data unavailable', 1);
  }
  return [...risks]
    .map(([text, severity]) => ({ text, severity }))
    .sort((a, b) => b.severity - a.severity || a.text.localeCompare(b.text));
}
/** WHO UV index category for a rounded value. */
export function uvCategory(
  uv: number,
): 'Low' | 'Moderate' | 'High' | 'Very high' | 'Extreme' {
  const value = Math.round(uv);
  return value <= 2
    ? 'Low'
    : value <= 5
      ? 'Moderate'
      : value <= 7
        ? 'High'
        : value <= 10
          ? 'Very high'
          : 'Extreme';
}

/**
 * How close two weather samples must be to share one card and one marker:
 * within these differences of the first sample of the run. SI units.
 */
export const MERGE_THRESHOLDS = {
  temperature: 2,
  probability: 20,
  wind: 10,
} as const;
/** What a weather card shows for one sample, as compared when merging. */
export interface CardSample {
  /** A route point (start, stop or destination): always its own card. */
  stop: boolean;
  text: string;
  severity: number;
  risks: string[];
  relation: string;
  /** UV category when shown, and whether it carries a UV alert. */
  uv: string | null;
  uvAlert: boolean;
  pass: string | null;
  temperature: number | null;
  probability: number | null;
  wind: number | null;
}
const close = (a: number | null, b: number | null, limit: number) =>
  a === null || b === null ? a === b : Math.abs(a - b) <= limit;
/**
 * Runs of consecutive samples with equivalent conditions, as index lists.
 * Each sample is compared with the first of its run, so slow drift still
 * ends a run; route points never join or extend one.
 */
export function groupWeather(samples: CardSample[]): number[][] {
  const groups: number[][] = [];
  samples.forEach((sample, i) => {
    const group = groups.at(-1);
    const first = group ? samples[group[0]] : null;
    if (
      group &&
      first &&
      !first.stop &&
      !sample.stop &&
      sample.text === first.text &&
      sample.severity === first.severity &&
      sample.risks.join('|') === first.risks.join('|') &&
      sample.relation === first.relation &&
      sample.uv === first.uv &&
      sample.uvAlert === first.uvAlert &&
      sample.pass === first.pass &&
      close(
        sample.temperature,
        first.temperature,
        MERGE_THRESHOLDS.temperature,
      ) &&
      close(
        sample.probability,
        first.probability,
        MERGE_THRESHOLDS.probability,
      ) &&
      close(sample.wind, first.wind, MERGE_THRESHOLDS.wind)
    )
      group.push(i);
    else groups.push([i]);
  });
  return groups;
}
