import { expect, it } from 'vitest';
import {
  travelTimeSeconds,
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
