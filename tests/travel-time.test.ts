import { expect, it } from 'vitest';
import {
  travelTimeSeconds,
  speedInputBounds,
  snapSpeed,
  speedToKmh,
  speedFromKmh,
} from '../src/travel-time';
import { defaults, decodeState, encodeState } from '../src/core';
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
it('validates shared averages using the selected unit system', () => {
  for (const units of ['metric', 'imperial'] as const) {
    const bounds = speedInputBounds(units);
    for (const speed of [1, bounds.max]) {
      const s = defaults();
      s.units = units;
      s.averageSpeedKmh = speedToKmh(speed, units);
      expect(decodeState(encodeState(s)).averageSpeedKmh).toBeCloseTo(
        s.averageSpeedKmh,
      );
    }
    for (const speed of [0.5, bounds.max + 1, 500, NaN, Infinity]) {
      const s = defaults();
      s.units = units;
      s.averageSpeedKmh = speedToKmh(speed, units);
      expect(() => decodeState(encodeState(s))).toThrow();
    }
  }
});
it('snaps legacy fractional speeds to the nearest slider position', () => {
  const s = defaults();
  s.averageSpeedKmh = 61.5;
  expect(decodeState(encodeState(s)).averageSpeedKmh).toBe(60);
});
it('retains points in older links with out-of-range speeds', () => {
  const s = defaults();
  s.points = [
    { name: 'Start', coord: [-22.93, -43.23] },
    { name: 'End', coord: [-23.05, -43.53] },
  ];
  s.averageSpeedKmh = 500;
  const restored = decodeState(encodeState(s), true);
  expect(restored.points).toEqual(s.points);
  expect(restored.averageSpeedKmh).toBeUndefined();
});
