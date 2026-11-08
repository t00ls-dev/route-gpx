import L from 'leaflet';
import { icon } from './icons';
import { fetchRadarImage, fetchRadarTimeline } from './services';
import {
  RADAR_MAX_ZOOM,
  radarTileUrl,
  type RadarFrame,
  type RadarTimeline,
} from './radar';

/** Fetch only tiles Leaflet requests for the visible frame; abort tiles as they leave the view. */
class RadarLayer extends L.TileLayer {
  private requests = new Map<
    HTMLImageElement,
    { controller: AbortController; url?: string }
  >();
  constructor(
    private timeline: RadarTimeline,
    private frame: RadarFrame | null,
    pane: string,
    opacity: number,
  ) {
    super('', {
      pane,
      opacity,
      tileSize: 512,
      zoomOffset: -1,
      minNativeZoom: 1,
      maxNativeZoom: RADAR_MAX_ZOOM + 1,
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
      updateWhenZooming: false,
      noWrap: true,
      className: frame ? 'radar-images' : 'radar-coverage',
    });
    this.on('tileunload', (event: L.TileEvent) =>
      this.release(event.tile as HTMLImageElement),
    );
  }
  private release(tile: HTMLImageElement) {
    const request = this.requests.get(tile);
    request?.controller.abort();
    if (request?.url) URL.revokeObjectURL(request.url);
    this.requests.delete(tile);
    tile.onload = null;
    tile.onerror = null;
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const request: { controller: AbortController; url?: string } = {
      controller: new AbortController(),
    };
    this.requests.set(tile, request);
    void fetchRadarImage(
      radarTileUrl(this.timeline, this.frame, coords.z - 1, coords.x, coords.y),
      request.controller.signal,
    )
      .then((blob) => {
        if (request.controller.signal.aborted) return;
        request.url = URL.createObjectURL(blob);
        tile.onload = () => done(undefined, tile);
        tile.onerror = () =>
          done(new Error('Radar service returned an invalid response.'), tile);
        tile.src = request.url;
      })
      .catch((error) => {
        if (!request.controller.signal.aborted)
          done(
            error instanceof Error
              ? error
              : new Error('Radar unavailable. Try again.'),
            tile,
          );
      });
    return tile;
  }
  onRemove(map: L.Map): this {
    for (const tile of this.requests.keys()) this.release(tile);
    return super.onRemove(map);
  }
}
export function setupRadar(map: L.Map) {
  const toggle = document.getElementById('radar-enabled') as HTMLInputElement;
  const container = document.createElement('section');
  container.className = 'radar-control';
  container.id = 'radar-control';
  container.hidden = true;
  container.setAttribute('aria-label', 'Rain radar');
  container.innerHTML = `<div class="radar-toolbar"><button id="radar-play" type="button" aria-label="Play or pause radar" title="Play or pause radar" disabled></button><output id="radar-time" aria-label="Radar frame time">—</output></div>
    <input id="radar-frame" type="range" min="0" max="0" step="1" value="0" aria-label="Radar timeline" disabled />
    <p id="radar-status" class="hint" role="status"></p><button id="radar-retry" type="button" hidden>Try radar again</button>
    <details id="radar-options"><summary>Legend and opacity</summary><label for="radar-opacity">Radar opacity</label><input id="radar-opacity" type="range" min="10" max="100" step="10" value="60" /><output id="radar-opacity-value" for="radar-opacity">60%</output>
    <label class="check"><input id="radar-coverage" type="checkbox" checked /><span>Show coverage mask</span></label>
    <p class="hint">Reflectivity (dBZ), not rainfall totals.</p><div class="radar-legend" aria-label="Radar reflectivity legend"><span><i style="background:#00a3e0"></i>20 dBZ</span><span><i style="background:#ffaa00"></i>40 dBZ</span><span><i style="background:#ff77ff"></i>60 dBZ</span></div>
    <p class="hint">Shaded areas: no coverage in the approximate mask. Clear areas do not confirm dry weather.</p><p class="hint">Past two hours only. Zoom above level 7 adds no detail.</p></details>
`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    container.querySelector<T>('#' + id)!;
  const play = $<HTMLButtonElement>('radar-play'),
    slider = $<HTMLInputElement>('radar-frame'),
    opacity = $<HTMLInputElement>('radar-opacity'),
    coverageToggle = $<HTMLInputElement>('radar-coverage');
  play.append(icon('play'));
  const control = new L.Control({ position: 'bottomleft' });
  control.onAdd = () => {
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  control.addTo(map);
  const pane = map.createPane('radar');
  pane.style.zIndex = '350';
  pane.style.pointerEvents = 'none'; // Below route paths (400) and markers (600).
  const coveragePane = map.createPane('radarCoverage');
  coveragePane.style.zIndex = '340';
  coveragePane.style.pointerEvents = 'none';
  let enabled = false,
    playing = false,
    failed = false,
    index = 0,
    version = 0,
    timeline: RadarTimeline | undefined,
    layer: RadarLayer | undefined,
    coverage: RadarLayer | undefined,
    controller: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  function message(value: string, error = false) {
    $('radar-status').replaceChildren(document.createTextNode(value));
    $('radar-status').classList.toggle('error', error);
  }
  function pause() {
    playing = false;
    clearTimeout(timer);
    play.replaceChildren(icon('play'));
    play.setAttribute('aria-pressed', 'false');
  }
  function failure(error: Error) {
    if (!enabled) return;
    failed = true;
    pause();
    play.disabled = true;
    message(error.message, true);
    $('radar-retry').hidden = false;
  }
  function timestamp() {
    if (!timeline) return;
    const locale = document.documentElement.lang.startsWith('pt')
      ? 'pt-BR'
      : 'en';
    const value = new Date(timeline.frames[index].time * 1000).toLocaleString(
      locale,
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    );
    $('radar-time').replaceChildren(document.createTextNode(value));
    slider.setAttribute('aria-valuetext', value);
  }
  function schedule() {
    clearTimeout(timer);
    if (enabled && playing && !failed && layer && !layer.isLoading())
      timer = setTimeout(
        () => showFrame((index + 1) % timeline!.frames.length),
        1000,
      );
  }
  function showFrame(next: number) {
    if (!enabled || !timeline) return;
    clearTimeout(timer);
    if (layer) map.removeLayer(layer);
    index = next;
    slider.value = String(index);
    timestamp();
    message('Loading radar images…');
    const current = new RadarLayer(
      timeline,
      timeline.frames[index],
      'radar',
      Number(opacity.value) / 100,
    );
    layer = current;
    current.on('tileerror', (event: L.TileErrorEvent) => {
      if (layer === current)
        failure(
          event.error instanceof Error
            ? event.error
            : new Error('Radar unavailable. Try again.'),
        );
    });
    current.on('loading', () => {
      if (!failed) message('Loading radar images…');
    });
    current.on('load', () => {
      if (!enabled || layer !== current || failed) return;
      message(
        Date.now() - timeline!.frames[index].time * 1000 > 30 * 60000
          ? 'Radar images are over 30 minutes old.'
          : 'Recent observations, not a forecast.',
      );
      schedule();
    });
    current.addTo(map);
  }
  function updateCoverage() {
    if (coverage) {
      map.removeLayer(coverage);
      coverage = undefined;
    }
    if (!enabled || !timeline || !coverageToggle.checked) return;
    coverage = new RadarLayer(timeline, null, 'radarCoverage', 0.3);
    coverage.on('tileerror', (event: L.TileErrorEvent) =>
      failure(
        event.error instanceof Error
          ? event.error
          : new Error('Radar coverage unavailable. Try again.'),
      ),
    );
    coverage.addTo(map);
  }
  function clear() {
    version++;
    controller?.abort();
    controller = undefined;
    pause();
    if (layer) {
      map.removeLayer(layer);
      layer = undefined;
    }
    if (coverage) {
      map.removeLayer(coverage);
      coverage = undefined;
    }
  }
  function activate() {
    clear();
    enabled = true;
    toggle.checked = true;
    toggle.setAttribute('aria-checked', 'true');
    container.hidden = false;
    resize();
    play.disabled = true;
    slider.disabled = true;
    failed = false;
    timeline = undefined;
    $('radar-time').textContent = '—';
    $('radar-retry').hidden = true;
    message('Loading radar images…');
    const generation = version;
    controller = new AbortController();
    void fetchRadarTimeline(controller.signal)
      .then((value) => {
        if (!enabled || generation !== version) return;
        timeline = value;
        slider.max = String(value.frames.length - 1);
        slider.disabled = false;
        play.disabled = value.frames.length < 2;
        showFrame(value.frames.length - 1);
        updateCoverage();
      })
      .catch((error) => {
        if (generation === version && enabled)
          failure(
            error instanceof Error
              ? error
              : new Error('Radar unavailable. Try again.'),
          );
      });
  }
  function disable() {
    enabled = false;
    clear();
    container.hidden = true;
    toggle.checked = false;
    toggle.setAttribute('aria-checked', 'false');
  }
  toggle.addEventListener('change', () =>
    toggle.checked ? activate() : disable(),
  );
  $('radar-retry').onclick = activate;
  play.onclick = () => {
    if (playing) pause();
    else if (timeline && !failed) {
      playing = true;
      play.replaceChildren(icon('pause'));
      play.setAttribute('aria-pressed', 'true');
      schedule();
    }
  };
  slider.oninput = () => {
    pause();
    showFrame(Number(slider.value));
  };
  opacity.oninput = () => {
    layer?.setOpacity(Number(opacity.value) / 100);
    $('radar-opacity-value').textContent = opacity.value + '%';
  };
  coverageToggle.onchange = updateCoverage;
  $('radar-options').addEventListener('toggle', resize);
  map.on('movestart', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  document.getElementById('language')!.addEventListener('change', timestamp);
  // Keep expanded controls inside the visible map, above the mobile sheet and below the header.
  function resize() {
    const mobile = matchMedia('(max-width:759px)').matches;
    const panel = document.getElementById('route-panel')!;
    const fullscreen = document.body.classList.contains('map-fullscreen');
    const bottom =
      mobile && !fullscreen
        ? panel.hidden
          ? 58
          : panel.getBoundingClientRect().height +
            document.getElementById('panel-toggle')!.getBoundingClientRect()
              .height +
            8
        : 10;
    const mapHeight = map.getContainer().getBoundingClientRect().height;
    const mapBox = map.getContainer().getBoundingClientRect();
    const cardBox = container.getBoundingClientRect();
    let top = fullscreen ? 12 : 66;
    for (const button of document.querySelectorAll<HTMLElement>(
      '.map-action-control button',
    )) {
      const box = button.getBoundingClientRect();
      if (box.width && cardBox.left < box.right && cardBox.right > box.left)
        top = Math.max(top, box.bottom - mapBox.top + 8);
    }
    const margin = parseFloat(getComputedStyle(container).marginBottom) || 0;
    container.style.maxHeight =
      Math.max(80, mapHeight - bottom - top - margin) + 'px';
    container.parentElement?.style.setProperty('--radar-bottom', bottom + 'px');
  }
  new ResizeObserver(resize).observe(document.getElementById('route-panel')!);
  new MutationObserver(resize).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  window.addEventListener('resize', resize);
  resize();
}
