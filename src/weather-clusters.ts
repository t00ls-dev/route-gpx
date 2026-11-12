/**
 * Weather marker clusters: markers that would overlap on screen show as one,
 * the worst alert, else a route point, else the worst condition, with a count
 * of the others. Visual only; samples, cards and links never change.
 */

/** Marker icon size and anchors, in pixels (see the weather marker CSS). */
export const MARKER_SIZE: [number, number] = [68, 52];
export const OUTBOUND_ANCHOR: [number, number] = [2, 40];
/** A return marker hangs to the left, beside the outbound one. */
export const RETURN_ANCHOR: [number, number] = [66, 40];

/** Weather icons from mildest to worst, for choosing a cluster's marker. */
export const CONDITION_ORDER = [
  'weather-sun',
  'weather-partly-cloudy',
  'weather-cloud',
  'weather-fog',
  'weather-drizzle',
  'weather-rain',
  'weather-snow',
  'weather-heavy-rain',
  'weather-freezing-rain',
  'weather-hail',
  'weather-thunderstorm',
] as const;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How far the "+N" count rises above the marker (see its CSS). */
export const COUNT_RISE = 6;
/**
 * Pixels at the anchor side left out of the box: an outbound and a return
 * marker on the same point share them by design, side by side.
 */
const SHARED_EDGE = 3;

/**
 * The screen area a marker takes when its route point sits at `x`, `y`,
 * its count included.
 */
export function markerBox(
  x: number,
  y: number,
  pass?: 'outbound' | 'return',
): Box {
  const [ax, ay] = pass === 'return' ? RETURN_ANCHOR : OUTBOUND_ANCHOR;
  const left = x - ax,
    top = y - ay;
  return {
    left,
    top: top - COUNT_RISE,
    right: left + MARKER_SIZE[0],
    bottom: top + MARKER_SIZE[1],
  };
}

/** Whether two markers collide; an outbound and a return pass share the edge at their point. */
function collide(a: ClusterItem, b: ClusterItem): boolean {
  if (!a.pass || !b.pass || a.pass === b.pass) return overlaps(a.box, b.box);
  const trim = (item: ClusterItem): Box =>
    item.pass === 'return'
      ? { ...item.box, right: item.box.right - SHARED_EDGE }
      : { ...item.box, left: item.box.left + SHARED_EDGE };
  return overlaps(trim(a), trim(b));
}

export interface ClusterItem {
  box: Box;
  /** Alert severity of the sample, 0 without an alert. */
  severity: number;
  /** Weather icon name, ranked by `CONDITION_ORDER`. */
  condition: string;
  headwind: boolean;
  /** Mean wind in km/h, null when unknown. */
  wind: number | null;
  /** Start, stop or destination. */
  point: boolean;
  pass?: 'outbound' | 'return';
}

export interface Cluster {
  /** Indices of the items in this stretch, in route order. */
  members: number[];
  /** The item shown for the stretch. */
  shown: number;
  /** No hidden member is worse than the one shown. */
  noneWorse: boolean;
  /** Members with an alert, the shown one included. */
  alerts: number;
  /** Hidden members with an alert. */
  hiddenAlerts: number;
}

/** Positive when `a` is worse than `b`: alert, then condition, headwind, wind. */
export function compareSeverity(a: ClusterItem, b: ClusterItem): number {
  return (
    a.severity - b.severity ||
    CONDITION_ORDER.indexOf(a.condition as never) -
      CONDITION_ORDER.indexOf(b.condition as never) ||
    Number(a.headwind) - Number(b.headwind) ||
    (a.wind ?? -1) - (b.wind ?? -1)
  );
}

/** Touching or overlapping, with a 2 px gap required between markers. */
export function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right + 2 &&
    a.right > b.left - 2 &&
    a.top < b.bottom + 2 &&
    a.bottom > b.top - 2
  );
}

/** The worst of `indices`; the earliest wins a tie. */
function worst(items: ClusterItem[], indices: number[]): number {
  return indices.reduce((a, b) =>
    compareSeverity(items[b], items[a]) > 0 ? b : a,
  );
}

/**
 * The item a stretch shows: the worst alert when it has one, otherwise a route
 * point (its departure or arrival weather), otherwise the worst sample.
 */
export function shownMember(items: ClusterItem[], members: number[]): number {
  if (members.some((i) => items[i].severity > 0)) return worst(items, members);
  const points = members.filter((i) => items[i].point);
  return worst(items, points.length ? points : members);
}

/**
 * Groups items until no two shown markers overlap on screen, merging the
 * closest overlapping pair first. Groups follow the screen, not the route:
 * a route that comes back near itself (a loop, a round trip, the return of an
 * out-and-back) shares markers where they would pile up.
 */
export function clusterWeather(items: ClusterItem[]): Cluster[] {
  let groups = items.map((_, i) => [i]);
  const shown = (group: number[]) => items[shownMember(items, group)];
  const centre = (b: Box) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
  for (;;) {
    let best: [number, number] | null = null,
      nearest = Infinity;
    for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++) {
        const sa = shown(groups[a]),
          sb = shown(groups[b]);
        if (!collide(sa, sb)) continue;
        const [ax, ay] = centre(sa.box),
          [bx, by] = centre(sb.box);
        const distance = Math.hypot(ax - bx, ay - by);
        if (distance < nearest) {
          nearest = distance;
          best = [a, b];
        }
      }
    if (!best) break;
    const [a, b] = best;
    groups[a] = [...groups[a], ...groups[b]].sort((x, y) => x - y);
    groups = groups.filter((_, i) => i !== b);
  }
  return groups.map((members) => {
    const shown = shownMember(items, members);
    const alerts = members.filter((i) => items[i].severity > 0).length;
    return {
      members,
      shown,
      noneWorse: members.every(
        (i) => compareSeverity(items[i], items[shown]) <= 0,
      ),
      alerts,
      hiddenAlerts: alerts - (items[shown].severity > 0 ? 1 : 0),
    };
  });
}
