import type { EdgeRange, Surface } from './road-attributes';

/**
 * Road surface along the route, from the Valhalla edge attributes: categories,
 * along-track ranges with unknown gaps, totals and the stretches worth
 * checking. Pure; no DOM or network.
 */

/**
 * Two kinds, the question travelers ask (paved or not), plus unknown for
 * stretches no road was matched to.
 */
export type SurfaceKind = 'paved' | 'unpaved' | 'unknown';

/** Display order, with English source labels (translated by the DOM). */
export const SURFACE_KINDS: { kind: SurfaceKind; label: string }[] = [
  { kind: 'paved', label: 'Paved' },
  { kind: 'unpaved', label: 'Unpaved' },
  { kind: 'unknown', label: 'Unknown' },
];

/**
 * Valhalla's surfaces: asphalt, concrete, paving stones and cobblestones are
 * paved; compacted, gravel (also the generic `surface=unpaved`), dirt, path
 * and impassable are not.
 */
const KIND: Record<Surface, SurfaceKind> = {
  paved_smooth: 'paved',
  paved: 'paved',
  paved_rough: 'paved',
  compacted: 'unpaved',
  gravel: 'unpaved',
  dirt: 'unpaved',
  path: 'unpaved',
  impassable: 'unpaved',
};

/** Stretches shorter than this are left out of the list to check, meters. */
export const MIN_SECTION = 200;

export interface SurfaceRange {
  from: number;
  to: number;
  kind: SurfaceKind;
}

/**
 * Ranges covering the whole route (`total` meters): matched edges by kind,
 * gaps as unknown, neighbors of one kind merged. Overlaps where pieces meet
 * keep the first edge.
 */
export function surfaceRanges(
  edges: EdgeRange[],
  total: number,
): SurfaceRange[] {
  const out: SurfaceRange[] = [];
  const add = (from: number, to: number, kind: SurfaceKind) => {
    if (to - from <= 0) return;
    const last = out.at(-1);
    if (last && last.kind === kind && from - last.to < 1) last.to = to;
    else out.push({ from, to, kind });
  };
  let cursor = 0;
  for (const e of [...edges].sort((a, b) => a.from - b.from)) {
    const from = Math.max(cursor, e.from),
      to = Math.min(total, e.to);
    if (to <= from) continue;
    // Gaps under a meter are rounding between edges, not missing data.
    if (from - cursor >= 1) add(cursor, from, 'unknown');
    add(
      from - cursor < 1 ? cursor : from,
      to,
      e.edge.surface ? KIND[e.edge.surface] : 'unknown',
    );
    cursor = to;
  }
  if (total - cursor >= 1) add(cursor, total, 'unknown');
  else if (out.length) out.at(-1)!.to = total;
  return out;
}

/** Length per kind in display order, only kinds present. */
export function surfaceTotals(
  ranges: SurfaceRange[],
): { kind: SurfaceKind; label: string; length: number }[] {
  const sums = new Map<SurfaceKind, number>();
  for (const r of ranges)
    sums.set(r.kind, (sums.get(r.kind) ?? 0) + r.to - r.from);
  return SURFACE_KINDS.filter(({ kind }) => sums.get(kind)).map((k) => ({
    ...k,
    length: sums.get(k.kind)!,
  }));
}

/** Unpaved stretches of at least `MIN_SECTION`, in route order. */
export function sectionsToCheck(ranges: SurfaceRange[]): SurfaceRange[] {
  return ranges.filter(
    (r) => r.kind === 'unpaved' && r.to - r.from >= MIN_SECTION,
  );
}
