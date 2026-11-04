import L from 'leaflet';
import {
  tileConfig,
  labelConfig,
  type BaseLayer,
  type SatelliteVintage,
} from './tile-layers';

const leaflet = '<a href="https://leafletjs.com/">Leaflet</a>';
const osm =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function setupMapCredits(map: L.Map) {
  const container = document.createElement('div');
  container.className = 'map-credits';
  container.innerHTML = `
    <button type="button" class="map-credits-toggle" aria-label="Map credits"
      title="Map credits" aria-expanded="false" aria-controls="map-credits-summary"><span aria-hidden="true">i</span></button>
    <div id="map-credits-summary" hidden><span class="map-credits-sources"></span> · <button type="button" class="map-credits-details">Credits</button></div>`;
  const toggle = container.querySelector<HTMLButtonElement>('button')!;
  const summary = container.querySelector<HTMLElement>('#map-credits-summary')!;
  const sources = container.querySelector<HTMLElement>('.map-credits-sources')!;
  const dialog = document.createElement('dialog');
  dialog.className = 'map-credits-dialog';
  dialog.setAttribute('aria-labelledby', 'map-credits-title');
  dialog.innerHTML = `<h2 id="map-credits-title">Map credits</h2><p></p><form method="dialog"><button>Close</button></form>`;
  map.getContainer().append(dialog);
  const setExpanded = (expanded: boolean) => {
    container.classList.toggle('expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    summary.hidden = !expanded;
  };
  dialog.addEventListener('close', () => {
    if (summary.hidden) toggle.focus();
  });
  toggle.onclick = () => setExpanded(!container.classList.contains('expanded'));
  container.querySelector<HTMLButtonElement>('.map-credits-details')!.onclick =
    () => dialog.showModal();
  map.on('click', () => setExpanded(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && container.classList.contains('expanded')) {
      const restoreFocus = container.contains(document.activeElement);
      setExpanded(false);
      if (restoreFocus) toggle.focus();
    }
  });
  const control = new L.Control({ position: 'bottomright' });
  control.onAdd = () => {
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.disableClickPropagation(dialog);
    L.DomEvent.disableScrollPropagation(dialog);
    return container;
  };
  control.addTo(map);
  return (layer: BaseLayer, vintage: SatelliteVintage, labels: boolean) => {
    const provider =
      layer === 'satellite'
        ? ' · <a href="https://cloudless.eox.at/">EOX</a>'
        : layer === 'topographic'
          ? ' · <a href="https://opentopomap.org/about">OpenTopoMap</a>'
          : '';
    // Only provider-owned, static HTML enters the credits; never route input.
    // Put the shorter Leaflet link first for Topographic so narrow pills can
    // wrap before OpenTopoMap and keep its credits on the second line.
    sources.innerHTML =
      layer === 'topographic'
        ? `${osm} · ${leaflet}${provider}`
        : `${osm}${provider} · ${leaflet}`;
    dialog.querySelector('p')!.innerHTML =
      `${leaflet} | ${tileConfig(layer, vintage).attribution}` +
      (layer === 'satellite' && labels ? ` | ${labelConfig.attribution}` : '');
  };
}
