import L from 'leaflet';
import { LongPress } from './long-press';
import { t } from './i18n';
import type { Coord } from './core';
export function setupPointMenu(
  map: L.Map,
  choose: (kind: 'start' | 'stop' | 'destination', coord: Coord) => void,
  click: (coord: Coord) => void,
  /** False while route editing is locked; it reports why to the user. */
  editable: () => boolean = () => true,
) {
  const container = map.getContainer();
  const menu = document.createElement('div');
  menu.id = 'point-menu';
  menu.className = 'point-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t('Choose route point'));
  container.parentElement!.append(menu);
  let coord: Coord = [0, 0],
    pointerId: number | null = null,
    openingEvent: PointerEvent | null = null;
  let suppressClick = false;
  // A touch release may retarget its synthetic click to the menu just opened
  // under the finger. Consume that click, but allow the next deliberate tap.
  container.parentElement!.addEventListener(
    'pointerdown',
    () => {
      suppressClick = false;
    },
    true,
  );
  container.parentElement!.addEventListener(
    'click',
    (event) => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  const close = () => {
    menu.hidden = true;
  };
  for (const [kind, label] of [
    ['start', 'Set as start'],
    ['stop', 'Add as stop'],
    ['destination', 'Set as destination'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'menuitem');
    button.onclick = () => {
      choose(kind, coord);
      close();
      container.focus();
    };
    menu.append(button);
  }
  const open = (point: L.Point, position: L.LatLng, focus: boolean) => {
    coord = [position.lat, position.lng];
    menu.hidden = false;
    const bounds = container.getBoundingClientRect();
    const panel = document.getElementById('route-panel')!;
    const bottom =
      !panel.hidden && matchMedia('(max-width: 759px)').matches
        ? panel.getBoundingClientRect().top -
          bounds.top -
          document.getElementById('panel-toggle')!.offsetHeight
        : bounds.height;
    menu.style.left = `${Math.max(8, Math.min(point.x, bounds.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(point.y, bottom - menu.offsetHeight - 8))}px`;
    if (focus) (menu.firstElementChild as HTMLElement).focus();
  };
  const press = new LongPress(() => {
    if (!openingEvent || !editable()) return;
    suppressClick = true;
    const point = map.mouseEventToContainerPoint(openingEvent);
    open(point, map.containerPointToLatLng(point), false);
    try {
      navigator.vibrate?.(15);
    } catch {
      /* Optional feedback. */
    }
  });
  container.addEventListener('pointerdown', (event) => {
    if (
      !matchMedia('(pointer: coarse)').matches ||
      event.pointerType === 'mouse' ||
      (event.target as Element).closest('.leaflet-marker-icon,.leaflet-control')
    )
      return;
    if (pointerId !== null) {
      press.cancel();
      return;
    }
    pointerId = event.pointerId;
    openingEvent = event;
    suppressClick = false;
    press.start(event.clientX, event.clientY);
  });
  container.addEventListener('pointermove', (event) =>
    press.move(event.clientX, event.clientY),
  );
  const end = () => {
    press.cancel();
    pointerId = null;
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  map.on('movestart', () => {
    press.cancel();
    close();
  });
  map.on('click', (event: L.LeafletMouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    close();
    if (!matchMedia('(pointer: coarse)').matches && editable())
      click([event.latlng.lat, event.latlng.lng]);
  });
  map.on('contextmenu', (event: L.LeafletMouseEvent) => {
    if (matchMedia('(pointer: coarse)').matches || !editable()) return;
    open(event.containerPoint, event.latlng, true);
  });
  container.addEventListener('keydown', (event) => {
    if (
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      event.preventDefault();
      if (editable()) open(map.getSize().divideBy(2), map.getCenter(), true);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      close();
      container.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[
        (i + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) %
          buttons.length
      ].focus();
    }
    if (event.key === 'Tab') close();
  });
}
