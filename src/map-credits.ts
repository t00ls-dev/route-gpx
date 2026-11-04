import L from 'leaflet';
import { icon } from './icons';
import {
  mapCredits,
  type BaseLayer,
  type SatelliteVintage,
} from './tile-layers';

export function setupMapCredits(map: L.Map) {
  const container = document.createElement('div');
  container.className = 'map-credits';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'map-credits-toggle';
  toggle.setAttribute('aria-label', 'Map credits');
  toggle.title = 'Map credits';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'map-credits-dialog');
  toggle.append(icon('info'));
  container.append(toggle);
  const dialog = document.createElement('dialog');
  dialog.id = 'map-credits-dialog';
  dialog.className = 'map-credits-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'map-credits-title');
  dialog.innerHTML = `<h2 id="map-credits-title">Map credits</h2><ul></ul><form method="dialog"><button autofocus>Close</button></form>`;
  const closeButton = dialog.querySelector<HTMLButtonElement>('button')!;
  toggle.onclick = () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  };
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    if (getComputedStyle(toggle).visibility === 'hidden')
      document.getElementById('panel-toggle')!.focus();
    else toggle.focus();
  });
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    )
      dialog.close();
  });
  // Native modal behavior makes the map inert; wrap Tab at both ends as well.
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>('a[href],button')];
    const first = items[0],
      last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  for (const element of [container, dialog]) {
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
    map.getContainer().append(element);
  }
  return (layer: BaseLayer, vintage: SatelliteVintage, labels: boolean) => {
    if (dialog.open) dialog.close();
    const list = dialog.querySelector('ul')!;
    list.replaceChildren(
      ...[
        { text: 'Leaflet', url: 'https://leafletjs.com/' },
        ...mapCredits(layer, vintage, labels),
      ].map(({ text, url }) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = text;
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        return item;
      }),
    );
  };
}
