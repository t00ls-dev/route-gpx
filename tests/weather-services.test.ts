import { afterEach, expect, it, vi } from 'vitest';
import {
  parseWeather,
  weatherForecast,
  weatherUrl,
  WEATHER_VARIABLES,
} from '../src/services';
import { HOUR } from '../src/weather';
import { weatherResponse } from './weather-fixture';
const start = Date.parse('2026-11-08T10:00:00Z'),
  end = start + 5 * HOUR;
const points = [
  { coord: [10.123456, 20.654321] as [number, number], distance: 0 },
  { coord: [11, 21] as [number, number], distance: 1000 },
];
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('builds one request with all rounded latitudes/longitudes and UTC hourly variables in explicit units', () => {
  const url = new URL(
    weatherUrl('https://api.open-meteo.com', points, start, end),
  );
  expect(url.pathname).toBe('/v1/forecast');
  expect(url.searchParams.get('latitude')).toBe('10.123,11.000');
  expect(url.searchParams.get('longitude')).toBe('20.654,21.000');
  expect(url.searchParams.get('timezone')).toBe('GMT');
  expect(url.searchParams.get('timeformat')).toBe('unixtime');
  expect(url.searchParams.get('hourly')!.split(',')).toEqual(
    Object.values(WEATHER_VARIABLES),
  );
  expect(url.searchParams.get('start_hour')).toBe('2026-11-08T10:00');
  expect(url.searchParams.get('end_hour')).toBe('2026-11-08T15:00');
  expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
  expect(() => weatherUrl('javascript:alert(1)', points, start, end)).toThrow();
});
it('validates complete aligned arrays, missing values and UTC response coverage', () => {
  const data = weatherResponse(
    new URL(weatherUrl('https://weather.test', points, start, end)),
  );
  expect(parseWeather(data, 2, start, end).hours[0][0]).toMatchObject({
    time: start,
    precipitation: 12,
  });
  expect(() => parseWeather(data, 1, start, end)).toThrow('invalid');
  data[0].hourly.temperature_2m.pop();
  expect(() => parseWeather(data, 2, start, end)).toThrow('invalid');
  const clean = weatherResponse(
    new URL(weatherUrl('https://weather.test', points, start, end)),
  );
  clean[0].utc_offset_seconds = 3600;
  expect(() => parseWeather(clean, 2, start, end)).toThrow('invalid');
});
it('serializes starts, caches only successful results and never sends credentials or caches over HTTP', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
  const times: number[] = [];
  const fetch = vi.fn(async (url: string) => {
    times.push(Date.now());
    return {
      ok: true,
      status: 200,
      json: async () => weatherResponse(new URL(url)),
    };
  });
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const a = weatherForecast(
    'https://queue.weather.test',
    points,
    start,
    end,
    signal,
    () => true,
  );
  const b = weatherForecast(
    'https://queue2.weather.test',
    points,
    start,
    end,
    signal,
    () => true,
  );
  await vi.runAllTimersAsync();
  await Promise.all([a, b]);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(6000);
  await weatherForecast(
    'https://queue.weather.test',
    points,
    start,
    end,
    signal,
    () => true,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
});
it.each([429, 'network', 'invalid', 'timeout'] as const)(
  'reports %s without retries and discards obsolete queued requests',
  async (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const fetch = vi.fn(async () => {
      if (mode === 'network') throw new TypeError('Failed');
      if (mode === 'timeout')
        throw new DOMException('Timed out', 'TimeoutError');
      return {
        ok: mode !== 429,
        status: mode === 429 ? 429 : 200,
        json: async () => ({}),
      };
    });
    vi.stubGlobal('fetch', fetch);
    const promise = weatherForecast(
      `https://${mode}.weather.test`,
      points,
      start,
      end,
      new AbortController().signal,
      () => true,
    );
    const assertion = expect(promise).rejects.toThrow(
      mode === 429
        ? 'limit'
        : mode === 'network'
          ? 'network'
          : mode === 'timeout'
            ? 'timed out'
            : 'invalid',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
    const obsolete = weatherForecast(
      'https://obsolete.weather.test',
      points,
      start,
      end,
      new AbortController().signal,
      () => false,
    );
    const obsoleteAssertion = expect(obsolete).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.runAllTimersAsync();
    await obsoleteAssertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it('requests recent past and its preceding-hour margin through the same grouped UTC endpoint', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  const url = new URL(
    weatherUrl(
      'https://api.open-meteo.com',
      points,
      Date.parse('2026-08-08T23:00:00Z'),
      Date.parse('2026-08-09T23:00:00Z'),
    ),
  );
  expect(url.pathname).toBe('/v1/forecast');
  expect(url.searchParams.has('past_days')).toBe(false);
  expect(url.searchParams.get('start_hour')).toBe('2026-08-08T23:00');
  expect(url.searchParams.get('latitude')!.split(',')).toHaveLength(2);
  const future = new URL(
    weatherUrl('https://api.open-meteo.com', points, start, end),
  );
  expect(future.searchParams.has('past_days')).toBe(false);
});

it('rejects requests exceeding the total of 20 weather points', () => {
  expect(() =>
    weatherUrl(
      'https://api.open-meteo.com',
      Array.from({ length: 21 }, () => points[0]),
      start,
      end,
    ),
  ).toThrow('invalid');
});

it('validates wind directions and preserves unavailable directions without inventing values', () => {
  const response = weatherResponse(
    new URL(weatherUrl('https://weather.test', points, start, end)),
  );
  response[0].hourly.wind_direction_10m.fill(360);
  expect(parseWeather(response, 2, start, end).hours[0][0].windDirection).toBe(
    360,
  );
  response[0].hourly.wind_direction_10m[0] = 361;
  expect(() => parseWeather(response, 2, start, end)).toThrow('invalid');
  const missing = response.map((row) => ({
    ...row,
    hourly: {
      ...row.hourly,
      wind_direction_10m: row.hourly.time.map(() => null),
    },
  }));
  expect(
    parseWeather(missing, 2, start, end).hours[0][0].windDirection,
  ).toBeNull();
});

it('reuses covered points in different orders and fetches only missing distinct rounded coordinates', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  const urls: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: string) => {
      const url = new URL(raw);
      urls.push(url);
      const longitudes = url.searchParams
        .get('longitude')!
        .split(',')
        .map(Number);
      return {
        ok: true,
        status: 200,
        json: async () =>
          weatherResponse(url).map((row, i) => ({
            ...row,
            hourly: {
              ...row.hourly,
              temperature_2m: row.hourly.time.map(() => longitudes[i]),
            },
          })),
      };
    }),
  );
  const signal = new AbortController().signal;
  const first = weatherForecast(
    'https://partial.weather.test',
    points,
    start,
    end,
    signal,
    () => true,
  );
  await vi.runAllTimersAsync();
  await first;
  const reordered = await weatherForecast(
    'https://partial.weather.test',
    [points[1], points[0], { ...points[0], coord: [10.12349, 20.65449] }],
    start + HOUR,
    end - HOUR,
    signal,
    () => true,
  );
  expect(urls).toHaveLength(1);
  expect(reordered.hours.map((h) => h[0].temperature)).toEqual([
    21, 20.654, 20.654,
  ]);
  const partial = weatherForecast(
    'https://partial.weather.test',
    [
      points[0],
      { coord: [12, 22], distance: 2000 },
      { coord: [12.00001, 22.00001], distance: 3000 },
    ],
    start,
    end,
    signal,
    () => true,
  );
  await vi.runAllTimersAsync();
  const result = await partial;
  expect(urls).toHaveLength(2);
  expect(urls[1].searchParams.get('latitude')).toBe('12.000');
  expect(result.hours.map((h) => h[0].temperature)).toEqual([20.654, 22, 22]);
});
