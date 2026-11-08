import L from 'leaflet';
import { t } from './i18n';
import type { Coord } from './core';
import { defaultView, initialView } from './default-view';
import {
  authorizedView,
  getPosition,
  positionView,
  locationError,
  approximatePoint,
} from './location';
import { approximateRegion, defaultRegionUrl, regionUrl } from './services';

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function setupMapView(
  map: L.Map,
  route: {
    hasRoute: () => boolean;
    addPoint: (coord: Coord, asStart: boolean) => void;
  },
): void {
  let interacted = false;
  const interact = () => {
    interacted = true;
  };
  // Input and map gestures supersede startup work, including address edits without coordinates.
  document.addEventListener('input', interact, { once: true });
  map.on('dragstart zoomstart click', interact);
  let detectRegion = true;
  let ipRegionUrl = defaultRegionUrl;
  try {
    detectRegion = localStorage.getItem('detect-region') !== 'false';
    ipRegionUrl = regionUrl(
      localStorage.getItem('region-url') ?? defaultRegionUrl,
    );
  } catch {
    /* Defaults work without persistent storage. */
  }
  element<HTMLInputElement>('detect-region').checked = detectRegion;
  element<HTMLInputElement>('region-url').value = ipRegionUrl;
  element<HTMLInputElement>('detect-region').onchange = () => {
    detectRegion = element<HTMLInputElement>('detect-region').checked;
    interact();
    try {
      localStorage.setItem('detect-region', String(detectRegion));
    } catch {
      /* Optional preference. */
    }
  };
  element<HTMLInputElement>('region-url').onchange = () => {
    try {
      ipRegionUrl = regionUrl(
        element<HTMLInputElement>('region-url').value.trim(),
      );
      element<HTMLInputElement>('region-url').setCustomValidity('');
      try {
        localStorage.setItem('region-url', ipRegionUrl);
      } catch {
        /* Optional preference. */
      }
    } catch {
      element<HTMLInputElement>('region-url').setCustomValidity(
        t('Use an HTTPS service URL.'),
      );
      element<HTMLInputElement>('region-url').reportValidity();
    }
  };
  const panelHandle = element('panel-toggle');
  new ResizeObserver(() => {
    document.body.style.setProperty(
      '--route-handle-height',
      `${panelHandle.getBoundingClientRect().height}px`,
    );
  }).observe(panelHandle);
  let panelOpen = true;
  try {
    panelOpen = sessionStorage.getItem('panel-open') !== 'false';
  } catch {
    /* Optional preference. */
  }
  const layout = () => {
    document.body.classList.toggle('panel-closed', !panelOpen);
    element('route-panel').hidden = !panelOpen;
    element('panel-toggle').setAttribute('aria-expanded', String(panelOpen));
    element('fullscreen').setAttribute(
      'aria-pressed',
      String(document.body.classList.contains('map-fullscreen')),
    );
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  };
  element('panel-toggle').onclick = () => {
    panelOpen = !panelOpen;
    try {
      sessionStorage.setItem('panel-open', String(panelOpen));
    } catch {
      /* Optional preference. */
    }
    layout();
  };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle(
      'map-fullscreen',
      !!document.fullscreenElement,
    );
    layout();
  });
  element('fullscreen').onclick = () => {
    const container = document.querySelector<HTMLElement>('.map-container')!;
    const fallback = () => {
      document.body.classList.toggle('map-fullscreen');
      layout();
    };
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(fallback);
    else if (document.body.classList.contains('map-fullscreen')) fallback();
    else if (container.requestFullscreen)
      void container.requestFullscreen().catch(fallback);
    else fallback();
  };
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.fullscreenElement) {
      document.body.classList.remove('map-fullscreen');
      layout();
    }
  });
  const userLocation = L.layerGroup().addTo(map);
  let exactPosition: Coord | null = null;
  let locationRequest = 0;
  element('close-location').onclick = () => {
    locationRequest++;
    element('location-card').hidden = true;
    userLocation.clearLayers();
    exactPosition = null;
    element('location-actions').hidden = true;
    element<HTMLButtonElement>('locate').disabled = false;
  };
  element('locate').onclick = () => {
    interact();
    if (panelOpen && matchMedia('(max-width: 759px)').matches)
      element('panel-toggle').click();
    element('location-card').hidden = false;
    element('location-actions').hidden = true;
    exactPosition = null;
    userLocation.clearLayers();
    if (!window.isSecureContext) {
      element('location-status').textContent =
        'Location requires HTTPS. Open the secure site or choose a point on the map.';
      return;
    }
    if (!navigator.geolocation) {
      element('location-status').textContent =
        'This browser does not support location. Choose a point on the map.';
      return;
    }
    interact();
    const request = ++locationRequest;
    const button = element<HTMLButtonElement>('locate');
    button.disabled = true;
    element('location-status').textContent = 'Finding your location…';
    void getPosition()
      .then((position) => {
        if (request !== locationRequest) return;
        const view = positionView(position);
        exactPosition = view.center;
        userLocation.clearLayers();
        L.circle(view.center, {
          radius: position.coords.accuracy,
          className: 'location-accuracy',
          color: '#1765a5',
          fillOpacity: 0.12,
        }).addTo(userLocation);
        L.circleMarker(view.center, {
          radius: 7,
          className: 'location-dot',
          color: '#fff',
          fillColor: '#1765a5',
          fillOpacity: 1,
        }).addTo(userLocation);
        map.setView(view.center, view.zoom, { animate: false });
        element('location-status').textContent =
          'Location found. Your route has not changed.';
        element('location-actions').hidden = false;
      })
      .catch((error: GeolocationPositionError) => {
        if (request !== locationRequest) return;
        element('location-status').textContent = locationError(error.code);
      })
      .finally(() => {
        if (request === locationRequest) button.disabled = false;
      });
  };
  const useLocation = (asStart: boolean) => {
    if (!exactPosition) return;
    route.addPoint(approximatePoint(exactPosition), asStart);
    element('close-location').click();
  };
  element('location-start').onclick = () => useLocation(true);
  element('location-stop').onclick = () => useLocation(false);
  window.addEventListener('pagehide', () => {
    locationRequest++;
    exactPosition = null;
    userLocation.clearLayers();
  });
  void initialView({
    hasRoute: route.hasRoute(),
    authorizedPosition: authorizedView,
    approximateRegion: () =>
      !interacted && !route.hasRoute()
        ? approximateRegion(detectRegion, ipRegionUrl)
        : Promise.resolve(null),
    local: () =>
      defaultView(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.languages,
      ),
  }).then((view) => {
    if (view && !interacted && !route.hasRoute())
      map.setView(view.center, view.zoom, { animate: false });
  });
}
