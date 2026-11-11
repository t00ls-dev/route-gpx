import { departureOf } from './departure';
import { RoutingCache } from './routing-cache';
import { setupWeather } from './weather-ui';
import { renderDaylight } from './daylight-ui';
import {
  listSavedRoutes,
  saveNamedRoute,
  deleteSavedRoute,
  exportRouteBackup,
  parseRouteBackup,
  importRouteBackup,
  savedRouteKey,
  markDirectionsChecked,
  updateSavedSteps,
  type SavedRoute,
} from './saved-routes';
import { missingDirections, sameRoad } from './directions';
import { legDistances } from './track-position';
import {
  speedToKmh,
  speedFromKmh,
  travelTimeSeconds,
  speedInputBounds,
  snapSpeed,
  storedSpeedKmh,
  rememberSpeedKmh,
} from './travel-time';
import {
  distanceLabel,
  milepostLabel,
  shortDistanceLabel,
  stepDistanceLabel,
} from './units';
import { UndoHistory } from './history';
import {
  getLanguage,
  observeTranslations,
  preferredLanguage,
  rememberLanguage,
  setLanguage,
  t,
  type Language,
} from './i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {
  defaults,
  decodeState,
  encodeState,
  filename,
  generateGpx,
  highways,
  importTrackFile,
  linkServerOverrides,
  localSections,
  meters,
  parseCoordinates,
  serverUrl,
  validateState,
  type Coord,
  type Point,
  type Route,
  type ServerUrls,
  type State,
} from './core';
import {
  calculate,
  defaultPhotonUrl,
  osrmMatch,
  searchAddress,
} from './services';
import { simplifyTrack } from './simplify';
import {
  isImportedRoute,
  legsAt,
  rememberLegs,
  routeKeepingLegs,
} from './track-legs';
import { shareFile } from './share-gpx';
import { setupPointMenu } from './point-menu';
import { setupQuickZoom } from './quick-zoom';
import { setupPlayback } from './route-playback';
import { setupElevation } from './elevation-ui';
import { setupRouteOverlays, sliceByRanges } from './route-overlays';
import {
  offsetSlices,
  repeatsFor,
  setupRouteMarks,
  splitByRepeat,
} from './route-marks';
import { routeDaylight } from './daylight';
import { addressAutocomplete } from './autocomplete';
import { setupMapView } from './map-view';
import { defaultView } from './default-view';
import { setupMapLayers } from './map-layers';
import { setupMapControls } from './map-controls';
import { compactLayout, setupPanel } from './panel';
import { icon, iconControl } from './icons';
import {
  maneuverIcon,
  maneuverPositions,
  maneuverText,
  shortRoadName,
} from './maneuvers';
import { byId as $ } from './dom';
import {
  chosenDistanceUnits,
  chosenTemperatureUnits,
  detectedUnits,
  distanceUnits,
  rememberDistanceUnits,
  rememberTemperatureUnits,
  type DistanceChoice,
  type TemperatureChoice,
} from './unit-preferences';
const text = (tag: string, value: string, className = '') => {
  const e = document.createElement(tag);
  e.textContent = value;
  e.className = className;
  return e;
};
$('github').append(icon('external'));
let state: State = defaults(),
  selected = 0,
  current: Route | null = null,
  revision = 0,
  timer: ReturnType<typeof setTimeout>;
function status(message: string, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
/**
 * Edit lock, kept in page memory only. Every route edit entry point checks
 * `editBlocked()`; viewing, export and sharing stay available.
 */
let locked = false;
function editBlocked(): boolean {
  if (!locked) return false;
  status('Route locked. Unlock editing to change it.', true);
  return true;
}
let linkServers: ServerUrls | null = null;
/**
 * Servers suggested by a link are used only after an explicit choice: the
 * route opens with the default servers, so a crafted link cannot send the
 * visitor's requests elsewhere.
 */
function fromLink(next: State): State {
  linkServers = linkServerOverrides(next);
  $('server-notice').hidden = !linkServers;
  if (!linkServers) return next;
  const initial = defaults();
  const hosts = (['osrm', 'valhalla', 'nominatim'] as const)
    .filter((key) => next[key] !== initial[key])
    .map((key) => new URL(next[key]).host);
  $('server-notice-text').textContent =
    `This link suggests other routing servers: ${[...new Set(hosts)].join(', ')}. The route uses the default servers.`;
  return {
    ...next,
    osrm: initial.osrm,
    valhalla: initial.valhalla,
    nominatim: initial.nominatim,
  };
}
try {
  state = fromLink(decodeState(location.hash));
} catch {
  status('This route link is invalid. Start a new route below.', true);
}
$('use-link-servers').onclick = () => {
  if (!linkServers || editBlocked()) return;
  Object.assign(state, linkServers);
  linkServers = null;
  $('server-notice').hidden = true;
  settings();
  changed();
};
$('keep-default-servers').onclick = () => {
  linkServers = null;
  $('server-notice').hidden = true;
};
/** Language is a preference, not a route edit, so undo never reverts it. */
const routeSnapshot = (s: State): State => ({ ...s, language: undefined });
/** Each undo step keeps the route shown for it, so undoing restores that exact geometry. */
const undoHistory = new UndoHistory<State, Route>(routeSnapshot(state));
let drafts = new WeakMap<Point, string>();
const dirty = new Set<Point>();
const lookupVersions = new WeakMap<Point, number>();
const routingCache = new RoutingCache();
/** The last displayed imported track and the points it was shown for. */
let trackBase: { route: Route; points: Coord[] } | null = null;
let savedEntries: SavedRoute[] = [];
let libraryRevision = 0;
let savingRoute = false;
let photonUrl = defaultPhotonUrl;
try {
  photonUrl = serverUrl(localStorage.getItem('photon-url') ?? defaultPhotonUrl);
} catch {
  /* Optional preference. */
}
$<HTMLInputElement>('photon').value = photonUrl;
let autocompleteCleanups: (() => void)[] = [];
const localView = defaultView(
  Intl.DateTimeFormat().resolvedOptions().timeZone,
  navigator.languages,
);
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
}).setView(localView.center, localView.zoom);
let zooming = false;
map.on('zoomstart', () => {
  zooming = true;
});
map.on('zoomend', () => {
  zooming = false;
});
const zoom = L.control.zoom({ position: 'bottomright' }).addTo(map);
const markers = L.layerGroup().addTo(map),
  line = L.featureGroup().addTo(map);
// Maneuver chosen in the itinerary, shown until the next map click or route.
map.createPane('maneuver').style.zIndex = '587';
const maneuverLayer = L.layerGroup().addTo(map);
map.on('click', () => maneuverLayer.clearLayers());
function showManeuver(coord: Coord) {
  if (!$('route-panel').hidden && compactLayout()) $('panel-toggle').click();
  map.stop();
  map.setView(coord, Math.max(map.getZoom(), 17), { animate: false });
  maneuverLayer.clearLayers();
  L.circleMarker(coord, {
    pane: 'maneuver',
    radius: 9,
    className: 'maneuver-marker',
    interactive: false,
  }).addTo(maneuverLayer);
}
/** The traveler's average speed (km/h): a device preference, changed only by the user. */
let speedKmh = storedSpeedKmh();
const weather = setupWeather(
  map,
  () => state,
  () => current,
  syncUrl,
  () => speedKmh,
);
/** Recorded `<ele>` of imported GPX routes, in page memory only. */
const recordedElevation = new WeakMap<Route, (number | null)[][]>();
const elevation = setupElevation(map, {
  state: () => state,
  endpoint: () => weather.endpoint(),
  recorded: (route) => recordedElevation.get(route),
  speed: () => speedKmh,
});
const playback = setupPlayback(map, {
  state: () => state,
  speedKmh: () => speedKmh,
});
const overlays = setupRouteOverlays(map, {
  route: () => current,
  repeats: {
    of: repeatsFor,
    split: splitByRepeat,
    offset: (slices) => offsetSlices(map, slices),
  },
});
const marks = setupRouteMarks(map, {
  route: () => current,
});
const departureTime = () =>
  departureOf(state) ? Date.parse(departureOf(state)!) : NaN;
overlays.register({
  id: 'daylight',
  label: 'Daylight',
  legend: [
    { kind: 'day', label: 'Day' },
    { kind: 'twilight', label: 'Twilight' },
    { kind: 'night', label: 'Dark' },
  ],
  unavailable: () =>
    Number.isFinite(departureTime()) ? null : 'Choose a departure date',
  ranges: (route) => routeDaylight(route, departureTime(), speedKmh).ranges,
});
// Registered after the weather handler, which stores the new departure first.
$('departure').addEventListener('change', () => {
  if (current) renderSummary(current);
  else renderDaylight(state, null, speedKmh);
});
new ResizeObserver(() => map.invalidateSize()).observe($('map'));
function fit() {
  if (zooming) {
    const version = revision;
    map.once('zoomend', () => {
      if (version === revision) fit();
    });
    return;
  }
  const pts =
    current?.segments.flat() ??
    state.points.flatMap((p) => (p.coord ? [p.coord] : []));
  if (pts.length) {
    // The bottom sheet covers the lower part of the map on phones.
    const compact = compactLayout();
    const bottom = compact
      ? $('sheet').getBoundingClientRect().height + 30
      : 70;
    map.fitBounds(L.latLngBounds(pts), {
      paddingTopLeft: [45, compact ? 125 : 60],
      paddingBottomRight: [76, bottom],
      maxZoom: 15,
      animate: false,
    });
  }
}
/** Help and What's new open in the chosen language and keep the route for Back to map. */
function pageLinks(lang: Language, hash: string) {
  $<HTMLAnchorElement>('help').href = `./help.html?lang=${lang}${hash}`;
  $<HTMLAnchorElement>('changelog').href =
    `./changelog.html?lang=${lang}${hash}`;
}
function syncUrl() {
  updateSaveButton();
  undoHistory.record(routeSnapshot(state));
  const hash = encodeState(state);
  $<HTMLButtonElement>('undo').disabled =
    locked || (!undoHistory.canUndo && !dirty.size);
  history.replaceState(null, '', hash);
  pageLinks(getLanguage(), hash);
}
function settings() {
  weather.syncInputs();
  const input = $<HTMLInputElement>('average-speed');
  const bounds = speedInputBounds(distanceUnits());
  const value = snapSpeed(
    speedFromKmh(speedKmh, distanceUnits()),
    distanceUnits(),
  );
  // The first notch represents 1; subsequent notches are 5, 10, 15…
  input.min = '0';
  input.max = String(bounds.max);
  input.step = '5';
  input.value = value === 1 ? '0' : String(value);
  input.setAttribute('aria-valuemin', '1');
  input.setAttribute('aria-valuemax', String(bounds.max));
  input.setAttribute('aria-valuenow', String(value));
  input.setAttribute(
    'aria-valuetext',
    `${value} ${distanceUnits() === 'imperial' ? 'mph' : 'km/h'}`,
  );
  $('average-speed-value').textContent = String(value);
  $('speed-range').textContent =
    `1–${bounds.max} ${distanceUnits() === 'imperial' ? 'mph' : 'km/h'}`;
  $('speed-unit').textContent = distanceUnits() === 'imperial' ? 'mph' : 'km/h';
  unitSelects();
  for (const key of ['osrm', 'valhalla', 'nominatim'] as const)
    $<HTMLInputElement>(key).value = state[key];
  $<HTMLInputElement>('route-name').value = state.name;
  $<HTMLInputElement>('prefer').checked = state.prefer;
}
function pointLabel(i: number): string {
  return i === 0
    ? 'Start'
    : i === state.points.length - 1
      ? 'Destination'
      : `Stop ${i}`;
}
function selectPoint(i: number, showMap = false) {
  selected = i;
  updateSelection();
  renderMarkers();
  if (showMap) {
    $('map').scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (state.points[i].coord) map.panTo(state.points[i].coord!);
  }
}
function updateSelection() {
  $('points')
    .querySelectorAll('li')
    .forEach((row, i) => {
      row.classList.toggle('selected', i === selected);
      row
        .querySelector('button')
        ?.setAttribute('aria-pressed', String(i === selected));
    });
  // A sentence, not the field label: "Set the start on the map".
  const target =
    selected === 0
      ? 'the start'
      : selected === state.points.length - 1
        ? 'the destination'
        : `stop ${selected}`;
  $('map-note').textContent = locked
    ? 'Route locked. Unlock editing to change it.'
    : matchMedia('(pointer: coarse)').matches
      ? 'Touch and hold to choose a route point'
      : `Set ${target} on the map`;
  $<HTMLButtonElement>('undo').disabled =
    locked || (!undoHistory.canUndo && !dirty.size);
  $<HTMLButtonElement>('calculate').disabled =
    locked || state.points.some((p) => !p.coord) || dirty.size > 0;
}
function setPoint(
  point: Point,
  index: number,
  coord: Coord,
  name?: string,
  preserveEditor = false,
) {
  point.coord = coord;
  if (name) point.name = name;
  drafts.delete(point);
  dirty.delete(point);
  const next = state.points.findIndex((p, i) => i > index && !p.coord);
  if (next >= 0) selected = next;
  changed(preserveEditor);
  if (preserveEditor) {
    const input = $<HTMLInputElement>(`location-${index}`);
    input.value = pointValue(point);
    input.removeAttribute('aria-invalid');
    $(`point-results-${index}`).replaceChildren();
  }
}
function pointValue(point: Point): string {
  return (
    drafts.get(point) ??
    (point.coord
      ? /^(Start|Destination|Stop \d+|Point \d+|Return to start)$/.test(
          point.name,
        )
        ? point.coord.map((n) => n.toFixed(6)).join(', ')
        : point.name
      : '')
  );
}
function renderPoints() {
  const list = $('points');
  const scroll = list.scrollTop;
  autocompleteCleanups.forEach((close) => close());
  autocompleteCleanups = [];
  list.replaceChildren();
  $('point-count').textContent = `${state.points.length} points`;
  state.points.forEach((point, i) => {
    const row = document.createElement('li');
    row.className = i === selected ? 'selected' : '';
    const choose = text(
      'button',
      String(i + 1),
      'point-number',
    ) as HTMLButtonElement;
    choose.type = 'button';
    choose.setAttribute('aria-label', `Select point ${i + 1}`);
    choose.setAttribute('aria-pressed', String(i === selected));
    choose.title = 'Set on map';
    choose.onclick = () => selectPoint(i, true);
    const fields = document.createElement('div');
    fields.className = 'point-fields';
    const label = text('label', pointLabel(i));
    label.setAttribute('for', `location-${i}`);
    const form = document.createElement('form');
    form.className = 'point-location-form';
    const input = document.createElement('input');
    input.id = `location-${i}`;
    input.value = pointValue(point);
    input.placeholder = 'Address or lat, lon';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', `Location of point ${i + 1}`);
    input.enterKeyHint = 'search';
    input.readOnly = locked;
    const results = document.createElement('div');
    results.id = `point-results-${i}`;
    results.className = 'point-results';
    results.setAttribute('aria-label', `Results for point ${i + 1}`);
    const suggestions = document.createElement('div');
    suggestions.id = `suggestions-${i}`;
    suggestions.className = 'point-results suggestions';
    suggestions.setAttribute('aria-label', `Results for point ${i + 1}`);
    const closeSuggestions = addressAutocomplete(input, suggestions, {
      base: () => photonUrl,
      center: () => [map.getCenter().lat, map.getCenter().lng],
      valid: () => state.points[i] === point && input.isConnected,
      choose: (result) => {
        if (editBlocked()) return;
        const coord = parseCoordinates(`${result.lat},${result.lon}`);
        if (!coord) return;
        setPoint(point, i, coord, result.display_name.slice(0, 240), true);
        map.panTo(coord);
      },
      pending: () => status('Searching…'),
      completed: (count) =>
        status(
          count
            ? 'Choose a place.'
            : 'No suggestions found. Press Enter to search with Nominatim.',
        ),
      failed: () =>
        status(
          'Suggestions unavailable. Press Enter to search with Nominatim.',
        ),
    });
    autocompleteCleanups.push(closeSuggestions);
    let coordinateTimer: ReturnType<typeof setTimeout>;
    let addressTimer: ReturnType<typeof setTimeout>;
    function commitCoordinates() {
      if (state.points[i] !== point || !input.isConnected) return false;
      const c = parseCoordinates(input.value);
      if (!c) return false;
      clearTimeout(coordinateTimer);
      if (
        !dirty.has(point) &&
        point.coord &&
        point.coord[0] === c[0] &&
        point.coord[1] === c[1]
      )
        return true;
      setPoint(point, i, c, pointLabel(i), true);
      return true;
    }
    input.onfocus = () => selectPoint(i);
    input.oninput = () => {
      drafts.set(point, input.value);
      dirty.add(point);
      selected = i;
      revision++;
      clearTimeout(timer);
      current = null;
      weather.invalidate();
      updateSaveButton();
      line.clearLayers();
      clearSummary();
      $<HTMLButtonElement>('download').disabled = true;
      results.replaceChildren();
      input.removeAttribute('aria-invalid');
      updateSelection();
      renderMarkers();
      clearTimeout(coordinateTimer);
      if (parseCoordinates(input.value))
        coordinateTimer = setTimeout(commitCoordinates, 600);
      status('Enter a place, or paste coordinates.');
    };
    input.onchange = () => {
      commitCoordinates();
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      closeSuggestions();
      if (editBlocked()) return;
      if (commitCoordinates()) return;
      const q = input.value.trim();
      if (q.length < 3) {
        input.setAttribute('aria-invalid', 'true');
        status('Enter a place or valid coordinates.', true);
        return;
      }
      if (/^[\s(+-]*\d/.test(q) && /[,;]/.test(q)) {
        input.setAttribute('aria-invalid', 'true');
        status(
          'Invalid coordinates. Use latitude, longitude (for example: -22.90, -43.18).',
          true,
        );
        return;
      }
      const version = (lookupVersions.get(point) ?? 0) + 1;
      lookupVersions.set(point, version);
      status('Searching…');
      results.replaceChildren();
      clearTimeout(addressTimer);
      addressTimer = setTimeout(() => {
        void searchAddress(q, state.nominatim)
          .then((matches) => {
            if (
              version !== lookupVersions.get(point) ||
              state.points[i] !== point ||
              input.value.trim() !== q
            )
              return;
            if (!matches.length) {
              status(
                'No address found. Try a nearby street, city, or coordinates.',
                true,
              );
              return;
            }
            matches.forEach((r) => {
              const b = text('button', r.display_name) as HTMLButtonElement;
              b.type = 'button';
              b.onclick = () => {
                if (editBlocked()) return;
                const c = parseCoordinates(`${r.lat},${r.lon}`);
                if (!c) {
                  status('Search returned invalid coordinates.', true);
                  return;
                }
                setPoint(
                  point,
                  i,
                  c,
                  r.display_name.split(',').slice(0, 2).join(',').slice(0, 240),
                  true,
                );
                map.panTo(c);
              };
              results.append(b);
            });
            status('Choose a place.');
          })
          .catch(() => {
            if (version === lookupVersions.get(point))
              status(
                'Address search unavailable. Try again later or paste coordinates.',
                true,
              );
          });
      }, 500);
    };
    form.append(input);
    const controls = document.createElement('div');
    controls.className = 'point-controls';
    controls.append(form);
    fields.append(label, controls, suggestions, results);
    const actions = document.createElement('div');
    actions.className = 'point-actions';
    const onMap = text('button', 'Set on map') as HTMLButtonElement;
    onMap.type = 'button';
    iconControl(onMap, 'pin', 'Set on map');
    onMap.onclick = () => selectPoint(i, true);
    actions.append(onMap);
    for (const [symbol, delta] of [
      ['↑', -1],
      ['↓', 1],
    ] as const) {
      const b = text('button', symbol) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute(
        'aria-label',
        `Move point ${i + 1} ${delta < 0 ? 'up' : 'down'}`,
      );
      iconControl(
        b,
        delta < 0 ? 'up' : 'down',
        `Move point ${i + 1} ${delta < 0 ? 'up' : 'down'}`,
        true,
      );
      b.disabled = locked || i + delta < 0 || i + delta >= state.points.length;
      b.onclick = () => {
        if (editBlocked()) return;
        [state.points[i], state.points[i + delta]] = [
          state.points[i + delta],
          state.points[i],
        ];
        selected = i + delta;
        changed();
      };
      actions.append(b);
    }
    const remove = text('button', '×') as HTMLButtonElement;
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove point ${i + 1}`);
    iconControl(remove, 'close', `Remove point ${i + 1}`, true);
    remove.disabled = locked || state.points.length <= 2;
    remove.onclick = () => {
      if (editBlocked()) return;
      dirty.delete(point);
      state.points.splice(i, 1);
      selected = Math.min(selected, state.points.length - 1);
      changed();
    };
    actions.append(remove);
    controls.append(actions);
    row.append(choose, fields);
    list.append(row);
  });
  list.scrollTop = scroll;
  renderMarkers();
  updateSelection();
  $<HTMLButtonElement>('add').disabled = locked || state.points.length >= 50;
}
function renderMarkers() {
  markers.clearLayers();
  state.points.forEach((p, i) => {
    if (!p.coord || dirty.has(p)) return;
    const m = L.marker(p.coord, {
      draggable: !locked,
      icon: L.divIcon({
        className: `route-marker ${i === selected ? 'active' : ''}`,
        html: `<span><b>${i + 1}</b></span>`,
        iconSize: [30, 38],
        iconAnchor: [15, 36],
      }),
    }).addTo(markers);
    m.bindTooltip(text('span', t(p.name)));
    m.on('click', () => selectPoint(i));
    m.on('dragend', () => {
      const c = m.getLatLng();
      selected = i;
      setPoint(p, i, [c.lat, c.lng]);
    });
  });
}
function drawRoute(route: Route) {
  line.clearLayers();
  const anchors =
    route.snapped ?? state.points.flatMap((p) => (p.coord ? [p.coord] : []));
  const repeated = repeatsFor(route);
  // Stretches travelled twice in opposite directions become two parallel
  // lines, each offset to the right of its own direction (visual only).
  const pieces = repeated.length
    ? (() => {
        const total = route.segments.reduce(
          (sum, s) =>
            sum + s.slice(1).reduce((n, c, i) => n + meters(s[i], c), 0),
          0,
        );
        const slices = sliceByRanges(
          route.segments,
          splitByRepeat([{ from: 0, to: total, kind: 'route' }], repeated),
        );
        const coords = offsetSlices(map, slices);
        return slices.map((s, i) => ({
          repeated: s.repeated,
          coords: coords[i],
        }));
      })()
    : route.segments.map((coords) => ({ repeated: false, coords }));
  pieces.forEach(({ repeated: pass, coords }) => {
    const visual = simplifyTrack(
      coords,
      (coord) => map.project(coord),
      0.75,
      anchors,
    );
    L.polyline(visual, {
      color: '#fff',
      weight: pass ? 6 : 8,
      opacity: 0.95,
      smoothFactor: 0,
      className: 'route-casing',
    }).addTo(line);
    L.polyline(visual, {
      color: '#12796e',
      weight: pass ? 3 : 4,
      opacity: 1,
      smoothFactor: 0,
      className: pass ? 'route-line route-line-pass' : 'route-line',
    }).addTo(line);
  });
}
map.on('zoomend', () => {
  if (current) drawRoute(current);
});
function clearSummary() {
  $('summary').hidden = true;
  $('route-details').hidden = true;
  $('peek-main').textContent = '';
  for (const id of ['summary-content', 'summary-notes', 'itinerary'])
    $(id).replaceChildren();
  renderDaylight(state, null, speedKmh);
  maneuverLayer.clearLayers();
  playback.setRoute(null);
  elevation.setRoute(null);
  overlays.refresh();
  marks.refresh();
}
const ROAD_CHANGED =
  'Directions not added: the road has changed. Calculate route to update it.';
/** Routes already asked for directions, so reopening never asks again. */
const directionsTried = new WeakSet<Route>();
/** Progress or outcome of a directions request, per route. */
const directionsStatus = new WeakMap<Route, string>();
/** Itinerary open across re-renders (language, units, new directions). */
let itineraryOpen = false;
/** The saved entry the shown route came from, to store added directions. */
let savedOrigin: { id: string; route: Route } | null = null;

/**
 * Adds missing turn directions without changing the geometry: map matching
 * for an imported track, or one step-only route request for a route saved
 * before directions existed (kept only when it follows the same road).
 */
async function addDirections(route: Route) {
  const need = missingDirections(route);
  if (!need || directionsTried.has(route)) return;
  directionsTried.add(route);
  const version = revision;
  const shown = () => current === route && revision === version;
  const show = (message: string) => {
    directionsStatus.set(route, message);
    const element = document.getElementById('directions-status');
    if (element && shown()) {
      element.textContent = t(message);
      element.hidden = false;
    }
  };
  show('Finding directions…');
  try {
    let steps: Route['steps'] | null;
    if (need === 'match')
      // Traces restart at every route point, so after an edit only the legs
      // next to the changed point are requested again; the rest is cached.
      steps = await osrmMatch(
        state.osrm,
        route.segments,
        legDistances(
          route.segments,
          state.points.flatMap((p) => (p.coord ? [p.coord] : [])),
        ),
        shown,
        (done, all) => show(`Finding directions… ${done}/${all}`),
      );
    else {
      const fresh = await calculate(structuredClone(state), shown);
      steps = sameRoad(route, fresh) ? fresh.steps : null;
    }
    if (!shown()) return;
    if (steps) {
      route.steps = steps;
      directionsStatus.delete(route);
      if (savedOrigin?.route === route)
        void updateSavedSteps(savedOrigin.id, route)
          .then(() => refreshSavedRoutes())
          .catch(() => {
            /* Directions still show; the saved entry keeps its old steps. */
          });
    } else {
      directionsStatus.set(route, ROAD_CHANGED);
      // Remembered in the saved entry: reopening does not ask again.
      if (savedOrigin?.route === route)
        void markDirectionsChecked(savedOrigin.id)
          .then(() => refreshSavedRoutes())
          .catch(() => {
            /* Only means it may be asked again next time. */
          });
    }
  } catch (error) {
    if (!shown() || (error as Error).name === 'AbortError') return;
    directionsStatus.set(
      route,
      need === 'match'
        ? 'Directions unavailable for this track.'
        : 'Directions unavailable. Try again later.',
    );
  }
  if (current === route) renderSummary(route);
}

/** Route summary card; departure, units, speed and language changes only re-render this. */
function renderSummary(route: Route) {
  const locale = state.language === 'pt' ? 'pt-BR' : 'en';
  // Our own estimate from the traveler's speed, never the router's duration.
  const duration = travelTimeSeconds(route.distance, speedKmh);
  const minutes = Math.round(duration / 60);
  const summary = $('summary-content'),
    notes = $('summary-notes'),
    itinerary = $('itinerary');
  $('summary').hidden = false;
  $('route-details').hidden = false;
  summary.replaceChildren();
  notes.replaceChildren();
  itinerary.replaceChildren();
  const leaving = departureOf(state);
  const departure = leaving ? Date.parse(leaving) : NaN;
  const stats = document.createElement('dl');
  stats.className = 'stats';
  const stat = (label: string, value: string, note?: string) => {
    const item = document.createElement('div');
    const term = text('dt', label);
    const data = document.createElement('dd');
    data.append(text('strong', value));
    // A smaller second line, so the value stays on one line on phones.
    if (note) data.append(text('span', note));
    item.append(term, data);
    stats.append(item);
  };
  const distance = distanceLabel(route.distance, distanceUnits(), locale);
  const time =
    minutes === null
      ? '—'
      : minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)}h ${minutes % 60} min`;
  stat('Distance', distance);
  stat('Time', time);
  // Shown on the handle of the closed bottom sheet.
  $('peek-main').textContent = `${distance} · ${time}`;
  if (duration !== null && Number.isFinite(departure)) {
    const arrival = new Date(departure + duration * 1000);
    // The date is added only when the arrival is on another day.
    stat(
      'Arrival',
      arrival.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
      arrival.toDateString() === new Date(departure).toDateString()
        ? undefined
        : arrival.toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
          }),
    );
  }
  // The basis of the time estimate, next to the numbers it explains.
  const speed = speedFromKmh(speedKmh, distanceUnits()).toLocaleString(locale, {
    maximumFractionDigits: 1,
  });
  const basis = `At ${speed} ${distanceUnits() === 'imperial' ? 'mph' : 'km/h'} · no stops`;
  const daylight = document.createElement('div');
  daylight.id = 'daylight-summary';
  summary.append(stats, text('p', basis, 'hint stats-basis'), daylight);
  renderDaylight(state, route, speedKmh);
  playback.setRoute(route);
  elevation.setRoute(route);
  overlays.refresh();
  marks.refresh();
  const chips = document.createElement('div');
  chips.className = 'chips';
  const refs = highways(route.steps);
  refs.forEach((ref) => chips.append(text('span', ref)));
  const local = state.prefer ? localSections(route.steps) : [];
  // Street-by-street detail: the Itinerary row of the summary card.
  const roads = document.createElement('details');
  roads.className = 'road-list';
  roads.append(
    text(
      'summary',
      `Itinerary (${route.steps.filter((s) => s.distance > 0).length})`,
    ),
    text(
      'p',
      `${route.provider} · ${route.segments.reduce((n, s) => n + s.length, 0).toLocaleString(locale)} points`,
      'hint',
    ),
  );
  // Directions missing (imported track, or saved before they existed) are
  // fetched when the itinerary is opened; their progress or outcome shows here.
  const directions = text('p', directionsStatus.get(route) ?? '', 'hint');
  directions.id = 'directions-status';
  directions.hidden = !directionsStatus.has(route);
  roads.append(directions);
  roads.open = itineraryOpen;
  roads.addEventListener('toggle', () => {
    itineraryOpen = roads.open;
    if (roads.open) void addDirections(route);
  });
  if (roads.open) void addDirections(route);
  if (local.length) {
    roads.append(
      text('p', 'Highlighted roads are local sections to review.', 'hint'),
    );
    // The warning stays visible on the card and leads to the first section.
    const review = text(
      'button',
      local.length === 1
        ? '1 road section to review'
        : `${local.length} road sections to review`,
      'warning review-link',
    ) as HTMLButtonElement;
    review.type = 'button';
    review.onclick = () => {
      roads.open = true;
      const first = roads.querySelector<HTMLElement>('.local-road');
      if (!first) return;
      first.scrollIntoView({ block: 'nearest' });
      (first.querySelector('button') ?? first).focus({ preventScroll: true });
    };
    notes.append(review);
  }
  const ul = document.createElement('ul');
  const positions = maneuverPositions(route, !isImportedRoute(route));
  // Without any position (an imported track's rerouted parts saved before
  // locations existed), the km column is left out rather than kept empty.
  const withPositions = positions.some((at) => at !== null);
  maneuverLayer.clearLayers();
  route.steps.forEach((s, n) => {
    if (s.distance <= 0) return;
    const li = document.createElement('li');
    // A step with a maneuver location is a button that shows it on the map.
    // The grid (position, arrow, instruction and road) is an inner element:
    // older Safari does not lay out a <button> itself as a grid and falls
    // back to the centered button layout.
    const holder: HTMLElement = document.createElement(s.at ? 'button' : 'div');
    holder.className = 'step-item';
    const row = document.createElement('span');
    row.className = 'step-row';
    holder.append(row);
    // Turn direction from the router; the instruction stays an English key
    // that the DOM translation handles.
    const arrow = maneuverIcon(s);
    const instruction = maneuverText(s);
    const at = positions[n];
    if (withPositions)
      row.append(
        text(
          'span',
          // Trailing space keeps the text readable when copied or read aloud.
          at === null ? '' : `${milepostLabel(at, distanceUnits(), locale)} `,
          'milepost',
        ),
      );
    else row.classList.add('no-position');
    if (arrow) {
      const svg = icon(arrow.name);
      svg.classList.add('maneuver-icon');
      if (arrow.mirror) svg.classList.add('mirror');
      row.append(svg);
    } else row.append(text('span', '', 'maneuver-icon'));
    // One line: shortened road names and compact lengths; the full text stays
    // in the tooltip and accessible label.
    const road = t(s.name);
    const length = stepDistanceLabel(s.distance, distanceUnits(), locale);
    // Highway references are in the chips above the list; on the line they
    // stand in only for a road without a name.
    const shortRoad =
      s.ref && s.name === 'Unnamed road' ? s.ref : shortRoadName(road);
    const full = `${instruction ? `${t(instruction)} · ` : ''}${s.ref ? `${s.ref} · ` : ''}${road} · ${length}`;
    const body = document.createElement('span');
    body.className = 'step-text';
    if (instruction)
      body.append(
        text('span', instruction, 'maneuver'),
        document.createTextNode(' · '),
      );
    body.append(document.createTextNode(`${shortRoad} · ${length}`));
    row.append(body);
    holder.title = full;
    if (s.at) {
      const button = holder as HTMLButtonElement;
      button.type = 'button';
      button.classList.add('maneuver-link');
      button.setAttribute('aria-controls', 'map');
      button.setAttribute(
        'aria-label',
        `${t('Show on map')}: ${at === null ? '' : `${milepostLabel(at, distanceUnits(), locale)} · `}${full}`,
      );
      const coord = s.at;
      button.onclick = () => showManeuver(coord);
    }
    li.append(holder);
    if (local.includes(s)) li.className = 'local-road';
    ul.append(li);
  });
  roads.append(chips, ul);
  itinerary.append(roads);
  if (route.snapped) {
    const far = route.snapped
      .map((p, i) => ({
        distance: state.points[i]?.coord
          ? meters(p, state.points[i].coord!)
          : 0,
        index: i,
      }))
      .filter((p) => p.distance > 100);
    if (far.length)
      notes.append(
        text(
          'p',
          `Check road positions: ${far.map((p) => `${p.index + 1} (${shortDistanceLabel(p.distance, distanceUnits())})`).join(', ')}`,
          'warning',
        ),
      );
  }
}
function renderRoute(route: Route) {
  undoHistory.attach(route);
  trackBase =
    isImportedRoute(route) && state.points.every((p) => p.coord)
      ? { route, points: state.points.map((p) => p.coord!) }
      : null;
  drawRoute(route);
  renderSummary(route);
  $<HTMLButtonElement>('download').disabled = false;
  updateSaveButton();
  weather.render();
}
function changed(preserveEditor = false, forceRouting = false) {
  weather.invalidate();
  revision++;

  current = null;
  $<HTMLButtonElement>('download').disabled = true;
  clearTimeout(timer);
  syncUrl();
  if (preserveEditor) {
    updateSelection();
    renderMarkers();
  } else renderPoints();
  settings();
  line.clearLayers();
  clearSummary();
  if (state.points.some((p) => !p.coord) || dirty.size) {
    status(
      !state.points[0].coord
        ? 'Set your start.'
        : !state.points.at(-1)!.coord
          ? 'Set your destination.'
          : 'Set all stops.',
    );
    return;
  }
  status('Updating…');
  const version = revision;
  const snapshot = structuredClone(state);
  // Calculate route asks for a fresh router result over the whole route.
  const base = forceRouting ? null : trackBase;
  timer = setTimeout(() => {
    status('Calculating…');
    $<HTMLButtonElement>('calculate').disabled = true;
    const isCurrent = () => version === revision;
    const route = (s: State) => {
      const cached = forceRouting ? undefined : routingCache.get(s);
      return cached
        ? Promise.resolve(cached)
        : calculate(s, isCurrent).then((r) => {
            if (isCurrent()) routingCache.set(s, r);
            return r;
          });
    };
    // Imported tracks keep every unchanged leg; only edited legs are rerouted.
    void (
      base
        ? routeKeepingLegs(snapshot, base, route).then(
            (r) => r ?? route(snapshot),
          )
        : route(snapshot)
    )
      .then((route) => {
        if (version !== revision) return;
        current = route;
        renderRoute(route);
        status('Route ready.');
        updateSelection();
        fit();
      })
      .catch((e) => {
        if (version === revision) updateSelection();
        if (version === revision)
          status(
            e instanceof Error
              ? e.message
              : 'Routing server unavailable. Please try again.',
            true,
          );
      });
  }, 900);
}
setupPointMenu(
  map,
  (kind, coord) => {
    if (editBlocked()) return;
    if (kind === 'stop') {
      if (state.points.length >= 50) {
        status('The route already has 50 points.', true);
        return;
      }
      state.points.splice(state.points.length - 1, 0, {
        name: `Stop ${state.points.length - 1}`,
        coord,
      });
      selected = state.points.length - 2;
      changed();
    } else {
      selected = kind === 'start' ? 0 : state.points.length - 1;
      setPoint(state.points[selected], selected, coord, pointLabel(selected));
    }
  },
  (coord) => setPoint(state.points[selected], selected, coord),
  () => !editBlocked(),
);
// After the point menu, so its long press exists when a quick zoom cancels it.
setupQuickZoom(map);
$('calculate').onclick = () => {
  if (editBlocked()) return;
  if (dirty.size || state.points.some((p) => !p.coord)) {
    status('Set your start and destination.', true);
    return;
  }
  changed(false, true);
};
$('undo').onclick = () => {
  if (editBlocked()) return;
  if (dirty.size) {
    dirty.clear();
    drafts = new WeakMap();
    changed();
    status('Change undone.');
    return;
  }
  const previous = undoHistory.undo();
  if (!previous) return;
  state = previous;
  const restoredLanguage = state.language ?? getLanguage();
  state.language = restoredLanguage;
  setLanguage(restoredLanguage);
  $<HTMLSelectElement>('language').value = restoredLanguage;
  drafts = new WeakMap();
  dirty.clear();
  selected = Math.max(
    0,
    state.points.findIndex((p) => !p.coord),
  );
  const cached = undoHistory.attachment;
  changed();
  if (cached) {
    clearTimeout(timer);
    current = cached;
    renderRoute(cached);
    fit();
  }
  status('Change undone.');
};
window.addEventListener('keydown', (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === 'z' &&
    !e.shiftKey &&
    !(
      e.target instanceof Element &&
      e.target.closest('input,textarea,[contenteditable]')
    )
  ) {
    e.preventDefault();
    $('undo').click();
  }
});
$('add').onclick = () => {
  if (editBlocked() || state.points.length >= 50) return;
  state.points.splice(state.points.length - 1, 0, {
    name: `Stop ${state.points.length - 1}`,
    coord: null,
  });
  selected = state.points.length - 2;
  changed();
};
$('reverse').onclick = () => {
  if (editBlocked()) return;
  state.points.reverse();
  selected = 0;
  changed();
};
$('roundtrip').onclick = () => {
  if (editBlocked()) return;
  if (state.points.length * 2 - 1 > 50) {
    status('A round trip would exceed the 50-point limit.', true);
    return;
  }
  state.points.push(...structuredClone(state.points.slice(0, -1).reverse()));
  state.points.at(-1)!.name = 'Return to start';
  changed();
  status('Round trip added. Check stops on divided roads.');
};
$('fit').onclick = fit;
/** Unit selects in Settings; Automatic names what this device resolves to. */
function unitSelects() {
  const found = detectedUnits();
  const label = (id: string, texts: string[]) =>
    texts.forEach((text, i) => {
      $<HTMLSelectElement>(id).options[i].textContent = t(text);
    });
  label('distance-units', [
    `Automatic (${found.distance === 'imperial' ? 'mi' : 'km'})`,
    'Kilometers',
    'Miles',
  ]);
  label('temperature-units', [
    `Automatic (${found.temperature === 'fahrenheit' ? '°F' : '°C'})`,
    'Celsius',
    'Fahrenheit',
  ]);
  $<HTMLSelectElement>('distance-units').value = chosenDistanceUnits();
  $<HTMLSelectElement>('temperature-units').value = chosenTemperatureUnits();
}
// Units are device preferences applied at once: no rerouting or new requests.
$<HTMLSelectElement>('distance-units').onchange = () => {
  rememberDistanceUnits(
    $<HTMLSelectElement>('distance-units').value as DistanceChoice,
  );
  const units = distanceUnits();
  // Switching units keeps the speed on a notch of the new scale.
  speedKmh = speedToKmh(snapSpeed(speedFromKmh(speedKmh, units), units), units);
  rememberSpeedKmh(speedKmh);
  settings();
  if (current) renderRoute(current);
  void refreshSavedRoutes();
};
$<HTMLSelectElement>('temperature-units').onchange = () => {
  rememberTemperatureUnits(
    $<HTMLSelectElement>('temperature-units').value as TemperatureChoice,
  );
  if (current) renderRoute(current);
};

$<HTMLInputElement>('prefer').onchange = () => {
  state.prefer = $<HTMLInputElement>('prefer').checked;
  syncUrl();
  if (current) renderRoute(current);
};
$('save-settings').onclick = () => {
  try {
    // Validate every URL before applying any, so an invalid field changes nothing.
    const servers = (['osrm', 'valhalla', 'nominatim'] as const).map(
      (key) => [key, serverUrl($<HTMLInputElement>(key).value.trim())] as const,
    );
    const photon = serverUrl($<HTMLInputElement>('photon').value.trim());
    const reroute = servers.some(([key, url]) => state[key] !== url);
    // Routing server changes recalculate the route; device preferences do not.
    if (reroute && editBlocked()) return;
    weather.applyServer(); // Validates its own URL before changing anything.
    for (const [key, url] of servers) state[key] = url;
    photonUrl = photon;
    try {
      localStorage.setItem('photon-url', photonUrl);
    } catch {
      /* Optional preference. */
    }
    state.name = $<HTMLInputElement>('route-name').value.trim();
    // Only a routing server change needs a new route; names and search servers do not.
    if (reroute) changed();
    else {
      settings();
      syncUrl();
      if (current) {
        // Undo to this step restores the shown geometry instead of rerouting.
        undoHistory.attach(current);
        weather.render(); // Picks up a changed weather server.
      }
      status('Settings applied.');
    }
    $<HTMLDialogElement>('settings-dialog').close();
  } catch (e) {
    status((e as Error).message, true);
    // The status line is behind the dialog; repeat the reason inside it.
    $('settings-status').textContent = (e as Error).message;
  }
};
$<HTMLInputElement>('route-name').oninput = () => {
  state.name = $<HTMLInputElement>('route-name').value.trim();
  updateSaveButton();
};
$<HTMLInputElement>('route-name').onchange = () => {
  state.name = $<HTMLInputElement>('route-name').value.trim();
  syncUrl();
  if (current) undoHistory.attach(current);
};
function gpxContent(): string {
  return generateGpx(
    current!,
    state.points,
    state.name || `${state.points[0].name} to ${state.points.at(-1)!.name}`,
  );
}
function shareableFile(content = false) {
  if (!navigator.canShare || !navigator.share) return null;
  return shareFile(
    content && current ? gpxContent() : '<gpx/>',
    filename(state.points, state.name),
    (data) => navigator.canShare(data),
  );
}
$('share-gpx').onclick = () => {
  if (!current) return;
  const file = shareableFile(true);
  if (!file) {
    status('GPX sharing unavailable. Use Download GPX instead.', true);
    return;
  }
  void navigator
    .share({ files: [file], title: state.name || file.name })
    .catch((error) => {
      if (error?.name !== 'AbortError')
        status('Could not share GPX. Use Download GPX instead.', true);
    });
};
$('download').onclick = () => {
  if (!current) return;
  const blob = new Blob([gpxContent()], {
    type: 'application/gpx+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename(state.points, state.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('GPX downloaded.');
};
$('share').onclick = () => {
  syncUrl();
  void navigator.clipboard
    .writeText(location.href)
    .then(() => status('Link copied.'))
    .catch(() => status('Copy the link from your address bar.'));
};
$<HTMLInputElement>('import').onchange = () => {
  const file = $<HTMLInputElement>('import').files?.[0];
  if (!file) return;
  if (editBlocked()) {
    $<HTMLInputElement>('import').value = '';
    return;
  }
  if (file.size > 10_000_000) {
    status('Choose a file smaller than 10 MB.', true);
    return;
  }
  void file
    .arrayBuffer()
    .then((buffer) => {
      const imported = importTrackFile(new Uint8Array(buffer));
      revision++;
      clearTimeout(timer);
      dirty.clear();
      drafts = new WeakMap();
      state.points = imported.points;
      // A file without a name gets one in the current interface language.
      state.name = imported.name || t('Imported route');
      selected = 0;
      weather.invalidate();
      current = imported.route;
      if (imported.elevations)
        recordedElevation.set(current, imported.elevations);
      if (imported.indices)
        rememberLegs(current, legsAt(current.segments, imported.indices));
      syncUrl();
      renderPoints();
      settings();
      renderRoute(current);
      fit();
      status('Route imported. Edits recalculate only the changed sections.');
    })
    .catch((e) => status((e as Error).message, true))
    .finally(() => {
      $<HTMLInputElement>('import').value = '';
    });
};
window.addEventListener('hashchange', () => {
  try {
    state = fromLink(decodeState(location.hash));
    // A link stores points, not imported geometry: route it from scratch.
    trackBase = null;
    const lang = state.language ?? getLanguage();
    state.language = lang;
    setLanguage(lang);
    settings();
    $<HTMLSelectElement>('language').value = lang;
    selected = 0;
    changed();
    fit();
  } catch {
    status('Invalid route link. Your current route has been kept.', true);
  }
});
settings();
renderPoints();
if (state.points.every((p) => p.coord)) changed();
fit();

$('export-json').onclick = () => {
  $<HTMLTextAreaElement>('state-json').value = JSON.stringify(state, null, 2);
};
$('apply-json').onclick = () => {
  if (editBlocked()) return;
  try {
    const parsed: unknown = JSON.parse(
      $<HTMLTextAreaElement>('state-json').value,
    );
    state = validateState(parsed);
    selected = 0;
    changed();
    fit();
    $<HTMLDialogElement>('settings-dialog').close();
  } catch {
    const message =
      'Invalid JSON state. Load the current state to see the expected format.';
    status(message, true);
    $('settings-status').textContent = message;
  }
};

const initialLanguage: Language = state.language ?? preferredLanguage();
state.language = initialLanguage;
$<HTMLSelectElement>('language').value = initialLanguage;
setLanguage(initialLanguage);
pageLinks(initialLanguage, encodeState(state));
renderPoints();
observeTranslations();
$<HTMLSelectElement>('language').onchange = () => {
  const lang = $<HTMLSelectElement>('language').value as Language;
  rememberLanguage(lang);
  state.language = lang;
  setLanguage(lang);
  settings();
  pageLinks(lang, encodeState(state));
  renderPoints();
  if (current) renderRoute(current);
  syncUrl();
  void refreshSavedRoutes();
};

function updateSpeedEstimate() {
  if (current) renderRoute(current);
  status(current ? 'Route ready.' : 'Set your start and destination.');
}
$<HTMLInputElement>('average-speed').oninput = () => {
  const value = snapSpeed(
    Number($<HTMLInputElement>('average-speed').value),
    distanceUnits(),
  );
  speedKmh = speedToKmh(value, distanceUnits());
  rememberSpeedKmh(speedKmh);
  $('average-speed-value').textContent = String(value);
  const input = $<HTMLInputElement>('average-speed');
  input.setAttribute('aria-valuenow', String(value));
  input.setAttribute(
    'aria-valuetext',
    `${value} ${distanceUnits() === 'imperial' ? 'mph' : 'km/h'}`,
  );
  updateSpeedEstimate();
};
function updateSaveButton() {
  $('share-gpx').hidden = !shareableFile();
  $<HTMLButtonElement>('share-gpx').disabled = !current || dirty.size > 0;
  const button = $<HTMLButtonElement>('save-route');
  button.disabled =
    savingRoute || !current || !state.name.trim() || dirty.size > 0;
  button.textContent = savedEntries.some(
    (r) => r.id === savedRouteKey(state.name),
  )
    ? 'Update saved route'
    : 'Save route';
}
function downloadText(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshSavedRoutes() {
  const version = ++libraryRevision;
  try {
    const rows = await listSavedRoutes();
    if (version !== libraryRevision) return;
    savedEntries = rows;
    $('saved-count').textContent = `(${rows.length})`;
    const list = $('saved-list');
    list.replaceChildren();
    if (!rows.length) list.append(text('p', 'No saved routes.', 'hint'));
    rows.forEach((record) => {
      const card = document.createElement('article');
      card.className = 'saved-route';
      card.append(
        text('strong', record.name),
        text(
          'small',
          `${distanceLabel(record.route.distance, distanceUnits(), state.language === 'pt' ? 'pt-BR' : 'en')} · ${new Date(record.updatedAt).toLocaleDateString(state.language === 'pt' ? 'pt-BR' : 'en')}`,
        ),
      );
      const actions = document.createElement('div');
      const open = text('button', 'Open') as HTMLButtonElement;
      open.type = 'button';
      open.setAttribute('aria-label', `Open saved route: ${record.name}`);
      open.classList.add('open-saved');
      open.disabled = locked;
      open.onclick = () => {
        if (editBlocked()) return;
        const language = state.language;
        revision++;
        clearTimeout(timer);
        dirty.clear();
        drafts = new WeakMap();
        // Validation strips legacy fields such as a stored average speed.
        state = validateState(structuredClone(record.state));
        state.language = language;
        selected = 0;
        weather.invalidate();
        current = structuredClone(record.route);
        savedOrigin = { id: record.id, route: current };
        // Tried before and the road had changed: show that, ask nothing.
        if (record.directionsChecked) {
          directionsTried.add(current);
          directionsStatus.set(current, ROAD_CHANGED);
        }
        syncUrl();
        settings();
        renderPoints();
        renderRoute(current);
        fit();
        status('Saved route opened.');
        void refreshSavedRoutes();
      };
      const download = text('button', 'Download GPX') as HTMLButtonElement;
      download.type = 'button';
      download.setAttribute(
        'aria-label',
        `Download saved route: ${record.name}`,
      );
      download.onclick = () =>
        downloadText(
          generateGpx(record.route, record.state.points, record.name),
          filename(record.state.points, record.name),
          'application/gpx+xml;charset=utf-8',
        );
      const remove = text('button', 'Delete') as HTMLButtonElement;
      remove.type = 'button';
      remove.setAttribute('aria-label', `Delete saved route: ${record.name}`);
      remove.onclick = () => {
        void deleteSavedRoute(record.id)
          .then(() => {
            libraryMessage('Saved route deleted.');
            return refreshSavedRoutes();
          })
          .catch(() => libraryMessage('Could not access saved routes.', true));
      };
      actions.append(open, download, remove);
      card.append(actions);
      list.append(card);
    });
    $<HTMLButtonElement>('backup-routes').disabled = !rows.length;
    updateSaveButton();
  } catch {
    libraryMessage('Local route storage is unavailable in this browser.', true);
  }
}
function libraryMessage(message: string, error = false) {
  $('library-status').textContent = message;
  $('library-status').classList.toggle('error', error);
}
$('save-route').onclick = () => {
  if (!current || !state.name.trim() || dirty.size) return;
  const snapshot = structuredClone(state);
  const route = structuredClone(current);
  savingRoute = true;
  updateSaveButton();
  void saveNamedRoute(snapshot, route)
    .then(() => {
      status('Route saved on this device.');
      libraryMessage('Route saved on this device.');
      return refreshSavedRoutes();
    })
    .catch(() => {
      status('Could not save locally. Download the GPX to keep it.', true);
    })
    .finally(() => {
      savingRoute = false;
      updateSaveButton();
    });
};
$('backup-routes').onclick = () => {
  if (savedEntries.length)
    downloadText(
      exportRouteBackup(savedEntries),
      `route-gpx-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
};
$<HTMLInputElement>('restore-routes').onchange = () => {
  const input = $<HTMLInputElement>('restore-routes');
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 50_000_000) {
    libraryMessage('Choose a backup smaller than 50 MB.', true);
    input.value = '';
    return;
  }
  void file
    .text()
    .then((data) => importRouteBackup(parseRouteBackup(data)))
    .then((count) => {
      libraryMessage(
        count === 1
          ? 'Imported 1 route. Existing names were kept.'
          : `Imported ${count} routes. Existing names were kept.`,
      );
      return refreshSavedRoutes();
    })
    .catch(() => libraryMessage('Could not import this route backup.', true))
    .finally(() => {
      input.value = '';
    });
};
void refreshSavedRoutes();
updateSaveButton();

setupPanel(map);
// Settings always open with the values in use; unapplied edits are dropped.
$('open-settings').addEventListener('click', () => {
  settings();
  $<HTMLInputElement>('photon').value = photonUrl;
});
setupMapView(map, {
  hasRoute: () => state.points.some((p) => p.coord !== null),
  addPoint: (coord, asStart) => {
    if (editBlocked()) return;
    if (asStart) setPoint(state.points[0], 0, coord, 'Start');
    else if (state.points.length < 50) {
      state.points.splice(state.points.length - 1, 0, {
        name: `Stop ${state.points.length - 1}`,
        coord,
      });
      selected = state.points.length - 2;
      changed();
    }
  },
});

setupMapLayers(map);

setupMapControls(map, zoom);

function setLocked(value: boolean) {
  locked = value;
  $('lock').setAttribute('aria-pressed', String(locked));
  $('lock-notice').hidden = !locked;
  for (const id of [
    'reverse',
    'roundtrip',
    'apply-json',
    'use-link-servers',
    'location-start',
    'location-stop',
  ])
    $<HTMLButtonElement>(id).disabled = locked;
  $<HTMLInputElement>('import').disabled = locked;
  document
    .querySelectorAll<HTMLButtonElement>('#saved-list .open-saved')
    .forEach((button) => (button.disabled = locked));
  // Rebuild the editor and markers with the new read-only/draggable state.
  renderPoints();
  status(
    locked
      ? 'Route locked. Map, export and sharing still work.'
      : 'Editing unlocked.',
  );
}
$('lock').onclick = () => setLocked(!locked);
$('unlock').onclick = () => {
  setLocked(false);
  $('lock').focus();
};
