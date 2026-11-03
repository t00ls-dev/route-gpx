import { holdMap } from './map-helpers';
import { defaults, encodeState } from '../src/core';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
const base = 'http://127.0.0.1:5173/route-gpx/';
const start = '-22.930929, -43.238286',
  end = '-23.050160, -43.535240';
async function setup(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.route('**/route/v1/driving/**', async (r) => {
    const part = new URL(r.request().url()).pathname.split('/driving/')[1];
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
                    ref: 'BR-101',
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
  await page.goto(base);
  await page.locator('#language').selectOption('en');
}
async function fillPair(page: Page) {
  await page.locator('#location-0').fill(start);
  await page.locator('#location-1').fill(end);
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
}
for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile points' : 'desktop points', () => {
    test.use({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    test('typing two coordinate pairs creates a route, then undo restores the prior point', async ({
      page,
    }) => {
      await setup(page);
      await expect(page.locator('#location-0')).toBeVisible();
      await expect(page.locator('#location-1')).toBeVisible();
      await fillPair(page);
      await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
      await expect(page.locator('#summary')).toContainText('42 km');
      await page.locator('#undo').click();
      await expect(page.locator('#location-1')).toHaveValue('');
      await expect(page.locator('#location-0')).toHaveValue(start);
      await expect(page.locator('#download')).toBeDisabled();
      await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    });
    test('map gestures fill start and destination', async ({ page }) => {
      await setup(page);
      if (mobile) {
        await holdMap(page);
        await page
          .locator('#point-menu')
          .getByRole('menuitem', { name: 'Set as start', exact: true })
          .click();
      } else await page.locator('#map').click({ position: { x: 130, y: 95 } });
      await expect(page.locator('#location-0')).not.toHaveValue('');
      await expect(page.locator('#location-1')).toHaveValue('');
      if (mobile) {
        await holdMap(page, 210, 280);
        await page
          .locator('#point-menu')
          .getByRole('menuitem', { name: 'Set as destination' })
          .click();
      } else await page.locator('#map').click({ position: { x: 210, y: 140 } });
      await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
      await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
    });
  });
}
test('address searches belong to their own point and do not fire while typing', async ({
  page,
}) => {
  let searches = 0;
  await page.route('**/search?**', async (r) => {
    searches++;
    const q = new URL(r.request().url()).searchParams.get('q')!;
    const isStart = q.includes('Uruguai');
    await r.fulfill({
      json: [
        {
          display_name: isStart
            ? 'Metrô Uruguai, Rio de Janeiro'
            : 'Grumari, Rio de Janeiro',
          lat: isStart ? '-22.930929' : '-23.050160',
          lon: isStart ? '-43.238286' : '-43.535240',
        },
      ],
    });
  });
  await setup(page);
  await page.locator('#location-0').fill('Metrô Uruguai');
  await page.locator('#location-1').fill('Grumari');
  expect(searches).toBe(0);
  await page
    .getByRole('button', { name: 'Search point 1', exact: true })
    .click();
  await page.locator('#point-results-0 button').click();
  await expect(page.locator('#location-0')).toHaveValue(
    'Metrô Uruguai, Rio de Janeiro',
  );
  await expect(page.locator('#location-1')).toHaveValue('Grumari');
  await page
    .getByRole('button', { name: 'Search point 2', exact: true })
    .click();
  await page.locator('#point-results-1 button').click();
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  expect(searches).toBe(2);
});
test('undo restores a moved marker and a removed stop', async ({ page }) => {
  await setup(page);
  await fillPair(page);
  const original = await page.locator('#location-0').inputValue();
  const marker = page.locator('.leaflet-marker-icon').first();
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  await page.mouse.move(box!.x + 15, box!.y + 15);
  await page.mouse.down();
  await page.mouse.move(box!.x + 45, box!.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#location-0')).not.toHaveValue(original);
  await page.locator('#undo').click();
  await expect(page.locator('#location-0')).toHaveValue(original);
  await page.locator('#add').click();
  await expect(page.locator('#points li')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Remove point 2', exact: true })
    .click();
  await expect(page.locator('#points li')).toHaveCount(2);
  await page.locator('#undo').click();
  await expect(page.locator('#points li')).toHaveCount(3);
});
test('invalid coordinates cannot enable a stale GPX download', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await page.locator('#location-1').fill('99, 200');
  await page
    .getByRole('button', { name: 'Search point 2', exact: true })
    .click();
  await expect(page.locator('#status')).toHaveClass('error');
  await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#undo').click();
  await expect(page.locator('#location-1')).toHaveValue(end);
});

test('distance units change without rerouting or changing GPX geometry and can be undone', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  let routingRequests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/')) routingRequests++;
  });
  const [before] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  const originalGeometry = (
    await readFile((await before.path())!, 'utf8')
  ).match(/<trkpt[^>]*\/>/g);
  const hashBefore = page.url();
  await page.locator('#units').selectOption('imperial');
  await expect(page.locator('#summary')).toContainText('26.1 mi');
  expect(page.url()).not.toBe(hashBefore);
  const [after] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  const newGeometry = (await readFile((await after.path())!, 'utf8')).match(
    /<trkpt[^>]*\/>/g,
  );
  expect(newGeometry).toEqual(originalGeometry);
  expect(routingRequests).toBe(0);
  await page.locator('#undo').click();
  await expect(page.locator('#units')).toHaveValue('metric');
  await expect(page.locator('#summary')).toContainText('42 km');
});

test('average-speed slider supports keyboard steps, units and router reset', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await expect(page.locator('#summary')).toContainText('49 min');
  await page.locator('.speed-options').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.locator('#average-speed')).toBeDisabled();
  await page.locator('#use-average-speed').check();
  await expect(page.locator('#average-speed-value')).toHaveText('60');
  await expect(page.locator('#summary')).toContainText('42 min');
  await page.locator('#average-speed').focus();
  await page.locator('#average-speed').press('Home');
  await expect(page.locator('#average-speed-value')).toHaveText('1');
  await page.locator('#average-speed').press('ArrowRight');
  await expect(page.locator('#average-speed-value')).toHaveText('5');
  await page.locator('#average-speed').press('ArrowRight');
  await expect(page.locator('#average-speed-value')).toHaveText('10');
  await page.locator('#average-speed').press('End');
  await expect(page.locator('#average-speed-value')).toHaveText('200');
  await expect(page.locator('#speed-range')).toHaveText('1–200 km/h');
  await page.locator('#units').selectOption('imperial');
  await expect(page.locator('#average-speed-value')).toHaveText('125');
  await expect(page.locator('#speed-range')).toHaveText('1–130 mph');
  await expect(page.locator('#average-speed')).toHaveAttribute('step', '5');
  await expect(page.locator('#average-speed')).toHaveAttribute('max', '130');
  await page.locator('#average-speed').focus();
  await page.locator('#average-speed').press('End');
  await expect(page.locator('#average-speed-value')).toHaveText('130');
  await expect(page.locator('#summary')).toContainText('12 min');
  await page.locator('#average-speed').press('Home');
  await expect(page.locator('#average-speed-value')).toHaveText('1');
  await page.locator('#reset-speed').click();
  await expect(page.locator('#average-speed')).toBeDisabled();
  await expect(page.locator('#use-average-speed')).not.toBeChecked();
  await expect(page.locator('#summary')).toContainText('49 min');
});

test('an older route link with a 500 km/h average retains its points', async ({
  page,
}) => {
  await setup(page);
  const state = defaults();
  state.averageSpeedKmh = 500;
  state.points = [
    { name: 'Start', coord: [-22.930929, -43.238286] },
    { name: 'Destination', coord: [-23.05016, -43.53524] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#location-0')).toHaveValue(start);
  await expect(page.locator('#location-1')).toHaveValue(end);
  await expect(page.locator('#use-average-speed')).not.toBeChecked();
  await expect(page.locator('#average-speed')).toBeDisabled();
  await expect(page.locator('#summary')).toContainText('49 min');
});

test('GPX name is visible and names the downloaded file, metadata and track', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  const name = 'Passeio <Alto> & Grumari';
  await expect(page.locator('#route-name')).toBeVisible();
  await page.locator('#route-name').fill(name);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('passeio-alto-grumari.gpx');
  const xml = await readFile((await download.path())!, 'utf8');
  const names = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return [
      doc.querySelector('metadata name')?.textContent,
      doc.querySelector('trk name')?.textContent,
      doc.querySelectorAll('trkpt').length,
    ];
  }, xml);
  expect(names).toEqual([name, name, 2]);
  await page.reload();
  await expect(page.locator('#route-name')).toHaveValue(name);
  await page.locator('#route-name').fill('');
  const [fallback] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  expect(fallback.suggestedFilename()).toBe('start-to-destination.gpx');
});

test('only explicitly saved named routes persist, and reopening does not reroute', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await expect(page.locator('#saved-count')).toHaveText('(0)');
  await expect(page.locator('#save-route')).toBeDisabled();
  await page.locator('#route-name').fill('Weekend route');
  await expect(page.locator('#saved-count')).toHaveText('(0)');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  await expect(page.locator('#save-route')).toHaveText('Update saved route');
  await page.locator('#save-route').click();
  await expect(page.locator('#status')).toHaveText(
    'Route saved on this device.',
  );
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  await page.goto(base);
  await page.locator('.saved-routes summary').click();
  await expect(page.locator('#saved-list strong')).toHaveText('Weekend route');
  let requests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/')) requests++;
  });
  await page
    .getByRole('button', {
      name: 'Open saved route: Weekend route',
      exact: true,
    })
    .click();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#route-name')).toHaveValue('Weekend route');
  await expect(page.locator('#summary')).toContainText('42 km');
  expect(requests).toBe(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page
      .getByRole('button', {
        name: 'Download saved route: Weekend route',
        exact: true,
      })
      .click(),
  ]);
  const xml = await readFile((await download.path())!, 'utf8');
  expect((xml.match(/<trkpt /g) || []).length).toBe(2);
  expect(download.suggestedFilename()).toBe('weekend-route.gpx');
});
test('route backups restore deleted routes and skip existing names', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await page.locator('#route-name').fill('Backup test');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  await page.locator('.saved-routes summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#backup-routes').click(),
  ]);
  const backup = await readFile((await download.path())!);
  expect(JSON.parse(backup.toString()).routes).toHaveLength(1);
  await page
    .getByRole('button', {
      name: 'Delete saved route: Backup test',
      exact: true,
    })
    .click();
  await expect(page.locator('#saved-count')).toHaveText('(0)');
  for (let i = 0; i < 2; i++) {
    await page.locator('#restore-routes').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: backup,
    });
    await expect(page.locator('#saved-count')).toHaveText('(1)');
    await expect(page.locator('#restore-routes')).toHaveValue('');
  }
  await expect(page.locator('#saved-list strong')).toHaveText('Backup test');
  await expect(page.locator('#library-status')).toContainText(
    'Existing names were kept.',
  );
});
test('download still works if persistent browser storage is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined });
  });
  await setup(page);
  await fillPair(page);
  await page.locator('#route-name').fill('Temporary');
  await page.locator('#save-route').click();
  await expect(page.locator('#status')).toContainText('Could not save locally');
  await expect(page.locator('#download')).toBeEnabled();
});

test.beforeEach(async ({ page }) => {
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
});

test.beforeEach(async ({ page }) => {
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: { features: [] } }),
  );
});
