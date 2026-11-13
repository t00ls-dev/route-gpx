import L from 'leaflet';
import { setupQuickZoom } from './quick-zoom';
import type { Coord, Route, Step } from './core';
import { decimalYear, magneticDeclination } from './declination';
import { byId as $ } from './dom';
import { t } from './i18n';
import { icon, iconControl, type IconName } from './icons';
import { locationError } from './location';
import { maneuverIcon, maneuverText } from './maneuvers';
import {
  compassHeading,
  createNavigationTracker,
  isMoving,
  turnToward,
  navigationDistanceLabel,
  navigationDurationLabel,
  type NavigationManeuver,
  type NavigationReadout,
} from './navigation';
import { tileConfig } from './tile-layers';
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
const ZOOM = 17;
/** Where the traveler sits on the map while following, as a share of its height. */
const PIVOT = 0.7;
/** Finger travel, in pixels, before a touch on the map becomes a pan. */
const PAN_START = 8;
/**
 * Degrees two fingers must turn before the map turns with them, so a pinch
 * that twists a little only zooms.
 */
const TWIST_START = 12;
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
  $('nav-compass').prepend(icon('alert'));
  setting.checked = noticeWanted();
  setting.onchange = () => rememberNotice(setting.checked);

  let route: Route | null = null,
    tracker: ReturnType<typeof createNavigationTracker> | null = null,
    map: L.Map | null = null,
    tiles: L.TileLayer | null = null,
    ahead: L.Polyline | null = null,
    behind: L.Polyline | null = null,
    marker: L.Marker | null = null,
    circle: L.Circle | null = null,
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
    /** A one-finger zoom (double tap and hold) is under way: no panning. */
    quickZooming = false,
    /** Set while the code itself moves the map, to tell it from gestures. */
    placing = false,
    /** The zoom the code last set; any other one came from a gesture. */
    placedZoom = ZOOM,
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
    announced: NavigationManeuver | null | undefined,
    tileErrors = 0,
    tileLoads = 0,
    pivot = { x: 0, y: 0 },
    size = 0;

  const units = () => distanceUnits();

  /** Every view but the default one offers a clear way back to following. */
  function setViewButtons() {
    iconControl(overview, 'route', 'Route overview', true);
    overview.hidden = view === 'overview';
    resume.hidden = view === 'follow' && followZoom === ZOOM && !northUp;
  }
  /** Turns the map to `angle` and the compass needle with it. */
  function setRotor(angle: number) {
    rotorAngle = angle;
    const shown = Math.round(angle * 10) / 10 || 0;
    rotor.style.transform = shown ? `rotate(${shown}deg)` : '';
    // The compass shows only on a turned map and points to its north.
    compassButton.hidden = !shown;
    needle.style.transform = shown ? `rotate(${shown}deg)` : '';
  }
  /** Programmatic moves are not gestures. */
  function quietly(move: () => void) {
    placing = true;
    try {
      move();
    } finally {
      placing = false;
      if (map) placedZoom = map.getZoom();
    }
  }
  /** A pinch or double tap: following keeps following, at that zoom. */
  function userZoom() {
    if (!map) return;
    if (view === 'follow') followZoom = map.getZoom();
    else view = 'free';
    setViewButtons();
  }
  /** Two fingers turning: the map turns with them and stops following. */
  function turnBy(degrees: number) {
    if (view !== 'free') {
      view = 'free';
      setViewButtons();
    }
    setRotor(((rotorAngle + degrees + 540) % 360) - 180);
  }
  /** A pan stops following and leaves the map where the finger put it. */
  function panBy(dx: number, dy: number) {
    if (!map) return;
    if (view !== 'free') {
      view = 'free';
      setViewButtons();
    }
    // The map turns by `rotorAngle`; turn the finger's motion back into it.
    const a = (rotorAngle * Math.PI) / 180,
      cos = Math.cos(a),
      sin = Math.sin(a);
    map.panBy([-(cos * dx + sin * dy), -(cos * dy - sin * dx)], {
      animate: false,
    });
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
    const arrow = marker
      ?.getElement()
      ?.querySelector<HTMLElement>('.nav-arrow');
    if (arrow) arrow.style.transform = `rotate(${angle}deg)`;
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

  /** The rotating map is a square around the traveler, big enough for any angle. */
  function layout() {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    pivot = { x: w / 2, y: h * pivotRatio };
    size = Math.ceil(
      2 *
        Math.hypot(
          Math.max(pivot.x, w - pivot.x),
          Math.max(pivot.y, h - pivot.y),
        ),
    );
    Object.assign(rotor.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${pivot.x - size / 2}px`,
      top: `${pivot.y - size / 2}px`,
    });
    map?.invalidateSize({ pan: false });
    place();
  }

  function createMap() {
    map = L.map('nav-map', {
      zoomControl: false,
      attributionControl: false,
      // Zoom around the map's center, the traveler while following, so it
      // works on the turned map; panning is handled in `setupGestures`.
      dragging: false,
      // Double tap (and hold to zoom with one finger) is `setupQuickZoom`'s:
      // iOS does not give Leaflet the clicks it needs on this screen.
      touchZoom: 'center',
      scrollWheelZoom: 'center',
      doubleClickZoom: false,
      // No synthetic long-press menu from Leaflet on iOS.
      tapHold: false,
      boxZoom: false,
      keyboard: false,
      fadeAnimation: false,
      zoomAnimation: false,
    });
    // A gesture that ends on the level it reached while moving fires no
    // `zoomend`, so every settled view is checked against the code's zoom.
    map.on('zoomend moveend', () => {
      if (placing || !map || map.getZoom() === placedZoom) return;
      placedZoom = map.getZoom();
      userZoom();
    });
    setupQuickZoom(map, { center: true });
    map.on('quickzoomstart', () => (quickZooming = true));
    map.on('quickzoomend', () => (quickZooming = false));
    const config = tileConfig('standard');
    tiles = L.tileLayer(config.url, {
      maxNativeZoom: config.maxNativeZoom,
      maxZoom: config.maxZoom,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    }).addTo(map);
    tiles.on('tileerror', () => {
      tileErrors++;
      mapNotice();
    });
    tiles.on('tileload', () => {
      tileLoads++;
      mapNotice();
    });
  }
  /** Without tiles the route still draws over the neutral background. */
  function mapNotice() {
    $('nav-no-map').hidden =
      navigator.onLine && !(tileErrors >= 4 && !tileLoads);
  }

  function drawRoute(next: Route) {
    if (!map) return;
    ahead?.remove();
    behind?.remove();
    ahead = L.polyline(next.segments, {
      className: 'nav-route',
      color: '#12796e',
      weight: 8,
      interactive: false,
    }).addTo(map);
    behind = L.polyline([], {
      className: 'nav-travelled',
      color: '#8795a1',
      weight: 8,
      interactive: false,
    }).addTo(map);
  }

  /** Moves the map and the marker to the latest fix (or the route start). */
  function place() {
    if (!map || !route) return;
    const coord = last?.coord ?? route.segments[0]?.[0];
    if (!coord) return;
    if (view === 'follow')
      quietly(() => map!.setView(coord, followZoom, { animate: false }));
    else if (view === 'overview') {
      setRotor(0);
      const w = stage.clientWidth,
        h = stage.clientHeight;
      const left = size / 2 - pivot.x,
        top = size / 2 - pivot.y;
      quietly(() =>
        map!.fitBounds(L.latLngBounds(route!.segments.flat()), {
          animate: false,
          // The floating banner covers the top of the map.
          paddingTopLeft: [left + 24, top + 24 + bannerBottom()],
          paddingBottomRight: [size - w - left + 24, size - h - top + 24],
        }),
      );
    }
    if (!last) {
      applyHeading();
      return;
    }
    if (!marker) {
      marker = L.marker(last.coord, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'nav-position',
          html: '<span class="nav-arrow"></span>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        }),
      }).addTo(map);
      marker.getElement()?.setAttribute('aria-hidden', 'true');
      marker
        .getElement()
        ?.querySelector('.nav-arrow')
        ?.append(icon('navigate'));
    } else marker.setLatLng(last.coord);
    marker.getElement()?.classList.toggle('weak', !!readout?.weak);
    if (readout?.weak) {
      if (!circle)
        circle = L.circle(last.coord, {
          radius: last.accuracy,
          className: 'nav-accuracy',
          interactive: false,
        }).addTo(map);
      else circle.setLatLng(last.coord).setRadius(last.accuracy);
    } else {
      circle?.remove();
      circle = null;
    }
    applyHeading();
  }

  function render() {
    if (!route || !tracker) return;
    const r = readout;
    const turn = $('nav-turn');
    const arrived = !!r?.arrived;
    const step = arrived ? null : (r?.next?.step ?? null);
    turn.replaceChildren(maneuverGlyph(step));
    $('nav-distance').textContent = arrived
      ? ''
      : navigationDistanceLabel(
          r ? r.toNext : tracker.total,
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
    // Spoken by screen readers only when the maneuver changes.
    const current = arrived ? null : (r?.next ?? null);
    if (r && current !== announced) {
      announced = current;
      $('nav-announce').textContent = arrived
        ? t('You have arrived')
        : current
          ? `${t(maneuverText(current.step) ?? 'Continue')} · ${roadText(current.step)}`
          : t('Destination');
    }
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
    if (behind && r) {
      behind.setLatLngs(tracker.travelled(r.progress));
    }
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
    chooseHeading();
    calibrationNotice();
    render();
    place();
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
    tracker = createNavigationTracker(route);
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
    if (!map) createMap();
    drawRoute(route);
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
    circle?.remove();
    circle = null;
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
  setupGestures();
  /**
   * One finger pans the map; double tap (and hold to zoom) is
   * `setupQuickZoom`'s; two fingers are Leaflet's pinch zoom and, once they
   * twist past `TWIST_START`, turn the map. The
   * browser's own long-press menu, loupe, callout and text selection never
   * open on the map.
   */
  function setupGestures() {
    const fingers = new Map<number, { x: number; y: number }>();
    let panning = false,
      twist: { last: number; total: number; turning: boolean } | null = null;
    /** The angle of the line between the two fingers, clockwise. */
    const fingerAngle = () => {
      const [a, b] = [...fingers.values()];
      return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    };
    const control = (target: EventTarget | null) =>
      !!(target as Element | null)?.closest?.('button, a');
    stage.addEventListener('contextmenu', (event) => event.preventDefault());
    stage.addEventListener('selectstart', (event) => event.preventDefault());
    // Pointer events come first and still arrive; cancelling the touch stops
    // iOS from starting its loupe, selection or callout on the map.
    stage.addEventListener(
      'touchstart',
      (event) => {
        if (!control(event.target)) event.preventDefault();
      },
      { passive: false },
    );
    stage.addEventListener('pointerdown', (event) => {
      if (control(event.target) || quickZooming) return;
      if (!fingers.size) panning = false;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      twist =
        fingers.size === 2
          ? { last: fingerAngle(), total: 0, turning: false }
          : null;
    });
    stage.addEventListener('pointermove', (event) => {
      const from = fingers.get(event.pointerId);
      if (!from || quickZooming) return;
      if (twist && fingers.size === 2) {
        fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const angle = fingerAngle();
        let turn = ((angle - twist.last + 540) % 360) - 180;
        twist.last = angle;
        twist.total += turn;
        if (!twist.turning) {
          if (Math.abs(twist.total) < TWIST_START) return;
          twist.turning = true;
          turn = twist.total;
        }
        turnBy(turn);
        return;
      }
      if (fingers.size !== 1) return;
      const dx = event.clientX - from.x,
        dy = event.clientY - from.y;
      if (!panning && Math.hypot(dx, dy) < PAN_START) return;
      panning = true;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      panBy(dx, dy);
    });
    const lift = (event: PointerEvent) => {
      fingers.delete(event.pointerId);
      twist = null;
      // After a pinch, the finger left on the screen must not pan.
      if (fingers.size) fingers.clear();
    };
    stage.addEventListener('pointerup', lift);
    stage.addEventListener('pointercancel', lift);
  }

  return {
    /** Settings opened: show the stored notice choice. */
    syncSetting() {
      setting.checked = noticeWanted();
    },
  };
}
