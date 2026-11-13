import L from 'leaflet';
import { icon } from './icons';
import {
  mapCredits,
  type BaseLayer,
  type MapCredit,
  type SatelliteVintage,
} from './tile-layers';

/**
 * A round info button that opens a modal list of credits, shared by the
 * planner map and the navigation map so neither shows a credit line.
 */
export function creditsDialog(options: {
  id: string;
  name: string;
  /** Where focus goes on close when the button itself is hidden. */
  fallback?: () => HTMLElement | null;
}) {
  const container = document.createElement('div');
  container.className = options.name;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `${options.name}-toggle`;
  toggle.setAttribute('aria-label', 'Map credits');
  toggle.title = 'Map credits';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', options.id);
  toggle.append(icon('info'));
  container.append(toggle);
  const dialog = document.createElement('dialog');
  dialog.id = options.id;
  dialog.className = `${options.name}-dialog credits-dialog`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `${options.id}-title`);
  dialog.innerHTML = `<h2 id="${options.id}-title">Map credits</h2><ul></ul><form method="dialog"><button autofocus>Close</button></form>`;
  const closeButton = dialog.querySelector<HTMLButtonElement>('button')!;
  toggle.onclick = () => {
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  };
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    if (getComputedStyle(toggle).visibility === 'hidden')
      options.fallback?.()?.focus();
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
  /** Replaces the list: linked credits, then plain notes. */
  function setCredits(credits: MapCredit[], notes: string[] = []) {
    if (dialog.open) dialog.close();
    dialog.querySelector('ul')!.replaceChildren(
      ...credits.map(({ text, url }) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = text;
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.append(link);
        return item;
      }),
      ...notes.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
  }
  return { elements: [container, dialog], setCredits };
}

export function setupMapCredits(map: L.Map) {
  const { elements, setCredits } = creditsDialog({
    id: 'map-credits-dialog',
    name: 'map-credits',
    fallback: () => document.getElementById('panel-toggle'),
  });
  for (const element of elements) {
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
    map.getContainer().append(element);
  }
  return (layer: BaseLayer, vintage: SatelliteVintage, labels: boolean) =>
    setCredits(
      [
        { text: 'Leaflet', url: 'https://leafletjs.com/' },
        ...mapCredits(layer, vintage, labels),
        { text: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' },
        {
          text: 'Elevation data: Copernicus DEM GLO-90 via Open-Meteo',
          url: 'https://doi.org/10.5270/ESA-c5d3d65',
        },
        {
          text: 'Weather data license: CC BY 4.0',
          url: 'https://creativecommons.org/licenses/by/4.0/',
        },
      ],
      ['Passage times and risk summaries calculated by route-gpx.'],
    );
}
