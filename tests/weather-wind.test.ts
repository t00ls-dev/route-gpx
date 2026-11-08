import { expect, it } from 'vitest';
import {
  bearingBetween,
  windRelation,
  windStrength,
  windFlowDirection,
} from '../src/weather-wind';
import { meters, type Route } from '../src/core';
import { sampleRoute } from '../src/weather';

it.each([
  [[1, 0], 0],
  [[0, 1], 90],
  [[-1, 0], 180],
  [[0, -1], 270],
] as const)('calculates travel bearing toward %s', (destination, expected) => {
  expect(bearingBetween([0, 0], [...destination])).toBeCloseTo(expected);
});
it('handles the antimeridian and undefined headings without inventing a direction', () => {
  expect(bearingBetween([0, 179], [0, -179])).toBeCloseTo(90);
  expect(bearingBetween([0, -179], [0, 179])).toBeCloseTo(270);
  expect(bearingBetween([0, 0], [0, 0])).toBeNull();
  expect(bearingBetween([0, 0], [0, 180])).toBeNull();
});
it.each([
  [90, 90, 'Headwind'],
  [270, 90, 'Tailwind'],
  [0, 90, 'Crosswind'],
  [180, 90, 'Crosswind'],
  [350, 10, 'Headwind'],
  [360, 0, 'Headwind'],
  [45, 0, 'Headwind'],
  [45.01, 0, 'Crosswind'],
  [134.99, 0, 'Crosswind'],
  [135, 0, 'Tailwind'],
  [315, 0, 'Headwind'],
  [225, 0, 'Tailwind'],
])(
  'compares wind FROM %s° against travel toward %s°',
  (from, heading, expected) => {
    expect(windRelation(20, Number(from), Number(heading))).toBe(expected);
  },
);
it('distinguishes calm, unknown speed and unknown direction', () => {
  expect(windRelation(0.99, null, null)).toBe('Calm wind');
  expect(windRelation(1, 0, 0)).toBe('Headwind');
  for (const speed of [null, NaN, -1])
    expect(windRelation(speed, 0, 0)).toBe('Wind unavailable');
  for (const direction of [null, NaN, -1, 361])
    expect(windRelation(20, direction, 0)).toBe('Wind direction unavailable');
  expect(windRelation(20, 90, undefined)).toBe('Wind direction unavailable');
});
it('uses the outgoing edge at bends and the incoming edge at the destination, including reversed tracks', () => {
  const route: Route = {
    segments: [
      [
        [0, 0],
        [0, 0.1],
        [0.1, 0.1],
      ],
    ],
    distance: 0,
    duration: null,
    provider: 'GPX',
    steps: [],
  };
  const controls = [
    { name: 'A', coord: [0, 0] as [number, number] },
    { name: 'Bend', coord: [0, 0.1] as [number, number] },
    { name: 'B', coord: [0.1, 0.1] as [number, number] },
  ];
  const samples = sampleRoute(route, controls);
  expect(samples[0].bearing).toBeCloseTo(90);
  expect(samples.find((p) => p.name === 'Bend')!.bearing).toBeCloseTo(0);
  expect(samples.at(-1)!.bearing).toBeCloseTo(0);
  const reversed = sampleRoute(
    { ...route, segments: [route.segments[0].slice().reverse()] },
    controls.slice().reverse(),
  );
  expect(reversed[0].bearing).toBeCloseTo(180);
  expect(reversed.at(-1)!.bearing).toBeCloseTo(270);
});
it('never derives heading from the gap between GPX segments or from duplicate points', () => {
  const distance = meters([0, 0], [0, 0.1]);
  const route: Route = {
    segments: [
      [
        [0, 0],
        [0, 0],
        [0, 0.1],
      ],
      [
        [10, 10],
        [10.1, 10],
      ],
    ],
    distance: 0,
    duration: null,
    provider: 'GPX',
    steps: [],
  };
  const samples = sampleRoute(route, [
    { name: 'A', coord: [0, 0] },
    { name: 'End of segment', coord: [0, 0.1] },
    { name: 'B', coord: [10.1, 10] },
  ]);
  const boundary = samples.find((p) => Math.abs(p.distance - distance) < 0.01)!;
  expect(boundary.coord[1]).toBeCloseTo(0.1);
  expect(boundary.bearing).toBeCloseTo(90);
  expect(samples.at(-1)!.bearing).toBeCloseTo(0);
  expect(
    sampleRoute(
      {
        ...route,
        segments: [
          [
            [0, 0],
            [0, 0],
          ],
        ],
      },
      [],
    )[0].bearing,
  ).toBeNull();
});

it.each([
  [0, 'calm'],
  [0.99, 'calm'],
  [1, 'light'],
  [19.9, 'light'],
  [20, 'moderate'],
  [38.9, 'moderate'],
  [39, 'strong'],
  [61.9, 'strong'],
  [62, 'very-strong'],
  [120, 'very-strong'],
] as const)('classifies wind strength at %s km/h', (speed, level) =>
  expect(windStrength(speed).level).toBe(level),
);
it('does not classify unavailable or invalid wind speed', () => {
  for (const speed of [null, NaN, -1])
    expect(windStrength(speed).level).toBe('unknown');
});
it.each([
  [0, 180, 'South'],
  [90, 270, 'West'],
  [180, 0, 'North'],
  [270, 90, 'East'],
  [360, 180, 'South'],
  [45, 225, 'South-west'],
] as const)('draws wind FROM %s toward %s', (from, degrees, compass) =>
  expect(windFlowDirection(from)).toEqual({ degrees, compass }),
);
it('does not invent a flow direction for missing or invalid data', () => {
  for (const direction of [null, NaN, -1, 361])
    expect(windFlowDirection(direction)).toBeNull();
});
