import { meters, type Coord, type Route, type State } from './core';

/**
 * Geometry between two consecutive route points. Inner arrays are pieces of
 * separate GPX track segments, so segment gaps survive partial rerouting.
 */
export type Leg = Coord[][];

/** Routes whose geometry can be reused leg by leg after a point edit. */
export const isImportedRoute = (route: Route): boolean =>
  route.provider.startsWith('Imported GPX');

const known = new WeakMap<Route, Leg[]>();
const legKey = (a: Coord, b: Coord) => `${a[0]},${a[1]}>${b[0]},${b[1]}`;

/** First vertex within tolerance at or after `from`, then on to the local minimum. */
function locate(flat: Coord[], p: Coord, from: number, tolerance: number) {
  for (let i = from; i < flat.length; i++) {
    if (meters(flat[i], p) > tolerance) continue;
    let best = i;
    while (
      best + 1 < flat.length &&
      meters(flat[best + 1], p) <= meters(flat[best], p)
    )
      best++;
    return best;
  }
  return -1;
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
  const flat: Coord[] = [];
  const owner: number[] = [];
  segments.forEach((s, n) =>
    s.forEach((c) => {
      flat.push(c);
      owner.push(n);
    }),
  );
  const indices: number[] = [];
  let from = 0;
  for (const p of points) {
    const i = locate(flat, p, from, tolerance);
    if (i < 0) return null;
    indices.push(i);
    from = i;
  }
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

const length = (segments: Coord[][]) =>
  segments.reduce(
    (sum, s) => sum + s.slice(1).reduce((n, p, i) => n + meters(s[i], p), 0),
    0,
  );

/**
 * Reroutes only the legs whose end points changed and keeps every other leg of
 * the displayed imported geometry exactly. Returns null when no leg can be
 * kept, so the caller routes the whole state as usual.
 */
export async function routeKeepingLegs(
  state: State,
  base: { route: Route; points: Coord[] },
  route: (state: State) => Promise<Route>,
): Promise<Route | null> {
  const baseLegs = legsOf(base.route, base.points);
  if (!baseLegs) return null;
  const library = new Map<string, Leg>();
  baseLegs.forEach((leg, k) =>
    library.set(legKey(base.points[k], base.points[k + 1]), leg),
  );
  const coords = state.points.map((p) => p.coord!);
  const kept = coords
    .slice(1)
    .map((c, k) => library.get(legKey(coords[k], c)) ?? null);
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
    provider: ['Imported GPX', ...providers].join(' + '),
    snapped,
  };
  if (complete) rememberLegs(result, legs);
  return result;
}
