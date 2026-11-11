import L from 'leaflet';
import { meters, type Coord, type Route, type State } from './core';
import { byId as $ } from './dom';
import { icon } from './icons';
import { distanceLabel } from './units';
import { indexTrack, pointAtDistance, type TrackIndex } from './track-position';
import type { Range } from './route-overlays';
import { distanceUnits } from './unit-preferences';

/**
 * Route marks: direction arrows, separate parallel lines where the route uses
 * the same road twice in opposite directions (out-and-back), and an optional
 * halfway point, and the switch for weather icons on the map. Visual only:
 * the route, links, GPX and weather requests are untouched.
 */

const SAMPLE = 20,
  NEAR = 20,
  MIN_APART = 200,
  OPPOSITE = 120,
  MIN_RANGE = 100,
  CELL = 30;

const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Along-track ranges where the track runs over another part of itself in the
 * opposite direction. Crossings and bends are too short to count; parallel
 * roads more than about 20 m apart are not merged.
 */
export function repeatedRanges(segments: Coord[][]): Range[] {
  const index = indexTrack(segments);
  if (!index.edges.length) return [];
  const samples: { at: number; coord: Coord; bearing: number | null }[] = [];
  for (let at = 0; at <= index.total; at += SAMPLE) {
    const point = pointAtDistance(index, at)!;
    samples.push({ at, coord: point.coord, bearing: point.bearing });
  }
  const scale = Math.cos((samples[0].coord[0] * Math.PI) / 180);
  const key = ([lat, lon]: Coord) =>
    `${Math.floor((lat * 111195) / CELL)},${Math.floor((lon * 111195 * scale) / CELL)}`;
  const grid = new Map<string, number[]>();
  samples.forEach((s, i) => {
    const k = key(s.coord);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i);
    else grid.set(k, [i]);
  });
  const marked = samples.map((s) => {
    if (s.bearing === null) return false;
    const [y, x] = key(s.coord).split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of grid.get(`${y + dy},${x + dx}`) ?? []) {
          const other = samples[j];
          if (
            other.bearing !== null &&
            Math.abs(other.at - s.at) >= MIN_APART &&
            angleBetween(other.bearing, s.bearing) > OPPOSITE &&
            meters(other.coord, s.coord) <= NEAR
          )
            return true;
        }
    return false;
  });
  const ranges: Range[] = [];
  samples.forEach((s, i) => {
    if (!marked[i]) return;
    const from = Math.max(0, s.at - SAMPLE / 2),
      to = Math.min(index.total, s.at + SAMPLE / 2);
    const last = ranges.at(-1);
    if (last && from <= last.to + 1e-6) last.to = to;
    else ranges.push({ from, to, kind: 'repeated', repeated: true });
  });
  return ranges.filter((r) => r.to - r.from >= MIN_RANGE);
}

/** How far apart two passes of the same road may be for weather labels. */
const PASS_NEAR = 50;
export type Pass = 'outbound' | 'return';

/**
 * Which pass over a road used both ways a point belongs to: `return` when an
 * earlier part of the track (at least 200 m before) runs within 50 m of it in
 * the opposite direction, `outbound` when a later part does, otherwise null.
 * Uses the same direction rule as the out-and-back lines.
 */
export function passOf(
  index: TrackIndex,
  distance: number,
  coord: Coord,
  bearing: number | null | undefined,
): Pass | null {
  if (bearing === null || bearing === undefined || !index.edges.length)
    return null;
  let later = false;
  for (let at = 0; at <= index.total; at += SAMPLE) {
    if (Math.abs(at - distance) < MIN_APART) continue;
    const point = pointAtDistance(index, at)!;
    if (
      point.bearing !== null &&
      angleBetween(point.bearing, bearing) > OPPOSITE &&
      meters(point.coord, coord) <= PASS_NEAR
    ) {
      if (at < distance) return 'return';
      later = true;
    }
  }
  return later ? 'outbound' : null;
}

const passCache = new WeakMap<Route, Map<string, Pass | null>>();
/** Passes of weather samples on a route, computed once per route and sample. */
export function weatherPasses(
  route: Route,
  samples: { distance: number; coord: Coord; bearing?: number | null }[],
): (Pass | null)[] {
  let known = passCache.get(route);
  if (!known) {
    known = new Map();
    passCache.set(route, known);
  }
  let index: TrackIndex | null = null;
  return samples.map((s) => {
    const key = `${s.distance}|${s.bearing}`;
    if (!known.has(key)) {
      index ??= indexTrack(route.segments);
      known.set(key, passOf(index, s.distance, s.coord, s.bearing));
    }
    return known.get(key)!;
  });
}

const cache = new WeakMap<Route, Range[]>();
/** Repeated ranges of a route, computed once per route object. */
export function repeatsFor(route: Route): Range[] {
  let ranges = cache.get(route);
  if (!ranges) {
    ranges = repeatedRanges(route.segments);
    cache.set(route, ranges);
  }
  return ranges;
}

/** Splits ranges at repeated-stretch boundaries, flagging the repeated parts. */
export function splitByRepeat(ranges: Range[], repeated: Range[]): Range[] {
  const out: Range[] = [];
  for (const range of ranges) {
    let position = range.from;
    for (const r of repeated) {
      if (r.to <= position || r.from >= range.to) continue;
      if (r.from > position)
        out.push({ ...range, from: position, to: r.from, repeated: false });
      const end = Math.min(range.to, r.to);
      out.push({
        ...range,
        from: Math.max(position, r.from),
        to: end,
        repeated: true,
      });
      position = end;
    }
    if (position < range.to)
      out.push({ ...range, from: position, to: range.to, repeated: false });
  }
  return out;
}

export interface Pixel {
  x: number;
  y: number;
}
/**
 * Offsets a path to the right of its own direction by `pixels` in screen
 * space (y down), so opposite passes of the same road land on opposite sides.
 */
export function offsetPath(
  coords: Coord[],
  project: (c: Coord) => Pixel,
  unproject: (p: Pixel) => Coord,
  pixels: number,
): Coord[] {
  const points = coords.map(project);
  const normal = (a: Pixel, b: Pixel): Pixel | null => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    return length ? { x: -dy / length, y: dx / length } : null;
  };
  return points.map((p, i) => {
    const before = i > 0 ? normal(points[i - 1], p) : null,
      after = i < points.length - 1 ? normal(p, points[i + 1]) : null;
    let n =
      before && after
        ? { x: before.x + after.x, y: before.y + after.y }
        : (before ?? after);
    const length = n ? Math.hypot(n.x, n.y) : 0;
    if (!n || !length) return coords[i];
    n = { x: n.x / length, y: n.y / length };
    return unproject({ x: p.x + n.x * pixels, y: p.y + n.y * pixels });
  });
}

/** Evenly spaced along-track distances, starting half a step in. */
export function arrowStops(total: number, spacing: number): number[] {
  if (!(total > 0) || !(spacing > 0)) return [];
  const stops: number[] = [];
  for (let at = spacing / 2; at < total; at += spacing) stops.push(at);
  return stops;
}

const ARROW_PIXELS = 90,
  MAX_ARROWS = 300,
  OFFSET = 4;
const isOn = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};

export function setupRouteMarks(
  map: L.Map,
  deps: { route: () => Route | null; state: () => State },
) {
  const layer = L.layerGroup().addTo(map);
  map.createPane('route-marks').style.zIndex = '460';
  const settings = {
    arrows: isOn('route-arrows', true),
    halfway: isOn('route-halfway', false),
    weather: isOn('weather-markers', true),
  };
  // Weather icons live in their own pane; hiding it keeps the cards and the
  // forecast, and takes the markers out of focus and screen readers too.
  const showWeather = () =>
    map.getContainer().classList.toggle('hide-weather', !settings.weather);
  showWeather();

  const group = document.createElement('div');
  group.className = 'marks-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', 'marks-heading');
  const heading = document.createElement('p');
  heading.id = 'marks-heading';
  heading.className = 'coloring-heading';
  heading.textContent = 'Route marks';
  group.append(heading);
  for (const [id, key, label] of [
    ['arrows', 'route-arrows', 'Direction arrows'],
    ['halfway', 'route-halfway', 'Halfway point'],
    ['weather', 'weather-markers', 'Weather on the map'],
  ] as const) {
    const wrapper = document.createElement('label');
    wrapper.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `marks-${id}`;
    input.setAttribute('role', 'menuitemcheckbox');
    input.checked = settings[id];
    input.setAttribute('aria-checked', String(input.checked));
    const text = document.createElement('span');
    text.textContent = label;
    input.onchange = () => {
      settings[id] = input.checked;
      input.setAttribute('aria-checked', String(input.checked));
      try {
        localStorage.setItem(key, String(input.checked));
      } catch {
        /* Optional device preference. */
      }
      showWeather();
      draw();
    };
    wrapper.append(input, text);
    group.append(wrapper);
  }
  $('layers-menu').append(group);

  function draw() {
    layer.clearLayers();
    const route = deps.route();
    if (!route) return;
    const index = indexTrack(route.segments);
    if (!index.edges.length) return;
    const repeated = repeatsFor(route);
    if (settings.arrows) {
      const center = map.getCenter();
      const metersPerPixel =
        (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
        (256 * 2 ** map.getZoom());
      const bounds = map.getBounds().pad(0.2);
      let count = 0;
      for (const at of arrowStops(index.total, ARROW_PIXELS * metersPerPixel)) {
        const point = pointAtDistance(index, at)!;
        if (!bounds.contains(point.coord) || point.bearing === null) continue;
        if (++count > MAX_ARROWS) break;
        let coord = point.coord;
        if (repeated.some((r) => at >= r.from && at < r.to)) {
          // Same side as the offset pass line: right of the travel direction.
          const radians = (point.bearing * Math.PI) / 180;
          const p = map.latLngToLayerPoint(coord);
          const moved = map.layerPointToLatLng(
            L.point(
              p.x + Math.cos(radians) * OFFSET,
              p.y + Math.sin(radians) * OFFSET,
            ),
          );
          coord = [moved.lat, moved.lng];
        }
        L.marker(coord, {
          pane: 'route-marks',
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'route-arrow',
            html: `<span style="transform: rotate(${point.bearing}deg)">${icon('chevron').outerHTML}</span>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
          .addTo(layer)
          .getElement()
          ?.setAttribute('aria-hidden', 'true');
      }
    }
    if (settings.halfway) {
      const half = index.total / 2;
      const point = pointAtDistance(index, half)!;
      const state = deps.state();
      const marker = L.marker(point.coord, {
        pane: 'route-marks',
        keyboard: false,
        icon: L.divIcon({
          className: 'route-halfway',
          html: '<span>½</span>',
          iconSize: [26, 26],
          // Beside the point, not on it: on a round trip the halfway point is
          // the turnaround, where a route pin already stands.
          iconAnchor: [34, 13],
        }),
      }).addTo(layer);
      marker.bindTooltip(
        `Halfway · ${distanceLabel(half, distanceUnits(), state.language === 'pt' ? 'pt-BR' : 'en')}`,
      );
    }
  }
  map.on('zoomend moveend', draw);
  return { refresh: draw };
}

/** Repeated stretches of `route.segments` drawn as offset parallel lines. */
export function offsetSlices(
  map: L.Map,
  slices: { repeated: boolean; coords: Coord[] }[],
): Coord[][] {
  return slices.map((slice) =>
    slice.repeated
      ? offsetPath(
          slice.coords,
          (c) => map.latLngToLayerPoint(c),
          (p) => {
            const ll = map.layerPointToLatLng(L.point(p.x, p.y));
            return [ll.lat, ll.lng];
          },
          OFFSET,
        )
      : slice.coords,
  );
}
