import { describe, expect, it } from 'vitest';
import { defaults, type Coord, type Route, type State } from '../src/core';
import { locatePoints, routeKeepingLegs, splitLegs } from '../src/track-legs';

const line = (n: number, lat = -22.9): Coord[] =>
  Array.from({ length: n }, (_, i) => [lat, -43.2 + i * 0.001] as Coord);
const imported = (segments: Coord[][]): Route => ({
  segments,
  steps: [],
  distance: 1,
  duration: null,
  provider: 'Imported GPX',
});
const stateFor = (points: Coord[]): State => ({
  ...defaults(),
  points: points.map((coord, i) => ({ name: `P${i}`, coord })),
});
const router = (calls: Coord[][]) => async (s: State) => {
  const coords = s.points.map((p) => p.coord!);
  calls.push(coords);
  return {
    segments: [coords],
    steps: [{ name: 'Road', ref: '', distance: 5, duration: 1 }],
    distance: 5,
    duration: 1,
    provider: 'OSRM',
    snapped: coords,
  } satisfies Route;
};

describe('track legs', () => {
  it('splits a track at its points and keeps segment gaps inside a leg', () => {
    const a = line(4),
      b = line(3, -23);
    const legs = splitLegs([a, b], [a[0], a[2], b[2]])!;
    expect(legs).toEqual([[a.slice(0, 3)], [a.slice(2), b]]);
  });
  it('rejects points that are not on the track or out of order', () => {
    const t = line(10);
    expect(splitLegs([t], [t[0], [-23.5, -43], t[9]])).toBeNull();
    expect(splitLegs([t], [t[0], t[8], t[3], t[9]])).toBeNull();
  });
  it('reroutes only the legs next to a moved point', async () => {
    const t = line(30);
    const points = [t[0], t[10], t[20], t[29]];
    const base = { route: imported([t]), points };
    const moved: Coord = [-22.95, -43.19];
    const calls: Coord[][] = [];
    const route = (await routeKeepingLegs(
      stateFor([t[0], moved, t[20], t[29]]),
      base,
      router(calls),
    ))!;
    expect(calls).toEqual([[t[0], moved, t[20]]]);
    expect(route.segments).toEqual([[t[0], moved, ...t.slice(20)]]);
    expect(route.provider).toBe('Imported GPX + OSRM');
    expect(route.duration).toBeNull();
    expect(route.steps).toHaveLength(1);
    expect(route.snapped).toHaveLength(4);
  });
  it('keeps a segment gap in kept legs and joins it in a rerouted one', async () => {
    const a = line(10),
      b = line(10, -23);
    const points = [a[0], a[5], b[5], b[9]];
    const base = { route: imported([a, b]), points };
    // Editing the destination reroutes only b5 → end; the gap leg is kept.
    const end: Coord = [-23.01, -43.19];
    const calls: Coord[][] = [];
    const kept = await routeKeepingLegs(
      stateFor([a[0], a[5], b[5], end]),
      base,
      router(calls),
    );
    expect(calls).toEqual([[b[5], end]]);
    expect(kept!.segments).toEqual([a, [...b.slice(0, 6), end]]);
    // Moving a5 reroutes a0 → moved → b5, so the router joins the gap.
    const moved: Coord = [-22.95, -43.195];
    const joined = await routeKeepingLegs(
      stateFor([a[0], moved, b[5], b[9]]),
      base,
      router([]),
    );
    expect(joined!.segments).toEqual([[a[0], moved, ...b.slice(5)]]);
  });
  it('keeps the exact track when nothing changed and needs no request', async () => {
    const t = line(30);
    const points = [t[0], t[15], t[29]];
    const calls: Coord[][] = [];
    const route = await routeKeepingLegs(
      stateFor(points),
      { route: imported([t]), points },
      router(calls),
    );
    expect(calls).toEqual([]);
    expect(route!.segments).toEqual([t]);
  });
  it('reuses rerouted legs on the next edit', async () => {
    const t = line(30);
    const points = [t[0], t[10], t[20], t[29]];
    const moved: Coord = [-22.95, -43.19];
    const first = (await routeKeepingLegs(
      stateFor([t[0], moved, t[20], t[29]]),
      { route: imported([t]), points },
      router([]),
    ))!;
    const calls: Coord[][] = [];
    const end: Coord = [-22.96, -43.17];
    await routeKeepingLegs(
      stateFor([t[0], moved, t[20], end]),
      { route: first, points: [t[0], moved, t[20], t[29]] },
      router(calls),
    );
    expect(calls).toEqual([[t[20], end]]);
  });
  it('matches points on repeated passes to the right pass, not the first', () => {
    // Out-and-back twice; each pass is a few metres apart, as GPS laps are.
    const pass = (lat: number, back = false) => {
      const p = line(100, lat);
      return back ? p.reverse() : p;
    };
    const flat = [
      ...pass(-22.9),
      ...pass(-22.90005, true),
      ...pass(-22.9001),
      ...pass(-22.90015, true),
    ];
    const indices = [0, 150, 230, 320, 399];
    expect(
      locatePoints(
        flat,
        indices.map((i) => flat[i]),
      ),
    ).toEqual(indices);
    // Out of order or off the track: no match.
    expect(locatePoints(flat, [flat[0], [-23.5, -43], flat[399]])).toBeNull();
  });
  it('joins legs across a removed stop without a request', async () => {
    const t = line(30);
    const points = [t[0], t[10], t[20], t[29]];
    const calls: Coord[][] = [];
    const route = await routeKeepingLegs(
      stateFor([t[0], t[20], t[29]]),
      { route: imported([t]), points },
      router(calls),
    );
    expect(calls).toEqual([]);
    expect(route!.segments).toEqual([t]);
  });
  it('reuses the imported track for reverse and round trip', async () => {
    const t = line(30);
    const points = [t[0], t[10], t[20], t[29]];
    const base = { route: imported([t]), points };
    const calls: Coord[][] = [];
    const back = await routeKeepingLegs(
      stateFor([...points].reverse()),
      base,
      router(calls),
    );
    expect(back!.segments).toEqual([[...t].reverse()]);
    const trip = await routeKeepingLegs(
      stateFor([...points, t[20], t[10], t[0]]),
      base,
      router(calls),
    );
    expect(trip!.segments).toEqual([[...t, ...[...t].reverse().slice(1)]]);
    expect(calls).toEqual([]);
  });
  it('never joins legs across a stop that is still in the route', async () => {
    const t = line(30);
    const points = [t[0], t[10], t[20], t[29]];
    const calls: Coord[][] = [];
    await routeKeepingLegs(
      stateFor([t[0], t[20], t[10], t[29]]),
      { route: imported([t]), points },
      router(calls),
    );
    expect(calls).toEqual([
      [t[0], t[20]],
      [t[10], t[29]],
    ]);
  });
  it('lets the caller route everything when no leg survives', async () => {
    const t = line(10);
    const result = await routeKeepingLegs(
      stateFor([t[0], [-22.95, -43.19]]),
      { route: imported([t]), points: [t[0], t[9]] },
      router([]),
    );
    expect(result).toBeNull();
  });
});
