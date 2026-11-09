import L from 'leaflet';

/**
 * One-finger zoom for touch screens, as in common map apps: tap, then touch
 * again and hold, and drag down to zoom in or up to zoom out. Releasing the
 * second touch without dragging keeps Leaflet's double-tap zoom in.
 * Holding the second touch never opens the point menu (long press). Fires
 * `quickzoomstart` on the second touch and `quickzoomend` when it lifts.
 */
const TAP_TIME = 250,
  DOUBLE_TAP_TIME = 300,
  TAP_DISTANCE = 30,
  MOVE_THRESHOLD = 8,
  PIXELS_PER_ZOOM = 100;

export function setupQuickZoom(map: L.Map): void {
  const container = map.getContainer();
  let down: { id: number; x: number; y: number; time: number } | null = null,
    lastTap: { x: number; y: number; time: number } | null = null,
    gesture: {
      id: number;
      y: number;
      zoom: number;
      point: L.Point;
      moved: boolean;
    } | null = null,
    swallowDoubleClick = false;
  const ignored = (target: EventTarget | null) =>
    !!(target as Element | null)?.closest?.(
      '.leaflet-control,.leaflet-marker-icon,.map-credits',
    );

  container.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) {
      // A second finger means pinch: leave it entirely to Leaflet.
      if (gesture) end();
      lastTap = null;
      return;
    }
    if (ignored(event.target)) return;
    const now = performance.now();
    down = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: now,
    };
    if (
      lastTap &&
      now - lastTap.time < DOUBLE_TAP_TIME &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <
        TAP_DISTANCE
    ) {
      gesture = {
        id: event.pointerId,
        y: event.clientY,
        zoom: map.getZoom(),
        point: map.mouseEventToContainerPoint(event),
        moved: false,
      };
      lastTap = null;
      map.dragging.disable();
      // As in common map apps, tap then hold is zoom, never the point menu.
      map.fire('quickzoomstart');
    }
  });

  // Touch events follow pointerdown: cancelling the armed second touch stops
  // iOS from starting its long-press callout or text selection.
  container.addEventListener(
    'touchstart',
    (event) => {
      if (gesture) event.preventDefault();
    },
    { passive: false },
  );
  container.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.abs(dy) < MOVE_THRESHOLD) return;
    if (!gesture.moved) {
      gesture.moved = true;
      // Fractional levels while dragging, so the zoom follows the finger.
      map.options.zoomSnap = 0;
    }
    const zoom = Math.min(
      map.getMaxZoom(),
      Math.max(map.getMinZoom(), gesture.zoom + dy / PIXELS_PER_ZOOM),
    );
    map.setZoomAround(gesture.point, zoom, { animate: false });
  });

  function end() {
    if (!gesture) return;
    const { moved, point } = gesture;
    gesture = null;
    map.dragging.enable();
    if (moved) {
      map.options.zoomSnap = 1;
      map.setZoomAround(point, Math.round(map.getZoom()), { animate: false });
    } else
      // The second touch was cancelled natively, so do the double-tap zoom here.
      map.setZoomAround(point, Math.min(map.getMaxZoom(), map.getZoom() + 1));
    // Browsers that still send dblclick must not zoom in again.
    swallowDoubleClick = true;
    setTimeout(() => (swallowDoubleClick = false), 500);
    map.fire('quickzoomend');
  }
  const release = (event: PointerEvent) => {
    if (gesture && event.pointerId === gesture.id) {
      end();
      return;
    }
    if (
      down &&
      event.pointerId === down.id &&
      performance.now() - down.time < TAP_TIME &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) <
        MOVE_THRESHOLD
    )
      lastTap = { x: event.clientX, y: event.clientY, time: performance.now() };
    down = null;
  };
  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', (event) => {
    if (gesture && event.pointerId === gesture.id) end();
    down = null;
  });
  container.addEventListener(
    'dblclick',
    (event) => {
      if (!swallowDoubleClick) return;
      swallowDoubleClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );
}
