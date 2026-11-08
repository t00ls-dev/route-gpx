import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { holdMap } from './map-helpers';
const base = 'http://127.0.0.1:5173/';
const features = {
  features: [
    {
      properties: { name: 'Lisboa', country: 'Portugal' },
      geometry: { type: 'Point', coordinates: [-9.14, 38.72] },
    },
    {
      properties: { name: 'Porto' },
      geometry: { type: 'Point', coordinates: [-8.6, 41.1] },
    },
  ],
};
const coords = Array.from({ length: 1000 }, (_, i) => [
  -22.9 - i * 0.0001,
  -43.1 - i * 0.0001,
]);
const gpx = `<gpx><trk><trkseg>${coords.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg></trk></gpx>`;
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: features }),
  );
});
test('touch tap does not add; holds choose start, stop and destination', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route('**/*', async (r) => {
    if (r.request().url().startsWith('http://127.0.0.1')) await r.continue();
    else await r.fulfill({ status: 204 });
  });
  await page.goto(base);
  await page.touchscreen.tap(205, 245);
  await expect(page.locator('.route-marker')).toHaveCount(0);
  await holdMap(page);
  await expect(page.locator('#point-menu')).toBeVisible();
  await page
    .locator('#point-menu')
    .getByRole('menuitem', { name: 'Set as start', exact: true })
    .tap();
  await expect(page.locator('.route-marker')).toHaveCount(1);
  await holdMap(page, 240, 280);
  await page
    .locator('#point-menu')
    .getByRole('menuitem', { name: 'Add as stop' })
    .tap();
  await expect(page.locator('#points li')).toHaveCount(3);
  await holdMap(page, 300, 245);
  await page
    .locator('#point-menu')
    .getByRole('menuitem', { name: 'Set as destination' })
    .tap();
  await expect(page.locator('.route-marker')).toHaveCount(3);
  await context.close();
});
test('point menu supports desktop keyboard and Escape', async ({ page }) => {
  await page.goto(base);
  await page.locator('#map').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.locator('#point-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('#point-menu').getByRole('menuitem', { name: 'Add as stop' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#point-menu')).toBeHidden();
});
test('autocomplete selects by keyboard and explicitly falls back to Nominatim after failure', async ({
  page,
}) => {
  let nominatim = 0;
  await page.route('**/search?**', (r) => {
    nominatim++;
    return r.fulfill({
      json: [{ display_name: 'Fallback city', lat: '41', lon: '-8' }],
    });
  });
  await page.goto(base);
  await page.locator('#location-0').fill('Lisboa');
  await expect(page.locator('#suggestions-0 [role=option]')).toHaveCount(2);
  await page.locator('#location-0').press('ArrowDown');
  await page.locator('#location-0').press('Enter');
  await expect(page.locator('#location-0')).toHaveValue('Lisboa, Portugal');
  expect(nominatim).toBe(0);
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ status: 503 }),
  );
  await page.locator('#location-1').fill('Other city');
  await expect(page.locator('#status')).toContainText(
    'Suggestions unavailable',
  );
  expect(nominatim).toBe(0);
  await page.locator('#location-1').press('Enter');
  await expect(page.locator('#point-results-1 button')).toHaveCount(1);
  expect(nominatim).toBe(1);
});
test('old autocomplete request is aborted and cannot replace newer suggestions', async ({
  page,
}) => {
  let oldStarted!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let aborted = false;
  page.on('requestfailed', (r) => {
    if (r.url().includes('q=Older')) aborted = true;
  });
  await page.route('https://photon.komoot.io/**', async (r) => {
    if (new URL(r.request().url()).searchParams.get('q') === 'Older') {
      oldStarted();
      await pending;
    }
    await r.fulfill({ json: features });
  });
  await page.goto(base);
  await page.locator('#location-0').fill('Older');
  await started;
  await page.locator('#location-0').fill('Newer');
  release();
  await expect(page.locator('#suggestions-0 [role=option]')).toHaveCount(2);
  await expect.poll(() => aborted).toBe(true);
});
test('full geometry survives visual simplification and share uses the same GPX and custom filename', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => data.files?.[0].type === 'application/xml',
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files![0];
        Object.assign(window, {
          sharedGpx: {
            name: file.name,
            type: file.type,
            xml: await file.text(),
            title: data.title,
          },
        });
      },
    });
  });
  await page.goto(base);
  await page.locator('#import').setInputFiles({
    name: 'dense.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx),
  });
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#route-name').fill('Custom file');
  const path = await page.locator('.route-line').getAttribute('d');
  expect((path!.match(/[ML]/g) ?? []).length).toBeLessThan(100);
  await page.locator('#share-gpx').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { sharedGpx?: { name: string } }).sharedGpx
            ?.name,
      ),
    )
    .toBe('custom-file.gpx');
  const shared = await page.evaluate(
    () =>
      (window as unknown as { sharedGpx: { xml: string; type: string } })
        .sharedGpx,
  );
  expect(shared.type).toBe('application/xml');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  const xml = await readFile((await download.path())!, 'utf8');
  const points = (value: string) =>
    [...value.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
  expect(points(xml)).toEqual(coords);
  expect(points(shared.xml)).toEqual(coords);
  await page.locator('.leaflet-control-zoom-in').click();
  const [after] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  expect(points(await readFile((await after.path())!, 'utf8'))).toEqual(coords);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Cancelled', 'AbortError')),
    }),
  );
  const status = await page.locator('#status').textContent();
  await page.locator('#share-gpx').click();
  await expect(page.locator('#status')).toHaveText(status!);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'share', {
      value: () =>
        Promise.reject(new DOMException('Unavailable', 'NotAllowedError')),
    }),
  );
  await page.locator('#share-gpx').click();
  await expect(page.locator('#status')).toContainText('Use Download GPX');
  await expect(page.locator('#download')).toBeEnabled();
});
test('sharing is hidden without file support', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'canShare', { value: undefined }),
  );
  await page.goto(base);
  await expect(page.locator('#share-gpx')).toBeHidden();
});

for (const width of [320, 390]) {
  test(`destination and stop suggest while typing without a search button at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    await expect(page.locator('.point-location-form button')).toHaveCount(0);
    await page.locator('#location-1').fill('Li');
    await expect(page.locator('#suggestions-1 [role=option]')).toHaveCount(0);
    await page.locator('#location-1').pressSequentially('sboa');
    await expect(page.locator('#suggestions-1 [role=option]')).toHaveCount(2);
    await expect(page.locator('#status')).toHaveText('Choose a place.');
    await page.locator('#suggestions-1 [role=option]').first().click();
    await expect(page.locator('#location-1')).toHaveValue('Lisboa, Portugal');
    await page.locator('#add').click();
    await page.locator('#location-1').fill('Porto');
    await expect(page.locator('#suggestions-1 [role=option]')).toHaveCount(2);
    await page.locator('#location-1').press('ArrowDown');
    await page.locator('#location-1').press('ArrowDown');
    await page.locator('#location-1').press('Enter');
    await expect(page.locator('#location-1')).toHaveValue('Porto');
    await expect(page.locator('#location-2')).toHaveValue('Lisboa, Portugal');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

test('empty suggestions offer an explicit Enter search and translate both ways', async ({
  page,
}) => {
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: { features: [] } }),
  );
  await page.goto(base);
  await page.locator('#location-1').fill('Nowhere');
  await expect(page.locator('#status')).toHaveText(
    'No suggestions found. Press Enter to search with Nominatim.',
  );
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#status')).toHaveText(
    'Nenhuma sugestão encontrada. Pressione Enter para buscar com Nominatim.',
  );
  await page.locator('#language').selectOption('en');
  await expect(page.locator('#status')).toHaveText(
    'No suggestions found. Press Enter to search with Nominatim.',
  );
});
