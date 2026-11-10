import L from 'leaflet';
import { icon, iconControl } from './icons';
export function setupMapControls(map: L.Map, zoom: L.Control.Zoom) {
  const get = (id: string) => document.getElementById(id)!;
  iconControl(get('locate'), 'locate', 'Use my location');
  iconControl(get('layers-toggle'), 'layers', 'Map layers');
  iconControl(get('fullscreen'), 'maximize', 'Full screen');
  get('fullscreen').prepend(icon('minimize'));
  iconControl(get('fit'), 'route', 'Fit route');
  iconControl(get('help'), 'help', 'Help');
  iconControl(get('undo'), 'undo', 'Undo');
  iconControl(get('lock'), 'unlock', 'Lock editing');
  get('lock').prepend(icon('lock'));
  const container = document.createElement('div');
  container.className = 'map-action-control';
  // Two groups: the map view, then the route.
  const group = (...items: HTMLElement[]) => {
    const element = document.createElement('div');
    element.className = 'map-tool-group';
    element.append(...items);
    return element;
  };
  container.append(
    group(
      get('locate'),
      get('layers-toggle').parentElement!,
      get('fullscreen'),
    ),
    group(get('fit'), get('lock'), get('undo')),
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
