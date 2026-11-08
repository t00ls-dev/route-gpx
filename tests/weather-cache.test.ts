import { expect, it } from 'vitest';
import { WeatherCache } from '../src/weather-cache';
import { HOUR, type WeatherHour, type WeatherPoint } from '../src/weather';
const base = 'https://weather.test';
const point: WeatherPoint = { coord: [10.1234, 20.6544], distance: 0 };
const hours = Array.from({ length: 4 }, (_, i): WeatherHour => ({
  time: i * HOUR,
  temperature: 20,
  probability: 0,
  precipitation: 0,
  code: 0,
  wind: 10,
  windDirection: 90,
  gusts: 10,
  visibility: 20000,
}));
it('reuses rounded coordinates and covered subranges without mixing endpoints or missing hours', () => {
  const cache = new WeatherCache();
  cache.set(base, point, hours, 1000);
  expect(
    cache.get(
      base + '/',
      { ...point, coord: [10.12349, 20.65449] },
      HOUR,
      2 * HOUR,
      1100,
    ),
  ).toEqual(hours.slice(1, 3));
  expect(
    cache.get('https://other.test', point, HOUR, 2 * HOUR, 1100),
  ).toBeUndefined();
  expect(cache.get(base, point, -HOUR, HOUR, 1100)).toBeUndefined();
  expect(cache.get(base, point, HOUR, 4 * HOUR, 1100)).toBeUndefined();
  const copy = cache.get(base, point, 0, 3 * HOUR, 1100)!;
  copy.pop();
  expect(cache.get(base, point, 0, 3 * HOUR, 1100)).toHaveLength(4);
});
it('expires from the actual fetch time, not the last hit, and rejects backwards clocks', () => {
  const cache = new WeatherCache(10, 100, 100);
  cache.set(base, point, hours, 1000);
  expect(cache.get(base, point, 0, HOUR, 1099)).toBeDefined();
  expect(cache.get(base, point, 0, HOUR, 1100)).toBeUndefined();
  cache.set(base, point, hours, 2000);
  expect(cache.get(base, point, 0, HOUR, 1999)).toBeUndefined();
});
it('bounds points and hourly cells, preserving recently accessed entries', () => {
  const cache = new WeatherCache(2, 8);
  const b = { ...point, coord: [11, 21] as [number, number] },
    c = { ...point, coord: [12, 22] as [number, number] };
  cache.set(base, point, hours, 1000);
  cache.set(base, b, hours, 1000);
  expect(cache.get(base, point, 0, HOUR, 1001)).toBeDefined();
  cache.set(base, c, hours, 1002);
  expect(cache.get(base, b, 0, HOUR, 1003)).toBeUndefined();
  cache.set(base, point, hours.slice(0, 2), 1004);
  expect(cache.get(base, point, 0, HOUR, 1005)).toHaveLength(2);
  const small = new WeatherCache(10, 5);
  small.set(base, point, hours, 1000);
  small.set(base, b, hours, 1001);
  expect(small.get(base, point, 0, HOUR, 1002)).toBeUndefined();
  small.set(base, c, [...hours, ...hours], 1003);
  expect(small.get(base, c, 0, HOUR, 1004)).toBeUndefined();
});
