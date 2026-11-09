import { expect, it } from 'vitest';
import {
  travelTimeSeconds,
  speedInputBounds,
  snapSpeed,
  speedToKmh,
  speedFromKmh,
  storedSpeedKmh,
  rememberSpeedKmh,
  DEFAULT_SPEED_KMH,
} from '../src/travel-time';
import { defaults, decodeState, encodeState, encodeStateV1 } from '../src/core';
it('calculates trip time in both systems, including 130 mph', () => {
  expect(travelTimeSeconds(42000, 60)).toBeCloseTo(2520);
  expect(travelTimeSeconds(160934.4, speedToKmh(60, 'imperial'))).toBeCloseTo(
    6000,
  );
  expect(travelTimeSeconds(209214.72, speedToKmh(130, 'imperial'))).toBeCloseTo(
    3600,
  );
  expect(() => travelTimeSeconds(42000, 0)).toThrow();
});
it('uses rounded practical bounds for each unit system', () => {
  expect(speedInputBounds()).toEqual({ min: 1, max: 200 });
  expect(speedInputBounds('imperial')).toEqual({ min: 1, max: 130 });
  expect(snapSpeed(0)).toBe(1);
  expect(snapSpeed(6)).toBe(5);
  expect(snapSpeed(199)).toBe(200);
  expect(snapSpeed(500, 'imperial')).toBe(130);
  expect(snapSpeed(speedFromKmh(200, 'imperial'), 'imperial')).toBe(125);
});
it('remembers the average speed on the device, with a 60 km/h default', () => {
  localStorage.clear();
  expect(storedSpeedKmh()).toBe(DEFAULT_SPEED_KMH);
  rememberSpeedKmh(25);
  expect(storedSpeedKmh()).toBe(25);
  // 130 mph is valid even though it exceeds 200 km/h.
  rememberSpeedKmh(speedToKmh(130, 'imperial'));
  expect(storedSpeedKmh()).toBeCloseTo(209.21472);
  for (const invalid of ['0', '500', 'fast', '']) {
    localStorage.setItem('average-speed', invalid);
    expect(storedSpeedKmh()).toBe(DEFAULT_SPEED_KMH);
  }
  localStorage.clear();
});
it('keeps links free of the average speed', () => {
  const s = defaults();
  s.departure = '2026-11-08T09:00:00.000Z';
  // The former speed slot (index 5) stays 0 so later positions are unchanged.
  expect(decodeState(encodeState(s))).toEqual(s);
});
it('ignores any speed in older links without discarding their points', () => {
  const s = defaults();
  s.points = [
    { name: 'Start', coord: [-22.93, -43.23] },
    { name: 'End', coord: [-23.05, -43.53] },
  ];
  for (const averageSpeedKmh of [20, 61.5, 500, -1, 'fast']) {
    const legacy = encodeStateV1({ ...s, averageSpeedKmh } as typeof s);
    const restored = decodeState(legacy);
    expect(restored.points).toEqual(s.points);
    expect(restored).not.toHaveProperty('averageSpeedKmh');
  }
});
