import { expect, it } from 'vitest';
import { meters, type Coord } from '../src/core';
import { sliceByRanges } from '../src/route-overlays';

// About 111.2 m per 0.001° along the equator.
const east = (n: number, offset = 0): Coord[] =>
  Array.from({ length: n + 1 }, (_, i) => [0, offset + i * 0.001]);
const length = (coords: Coord[]) =>
  coords.slice(1).reduce((sum, c, i) => sum + meters(coords[i], c), 0);

it('splits the track at range boundaries, in route order', () => {
  const track = [east(10)];
  const total = length(track[0]);
  const slices = sliceByRanges(track, [
    { from: 0, to: 300, kind: 'day' },
    { from: 300, to: 700, kind: 'twilight' },
    { from: 700, to: total, kind: 'night' },
  ]);
  expect(slices.map((s) => s.kind)).toEqual(['day', 'twilight', 'night']);
  expect(length(slices[0].coords)).toBeCloseTo(300, 3);
  expect(length(slices[1].coords)).toBeCloseTo(400, 3);
  expect(length(slices[2].coords)).toBeCloseTo(total - 700, 3);
  // Boundaries are interpolated inside edges, and slices meet there.
  expect(slices[0].coords.at(-1)).toEqual(slices[1].coords[0]);
  expect(slices[0].coords.at(-1)![1]).toBeCloseTo(300 / 111195, 6);
});

it('keeps one slice for contiguous ranges of the same kind', () => {
  const slices = sliceByRanges(
    [east(4)],
    [
      { from: 0, to: 100, kind: 'day' },
      { from: 100, to: 300, kind: 'day' },
    ],
  );
  expect(slices).toHaveLength(1);
  expect(length(slices[0].coords)).toBeCloseTo(300, 3);
});

it('never draws across a GPX segment gap', () => {
  // Two 556 m segments 500 m apart; the gap adds no distance.
  const first = east(5),
    second = east(5, 0.01);
  const total = length(first) + length(second);
  const slices = sliceByRanges(
    [first, second],
    [{ from: 0, to: total, kind: 'night' }],
  );
  expect(slices).toHaveLength(2);
  expect(slices[0].coords.at(-1)![1]).toBeCloseTo(0.005, 9);
  expect(slices[1].coords[0][1]).toBeCloseTo(0.01, 9);
});

it('returns nothing without ranges or geometry', () => {
  expect(sliceByRanges([east(3)], [])).toEqual([]);
  expect(sliceByRanges([], [{ from: 0, to: 1, kind: 'day' }])).toEqual([]);
});
