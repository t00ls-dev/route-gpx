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
