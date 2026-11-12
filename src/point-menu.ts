import L from 'leaflet';
import { LongPress } from './long-press';
import { t } from './i18n';
import type { Coord } from './core';
import { compactLayout } from './panel';
/**
 * Map point menu (right click, long press, ContextMenu key): choose a route
 * point there, or ask for its elevation. While editing is locked only the
 * elevation query stays, since viewing is not an edit.
 */
export function setupPointMenu(
  map: L.Map,
  options: {
    choose: (kind: 'start' | 'stop' | 'destination', coord: Coord) => void;
    click: (coord: Coord) => void;
    /** False while route editing is locked; it reports why to the user. */
    editable?: () => boolean;
    /** The same check without the report, to choose the menu items. */
    locked?: () => boolean;
    /** Elevation of the chosen point, on this explicit action only. */
    elevation?: (coord: Coord) => void;
    /** Closes what a map tap should dismiss first; true when it did. */
    dismiss?: () => boolean;
  },
) {
  const {
    choose,
    click,
    editable = () => true,
    locked = () => false,
    elevation,
    dismiss = () => false,
  } = options;
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
  const routeItems: HTMLButtonElement[] = [];
  const item = (label: string, action: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'menuitem');
    button.onclick = () => {
      close();
      container.focus();
      action();
    };
    menu.append(button);
    return button;
  };
  for (const [kind, label] of [
    ['start', 'Set as start'],
    ['stop', 'Add as stop'],
    ['destination', 'Set as destination'],
  ] as const)
    routeItems.push(item(label, () => choose(kind, coord)));
  let separator: HTMLElement | undefined;
  if (elevation) {
    separator = document.createElement('div');
    separator.className = 'point-menu-separator';
    separator.setAttribute('role', 'separator');
    menu.append(separator);
    item('Elevation here', () => elevation(coord));
  }
  const items = () =>
    [...menu.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) => !b.hidden,
    );
  /** The menu has something to offer: route items, or the elevation query. */
  const available = () => !locked() || !!elevation;
  const open = (point: L.Point, position: L.LatLng, focus: boolean) => {
    coord = [position.lat, position.lng];
    const only = locked();
    for (const button of routeItems) button.hidden = only;
    if (separator) separator.hidden = only;
    menu.hidden = false;
    const bounds = container.getBoundingClientRect();
    // On phones the bottom sheet covers the lower part of the map.
    const bottom = compactLayout()
      ? document.getElementById('sheet')!.getBoundingClientRect().top -
        bounds.top
      : bounds.height;
    menu.style.left = `${Math.max(8, Math.min(point.x, bounds.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(point.y, bottom - menu.offsetHeight - 8))}px`;
    if (focus) items()[0]?.focus();
  };
  const press = new LongPress(() => {
    if (!openingEvent || (!available() && !editable())) return;
    suppressClick = true;
    const point = map.mouseEventToContainerPoint(openingEvent);
    open(point, map.containerPointToLatLng(point), false);
    try {
      navigator.vibrate?.(15);
    } catch {
      /* Optional feedback. */
    }
  });
  // The browser's own long-press menu and text selection never belong on
  // the map surface; form fields and the route panel are unaffected.
  container.addEventListener('contextmenu', (event) => {
    if (matchMedia('(pointer: coarse)').matches) event.preventDefault();
  });
  container.addEventListener('selectstart', (event) => {
    if (!(event.target as Element | null)?.closest?.('input,textarea'))
      event.preventDefault();
  });
  const touching = (on: boolean) =>
    document.documentElement.classList.toggle('map-touching', on);
  container.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') touching(true);
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
    touching(false);
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
  // A finger lifted outside the map must not leave page selection off.
  window.addEventListener('pointerup', () => touching(false));
  window.addEventListener('pointercancel', () => touching(false));
  // Double tap and hold zooms (src/quick-zoom.ts); that hold is not a point choice.
  map.on('quickzoomstart', () => press.cancel());
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
    // A tap that closes the elevation popup only closes it.
    if (dismiss()) return;
    if (!matchMedia('(pointer: coarse)').matches && editable())
      click([event.latlng.lat, event.latlng.lng]);
  });
  map.on('contextmenu', (event: L.LeafletMouseEvent) => {
    if (matchMedia('(pointer: coarse)').matches) return;
    if (!available() && !editable()) return;
    open(event.containerPoint, event.latlng, true);
  });
  container.addEventListener('keydown', (event) => {
    if (
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      event.preventDefault();
      if (available() || editable())
        open(map.getSize().divideBy(2), map.getCenter(), true);
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
    const buttons = items();
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
