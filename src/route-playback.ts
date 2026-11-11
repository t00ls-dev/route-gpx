import { departureOf } from './departure';
import L from 'leaflet';
import { meters, type Coord, type Route, type State, type Step } from './core';
import { byId as $ } from './dom';
import { icon } from './icons';
import { lightAt } from './daylight';
import { t } from './i18n';
import { isImportedRoute, isMixedRoute } from './track-legs';
import { travelTimeSeconds } from './travel-time';
import { distanceLabel } from './units';
import { indexTrack, pointAtDistance, type TrackIndex } from './track-position';
import { distanceUnits } from './unit-preferences';

/**
 * "Travel the route": a cursor moves along the full-resolution track, with the
 * distance travelled, the passage time and light at that moment and the road.
 * A local planning aid: no routing or weather requests while it runs.
 */

/** Meters travelled per second at 1× (10× covers 2.5 km per second). */
const METERS_PER_SECOND = 250;
const STEPS = 1000;

const LIGHT = { day: 'daylight', twilight: 'twilight', night: 'dark' } as const;

/** Road at an along-track distance, from router steps; null when unknown. */
export function roadAt(steps: Step[], distance: number): string | null {
  let travelled = 0;
  for (const step of steps) {
    travelled += step.distance;
    if (distance <= travelled && step.distance > 0)
      return [step.ref, step.name].filter(Boolean).join(' ') || null;
  }
  return null;
}

export function setupPlayback(
  map: L.Map,
  deps: { state: () => State; speedKmh: () => number },
) {
  const details = $<HTMLDetailsElement>('playback'),
    toggle = $<HTMLButtonElement>('playback-toggle'),
    range = $<HTMLInputElement>('playback-position'),
    rate = $<HTMLSelectElement>('playback-rate'),
    readout = $('playback-readout');
  map.createPane('playback').style.zIndex = '585';
  const layer = L.layerGroup().addTo(map);
  let route: Route | null = null,
    index: TrackIndex | null = null,
    distance = 0,
    frame = 0,
    last = 0,
    cursor: L.Marker | null = null,
    trace: L.Polyline | null = null,
    /** Per segment: coordinates and their along-track distances, built once per route. */
    parts: { coords: Coord[]; at: number[] }[] = [];

  const locale = () => (deps.state().language === 'pt' ? 'pt-BR' : 'en');
  const label = (meters: number) =>
    distanceLabel(meters, distanceUnits(), locale());

  function setPlaying(playing: boolean) {
    cancelAnimationFrame(frame);
    frame = 0;
    toggle.replaceChildren(icon(playing ? 'pause' : 'play'));
    const name = playing ? 'Pause' : 'Play';
    toggle.setAttribute('aria-label', name);
    toggle.title = name;
    toggle.setAttribute('aria-pressed', String(playing));
    if (playing) {
      if (index && distance >= index.total) distance = 0;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  function tick(now: number) {
    if (!index) return;
    const seconds = (now - last) / 1000;
    last = now;
    distance += METERS_PER_SECOND * Number(rate.value) * seconds;
    if (distance >= index.total) {
      distance = index.total;
      render(true);
      setPlaying(false);
      return;
    }
    render(true);
    frame = requestAnimationFrame(tick);
  }

  /** Track points from the start up to the cursor, segment by segment. */
  function travelled(): Coord[][] {
    const out: Coord[][] = [];
    for (const { coords, at } of parts) {
      if (!at.length || at[0] > distance) break;
      if (at[at.length - 1] <= distance) {
        out.push(coords);
        continue;
      }
      // Binary search for the last vertex at or before the cursor.
      let low = 0,
        high = at.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (at[middle] <= distance) low = middle;
        else high = middle - 1;
      }
      out.push(coords.slice(0, low + 1));
      break;
    }
    return out;
  }

  function render(follow = false) {
    if (!route || !index || !details.open) return;
    const point = pointAtDistance(index, distance);
    if (!point) return;
    range.value = String(Math.round((distance / (index.total || 1)) * STEPS));
    // Attribute text is not observed by the DOM translator, so translate here.
    range.setAttribute(
      'aria-valuetext',
      t(`${label(distance)} of ${label(index.total)}`),
    );
    if (!cursor) {
      cursor = L.marker(point.coord, {
        pane: 'playback',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'playback-cursor',
          // A green dot, like a position on the map; the trace shows direction.
          html: '<span class="playback-dot"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
      cursor.getElement()?.setAttribute('aria-hidden', 'true');
    } else cursor.setLatLng(point.coord);
    const path = travelled();
    if (path.length && path.at(-1)!.at(-1) !== point.coord)
      path[path.length - 1] = [...path[path.length - 1], point.coord];
    if (!trace)
      trace = L.polyline(path, {
        pane: 'playback',
        className: 'playback-trace',
        interactive: false,
        weight: 5,
      }).addTo(layer);
    else trace.setLatLngs(path);
    // Follow only when the cursor nears the edge, never changing the zoom.
    if (follow && !map.getBounds().pad(-0.2).contains(point.coord))
      map.panTo(point.coord, { animate: false });

    const lines = [
      `${label(distance)} · ${label(index.total - distance)} left`,
    ];
    const state = deps.state();
    const leaving = departureOf(state);
    const departure = leaving ? Date.parse(leaving) : NaN;
    if (Number.isFinite(departure)) {
      const time =
        departure + travelTimeSeconds(distance, deps.speedKmh()) * 1000;
      const clock = new Date(time).toLocaleString(locale(), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`${clock} · ${LIGHT[lightAt(time, point.coord)]}`);
    }
    // Step distances only match the track for a route routed end to end.
    const road =
      isImportedRoute(route) || isMixedRoute(route)
        ? null
        : roadAt(route.steps, distance);
    if (road) lines.push(road);
    readout.replaceChildren(
      ...lines.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
    );
  }

  function hide() {
    setPlaying(false);
    layer.clearLayers();
    cursor = null;
    trace = null;
  }

  toggle.onclick = () => setPlaying(!frame);
  range.oninput = () => {
    if (!index) return;
    setPlaying(false);
    distance = (Number(range.value) / STEPS) * index.total;
    render(true);
  };
  details.addEventListener('toggle', () => {
    if (details.open) render();
    else hide();
  });
  setPlaying(false);

  return {
    /** A new or invalidated route restarts from the beginning. */
    setRoute(next: Route | null) {
      if (next === route) {
        render();
        return;
      }
      hide();
      route = next;
      index = next ? indexTrack(next.segments) : null;
      // Same distances as indexTrack: no distance across GPX segment gaps.
      let total = 0;
      parts = (next?.segments ?? []).map((coords) => ({
        coords,
        at: coords.map((coord, i) => {
          if (i) total += meters(coords[i - 1], coord);
          return total;
        }),
      }));
      distance = 0;
      range.value = '0';
      readout.replaceChildren();
      render();
    },
    /** Departure, speed, units or language changed: update the readout only. */
    refresh: () => render(),
  };
}
