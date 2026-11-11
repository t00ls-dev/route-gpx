import { describe, expect, it } from 'vitest';
import {
  classifyWeather,
  groupWeather,
  uvCategory,
  type CardSample,
  WEATHER_THRESHOLDS as T,
} from '../src/weather-risk';
import { setLanguage, t, weatherDescription } from '../src/i18n';
import type { WeatherHour } from '../src/weather';
const normal: WeatherHour = {
  time: 0,
  temperature: 20,
  probability: 0,
  precipitation: 0,
  code: 0,
  wind: 10,
  windDirection: 0,
  gusts: 10,
  visibility: 20000,
  uv: 0,
};
it.each([
  ['probability', T.rainProbability, 'Rain risk'],
  ['precipitation', T.rain, 'Rain risk'],
  ['precipitation', T.heavyRain, 'Heavy rain'],
  ['gusts', T.strongGusts, 'Strong wind gusts'],
  ['temperature', T.extremeHeat, 'Extreme heat'],
  ['uv', T.veryHighUv, 'Very high UV'],
  ['uv', T.extremeUv, 'Extreme UV'],
] as const)(
  'classifies %s at its inclusive threshold',
  (field, value, text) => {
    expect(
      classifyWeather([{ ...normal, [field]: value }]).map((r) => r.text),
    ).toContain(text);
    expect(
      classifyWeather([{ ...normal, [field]: value - 0.01 }]).map(
        (r) => r.text,
      ),
    ).not.toContain(text);
  },
);
it.each([
  ['visibility', T.fogVisibility, 'Fog / low visibility'],
  ['temperature', T.iceTemperature, 'Cold / possible ice'],
] as const)('classifies low %s', (field, value, text) => {
  expect(
    classifyWeather([{ ...normal, [field]: value }]).map((r) => r.text),
  ).toContain(text);
  expect(
    classifyWeather([{ ...normal, [field]: value + 0.01 }]).map((r) => r.text),
  ).not.toContain(text);
});
it.each([95, 96, 99])('recognizes thunderstorm code %i', (code) =>
  expect(classifyWeather([{ ...normal, code }])[0]).toEqual({
    text: 'Thunderstorm',
    severity: 3,
  }),
);
it.each([45, 48])('recognizes fog code %i', (code) =>
  expect(classifyWeather([{ ...normal, code }]).map((r) => r.text)).toContain(
    'Fog / low visibility',
  ),
);
it.each([48, 56, 57, 66, 67])('recognizes freezing code %i', (code) =>
  expect(classifyWeather([{ ...normal, code }]).map((r) => r.text)).toContain(
    'Cold / possible ice',
  ),
);
it('deduplicates, orders risks by severity and reports unavailable data', () => {
  const risks = classifyWeather([
    normal,
    { ...normal, probability: 80 },
    { ...normal, code: 95, gusts: 70 },
    { ...normal, code: 95, visibility: null },
  ]);
  expect(risks[0].severity).toBe(3);
  expect(
    risks.map((r) => r.text).filter((x) => x === 'Thunderstorm'),
  ).toHaveLength(1);
  expect(risks.map((r) => r.text)).toContain('Some weather data unavailable');
  expect(classifyWeather([normal])).toEqual([]);
});
it('keeps UV below storms and reports extreme UV only once', () => {
  const risks = classifyWeather([
    { ...normal, uv: 9 },
    { ...normal, uv: 12, code: 95 },
  ]);
  expect(risks.map((r) => r.text)).toEqual([
    'Thunderstorm',
    'Extreme UV',
    'Very high UV',
  ]);
  expect(risks.find((r) => r.text === 'Extreme UV')!.severity).toBe(2);
});
it('does not report a missing UV index as unavailable data', () => {
  expect(classifyWeather([{ ...normal, uv: null }])).toEqual([]);
});
it.each([
  [0, 'Low'],
  [2.4, 'Low'],
  [2.5, 'Moderate'],
  [5, 'Moderate'],
  [6, 'High'],
  [7.4, 'High'],
  [8, 'Very high'],
  [10, 'Very high'],
  [11, 'Extreme'],
] as const)('maps UV %d to the WHO category %s', (uv, category) =>
  expect(uvCategory(uv)).toBe(category),
);
it('translates the UV card line and alerts in both directions', () => {
  setLanguage('pt');
  expect(t('UV 9 · Very high')).toBe('UV 9 · muito alto');
  expect(t('UV 3 · Moderate')).toBe('UV 3 · moderado');
  expect(t('Very high UV')).toBe('UV muito alto');
  expect(t('Extreme UV')).toBe('UV extremo');
  setLanguage('en');
  expect(t('UV 9 · Very high')).toBe('UV 9 · Very high');
});
it('maps all published WMO codes to translated text and icons in both directions', () => {
  for (const code of [
    0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
    80, 81, 82, 85, 86, 95, 96, 99,
  ]) {
    const desc = weatherDescription(code);
    expect(desc.icon).not.toBe('help');
    setLanguage('pt');
    expect(t(desc.text)).not.toBe(desc.text);
    setLanguage('en');
    expect(t(desc.text)).toBe(desc.text);
  }
  expect(weatherDescription(null).icon).toBe('help');
});

describe('merging equivalent weather cards', () => {
  const sample = (over: Partial<CardSample> = {}): CardSample => ({
    stop: false,
    text: 'Clear sky',
    severity: 0,
    risks: [],
    relation: 'Crosswind',
    uv: 'High',
    uvAlert: false,
    pass: null,
    temperature: 20,
    probability: 10,
    wind: 8,
    ...over,
  });
  it('merges runs of equivalent samples and keeps route points apart', () => {
    const start = sample({ stop: true }),
      end = sample({ stop: true });
    expect(groupWeather([start, sample(), sample(), sample(), end])).toEqual([
      [0],
      [1, 2, 3],
      [4],
    ]);
    // A stop in the middle ends the run on both sides.
    expect(
      groupWeather([sample(), sample(), sample({ stop: true }), sample()]),
    ).toEqual([[0, 1], [2], [3]]);
  });
  it('splits at each threshold, measured from the first sample of the run', () => {
    const split = (over: Partial<CardSample>) =>
      groupWeather([sample(), sample(over)]).length;
    expect(split({ temperature: 22 })).toBe(1);
    expect(split({ temperature: 22.1 })).toBe(2);
    expect(split({ probability: 30 })).toBe(1);
    expect(split({ probability: 31 })).toBe(2);
    expect(split({ wind: 18 })).toBe(1);
    expect(split({ wind: 18.5 })).toBe(2);
    for (const over of [
      { text: 'Mainly clear' },
      { severity: 1, risks: ['Rain risk'] },
      { risks: ['Fog / low visibility'] },
      { relation: 'Headwind' },
      { uv: 'Very high' },
      { uvAlert: true },
      { pass: 'return' },
      { temperature: null },
    ])
      expect(split(over)).toBe(2);
    // Slow drift: each step is small, but the third is too far from the first.
    expect(
      groupWeather([
        sample({ temperature: 20 }),
        sample({ temperature: 21.5 }),
        sample({ temperature: 23 }),
      ]),
    ).toEqual([[0, 1], [2]]);
    // Missing values match each other.
    expect(
      groupWeather([sample({ wind: null }), sample({ wind: null })]),
    ).toEqual([[0, 1]]);
  });
});
