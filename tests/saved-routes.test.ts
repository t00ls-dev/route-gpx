import { expect, it } from 'vitest';
import { defaults, type Route } from '../src/core';
import {
  exportRouteBackup,
  parseRouteBackup,
  savedRouteKey,
  type SavedRoute,
} from '../src/saved-routes';
const route: Route = {
  segments: [
    [
      [-22.9, -43.1],
      [-23, -43.2],
    ],
  ],
  steps: [],
  distance: 2000,
  duration: 120,
  provider: 'Test',
};
function record(): SavedRoute {
  const state = defaults();
  state.name = 'Weekend';
  state.points = [
    { name: 'Start', coord: [-22.9, -43.1] },
    { name: 'End', coord: [-23, -43.2] },
  ];
  return {
    id: 'weekend',
    name: 'Weekend',
    state,
    route,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
it('roundtrips complete saved geometry, state and names in a portable backup', () => {
  expect(parseRouteBackup(exportRouteBackup([record()]))).toEqual([record()]);
});
it('imports backups with old steps and with maneuver details, rejecting invalid ones', () => {
  const old = record();
  old.route = {
    ...route,
    steps: [{ name: 'Road', ref: '', distance: 2000, duration: 120 }],
  };
  expect(parseRouteBackup(exportRouteBackup([old]))[0].route).toEqual(
    old.route,
  );
  const current = record();
  current.route = {
    ...route,
    steps: [
      {
        name: 'Road',
        ref: '',
        distance: 2000,
        duration: 120,
        kind: 'turn',
        modifier: 'left',
        at: [-22.9, -43.1],
      },
      {
        name: 'Ring',
        ref: '',
        distance: 0,
        duration: 0,
        kind: 'roundabout',
        exit: 3,
      },
    ],
  };
  expect(parseRouteBackup(exportRouteBackup([current]))[0].route).toEqual(
    current.route,
  );
  const broken = JSON.parse(exportRouteBackup([old, current]));
  broken.routes[1].route.steps[0].modifier = 'sideways';
  expect(() => parseRouteBackup(JSON.stringify(broken))).toThrow(
    'Invalid saved route geometry.',
  );
});
it('recognizes matching names without adding case or whitespace duplicates', () => {
  expect(savedRouteKey(' Weekend ')).toBe(savedRouteKey('WEEKEND'));
});
it('validates every imported record before allowing a batch import', () => {
  const invalid = {
    ...record(),
    route: {
      ...route,
      segments: [
        [
          [91, 0],
          [0, 0],
        ],
      ],
    },
  };
  expect(() =>
    parseRouteBackup(
      JSON.stringify({
        format: 'route-gpx-library',
        version: 1,
        routes: [record(), invalid],
      }),
    ),
  ).toThrow('geometry');
  expect(() => parseRouteBackup('{}')).toThrow();
});
