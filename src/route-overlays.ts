import L from 'leaflet';
import { meters, type Coord, type Route } from './core';
import { byId as $ } from './dom';
import { simplifyTrack } from './simplify';

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
}
export interface Coloring {
  id: string;
  /** English source text; the DOM translator localizes it. */
  label: string;
  legend: { kind: string; label: string }[];
  /** Why the coloring cannot be drawn now, or null when it can. */
  unavailable(): string | null;
  ranges(route: Route): Range[];
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
): { kind: string; coords: Coord[] }[] {
  const out: { kind: string; coords: Coord[] }[] = [];
  if (!ranges.length) return out;
  let total = 0;
  for (const segment of segments) {
    let current: { kind: string; coords: Coord[]; to: number } | null = null;
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
        if (
          !current ||
          current.kind !== range.kind ||
          current.to !== position
        ) {
          current = { kind: range.kind, coords: [p1], to: position };
          out.push(current);
        }
        current.coords.push(p2);
        current.to = stop;
        position = stop;
      }
    }
  }
  return out.map(({ kind, coords }) => ({ kind, coords }));
}

const STORAGE_KEY = 'route-coloring';

export function setupRouteOverlays(
  map: L.Map,
  deps: { route: () => Route | null },
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
    for (const { kind, coords } of sliceByRanges(
      route.segments,
      coloring.ranges(route),
    )) {
      const visual = simplifyTrack(coords, (c) => map.project(c), 0.75, []);
      L.polyline(visual, {
        pane: 'route-overlay',
        className: `route-coloring route-coloring-${kind}`,
        interactive: false,
        weight: 4,
        smoothFactor: 0,
      }).addTo(layer);
    }
    legendBox.replaceChildren(
      ...coloring.legend.map(({ kind, label }) => {
        const item = document.createElement('span');
        const swatch = document.createElement('i');
        swatch.className = `route-legend-swatch route-coloring-${kind}`;
        swatch.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = label;
        item.append(swatch, text);
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
    },
    refresh,
  };
}
