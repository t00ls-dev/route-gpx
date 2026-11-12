import L from 'leaflet';
import { meters, type Coord, type Route } from './core';
import { byId as $ } from './dom';
import { simplifyTrack } from './simplify';
import { icon, type IconName } from './icons';

/**
 * Route coloring: one active coloring of the route line at a time, chosen in
 * Map layers, with a legend. Visual only: the route, links and GPX are
 * untouched. Each coloring provides along-track ranges with a kind.
 */

export interface Range {
  /** Along-track distances in meters (GPX segment gaps excluded). */
  from: number;
  to: number;
  kind: string;
  /** On a stretch travelled twice in opposite directions (drawn offset). */
  repeated?: boolean;
}
export interface Coloring {
  id: string;
  /** English source text; the DOM translator localizes it. */
  label: string;
  legend: { kind: string; label: string }[];
  /** Why the coloring cannot be drawn now, or null when it can. */
  unavailable(): string | null;
  ranges(route: Route): Range[];
  /** Called when the coloring is chosen, or already chosen on load. */
  activate?(): void;
  /**
   * A compact color scale instead of the item list: icons at both ends, one
   * continuous bar with a swatch per kind (same order as `legend`) and the
   * limits between them, each centred on its boundary. The full labels are
   * still read out to screen readers.
   */
  scale?: { start: IconName; end: IconName; limits: string[] };
}

const longitudeDelta = (from: number, to: number) =>
  ((to - from + 540) % 360) - 180;
const between = (a: Coord, b: Coord, f: number): Coord => [
  a[0] + (b[0] - a[0]) * f,
  ((a[1] + longitudeDelta(a[1], b[1]) * f + 540) % 360) - 180,
];

/**
 * Splits the full-resolution track at range boundaries. Distances restart
 * nowhere and never span a GPX segment gap, as in `cumulativeTrack`.
 */
export function sliceByRanges(
  segments: Coord[][],
  ranges: Range[],
): { kind: string; repeated: boolean; coords: Coord[] }[] {
  const out: { kind: string; repeated: boolean; coords: Coord[] }[] = [];
  if (!ranges.length) return out;
  let total = 0;
  for (const segment of segments) {
    let current: {
      kind: string;
      repeated: boolean;
      coords: Coord[];
      to: number;
    } | null = null;
    for (let i = 1; i < segment.length; i++) {
      const a = segment[i - 1],
        b = segment[i],
        length = meters(a, b),
        start = total,
        end = total + length;
      total = end;
      if (length <= 0) continue;
      let position = start;
      while (position < end - 1e-9) {
        const range = ranges.find((r) => position >= r.from && position < r.to);
        if (!range) {
          // Outside every range: close the current slice and skip ahead.
          current = null;
          const next = ranges.find((r) => r.from > position);
          position = next ? Math.min(end, next.from) : end;
          continue;
        }
        const stop = Math.min(end, range.to);
        const p1 = between(a, b, (position - start) / length),
          p2 = between(a, b, (stop - start) / length);
        const repeated = !!range.repeated;
        if (
          !current ||
          current.kind !== range.kind ||
          current.repeated !== repeated ||
          current.to !== position
        ) {
          current = { kind: range.kind, repeated, coords: [p1], to: position };
          out.push(current);
        }
        current.coords.push(p2);
        current.to = stop;
        position = stop;
      }
    }
  }
  return out.map(({ kind, repeated, coords }) => ({ kind, repeated, coords }));
}

const STORAGE_KEY = 'route-coloring';

export function setupRouteOverlays(
  map: L.Map,
  deps: {
    route: () => Route | null;
    /** Optional out-and-back handling from route-marks, kept as a dependency. */
    repeats?: {
      of: (route: Route) => Range[];
      split: (ranges: Range[], repeated: Range[]) => Range[];
      offset: (slices: { repeated: boolean; coords: Coord[] }[]) => Coord[][];
    };
  },
) {
  map.createPane('route-overlay').style.zIndex = '450';
  const layer = L.layerGroup().addTo(map);
  const colorings: Coloring[] = [];
  let active = 'none';
  try {
    active = localStorage.getItem(STORAGE_KEY) ?? 'none';
  } catch {
    /* Optional device preference. */
  }
  const menu = $('layers-menu');
  const group = document.createElement('div');
  group.className = 'coloring-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', 'coloring-heading');
  const heading = document.createElement('p');
  heading.id = 'coloring-heading';
  heading.className = 'coloring-heading';
  heading.textContent = 'Route coloring';
  group.append(heading);
  menu.append(group);

  const legend = new L.Control({ position: 'bottomleft' });
  const legendBox = document.createElement('div');
  legendBox.className = 'route-legend';
  legendBox.hidden = true;
  legend.onAdd = () => legendBox;
  legend.addTo(map);
  // The legend wraps its items before reaching the credits button at the
  // bottom right (44 px plus margins), on every map width.
  const fitLegend = () => {
    legendBox.style.maxWidth = `${Math.max(120, map.getSize().x - 84)}px`;
  };
  fitLegend();
  map.on('resize', fitLegend);

  function option(id: string, label: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.dataset.coloring = id;
    const name = document.createElement('span');
    name.textContent = label;
    const reason = document.createElement('small');
    reason.className = 'coloring-reason';
    button.append(name, reason);
    button.onclick = () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      active = id;
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* Optional device preference. */
      }
      refresh();
      colorings.find((c) => c.id === id)?.activate?.();
    };
    group.append(button);
  }
  option('none', 'None');

  function draw() {
    layer.clearLayers();
    legendBox.hidden = true;
    const route = deps.route();
    const coloring = colorings.find((c) => c.id === active);
    if (!route || !coloring || coloring.unavailable()) return;
    const slices = sliceByRanges(
      route.segments,
      deps.repeats
        ? deps.repeats.split(coloring.ranges(route), deps.repeats.of(route))
        : coloring.ranges(route),
    );
    const paths = deps.repeats?.offset(slices) ?? slices.map((s) => s.coords);
    slices.forEach(({ kind, repeated }, i) => {
      const visual = simplifyTrack(paths[i], (c) => map.project(c), 0.75, []);
      L.polyline(visual, {
        pane: 'route-overlay',
        className: `route-coloring route-coloring-${kind}`,
        interactive: false,
        // Out-and-back stretches follow the thinner parallel pass lines.
        weight: repeated ? 3 : 4,
        smoothFactor: 0,
      }).addTo(layer);
    });
    const swatch = (kind: string) => {
      const mark = document.createElement('i');
      mark.className = `route-legend-swatch route-coloring-${kind}`;
      mark.setAttribute('aria-hidden', 'true');
      return mark;
    };
    const text = (value: string, className = '') => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = value;
      return span;
    };
    legendBox.classList.toggle('route-legend-scale', !!coloring.scale);
    if (coloring.scale) {
      const { start, end, limits } = coloring.scale;
      const bar = document.createElement('span');
      bar.className = 'route-legend-bar';
      bar.append(...coloring.legend.map(({ kind }) => swatch(kind)));
      // Limits sit on the boundaries between swatches, by percentage of the
      // bar, each centred on its own tick.
      const ticks = document.createElement('span');
      ticks.className = 'route-legend-ticks';
      limits.forEach((limit, i) => {
        const tick = text(limit, 'route-legend-tick');
        tick.style.left = `${((i + 1) * 100) / coloring.legend.length}%`;
        ticks.append(tick);
      });
      const scale = document.createElement('span');
      scale.className = 'route-legend-scale-body';
      scale.setAttribute('aria-hidden', 'true');
      scale.append(icon(start), bar, icon(end), ticks);
      // The full labels, one per class, for screen readers (translated like
      // any other text); the drawn scale is hidden from them.
      legendBox.replaceChildren(
        scale,
        ...coloring.legend.map(({ label }) => text(label, 'sr-only')),
      );
    } else
      legendBox.replaceChildren(
        ...coloring.legend.map(({ kind, label }) => {
          const item = document.createElement('span');
          item.append(swatch(kind), text(label));
          return item;
        }),
      );
    legendBox.setAttribute('aria-label', coloring.label);
    legendBox.hidden = false;
  }

  function refresh() {
    group
      .querySelectorAll<HTMLButtonElement>('[data-coloring]')
      .forEach((button) => {
        const coloring = colorings.find(
          (c) => c.id === button.dataset.coloring,
        );
        const reason = coloring?.unavailable() ?? null;
        button.setAttribute(
          'aria-checked',
          String(button.dataset.coloring === active),
        );
        button.setAttribute('aria-disabled', String(!!reason));
        button.querySelector('.coloring-reason')!.textContent = reason ?? '';
      });
    draw();
  }
  map.on('zoomend', draw);

  return {
    register(coloring: Coloring) {
      colorings.push(coloring);
      option(coloring.id, coloring.label);
      refresh();
      if (coloring.id === active) coloring.activate?.();
    },
    refresh,
    /** The id of the chosen coloring ('none' when off). */
    active: () => active,
  };
}
