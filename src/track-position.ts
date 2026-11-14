import { meters, type Coord } from './core';
import { bearingBetween } from './weather-wind';

/**
 * Relates a position to the full-resolution route track, locally and without
 * network access: nearest point on the track (point to edge, not only to
 * vertices), distance travelled and remaining, distance off the route and the
 * local bearing. Edges exist only inside GPX segments, so nothing is projected
 * across a segment gap. Used by resuming, navigation and arrival estimates.
 */

interface Edge {
  a: Coord;
  b: Coord;
  /** Along-track distance at `a`, in meters. */
  from: number;
  length: number;
  segment: number;
}
export interface TrackIndex {
  edges: Edge[];
  /** Total along-track length in meters (segment gaps excluded). */
  total: number;
}
export interface TrackPosition {
  /** Projected point on the track. */
  coord: Coord;
  /** Along-track distance from the start, in meters. */
  distance: number;
  remaining: number;
  /** Distance from the position to the track, in meters. */
  offTrack: number;
  /** Direction of travel of the edge, degrees from north, or null if unknown. */
  bearing: number | null;
  segment: number;
}
export interface LocateOptions {
  /**
   * Last known along-track distance. Among passes about as close as the
   * nearest one, the first one ahead of it wins, so loops and out-and-back
   * tracks do not jump to the other pass.
   */
  progress?: number;
  /** How far behind the progress a candidate may be (GPS jitter), meters. */
  backtrack?: number;
}

/** Extra distance a farther pass may have and still count as "as close". */
const PASS_SLACK = 30;
const EARTH_RADIUS = 6371000;
const RAD = Math.PI / 180;
const longitudeDelta = (from: number, to: number) =>
  ((to - from + 540) % 360) - 180;

export function indexTrack(segments: Coord[][]): TrackIndex {
  const edges: Edge[] = [];
  let total = 0;
  segments.forEach((segment, s) => {
    for (let i = 1; i < segment.length; i++) {
      const length = meters(segment[i - 1], segment[i]);
      if (length <= 0) continue;
      edges.push({
        a: segment[i - 1],
        b: segment[i],
        from: total,
        length,
        segment: s,
      });
      total += length;
    }
  });
  return { edges, total };
}

/** Projection on one edge in a local planar frame centered on the position. */
function project(edge: Edge, [lat, lon]: Coord) {
  const scale = Math.cos(lat * RAD) * EARTH_RADIUS * RAD;
  const x = (c: Coord) => longitudeDelta(lon, c[1]) * scale,
    y = (c: Coord) => (c[0] - lat) * EARTH_RADIUS * RAD;
  const ax = x(edge.a),
    ay = y(edge.a),
    dx = x(edge.b) - ax,
    dy = y(edge.b) - ay;
  const squared = dx * dx + dy * dy;
  const t = squared
    ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squared))
    : 0;
  const px = ax + t * dx,
    py = ay + t * dy;
  return { t, offTrack: Math.hypot(px, py) };
}

export function locateOnTrack(
  index: TrackIndex,
  coord: Coord,
  options: LocateOptions = {},
): TrackPosition | null {
  if (!index.edges.length) return null;
  const projections = index.edges.map((edge) => ({
    edge,
    ...project(edge, coord),
  }));
  let best = projections[0];
  for (const p of projections) if (p.offTrack < best.offTrack) best = p;
  let chosen = best;
  if (options.progress !== undefined) {
    const floor = options.progress - (options.backtrack ?? 100);
    const along = (p: (typeof projections)[number]) =>
      p.edge.from + p.t * p.edge.length;
    let ahead: (typeof projections)[number] | undefined;
    for (const p of projections)
      if (
        p.offTrack <= best.offTrack + PASS_SLACK &&
        along(p) >= floor &&
        (!ahead || along(p) < along(ahead))
      )
        ahead = p;
    if (ahead) chosen = ahead;
  }
  const { edge, t, offTrack } = chosen;
  const distance = edge.from + t * edge.length;
  return {
    coord: [
      edge.a[0] + (edge.b[0] - edge.a[0]) * t,
      ((edge.a[1] + longitudeDelta(edge.a[1], edge.b[1]) * t + 540) % 360) -
        180,
    ],
    distance,
    remaining: Math.max(0, index.total - distance),
    offTrack,
    bearing: bearingBetween(edge.a, edge.b),
    segment: edge.segment,
  };
}

export interface TrackPoint {
  coord: Coord;
  bearing: number | null;
  segment: number;
}
/**
 * The point at an along-track distance (clamped to the track). At the end of a
 * GPX segment the next distance continues at the start of the next segment,
 * so a gap is crossed without inventing a path through it.
 */
export function pointAtDistance(
  index: TrackIndex,
  distance: number,
): TrackPoint | null {
  const { edges } = index;
  if (!edges.length) return null;
  const target = Math.max(0, Math.min(index.total, distance));
  // Binary search for the last edge starting at or before the target.
  let low = 0,
    high = edges.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (edges[middle].from <= target) low = middle;
    else high = middle - 1;
  }
  const edge = edges[low];
  const t = edge.length ? Math.min(1, (target - edge.from) / edge.length) : 0;
  return {
    coord: [
      edge.a[0] + (edge.b[0] - edge.a[0]) * t,
      ((edge.a[1] + longitudeDelta(edge.a[1], edge.b[1]) * t + 540) % 360) -
        180,
    ],
    bearing: bearingBetween(edge.a, edge.b),
    segment: edge.segment,
  };
}

/**
 * Track between two along-track distances, split at GPX segment gaps, for
 * highlighting a stretch (for example a climb) on the map.
 */
export function trackSlice(
  index: TrackIndex,
  from: number,
  to: number,
): Coord[][] {
  const start = pointAtDistance(index, from),
    end = pointAtDistance(index, to);
  if (!start || !end || to <= from) return [];
  const out: Coord[][] = [[start.coord]];
  let segment = start.segment;
  for (const edge of index.edges) {
    if (edge.from + edge.length <= from || edge.from >= to) continue;
    if (edge.segment !== segment) {
      out.push([edge.a]);
      segment = edge.segment;
    }
    if (edge.from + edge.length < to) out.at(-1)!.push(edge.b);
  }
  out.at(-1)!.push(end.coord);
  return out.filter((part) => part.length >= 2);
}

/**
 * Along-track distance of each route point, in order (points farther than
 * 200 m from the track are left out). Sampling that restarts at these points
 * keeps the samples of unchanged legs identical after an edit.
 */
export function legDistances(segments: Coord[][], points: Coord[]): number[] {
  const index = indexTrack(segments);
  let progress = 0;
  return points.flatMap((coord) => {
    const position = locateOnTrack(index, coord, { progress, backtrack: 0 });
    if (!position || position.offTrack > 200) return [];
    progress = position.distance;
    return [position.distance];
  });
}

/** Roads are about this much longer than the straight line (circuity). */
export const ROAD_DETOUR = 1.4;
/** How far ahead of the progress a rejoin point is looked for, meters. */
export const REJOIN_LOOKAHEAD = 10000;

export interface RejoinPoint {
  coord: Coord;
  /** Along-track distance of the point, meters (never behind the progress). */
  at: number;
  /** Straight-line distance from the position, meters. */
  straight: number;
  /** Direction from the position to the point, degrees from north. */
  bearing: number;
}
/**
 * Where to rejoin the route from a position off it: the point on the track
 * ahead of the progress (never behind it) that makes the trip shortest,
 * counting the way back as the straight line times `ROAD_DETOUR` plus the
 * route left from there. It does not know the roads; it is a hint.
 */
export function rejoinPoint(
  index: TrackIndex,
  coord: Coord,
  progress: number,
): RejoinPoint | null {
  let best: {
    coord: Coord;
    at: number;
    straight: number;
    cost: number;
  } | null = null;
  const consider = (point: Coord, at: number) => {
    const straight = meters(coord, point);
    const cost = ROAD_DETOUR * straight + (index.total - at);
    if (!best || cost < best.cost) best = { coord: point, at, straight, cost };
  };
  const along = (edge: Edge, t: number): Coord => [
    edge.a[0] + (edge.b[0] - edge.a[0]) * t,
    ((edge.a[1] + longitudeDelta(edge.a[1], edge.b[1]) * t + 540) % 360) - 180,
  ];
  for (const edge of index.edges) {
    const end = edge.from + edge.length;
    if (end < progress) continue;
    if (edge.from > progress + REJOIN_LOOKAHEAD) break;
    // The part of the edge at or ahead of the progress.
    const t0 = Math.max(0, (progress - edge.from) / edge.length);
    const { t } = project(edge, coord);
    consider(along(edge, t0), edge.from + t0 * edge.length);
    if (t > t0) consider(along(edge, t), edge.from + t * edge.length);
    consider(edge.b, end);
  }
  if (!best) return null;
  const chosen = best as { coord: Coord; at: number; straight: number };
  return {
    coord: chosen.coord,
    at: chosen.at,
    straight: chosen.straight,
    bearing: bearingBetween(coord, chosen.coord) ?? 0,
  };
}
