import { describe, expect, it } from 'vitest';
import type { Coord } from '../src/core';
import {
  indexTrack,
  locateOnTrack,
  pointAtDistance,
} from '../src/track-position';

// About 111.2 m per 0.001° of latitude; along the equator also per 0.001° of longitude.
const M = 111.195;
const east = (n: number, step = 0.001): Coord[] =>
  Array.from({ length: n + 1 }, (_, i) => [0, i * step]);

describe('locate a position on the track', () => {
  const straight = indexTrack([east(10)]); // about 1.1 km along the equator

  it('projects onto the edge, not only the nearest vertex', () => {
    const p = locateOnTrack(straight, [0.001, 0.0045])!;
    expect(p.distance).toBeCloseTo(4.5 * M, 0);
    expect(p.remaining).toBeCloseTo(5.5 * M, 0);
    expect(p.offTrack).toBeCloseTo(M, 0);
    expect(p.bearing).toBeCloseTo(90, 5);
    expect(p.coord[0]).toBeCloseTo(0, 9);
    expect(p.coord[1]).toBeCloseTo(0.0045, 9);
    expect(p.segment).toBe(0);
  });

  it('clamps positions beyond the ends to the start and the destination', () => {
    expect(locateOnTrack(straight, [0, -0.002])).toMatchObject({
      distance: 0,
      coord: [0, 0],
    });
    const after = locateOnTrack(straight, [0, 0.013])!;
    expect(after.remaining).toBe(0);
    expect(after.offTrack).toBeCloseTo(3 * M, 0);
  });

  it('returns null for an empty track', () => {
    expect(locateOnTrack(indexTrack([]), [0, 0])).toBeNull();
    expect(locateOnTrack(indexTrack([[[0, 0]]]), [0, 0])).toBeNull();
  });
});

describe('repeated passes', () => {
  // Out and back along the same road: 1 km east, then 1 km west.
  const out = east(10);
  const back = out.slice(0, -1).reverse();
  const outAndBack = indexTrack([[...out, ...back]]);
  const total = 20 * M;

  it('without progress, picks the first of equally close passes', () => {
    const p = locateOnTrack(outAndBack, [0, 0.003])!;
    expect(p.distance).toBeCloseTo(3 * M, 0);
    expect(p.bearing).toBeCloseTo(90, 5);
  });

  it('with progress past the turn, picks the return pass', () => {
    const p = locateOnTrack(outAndBack, [0, 0.003], { progress: 12 * M })!;
    expect(p.distance).toBeCloseTo(17 * M, 0);
    expect(p.remaining).toBeCloseTo(total - 17 * M, 0);
    expect(p.bearing).toBeCloseTo(270, 5);
  });

  it('tolerates GPS jitter slightly behind the progress', () => {
    const p = locateOnTrack(outAndBack, [0, 0.0029], {
      progress: 3 * M,
      backtrack: 50,
    })!;
    expect(p.distance).toBeCloseTo(2.9 * M, 0);
  });

  it('keeps the closest pass when the one ahead is much farther', () => {
    // A loop: east 1 km, north 1 km, west 1 km, back south to the start.
    const loop = indexTrack([
      [
        ...east(10),
        ...Array.from({ length: 10 }, (_, i): Coord => [(i + 1) * 0.001, 0.01]),
        ...Array.from({ length: 10 }, (_, i): Coord => [
          0.01,
          0.01 - (i + 1) * 0.001,
        ]),
        ...Array.from({ length: 10 }, (_, i): Coord => [
          0.01 - (i + 1) * 0.001,
          0,
        ]),
      ],
    ]);
    // Near the first edge; progress already on the north side of the loop.
    const p = locateOnTrack(loop, [0.0002, 0.005], { progress: 25 * M })!;
    expect(p.distance).toBeCloseTo(5 * M, 0);
    expect(p.offTrack).toBeLessThan(30);
  });
});

describe('segment gaps', () => {
  // Two segments with a 500 m gap between them that was never travelled.
  const split = indexTrack([
    east(5),
    east(5).map(([, lon]) => [0, lon + 0.01]),
  ]);

  it('measures only travelled distance and never projects onto the gap', () => {
    expect(split.total).toBeCloseTo(10 * M, 0);
    const inGap = locateOnTrack(split, [0, 0.0075])!;
    // Nearest real point is the end of the first segment or the start of the
    // second, both 250 m away; the earlier one wins on a tie.
    expect(inGap.offTrack).toBeCloseTo(2.5 * M, 0);
    expect(inGap.distance).toBeCloseTo(5 * M, 0);
    expect(inGap.segment).toBe(0);
    const second = locateOnTrack(split, [0.0002, 0.012])!;
    expect(second.segment).toBe(1);
    expect(second.distance).toBeCloseTo(7 * M, 0);
  });
});

it('locates on a 10,000-point track fast enough for one update per second', () => {
  const track = indexTrack([
    Array.from({ length: 10_000 }, (_, i): Coord => [
      Math.sin(i / 50) * 0.01,
      i * 0.0005,
    ]),
  ]);
  const started = performance.now();
  let progress = 0;
  for (let i = 0; i < 200; i++)
    progress = locateOnTrack(track, [0.001, i * 0.02], { progress })!.distance;
  const perUpdate = (performance.now() - started) / 200;
  // Generous bound for slow CI machines; a phone needs far less than 1 s.
  expect(perUpdate).toBeLessThan(50);
  expect(progress).toBeGreaterThan(0);
});

describe('point at a distance', () => {
  const straight = indexTrack([east(10)]);

  it('interpolates along the track and clamps beyond the ends', () => {
    const middle = pointAtDistance(straight, 4.5 * M)!;
    expect(middle.coord[0]).toBeCloseTo(0, 9);
    expect(middle.coord[1]).toBeCloseTo(0.0045, 6);
    expect(middle.bearing).toBeCloseTo(90, 5);
    expect(pointAtDistance(straight, -5)!.coord).toEqual([0, 0]);
    expect(pointAtDistance(straight, 1e9)!.coord[1]).toBeCloseTo(0.01, 9);
    expect(pointAtDistance(indexTrack([]), 0)).toBeNull();
  });

  it('round-trips with locateOnTrack', () => {
    for (const d of [0, 123, 555.5, 1000]) {
      const point = pointAtDistance(straight, d)!;
      expect(locateOnTrack(straight, point.coord)!.distance).toBeCloseTo(d, 3);
    }
  });

  it('crosses a GPX gap by jumping to the next segment start', () => {
    const split = indexTrack([
      east(5),
      east(5).map(([, lon]): Coord => [0, lon + 0.01]),
    ]);
    const before = pointAtDistance(split, 5 * M - 1)!;
    expect(before.segment).toBe(0);
    expect(before.coord[1]).toBeLessThan(0.0051);
    const after = pointAtDistance(split, 5 * M + 1)!;
    expect(after.segment).toBe(1);
    expect(after.coord[1]).toBeGreaterThan(0.01);
  });

  it('keeps edges across the antimeridian local', () => {
    const wrap = indexTrack([
      [
        [0, 179.999],
        [0, -179.999],
      ],
    ]);
    const middle = pointAtDistance(wrap, wrap.total / 2)!;
    expect(Math.abs(middle.coord[1])).toBeCloseTo(180, 6);
  });
});
