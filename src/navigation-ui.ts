import L from 'leaflet';
import type {
  GeoJSONSource,
  Map as VectorMap,
  Marker as VectorMarker,
  StyleSpecification,
} from 'maplibre-gl';
import type { Coord, Route, State, Step } from './core';
import { decimalYear, magneticDeclination } from './declination';
import { byId as $ } from './dom';
import { t } from './i18n';
import { icon, iconControl, type IconName } from './icons';
import { locationError, navigationPoint } from './location';
import { navigationRoute } from './services';
import { creditsDialog } from './map-credits';
import { osmCredit } from './tile-layers';
import { maneuverIcon, maneuverText } from './maneuvers';
import { navigationStyle } from './navigation-style';
import {
  compassHeading,
  createNavigationTracker,
  createRerouteSchedule,
  spliceRoute,
  isMoving,
  turnToward,
  navigationDistanceLabel,
  navigationDurationLabel,
  type NavigationManeuver,
  type NavigationReadout,
} from './navigation';
import { travelTimeSeconds } from './travel-time';
import { distanceLabel, shortDistanceLabel } from './units';
import { distanceUnits } from './unit-preferences';

/**
 * Guided navigation screen (#31, first delivery): follows the route on screen
 * with live position, next maneuver, remaining distance and arrival time.
 *
 * Location is watched only between an explicit start and Stop, and stops
 * while the page is hidden. Fixes stay in page memory and are never stored,
 * linked or sent anywhere. The only network use is the map tiles; without
 * them the route and position still draw over a neutral background.
 */

/** Device preference: 'off' after "Don't show this notice again". */
const NOTICE_KEY = 'navigation-notice';
/** Vector tiles are 512 px: zoom 16 shows what raster zoom 17 did. */
const ZOOM = 16;
/** How long "Route recalculated" stays on screen, ms. */
const REROUTED_NOTICE = 4000;
/** Room kept between the rejoin point and the screen edges, pixels. */
const REJOIN_MARGIN = 40;
/** Off the route, the map never zooms out farther than this. */
const MIN_REJOIN_ZOOM = 12;
/** OpenFreeMap's public vector style (#140). */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Without the style, the route and position draw on this background. */
const NEUTRAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e9ece9' },
    },
  ],
};
type Line = Coord[][];
const lines = (segments: Line) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'MultiLineString' as const,
    coordinates: segments.map((part) => part.map(([lat, lon]) => [lon, lat])),
  },
});
/** A circle of `radius` meters around `center`, for the accuracy ring. */
function circleAround(center: Coord, radius: number) {
  const [lat, lon] = center,
    dLat = radius / 111320,
    dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  const ring = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}
async function loadStyle(): Promise<StyleSpecification | null> {
  try {
    const response = await fetch(STYLE_URL, { credentials: 'omit' });
    if (!response.ok) return null;
    return navigationStyle((await response.json()) as StyleSpecification);
  } catch {
    return null;
  }
}
/** Where the traveler sits on the map while following, as a share of its height. */
const PIVOT = 0.7;
/**
 * The map view: following the traveler (heading-up, any zoom the traveler
 * chooses), the whole route (north-up), or free after the traveler moved or
 * zoomed it there. Anything but following at the default zoom offers Resume.
 */
type MapView = 'follow' | 'overview' | 'free';
/** Off the route by more than this (meters), the device heading is used. */
const OFF_ROUTE_HEADING = 50;
/** A compass reading older than this (ms) is not used. */
const COMPASS_FRESH = 2000;
/** Share of each compass reading taken in, to smooth its jitter. */
const COMPASS_SMOOTHING = 0.25;
/** iOS reports compass accuracy in degrees; worse than this asks to calibrate. */
const COMPASS_ACCURACY = 20;

/** iOS asks before giving orientation; elsewhere this is undefined. */
type OrientationPermission = {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

function noticeWanted(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) !== 'off';
  } catch {
    return true;
  }
}
function rememberNotice(show: boolean): void {
  try {
    if (show) localStorage.removeItem(NOTICE_KEY);
    else localStorage.setItem(NOTICE_KEY, 'off');
  } catch {
    /* Optional preference. */
  }
}

/** Road text shown for a maneuver: its name, its reference or the instruction. */
function roadText(step: Step): string {
  const name = step.name && step.name !== 'Unnamed road' ? step.name : '';
  const road = name || step.ref || '';
  const roundabout = step.exit ? maneuverText(step) : null;
  if (roundabout && road) return `${t(roundabout)} · ${road}`;
  return road || t(maneuverText(step) ?? 'Continue');
}
function maneuverGlyph(step: Step | null): SVGSVGElement {
  const arrow = step ? maneuverIcon(step) : null;
  const svg = icon(
    (arrow?.name ?? (step ? 'maneuver-straight' : 'pin')) as IconName,
  );
  if (arrow?.mirror) svg.classList.add('mirror');
  return svg;
}

export function setupNavigation(deps: {
  route: () => Route | null;
  /** The planned route's state: servers, options and route points. */
  state: () => State;
  speedKmh: () => number;
  locale: () => string;
  status: (message: string, error?: boolean) => void;
}) {
  const button = $<HTMLButtonElement>('navigate'),
    notice = $<HTMLDialogElement>('nav-notice'),
    hide = $<HTMLInputElement>('nav-notice-hide'),
    setting = $<HTMLInputElement>('nav-notice-setting'),
    screen = $<HTMLDialogElement>('nav-screen'),
    stage = $('nav-stage'),
    rotor = $('nav-rotor'),
    overview = $<HTMLButtonElement>('nav-overview'),
    resume = $<HTMLButtonElement>('nav-resume'),
    compassButton = $<HTMLButtonElement>('nav-compass-button');
  iconControl(button, 'navigate', 'Navigate');
  button.setAttribute('aria-label', 'Start navigation');
  button.title = 'Start navigation';
  iconControl(resume, 'navigate', 'Re-center');
  iconControl(compassButton, 'compass', 'North up', true);
  const needle = compassButton.querySelector<SVGSVGElement>('svg')!;
  iconControl($('nav-stop'), 'close', 'End');
  $('nav-stop').title = 'End navigation';
  $('nav-stop').setAttribute('aria-label', 'End navigation');
  $('nav-notice').querySelector('.nav-notice-warning')!.prepend(icon('alert'));
  $('nav-notice')
    .querySelector('li:not(.nav-notice-warning)')!
    .prepend(icon('weather-sun'));
  $('nav-gps').prepend(icon('alert'));
  $('nav-no-map').prepend(icon('info'));
  $('nav-no-gl').prepend(icon('info'));
  $('nav-rerouted').prepend(icon('route'));
  $('nav-reroute-failed').prepend(icon('alert'));
  const rerouteButton = $<HTMLButtonElement>('nav-reroute');
  rerouteButton.onclick = () => reroute(true);
  $('nav-compass').prepend(icon('alert'));
  // Credits behind an info button, as on the planner map.
  const credits = creditsDialog({
    id: 'nav-credits-dialog',
    name: 'nav-credits',
  });
  stage.append(...credits.elements);
  credits.setCredits([
    { text: 'MapLibre GL JS', url: 'https://maplibre.org/' },
    { text: 'OpenFreeMap', url: 'https://openfreemap.org/' },
    { text: '© OpenMapTiles', url: 'https://www.openmaptiles.org/' },
    osmCredit,
  ]);
  setting.checked = noticeWanted();
  setting.onchange = () => rememberNotice(setting.checked);

  let route: Route | null = null,
    tracker: ReturnType<typeof createNavigationTracker> | null = null,
    map: VectorMap | null = null,
    mapReady: Promise<void> | null = null,
    noStyle = false,
    /** The browser could not draw the map (no WebGL). */
    mapFailed = false,
    marker: VectorMarker | null = null,
    MarkerClass: typeof VectorMarker | null = null,
    watch: number | null = null,
    lock: WakeLockSentinel | null = null,
    view: MapView = 'follow',
    /** Zoom while following; the traveler may change it. */
    followZoom = ZOOM,
    /** Where the traveler sits (share of the height), kept in the free view. */
    pivotRatio = PIVOT,
    /** The map's current turn in degrees, kept in the free view for panning. */
    rotorAngle = 0,
    /** Following north-up instead of heading-up, chosen with the compass. */
    northUp = false,
    /** A zoom gesture is under way. */
    gestureZoom = false,
    heading = 0,
    /** Direction of travel: the route ahead, or the GPS course off the route. */
    travelHeading = 0,
    /** Smoothed compass heading and when it was last read. */
    compass: number | null = null,
    compassAt = 0,
    /** Degrees from magnetic to true north here (east positive). */
    declination = 0,
    compassPoor = false,
    moving = false,
    previous: { coord: Coord; time: number } | null = null,
    frame = 0,
    last: { coord: Coord; accuracy: number } | null = null,
    readout: NavigationReadout | null = null,
    announced: NavigationManeuver | 'off' | null | undefined,
    /** Each navigation gets a number; late answers of an older one are dropped. */
    session = 0,
    schedule = createRerouteSchedule(),
    rerouting: 'idle' | 'pending' | 'failed' = 'idle',
    /** GPS course while moving, degrees, or null. */
    course: number | null = null,
    reroutedTimer = 0,
    tileErrors = 0,
    tileLoads = 0,
    pivot = { x: 0, y: 0 };

  const units = () => distanceUnits();

  /** Every view but the default one offers a clear way back to following. */
  function setViewButtons() {
    iconControl(overview, 'route', 'Route overview', true);
    overview.hidden = view === 'overview';
    resume.hidden = view === 'follow' && followZoom === ZOOM && !northUp;
  }
  /** Turns the map to `angle` and the compass needle with it. */
  function setRotor(angle: number, fromGesture = false) {
    rotorAngle = angle;
    const shown = Math.round(angle * 10) / 10 || 0;
    // The vector map turns itself, so its labels stay upright.
    report();
    if (map && !fromGesture && Math.abs(map.getBearing() + shown) > 0.05)
      map.setBearing(-shown);
    // The compass shows only on a turned map and points to its north.
    compassButton.hidden = !shown;
    needle.style.transform = shown ? `rotate(${shown}deg)` : '';
    turnArrow();
  }
  /** The map's turn and zoom, readable on the page (and by tests). */
  function report() {
    rotor.dataset.turn = String(Math.round(rotorAngle * 10) / 10 || 0);
    if (map) rotor.dataset.zoom = map.getZoom().toFixed(2);
  }
  /** The position arrow points along the heading on the turned map. */
  function turnArrow() {
    const arrow = marker
      ?.getElement()
      ?.querySelector<HTMLElement>('.nav-arrow');
    const angle = Math.round((heading + rotorAngle) * 10) / 10 || 0;
    if (arrow) arrow.style.transform = `rotate(${angle}deg)`;
    turnRejoinArrow();
  }
  /** Off the route, the banner arrow points to the rejoin point on screen. */
  function turnRejoinArrow() {
    const svg = $('nav-turn').querySelector<SVGElement>('.rejoin');
    if (!svg || !readout?.rejoin) return;
    const angle =
      Math.round((((readout.rejoin.bearing + rotorAngle) % 360) + 360) % 360) ||
      0;
    svg.style.transform = `rotate(${angle}deg)`;
  }
  /** A pinch or double tap: following keeps following, at that zoom. */
  function userZoom() {
    if (!map) return;
    if (view === 'follow') followZoom = map.getZoom();
    else view = 'free';
    setViewButtons();
  }
  /** A pan or a turn stops following. */
  function goFree() {
    if (view === 'free') return;
    view = 'free';
    setViewButtons();
  }

  /**
   * Moving, the map turns with the direction of travel; stopped, with the
   * compass, so it follows where the phone points. The compass is not used
   * while moving: mounts and car metal often make it wrong.
   */
  function chooseHeading() {
    const fresh = compass !== null && Date.now() - compassAt < COMPASS_FRESH;
    heading = !moving && fresh ? compass! : travelHeading;
  }
  /** Asks to calibrate only while the compass is what turns the map. */
  function calibrationNotice() {
    const fresh = compass !== null && Date.now() - compassAt < COMPASS_FRESH;
    $('nav-compass').hidden = !(compassPoor && fresh && !moving);
  }
  /** Turns the map (while following) and the position arrow. */
  function applyHeading() {
    // A tenth of a degree is finer than the eye sees; it keeps styles short.
    const angle = Math.round(heading * 10) / 10 || 0;
    if (view === 'follow') setRotor(northUp ? 0 : -angle);
    else turnArrow();
  }
  /** Magnetic declination at a place now, from the local WMM2025 model. */
  function declinationAt(coord: Coord | undefined) {
    if (coord)
      declination = magneticDeclination(
        coord[0],
        coord[1],
        decimalYear(new Date()),
      );
  }
  function onOrientation(event: DeviceOrientationEvent) {
    const ios = event as DeviceOrientationEvent & {
      webkitCompassHeading?: number;
      webkitCompassAccuracy?: number;
    };
    const magnetic = compassHeading(
      {
        alpha: event.alpha,
        absolute: event.absolute || event.type === 'deviceorientationabsolute',
        webkitCompassHeading: ios.webkitCompassHeading,
      },
      window.screen.orientation?.angle ?? 0,
    );
    if (magnetic === null) return;
    // Compasses point to magnetic north; the map's north is true north.
    const reading = (magnetic + declination + 360) % 360;
    const accuracy = ios.webkitCompassAccuracy;
    compassPoor =
      typeof accuracy === 'number' &&
      (accuracy < 0 || accuracy > COMPASS_ACCURACY);
    compass =
      compass === null
        ? reading
        : turnToward(compass, reading, COMPASS_SMOOTHING);
    compassAt = Date.now();
    if (moving || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      chooseHeading();
      applyHeading();
      calibrationNotice();
    });
  }
  /**
   * Android Chrome gives a north-referenced reading only as
   * `deviceorientationabsolute`; iOS adds its compass heading to
   * `deviceorientation`. Both are heard; readings without north are ignored.
   */
  const orientationEvents = ['deviceorientationabsolute', 'deviceorientation'];
  /** Called from the start tap: iOS only asks for orientation on a gesture. */
  function watchCompass() {
    const listen = () =>
      orientationEvents.forEach((name) =>
        window.addEventListener(name, onOrientation as EventListener),
      );
    const ask = (
      window.DeviceOrientationEvent as unknown as OrientationPermission
    )?.requestPermission;
    if (typeof ask === 'function')
      ask()
        .then((answer) => {
          if (answer === 'granted' && screen.open) listen();
        })
        .catch(() => undefined);
    else listen();
  }

  /** The traveler sits at `pivotRatio` of the height through the map's padding. */
  function layout() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    pivot = { x: w / 2, y: h * pivotRatio };
    if (!map) return;
    map.resize();
    map.setPadding({
      top: Math.max(0, 2 * pivot.y - h),
      bottom: Math.max(0, h - 2 * pivot.y),
      left: 0,
      right: 0,
    });
    place();
  }

  async function createMap() {
    const [ml, style] = await Promise.all([
      import('maplibre-gl'),
      loadStyle(),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]);
    const workerUrl = (
      await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')
    ).default;
    ml.setWorkerUrl(workerUrl);
    MarkerClass = ml.Marker;
    noStyle = !style;
    map = new ml.Map({
      container: 'nav-map',
      style: style ?? NEUTRAL_STYLE,
      attributionControl: false,
      center: [0, 0],
      zoom: ZOOM,
      maxPitch: 0,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      touchZoomRotate: { around: 'center' },
      // A double tap zooms around the traveler (see `setupTouch`), not the
      // tapped point; tap-and-drag zoom stays MapLibre's, around the center.
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      fadeDuration: 0,
      renderWorldCopies: false,
      // MapLibre's default 'same-origin' credentials send nothing cross-origin.
    });
    const m = map;
    // Gestures carry the event that caused them; the code's moves do not.
    m.on('dragstart', (e) => {
      if (e.originalEvent) goFree();
    });
    m.on('rotate', (e) => {
      if (!e.originalEvent) return;
      goFree();
      setRotor(-m.getBearing(), true);
    });
    m.on('zoomstart', (e) => {
      if (e.originalEvent) gestureZoom = true;
    });
    m.on('zoom', report);
    m.on('zoomend', () => {
      if (!gestureZoom) return;
      gestureZoom = false;
      userZoom();
    });
    m.on('error', () => {
      tileErrors++;
      mapNotice();
    });
    m.on('data', (e) => {
      if ((e as { tile?: unknown }).tile) {
        tileLoads++;
        mapNotice();
      }
    });
    await new Promise<void>((resolve) => {
      if (m.isStyleLoaded()) resolve();
      else m.once('load', () => resolve());
    });
    m.addSource('travelled', { type: 'geojson', data: lines([]) });
    m.addSource('route', { type: 'geojson', data: lines([]) });
    m.addSource('accuracy', { type: 'geojson', data: lines([]) });
    m.addSource('rejoin', { type: 'geojson', data: lines([]) });
    const line = { 'line-cap': 'round', 'line-join': 'round' } as const;
    m.addLayer({
      id: 'nav-accuracy',
      type: 'fill',
      source: 'accuracy',
      paint: {
        'fill-color': '#0b72c6',
        'fill-opacity': 0.18,
        'fill-outline-color': '#0b72c6',
      },
    });
    m.addLayer({
      id: 'nav-route',
      type: 'line',
      source: 'route',
      layout: line,
      paint: { 'line-color': '#12796e', 'line-width': 8 },
    });
    m.addLayer({
      id: 'nav-travelled',
      type: 'line',
      source: 'travelled',
      layout: line,
      paint: { 'line-color': '#8795a1', 'line-width': 8 },
    });
    // Off the route: a dashed straight line to the rejoin point, and a ring
    // there. Dashes say it is not a road.
    m.addLayer({
      id: 'nav-rejoin',
      type: 'line',
      source: 'rejoin',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': '#74420b',
        'line-width': 4,
        'line-dasharray': [0.5, 2],
      },
    });
    m.addLayer({
      id: 'nav-rejoin-point',
      type: 'circle',
      source: 'rejoin',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 9,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#74420b',
        'circle-stroke-width': 4,
      },
    });
  }
  /** The dashed way back from the position to the rejoin point, or nothing. */
  function drawRejoin() {
    const rejoin = readout?.rejoin;
    const lonLat = (c: Coord) => [c[1], c[0]];
    source('rejoin')?.setData(
      rejoin && last
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [lonLat(last.coord), lonLat(rejoin.coord)],
                },
              },
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: lonLat(rejoin.coord) },
              },
            ],
          }
        : lines([]),
    );
  }
  /** Without tiles the route still draws over the neutral background. */
  function mapNotice() {
    $('nav-no-gl').hidden = !mapFailed;
    $('nav-no-map').hidden =
      mapFailed ||
      (navigator.onLine && !noStyle && !(tileErrors >= 4 && !tileLoads));
  }
  const source = (id: string) => map?.getSource<GeoJSONSource>(id);

  function drawRoute(next: Route) {
    source('route')?.setData(lines(next.segments));
    source('travelled')?.setData(lines([]));
  }

  /**
   * While following off the route, the zoom steps out just enough for the
   * rejoin point to show between the traveler and the screen edges, in any
   * direction; on the route it is the traveler's chosen zoom.
   */
  function zoomToRejoin(coord: Coord): number {
    const rejoin = readout?.rejoin;
    if (!rejoin) return followZoom;
    const w = stage.clientWidth;
    const room = Math.max(
      60,
      Math.min(pivot.y - bannerBottom(), w / 2, stage.clientHeight - pivot.y) -
        REJOIN_MARGIN,
    );
    // Meters per CSS pixel at the follow zoom (512 px vector tiles).
    const perPixel =
      (40075016.7 * Math.cos((coord[0] * Math.PI) / 180)) /
      (512 * 2 ** followZoom);
    const needed = rejoin.straight / perPixel;
    return needed <= room
      ? followZoom
      : Math.max(MIN_REJOIN_ZOOM, followZoom - Math.log2(needed / room));
  }
  /** Moves the map and the marker to the latest fix (or the route start). */
  function place() {
    if (!map || !route) return;
    const coord = last?.coord ?? route.segments[0]?.[0];
    if (!coord) return;
    if (view === 'follow')
      map.jumpTo({ center: [coord[1], coord[0]], zoom: zoomToRejoin(coord) });
    else if (view === 'overview') {
      setRotor(0);
      const all = route.segments.flat();
      const lats = all.map((c) => c[0]),
        lons = all.map((c) => c[1]);
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        {
          animate: false,
          bearing: 0,
          // The floating banner covers the top of the map.
          padding: {
            top: 24 + bannerBottom(),
            bottom: 24,
            left: 24,
            right: 24,
          },
        },
      );
    }
    if (!last) {
      applyHeading();
      return;
    }
    if (!marker && MarkerClass) {
      const element = document.createElement('div');
      element.className = 'nav-position';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = '<span class="nav-arrow"></span>';
      element.querySelector('.nav-arrow')!.append(icon('navigate'));
      marker = new MarkerClass({ element })
        .setLngLat([last.coord[1], last.coord[0]])
        .addTo(map);
    } else marker?.setLngLat([last.coord[1], last.coord[0]]);
    marker?.getElement().classList.toggle('weak', !!readout?.weak);
    source('accuracy')?.setData(
      readout?.weak ? circleAround(last.coord, last.accuracy) : lines([]),
    );
    applyHeading();
  }

  function render() {
    if (!route || !tracker) return;
    const r = readout;
    const turn = $('nav-turn');
    const arrived = !!r?.arrived;
    const rejoin = !arrived ? (r?.rejoin ?? null) : null;
    screen.classList.toggle('off-route', !!rejoin);
    $('nav-hint').hidden = !rejoin;
    renderReroute(!!rejoin);
    drawRejoin();
    if (rejoin) {
      // Off the route: an arrow to the rejoin point and the straight distance.
      const arrow = icon('maneuver-straight');
      arrow.classList.add('rejoin');
      turn.replaceChildren(arrow);
      turnRejoinArrow();
      $('nav-distance').hidden = false;
      $('nav-distance').textContent = navigationDistanceLabel(
        rejoin.straight,
        units(),
        deps.locale(),
      );
      $('nav-road').textContent = 'Back to route';
      $('nav-then').hidden = true;
    } else renderManeuver(r, arrived);
    announce(r, arrived, !!rejoin);
    renderBar(r);
  }
  /** The Recalculate route button and the failure notice, off the route. */
  function renderReroute(offRoute: boolean) {
    const online = navigator.onLine,
      wait = schedule.wait(Date.now());
    rerouteButton.hidden = !offRoute || !online;
    $('nav-reroute-failed').hidden = !offRoute || rerouting !== 'failed';
    const label =
      rerouting === 'pending'
        ? 'Recalculating…'
        : wait > 0
          ? `Recalculate in ${Math.ceil(wait / 1000)} s`
          : 'Recalculate route';
    if (rerouteButton.dataset.label !== label) {
      rerouteButton.dataset.label = label;
      iconControl(rerouteButton, 'refresh', label);
    }
    rerouteButton.disabled = !schedule.manual(Date.now(), online);
  }
  function renderManeuver(r: NavigationReadout | null, arrived: boolean) {
    const turn = $('nav-turn');
    const step = arrived ? null : (r?.next?.step ?? null);
    turn.replaceChildren(maneuverGlyph(step));
    $('nav-distance').textContent = arrived
      ? ''
      : navigationDistanceLabel(
          r ? r.toNext : (tracker?.total ?? 0),
          units(),
          deps.locale(),
        );
    $('nav-distance').hidden = arrived;
    $('nav-road').textContent = arrived
      ? 'You have arrived'
      : step
        ? roadText(step)
        : 'Destination';
    const after = !arrived && r?.after ? r.after : null;
    $('nav-then').hidden = !after;
    if (after) {
      $('nav-then-icon').replaceChildren(maneuverGlyph(after.step));
      $('nav-then-distance').textContent = navigationDistanceLabel(
        r!.afterGap,
        units(),
        deps.locale(),
      );
    }
  }
  /** Spoken by screen readers only when the maneuver or the state changes. */
  function announce(
    r: NavigationReadout | null,
    arrived: boolean,
    offRoute: boolean,
  ) {
    const current = offRoute ? 'off' : arrived ? null : (r?.next ?? null);
    if (!r || current === announced) return;
    announced = current;
    $('nav-announce').textContent = offRoute
      ? `${t('Off the route')} · ${t('Back to route')}`
      : arrived
        ? t('You have arrived')
        : r.next
          ? `${t(maneuverText(r.next.step) ?? 'Continue')} · ${roadText(r.next.step)}`
          : t('Destination');
  }
  function renderBar(r: NavigationReadout | null) {
    if (!tracker) return;
    const remaining = r ? r.remaining : tracker.total;
    const seconds = travelTimeSeconds(remaining, deps.speedKmh());
    $('nav-time').textContent = r ? navigationDurationLabel(seconds) : '—';
    const clock = new Date(Date.now() + seconds * 1000).toLocaleTimeString(
      deps.locale(),
      { hour: '2-digit', minute: '2-digit' },
    );
    $('nav-rest').textContent =
      `${distanceLabel(remaining, units(), deps.locale())}${r ? ` · ${clock}` : ''}`;
    const dot = $('nav-dot');
    dot.classList.toggle('waiting', !last);
    dot.classList.toggle('weak', !!r?.weak);
    $('nav-fix-text').textContent = !last
      ? 'Waiting for GPS'
      : `${r?.weak ? t('Weak GPS') : t('GPS on')} ±${shortDistanceLabel(last.accuracy, units())}`;
    $('nav-gps').hidden = !last || !r?.weak;
    if (r) source('travelled')?.setData(lines(tracker.travelled(r.progress)));
  }

  function onFix(position: GeolocationPosition) {
    if (!tracker) return;
    const {
      latitude,
      longitude,
      accuracy,
      heading: deviceHeading,
    } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    last = {
      coord: [latitude, longitude],
      accuracy: Math.max(0, accuracy || 0),
    };
    declinationAt(last.coord);
    readout = tracker.update(last);
    // The device's speed, or one measured between fixes when it gives none.
    const time = position.timestamp || Date.now();
    let speed: number | null = Number.isFinite(position.coords.speed)
      ? position.coords.speed
      : null;
    if (speed === null && previous && time - previous.time >= 500)
      speed =
        L.latLng(previous.coord).distanceTo(L.latLng(last.coord)) /
        ((time - previous.time) / 1000);
    previous = { coord: last.coord, time };
    moving = isMoving(speed, moving);
    const offRoute =
      !readout || readout.offTrack > Math.max(OFF_ROUTE_HEADING, last.accuracy);
    if (
      !offRoute &&
      readout?.heading !== null &&
      readout?.heading !== undefined
    )
      travelHeading = readout.heading;
    else if (deviceHeading !== null && Number.isFinite(deviceHeading))
      travelHeading = deviceHeading;
    // The GPS course, while moving, tells the router which way the
    // traveler is going; the compass is not reliable enough for that.
    course =
      moving && deviceHeading !== null && Number.isFinite(deviceHeading)
        ? deviceHeading
        : null;
    chooseHeading();
    calibrationNotice();
    render();
    place();
    reroute(false);
  }
  /** Route points after the start, so neither hint nor reroute skips one. */
  function stops(): Coord[] {
    return deps
      .state()
      .points.slice(1)
      .flatMap((p) => (p.coord ? [p.coord] : []));
  }
  /**
   * Off the route, asks the router for a way back to the planned route,
   * automatically or from the button, within `createRerouteSchedule`'s
   * limits. Only the position (about 10 m) and the course are sent; the new
   * route lives in page memory until End.
   */
  function reroute(manual: boolean) {
    const r = readout;
    if (!r?.rejoin || !last || !route || !tracker) return;
    const now = Date.now(),
      online = navigator.onLine;
    if (
      manual
        ? !schedule.manual(now, online)
        : !schedule.auto(now, r.offSince, online)
    )
      return;
    const target = tracker.rerouteTarget(r.rejoin);
    if (!target) return;
    const planned = route,
      mine = session;
    // Superseded once navigation ends or the traveler is back on the route.
    const isCurrent = () => mine === session && !!readout?.offRoute;
    schedule.start(now, !manual);
    rerouting = 'pending';
    render();
    navigationRoute(
      deps.state(),
      navigationPoint(last.coord),
      target.coord,
      course,
      isCurrent,
    )
      .then((fresh) => {
        if (!isCurrent() || route !== planned || !last) return;
        route = spliceRoute(planned, fresh, target.at);
        tracker = createNavigationTracker(route, stops());
        readout = tracker.update(last);
        announced = undefined;
        drawRoute(route);
        rerouting = 'idle';
        $('nav-rerouted').hidden = false;
        clearTimeout(reroutedTimer);
        reroutedTimer = window.setTimeout(
          () => ($('nav-rerouted').hidden = true),
          REROUTED_NOTICE,
        );
      })
      .catch(() => {
        // No retry: the local hint stays until the next allowed attempt.
        if (mine === session) rerouting = 'failed';
      })
      .finally(() => {
        if (mine !== session) return;
        schedule.finish();
        if (rerouting === 'pending') rerouting = 'idle';
        render();
        place();
      });
  }
  function onError(error: GeolocationPositionError) {
    if (error.code === 1) {
      stop();
      deps.status(locationError(1), true);
      return;
    }
    // Timeout or no signal: keep watching and say the GPS is being awaited.
    last = null;
    readout = null;
    render();
  }

  function startWatching() {
    if (watch !== null || !navigator.geolocation) return;
    watch = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 20000,
    });
  }
  function stopWatching() {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null;
  }
  async function keepScreenOn() {
    if (lock || !('wakeLock' in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!screen.open) {
        void sentinel.release();
        return;
      }
      lock = sentinel;
      sentinel.addEventListener('release', () => {
        if (lock === sentinel) lock = null;
        render();
      });
    } catch {
      lock = null;
    }
    render();
  }
  /** Location stops while the page is hidden and resumes when it is shown. */
  function onVisibility() {
    if (!screen.open) return;
    if (document.visibilityState === 'hidden') stopWatching();
    else {
      startWatching();
      void keepScreenOn();
    }
  }
  const onResize = () => {
    if (screen.open) layout();
  };
  const onNetwork = () => mapNotice();

  function start() {
    route = deps.route();
    if (!route) return;
    session++;
    schedule = createRerouteSchedule();
    rerouting = 'idle';
    course = null;
    tracker = createNavigationTracker(route, stops());
    declinationAt(route.segments[0]?.[0]);
    last = null;
    readout = null;
    announced = undefined;
    view = 'follow';
    followZoom = ZOOM;
    pivotRatio = PIVOT;
    northUp = false;
    setRotor(0);
    heading = 0;
    travelHeading = 0;
    compass = null;
    compassPoor = false;
    moving = false;
    previous = null;
    tileErrors = 0;
    tileLoads = 0;
    setViewButtons();
    screen.showModal();
    // iOS 26 ignores -webkit-touch-callout on the map itself; with selection
    // off on the whole page (as `html.map-touching` does for the planner
    // map), no callout or selection menu opens while navigating.
    document.documentElement.classList.add('navigating');
    // The screen itself takes focus, not its first button, so no button
    // looks selected when navigation starts.
    screen.focus({ preventScroll: true });
    // Without WebGL there is no map; the directions above still guide.
    mapReady ??= createMap().catch(() => {
      mapFailed = true;
      map = null;
    });
    const shown = route;
    void mapReady.then(() => {
      if (route !== shown) return;
      mapNotice();
      if (!map) return;
      drawRoute(shown);
      setRotor(rotorAngle);
      layout();
      render();
    });
    layout();
    mapNotice();
    render();
    startWatching();
    watchCompass();
    void keepScreenOn();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
  }
  function stop() {
    if (screen.open) screen.close();
  }
  /** Every way out (Stop, Escape, the back gesture) ends here. */
  function cleanup() {
    // A recalculation still under way belongs to this navigation only.
    session++;
    clearTimeout(reroutedTimer);
    $('nav-rerouted').hidden = true;
    document.documentElement.classList.remove('navigating');
    stopWatching();
    orientationEvents.forEach((name) =>
      window.removeEventListener(name, onOrientation as EventListener),
    );
    cancelAnimationFrame(frame);
    frame = 0;
    compass = null;
    compassPoor = false;
    const sentinel = lock;
    lock = null;
    void sentinel?.release().catch(() => undefined);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('online', onNetwork);
    window.removeEventListener('offline', onNetwork);
    marker?.remove();
    marker = null;
    source('accuracy')?.setData(lines([]));
    last = null;
    readout = null;
    tracker = null;
    route = null;
    button.focus();
  }
  screen.addEventListener('close', cleanup);
  // Navigation is offered exactly when the route can be downloaded: a route
  // is on screen and no edit has made it stale.
  const download = $<HTMLButtonElement>('download');
  const sync = () => (button.disabled = download.disabled || !deps.route());
  new MutationObserver(sync).observe(download, {
    attributes: true,
    attributeFilter: ['disabled'],
  });
  sync();

  button.onclick = () => {
    if (!deps.route()) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      deps.status(
        'Navigation needs location, which this browser does not offer here.',
        true,
      );
      return;
    }
    if (noticeWanted()) {
      hide.checked = false;
      notice.showModal();
    } else start();
  };
  $('nav-notice-start').onclick = () => {
    if (hide.checked) {
      rememberNotice(false);
      setting.checked = false;
    }
    notice.close();
    start();
  };
  $('nav-stop').onclick = stop;
  /**
   * The pressed button hides, so focus moves on: to the other button from a
   * keyboard, to the screen after a tap, so no button looks selected.
   */
  const moveFocus = (event: MouseEvent, next: HTMLElement) =>
    (event.detail ? screen : next).focus({ preventScroll: true });
  overview.onclick = (event) => {
    view = 'overview';
    pivotRatio = 0.5;
    setViewButtons();
    layout();
    moveFocus(event, resume);
  };
  resume.onclick = (event) => {
    view = 'follow';
    northUp = false;
    followZoom = ZOOM;
    pivotRatio = PIVOT;
    setViewButtons();
    layout();
    moveFocus(event, overview);
  };
  /** North up: following keeps following, north-up; other views just turn. */
  compassButton.onclick = (event) => {
    if (view === 'follow') northUp = true;
    setRotor(0);
    setViewButtons();
    moveFocus(event, resume);
  };
  // Notices and buttons stay below the floating banner, whatever its height.
  const banner = screen.querySelector<HTMLElement>('.nav-banner')!;
  function bannerBottom() {
    return banner.offsetTop + banner.offsetHeight;
  }
  new ResizeObserver(() =>
    screen.style.setProperty('--nav-top', `${bannerBottom()}px`),
  ).observe(banner);
  // The browser's own long-press menu, loupe, callout and text selection
  // never open on the map; MapLibre handles pan, pinch, turn and zoom.
  stage.addEventListener('contextmenu', (event) => event.preventDefault());
  stage.addEventListener('selectstart', (event) => event.preventDefault());
  setupTouch();
  /**
   * Cancelling the touch stops iOS from starting its loupe or callout; a
   * double tap zooms in one level around the traveler (the map's center),
   * so following keeps following.
   */
  function setupTouch() {
    let down: { x: number; y: number } | null = null,
      lastTap: { x: number; y: number; time: number } | null = null;
    const control = (target: EventTarget | null) =>
      !!(target as Element | null)?.closest?.('button, a, .credits-dialog');
    stage.addEventListener(
      'touchstart',
      (event) => {
        if (control(event.target)) return;
        event.preventDefault();
        const touch = event.touches[0];
        down =
          event.touches.length === 1
            ? { x: touch.clientX, y: touch.clientY }
            : null;
      },
      { passive: false },
    );
    stage.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      if (
        down &&
        Math.hypot(touch.clientX - down.x, touch.clientY - down.y) > 10
      )
        down = null;
    });
    stage.addEventListener('touchend', (event) => {
      if (!down || event.touches.length || !map) return;
      const tap = { ...down, time: event.timeStamp };
      down = null;
      if (
        lastTap &&
        tap.time - lastTap.time < 350 &&
        Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40
      ) {
        lastTap = null;
        map.zoomTo(map.getZoom() + 1, { duration: 0 });
        userZoom();
      } else lastTap = tap;
    });
  }

  return {
    /** Settings opened: show the stored notice choice. */
    syncSetting() {
      setting.checked = noticeWanted();
    },
  };
}
