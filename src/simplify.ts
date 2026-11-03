import type { Coord } from './core';
export interface Pixel {
  x: number;
  y: number;
}
export function segmentDistanceSquared(p: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
          ),
        )
      : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
/** Visual only: pixel-space Douglas–Peucker with pinned waypoint vertices. */
export function simplifyTrack(
  coords: readonly Coord[],
  project: (coord: Coord) => Pixel,
  tolerance = 0.75,
  anchors: readonly Coord[] = [],
): Coord[] {
  if (coords.length <= 2) return [...coords];
  const pixels = coords.map(project);
  const keep = new Set([0, coords.length - 1]);
  for (const anchor of anchors) {
    const p = project(anchor);
    let closest = 0,
      distance = Infinity;
    pixels.forEach((q, i) => {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < distance) {
        closest = i;
        distance = d;
      }
    });
    keep.add(closest);
  }
  const pins = [...keep].sort((a, b) => a - b);
  const stack = pins.slice(1).map((end, i) => [pins[i], end]);
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = -1,
      distance = Math.max(0, tolerance) ** 2;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistanceSquared(pixels[i], pixels[start], pixels[end]);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep.add(farthest);
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return coords.filter((_, i) => keep.has(i));
}
