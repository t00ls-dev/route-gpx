import { meters, validCoord, type Coord } from './core';

/**
 * Road attributes along the route from Valhalla `/trace_attributes`: the
 * request plan, the polyline encoder, validation of the untrusted response
 * and the mapping of matched road edges back to along-track distances. Pure;
 * no DOM or network (the request lives in `src/services.ts`).
 */

/** The public Valhalla server refuses traces longer than 200 km. */
export const MAX_PIECE = 190_000;
/** Requests for one route; a longer route gets no attributes. */
export const MAX_PIECES = 10;
/** Points sent per piece at most; denser tracks are thinned evenly. */
const MAX_POINTS = 4000;
/** Smallest spacing between sent points, meters. */
const MIN_SPACING = 10;
/** Route points closer than this to a piece boundary start no new piece. */
const MIN_PIECE = 200;

/** Attributes asked for every consumer; new consumers add theirs here. */
export const EDGE_ATTRIBUTES = [
  'edge.length',
  'edge.surface',
  'edge.unpaved',
  'matched.edge_index',
  'matched.distance_along_edge',
  'matched.type',
] as const;

/** Valhalla's surface vocabulary, best to worst. */
export const SURFACES = [
  'paved_smooth',
  'paved',
  'paved_rough',
  'compacted',
  'dirt',
  'gravel',
  'path',
  'impassable',
] as const;
export type Surface = (typeof SURFACES)[number];

export interface AttributePiece {
  /** Points sent, in order, with their along-track distances in meters. */
  coords: Coord[];
  at: number[];
}
export interface EdgeAttributes {
  /** Meters. */
  length: number;
  surface?: Surface;
}
export interface TraceAttributes {
  edges: EdgeAttributes[];
  /** Per sent point: its edge and the fraction along it, or null if unmatched. */
  matched: ({ edge: number; along: number } | null)[];
}
export interface EdgeRange {
  from: number;
  to: number;
  edge: EdgeAttributes;
}

/**
 * Pieces of the route to send: whole legs between route points (`legs`,
 * along-track distances) grouped in order into pieces of at most 190 km, so
 * a route with many stops still needs one request per 190 km; a leg longer
 * than a piece is split evenly. Pieces never cross a GPX segment gap, and an
 * edit leaves the pieces before the changed leg identical (cached). Null when
 * the route needs more than `MAX_PIECES` requests.
 */
export function attributePlan(
  segments: Coord[][],
  legs: number[] = [],
): AttributePiece[] | null {
  const pieces: AttributePiece[] = [];
  let total = 0;
  for (const segment of segments) {
    const along = [total];
    for (let i = 1; i < segment.length; i++)
      along.push(along[i - 1] + meters(segment[i - 1], segment[i]));
    const start = total,
      end = along.at(-1)!;
    total = end;
    if (end - start < 1) continue;
    // Route points a few meters from a segment end or from each other (a
    // destination snapped just before the track's end) add no tiny piece.
    const stops = [start];
    for (const d of [...legs].sort((a, b) => a - b))
      if (d - stops.at(-1)! >= MIN_PIECE && end - d >= MIN_PIECE) stops.push(d);
    stops.push(end);
    // Greedy: each piece takes whole legs while it stays within MAX_PIECE.
    const cuts = [start];
    let reached = start;
    for (const stop of stops.slice(1)) {
      let from = cuts.at(-1)!;
      if (stop - from > MAX_PIECE && reached > from) {
        cuts.push(reached);
        from = reached;
      }
      // A single leg longer than a piece: split it evenly; its last part can
      // still take the following legs.
      const n = Math.ceil((stop - from) / MAX_PIECE);
      for (let k = 1; k < n; k++) cuts.push(from + ((stop - from) * k) / n);
      reached = stop;
    }
    cuts.push(end);
    const at = (x: number): Coord => {
      let i = 1;
      while (i < along.length - 1 && along[i] < x) i++;
      const d = along[i] - along[i - 1],
        t = d ? Math.max(0, Math.min(1, (x - along[i - 1]) / d)) : 0;
      const a = segment[i - 1],
        b = segment[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    cuts.slice(1).forEach((b, i) => {
      const a = cuts[i];
      if (b - a < 1) return;
      const spacing = Math.max(MIN_SPACING, (b - a) / MAX_POINTS);
      const piece: AttributePiece = { coords: [at(a)], at: [a] };
      for (let v = 0; v < segment.length; v++)
        if (
          along[v] > a &&
          along[v] < b &&
          along[v] - piece.at.at(-1)! >= spacing &&
          b - along[v] >= spacing / 2
        ) {
          piece.coords.push(segment[v]);
          piece.at.push(along[v]);
        }
      piece.coords.push(at(b));
      piece.at.push(b);
      pieces.push(piece);
    });
  }
  return pieces.length > MAX_PIECES ? null : pieces;
}

/** Google polyline encoding at 6 decimals (Valhalla's precision). */
export function encodePolyline(coords: Coord[]): string {
  let out = '',
    lat = 0,
    lon = 0;
  const put = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 32) {
      out += String.fromCharCode((32 | (v & 31)) + 63);
      v >>>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [a, b] of coords) {
    const la = Math.round(a * 1e6),
      lo = Math.round(b * 1e6);
    put(la - lat);
    put(lo - lon);
    lat = la;
    lon = lo;
  }
  return out;
}

const isSurface = (value: unknown): value is Surface =>
  (SURFACES as readonly unknown[]).includes(value);

/**
 * Validates an untrusted `/trace_attributes` response for `count` sent
 * points. Malformed structure or numbers reject it; a surface outside the
 * vocabulary is dropped (unknown) rather than failing the piece.
 */
export function parseTraceAttributes(
  data: unknown,
  count: number,
): TraceAttributes {
  const fail = () => {
    throw new Error('Valhalla returned an invalid response.');
  };
  const d = data as { edges?: unknown; matched_points?: unknown } | null;
  if (
    !d ||
    !Array.isArray(d.edges) ||
    !Array.isArray(d.matched_points) ||
    d.matched_points.length !== count ||
    d.edges.length > 100_000
  )
    fail();
  const edges = (d!.edges as unknown[]).map((raw) => {
    const e = raw as { length?: unknown; surface?: unknown } | null;
    const km = e?.length;
    if (typeof km !== 'number' || !Number.isFinite(km) || km < 0 || km > 1000)
      fail();
    return {
      length: (km as number) * 1000,
      ...(isSurface(e!.surface) ? { surface: e!.surface } : {}),
    };
  });
  const matched = (d!.matched_points as unknown[]).map((raw) => {
    const p = raw as {
      type?: unknown;
      edge_index?: unknown;
      distance_along_edge?: unknown;
    } | null;
    if (!p || typeof p !== 'object') fail();
    if (p!.type === 'unmatched' || p!.edge_index === undefined) return null;
    const edge = p!.edge_index,
      along = p!.distance_along_edge ?? 0;
    if (
      !Number.isInteger(edge) ||
      (edge as number) < 0 ||
      (edge as number) >= edges.length ||
      typeof along !== 'number' ||
      !(along >= 0 && along <= 1)
    )
      fail();
    return { edge: edge as number, along: along as number };
  });
  return { edges, matched };
}

/**
 * Matched edges as along-track ranges. Every matched sent point anchors a
 * distance on the matched path to its known distance on the route; edge ends
 * between anchors are placed by linear interpolation. A run of anchors stops
 * at an unmatched point, so the gap after it gets no edges (unknown), and an
 * anchor going backwards on either side is skipped.
 */
export function edgeRanges(
  piece: AttributePiece,
  result: TraceAttributes,
): EdgeRange[] {
  const { edges, matched } = result;
  const starts: number[] = [];
  let sum = 0;
  for (const e of edges) {
    starts.push(sum);
    sum += e.length;
  }
  const runs: { m: number; a: number }[][] = [[]];
  matched.forEach((p, k) => {
    if (!p) {
      if (runs.at(-1)!.length) runs.push([]);
      return;
    }
    const m = starts[p.edge] + p.along * edges[p.edge].length,
      a = piece.at[k];
    const last = runs.at(-1)!.at(-1);
    if (last && (m <= last.m || a <= last.a)) return;
    runs.at(-1)!.push({ m, a });
  });
  const out: EdgeRange[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    const place = (m: number) => {
      let i = 1;
      while (i < run.length - 1 && run[i].m < m) i++;
      const p = run[i - 1],
        q = run[i];
      return p.a + ((q.a - p.a) * (m - p.m)) / (q.m - p.m);
    };
    const low = run[0].m,
      high = run.at(-1)!.m;
    edges.forEach((edge, e) => {
      const from = Math.max(low, starts[e]),
        to = Math.min(high, starts[e] + edge.length);
      if (to <= from) return;
      const a = place(from),
        b = place(to);
      if (b > a) out.push({ from: a, to: b, edge });
    });
  }
  return out;
}

/** True when every sent coordinate is valid (guards the request). */
export const validPiece = (piece: AttributePiece): boolean =>
  piece.coords.length >= 2 && piece.coords.every(validCoord);
