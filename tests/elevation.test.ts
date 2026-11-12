import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Coord } from '../src/core';
import { importGpx, meters } from '../src/core';
import {
  cumulativeClimb,
  elevationStats,
  gradeRanges,
  profileFromTrack,
  samplePlan,
  smoothProfile,
} from '../src/elevation';
import {
  elevationUrl,
  fetchElevations,
  parseElevation,
  retryIn,
  countdown,
} from '../src/services';

const east = (n: number, offset = 0): Coord[] =>
  Array.from({ length: n + 1 }, (_, i) => [0, offset + i * 0.01]);

/** Along-track distances of points that are track vertices. */
const legsOf = (track: Coord[], points: Coord[]) => {
  const along = [0];
  for (let i = 1; i < track.length; i++)
    along.push(along[i - 1] + meters(track[i - 1], track[i]));
  return points.map(
    (p) => along[track.findIndex((t) => t[0] === p[0] && t[1] === p[1])],
  );
};

describe('sample plan', () => {
  it('samples every 100 m on short routes and caps long ones at about 300', () => {
    const short = samplePlan([east(1)]); // about 1.1 km
    expect(short.length).toBeGreaterThanOrEqual(12);
    expect(short.length).toBeLessThanOrEqual(13);
    expect(short[1].at - short[0].at).toBeCloseTo(100, 6);
    const long = samplePlan([east(100)]); // about 111 km
    expect(long.length).toBeLessThanOrEqual(301);
    expect(long.length).toBeGreaterThan(270);
    // The spacing comes from a fixed ladder: 100 m × 2^(k/8).
    const spacing = long[1].at - long[0].at;
    expect(Math.log2(spacing / 100) * 8).toBeCloseTo(
      Math.round(Math.log2(spacing / 100) * 8),
      6,
    );
  });

  it('keeps the samples of other legs identical after a point edit', () => {
    // Three legs; the edit moves only the middle route point.
    const leg = (from: Coord, to: Coord, n = 40): Coord[] =>
      Array.from({ length: n + 1 }, (_, i) => [
        from[0] + ((to[0] - from[0]) * i) / n,
        from[1] + ((to[1] - from[1]) * i) / n,
      ]);
    const a: Coord = [-22.9, -43.2],
      b: Coord = [-22.88, -43.15],
      c: Coord = [-22.86, -43.12],
      d: Coord = [-22.84, -43.05],
      moved: Coord = [-22.875, -43.16];
    const join = (...legs: Coord[][]) =>
      legs.flatMap((l, i) => (i ? l.slice(1) : l));
    const before = join(leg(a, b), leg(b, c), leg(c, d));
    const after = join(leg(a, moved), leg(moved, c), leg(c, d));
    const key = (p: { coord: Coord }) =>
      `${p.coord[0].toFixed(4)},${p.coord[1].toFixed(4)}`;
    const planBefore = samplePlan([before], legsOf(before, [a, b, c, d]));
    const planAfter = samplePlan([after], legsOf(after, [a, moved, c, d]));
    const old = new Set(planBefore.map(key));
    // First leg (a → …) changed shape too, so compare the untouched ones:
    // the last leg (c → d) keeps every sample.
    const cAt = planAfter.find((p) => key(p) === key({ coord: c }))!.at;
    const lastLeg = planAfter.filter((p) => p.at >= cAt);
    expect(lastLeg.length).toBeGreaterThan(20);
    expect(lastLeg.every((p) => old.has(key(p)))).toBe(true);
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

  it('says how long to wait when the shared budget or the server limits use', async () => {
    expect(retryIn(1)).toBe('Try again in 1s.');
    expect(retryIn(40_000)).toBe('Try again in 40s.');
    expect(retryIn(90_000)).toBe('Try again in 90s.');
    expect(retryIn(150_000)).toBe('Try again in 3 min.');
    expect(retryIn(2 * 3_600_000)).toBe('Try again in 2 h.');
    // The server refuses with Retry-After.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );
    await expect(
      fetchElevations(
        'https://api.open-meteo.com',
        [[10, 10]],
        new AbortController().signal,
        () => true,
      ),
    ).rejects.toMatchObject({ service: 'Elevation', wait: 30_000 });
    // The shared budget (599 coordinates a minute, 150 + 1 used above).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const count = new URL(url).searchParams
          .get('latitude')!
          .split(',').length;
        return new Response(
          JSON.stringify({ elevation: Array(count).fill(1) }),
        );
      }),
    );
    const many: Coord[] = Array.from({ length: 500 }, (_, i) => [
      10 + i * 0.001,
      20,
    ]);
    await expect(
      fetchElevations(
        'https://api.open-meteo.com',
        many,
        new AbortController().signal,
        () => true,
      ),
    ).rejects.toThrow(
      /^Elevation usage limit reached\. Try again in [1-6]?\ds\.$/,
    );
  }, 15000);

  it('counts down a second at a time, then finishes', () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    let done = false;
    countdown(
      3000,
      (n) => ticks.push(n),
      () => (done = true),
    );
    vi.advanceTimersByTime(3000);
    expect(ticks).toEqual([3, 2, 1]);
    expect(done).toBe(true);
    const cancel = countdown(
      5000,
      (n) => ticks.push(n),
      () => (done = false),
    );
    cancel();
    vi.advanceTimersByTime(6000);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});

describe('route coloring by grade', () => {
  // A straight profile at a constant grade, one point every 100 m.
  const slope = (grade: number, length = 3000, from = 0) =>
    Array.from({ length: length / 100 + 1 }, (_, i) => ({
      at: from + i * 100,
      ele: 100 + (grade / 100) * i * 100,
    }));
  const kinds = (grade: number) =>
    gradeRanges(slope(grade), 'terrain').map((r) => r.kind);
  it('classes each grade at the documented limits as one merged range', () => {
    expect(kinds(0)).toEqual(['flat']);
    expect(kinds(2.9)).toEqual(['flat']);
    expect(kinds(3)).toEqual(['up']);
    expect(kinds(7.9)).toEqual(['up']);
    expect(kinds(8)).toEqual(['steep-up']);
    expect(kinds(-3)).toEqual(['down']);
    expect(kinds(-8)).toEqual(['steep-down']);
    const [range] = gradeRanges(slope(5), 'terrain');
    expect(range).toEqual({ from: 0, to: 3000, kind: 'up' });
  });
  it('splits where the grade changes and never spans a segment gap', () => {
    // 3 km climbing at 6 %, then 3 km flat after a GPX segment gap.
    const up = slope(6);
    const flat = slope(0, 3000, 4000).map((p, i) =>
      i ? p : { ...p, gap: true },
    );
    const ranges = gradeRanges([...up, ...flat], 'recorded');
    expect(ranges.map((r) => r.kind)).toEqual(['up', 'flat']);
    expect(ranges[0].to).toBe(3000);
    expect(ranges[1].from).toBe(4000);
  });
  it('measures terrain grades over a longer window than recorded ones', () => {
    // A 200 m ramp of 10 % inside flat ground.
    const profile = Array.from({ length: 31 }, (_, i) => ({
      at: i * 100,
      ele: i < 15 ? 100 : i < 17 ? 100 + (i - 14) * 10 : 120,
    }));
    expect(
      gradeRanges(profile, 'recorded').some((r) => r.kind === 'steep-up'),
    ).toBe(true);
    // Over 500 m the same ramp averages under the steep limit.
    expect(
      gradeRanges(profile, 'terrain').some((r) => r.kind === 'steep-up'),
    ).toBe(false);
  });
});
