import { expect, it } from 'vitest';
import {
  travelTimeSeconds,
  speedInputBounds,
  speedInputValue,
  speedToKmh,
  speedFromKmh,
} from '../src/travel-time';
import { defaults, decodeState, encodeState } from '../src/core';
it('estimates duration from route distance and average speed', () => {
  expect(travelTimeSeconds(42000, 60)).toBeCloseTo(2520);
  expect(travelTimeSeconds(160934.4, speedToKmh(60, 'imperial'))).toBeCloseTo(
    6000,
  );
  expect(speedFromKmh(speedToKmh(60, 'imperial'), 'imperial')).toBeCloseTo(60);
});
it('rejects zero speed and invalid shared speeds', () => {
  expect(() => travelTimeSeconds(42000, 0)).toThrow();
  const s = defaults();
  s.averageSpeedKmh = 60;
  expect(decodeState(encodeState(s)).averageSpeedKmh).toBe(60);
  s.averageSpeedKmh = -1;
  expect(() => decodeState(encodeState(s))).toThrow();
});

it('enforces the same physical 1–200 km/h range in shared routes and calculations', () => {
  for (const speed of [1, 200]) {
    const s = defaults();
    s.averageSpeedKmh = speed;
    expect(decodeState(encodeState(s)).averageSpeedKmh).toBe(speed);
    expect(travelTimeSeconds(1000, speed)).toBeGreaterThan(0);
  }
  for (const speed of [0.5, 200.01, 500, NaN, Infinity]) {
    const s = defaults();
    s.averageSpeedKmh = speed;
    expect(() => decodeState(encodeState(s))).toThrow();
    expect(() => travelTimeSeconds(1000, speed)).toThrow();
  }
});

it('converts field bounds to mph and keeps rounded boundary values valid', () => {
  const bounds = speedInputBounds('imperial');
  expect(bounds.min).toBeCloseTo(0.621371);
  expect(bounds.max).toBeCloseTo(124.274238);
  expect(speedInputValue(60, 'imperial')).toBe('37.28');
  for (const speed of [1, 200]) {
    const display = Number(speedInputValue(speed, 'imperial'));
    expect(display).toBeGreaterThanOrEqual(bounds.min);
    expect(display).toBeLessThanOrEqual(bounds.max);
  }
});
