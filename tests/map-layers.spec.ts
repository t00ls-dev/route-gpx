import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:5173/';
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d1e2ce"/></svg>';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));

  for (const domain of [
    'tile.openstreetmap.org',
    'a.tile.opentopomap.org',
    'tiles.maps.eox.at',
  ])
    await page.route(`https://${domain}/**`, (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: tile }),
    );
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
});
test('loads only the selected layer, updates credits and keeps layer preferences out of route state', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (/tile\.openstreetmap|tile\.opentopomap|tiles\.maps\.eox/.test(r.url()))
      requests.push(r.url());
  });
  await page.goto(base);
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(
    requests.some(
      (url) => url.includes('eox.at') || url.includes('opentopomap'),
    ),
  ).toBe(false);
  const hash = new URL(page.url()).hash;
  requests.length = 0;
  await page.locator('#layers-toggle').click();
  await page
    .getByRole('menuitemradio', { name: 'Topographic', exact: true })
    .click();
  await expect(page.locator('.map-credits-dialog')).toContainText(
    'OpenTopoMap',
  );
  await expect
    .poll(() => requests.some((url) => url.includes('a.tile.opentopomap.org')))
    .toBe(true);
  expect(requests.some((url) => url.includes('tile.openstreetmap'))).toBe(
    false,
  );
  requests.length = 0;
  await page.locator('#layers-toggle').click();
  await page
    .getByRole('menuitemradio', { name: 'Satellite', exact: true })
    .click();
  await expect(page.locator('.map-credits-dialog')).toContainText(
    'EOxCloudless',
  );
  await expect(page.locator('.map-credits-dialog')).toContainText('2025');
  await expect
    .poll(() => requests.some((url) => url.includes('s2cloudless-2025')))
    .toBe(true);
  expect(
    requests.some(
      (url) =>
        url.includes('openstreetmap.org') || url.includes('opentopomap.org'),
    ),
  ).toBe(false);
  expect(requests.some((url) => url.includes('overlay_bright'))).toBe(true);
  expect(new URL(page.url()).hash).toBe(hash);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute(
    'data-map-layer',
    'satellite',
  );
  await page.locator('#layers-toggle').click();
  await page.locator('#map-labels').uncheck();
  await expect(page.locator('.map-credits-dialog')).not.toContainText(
    'MapServer',
  );
  await page.keyboard.press('Escape');
  await page.locator('.settings > summary').click();
  await page.locator('#satellite-vintage').selectOption('2016');
  await expect(page.locator('.map-credits-dialog')).toContainText('2016');
  await page.reload();
  await expect(page.locator('.map-credits-dialog')).toContainText('2016');
});
test('menu works by keyboard, closes outside and translates both ways', async ({
  page,
}) => {
  await page.goto(base);
  await page.locator('#layers-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitemradio', { name: 'Standard', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute(
    'data-map-layer',
    'topographic',
  );
  await expect(page.locator('#layers-menu')).toBeHidden();
  await page.locator('#layers-toggle').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#layers-toggle')).toBeFocused();
  await page.locator('#layers-toggle').click();
  await page.locator('#fit').click();
  await expect(page.locator('#layers-menu')).toBeHidden();
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#layers-toggle')).toContainText('Camadas do mapa');
  await page.locator('#language').selectOption('en');
  await expect(page.locator('#layers-toggle')).toContainText('Map layers');
});
test('blocked localStorage does not prevent layer switching', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  await page.goto(base);
  await page.locator('#layers-toggle').click();
  await page
    .getByRole('menuitemradio', { name: 'Satellite', exact: true })
    .click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-map-layer',
    'satellite',
  );
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
});
test('mobile layers stay accessible without overlapping other map controls or the sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(base);
  const box = (await page.locator('#layers-toggle').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  for (const selector of [
    '#locate',
    '#fullscreen',
    '#panel-toggle',
    '.leaflet-control-zoom-in',
  ]) {
    const other = (await page.locator(selector).boundingBox())!;
    expect(
      box.x + box.width <= other.x ||
        box.x >= other.x + other.width ||
        box.y + box.height <= other.y ||
        box.y >= other.y + other.height,
    ).toBe(true);
  }
  await page.locator('#layers-toggle').click();
  const menu = (await page.locator('#layers-menu').boundingBox())!,
    sheet = (await page.locator('#panel-toggle').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  expect(menu.y + menu.height).toBeLessThanOrEqual(sheet.y);
  await page
    .getByRole('menuitemradio', { name: 'Satellite', exact: true })
    .click();
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#map-labels')).toBeChecked();
});
test('GPX bytes remain identical across map layers and saved state contains no layer choice', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-03T00:00:00Z'));
  await page.goto(base);
  await page.locator('#import').setInputFiles('docs/example.gpx');
  await expect(page.locator('#download')).toBeEnabled();
  let original: string | undefined;
  for (const name of ['Standard', 'Topographic', 'Satellite']) {
    await page.locator('#layers-toggle').click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download').click(),
    ]);
    const xml = await readFile((await download.path())!, 'utf8');
    if (!original) original = xml;
    else expect(xml).toBe(original);
  }
  await page.locator('#route-name').fill('Layer-independent');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page
      .locator('.saved-routes > summary')
      .click()
      .then(() => page.locator('#backup-routes').click()),
  ]);
  const data = JSON.parse(await readFile((await backup.path())!, 'utf8'));
  expect(JSON.stringify(data)).not.toContain('map-layer');
  expect(JSON.stringify(data)).not.toContain('satellite-vintage');
});

test('satellite overzoom reuses native level 14 tiles instead of requesting missing levels', async ({
  page,
}) => {
  const zooms: number[] = [];
  page.on('request', (request) => {
    const match = request.url().match(/GoogleMapsCompatible\/(\d+)\//);
    if (match) zooms.push(Number(match[1]));
  });
  await page.goto(base);
  await page.locator('#import').setInputFiles({
    name: 'near.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      '<gpx><trk><trkseg><trkpt lat="38.72" lon="-9.14"/><trkpt lat="38.72001" lon="-9.14001"/></trkseg></trk></gpx>',
    ),
  });
  await page.locator('#layers-toggle').click();
  await page
    .getByRole('menuitemradio', { name: 'Satellite', exact: true })
    .click();
  await expect.poll(() => zooms.includes(14)).toBe(true);
  await page.locator('.leaflet-control-zoom-in').click();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(Math.max(...zooms)).toBe(14);
});

test('switching layers immediately after a nearby GPX import keeps its route framed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['pt-BR'] });
  });
  await page.goto(base);
  await page.locator('#import').setInputFiles('docs/example.gpx');
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#layers-toggle').click();
  await page.locator('[data-layer=satellite]').click();
  const bounds = (await page.locator('#map').boundingBox())!;
  const sheet = (await page.locator('#route-panel').boundingBox())!;
  await expect
    .poll(async () =>
      page.locator('.route-marker').evaluateAll(
        (markers, limit) =>
          markers.length === 7 &&
          markers.every((marker) => {
            const box = marker.getBoundingClientRect();
            return (
              box.left >= limit.left &&
              box.right <= limit.right &&
              box.top >= 44 &&
              box.bottom <= limit.bottom
            );
          }),
        {
          left: bounds.x,
          right: bounds.x + bounds.width - 55,
          bottom: sheet.y,
        },
      ),
    )
    .toBe(true);
});
test('GPX import during a running zoom takes precedence over that view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator('.leaflet-control-zoom-in').click();
  await page.locator('#import').setInputFiles('docs/example.gpx');
  await expect(page.locator('#download')).toBeEnabled();
  const bounds = (await page.locator('#map').boundingBox())!;
  await expect
    .poll(async () => {
      const marker = await page.locator('.route-marker').first().boundingBox();
      return (
        marker !== null &&
        marker.x >= bounds.x &&
        marker.x + marker.width <= bounds.x + bounds.width
      );
    })
    .toBe(true);
});
