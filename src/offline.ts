// Registration of the app-shell service worker (src/sw.ts) and the offline
// notice. Without a service worker (development, old browsers, insecure
// origins) the app works as before, online only.

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
