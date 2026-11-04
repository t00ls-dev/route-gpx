import L from 'leaflet';
import { icon, iconControl } from './icons';
export function setupMapControls(map: L.Map, zoom: L.Control.Zoom) {
  const get = (id: string) => document.getElementById(id)!;
  iconControl(get('locate'), 'locate', 'Use my location');
  iconControl(get('layers-toggle'), 'layers', 'Map layers');
  iconControl(get('fullscreen'), 'maximize', 'Full screen');
  get('fullscreen').prepend(icon('minimize'));
  iconControl(get('fit'), 'route', '◎ Fit route');
  iconControl(get('help'), 'help', 'Help');
  iconControl(get('undo'), 'undo', '↶ Undo');
  const container = document.createElement('div');
  container.className = 'map-action-control';
  container.append(
    get('locate'),
    get('layers-toggle').parentElement!,
    get('fullscreen'),
    get('fit'),
    get('undo'),
  );
  document.querySelector('.map-tools')?.remove();
  const control = new L.Control({ position: 'topright' });
  control.onAdd = () => {
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };
  control.addTo(map);
  zoom.setPosition('topright');
  get('map').setAttribute('aria-describedby', 'map-note');
  const layout = () => {
    map.invalidateSize({ pan: false });
  };
  window.addEventListener('resize', layout);
  layout();
}
