import { afterEach, expect, it, vi } from 'vitest';
import { simplifyTrack, segmentDistanceSquared } from '../src/simplify';
import { shareFile } from '../src/share-gpx';
import { LongPress } from '../src/long-press';
import type { Coord } from '../src/core';
afterEach(() => vi.useRealTimers());
const project = ([lat, lon]: Coord) => ({ x: lon, y: lat });
it('simplifies within pixel tolerance, pins endpoints and waypoints without mutation', () => {
  const coords: Coord[] = Array.from({ length: 101 }, (_, i) => [
    Math.sin(i / 10),
    i,
  ]);
  const original = structuredClone(coords);
  const visual = simplifyTrack(coords, project, 0.2, [coords[50]]);
  expect(visual.length).toBeLessThan(coords.length);
  expect(visual[0]).toBe(coords[0]);
  expect(visual.at(-1)).toBe(coords.at(-1));
  expect(visual).toContain(coords[50]);
  for (let i = 1; i < visual.length; i++) {
    const first = coords.indexOf(visual[i - 1]),
      last = coords.indexOf(visual[i]);
    for (const coord of coords.slice(first, last + 1))
      expect(
        segmentDistanceSquared(
          project(coord),
          project(visual[i - 1]),
          project(visual[i]),
        ),
      ).toBeLessThanOrEqual(0.2 ** 2 + 1e-9);
  }
  const close = simplifyTrack(
    coords,
    (c) => ({ x: c[1] * 100, y: c[0] * 100 }),
    0.2,
  );
  expect(close.length).toBeGreaterThan(visual.length);
  expect(coords).toEqual(original);
});
it('chooses the first approved file MIME without changing the filename or bytes', () => {
  const canShare = vi.fn(
    (data: ShareData) => data.files?.[0].type === 'application/xml',
  );
  const file = shareFile('<gpx/>', 'custom.gpx', canShare)!;
  expect(file.type).toBe('application/xml');
  expect(file.name).toBe('custom.gpx');
  expect(file.size).toBe(6);
  expect(canShare).toHaveBeenCalledTimes(2);
  expect(shareFile('x', 'x.gpx', () => false)).toBeNull();
  expect(
    shareFile('x', 'x.gpx', () => {
      throw new Error();
    }),
  ).toBeNull();
});
it('long press requires 500 ms and cancels on movement or release', () => {
  vi.useFakeTimers();
  const open = vi.fn(),
    press = new LongPress(open);
  press.start(10, 10);
  vi.advanceTimersByTime(499);
  expect(open).not.toHaveBeenCalled();
  press.move(13, 12);
  vi.advanceTimersByTime(1);
  expect(open).toHaveBeenCalledTimes(1);
  press.start(10, 10);
  press.move(20, 10);
  vi.advanceTimersByTime(600);
  expect(open).toHaveBeenCalledTimes(1);
  press.start(10, 10);
  press.cancel();
  vi.advanceTimersByTime(600);
  expect(open).toHaveBeenCalledTimes(1);
});
