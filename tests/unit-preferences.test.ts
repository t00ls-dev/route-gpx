import { afterEach, expect, it, vi } from 'vitest';
import {
  chosenDistanceUnits,
  chosenTemperatureUnits,
  detectUnits,
  distanceUnits,
  rememberDistanceUnits,
  rememberTemperatureUnits,
  temperatureUnits,
} from '../src/unit-preferences';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('detects units from the first language with a region, then the time zone', () => {
  const cases: [string[], string, string, string][] = [
    [['en-US'], 'UTC', 'imperial', 'fahrenheit'],
    [['en-GB'], 'UTC', 'imperial', 'celsius'],
    [['pt-BR', 'en-US'], 'UTC', 'metric', 'celsius'],
    [['en', 'en-US'], 'Europe/Paris', 'imperial', 'fahrenheit'],
    [['en'], 'America/Chicago', 'imperial', 'fahrenheit'],
    [['en'], 'America/Indiana/Indianapolis', 'imperial', 'fahrenheit'],
    [['en'], 'Europe/London', 'imperial', 'celsius'],
    [['en'], 'Asia/Tokyo', 'metric', 'celsius'],
    [['es-PR'], 'UTC', 'metric', 'fahrenheit'],
    [['zh-Hant-TW'], 'UTC', 'metric', 'celsius'],
    [[], '', 'metric', 'celsius'],
  ];
  for (const [languages, zone, distance, temperature] of cases)
    expect(detectUnits(languages, zone)).toEqual({ distance, temperature });
});

it('uses a stored choice over detection, and Automatic otherwise', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  expect(chosenDistanceUnits()).toBe('auto');
  expect(distanceUnits()).toBe('imperial');
  expect(temperatureUnits()).toBe('fahrenheit');
  rememberDistanceUnits('metric');
  rememberTemperatureUnits('celsius');
  expect(distanceUnits()).toBe('metric');
  expect(temperatureUnits()).toBe('celsius');
  rememberDistanceUnits('auto');
  expect(localStorage.getItem('distance-units')).toBeNull();
  expect(distanceUnits()).toBe('imperial');
});

it('treats unknown stored values as Automatic', () => {
  localStorage.setItem('distance-units', 'furlongs');
  localStorage.setItem('temperature-units', 'kelvin');
  expect(chosenDistanceUnits()).toBe('auto');
  expect(chosenTemperatureUnits()).toBe('auto');
});
