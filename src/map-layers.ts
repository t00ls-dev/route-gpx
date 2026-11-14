import L from 'leaflet';
import type { Map as VectorMap, StyleSpecification } from 'maplibre-gl';
import { setupMapCredits } from './map-credits';
import {
  NEUTRAL_STYLE,
  STYLE_URL,
  TERRAIN_MAXZOOM,
  TERRAIN_URL,
  basemapStyle,
  fetchStyle,
  webglSupported,
  type BaseLayer,
  type SatelliteVintage,
  type TerrainSources,
} from './basemap';
import { loadMapLibre } from './maplibre-loader';
import { byId as element } from './dom';

/** Contour intervals in meters per zoom: [minor, major]. */
const CONTOUR_THRESHOLDS: Record<number, [number, number]> = {
  11: [100, 500],
  12: [50, 250],
  13: [20, 100],
  14: [10, 50],
  15: [10, 50],
};

/** Longest wait before the first load of the base map is shown anyway. */
const FIRST_LOAD_WAIT = 4000;
/** Resolution of the first load, sharpened once its tiles are drawn. */
const FIRST_LOAD_PIXEL_RATIO = 0.5;

/**
 * The planner's base map: one MapLibre layer inside Leaflet drawing
 * OpenFreeMap's vector style, the same map as navigation, composed for the
 * selected layer. Without WebGL or the style, the route and markers still
 * draw over a neutral background with a notice.
 */
export function setupMapLayers(map: L.Map) {
  const updateCredits = setupMapCredits(map);
  let active: BaseLayer = 'standard',
    vintage: SatelliteVintage = '2025',
    labels = true;
  try {
    const saved = localStorage.getItem('map-layer');
    if (
      saved === 'standard' ||
      saved === 'topographic' ||
      saved === 'satellite'
    )
      active = saved;
    if (localStorage.getItem('satellite-vintage') === '2016') vintage = '2016';
    labels = localStorage.getItem('map-labels') !== 'false';
  } catch {
    /* Map selection is optional device state. */
  }
  let glMap: VectorMap | null = null,
    base: StyleSpecification | null = null,
    terrain: TerrainSources | null = null,
    terrainLoading: Promise<TerrainSources | null> | null = null,
    revision = 0;
  /** Contours are generated on the device from the same terrain tiles. */
  const loadTerrain = () =>
    (terrainLoading ??= Promise.all([
      loadMapLibre(),
      import('maplibre-contour'),
    ])
      .then(([ml, { default: contour }]) => {
        const dem = new contour.DemSource({
          url: TERRAIN_URL,
          encoding: 'terrarium',
          maxzoom: TERRAIN_MAXZOOM,
          worker: true,
        });
        dem.setupMaplibre(ml);
        return (terrain = {
          dem: dem.sharedDemProtocolUrl,
          contours: dem.contourProtocolUrl({
            thresholds: CONTOUR_THRESHOLDS,
            elevationKey: 'ele',
            levelKey: 'level',
            contourLayer: 'contours',
          }),
        });
      })
      .catch(() => {
        terrainLoading = null;
        return null;
      }));
  const currentStyle = () =>
    base
      ? basemapStyle(base, active, {
          vintage,
          labels,
          terrain: terrain ?? undefined,
        })
      : NEUTRAL_STYLE;
  const apply = async () => {
    const current = ++revision;
    if (active === 'topographic') await loadTerrain();
    if (!glMap || current !== revision) return;
    glMap.setStyle(currentStyle(), { diff: false });
  };
  const loadBase = async () => {
    base ??= await fetchStyle(STYLE_URL);
    element('map-no-style').hidden = Boolean(base);
  };
  // A style that failed (offline, for instance) is asked once more when the
  // connection returns, as routing does; never in a loop.
  window.addEventListener('online', () => {
    if (base || !glMap) return;
    void loadBase().then(() => (base ? apply() : undefined));
  });
  /**
   * The first load draws at a lower resolution until its tiles are drawn (or
   * 4 s pass), then at the screen's. Where the browser renders WebGL without
   * the GPU, each frame's cost grows with its pixels, and the first load draws
   * one frame per arriving tile.
   */
  const sharpenWhenLoaded = (gl: VectorMap) => {
    const sharpen = () => {
      clearTimeout(timer);
      // null (documented, missing from the type) follows devicePixelRatio
      // again, as when the browser zooms or the window changes screens.
      gl.setPixelRatio(null as unknown as number);
    };
    const timer = setTimeout(sharpen, FIRST_LOAD_WAIT);
    gl.once('idle', sharpen);
  };
  const start = async () => {
    if (!webglSupported()) {
      element('map-no-gl').hidden = false;
      return;
    }
    try {
      await Promise.all([
        loadMapLibre(),
        import('@maplibre/maplibre-gl-leaflet'),
      ]);
      await loadBase();
      if (active === 'topographic') await loadTerrain();
      // Created with the final style, so the first load draws one style only.
      const options: L.LeafletMaplibreGLOptions & { padding: number } = {
        style: currentStyle(),
        interactive: false,
        fadeDuration: 0,
        pixelRatio: FIRST_LOAD_PIXEL_RATIO,
        // No canvas margin past the screen (the wrapper's option, missing
        // from its types): its 10% on each side draws 44% more pixels per frame.
        padding: 0,
        // MapLibre's default 'same-origin' credentials send nothing cross-origin.
      };
      const layer = L.maplibreGL(options).addTo(map);
      glMap = layer.getMaplibreMap();
      sharpenWhenLoaded(glMap);
      // A layer chosen while terrain was still loading.
      if (active === 'topographic' && !terrain) void apply();
    } catch {
      element('map-no-style').hidden = false;
    }
  };
  const updateOverlay = () => {
    element('label-option').hidden = active !== 'satellite';
    updateCredits(active, vintage, labels);
  };
  const render = () => {
    document.body.dataset.mapLayer = active;
    element('satellite-license').hidden =
      active !== 'satellite' || vintage !== '2025';
    document
      .querySelectorAll<HTMLButtonElement>('[data-layer]')
      .forEach((button) =>
        button.setAttribute(
          'aria-checked',
          String(button.dataset.layer === active),
        ),
      );
    updateOverlay();
    void apply();
  };
  const labelInput = element<HTMLInputElement>('map-labels');
  const vintageInput = element<HTMLSelectElement>('satellite-vintage');
  labelInput.checked = labels;
  labelInput.setAttribute('aria-checked', String(labels));
  vintageInput.value = vintage;
  const save = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Map remains usable without storage. */
    }
  };
  const button = element('layers-toggle'),
    menu = element('layers-menu');
  const close = (focus = false) => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  };
  button.onclick = () => {
    const opening = menu.hidden;
    menu.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    if (opening) {
      element('point-menu').hidden = true;
      (menu.querySelector('[aria-checked=true]') as HTMLElement).focus();
    }
  };
  menu.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((option) => {
    option.onclick = () => {
      active = option.dataset.layer as BaseLayer;
      save('map-layer', active);
      render();
      close(true);
    };
  });
  labelInput.onchange = () => {
    labels = labelInput.checked;
    labelInput.setAttribute('aria-checked', String(labels));
    save('map-labels', String(labels));
    updateOverlay();
    if (active === 'satellite') void apply();
  };
  vintageInput.onchange = () => {
    vintage = vintageInput.value === '2016' ? '2016' : '2025';
    save('satellite-vintage', vintage);
    if (active === 'satellite') render();
  };
  menu.addEventListener('keydown', (event) => {
    const options = [
      ...menu.querySelectorAll<HTMLElement>('button,input'),
    ].filter((item) => !item.closest('[hidden]'));
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      options[
        (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) %
          options.length
      ].focus();
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1].focus();
    }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (
      !menu.contains(event.target as Node) &&
      !button.contains(event.target as Node)
    )
      close();
  });
  render();
  // The map starts after the page has loaded and painted a frame, so the
  // panel's text shows before MapLibre's first, heavier tasks.
  const afterPaint = () =>
    requestAnimationFrame(() => setTimeout(() => void start()));
  if (document.readyState === 'complete') afterPaint();
  else window.addEventListener('load', afterPaint, { once: true });
}
