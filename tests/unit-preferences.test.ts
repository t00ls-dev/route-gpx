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

it('detects units from the time zone, then the first language with a region', () => {
  const cases: [string[], string, string, string][] = [
    // A place in the time zone decides, whatever the language region says.
    [['en-GB'], 'Australia/Sydney', 'metric', 'celsius'],
    [['en-GB', 'en'], 'Australia/Melbourne', 'metric', 'celsius'],
    [['en', 'en-GB'], 'Australia/Adelaide', 'metric', 'celsius'],
    [['en-US'], 'Australia/Sydney', 'metric', 'celsius'],
    [['en-US', 'en-AU'], 'Australia/Brisbane', 'metric', 'celsius'],
    [['en-US'], 'Pacific/Auckland', 'metric', 'celsius'],
    [['en-US'], 'America/Toronto', 'metric', 'celsius'],
    [['en', 'en-US'], 'Europe/Paris', 'metric', 'celsius'],
    [['en-AU'], 'Australia/Perth', 'metric', 'celsius'],
    [['pt-BR'], 'America/Chicago', 'imperial', 'fahrenheit'],
    [['en-GB'], 'America/New_York', 'imperial', 'fahrenheit'],
    [['en-US'], 'Europe/London', 'imperial', 'celsius'],
    [['en'], 'America/Chicago', 'imperial', 'fahrenheit'],
    [['en'], 'America/Indiana/Indianapolis', 'imperial', 'fahrenheit'],
    [['en'], 'US/Eastern', 'imperial', 'fahrenheit'],
    [['en'], 'Europe/London', 'imperial', 'celsius'],
    [['en'], 'Asia/Yangon', 'imperial', 'celsius'],
    [['en-US'], 'America/Nassau', 'metric', 'fahrenheit'],
    [['en'], 'Asia/Tokyo', 'metric', 'celsius'],
    // A time zone without a place leaves the decision to the language region.
    [['en-US'], 'UTC', 'imperial', 'fahrenheit'],
    [['en-GB'], 'UTC', 'imperial', 'celsius'],
    [['en', 'en-GB'], 'Etc/GMT-10', 'imperial', 'celsius'],
    [['pt-BR', 'en-US'], 'UTC', 'metric', 'celsius'],
    [['es-PR'], '', 'metric', 'fahrenheit'],
    [['zh-Hant-TW'], 'UTC', 'metric', 'celsius'],
    [['en'], 'EST5EDT', 'metric', 'celsius'],
    [[], '', 'metric', 'celsius'],
  ];
  for (const [languages, zone, distance, temperature] of cases)
    expect(
      detectUnits(languages, zone),
      `${languages.join(',')} ${zone}`,
    ).toEqual({ distance, temperature });
});

it('uses a stored choice over detection, and Automatic otherwise', () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  // A host time zone with a place would decide before the language.
  const options = Intl.DateTimeFormat().resolvedOptions();
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    ...options,
    timeZone: 'UTC',
  });
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
