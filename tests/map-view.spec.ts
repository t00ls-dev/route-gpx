import { test, expect, type Page } from '@playwright/test';
import { defaults, encodeState, decodeState } from '../src/core';
const base = 'http://127.0.0.1:5173/';
const ipUrl = 'https://ipwho.is/**';
const position = { latitude: 48.1234567, longitude: 11.7654321, accuracy: 35 };
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e3ecea"/></svg>';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));

  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ contentType: 'image/svg+xml', body: tile }),
  );
  await page.route(ipUrl, (r) =>
    r.fulfill({
      json: { success: true, city: 'Paris', latitude: 48.85, longitude: 2.35 },
    }),
  );
});
async function locate(page: Page) {
  await page.locator('#locate').click();
  await expect(page.locator('#confirm-location')).toHaveCount(0);
}
async function noExactStorage(page: Page) {
  const content = await page.evaluate(async () => {
    const records: unknown[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(info.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const name of db.objectStoreNames) {
        const rows = await new Promise((resolve, reject) => {
          const req = db.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        records.push(rows);
      }
      db.close();
    }
    return JSON.stringify({
      hash: location.hash,
      local: { ...localStorage },
      session: { ...sessionStorage },
      records,
    });
  });
  expect(content).not.toContain(String(position.latitude));
  expect(content).not.toContain(String(position.longitude));
  if (new URL(page.url()).hash) {
    const controls = JSON.stringify(decodeState(new URL(page.url()).hash));
    expect(controls).not.toContain(String(position.latitude));
    expect(controls).not.toContain(String(position.longitude));
  }
}
test('granted GPS centers the marker and accuracy circle without storing or transmitting exact coordinates', async ({
  page,
  context,
}) => {
  await page.route('**/route/v1/driving/**', async (r) => {
    const coords = new URL(r.request().url()).pathname
      .split('/driving/')[1]
      .split(';')
      .map((p) => p.split(',').map(Number));
    await r.fulfill({
      json: {
        code: 'Ok',
        waypoints: coords.map((location) => ({ location, distance: 0 })),
        routes: [
          {
            distance: 1000,
            duration: 100,
            geometry: { coordinates: coords },
            legs: [],
          },
        ],
      },
    });
  });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(position);
  let ipRequests = 0;
  const sent: string[] = [];
  page.on('request', (r) => {
    sent.push(r.url() + (r.postData() ?? ''));
    if (r.url().includes('ipwho.is')) ipRequests++;
  });
  await page.goto(base);
  await locate(page);
  await expect(page.locator('.location-accuracy')).toHaveCount(1);
  await expect(page.locator('.location-dot')).toHaveCount(1);
  const box = await page.locator('#map').boundingBox();
  const dot = await page.locator('.location-dot').boundingBox();
  expect(
    Math.abs(dot!.x + dot!.width / 2 - box!.x - box!.width / 2),
  ).toBeLessThan(3);
  expect(
    Math.abs(dot!.y + dot!.height / 2 - box!.y - box!.height / 2),
  ).toBeLessThan(3);
  await expect(page.locator('#location-0')).toHaveValue('');
  expect(ipRequests).toBe(0);
  await noExactStorage(page);
  await page.locator('#location-start').click();
  await expect(page.locator('#location-0')).toHaveValue('48.123000, 11.765000');
  await noExactStorage(page);
  await page.locator('#location-1').fill('48.2, 11.8');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#route-name').fill('GPS approximate start');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  await noExactStorage(page);
  expect(sent.join('\n')).not.toContain(String(position.latitude));
  expect(sent.join('\n')).not.toContain(String(position.longitude));
});
test('denial is actionable and points remain editable without automatic re-prompts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_ok: unknown, fail: PositionErrorCallback) =>
        fail({ code: 1 } as GeolocationPositionError),
    });
  });
  await page.goto(base);
  await locate(page);
  await expect(page.locator('#location-status')).toContainText(
    'browser site settings',
  );
  await page.locator('#close-location').click();
  await page.locator('#location-0').fill('40, 10');
  await page.locator('#location-0').press('Tab');
  await expect(page.locator('.route-marker')).toHaveCount(1);
});
test('startup never calls geolocation while permission is prompt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: () => {
        document.documentElement.dataset.gpsCalls = 'unexpected';
      },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#location-card')).toBeHidden();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
  await expect(page.locator('html')).not.toHaveAttribute('data-gps-calls');
});
test('URL route is fitted and skips GPS permissions and IP', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(position);
  await page.addInitScript(() => {
    navigator.permissions.query = () => {
      throw new Error('Unexpected permission lookup');
    };
  });
  let ip = 0;
  page.on('request', (r) => {
    if (r.url().includes('ipwho.is')) ip++;
  });
  await page.route('**/route/v1/driving/**', (r) => r.abort());
  const state = defaults();
  state.points = [
    { name: 'Start', coord: [-22, -43] },
    { name: 'End', coord: [-23, -44] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('.route-marker')).toHaveCount(2);
  const mapBox = await page.locator('#map').boundingBox();
  for (const marker of await page.locator('.route-marker').all()) {
    const box = await marker.boundingBox();
    expect(box!.x).toBeGreaterThan(mapBox!.x);
    expect(box!.x).toBeLessThan(mapBox!.x + mapBox!.width);
  }
  expect(ip).toBe(0);
});
for (const mode of [
  'success',
  'failure',
  'invalid',
  'timeout',
  'disabled',
] as const) {
  test(`IP startup: ${mode}`, async ({ page }) => {
    let requests = 0;
    const tiles: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('tile.openstreetmap.org')) tiles.push(r.url());
    });
    if (mode === 'disabled')
      await page.addInitScript(() =>
        localStorage.setItem('detect-region', 'false'),
      );
    await page.route(ipUrl, async (r) => {
      requests++;
      if (mode === 'timeout') {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        await r.abort();
      } else if (mode === 'failure') await r.fulfill({ status: 429 });
      else
        await r.fulfill({
          json:
            mode === 'invalid'
              ? { success: true, city: 'X', latitude: 500, longitude: 2 }
              : {
                  success: true,
                  city: 'Paris',
                  latitude: 48.85,
                  longitude: 2.35,
                },
        });
    });
    await page.goto(base);
    await page.waitForTimeout(mode === 'timeout' ? 3800 : 350);
    expect(requests).toBe(mode === 'disabled' ? 0 : 1);
    expect(tiles.some((url) => url.includes('/10/'))).toBe(mode === 'success');
    await expect(page.locator('#location-card')).toBeHidden();
    await expect(page.locator('#status')).not.toHaveClass('error');
    await page.reload();
    await page.waitForTimeout(100);
    expect(requests).toBe(mode === 'disabled' ? 0 : 1);
  });
}
for (const mobile of [false, true]) {
  test(`viewport map and panel, fullscreen fallback, translations: ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(base);
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox!.height).toBe(page.viewportSize()!.height);
    expect(mapBox!.width).toBeGreaterThan(page.viewportSize()!.width * 0.65);
    await page.locator('#panel-toggle').click();
    await expect(page.locator('#route-panel')).toBeHidden();
    await page.reload();
    await expect(page.locator('#route-panel')).toBeHidden();
    await page.locator('#panel-toggle').click();
    await expect(page.locator('#route-panel')).toBeVisible();
    await page.setViewportSize(
      mobile ? { width: 844, height: 390 } : { width: 1400, height: 800 },
    );
    await expect
      .poll(async () => (await page.locator('#map').boundingBox())!.height)
      .toBe(page.viewportSize()!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Loaded tile bounds cover the resized map, including after hiding the panel.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const map = document.getElementById('map')!.getBoundingClientRect();
          const tiles = [
            ...document.querySelectorAll('.leaflet-tile-loaded'),
          ].map((tile) => tile.getBoundingClientRect());
          return (
            tiles.length > 0 &&
            Math.min(...tiles.map((t) => t.left)) <= map.left &&
            Math.max(...tiles.map((t) => t.right)) >= map.right &&
            Math.min(...tiles.map((t) => t.top)) <= map.top &&
            Math.max(...tiles.map((t) => t.bottom)) >= map.bottom
          );
        }),
      )
      .toBe(true);
    await page.locator('#fullscreen').click();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(true);
    await page.locator('#fullscreen').click();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
        value: undefined,
      });
    });
    await page.locator('#fullscreen').click();
    await expect(page.locator('body')).toHaveClass(/map-fullscreen/);
    expect((await page.locator('#map').boundingBox())!.width).toBe(
      page.viewportSize()!.width,
    );
    await page.locator('#fullscreen').click();
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#locate')).toHaveAccessibleName(
      'Usar minha localização',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#locate')).toHaveAccessibleName(
      'Use my location',
    );
    const zoom = await page.locator('.leaflet-control-zoom-in').boundingBox();
    expect(zoom!.width).toBeGreaterThanOrEqual(44);
    expect(zoom!.height).toBeGreaterThanOrEqual(44);
  });
}

for (const code of [2, 3]) {
  test(`GPS error ${code} offers a map alternative`, async ({ page }) => {
    await page.addInitScript((code) => {
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        value: (_ok: unknown, fail: PositionErrorCallback) =>
          fail({ code } as GeolocationPositionError),
      });
    }, code);
    await page.goto(base);
    await locate(page);
    await expect(page.locator('#location-status')).toContainText(
      code === 3 ? 'timed out' : 'unavailable',
    );
    await expect(page.locator('#location-status')).toContainText(
      'point on the map',
    );
  });
}
test('unsupported browser explains map alternative', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'geolocation', { value: undefined }),
  );
  await page.goto(base);
  await locate(page);
  await expect(page.locator('#location-status')).toContainText(
    'does not support location',
  );
});
test('late IP result cannot override a manually chosen map view', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(ipUrl, async (r) => {
    await pending;
    await r.fulfill({
      json: { success: true, city: 'Paris', latitude: 48.85, longitude: 2.35 },
    });
  });
  await page.goto(base);
  await page.locator('#map').click({ position: { x: 170, y: 200 } });
  const value = await page.locator('#location-0').inputValue();
  release();
  await page.waitForTimeout(200);
  await expect(page.locator('#location-0')).toHaveValue(value);
  await expect(page.locator('.route-marker')).toHaveCount(1);
});

test('insecure context explains HTTPS requirement', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'isSecureContext', { value: false }),
  );
  await page.goto(base);
  await locate(page);
  await expect(page.locator('#location-status')).toContainText(
    'requires HTTPS',
  );
});
test('IP detection can be disabled in Settings and stays disabled after reload', async ({
  page,
}) => {
  await page.goto(base);
  await page.locator('#open-settings').click();
  await page.locator('#detect-region').uncheck();
  await page.evaluate(() => sessionStorage.removeItem('region-attempted'));
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('ipwho.is')) calls++;
  });
  await page.reload();
  await page.locator('#open-settings').click();
  await expect(page.locator('#detect-region')).not.toBeChecked();
  await page.waitForTimeout(200);
  expect(calls).toBe(0);
});

test('mobile route endpoints fit above the open sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/route/v1/driving/**', (r) => r.abort());
  const state = defaults();
  state.points = [
    { name: 'Start', coord: [-22.93, -43.23] },
    { name: 'End', coord: [-23.05, -43.53] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('.route-marker')).toHaveCount(2);
  const sheet = await page.locator('#route-panel').boundingBox();
  for (const marker of await page.locator('.route-marker').all()) {
    const box = await marker.boundingBox();
    expect(box!.y).toBeGreaterThan(100);
    expect(box!.y + box!.height).toBeLessThan(sheet!.y);
  }
});

for (const width of [320, 390, 1280])
  test(`location actions stay spaced and inside the card at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() =>
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        value: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 48.123, longitude: 11.765, accuracy: 25 },
            timestamp: Date.now(),
          } as GeolocationPosition),
      }),
    );
    await page.goto(base);
    await locate(page);
    await expect(page.locator('#location-actions')).toBeVisible();
    const a = (await page.locator('#location-start').boundingBox())!,
      b = (await page.locator('#location-stop').boundingBox())!,
      card = (await page.locator('#location-card').boundingBox())!;
    expect(a.width).toBeCloseTo(b.width, 0);
    for (const button of [a, b]) {
      expect(button.height).toBeGreaterThanOrEqual(48);
      expect(button.x).toBeGreaterThan(card.x);
      expect(button.x + button.width).toBeLessThan(card.x + card.width);
      expect(button.y + button.height).toBeLessThan(card.y + card.height);
    }
    expect(b.x - a.x - a.width >= 11.9 || b.y - a.y - a.height >= 11.9).toBe(
      true,
    );
    if (width === 320) expect(b.y).toBeGreaterThan(a.y + a.height);
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#location-start')).toHaveText(
      'Definir como início',
    );
    await expect(page.locator('#location-stop')).toHaveText(
      'Adicionar como parada',
    );
  });
