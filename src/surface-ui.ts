import L from 'leaflet';
import type { Coord, Route, State } from './core';
import { byId as $ } from './dom';
import {
  attributePlan,
  edgeRanges,
  MAX_PIECES,
  type EdgeRange,
} from './road-attributes';
import { AttributeLimitError, valhallaAttributes } from './services';
import {
  sectionsToCheck,
  surfaceRanges,
  surfaceTotals,
  SURFACE_KINDS,
  type SurfaceRange,
} from './surface';
import { indexTrack, legDistances, trackSlice } from './track-position';
import { distanceLabel, milepostLabel } from './units';
import { distanceUnits } from './unit-preferences';

/**
 * Surface row in the route summary: paved and unpaved totals, the unpaved
 * stretches to check and their place on the map. Road attributes are asked
 * from Valhalla only when the row is opened or the Surface coloring is
 * chosen, and stay in page memory.
 */

/** Quiet time before asking for a new route while the row is open. */
const SETTLE_MS = 2000;

export function setupSurface(
  map: L.Map,
  deps: {
    state: () => State;
    /** Another explicit user choice needs the surface (the Surface coloring). */
    wanted?: () => boolean;
    /** Called when the surface arrives or is reset, so its users redraw. */
    onSurface?: () => void;
  },
) {
  const details = $<HTMLDetailsElement>('surface'),
    status = $('surface-status'),
    retry = $<HTMLButtonElement>('surface-retry'),
    content = $('surface-result');
  map.createPane('surface').style.zIndex = '585';
  const highlight = L.layerGroup().addTo(map);
  let route: Route | null = null,
    ranges: SurfaceRange[] | null = null,
    partial = false,
    selected = -1,
    revision = 0,
    settle: ReturnType<typeof setTimeout> | undefined;

  const locale = () => (deps.state().language === 'pt' ? 'pt-BR' : 'en');
  const units = () => distanceUnits();
  const needed = () => details.open || !!deps.wanted?.();

  function message(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
    retry.hidden = !error;
  }

  /** Along-track distance of each route point, so pieces restart there. */
  function legBounds(target: Route): number[] {
    const points = (
      target.snapped ?? deps.state().points.map((p) => p.coord)
    ).filter((c): c is Coord => !!c);
    return legDistances(target.segments, points);
  }

  async function load() {
    if (!route || !needed() || ranges) return render();
    const target = route,
      mine = ++revision;
    const current = () => route === target && revision === mine;
    const plan = attributePlan(target.segments, legBounds(target));
    if (!plan) {
      message(
        `Surface is not available for this route: it would need more than ${MAX_PIECES} requests.`,
      );
      return;
    }
    message('Loading surface…');
    try {
      const results = await valhallaAttributes(
        deps.state().valhalla,
        plan,
        current,
      );
      if (!current()) return;
      if (results.every((r) => r === 'failed')) {
        message('Surface unavailable. Try again.', true);
        return;
      }
      const edges: EdgeRange[] = results.flatMap((r, i) =>
        r && r !== 'failed' ? edgeRanges(plan[i], r) : [],
      );
      partial = results.includes('failed');
      ranges = surfaceRanges(edges, indexTrack(target.segments).total);
      message('');
      deps.onSurface?.();
      render();
    } catch (error) {
      if (!current() || (error as Error).name === 'AbortError') return;
      message(
        error instanceof AttributeLimitError
          ? error.message
          : 'Surface unavailable. Try again.',
        true,
      );
    }
  }

  function render() {
    content.replaceChildren();
    if (!route || !ranges) return showSection(null);
    const total = ranges.reduce((sum, r) => sum + r.to - r.from, 0) || 1;
    const totals = document.createElement('ul');
    totals.className = 'surface-totals';
    for (const item of surfaceTotals(ranges)) {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = `surface-swatch route-coloring-${item.kind}`;
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = item.label;
      const value = document.createElement('span');
      value.className = 'surface-value';
      const percent = Math.round((item.length / total) * 100);
      value.textContent = `${distanceLabel(item.length, units(), locale())} · ${percent < 1 ? '<1' : percent}%`;
      li.append(swatch, label, value);
      totals.append(li);
    }
    content.append(totals);
    if (partial) {
      const note = document.createElement('p');
      note.className = 'hint error';
      note.textContent = 'Surface unavailable for part of the route.';
      content.append(note);
    }
    content.append(sectionList(sectionsToCheck(ranges)));
    const note = document.createElement('p');
    note.className = 'hint';
    const language = deps.state().language === 'pt' ? 'pt' : 'en';
    const link = document.createElement('a');
    link.href = `./help.html?lang=${language}&section=surface${location.hash}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'See the help.';
    note.append(
      document.createTextNode(
        'From OpenStreetMap via Valhalla. Roads without a mapped surface count as paved; unpaved stretches are the mapped ones. Check before you leave.',
      ),
      document.createTextNode(' '),
      link,
    );
    content.append(note);
  }

  /** Unpaved stretches in route order; one can be shown on the map. */
  function sectionList(sections: SurfaceRange[]): HTMLElement {
    const box = document.createElement('div');
    box.className = 'climbs surface-sections';
    if (selected >= sections.length) selected = -1;
    if (!sections.length) {
      const none = document.createElement('p');
      none.className = 'hint';
      none.textContent = 'No unpaved stretches.';
      box.append(none);
      showSection(null);
      return box;
    }
    const heading = document.createElement('p');
    heading.className = 'climbs-heading';
    heading.textContent = `Unpaved stretches (${sections.length})`;
    const list = document.createElement('ol');
    sections.forEach((section, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'climb surface-section';
      button.setAttribute('aria-pressed', String(i === selected));
      button.setAttribute('aria-controls', 'map');
      const grid = document.createElement('span');
      grid.className = 'climb-grid';
      const swatch = document.createElement('span');
      swatch.className = `surface-swatch route-coloring-${section.kind}`;
      swatch.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      // The kind is its own text node so the DOM translator localizes it.
      const kind = document.createElement('span');
      kind.textContent = SURFACE_KINDS.find(
        (k) => k.kind === section.kind,
      )!.label;
      text.append(
        document.createTextNode(
          `${milepostLabel(section.from, units(), locale())} · ${distanceLabel(section.to - section.from, units(), locale())} · `,
        ),
        kind,
      );
      grid.append(swatch, text);
      button.append(grid);
      button.onclick = () => {
        selected = selected === i ? -1 : i;
        render();
        if (selected >= 0) focusSection(section);
      };
      item.append(button);
      list.append(item);
    });
    box.append(heading, list);
    showSection(sections[selected] ?? null);
    return box;
  }

  function showSection(section: SurfaceRange | null) {
    highlight.clearLayers();
    if (!section || !route || !details.open) return;
    for (const part of trackSlice(
      indexTrack(route.segments),
      section.from,
      section.to,
    ))
      L.polyline(part, {
        pane: 'surface',
        className: 'surface-line',
        interactive: false,
      }).addTo(highlight);
  }

  /** Fits the map to a stretch; on phones the panel makes room for the map. */
  function focusSection(section: SurfaceRange) {
    if (!route) return;
    const parts = trackSlice(
      indexTrack(route.segments),
      section.from,
      section.to,
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
      if (!needed()) clearTimeout(settle);
      highlight.clearLayers();
    }
  });
  retry.onclick = () => void load();

  return {
    /** A new route resets the surface; an open row asks again once settled. */
    setRoute(next: Route | null) {
      if (next === route) return render();
      route = next;
      ranges = null;
      partial = false;
      selected = -1;
      revision++;
      message('');
      content.replaceChildren();
      highlight.clearLayers();
      clearTimeout(settle);
      deps.onSurface?.();
      if (route && needed()) {
        message('Loading surface…');
        settle = setTimeout(() => void load(), SETTLE_MS);
      }
    },
    /** Surface ranges of the current route, when loaded. */
    ranges: () => ranges,
    /** A user of the surface was turned on: load it now if still missing. */
    want() {
      if (route && !ranges && needed()) {
        clearTimeout(settle);
        void load();
      }
    },
  };
}
