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
    test('two map clicks fill start and destination automatically', async ({
      page,
    }) => {
      await setup(page);
      await page.locator('#map').click({ position: { x: 130, y: 95 } });
      await expect(page.locator('#location-0')).not.toHaveValue('');
      await expect(page.locator('#location-1')).toHaveValue('');
      await page.locator('#map').click({ position: { x: 210, y: 140 } });
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

test('average speed estimates trip time, converts with units, and resets to router time', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await expect(page.locator('#summary')).toContainText('49 min');
  await page.locator('.speed-options').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.locator('#average-speed').fill('60');
  await page.locator('#average-speed').press('Tab');
  await expect(page.locator('#summary')).toContainText('42 min');
  await page.locator('#units').selectOption('imperial');
  await expect(page.locator('#speed-unit')).toHaveText('mph');
  await expect(page.locator('#average-speed')).toHaveValue('37.28');
  await expect(page.locator('#summary')).toContainText('42 min');
  await page.locator('#reset-speed').click();
  await expect(page.locator('#summary')).toContainText('49 min');
});

test('average speed is limited to 1–200 km/h with equivalent mph bounds', async ({
  page,
}) => {
  await setup(page);
  await page.locator('.speed-options').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.locator('#average-speed').fill('500');
  await expect(page.locator('#status')).toHaveClass('error');
  await page.locator('#average-speed').fill('200');
  await expect(page.locator('#status')).not.toHaveClass('error');
  await page.locator('#reset-speed').click();
  await fillPair(page);
  await page.locator('.speed-options').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.locator('#average-speed')).toHaveAttribute('min', '1');
  await expect(page.locator('#average-speed')).toHaveAttribute('max', '200');
  await expect(page.locator('#speed-range')).toHaveText('1–200 km/h');
  for (const value of ['0.5', '201', '500']) {
    await page.locator('#average-speed').fill(value);
    await expect(page.locator('#average-speed')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.locator('#status')).toContainText(
      'between 1 and 200 km/h',
    );
  }
  await page.locator('#average-speed').fill('200');
  await page.locator('#average-speed').press('Tab');
  await expect(page.locator('#average-speed')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.locator('#status')).not.toHaveClass('error');
  await page.locator('#units').selectOption('imperial');
  await expect(page.locator('#average-speed')).toHaveValue('124.27');
  expect(
    Number(await page.locator('#average-speed').getAttribute('max')),
  ).toBeCloseTo(124.274238);
  await page.locator('#average-speed').fill('125');
  await expect(page.locator('#average-speed')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await page.locator('#units').selectOption('metric');
  await page.locator('#average-speed').fill('1');
  await page.locator('#average-speed').press('Tab');
  await page.locator('#units').selectOption('imperial');
  expect(
    Number(await page.locator('#average-speed').inputValue()),
  ).toBeGreaterThanOrEqual(1 / 1.609344);
  await page.locator('#average-speed').press('Enter');
  await expect(page.locator('#average-speed')).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
});
