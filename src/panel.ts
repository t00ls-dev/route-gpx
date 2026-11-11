import L from 'leaflet';
import { icon, iconControl } from './icons';
import { byId as $ } from './dom';

/** Width below which the route panel is a bottom sheet over the map. */
const COMPACT = '(max-width: 759px)';
export const compactLayout = (): boolean => matchMedia(COMPACT).matches;

type SheetSize = 'half' | 'full';
/** Snap heights of the open sheet; the same numbers are in `style.css`. */
function sheetHeights(): Record<SheetSize, number> {
  const view = window.innerHeight;
  return {
    half: Math.min(0.55 * view, Math.max(260, view - 310)),
    full: view - 60,
  };
}
const DRAG_THRESHOLD = 8;

/**
 * The route panel around the map: a sidebar on wide screens and a bottom
 * sheet on phones. The sheet is closed (status and export actions only), half
 * or full height; the handle toggles it and can be dragged between heights.
 * Also the panel's icons, the More actions disclosure and the Settings dialog.
 */
export function setupPanel(map: L.Map): void {
  iconControl($('add'), 'plus', 'Add stop');
  iconControl($('reverse'), 'swap', 'Reverse');
  iconControl($('roundtrip'), 'roundtrip', 'Round trip');
  iconControl($('calculate'), 'refresh', 'Calculate route');
  iconControl($('download'), 'download', 'Download GPX');
  iconControl($('share'), 'link', 'Copy link');
  $('share').title = 'Copy route link';
  iconControl($('share-gpx'), 'share', 'Share GPX');
  iconControl($('more-actions'), 'more', 'More actions', true);
  iconControl($('open-settings'), 'settings', 'Settings', true);
  iconControl($('close-settings'), 'close', 'Close settings', true);
  iconControl($('close-location'), 'close', 'Close location', true);
  document
    .querySelector('.secondary-actions .file-button')!
    .prepend(icon('upload'));

  const sheet = $('sheet'),
    handle = $('panel-toggle'),
    panel = $('route-panel');
  // Wide screens show the toggle as an icon in the sidebar header.
  handle.append(icon('sidebar'));
  handle.title = 'Route panel';
  let open = true,
    size: SheetSize = 'half';
  try {
    open = sessionStorage.getItem('panel-open') !== 'false';
    if (sessionStorage.getItem('panel-size') === 'full') size = 'full';
  } catch {
    /* Optional preference. */
  }
  const remember = () => {
    try {
      sessionStorage.setItem('panel-open', String(open));
      sessionStorage.setItem('panel-size', size);
    } catch {
      /* Optional preference. */
    }
  };
  const layout = () => {
    document.body.classList.toggle('panel-closed', !open);
    document.body.classList.toggle('sheet-full', open && size === 'full');
    panel.hidden = !open;
    handle.setAttribute('aria-expanded', String(open));
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  };
  new ResizeObserver(() => {
    document.body.style.setProperty(
      '--sheet-height',
      `${sheet.getBoundingClientRect().height}px`,
    );
  }).observe(sheet);

  const toggle = () => {
    open = !open;
    remember();
    layout();
  };
  // Dragging the handle resizes the sheet; a press without movement toggles
  // it on release. Browsers may drop the click of a tap that follows a drag
  // (tap suppression after a fling), so taps do not rely on `click`.
  let drag: { id: number; y: number; height: number; moved: boolean } | null =
    null;
  let pointerToggle = -Infinity;
  handle.addEventListener('pointerdown', (event) => {
    if (!compactLayout() || event.button > 0) return;
    drag = {
      id: event.pointerId,
      y: event.clientY,
      height: sheet.getBoundingClientRect().height,
      moved: false,
    };
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = drag.y - event.clientY;
    if (!drag.moved) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      handle.setPointerCapture(event.pointerId);
      // The panel shows while the sheet follows the finger.
      document.body.classList.remove('panel-closed');
      document.body.classList.add('sheet-dragging');
      panel.hidden = false;
    }
    sheet.style.height = `${Math.max(
      handle.offsetHeight,
      Math.min(sheetHeights().full, drag.height + dy),
    )}px`;
  });
  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    // Any click that follows this press belongs to it.
    pointerToggle = event.timeStamp;
    if (!moved) {
      if (event.type === 'pointerup') toggle();
      return;
    }
    const height = sheet.getBoundingClientRect().height;
    const { half, full } = sheetHeights();
    sheet.style.height = '';
    document.body.classList.remove('sheet-dragging');
    open = height > half / 2;
    if (open) size = height > (half + full) / 2 ? 'full' : 'half';
    remember();
    layout();
  };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('click', (event) => {
    // Keyboard and programmatic clicks have no pointer press before them.
    if (event.detail > 0 && event.timeStamp - pointerToggle < 1000) return;
    toggle();
  });
  // Arrow keys move the sheet between closed, half and full height.
  handle.addEventListener('keydown', (event) => {
    if (!compactLayout()) return;
    const steps = ['closed', 'half', 'full'] as const;
    const at = steps.indexOf(open ? size : 'closed');
    const next =
      event.key === 'ArrowUp'
        ? Math.min(2, at + 1)
        : event.key === 'ArrowDown'
          ? Math.max(0, at - 1)
          : -1;
    if (next < 0) return;
    event.preventDefault();
    open = next > 0;
    if (open) size = steps[next] as SheetSize;
    remember();
    layout();
  });
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);

  const more = $('more-actions');
  more.onclick = () => {
    const expanded = more.getAttribute('aria-expanded') !== 'true';
    more.setAttribute('aria-expanded', String(expanded));
    document.body.classList.toggle('more-open', expanded);
  };

  // The closed sheet still shows the latest status message.
  const mirror = () => {
    $('peek-status').textContent = $('status').textContent;
    $('panel-toggle').classList.toggle(
      'error',
      $('status').classList.contains('error'),
    );
  };
  new MutationObserver(mirror).observe($('status'), {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  mirror();

  const dialog = $<HTMLDialogElement>('settings-dialog');
  $('open-settings').onclick = () => {
    $('settings-status').textContent = '';
    dialog.showModal();
  };
  $('close-settings').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => $('open-settings').focus());
}
