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
  timer: ReturnType<typeof setTimeout>,
  searchTimer: ReturnType<typeof setTimeout>,
  searchRevision = 0;
function status(message: string, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
try {
  state = decodeState(location.hash);
} catch {
  status('This route link is invalid. Start a new route below.', true);
}
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
  const hash = encodeState(state);
  history.replaceState(null, '', hash);
  $<HTMLAnchorElement>('help').href =
    './help.html?lang=' + (state.language ?? 'en') + hash;
}
function settings() {
  for (const key of ['osrm', 'valhalla', 'nominatim'] as const)
    $<HTMLInputElement>(key).value = state[key];
  $<HTMLInputElement>('route-name').value = state.name;
  $<HTMLInputElement>('prefer').checked = state.prefer;
}
function renderPoints() {
  const list = $('points');
  list.replaceChildren();
  $('point-count').textContent = `${state.points.length} points`;
  state.points.forEach((p, i) => {
    const row = document.createElement('li');
    row.className = i === selected ? 'selected' : '';
    const choose = text(
      'button',
      String(i + 1),
      'point-number',
    ) as HTMLButtonElement;
    choose.type = 'button';
    choose.title = 'Select this point on the map';
    choose.setAttribute('aria-label', `Select point ${i + 1}`);
    choose.setAttribute('aria-pressed', String(i === selected));
    choose.onclick = () => {
      selected = i;
      renderPoints();
      if (p.coord) map.panTo(p.coord);
    };
    const fields = document.createElement('div');
    fields.className = 'point-fields';
    const name = document.createElement('input');
    name.value = t(p.name);
    name.maxLength = 240;
    name.setAttribute('aria-label', `Name of point ${i + 1}`);
    name.onchange = () => {
      p.name = name.value.trim() || `Point ${i + 1}`;
      syncUrl();
    };
    const coordinate = document.createElement('input');
    coordinate.value = p.coord
      ? p.coord.map((n) => n.toFixed(6)).join(', ')
      : '';
    coordinate.placeholder =
      i === 0
        ? 'Choose your start'
        : i === state.points.length - 1
          ? 'Choose your destination'
          : 'Choose a stop';
    coordinate.setAttribute('aria-label', `Coordinates of point ${i + 1}`);
    coordinate.onfocus = () => {
      selected = i;
    };
    coordinate.onchange = () => {
      const c = parseCoordinates(coordinate.value);
      if (!c) {
        coordinate.setAttribute('aria-invalid', 'true');
        status(
          'Invalid coordinates. Use latitude, longitude (for example: -22.90, -43.18).',
          true,
        );
        return;
      }
      p.coord = c;
      selected = i;
      changed();
    };
    fields.append(name, coordinate);
    const actions = document.createElement('div');
    actions.className = 'point-actions';
    const move = (label: string, delta: number) => {
      const b = text('button', label) as HTMLButtonElement;
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
      return b;
    };
    const remove = text('button', '×') as HTMLButtonElement;
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove point ${i + 1}`);
    remove.disabled = state.points.length <= 2;
    remove.onclick = () => {
      state.points.splice(i, 1);
      selected = Math.min(selected, state.points.length - 1);
      changed();
    };
    actions.append(move('↑', -1), move('↓', 1), remove);
    row.append(choose, fields, actions);
    list.append(row);
  });
  markers.clearLayers();
  state.points.forEach((p, i) => {
    if (!p.coord) return;
    const m = L.marker(p.coord, {
      draggable: true,
      icon: L.divIcon({
        className: `route-marker ${i === selected ? 'active' : ''}`,
        html: `<span><b>${i + 1}</b></span>`,
        iconSize: [30, 38],
        iconAnchor: [15, 36],
      }),
    }).addTo(markers);
    m.bindTooltip(p.name ? text('span', p.name) : `Point ${i + 1}`);
    m.on('click', () => {
      selected = i;
      renderPoints();
    });
    m.on('dragend', () => {
      const c = m.getLatLng();
      p.coord = [c.lat, c.lng];
      selected = i;
      changed();
    });
  });
  $('map-note').textContent = `Place point ${selected + 1} on the map`;
  $<HTMLButtonElement>('add').disabled = state.points.length >= 50;
}
function renderRoute(route: Route) {
  const locale = state.language === 'pt' ? 'pt-BR' : 'en';
  const minutes =
    route.duration === null ? null : Math.round(route.duration / 60);
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
    text(
      'strong',
      `${(route.distance / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`,
    ),
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
        `${s.ref ? `${s.ref} · ` : ''}${t(s.name)} — ${(s.distance / 1000).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`,
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
          `Check road positions: ${far.map((p) => `${p.index + 1} (${Math.round(p.distance)} m)`).join(', ')}`,
          'warning',
        ),
      );
  }
  $<HTMLButtonElement>('download').disabled = false;
}
function changed() {
  revision++;
  searchRevision++;
  current = null;
  $<HTMLButtonElement>('download').disabled = true;
  clearTimeout(timer);
  syncUrl();
  renderPoints();
  settings();
  line.clearLayers();
  $('summary').replaceChildren();
  if (state.points.some((p) => !p.coord)) {
    status('Set all points.');
    return;
  }
  status('Updating…');
  const version = revision;
  const snapshot = structuredClone(state);
  timer = setTimeout(() => {
    status('Calculating…');
    void calculate(snapshot, () => version === revision)
      .then((route) => {
        if (version !== revision) return;
        current = route;
        renderRoute(route);
        status('Route ready.');
      })
      .catch((e) => {
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
  state.points[selected].coord = [e.latlng.lat, e.latlng.lng];
  if (selected === 0 && !state.points.at(-1)!.coord)
    selected = state.points.length - 1;
  changed();
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
  state.points = structuredClone(examplePoints);
  state.name = 'Uruguai → Alto da Boa Vista → Grumari';
  selected = 0;
  changed();
  fit();
};
$('fit').onclick = fit;
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
$('search-form').onsubmit = (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  const q = $<HTMLInputElement>('search').value.trim();
  const target = state.points[selected];
  const targetIndex = selected;
  const version = ++searchRevision;
  $('results').replaceChildren();
  const c = parseCoordinates(q);
  if (c) {
    target.coord = c;
    changed();
    map.panTo(c);
    return;
  }
  if (/^[\s(+-]*\d/.test(q) && /[,;]/.test(q)) {
    status(
      'Invalid coordinates. Use latitude (-90 to 90), longitude (-180 to 180).',
      true,
    );
    return;
  }
  if (q.length < 3) {
    status(
      'Enter at least three characters or a latitude, longitude pair.',
      true,
    );
    return;
  }
  status('Searching…');
  searchTimer = setTimeout(() => {
    void searchAddress(q, state.nominatim)
      .then((results) => {
        if (version !== searchRevision) return;
        const box = $('results');
        box.replaceChildren();
        if (!results.length) {
          status(
            'No address found. Try a nearby street, city, or coordinates.',
          );
          return;
        }
        results.forEach((r) => {
          const b = text('button', r.display_name) as HTMLButtonElement;
          b.type = 'button';
          b.onclick = () => {
            if (state.points[targetIndex] !== target) return;
            const coord: Coord = [Number(r.lat), Number(r.lon)];
            if (!parseCoordinates(coord.join(','))) {
              status('Search returned invalid coordinates.', true);
              return;
            }
            target.coord = coord;
            target.name = r.display_name
              .split(',')
              .slice(0, 2)
              .join(',')
              .slice(0, 240);
            selected = targetIndex;
            box.replaceChildren();
            changed();
            map.setView(coord, 14);
          };
          box.append(b);
        });
        status('Choose a place.');
      })
      .catch(() => {
        if (version === searchRevision)
          status(
            'Address search unavailable. Try again later or paste coordinates.',
            true,
          );
      });
  }, 500);
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
    state = decodeState(location.hash);
    const lang = state.language ?? 'en';
    setLanguage(lang);
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
  $<HTMLAnchorElement>('help').href =
    './help.html?lang=' + lang + encodeState(state);
  renderPoints();
  if (current) renderRoute(current);
  syncUrl();
};
