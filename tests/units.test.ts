import { expect, it } from 'vitest';
import { distanceLabel, shortDistanceLabel } from '../src/units';
import { defaults, decodeState, encodeState } from '../src/core';
it('converts metric to miles with consistent precision and locale', () => {
  expect(distanceLabel(1609.344, 'imperial')).toBe('1 mi');
  expect(distanceLabel(42000, 'imperial')).toBe('26.1 mi');
  expect(distanceLabel(42150, 'metric', 'pt-BR')).toBe('42,2 km');
  expect(shortDistanceLabel(100, 'imperial')).toBe('328 ft');
});
it('shares distance units in route links and rejects invalid units', () => {
  const state = defaults();
  state.units = 'imperial';
  expect(decodeState(encodeState(state)).units).toBe('imperial');
  const invalid = { ...state, units: 'invalid' };
  expect(() => decodeState(encodeState(invalid as typeof state))).toThrow();
});
