import L from 'leaflet';
import { detectClimbs, hardestClimb, type Climb } from './climbs';
import type { Coord, Route, State } from './core';
import { departureOf } from './departure';
import { byId as $ } from './dom';
import { icon } from './icons';
import { t } from './i18n';
import {
  cumulativeClimb,
  elevationStats,
  profileFromTrack,
  samplePlan,
  smoothProfile,
  type ProfilePoint,
} from './elevation';
import {
  countdown,
  fetchElevations,
  retryIn,
  UsageLimitError,
} from './services';
import {
  indexTrack,
  legDistances,
  pointAtDistance,
  trackSlice,
} from './track-position';
import { travelTimeSeconds } from './travel-time';
import { distanceLabel, elevationLabel, milepostLabel } from './units';

/**
 * Elevation row in the route summary: profile chart and statistics. Recorded
 * GPX elevations are used locally; otherwise elevation is requested only when
 * the row is opened. The chart cursor shows the point on the map.
 */

const WIDTH = 300,
  HEIGHT = 90,
  PAD = 4;
const SVG = 'http://www.w3.org/2000/svg';
/** Quiet time before fetching elevation for a new route while the row is open. */
const SETTLE_MS = 2000;

export function setupElevation(
  map: L.Map,
  deps: {
    state: () => State;
    endpoint: () => string;
    /** Recorded elevations for an imported route, if any. */
    recorded: (route: Route) => (number | null)[][] | undefined;
    /** The device's average speed in km/h, for climb passage times. */
    speed: () => number;
  },
) {
  const details = $<HTMLDetailsElement>('elevation'),
    chart = $('elevation-chart'),
    stats = $('elevation-stats'),
    status = $('elevation-status'),
    retry = $<HTMLButtonElement>('elevation-retry');
  map.createPane('elevation-cursor').style.zIndex = '586';
  const cursorLayer = L.layerGroup().addTo(map);
  // The climb chosen in the list, highlighted on the map and in the chart.
  map.createPane('climb').style.zIndex = '585';
  const climbLayer = L.layerGroup().addTo(map);
  let selected = -1,
    settle: ReturnType<typeof setTimeout> | undefined,
    cancelWait = () => {},
    /** The single automatic retry after a usage limit was already used. */
    retried = false;
  let route: Route | null = null,
    profile: ProfilePoint[] | null = null,
    fromService = false,
    controller: AbortController | undefined;

  const locale = () => (deps.state().language === 'pt' ? 'pt-BR' : 'en');
  const units = () => deps.state().units;

  /**
   * Along-track distance of each route point, so samples restart at every
   * point and an edit changes only the samples of the legs next to it.
   */
  function legBounds(target: Route): number[] {
    const points = (
      target.snapped ?? deps.state().points.map((p) => p.coord)
    ).filter((c): c is Coord => !!c);
    return legDistances(target.segments, points);
  }

  function message(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
    status.removeAttribute('aria-busy');
    retry.hidden = !error;
  }

  async function load() {
    if (!route || !details.open || profile) return render();
    const recorded = deps.recorded(route);
    if (recorded) {
      profile = smoothProfile(
        profileFromTrack(route.segments, recorded),
        'recorded',
      );
      fromService = false;
      return render();
    }
    controller?.abort();
    controller = new AbortController();
    const target = route,
      signal = controller.signal;
    const plan = samplePlan(target.segments, legBounds(target));
    message('Loading elevation…');
    try {
      const values = await fetchElevations(
        deps.endpoint(),
        plan.map((p) => p.coord),
        signal,
        () => route === target,
      );
      if (route !== target) return;
      profile = smoothProfile(
        plan.flatMap((p, i) =>
          values[i] === null
            ? []
            : [{ at: p.at, ele: values[i]!, ...(p.gap ? { gap: true } : {}) }],
        ),
        'terrain',
      );
      fromService = true;
      message('');
      render();
      retried = false;
    } catch (error) {
      if (route !== target || (error as Error).name === 'AbortError') return;
      // Usage limit: a live countdown, then one automatic retry. Refused again,
      // it counts down once more and only then offers the button, so repeated
      // taps cannot make the limit worse. Other errors show the button now.
      if (error instanceof UsageLimitError) {
        const again = !retried;
        retried = true;
        waitForLimit(target, error.wait, again);
        return;
      }
      retried = false;
      message(
        error instanceof Error
          ? error.message
          : 'Elevation unavailable. Try again.',
        true,
      );
    }
  }

  /** "… Try again in 30s." counting down; then retries or offers the button. */
  function waitForLimit(target: Route, wait: number, retryAfter: boolean) {
    cancelWait();
    let first = true;
    cancelWait = countdown(
      wait,
      (seconds) => {
        if (route !== target || !details.open) return cancelWait();
        message(`Elevation usage limit reached. ${retryIn(seconds * 1000)}`);
        // Announced once, not every second.
        if (!first) status.setAttribute('aria-busy', 'true');
        first = false;
      },
      () => {
        if (route !== target || !details.open) return;
        if (retryAfter) void load();
        else message('Elevation usage limit reached.', true);
      },
    );
  }

  function render() {
    chart.replaceChildren();
    stats.replaceChildren();
    if (!route || !profile) return;
    const source = fromService ? 'terrain' : 'recorded';
    const summary = elevationStats(profile, source);
    if (!summary) {
      message('No elevation data for this route.');
      return;
    }
    const total = profile.at(-1)!.at || 1;
    const span = Math.max(1, summary.max - summary.min);
    const x = (at: number) => PAD + (at / total) * (WIDTH - 2 * PAD);
    const y = (ele: number) =>
      PAD + (1 - (ele - summary.min) / span) * (HEIGHT - 2 * PAD);
    // One filled area per GPX segment, so gaps stay as breaks.
    const parts: ProfilePoint[][] = [];
    for (const p of profile)
      if (p.gap || !parts.length) parts.push([p]);
      else parts.at(-1)!.push(p);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('elevation-svg');
    const climbs = detectClimbs(profile, source);
    if (selected >= climbs.length) selected = -1;
    // Climb stretches shaded behind the profile; the chosen one stronger.
    climbs.forEach((climb, i) => {
      const band = document.createElementNS(SVG, 'rect');
      band.setAttribute('x', x(climb.start).toFixed(1));
      band.setAttribute('y', '0');
      band.setAttribute(
        'width',
        Math.max(1, x(climb.end) - x(climb.start)).toFixed(1),
      );
      band.setAttribute('height', String(HEIGHT));
      band.classList.add('elevation-climb');
      if (i === selected) band.classList.add('selected');
      svg.append(band);
    });
    for (const part of parts) {
      const line = part.map(
        (p) => `${x(p.at).toFixed(1)},${y(p.ele).toFixed(1)}`,
      );
      const area = document.createElementNS(SVG, 'path');
      area.setAttribute(
        'd',
        `M${x(part[0].at).toFixed(1)},${HEIGHT} L${line.join(' L')} L${x(part.at(-1)!.at).toFixed(1)},${HEIGHT} Z`,
      );
      area.classList.add('elevation-area');
      const stroke = document.createElementNS(SVG, 'path');
      stroke.setAttribute('d', `M${line.join(' L')}`);
      stroke.classList.add('elevation-line');
      svg.append(area, stroke);
    }
    const guide = document.createElementNS(SVG, 'line');
    guide.classList.add('elevation-guide');
    guide.setAttribute('y1', '0');
    guide.setAttribute('y2', String(HEIGHT));
    guide.style.display = 'none';
    svg.append(guide);
    const readout = document.createElement('p');
    readout.className = 'elevation-readout hint';
    const labels = document.createElement('div');
    labels.className = 'elevation-labels';
    for (const text of [
      elevationLabel(summary.max, units(), locale()),
      elevationLabel(summary.min, units(), locale()),
    ]) {
      const label = document.createElement('span');
      label.textContent = text;
      labels.append(label);
    }
    const axis = document.createElement('p');
    axis.className = 'elevation-axis hint';
    axis.append(
      document.createTextNode(distanceLabel(0, units(), locale())),
      document.createTextNode(' · '),
      document.createTextNode(distanceLabel(total, units(), locale())),
    );
    const frame = document.createElement('div');
    frame.className = 'elevation-frame';
    frame.append(svg, labels);
    chart.append(frame, axis, readout);

    // Cursor: chart position → profile point and map marker.
    const index = indexTrack(route.segments);
    const climbed = cumulativeClimb(profile, source);
    const hide = () => {
      guide.style.display = 'none';
      readout.textContent = '';
      cursorLayer.clearLayers();
    };
    frame.onpointermove = (event) => {
      const box = svg.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - box.left) / box.width),
      );
      const at = ratio * total;
      let n = 0;
      profile!.forEach((p, i) => {
        if (Math.abs(p.at - at) < Math.abs(profile![n].at - at)) n = i;
      });
      const nearest = profile![n];
      guide.setAttribute('x1', x(nearest.at).toFixed(1));
      guide.setAttribute('x2', x(nearest.at).toFixed(1));
      guide.style.display = '';
      // Gain so far along the route, with the same noise threshold as the totals.
      readout.textContent = `${distanceLabel(nearest.at, units(), locale())} · ${elevationLabel(nearest.ele, units(), locale())} · Gain so far ${elevationLabel(climbed[n].ascent, units(), locale())} · Loss so far ${elevationLabel(climbed[n].descent, units(), locale())}`;
      const point = pointAtDistance(index, nearest.at);
      cursorLayer.clearLayers();
      if (point)
        L.circleMarker(point.coord as Coord, {
          pane: 'elevation-cursor',
          radius: 6,
          className: 'elevation-cursor',
          interactive: false,
        }).addTo(cursorLayer);
    };
    frame.onpointerleave = hide;

    const lines = [
      `Min ${elevationLabel(summary.min, units(), locale())} · Max ${elevationLabel(summary.max, units(), locale())} · Avg ${elevationLabel(summary.mean, units(), locale())}`,
      // Estimated total climbing for the whole route (and the matching loss).
      `Elevation gain ${elevationLabel(summary.ascent, units(), locale())} · Elevation loss ${elevationLabel(summary.descent, units(), locale())}`,
    ];
    const note = document.createElement('p');
    note.className = 'hint';
    if (fromService) {
      // Short note; the help explains the 90 m terrain model, bridges and tunnels.
      const language = deps.state().language === 'pt' ? 'pt' : 'en';
      const link = document.createElement('a');
      // The hash stays the route state, as in the header Help link, so Back to map returns to it.
      link.href = `./help.html?lang=${language}&section=elevation${location.hash}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'See the help.';
      note.append(
        document.createTextNode('Elevation estimated from terrain.'),
        document.createTextNode(' '),
        link,
      );
    } else note.textContent = 'Recorded in the imported file.';
    stats.replaceChildren(
      ...lines.map((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }),
      climbList(climbs),
      note,
    );
    showClimb(climbs[selected] ?? null, index);
  }

  /** Climbs in route order; one is marked as the hardest by score. */
  function climbList(climbs: Climb[]): HTMLElement {
    const box = document.createElement('div');
    box.className = 'climbs';
    if (!climbs.length) {
      const none = document.createElement('p');
      none.className = 'hint';
      none.textContent = 'No significant climbs on this route.';
      box.append(none);
      return box;
    }
    const heading = document.createElement('p');
    heading.className = 'climbs-heading';
    heading.textContent = `Climbs (${climbs.length})`;
    const list = document.createElement('ol');
    const hardest = hardestClimb(climbs);
    const leaving = departureOf(deps.state());
    const percent = (value: number) =>
      `${value.toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
    climbs.forEach((climb, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'climb';
      button.setAttribute('aria-pressed', String(i === selected));
      button.setAttribute('aria-controls', 'map');
      const parts = [
        milepostLabel(climb.start, units(), locale()),
        distanceLabel(climb.length, units(), locale()),
        `+${elevationLabel(climb.gain, units(), locale())}`,
        percent(climb.grade),
        `${t('max')} ${percent(climb.maxGrade)}`,
      ];
      if (leaving) {
        const time =
          Date.parse(leaving) +
          travelTimeSeconds(climb.start, deps.speed()) * 1000;
        parts.push(
          new Date(time).toLocaleTimeString(locale(), {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      }
      // The hardest climb is marked by a small summit icon, not a wide badge,
      // so the row stays on one line; its name stays for screen readers.
      const mark =
        i === hardest ? icon('summit') : document.createElement('span');
      mark.classList.add('climb-mark');
      const text = document.createElement('span');
      text.textContent = parts.join(' · ');
      // Grid on an inner element: older Safari ignores grid on a <button>.
      const grid = document.createElement('span');
      grid.className = 'climb-grid';
      grid.append(mark, text);
      button.append(grid);
      if (climb.suspect) {
        const check = document.createElement('span');
        check.className = 'climb-check';
        check.textContent = 'Check: tunnel or bridge?';
        text.append(document.createElement('br'), check);
      }
      if (i === hardest) {
        const label = document.createElement('span');
        label.className = 'sr-only';
        label.textContent = 'Hardest';
        button.append(label);
        button.title = t('Hardest');
      }
      button.onclick = () => {
        selected = selected === i ? -1 : i;
        render();
        if (selected >= 0) focusClimb(climbs[selected]);
      };
      item.append(button);
      list.append(item);
    });
    box.append(heading, list);
    return box;
  }

  /** Chosen climb on the map: its stretch, start and summit. */
  function showClimb(
    climb: Climb | null,
    index: ReturnType<typeof indexTrack>,
  ) {
    climbLayer.clearLayers();
    if (!climb || !details.open) return;
    for (const part of trackSlice(index, climb.start, climb.end))
      L.polyline(part, {
        pane: 'climb',
        className: 'climb-line',
        interactive: false,
      }).addTo(climbLayer);
    const start = pointAtDistance(index, climb.start),
      summit = pointAtDistance(index, climb.end);
    if (start)
      L.circleMarker(start.coord, {
        pane: 'climb',
        radius: 6,
        className: 'climb-start',
        interactive: false,
      }).addTo(climbLayer);
    if (summit) {
      const svg = icon('summit');
      L.marker(summit.coord, {
        pane: 'climb',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'climb-summit',
          html: svg.outerHTML,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(climbLayer);
    }
  }

  /** Fits the map to a climb; on mobile the panel makes room for the map. */
  function focusClimb(climb: Climb) {
    if (!route) return;
    const parts = trackSlice(
      indexTrack(route.segments),
      climb.start,
      climb.end,
    );
    if (!parts.length) return;
    if (!$('route-panel').hidden && matchMedia('(max-width: 759px)').matches)
      $('panel-toggle').click();
    map.fitBounds(L.latLngBounds(parts.flat()), { padding: [40, 40] });
  }

  details.addEventListener('toggle', () => {
    if (details.open) {
      clearTimeout(settle);
      void load();
    } else {
      clearTimeout(settle);
      cancelWait();
      cursorLayer.clearLayers();
      climbLayer.clearLayers();
    }
  });
  retry.onclick = () => void load();

  return {
    /** A new route resets the profile; an open row loads it again. */
    setRoute(next: Route | null) {
      if (next === route) return render();
      controller?.abort();
      route = next;
      profile = null;
      selected = -1;
      message('');
      cursorLayer.clearLayers();
      climbLayer.clearLayers();
      chart.replaceChildren();
      stats.replaceChildren();
      cancelWait();
      retried = false;
      // While the route keeps changing (editing points), wait for it to
      // settle so intermediate routes do not spend the Open-Meteo budget.
      clearTimeout(settle);
      if (route && details.open) {
        // Recorded elevations need no request: show them at once.
        if (deps.recorded(route)) void load();
        else {
          message('Loading elevation…');
          settle = setTimeout(() => void load(), SETTLE_MS);
        }
      }
    },
    refresh: () => render(),
  };
}
