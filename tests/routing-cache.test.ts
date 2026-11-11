import { expect, it } from 'vitest';
import { RoutingCache } from '../src/routing-cache';
import { defaults, type Route, type State } from '../src/core';
const state: State = {
  ...defaults(),
  points: [
    { name: 'A', coord: [0, 0] },
    { name: 'B', coord: [0, 1] },
  ],
};
const route: Route = {
  segments: [
    [
      [0, 0],
      [0, 1],
    ],
  ],
  distance: 111195,
  duration: 1000,
  provider: 'OSRM',
  steps: [],
};
it('keys only routing inputs, retaining order, preference and providers', () => {
  const cache = new RoutingCache();
  cache.set(state, route, 1000);
  expect(
    cache.get(
      {
        ...state,
        name: 'Renamed',
        language: 'pt',
        departure: '2026-11-08T10:00:00.000Z',
        points: state.points.map((p) => ({ ...p, name: 'Other' })),
      },
      1001,
    ),
  ).toBe(route);
  expect(
    cache.get({ ...state, points: state.points.slice().reverse() }, 1001),
  ).toBeUndefined();
  expect(cache.get({ ...state, prefer: false }, 1001)).toBeUndefined();
  expect(
    cache.get({ ...state, osrm: 'https://other.test' }, 1001),
  ).toBeUndefined();
  expect(
    cache.get({ ...state, valhalla: 'https://other.test' }, 1001),
  ).toBeUndefined();
});
it('expires without extending freshness on hits and bounds recently used routes', () => {
  const cache = new RoutingCache(2, 100);
  const b = { ...state, prefer: false },
    c = { ...state, osrm: 'https://other.test' };
  cache.set(state, route, 1000);
  cache.set(b, route, 1001);
  cache.get(state, 1090);
  cache.set(c, route, 1091);
  expect(cache.get(b, 1092)).toBeUndefined();
  expect(cache.get(state, 1099)).toBe(route);
  expect(cache.get(state, 1100)).toBeUndefined();
  cache.set(state, route, 2000);
  expect(cache.get(state, 1999)).toBeUndefined();
});
