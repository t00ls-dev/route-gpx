import L from 'leaflet';
import type { Coord, Route, State } from './core';
import { byId as $ } from './dom';
import {
  cumulativeClimb,
  elevationStats,
  profileFromTrack,
  samplePlan,
  smoothProfile,
  type ProfilePoint,
} from './elevation';
import { fetchElevations } from './services';
import { indexTrack, pointAtDistance } from './track-position';
import { distanceLabel, elevationLabel } from './units';

/**
 * Elevation row in the route summary: profile chart and statistics. Recorded
 * GPX elevations are used locally; otherwise elevation is requested only when
 * the row is opened. The chart cursor shows the point on the map.
 */

const WIDTH = 300,
  HEIGHT = 90,
  PAD = 4;
const SVG = 'http://www.w3.org/2000/svg';

export function setupElevation(
  map: L.Map,
  deps: {
    state: () => State;
    endpoint: () => string;
    /** Recorded elevations for an imported route, if any. */
    recorded: (route: Route) => (number | null)[][] | undefined;
  },
) {
  const details = $<HTMLDetailsElement>('elevation'),
    chart = $('elevation-chart'),
    stats = $('elevation-stats'),
    status = $('elevation-status'),
    retry = $<HTMLButtonElement>('elevation-retry');
  map.createPane('elevation-cursor').style.zIndex = '586';
  const cursorLayer = L.layerGroup().addTo(map);
  let route: Route | null = null,
    profile: ProfilePoint[] | null = null,
    fromService = false,
    controller: AbortController | undefined;

  const locale = () => (deps.state().language === 'pt' ? 'pt-BR' : 'en');
  const units = () => deps.state().units;

  function message(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
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
    const plan = samplePlan(target.segments);
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
    } catch (error) {
      if (route !== target || (error as Error).name === 'AbortError') return;
      message(
        error instanceof Error
          ? error.message
          : 'Elevation unavailable. Try again.',
        true,
      );
    }
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
      note,
    );
  }

  details.addEventListener('toggle', () => {
    if (details.open) void load();
    else cursorLayer.clearLayers();
  });
  retry.onclick = () => void load();

  return {
    /** A new route resets the profile; an open row loads it again. */
    setRoute(next: Route | null) {
      if (next === route) return render();
      controller?.abort();
      route = next;
      profile = null;
      message('');
      cursorLayer.clearLayers();
      chart.replaceChildren();
      stats.replaceChildren();
      if (route && details.open) void load();
    },
    refresh: () => render(),
  };
}
