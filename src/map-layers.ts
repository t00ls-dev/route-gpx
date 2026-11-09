import L from 'leaflet';
import { setupMapCredits } from './map-credits';
import {
  tileConfig,
  labelConfig,
  type TileConfig,
  type BaseLayer,
  type SatelliteVintage,
} from './tile-layers';
import { byId as element } from './dom';
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
  let base: L.TileLayer, overlay: L.TileLayer | undefined;
  const create = (config: TileConfig, zIndex = 1) =>
    L.tileLayer(config.url, {
      maxNativeZoom: config.maxNativeZoom,
      maxZoom: config.maxZoom,
      attribution: config.attribution,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
      zIndex,
    });
  const labelInput = element<HTMLInputElement>('map-labels');
  const vintageInput = element<HTMLSelectElement>('satellite-vintage');
  labelInput.checked = labels;
  labelInput.setAttribute('aria-checked', String(labels));
  vintageInput.value = vintage;
  const updateOverlay = () => {
    if (overlay) {
      map.removeLayer(overlay);
      overlay = undefined;
    }
    if (active === 'satellite' && labels)
      overlay = create(labelConfig, 2).addTo(map);
    element('label-option').hidden = active !== 'satellite';
    updateCredits(active, vintage, labels);
  };
  const render = () => {
    if (base) map.removeLayer(base);
    base = create(tileConfig(active, vintage)).addTo(map);
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
  };
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
  element('radar-enabled').addEventListener('change', () => close(true));
  render();
}
