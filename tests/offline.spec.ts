import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { BASEMAP_STYLE } from './map-helpers';
// The app-shell service worker only runs in production builds: these tests
// use the preview server started by playwright.config.ts.
const base = 'http://127.0.0.1:4175/';
const start = '-22.930929, -43.238286',
  end = '-23.050160, -43.535240';

/** Mocks every public service at the context, which also sees requests the page sends while a service worker controls it. Routing fails like a real network while `network.offline` is set. */
const network = { offline: false, routing: 0 };
async function mockServices(context: BrowserContext) {
  network.offline = false;
  network.routing = 0;
  await context.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await context.route('**/route/v1/driving/**', async (r) => {
    network.routing++;
    if (network.offline) return r.abort('internetdisconnected');
    const part = new URL(r.request().url()).pathname.split('/driving/')[1]!;
    const coords = part.split(';').map((p) => p.split(',').map(Number));
    await r.fulfill({
      json: {
        code: 'Ok',
        waypoints: coords.map((location) => ({ location, distance: 0 })),
        routes: [
          {
            distance: 42000,
            duration: 2940,
            geometry: { coordinates: coords },
            legs: [
              {
                steps: [
                  {
                    name: 'Main road',
                    distance: 42000,
                    duration: 2940,
                    maneuver: { type: 'depart' },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });
}

/** Opens the app and waits until the service worker controls the page. */
async function controlled(page: Page) {
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

const cacheKeys = (page: Page) => page.evaluate(() => caches.keys());

async function goOffline(context: BrowserContext, offline: boolean) {
  network.offline = offline;
  await context.setOffline(offline);
}

/** A routed pair of points, ready to download. */
async function routedPair(page: Page) {
  await page.locator('#language').selectOption('en');
  await page.locator('#location-0').fill(start);
  await page.locator('#location-1').fill(end);
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
}

test('after one online visit, the app, help and What’s new open offline', async ({
  page,
  context,
}) => {
  await mockServices(context);
  await controlled(page);
  await expect(page.locator('#offline-notice')).toBeHidden();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#location-0')).toBeVisible();
  await expect(page.locator('#offline-notice')).toBeVisible();
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#offline-notice')).toContainText(
    'Você está sem conexão',
  );
  // `?lang=pt` and the route hash are kept: the cached page answers any query.
  expect(new URL(page.url()).search).toBe('?lang=pt');
  await page.goto(base + 'help.html?lang=pt');
  await expect(page.locator('#help-pt')).toBeVisible();
  await page.goto(base + 'changelog.html?lang=en');
  await expect(page.locator('#changelog-en')).toBeVisible();
  await context.setOffline(false);
  await page.goto(base);
  await expect(page.locator('#offline-notice')).toBeHidden();
});

test('a saved route opens offline, without routing requests, and downloads', async ({
  page,
  context,
}) => {
  await mockServices(context);
  await controlled(page);
  await routedPair(page);
  await page.locator('#route-name').fill('Offline route');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');

  await goOffline(context, true);
  await page.goto(base);
  let routing = 0;
  context.on('request', (r) => {
    if (r.url().includes('/route/v1/')) routing++;
  });
  await page.locator('.saved-routes summary').click();
  await page
    .getByRole('button', {
      name: 'Open saved route: Offline route',
      exact: true,
    })
    .click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#summary')).toContainText('42 km');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('offline-route.gpx');
  expect(routing).toBe(0);
});

test('the service worker caches only same-origin files and never answers cross-origin requests', async ({
  page,
  context,
}) => {
  await mockServices(context);
  let tiles = 0;
  await context.route('https://tiles.openfreemap.org/**', (r) => {
    tiles++;
    return r.request().url().includes('/styles/')
      ? r.fulfill({ json: BASEMAP_STYLE })
      : r.fulfill({ status: 204 });
  });
  await controlled(page);
  tiles = 0;
  await page.reload();
  // A controlled page's map style and tiles still reach the network (here, the mock).
  await expect.poll(() => tiles).toBeGreaterThan(0);
  const urls = await page.evaluate(async () => {
    const all: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      all.push(...(await cache.keys()).map((request) => request.url));
    }
    return all;
  });
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => url.startsWith(base))).toBe(true);
  expect(urls).toContain(base + 'index.html');
  expect(urls).not.toContain(base + 'sw.js');
});

test('a new deploy replaces the cached build', async ({ page, context }) => {
  await mockServices(context);
  // The first visit gets an older deploy: the same sw.js with another build
  // version (the browser's update checks are not routed, so the real sw.js
  // then plays the new deploy).
  await context.route('**/sw.js', async (r) => {
    const response = await r.fetch();
    const body = (await response.text()).replace(
      /\\"version\\":\\"[0-9a-f]{16}\\"/,
      '\\"version\\":\\"0000000000000000\\"',
    );
    await r.fulfill({ response, body });
  });
  await controlled(page);
  expect(await cacheKeys(page)).toEqual(['route-gpx-shell-0000000000000000']);
  await context.unroute('**/sw.js');
  // The new build takes over and the untouched page reloads into it.
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then((r) => r?.update()),
    ),
  ]);
  // Only the new build's cache is left.
  await expect
    .poll(() => cacheKeys(page))
    .toEqual([
      expect.stringMatching(/^route-gpx-shell-(?!0{16})[0-9a-f]{16}$/),
    ]);
  await page.reload();
  await expect(page.locator('#location-0')).toBeVisible();
});

test('a page shown again after a deploy reloads into the new build, once untouched', async ({
  page,
  context,
}) => {
  await mockServices(context);
  // The page's visibility, which the test switches as a phone would when the
  // web app goes to the background and comes back.
  await context.addInitScript(() => {
    const w = window as unknown as { hidden: boolean };
    w.hidden = false;
    Object.defineProperty(document, 'visibilityState', {
      get: () => (w.hidden ? 'hidden' : 'visible'),
    });
  });
  const show = (hidden: boolean) =>
    page.evaluate((value) => {
      (window as unknown as { hidden: boolean }).hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  // An older deploy controls the page first, as in the test above.
  await context.route('**/sw.js', async (r) => {
    const response = await r.fetch();
    const body = (await response.text()).replace(
      /\\"version\\":\\"[0-9a-f]{16}\\"/,
      '\\"version\\":\\"0000000000000000\\"',
    );
    await r.fulfill({ response, body });
  });
  await controlled(page);
  await context.unroute('**/sw.js');
  const mark = () =>
    page.evaluate(() => ((window as unknown as { mark?: number }).mark = 1));
  const marked = () =>
    page.evaluate(() => (window as unknown as { mark?: number }).mark === 1);
  await mark();
  // Touched since it was shown: the new build waits for the next showing.
  await page.locator('#location-0').click();
  await page.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => r?.update()),
  );
  await expect
    .poll(() => cacheKeys(page))
    .toEqual([expect.stringMatching(/^route-gpx-shell-(?!0{16})/)]);
  await page.waitForTimeout(500);
  expect(await marked()).toBe(true);
  // Shown again, untouched: it reloads into the new build, once.
  await show(true);
  await Promise.all([page.waitForEvent('load'), show(false)]);
  expect(await marked()).toBe(false);
  await expect(page.locator('#location-0')).toBeVisible();
  await mark();
  await page.waitForTimeout(1000);
  expect(await marked()).toBe(true);
});

for (const width of [320, 1280])
  test(`the offline notice fits the panel at ${width} px in both languages`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockServices(context);
    await controlled(page);
    await context.setOffline(true);
    await page.reload();
    for (const language of ['en', 'pt']) {
      await page.locator('#language').selectOption(language);
      const notice = page.locator('#offline-notice');
      await expect(notice).toBeVisible();
      const fit = await notice.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const panel = element.closest('aside')!.getBoundingClientRect();
        return {
          inside:
            box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5,
          noOverflow: element.scrollWidth <= element.clientWidth,
        };
      });
      expect(fit).toEqual({ inside: true, noOverflow: true });
    }
  });

test('Calculate route without a connection keeps the route on screen and its download', async ({
  page,
  context,
}) => {
  await mockServices(context);
  await controlled(page);
  await routedPair(page);
  await goOffline(context, true);
  const before = network.routing;
  await page.locator('#calculate').click();
  await expect(page.locator('#status')).toHaveText(
    'No connection. The route on screen is kept; calculate it again when you are back online.',
  );
  await expect(page.locator('#status')).not.toHaveClass(/error/);
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#summary')).toContainText('42 km');
  expect(network.routing).toBe(before);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.gpx$/);
});

test('a route edited without a connection is calculated once when it returns', async ({
  page,
  context,
}) => {
  await mockServices(context);
  await controlled(page);
  await routedPair(page);
  await goOffline(context, true);
  await page.locator('#location-1').fill('-23.000000, -43.400000');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#status')).toHaveText(
    'No connection. The route will be calculated when the connection returns.',
    { timeout: 15000 },
  );
  await expect(page.locator('#download')).toBeDisabled();
  // No raw browser wording such as "Failed to fetch" reaches the panel.
  await expect(page.locator('#status')).not.toContainText('fetch');
  const before = network.routing;
  await goOffline(context, false);
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#status')).toHaveText('Route ready.');
  expect(network.routing - before).toBe(1);
});
