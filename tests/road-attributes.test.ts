import { describe, expect, it } from 'vitest';
import { meters, type Coord } from '../src/core';
import {
  attributePlan,
  edgeRanges,
  encodePolyline,
  MAX_PIECE,
  parseTraceAttributes,
} from '../src/road-attributes';
import { decodePolyline } from '../src/services';
import { sectionsToCheck, surfaceRanges, surfaceTotals } from '../src/surface';

/** Points every 0.01° of longitude on the equator (about 1.1 km apart). */
const east = (n: number, offset = 0): Coord[] =>
  Array.from({ length: n + 1 }, (_, i) => [0, offset + i * 0.01]);
const length = (track: Coord[]) =>
  track.slice(1).reduce((sum, c, i) => sum + meters(track[i], c), 0);

describe('attribute plan', () => {
  it('keeps short routes in one piece with exact along-track distances', () => {
    const track = east(10);
    const plan = attributePlan([track])!;
    expect(plan).toHaveLength(1);
    expect(plan[0].coords[0]).toEqual([0, 0]);
    expect(plan[0].coords.at(-1)![1]).toBeCloseTo(0.1, 9);
    expect(plan[0].at.at(-1)).toBeCloseTo(length(track), 3);
  });
  it('splits legs over 190 km evenly and restarts at route points', () => {
    const track = east(400); // about 445 km
    const total = length(track);
    const plan = attributePlan([track], [0, 100_000, total])!;
    // 100 km, then 345 km split in two pieces of about 172 km.
    expect(
      plan.map((p) => Math.round((p.at.at(-1)! - p.at[0]) / 1000)),
    ).toEqual([100, 172, 172]);
    for (const piece of plan)
      expect(piece.at.at(-1)! - piece.at[0]).toBeLessThanOrEqual(MAX_PIECE);
    // Moving the end does not change the first leg's piece.
    const shorter = attributePlan([east(390)], [0, 100_000])!;
    expect(shorter[0]).toEqual(plan[0]);
  });
  it('groups the legs of a route with many stops into one piece', () => {
    // About 89 km with a route point every 4 km, and one 40 m before the end.
    const track = east(80);
    const total = length(track);
    const legs = [
      ...Array.from({ length: 23 }, (_, i) => i * 4000),
      total - 40,
      total,
    ];
    const plan = attributePlan([track], legs)!;
    expect(plan).toHaveLength(1);
    expect(plan[0].at.at(-1)).toBeCloseTo(total, 3);
  });
  it('closes a piece at the last route point that fits', () => {
    const track = east(300); // about 334 km
    const total = length(track);
    const plan = attributePlan([track], [0, 150_000, 180_000, 250_000, total])!;
    expect(
      plan.map((p) => [
        Math.round(p.at[0] / 1000),
        Math.round(p.at.at(-1)! / 1000),
      ]),
    ).toEqual([
      [0, 180],
      [180, Math.round(total / 1000)],
    ]);
  });
  it('never crosses a GPX segment gap', () => {
    const plan = attributePlan([east(5), east(5, 1)])!;
    expect(plan).toHaveLength(2);
    expect(plan[1].coords[0]).toEqual([0, 1]);
    expect(plan[1].at[0]).toBeCloseTo(length(east(5)), 3);
  });
  it('has no plan for routes needing more than ten requests', () => {
    expect(attributePlan([east(1800)])).toBeNull();
  });
  it('thins dense tracks to at most about 4,000 points per piece', () => {
    const dense: Coord[] = Array.from({ length: 20001 }, (_, i) => [
      0,
      i * 0.00001,
    ]);
    const [piece] = attributePlan([dense])!;
    expect(piece.coords.length).toBeLessThanOrEqual(4001);
    for (let i = 1; i < piece.at.length; i++)
      expect(piece.at[i]).toBeGreaterThan(piece.at[i - 1]);
  });
});

describe('polyline encoding', () => {
  it('round-trips with the decoder at 6 decimals', () => {
    const coords: Coord[] = [
      [-22.906818, -43.172958],
      [-22.903338, -43.176193],
      [51.5, -0.12],
      [0, 179.999999],
    ];
    expect(decodePolyline(encodePolyline(coords))).toEqual(coords);
  });
});

describe('trace attributes response', () => {
  const ok = {
    edges: [
      { length: 1, surface: 'paved_smooth' },
      { length: 2, surface: 'something_new' },
    ],
    matched_points: [
      { type: 'matched', edge_index: 0, distance_along_edge: 0 },
      { type: 'unmatched' },
      { type: 'interpolated', edge_index: 1, distance_along_edge: 1 },
    ],
  };
  it('keeps known surfaces and drops unknown values', () => {
    const parsed = parseTraceAttributes(ok, 3);
    expect(parsed.edges).toEqual([
      { length: 1000, surface: 'paved_smooth' },
      { length: 2000 },
    ]);
    expect(parsed.matched).toEqual([
      { edge: 0, along: 0 },
      null,
      { edge: 1, along: 1 },
    ]);
  });
  it.each([
    ['no edges', { matched_points: [] }],
    [
      'wrong point count',
      { ...ok, matched_points: ok.matched_points.slice(1) },
    ],
    ['negative length', { ...ok, edges: [{ length: -1 }] }],
    [
      'edge index out of range',
      {
        ...ok,
        matched_points: [
          { type: 'matched', edge_index: 5, distance_along_edge: 0 },
          { type: 'unmatched' },
          { type: 'unmatched' },
        ],
      },
    ],
    [
      'fraction over 1',
      {
        ...ok,
        matched_points: [
          { type: 'matched', edge_index: 0, distance_along_edge: 2 },
          { type: 'unmatched' },
          { type: 'unmatched' },
        ],
      },
    ],
  ])('rejects %s', (_, data) => {
    expect(() => parseTraceAttributes(data, 3)).toThrow();
  });
});

describe('edges along the route', () => {
  it('places edges between anchors by their along-track distances', () => {
    // The matched path is 10% longer than the route (a noisy track): edge
    // ends are scaled onto the route's own distances.
    const piece = { coords: east(2), at: [0, 1000, 2000] };
    const ranges = edgeRanges(piece, {
      edges: [
        { length: 1100, surface: 'paved' },
        { length: 1100, surface: 'gravel' },
      ],
      matched: [
        { edge: 0, along: 0 },
        { edge: 1, along: 0 },
        { edge: 1, along: 1 },
      ],
    });
    expect(ranges.map((r) => [r.from, r.to, r.edge.surface])).toEqual([
      [0, 1000, 'paved'],
      [1000, 2000, 'gravel'],
    ]);
  });
  it('leaves the stretch after an unmatched point without edges', () => {
    const piece = { coords: east(3), at: [0, 1000, 2000, 3000] };
    const ranges = edgeRanges(piece, {
      edges: [{ length: 1000 }, { length: 1000 }],
      matched: [{ edge: 0, along: 0 }, { edge: 0, along: 1 }, null, null],
    });
    expect(ranges.map((r) => [r.from, r.to])).toEqual([[0, 1000]]);
  });
});

describe('surface along the route', () => {
  const edge = (
    from: number,
    to: number,
    surface?: 'paved' | 'gravel' | 'dirt' | 'path',
  ) => ({
    from,
    to,
    edge: { length: to - from, ...(surface ? { surface } : {}) },
  });
  it('fills gaps as unknown and merges neighbors of one kind', () => {
    const ranges = surfaceRanges(
      [
        edge(0, 500, 'paved'),
        edge(500, 900, 'paved'),
        edge(1500, 1800, 'dirt'),
        edge(1800, 2000, 'path'),
      ],
      2500,
    );
    expect(ranges).toEqual([
      { from: 0, to: 900, kind: 'paved' },
      { from: 900, to: 1500, kind: 'unknown' },
      { from: 1500, to: 2000, kind: 'unpaved' },
      { from: 2000, to: 2500, kind: 'unknown' },
    ]);
    expect(surfaceTotals(ranges)).toEqual([
      { kind: 'paved', label: 'Paved', length: 900 },
      { kind: 'unpaved', label: 'Unpaved', length: 500 },
      { kind: 'unknown', label: 'Unknown', length: 1100 },
    ]);
    expect(sectionsToCheck(ranges)).toEqual([
      { from: 1500, to: 2000, kind: 'unpaved' },
    ]);
  });
  it('keeps the first edge where pieces overlap and skips short stretches', () => {
    const ranges = surfaceRanges(
      [
        edge(0, 1000, 'paved'),
        edge(990, 1100, 'gravel'),
        edge(1100, 2000, 'paved'),
      ],
      2000,
    );
    expect(ranges.map((r) => r.kind)).toEqual(['paved', 'unpaved', 'paved']);
    expect(ranges[1]).toEqual({ from: 1000, to: 1100, kind: 'unpaved' });
    expect(sectionsToCheck(ranges)).toEqual([]);
  });
});
