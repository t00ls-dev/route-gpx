import { meters, type Coord } from './core';
import { indexTrack, pointAtDistance } from './track-position';

/**
 * Elevation profile along the route: sampling plan for the elevation service,
 * a local profile from recorded GPX elevations, and statistics. Pure; no DOM
 * or network.
 */

export interface ProfilePoint {
  /** Along-track distance in meters (GPX segment gaps excluded). */
  at: number;
  ele: number;
  /** Starts a new GPX segment: never draw or climb across the gap. */
  gap?: boolean;
}
export interface ElevationStats {
  min: number;
  max: number;
  mean: number;
  ascent: number;
  descent: number;
}

/** Terrain model samples or recorded GPS elevations: they need different filtering. */
export type ElevationSource = 'terrain' | 'recorded';

const MAX_SAMPLES = 300,
  /**
   * Median window for terrain samples, in meters. The 90 m surface model adds
   * trees, buildings and cell steps that look like short climbs; this window
   * was calibrated against recorded activities on hilly and rolling routes.
   */
  TERRAIN_WINDOW = 850,
  /** Median window for recorded GPS elevations, in points. */
  RECORDED_POINTS = 5;
/** Ascent/descent ignore changes smaller than this (noise), in meters. */
const THRESHOLD: Record<ElevationSource, number> = {
  terrain: 2,
  recorded: 0.3,
};

/** Smallest sample spacing, meters; larger ones grow by 2^(1/8) (about 9%). */
const MIN_SPACING = 100;

/**
 * Points to query: evenly spaced within each leg between route points, plus
 * leg and segment ends, at most about 300. The spacing comes from a fixed
 * ladder (100 m × 2^(k/8)), so a small edit keeps it; spacing restarts at each
 * route point, so editing one point leaves the samples of the other legs
 * identical and they come from the cache.
 *
 * `legs` are along-track distances of the route points (leg boundaries).
 */
export function samplePlan(
  segments: Coord[][],
  legs: number[] = [],
): { at: number; coord: Coord; gap: boolean }[] {
  const index = indexTrack(segments);
  if (!index.edges.length) return [];
  // Segment boundaries in along-track distance.
  const starts: number[] = [];
  let total = 0;
  for (const segment of segments) {
    let length = 0;
    for (let i = 1; i < segment.length; i++)
      length += meters(segment[i - 1], segment[i]);
    if (length > 0) starts.push(total);
    total += length;
  }
  const bounds = [
    ...new Set(
      [0, ...legs, ...starts, index.total]
        .filter((d) => d >= 0 && d <= index.total)
        .sort((a, b) => a - b),
    ),
  ];
  let spacing = MIN_SPACING;
  const count = (step: number) =>
    bounds
      .slice(1)
      .reduce((n, end, i) => n + Math.ceil((end - bounds[i]) / step), 1);
  for (let k = 1; count(spacing) > MAX_SAMPLES; k++)
    spacing = MIN_SPACING * 2 ** (k / 8);
  const marks = new Set<number>(bounds);
  bounds.slice(1).forEach((end, i) => {
    for (let at = bounds[i] + spacing; at < end - 1; at += spacing)
      marks.add(at);
  });
  // A segment's end equals the next segment's start in along-track distance;
  // sample just before it so the end of each segment is represented.
  for (const start of starts.slice(1)) marks.add(Math.max(0, start - 1e-6));
  return [...marks]
    .sort((a, b) => a - b)
    .map((at) => ({
      at,
      coord: pointAtDistance(index, at)!.coord,
      gap: starts.includes(at) && at > 0,
    }));
}

/** Profile from recorded vertex elevations (GPX `<ele>`), skipping gaps in data. */
export function profileFromTrack(
  segments: Coord[][],
  elevations: (number | null)[][],
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let total = 0;
  segments.forEach((segment, s) => {
    let first = true;
    segment.forEach((coord, i) => {
      if (i) total += meters(segment[i - 1], coord);
      const ele = elevations[s]?.[i];
      if (ele === null || ele === undefined) return;
      out.push({ at: total, ele, ...(first && s > 0 ? { gap: true } : {}) });
      first = false;
    });
  });
  return out;
}

/**
 * Median filter that removes isolated spikes, never across GPX segment gaps.
 * Terrain samples use a distance window (always including the neighbors);
 * recorded elevations use a window of points. Windows are symmetric and
 * shrink at segment ends, which keep their value.
 */
export function smoothProfile(
  profile: ProfilePoint[],
  source: ElevationSource,
): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let start = 0;
  for (let end = 1; end <= profile.length; end++) {
    if (end < profile.length && !profile[end].gap) continue;
    const part = profile.slice(start, end);
    part.forEach((p, i) => {
      // Window in points on each side, symmetric so the ends keep their value.
      let k: number;
      if (source === 'recorded') k = RECORDED_POINTS >> 1;
      else {
        let before = 0,
          after = 0;
        while (
          i - before > 0 &&
          p.at - part[i - before - 1].at <= TERRAIN_WINDOW / 2
        )
          before++;
        while (
          i + after < part.length - 1 &&
          part[i + after + 1].at - p.at <= TERRAIN_WINDOW / 2
        )
          after++;
        k = Math.max(1, Math.min(before, after));
      }
      k = Math.min(k, i, part.length - 1 - i);
      const from = i - k,
        to = i + k;
      const values = part
        .slice(from, to + 1)
        .map((q) => q.ele)
        .sort((a, b) => a - b);
      out.push({ ...p, ele: values[k] });
    });
    start = end;
  }
  return out;
}

/**
 * Ascent and descent accumulated up to each profile point, with the
 * source's hysteresis threshold and never across GPX segment gaps.
 */
export function cumulativeClimb(
  profile: ProfilePoint[],
  source: ElevationSource,
): { ascent: number; descent: number }[] {
  const threshold = THRESHOLD[source];
  let ascent = 0,
    descent = 0,
    anchor = profile[0]?.ele ?? 0;
  return profile.map((p, i) => {
    if (i === 0 || p.gap) anchor = p.ele;
    else if (p.ele - anchor >= threshold) {
      ascent += p.ele - anchor;
      anchor = p.ele;
    } else if (anchor - p.ele >= threshold) {
      descent += anchor - p.ele;
      anchor = p.ele;
    }
    return { ascent, descent };
  });
}

/** Statistics of a profile already passed through `smoothProfile`. */
export function elevationStats(
  profile: ProfilePoint[],
  source: ElevationSource,
): ElevationStats | null {
  if (!profile.length) return null;
  let min = Infinity,
    max = -Infinity,
    weighted = 0,
    length = 0;
  profile.forEach((p, i) => {
    min = Math.min(min, p.ele);
    max = Math.max(max, p.ele);
    if (i === 0 || p.gap) return;
    const prev = profile[i - 1];
    const d = p.at - prev.at;
    if (d > 0) {
      weighted += ((p.ele + prev.ele) / 2) * d;
      length += d;
    }
  });
  // Hysteresis: a climb or drop counts only once it exceeds the threshold.
  const { ascent, descent } = cumulativeClimb(profile, source).at(-1)!;
  return {
    min,
    max,
    mean: length ? weighted / length : profile[0].ele,
    ascent,
    descent,
  };
}
