// App-shell service worker (AGENTS.md, Guided navigation; #126). It keeps the
// same-origin files of one build so the app, help and What's new open without
// network, and saved routes (IndexedDB) can be followed offline. It never
// answers cross-origin requests: tiles, routing, search, weather, elevation,
// road attributes and the IP region always go to the network as usual.
import { CACHE_PREFIX, pageKey } from './precache';

// The worker scope's events, declared locally because the project's types are
// the DOM ones.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}
declare const self: {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: ExtendableEvent) => void,
  ): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
};

// Replaced at build time (vite.config.ts) by this build's version and files.
const BUILD = '__ROUTE_GPX_BUILD__';
const { version, files } = JSON.parse(BUILD) as {
  version: string;
  files: string[];
};
const cacheName = CACHE_PREFIX + version;
/** A slow network falls back to the cached page after this long. */
const NAVIGATION_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      // `reload` skips the HTTP cache, so the copy matches this build.
      .then((cache) =>
        cache.addAll(
          files.map((file) => new Request(file, { cache: 'reload' })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Pages come from the network first, so an online visit always gets the latest
 * deploy; the cached page (with its own build's assets) answers offline or
 * when the network takes too long. Fresh pages are never stored here: a page
 * and its assets always come from the same build.
 */
function networkFirst(request: Request, key: string): Promise<Response> {
  const cached = () =>
    caches
      .open(cacheName)
      .then((cache) => cache.match(key))
      .then((response) => response ?? Response.error());
  return new Promise((resolve) => {
    let settled = false;
    const settle = (response: Promise<Response>) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const timer = setTimeout(() => settle(cached()), NAVIGATION_TIMEOUT);
    // Revalidated with the server: GitHub Pages lets browsers keep pages for
    // ten minutes, and a page kept from before a deploy names assets that
    // are gone, so it would open without styles or scripts.
    fetch(request, { cache: 'no-cache' }).then(
      (response) => {
        clearTimeout(timer);
        settle(Promise.resolve(response));
      },
      () => {
        clearTimeout(timer);
        settle(cached());
      },
    );
  });
}

/** Hashed assets never change, so the cached copy is used when present. */
function cacheFirst(request: Request, key: string): Promise<Response> {
  return caches
    .open(cacheName)
    .then((cache) => cache.match(key))
    .then((response) => response ?? fetch(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Cross-origin requests are never touched: no respondWith, no cache.
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    const key = pageKey(url.pathname, files);
    if (key) event.respondWith(networkFirst(request, key));
    return;
  }
  if (files.includes(url.pathname))
    event.respondWith(cacheFirst(request, url.pathname));
});
