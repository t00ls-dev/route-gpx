import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaults, encodeState, decodeState } from '../src/core';
import { radarMetadata, radarNow, radarPng } from './radar-fixture';
const base = 'http://127.0.0.1:5173/';
async function setup(page: Page) {
  await page.clock.setFixedTime(radarNow);
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('https://api.rainviewer.com/public/weather-maps.json', (r) =>
    r.fulfill({ json: radarMetadata() }),
  );
  await page.route('https://tilecache.rainviewer.com/**', (r) =>
    r.fulfill({
      contentType: 'image/png',
      body: Buffer.from(radarPng, 'base64'),
    }),
  );
  await page.goto(base);
  await page.locator('#language').selectOption('en');
  await page.locator('#import').setInputFiles({
    name: 'radar.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      '<gpx><trk><name>Radar route</name><trkseg><trkpt lat="-22.93" lon="-43.23"/><trkpt lat="-23.05" lon="-43.53"/></trkseg></trk></gpx>',
    ),
  });
  await expect(page.locator('#download')).toBeEnabled();
}
async function enable(page: Page) {
  await page.locator('#layers-toggle').click();
  await page.locator('#radar-enabled').check();
  await expect(page.locator('#radar-control')).toBeVisible();
}
async function loaded(page: Page) {
  await expect(page.locator('#radar-status')).toHaveText(
    'Recent observations, not a forecast.',
    { timeout: 15000 },
  );
  await expect(
    page.locator('.radar-images .leaflet-tile-loaded').first(),
  ).toBeAttached();
}
test('off by default, opt-in independent of departure, playback, memory cache, opacity, coverage and keyboard', async ({
  page,
}) => {
  await setup(page);
  let weather = 0;
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('rainviewer.com')) requests.push(r.url());
    if (r.url().includes('/v1/forecast')) weather++;
  });
  await expect(page.locator('#radar-control')).toBeHidden();
  await expect(page.locator('#radar-enabled')).not.toBeChecked();
  expect(requests).toEqual([]);
  await enable(page);
  await loaded(page);
  expect(weather).toBe(0);
  expect(requests.filter((u) => u.includes('weather-maps.json'))).toHaveLength(
    1,
  );
  await expect
    .poll(() => requests.some((u) => u.includes('/coverage/')))
    .toBe(true);
  await expect(page.locator('.map-credits-dialog')).toContainText(
    'Radar by RainViewer',
  );
  await expect(page.locator('#radar-control a')).toHaveCount(0);
  await expect(page.locator('#radar-time')).toContainText('04:00 PM');
  await expect(page.locator('#radar-play .icon-play')).toHaveCount(1);
  await page.locator('#radar-play').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#radar-play .icon-pause')).toHaveCount(1);
  await expect(page.locator('#radar-frame')).not.toHaveValue('2', {
    timeout: 10000,
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('#radar-play')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await loaded(page);
  await page.locator('#radar-frame').fill('2');
  await loaded(page);
  const count = requests.length;
  await page.locator('#radar-frame').fill('2');
  await loaded(page);
  expect(requests).toHaveLength(count);
  await page.locator('#radar-options > summary').click();
  await page.locator('#radar-opacity').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#radar-opacity-value')).toHaveText('10%');
  await expect(page.locator('.radar-images')).toHaveCSS('opacity', '0.1');
  await page.locator('#radar-coverage').uncheck();
  await expect(page.locator('.radar-coverage')).toHaveCount(0);
  await page.locator('#radar-coverage').check();
  await expect(page.locator('.radar-coverage')).toHaveCount(1);
  await page.locator('#layers-toggle').click();
  await page.locator('#radar-enabled').uncheck();
  await expect(page.locator('#radar-control')).toBeHidden();
  await expect(page.locator('.radar-images')).toHaveCount(0);
});
for (const mode of ['429', 'network', 'invalid'])
  test(`radar ${mode} offers manual retry without blocking the route or retry loops`, async ({
    page,
  }) => {
    await setup(page);
    let requests = 0;
    await page.route(
      'https://api.rainviewer.com/public/weather-maps.json',
      (r) => {
        requests++;
        if (requests > 1) return r.fulfill({ json: radarMetadata() });
        if (mode === 'network') return r.abort();
        return r.fulfill(
          mode === '429'
            ? { status: 429 }
            : {
                json: { host: 'https://unexpected.test', radar: { past: [] } },
              },
        );
      },
    );
    await enable(page);
    await expect(page.locator('#radar-status')).toContainText(
      mode === '429' ? 'limit' : mode === 'network' ? 'network' : 'invalid',
    );
    await expect(page.locator('#download')).toBeEnabled();
    expect(requests).toBe(1);
    await page.locator('#radar-retry').click();
    await loaded(page);
    expect(requests).toBe(2);
  });
test('unavailable coverage is explicit and corrupted tiles cannot be cached as success', async ({
  page,
}) => {
  await setup(page);
  let broken = true;
  await page.route('https://tilecache.rainviewer.com/v2/coverage/**', (r) =>
    r.fulfill({
      contentType: 'image/png',
      body: broken ? 'broken' : Buffer.from(radarPng, 'base64'),
    }),
  );
  await enable(page);
  await expect(page.locator('#radar-status')).toContainText('invalid');
  await expect(page.locator('#radar-play')).toBeDisabled();
  broken = false;
  await page.locator('#radar-retry').click();
  await loaded(page);
});
test('disabling aborts a late metadata response and never loads its tiles', async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false,
    tiles = 0;
  await page.route(
    'https://api.rainviewer.com/public/weather-maps.json',
    async (r) => {
      started = true;
      await pending;
      await r.fulfill({ json: radarMetadata() });
    },
  );
  page.on('request', (r) => {
    if (r.url().includes('tilecache.rainviewer.com')) tiles++;
  });
  await enable(page);
  await expect.poll(() => started).toBe(true);
  await page.locator('#layers-toggle').click();
  await page.locator('#radar-enabled').uncheck();
  release();
  await expect(page.locator('#radar-control')).toBeHidden();
  await expect(page.locator('.radar-images')).toHaveCount(0);
  expect(tiles).toBe(0);
});
test('radar does not alter GPX, link state or saved geometry and always restarts disabled', async ({
  page,
}) => {
  await setup(page);
  const download = async () => {
    const [d] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download').click(),
    ]);
    return readFile((await d.path())!, 'utf8');
  };
  const original = await download(),
    hash = new URL(page.url()).hash;
  const state = decodeState(hash);
  await enable(page);
  await loaded(page);
  expect(await download()).toBe(original);
  expect(decodeState(new URL(page.url()).hash)).toEqual(state);
  await page.locator('#route-name').fill('With radar');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('route-gpx');
      r.onsuccess = () => resolve(r.result);
    });
    const rows = await new Promise<unknown[]>((resolve) => {
      const r = db.transaction('routes').objectStore('routes').getAll();
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      rows,
    });
  });
  expect(stored).not.toContain('rainviewer');
  expect(stored).not.toContain('radar-enabled');
  await page.goto(base + encodeState(defaults()));
  await page.reload();
  await expect(page.locator('#radar-control')).toBeHidden();
});
for (const [width, height] of [
  [320, 568],
  [360, 844],
  [390, 844],
  [430, 844],
  [844, 390],
])
  test(`radar controls stay inside the mobile map, away from buttons and sheet at ${width}×${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: 'dark' });
    await setup(page);
    await enable(page);
    await loaded(page);
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('#radar-options > summary').click();
      const box = (await page.locator('#radar-control').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      if (width < 760)
        expect(box.y + box.height).toBeLessThan(
          (await page.locator('#panel-toggle').boundingBox())!.y,
        );
      for (const id of ['locate', 'layers-toggle', 'fullscreen', 'fit']) {
        const b = (await page.locator('#' + id).boundingBox())!;
        expect(
          box.x + box.width <= b.x ||
            box.x >= b.x + b.width ||
            box.y + box.height <= b.y ||
            box.y >= b.y + b.height,
        ).toBe(true);
      }
      expect(
        await page
          .locator('#radar-control')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#radar-control')).toContainText(
      'Legenda e opacidade',
    );
    await expect(page.locator('#radar-play')).toHaveAccessibleName(
      'Reproduzir ou pausar radar',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#radar-play')).toHaveAccessibleName(
      'Play or pause radar',
    );
    await page.locator('#layers-toggle').click();
    await page.locator('[data-layer=satellite]').click();
    await expect(page.locator('#radar-control')).toBeVisible();
  });
