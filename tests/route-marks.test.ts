import { describe, expect, it } from 'vitest';
import type { Coord } from '../src/core';
import {
  arrowStops,
  offsetPath,
  repeatedRanges,
  splitByRepeat,
} from '../src/route-marks';

// About 111.2 m per 0.001°; tracks along the equator or the prime meridian.
const line = (from: number, to: number, step = 0.0005): Coord[] => {
  const n = Math.round(Math.abs(to - from) / step);
  return Array.from({ length: n + 1 }, (_, i) => [
    0,
    from + ((to - from) * i) / n,
  ]);
};

describe('repeated stretches', () => {
  it('marks both passes of an out-and-back, from the start to the turn', () => {
    // 2 km east, then back west on the same road.
    const track = [...line(0, 0.018), ...line(0.018, 0).slice(1)];
    const ranges = repeatedRanges([track]);
    expect(ranges.length).toBe(2);
    const [outbound, back] = ranges;
    expect(outbound.from).toBeLessThan(50);
    expect(outbound.to).toBeGreaterThan(1700);
    expect(back.to).toBeGreaterThan(3900);
    // Near the turn the passes are within 200 m of each other along the track.
    expect(outbound.to).toBeLessThan(2000);
  });

  it('ignores a square loop and a figure-eight crossing', () => {
    const d = 0.009; // about 1 km
    const square: Coord[] = [
      [0, 0],
      [0, d],
      [d, d],
      [d, 0],
      [0, 0],
    ];
    expect(repeatedRanges([square])).toEqual([]);
    const eight: Coord[] = [
      [0, 0],
      [d, d],
      [d, 0],
      [0, d],
      [0, 0],
    ];
    expect(repeatedRanges([eight])).toEqual([]);
  });

  it('keeps parallel roads more than 20 m apart separate', () => {
    // 40 m apart (0.00036°), opposite directions.
    const there = line(0, 0.018);
    const back = line(0.018, 0).map(([, lon]): Coord => [0.00036, lon]);
    expect(repeatedRanges([[...there, ...back]])).toEqual([]);
  });

  it('handles separate GPX segments and empty input', () => {
    const ranges = repeatedRanges([line(0, 0.018), line(0.018, 0)]);
    expect(ranges.length).toBe(2);
    expect(repeatedRanges([])).toEqual([]);
  });
});

describe('drawing helpers', () => {
  const identity = {
    project: ([y, x]: Coord) => ({ x, y }),
    unproject: ({ x, y }: { x: number; y: number }): Coord => [y, x],
  };

  it('offsets opposite passes to opposite sides (right of travel, y down)', () => {
    const east = offsetPath(
      [
        [0, 0],
        [0, 10],
      ],
      identity.project,
      identity.unproject,
      4,
    );
    const west = offsetPath(
      [
        [0, 10],
        [0, 0],
      ],
      identity.project,
      identity.unproject,
      4,
    );
    expect(east.map(([y]) => y)).toEqual([4, 4]);
    expect(west.map(([y]) => y)).toEqual([-4, -4]);
  });

  it('splits coloring ranges at repeated boundaries', () => {
    expect(
      splitByRepeat(
        [{ from: 0, to: 100, kind: 'day' }],
        [{ from: 30, to: 60, kind: 'repeated', repeated: true }],
      ),
    ).toEqual([
      { from: 0, to: 30, kind: 'day', repeated: false },
      { from: 30, to: 60, kind: 'day', repeated: true },
      { from: 60, to: 100, kind: 'day', repeated: false },
    ]);
  });

  it('spaces arrow stops evenly from half a step in', () => {
    expect(arrowStops(1000, 400)).toEqual([200, 600]);
    expect(arrowStops(0, 100)).toEqual([]);
    expect(arrowStops(100, 0)).toEqual([]);
  });
});
