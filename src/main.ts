import {
  speedToKmh,
  speedFromKmh,
  travelTimeSeconds,
  speedInputBounds,
  snapSpeed,
} from './travel-time';
import { distanceLabel, shortDistanceLabel, type DistanceUnits } from './units';
import { UndoHistory } from './history';
import { setLanguage, t, observeTranslations, type Language } from './i18n';
import { parseDescription, intentPoints } from './description';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {
  defaults,
  decodeState,
  encodeState,
  examplePoints,
  filename,
  generateGpx,
  highways,
  importGpx,
  localSections,
  meters,
  parseCoordinates,
  serverUrl,
  type Coord,
  type Point,
  type Route,
  type State,
} from './core';
import { calculate, searchAddress } from './services';
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (tag: string, value: string, className = '') => {
  const e = document.createElement(tag);
  e.textContent = value;
  e.className = className;
  return e;
};
let state: State = defaults(),
  selected = 0,
  current: Route | null = null,
  revision = 0,
  timer: ReturnType<typeof setTimeout>;
function status(message: string, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
try {
  state = decodeState(location.hash, true);
} catch {
  status('This route link is invalid. Start a new route below.', true);
}
const undoHistory = new UndoHistory(state);
let drafts = new WeakMap<Point, string>();
const dirty = new Set<Point>();
const lookupVersions = new WeakMap<Point, number>();
const routeCache = new Map<string, Route>();
const map = L.map('map', { zoomControl: false }).setView([-22.96, -43.36], 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  keepBuffer: 1,
}).addTo(map);
const markers = L.layerGroup().addTo(map),
  line = L.featureGroup().addTo(map);
new ResizeObserver(() => map.invalidateSize()).observe($('map'));
function fit() {
  const pts =
    current?.segments.flat() ??
    state.points.flatMap((p) => (p.coord ? [p.coord] : []));
  if (pts.length)
    map.fitBounds(L.latLngBounds(pts), { padding: [45, 70], maxZoom: 15 });
}
function syncUrl() {
  undoHistory.record(state);
  const hash = encodeState(state);
  $<HTMLButtonElement>('undo').disabled = !undoHistory.canUndo && !dirty.size;
  history.replaceState(null, '', hash);
  $<HTMLAnchorElement>('help').href =
    './help.html?lang=' + (state.language ?? 'en') + hash;
}
function settings() {
  const input = $<HTMLInputElement>('average-speed');
  const bounds = speedInputBounds(state.units);
  const value = state.averageSpeedKmh
    ? snapSpeed(speedFromKmh(state.averageSpeedKmh, state.units), state.units)
    : 60;
  // The first notch represents 1; subsequent notches are 5, 10, 15…
  input.min = '0';
  input.max = String(bounds.max);
  input.step = '5';
  input.value = value === 1 ? '0' : String(value);
  input.disabled = state.averageSpeedKmh === undefined;
  $<HTMLInputElement>('use-average-speed').checked =
    state.averageSpeedKmh !== undefined;
  input.setAttribute('aria-valuemin', '1');
  input.setAttribute('aria-valuemax', String(bounds.max));
  input.setAttribute('aria-valuenow', String(value));
  input.setAttribute(
    'aria-valuetext',
    `${value} ${state.units === 'imperial' ? 'mph' : 'km/h'}`,
  );
  $('average-speed-value').textContent = String(value);
  $('speed-range').textContent =
    `1–${bounds.max} ${state.units === 'imperial' ? 'mph' : 'km/h'}`;
  $('speed-unit').textContent = state.units === 'imperial' ? 'mph' : 'km/h';
  $<HTMLSelectElement>('units').value = state.units ?? 'metric';
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
  $('map-note').textContent = `Set ${pointLabel(selected)} on the map`;
  $<HTMLButtonElement>('undo').disabled = !undoHistory.canUndo && !dirty.size;
  $<HTMLButtonElement>('calculate').disabled =
    state.points.some((p) => !p.coord) || dirty.size > 0;
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
    const search = text('button', 'Search') as HTMLButtonElement;
    search.type = 'submit';
    search.setAttribute('aria-label', `Search point ${i + 1}`);
    const results = document.createElement('div');
    results.id = `point-results-${i}`;
    results.className = 'point-results';
    results.setAttribute('aria-label', `Results for point ${i + 1}`);
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
      line.clearLayers();
      $('summary').replaceChildren();
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
      search.disabled = true;
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
          })
          .finally(() => {
            search.disabled = false;
          });
      }, 500);
    };
    form.append(input, search);
    fields.append(label, form, results);
    const actions = document.createElement('div');
    actions.className = 'point-actions';
    const onMap = text('button', 'Set on map') as HTMLButtonElement;
    onMap.type = 'button';
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
      b.disabled = i + delta < 0 || i + delta >= state.points.length;
      b.onclick = () => {
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
    remove.disabled = state.points.length <= 2;
    remove.onclick = () => {
      dirty.delete(point);
      state.points.splice(i, 1);
      selected = Math.min(selected, state.points.length - 1);
      changed();
    };
    actions.append(remove);
    row.append(choose, fields, actions);
    list.append(row);
  });
  list.scrollTop = scroll;
  renderMarkers();
  updateSelection();
  $<HTMLButtonElement>('add').disabled = state.points.length >= 50;
}
function renderMarkers() {
  markers.clearLayers();
  state.points.forEach((p, i) => {
    if (!p.coord || dirty.has(p)) return;
    const m = L.marker(p.coord, {
      draggable: true,
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
function renderRoute(route: Route) {
  routeCache.set(encodeState(state), route);
  if (routeCache.size > 50) routeCache.delete(routeCache.keys().next().value!);
  const locale = state.language === 'pt' ? 'pt-BR' : 'en';
  const duration = state.averageSpeedKmh
    ? travelTimeSeconds(route.distance, state.averageSpeedKmh)
    : route.duration;
  const minutes = duration === null ? null : Math.round(duration / 60);
  line.clearLayers();
  route.segments.forEach((seg) => {
    L.polyline(seg, { color: '#fff', weight: 8, opacity: 0.9 }).addTo(line);
    L.polyline(seg, { color: '#12796e', weight: 4, opacity: 1 }).addTo(line);
  });
  const summary = $('summary');
  summary.replaceChildren();
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.append(
    text('strong', distanceLabel(route.distance, state.units, locale)),
    text(
      'strong',
      minutes === null
        ? '—'
        : minutes < 60
          ? `${minutes} min`
          : `${Math.floor(minutes / 60)}h ${minutes % 60} min`,
    ),
  );
  summary.append(
    stats,
    text(
      'p',
      `${route.provider} · ${route.segments.reduce((n, s) => n + s.length, 0).toLocaleString(locale)} points`,
      'hint',
    ),
  );
  if (state.averageSpeedKmh) {
    const speed = speedFromKmh(
      state.averageSpeedKmh,
      state.units,
    ).toLocaleString(locale, { maximumFractionDigits: 1 });
    summary.append(
      text(
        'p',
        `At ${speed} ${state.units === 'imperial' ? 'mph' : 'km/h'} · no stops`,
        'hint',
      ),
    );
  }
  const chips = document.createElement('div');
  chips.className = 'chips';
  const refs = highways(route.steps);
  refs.forEach((ref) => chips.append(text('span', ref)));
  summary.append(chips);
  if (state.prefer) {
    const local = localSections(route.steps);
    if (local.length)
      summary.append(
        text('p', `${local.length} road sections to review`, 'warning'),
      );
  }
  const roads = document.createElement('details');
  roads.className = 'road-list';
  roads.append(
    text(
      'summary',
      `Roads (${route.steps.filter((s) => s.distance > 0).length})`,
    ),
  );
  const ul = document.createElement('ul');
  route.steps
    .filter((s) => s.distance > 0)
    .forEach((s) => {
      const li = text(
        'li',
        `${s.ref ? `${s.ref} · ` : ''}${t(s.name)} — ${distanceLabel(s.distance, state.units, locale, 2)}`,
      );
      if (state.prefer && localSections([s]).length)
        li.className = 'local-road';
      ul.append(li);
    });
  roads.append(ul);
  summary.append(roads);
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
      summary.append(
        text(
          'p',
          `Check road positions: ${far.map((p) => `${p.index + 1} (${shortDistanceLabel(p.distance, state.units)})`).join(', ')}`,
          'warning',
        ),
      );
  }
  $<HTMLButtonElement>('download').disabled = false;
}
function changed(preserveEditor = false) {
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
  $('summary').replaceChildren();
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
  timer = setTimeout(() => {
    status('Calculating…');
    $<HTMLButtonElement>('calculate').disabled = true;
    void calculate(snapshot, () => version === revision)
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
map.on('click', (e: L.LeafletMouseEvent) => {
  setPoint(state.points[selected], selected, [e.latlng.lat, e.latlng.lng]);
});
$('calculate').onclick = () => {
  if (dirty.size || state.points.some((p) => !p.coord)) {
    status('Set your start and destination.', true);
    return;
  }
  changed();
};
$('undo').onclick = () => {
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
  const restoredLanguage = state.language ?? 'en';
  setLanguage(restoredLanguage);
  $<HTMLSelectElement>('language').value = restoredLanguage;
  drafts = new WeakMap();
  dirty.clear();
  selected = Math.max(
    0,
    state.points.findIndex((p) => !p.coord),
  );
  const cached = routeCache.get(encodeState(state));
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
  if (state.points.length >= 50) return;
  state.points.splice(state.points.length - 1, 0, {
    name: `Stop ${state.points.length - 1}`,
    coord: null,
  });
  selected = state.points.length - 2;
  changed();
};
$('reverse').onclick = () => {
  state.points.reverse();
  selected = 0;
  changed();
};
$('roundtrip').onclick = () => {
  if (state.points.length * 2 - 1 > 50) {
    status('A round trip would exceed the 50-point limit.', true);
    return;
  }
  state.points.push(...structuredClone(state.points.slice(0, -1).reverse()));
  state.points.at(-1)!.name = 'Return to start';
  changed();
  status('Round trip added. Check stops on divided roads.');
};
$('example').onclick = () => {
  dirty.clear();
  drafts = new WeakMap();
  state.points = structuredClone(examplePoints);
  state.name = 'Uruguai → Alto da Boa Vista → Grumari';
  selected = 0;
  changed();
  fit();
};
$('fit').onclick = fit;
$<HTMLSelectElement>('units').onchange = () => {
  state.units = $<HTMLSelectElement>('units').value as DistanceUnits;
  if (state.averageSpeedKmh !== undefined)
    state.averageSpeedKmh = speedToKmh(
      snapSpeed(speedFromKmh(state.averageSpeedKmh, state.units), state.units),
      state.units,
    );
  settings();
  syncUrl();
  if (current) renderRoute(current);
};

$<HTMLInputElement>('prefer').onchange = () => {
  state.prefer = $<HTMLInputElement>('prefer').checked;
  syncUrl();
  if (current) renderRoute(current);
};
$('save-settings').onclick = () => {
  try {
    for (const key of ['osrm', 'valhalla', 'nominatim'] as const)
      state[key] = serverUrl($<HTMLInputElement>(key).value.trim());
    state.name = $<HTMLInputElement>('route-name').value.trim();
    changed();
  } catch (e) {
    status((e as Error).message, true);
  }
};
$<HTMLInputElement>('route-name').onchange = () => {
  state.name = $<HTMLInputElement>('route-name').value.trim();
  syncUrl();
};
$('download').onclick = () => {
  if (!current) return;
  const name =
    state.name || `${state.points[0].name} to ${state.points.at(-1)!.name}`;
  const blob = new Blob([generateGpx(current, state.points, name)], {
    type: 'application/gpx+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename(state.points);
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
  if (file.size > 10_000_000) {
    status('Choose a GPX smaller than 10 MB.', true);
    return;
  }
  void file
    .text()
    .then((xml) => {
      const imported = importGpx(xml);
      revision++;
      clearTimeout(timer);
      dirty.clear();
      drafts = new WeakMap();
      state.points = imported.points;
      state.name = imported.name;
      selected = 0;
      current = imported.route;
      syncUrl();
      renderPoints();
      settings();
      renderRoute(current);
      fit();
      status('GPX imported. Edits recalculate the route.');
    })
    .catch((e) => status((e as Error).message, true))
    .finally(() => {
      $<HTMLInputElement>('import').value = '';
    });
};
window.addEventListener('hashchange', () => {
  try {
    state = decodeState(location.hash, true);
    const lang = state.language ?? 'en';
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
if (state.points.every((p) => p.coord)) {
  changed();
  fit();
}

$('parse-description').onclick = () => {
  try {
    const intent = parseDescription(
      $<HTMLTextAreaElement>('description').value,
    );
    const box = $('intent-preview');
    box.replaceChildren();
    const fields: HTMLInputElement[] = [];
    intent.stops.forEach((name, i) => {
      const label = text(
        'label',
        `${i + 1}. ${i === 0 ? 'Start' : i === intent.stops.length - 1 ? 'Destination' : 'Via'}`,
      );
      const input = document.createElement('input');
      input.value = name;
      input.maxLength = 240;
      input.setAttribute('aria-label', `Described place ${i + 1}`);
      label.append(input);
      box.append(label);
      fields.push(input);
    });
    const label = text('label', 'Search area (optional)');
    const area = document.createElement('input');
    area.placeholder = 'e.g. Rio de Janeiro, Brazil';
    area.maxLength = 160;
    label.append(area);
    box.append(label);
    const build = text('button', 'Create route') as HTMLButtonElement;
    build.type = 'button';
    box.append(build);
    build.onclick = () => {
      build.disabled = true;
      const version = revision;
      const points = intentPoints({
        ...intent,
        stops: fields.map((f) => f.value.trim()),
      });
      void (async () => {
        for (const p of points) {
          if (revision !== version)
            throw new Error('The route changed. Review the description again.');
          if (p.coord) continue;
          if (!p.name)
            throw new Error('Give each point a place name or coordinates.');
          // Known demo landmarks do not need a network geocoding request.
          const known = examplePoints.find(
            (k) => k.name.toLowerCase() === p.name.toLowerCase(),
          );
          if (known?.coord) {
            p.coord = [...known.coord];
            continue;
          }
          status(`Finding “${p.name}”…`);
          const results = await searchAddress(
            [p.name, area.value.trim()].filter(Boolean).join(', '),
            state.nominatim,
          );
          if (!results.length)
            throw new Error(
              `Could not find “${p.name}”. Edit the place name or add a city.`,
            );
          const c = parseCoordinates(`${results[0].lat},${results[0].lon}`);
          if (!c) throw new Error(`Invalid search result for “${p.name}”.`);
          p.coord = c;
        }
        if (revision !== version) return;
        dirty.clear();
        drafts = new WeakMap();
        state.points = points;
        state.prefer = intent.prefer;
        selected = 0;
        changed();
        fit();
        status('Places found. Check the markers.');
      })()
        .catch((e) => status((e as Error).message, true))
        .finally(() => {
          build.disabled = false;
        });
    };
    status('Review the places.');
  } catch (e) {
    status((e as Error).message, true);
  }
};
$('export-json').onclick = () => {
  $<HTMLTextAreaElement>('state-json').value = JSON.stringify(state, null, 2);
};
$('apply-json').onclick = () => {
  try {
    const parsed = JSON.parse(
      $<HTMLTextAreaElement>('state-json').value,
    ) as State;
    state = decodeState(encodeState(parsed));
    selected = 0;
    changed();
    fit();
  } catch {
    status(
      'Invalid JSON state. Load the current state to see the expected format.',
      true,
    );
  }
};

const initialLanguage: Language =
  state.language ?? (navigator.language.startsWith('pt') ? 'pt' : 'en');
state.language = initialLanguage;
$<HTMLSelectElement>('language').value = initialLanguage;
setLanguage(initialLanguage);
$<HTMLAnchorElement>('help').href =
  './help.html?lang=' + initialLanguage + encodeState(state);
renderPoints();
observeTranslations();
$<HTMLSelectElement>('language').onchange = () => {
  const lang = $<HTMLSelectElement>('language').value as Language;
  state.language = lang;
  setLanguage(lang);
  settings();
  $<HTMLAnchorElement>('help').href =
    './help.html?lang=' + lang + encodeState(state);
  renderPoints();
  if (current) renderRoute(current);
  syncUrl();
};

function updateSpeedEstimate() {
  if (current) renderRoute(current);
  status(current ? 'Route ready.' : 'Set your start and destination.');
}
$<HTMLInputElement>('use-average-speed').onchange = () => {
  if ($<HTMLInputElement>('use-average-speed').checked)
    state.averageSpeedKmh = speedToKmh(
      snapSpeed(
        Number($<HTMLInputElement>('average-speed').value),
        state.units,
      ),
      state.units,
    );
  else delete state.averageSpeedKmh;
  settings();
  syncUrl();
  updateSpeedEstimate();
};
$<HTMLInputElement>('average-speed').oninput = () => {
  const value = snapSpeed(
    Number($<HTMLInputElement>('average-speed').value),
    state.units,
  );
  state.averageSpeedKmh = speedToKmh(value, state.units);
  $('average-speed-value').textContent = String(value);
  const input = $<HTMLInputElement>('average-speed');
  input.setAttribute('aria-valuenow', String(value));
  input.setAttribute(
    'aria-valuetext',
    `${value} ${state.units === 'imperial' ? 'mph' : 'km/h'}`,
  );
  updateSpeedEstimate();
};
$<HTMLInputElement>('average-speed').onchange = syncUrl;
$('reset-speed').onclick = () => {
  delete state.averageSpeedKmh;
  settings();
  syncUrl();
  updateSpeedEstimate();
};
