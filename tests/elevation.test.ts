import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Coord } from '../src/core';
import { importGpx } from '../src/core';
import {
  cumulativeClimb,
  elevationStats,
  profileFromTrack,
  samplePlan,
  smoothProfile,
} from '../src/elevation';
import { elevationUrl, fetchElevations, parseElevation } from '../src/services';

const east = (n: number, offset = 0): Coord[] =>
  Array.from({ length: n + 1 }, (_, i) => [0, offset + i * 0.01]);

describe('sample plan', () => {
  it('samples every 100 m on short routes and caps long ones at about 300', () => {
    const short = samplePlan([east(1)]); // about 1.1 km
    expect(short.length).toBeGreaterThanOrEqual(12);
    expect(short.length).toBeLessThanOrEqual(13);
    expect(short[1].at - short[0].at).toBeCloseTo(100, 6);
    const long = samplePlan([east(100)]); // about 111 km
    expect(long.length).toBeLessThanOrEqual(302);
  });

  it('keeps both ends of every GPX segment and flags the gap', () => {
    const plan = samplePlan([east(1), east(1, 0.05)]);
    const gaps = plan.filter((p) => p.gap);
    expect(gaps).toHaveLength(1);
    const i = plan.indexOf(gaps[0]);
    expect(plan[i - 1].coord[1]).toBeCloseTo(0.01, 6);
    expect(gaps[0].coord[1]).toBeCloseTo(0.05, 6);
    expect(samplePlan([])).toEqual([]);
  });
});

describe('statistics', () => {
  it('weights the mean by distance and ignores terrain noise below 2 m', () => {
    const stats = elevationStats(
      [
        { at: 0, ele: 100 },
        { at: 100, ele: 101.5 }, // noise
        { at: 200, ele: 100 },
        { at: 1200, ele: 200 },
        { at: 1300, ele: 150 },
      ],
      'terrain',
    )!;
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(200);
    expect(stats.ascent).toBe(100);
    expect(stats.descent).toBe(50);
    // (100.75·100 + 100.75·100 + 150·1000 + 175·100) / 1300 m.
    expect(stats.mean).toBeCloseTo(144.35, 1);
    expect(elevationStats([], 'terrain')).toBeNull();
  });

  it('accumulates ascent and descent along the route, matching the totals', () => {
    const profile = [
      { at: 0, ele: 100 },
      { at: 100, ele: 101.5 },
      { at: 200, ele: 100 },
      { at: 1200, ele: 200 },
      { at: 1300, ele: 150 },
    ];
    expect(cumulativeClimb(profile, 'terrain')).toEqual([
      { ascent: 0, descent: 0 },
      { ascent: 0, descent: 0 },
      { ascent: 0, descent: 0 },
      { ascent: 100, descent: 0 },
      { ascent: 100, descent: 50 },
    ]);
    expect(cumulativeClimb([], 'terrain')).toEqual([]);
  });

  it('never climbs across a GPX segment gap', () => {
    const stats = elevationStats(
      [
        { at: 0, ele: 0 },
        { at: 100, ele: 10 },
        { at: 100, ele: 500, gap: true },
        { at: 200, ele: 510 },
      ],
      'terrain',
    )!;
    expect(stats.ascent).toBe(20);
    expect(stats.descent).toBe(0);
  });

  it('counts small recorded changes that terrain noise would hide', () => {
    const profile = [0, 1, 2, 3].map((i) => ({ at: i * 10, ele: i * 0.5 }));
    expect(elevationStats(profile, 'recorded')!.ascent).toBe(1.5);
    expect(elevationStats(profile, 'terrain')!.ascent).toBe(0);
  });

  it('removes terrain spikes with a distance median, never across gaps', () => {
    const terrain = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      at: i * 120,
      ele: i === 3 ? 140 : 100, // a tree or building
    }));
    expect(smoothProfile(terrain, 'terrain').map((p) => p.ele)).toEqual(
      Array(7).fill(100),
    );
    // Sparse samples still use their neighbors.
    const sparse = [0, 1, 2].map((i) => ({
      at: i * 1000,
      ele: [100, 140, 100][i],
    }));
    expect(smoothProfile(sparse, 'terrain')[1].ele).toBe(100);
    const split = smoothProfile(
      [
        { at: 0, ele: 0 },
        { at: 100, ele: 0 },
        { at: 100, ele: 500, gap: true },
        { at: 200, ele: 500 },
      ],
      'terrain',
    );
    expect(split.map((p) => p.ele)).toEqual([0, 0, 500, 500]);
    expect(split[2].gap).toBe(true);
  });

  it('removes isolated recorded spikes with a five-point median', () => {
    const recorded = [10, 10, 30, 10, 10].map((ele, i) => ({ at: i * 5, ele }));
    expect(smoothProfile(recorded, 'recorded').map((p) => p.ele)).toEqual([
      10, 10, 10, 10, 10,
    ]);
  });

  it('builds a local profile from recorded elevations, skipping missing ones', () => {
    const profile = profileFromTrack(
      [east(2), east(1, 0.1)],
      [
        [10, null, 30],
        [40, 50],
      ],
    );
    expect(profile.map((p) => p.ele)).toEqual([10, 30, 40, 50]);
    expect(profile[2].gap).toBe(true);
  });
});

describe('GPX elevations', () => {
  const gpx = (eles: (number | null)[]) =>
    `<gpx><trk><trkseg>${eles
      .map(
        (e, i) =>
          `<trkpt lat="0" lon="${i * 0.01}">${e === null ? '' : `<ele>${e}</ele>`}</trkpt>`,
      )
      .join('')}</trkseg></trk></gpx>`;

  it('returns recorded elevations when most points have one', () => {
    expect(importGpx(gpx([10, 20, 30, 40, 50])).elevations).toEqual([
      [10, 20, 30, 40, 50],
    ]);
    expect(importGpx(gpx([10, null, 30, 40, 50])).elevations).toEqual([
      [10, null, 30, 40, 50],
    ]);
  });

  it('ignores sparse or missing elevations', () => {
    expect(importGpx(gpx([10, null, null, 40, 50])).elevations).toBeUndefined();
    expect(importGpx(gpx([null, null])).elevations).toBeUndefined();
  });
});

describe('elevation service', () => {
  afterEach(() => vi.unstubAllGlobals());
  const coords: Coord[] = Array.from({ length: 150 }, (_, i) => [
    -22.9,
    -43.2 + i * 0.001,
  ]);

  it('builds rounded requests of at most 100 coordinates', () => {
    const url = new URL(
      elevationUrl('https://api.open-meteo.com', coords.slice(0, 2)),
    );
    expect(url.pathname).toBe('/v1/elevation');
    expect(url.searchParams.get('latitude')).toBe('-22.9000,-22.9000');
    expect(url.searchParams.get('longitude')).toBe('-43.2000,-43.1990');
    expect(() => elevationUrl('https://api.open-meteo.com', coords)).toThrow();
  });

  it('validates the response', () => {
    expect(parseElevation({ elevation: [1, null] }, 2)).toEqual([1, null]);
    for (const bad of [
      {},
      { elevation: [1] },
      { elevation: [1, 'x'] },
      { elevation: [1, 99999] },
    ])
      expect(() => parseElevation(bad, 2)).toThrow('invalid');
  });

  it('fetches in chunks without credentials and then serves the cache', async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      const count = new URL(url).searchParams
        .get('latitude')!
        .split(',').length;
      return new Response(
        JSON.stringify({
          elevation: Array.from({ length: count }, (_, i) => i),
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const values = await fetchElevations(
      'https://api.open-meteo.com',
      coords,
      controller.signal,
      () => true,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(values).toHaveLength(150);
    expect(values.every((v) => typeof v === 'number')).toBe(true);
    await fetchElevations(
      'https://api.open-meteo.com',
      coords,
      controller.signal,
      () => true,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
