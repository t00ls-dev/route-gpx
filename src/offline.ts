// Registration of the app-shell service worker (src/sw.ts) and the offline
// notice. Without a service worker (development, old browsers, insecure
// origins) the app works as before, online only.

/**
 * A home-screen web app is resumed, not reloaded, so it could stay on an old
 * build. Each time the page is shown again it asks for a new service worker;
 * once a new build takes over (it activates at once), the page reloads
 * itself: right away if nobody has touched it since it was shown, otherwise
 * the next time it is shown, and never during guided navigation. The route
 * is in the address, so it reopens as it was.
 */
function keepUpdated(registration: ServiceWorkerRegistration): void {
  const workers = navigator.serviceWorker;
  // The first install takes over a page of its own build: nothing to reload.
  let installed = !!workers.controller,
    outdated = false,
    touched = false;
  const reload = () => {
    if (
      outdated &&
      !touched &&
      document.visibilityState === 'visible' &&
      !document.documentElement.classList.contains('navigating')
    )
      location.reload();
  };
  workers.addEventListener('controllerchange', () => {
    if (installed) outdated = true;
    installed = true;
    reload();
  });
  const touch = () => (touched = true);
  for (const name of ['pointerdown', 'keydown'])
    window.addEventListener(name, touch, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      touched = false;
      return;
    }
    if (outdated) reload();
    else void registration.update().catch(() => undefined);
  });
}

/** Registers `/sw.js` in production builds after the page has loaded. */
export function registerServiceWorker(): void {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  )
    return;
  const register = () =>
    navigator.serviceWorker
      // `none`: every update check reads sw.js from the network, not the HTTP
      // cache, so a deploy is noticed on the next visit.
      .register('/sw.js', { updateViaCache: 'none' })
      .then(keepUpdated)
      .catch(() => {
        /* Optional: without it the app still works online. */
      });
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

/** Shows `notice` while the browser reports no connection. */
export function watchConnection(notice: HTMLElement): void {
  const update = () => {
    notice.hidden = navigator.onLine;
  };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}
