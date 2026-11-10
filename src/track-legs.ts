import {
  importedProvider,
  meters,
  type Coord,
  type Route,
  type State,
} from './core';

/**
 * Geometry between two consecutive route points. Inner arrays are pieces of
 * separate GPX track segments, so segment gaps survive partial rerouting.
 */
export type Leg = Coord[][];

/** Routes whose geometry can be reused leg by leg after a point edit. */
export const isImportedRoute = (route: Route): boolean =>
  importedProvider(route.provider) !== null;

/** True for an imported track whose edited legs were rerouted. */
export const isMixedRoute = (route: Route): boolean =>
  isImportedRoute(route) && route.provider.includes(' + ');

const known = new WeakMap<Route, Leg[]>();
const coordKey = (c: Coord) => `${c[0]},${c[1]}`;

/**
 * Track indices of each point, in order along the track. A track that passes
 * the same place several times (laps, out-and-back, crossings) gives a point
 * one candidate per pass, so every point is matched to the candidate that
 * keeps the order and minimises the summed distance, instead of the first pass
 * within tolerance. Returns null when a point is not on the track or no
 * ordered match exists.
 */
export function locatePoints(
  flat: Coord[],
  points: Coord[],
  tolerance = 100,
): number[] | null {
  // Candidates per point: local distance minima within tolerance, by index.
  const candidates = points.map((p) => {
    const d = flat.map((c) => meters(c, p));
    const found: { index: number; distance: number }[] = [];
    for (let i = 0; i < flat.length; i++)
      if (
        d[i] <= tolerance &&
        (i === 0 || d[i] <= d[i - 1]) &&
        (i === flat.length - 1 || d[i] <= d[i + 1])
      )
        found.push({ index: i, distance: d[i] });
    return found;
  });
  if (candidates.some((c) => !c.length)) return null;
  // Ordered dynamic programme: cost[k][c] = best summed distance ending at c.
  let cost = candidates[0].map((c) => c.distance);
  const back: number[][] = [candidates[0].map(() => -1)];
  for (let k = 1; k < points.length; k++) {
    const prev = candidates[k - 1];
    const next: number[] = [];
    const from: number[] = [];
    // Both lists are sorted by index: sweep a running minimum of `prev`.
    let p = 0,
      best = Infinity,
      bestAt = -1;
    for (const c of candidates[k]) {
      while (p < prev.length && prev[p].index <= c.index) {
        if (cost[p] < best) [best, bestAt] = [cost[p], p];
        p++;
      }
      next.push(best + c.distance);
      from.push(bestAt);
    }
    cost = next;
    back.push(from);
  }
  let at = -1,
    total = Infinity;
  cost.forEach((c, i) => {
    if (c < total) [total, at] = [c, i];
  });
  if (!Number.isFinite(total)) return null;
  const indices: number[] = [];
  for (let k = points.length - 1; k >= 0; k--) {
    indices.unshift(candidates[k][at].index);
    at = back[k][at];
  }
  return indices;
}

/** Splits track geometry at known flat indices (one per route point, ascending). */
export function legsAt(segments: Coord[][], indices: number[]): Leg[] {
  const flat: Coord[] = [];
  const owner: number[] = [];
  segments.forEach((s, n) =>
    s.forEach((c) => {
      flat.push(c);
      owner.push(n);
    }),
  );
  return indices.slice(1).map((end, k) => {
    const start = indices[k];
    const leg: Leg = [];
    for (let i = start; i <= end; i++) {
      if (i === start || owner[i] !== owner[i - 1]) leg.push([]);
      leg.at(-1)!.push(flat[i]);
    }
    return leg;
  });
}

/**
 * Splits track geometry at each point, located in order along the track.
 * Returns null when a point is not on the track or the order does not match.
 */
export function splitLegs(
  segments: Coord[][],
  points: Coord[],
  tolerance = 100,
): Leg[] | null {
  if (points.length < 2) return null;
  const indices = locatePoints(segments.flat(), points, tolerance);
  return indices && legsAt(segments, indices);
}

/** Legs of a displayed route, from its record or by locating its points on the track. */
export function legsOf(route: Route, points: Coord[]): Leg[] | null {
  const legs = known.get(route);
  if (legs && legs.length === points.length - 1) return legs;
  const split = splitLegs(route.segments, points);
  if (split) known.set(route, split);
  return split;
}

export function rememberLegs(route: Route, legs: Leg[]): void {
  known.set(route, legs);
}

function routedLegs(route: Route, points: Coord[]): Leg[] | null {
  if (route.segments.length === points.length - 1)
    return route.segments.map((s) => [s]);
  return route.snapped?.length === points.length
    ? splitLegs(route.segments, route.snapped, 30)
    : null;
}

function stitch(legs: Leg[]): Coord[][] {
  const out: Coord[][] = [];
  legs.forEach((leg) =>
    leg.forEach((piece, n) => {
      const last = out.at(-1);
      if (n === 0 && last) {
        const tail = last.at(-1)!;
        const head = piece[0];
        last.push(
          ...(head && tail[0] === head[0] && tail[1] === head[1]
            ? piece.slice(1)
            : piece),
        );
      } else out.push([...piece]);
    }),
  );
  return out.filter((s) => s.length >= 2);
}

const reversed = (leg: Leg): Leg =>
  leg
    .slice()
    .reverse()
    .map((piece) => piece.slice().reverse());

const length = (segments: Coord[][]) =>
  segments.reduce(
    (sum, s) => sum + s.slice(1).reduce((n, p, i) => n + meters(s[i], p), 0),
    0,
  );

/**
 * Imported geometry between two points of the new point list, if the base
 * track already holds it: the exact leg in either direction, or consecutive
 * legs joined across base points that were removed from the list.
 */
function keptLeg(
  a: Coord,
  b: Coord,
  base: Coord[],
  legs: Leg[],
  present: Set<string>,
): Leg | null {
  const at = (c: Coord) =>
    base.flatMap((p, i) => (p[0] === c[0] && p[1] === c[1] ? [i] : []));
  const from = at(a),
    to = at(b);
  let best: { i: number; j: number } | null = null;
  for (const i of from)
    for (const j of to) {
      if (i === j) continue;
      const [lo, hi] = i < j ? [i, j] : [j, i];
      // Only join across points the user removed; never skip a kept point.
      if (base.slice(lo + 1, hi).some((p) => present.has(coordKey(p))))
        continue;
      const span = hi - lo;
      const bestSpan = best ? Math.abs(best.j - best.i) : Infinity;
      if (span < bestSpan || (span === bestSpan && i < j && best!.i > best!.j))
        best = { i, j };
    }
  if (!best) return null;
  const { i, j } = best;
  const span = i < j ? legs.slice(i, j) : legs.slice(j, i).reverse();
  const joined: Leg = [];
  for (const leg of i < j ? span : span.map(reversed))
    leg.forEach((piece, n) => {
      if (n === 0 && joined.length) {
        const last = joined.at(-1)!;
        const tail = last.at(-1)!;
        last.push(
          ...(tail[0] === piece[0][0] && tail[1] === piece[0][1]
            ? piece.slice(1)
            : piece),
        );
      } else joined.push([...piece]);
    });
  return joined;
}

/**
 * Reroutes only the legs the imported geometry cannot provide and keeps every
 * other leg exactly: unchanged legs, legs traversed in reverse (reverse, round
 * trip) and legs joined across removed points. Returns null when no leg can be
 * kept, so the caller routes the whole state as usual.
 */
export async function routeKeepingLegs(
  state: State,
  base: { route: Route; points: Coord[] },
  route: (state: State) => Promise<Route>,
): Promise<Route | null> {
  const baseLegs = legsOf(base.route, base.points);
  if (!baseLegs) return null;
  const coords = state.points.map((p) => p.coord!);
  const present = new Set(coords.map(coordKey));
  const kept = coords
    .slice(1)
    .map((c, k) => keptLeg(coords[k], c, base.points, baseLegs, present));
  if (kept.every((leg) => !leg)) return null;

  const legs: Leg[] = [];
  const steps: Route['steps'] = [];
  const providers = new Set<string>();
  const snapped: Coord[] = [...coords];
  let complete = true;
  for (let k = 0; k < kept.length;) {
    const leg = kept[k];
    if (leg) {
      legs.push(leg);
      k++;
      continue;
    }
    let end = k;
    while (end < kept.length && !kept[end]) end++;
    const part = await route({
      ...state,
      points: state.points.slice(k, end + 1),
    });
    providers.add(part.provider);
    steps.push(...part.steps);
    if (part.snapped?.length === end - k + 1)
      part.snapped.forEach((c, n) => (snapped[k + n] = c));
    const split = routedLegs(part, coords.slice(k, end + 1));
    if (split) legs.push(...split);
    else {
      complete = false;
      legs.push(part.segments);
    }
    k = end;
  }
  const segments = stitch(legs);
  const result: Route = {
    segments,
    steps,
    distance: length(segments),
    duration: null,
    provider: [
      importedProvider(base.route.provider) ?? 'Imported GPX',
      ...providers,
    ].join(' + '),
    snapped,
  };
  if (complete) rememberLegs(result, legs);
  return result;
}
