import { holdMap } from './map-helpers';
import { defaults, encodeState, encodeStateV1 } from '../src/core';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
const base = 'http://127.0.0.1:5173/';
const start = '-22.930929, -43.238286',
  end = '-23.050160, -43.535240';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
});
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
    test('the edit lock blocks route edits while viewing and download keep working', async ({
      page,
    }) => {
      let routeRequests = 0;
      page.on('request', (request) => {
        if (request.url().includes('/route/v1/driving/')) routeRequests++;
      });
      await setup(page);
      await fillPair(page);
      const requestsBefore = routeRequests;
      await expect(page.locator('.leaflet-marker-draggable')).toHaveCount(2);

      await page.locator('#lock').click();
      await expect(page.locator('#lock')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('#lock-notice')).toBeVisible();
      await expect(page.locator('#location-0')).toHaveJSProperty(
        'readOnly',
        true,
      );
      for (const id of ['add', 'reverse', 'roundtrip', 'undo', 'calculate'])
        await expect(page.locator(`#${id}`)).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Remove point 2' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Move point 2 up' }),
      ).toBeDisabled();
      await expect(page.locator('#import')).toBeDisabled();
      await expect(page.locator('#apply-json')).toBeDisabled();
      await expect(page.locator('.leaflet-marker-draggable')).toHaveCount(0);

      // Map gestures that would place points report the lock instead.
      if (mobile) await holdMap(page);
      else {
        await page.locator('#map').click({ position: { x: 130, y: 95 } });
        await page
          .locator('#map')
          .click({ button: 'right', position: { x: 210, y: 140 } });
        await page.locator('body').press('Control+z');
      }
      await expect(page.locator('#point-menu')).toBeHidden();
      await expect(page.locator('#status')).toHaveText(
        'Route locked. Unlock editing to change it.',
      );
      await expect(page.locator('#location-0')).toHaveValue(start);
      await expect(page.locator('#location-1')).toHaveValue(end);

      // Viewing and export stay available.
      if (mobile) await page.locator('#map').press('+');
      else await page.locator('.leaflet-control-zoom-in').click();
      await page.locator('#fit').click();
      const download = page.waitForEvent('download');
      await page.locator('#download').click();
      await download;
      expect(routeRequests).toBe(requestsBefore);

      await page.locator('#unlock').click();
      await expect(page.locator('#lock')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(page.locator('#lock-notice')).toBeHidden();
      await expect(page.locator('#location-0')).toHaveJSProperty(
        'readOnly',
        false,
      );
      await expect(page.locator('.leaflet-marker-draggable')).toHaveCount(2);
      // Lock toggles are not undo steps: undo still reverts the last edit.
      await page.locator('#undo').click();
      await expect(page.locator('#location-1')).toHaveValue('');
      await expect(page.locator('#location-0')).toHaveValue(start);
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
  await page.locator('#location-0').press('Enter');
  await page.locator('#point-results-0 button').click();
  await expect(page.locator('#location-0')).toHaveValue(
    'Metrô Uruguai, Rio de Janeiro',
  );
  await expect(page.locator('#location-1')).toHaveValue('Grumari');
  await page.locator('#location-1').press('Enter');
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
test('undo restores the geometry of each GPX import, even with equal points', async ({
  page,
}) => {
  await setup(page);
  await page.goto(base);
  const gpx = (lat: number, lon: number) =>
    Buffer.from(
      `<gpx><trk><name>Same trip</name><trkseg><trkpt lat="-22.9" lon="-43.2"/><trkpt lat="${lat}" lon="${lon}"/><trkpt lat="-23" lon="-43.4"/></trkseg></trk></gpx>`,
    );
  const load = async (buffer: Buffer) => {
    await page.locator('#import').setInputFiles({
      name: 'trip.gpx',
      mimeType: 'application/gpx+xml',
      buffer,
    });
    await expect(page.locator('#download')).toBeEnabled();
  };
  await load(gpx(-22.95, -43.3));
  const summaryA = await page.locator('#summary strong').first().innerText();
  await page.locator('#location-0').fill(start);
  await page.locator('#location-0').press('Tab');
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await load(gpx(-22.5, -42.8));
  const summaryB = await page.locator('#summary strong').first().innerText();
  expect(summaryB).not.toBe(summaryA);
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await expect(page.locator('#summary strong').first()).toHaveText(summaryA);
});
test('editing an imported track reroutes only the legs next to the edit', async ({
  page,
}) => {
  await setup(page);
  const routes: number[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/'))
      routes.push(
        new URL(r.url()).pathname.split('/driving/')[1].split(';').length,
      );
  });
  // A 30 km straight track with a 4 km out-and-back spur in the middle.
  const track = [
    ...Array.from({ length: 150 }, (_, i) => [-22.9, -43.4 + i * 0.002]),
    ...Array.from({ length: 41 }, (_, i) => [
      -22.9 + (20 - Math.abs(20 - i)) * 0.001,
      -43.4 + 150 * 0.002,
    ]),
    ...Array.from({ length: 150 }, (_, i) => [
      -22.9,
      -43.4 + (150 + i) * 0.002,
    ]),
  ];
  await page.locator('#import').setInputFiles({
    name: 'spur.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      `<gpx><trk><name>Spur</name><trkseg>${track.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join('')}</trkseg></trk></gpx>`,
    ),
  });
  await expect(page.locator('#download')).toBeEnabled();
  const count = await page.locator('#points li').count();
  expect(count).toBeGreaterThan(3);

  await page.locator('.settings > summary').click();
  await page.locator('#route-name').fill('Renamed spur');
  await page.locator('#save-settings').click();
  await expect(page.locator('#status')).toHaveText('Settings applied.');
  await expect(page.locator('#download')).toBeEnabled();

  await page.locator('#location-1').fill('-22.95, -43.39');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  expect(routes).toEqual([3]);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download').click(),
  ]);
  const gpx = await readFile((await download.path())!, 'utf8');
  const exported = gpx.match(/<trkpt[^>]*\/>/g)!;
  // Every point after the edited stop's next neighbour is the original track.
  expect(exported.slice(-150)).toEqual(
    track.slice(-150).map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"/>`),
  );
  await expect(page.locator('#summary')).toContainText('Imported GPX + OSRM');
  await expect(page.locator('#summary')).toContainText(
    'Road summary covers only recalculated sections.',
  );

  // Undo returns to the renamed step with the exact imported track, no request.
  await page.locator('#undo').click();
  // Restored synchronously: a reroute would leave the download disabled.
  expect(await page.locator('#download').isEnabled()).toBe(true);
  await expect(page.locator('#summary')).toContainText('Imported GPX ·');
  await expect(page.locator('#route-name')).toHaveValue('Renamed spur');
  expect(routes).toEqual([3]);

  // Calculate route asks the router for the whole route through every point.
  await page.locator('#calculate').click();
  await expect(page.locator('#summary')).toContainText('OSRM ·', {
    timeout: 15000,
  });
  expect(routes).toEqual([3, count]);
});
test('invalid coordinates cannot enable a stale GPX download', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  await page.locator('#location-1').fill('99, 200');
  await page.locator('#location-1').press('Enter');
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

test('an invalid settings URL leaves every server unchanged', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  const hash = new URL(page.url()).hash;
  await page.locator('.settings > summary').click();
  await page.locator('#valhalla').fill('https://example.org/valhalla');
  await page.locator('#weather-server').fill('https://example.org/weather');
  await page.locator('#nominatim').fill('not a server');
  await page.locator('#save-settings').click();
  await expect(page.locator('#status')).toHaveClass('error');
  await expect(page.locator('#download')).toBeEnabled();
  expect(new URL(page.url()).hash).toBe(hash);
  expect(
    await page.evaluate(() => localStorage.getItem('weather-server')),
  ).toBeNull();
  await page.locator('#nominatim').fill('https://example.org/nominatim');
  await page.locator('#save-settings').click();
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  expect(new URL(page.url()).hash).not.toBe(hash);
  expect(
    await page.evaluate(() => localStorage.getItem('weather-server')),
  ).toBe('https://example.org/weather');
});

test('a v1 route link still opens and is rewritten as a short v2 link', async ({
  page,
}) => {
  await setup(page);
  const state = defaults();
  state.name = 'Legacy link';
  state.points = [
    { name: 'Start', coord: [-22.930929, -43.238286] },
    { name: 'Destination', coord: [-23.05016, -43.53524] },
  ];
  const legacy = encodeStateV1(state);
  await page.goto(base + legacy);
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#location-0')).toHaveValue(start);
  await expect(page.locator('#location-1')).toHaveValue(end);
  await expect(page.locator('#route-name')).toHaveValue('Legacy link');
  await expect(page).toHaveURL(/#v2=/);
  expect(new URL(page.url()).hash.length).toBeLessThan(legacy.length);
});

test.describe('servers suggested by a link', () => {
  const linkWith = (osrm?: string) => {
    const state = defaults();
    state.points = [
      { name: 'Start', coord: [-22.930929, -43.238286] },
      { name: 'Destination', coord: [-23.05016, -43.53524] },
    ];
    if (osrm) state.osrm = osrm;
    return base + encodeState(state);
  };
  const track = (page: Page) => {
    const hosts: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/route/v1/driving/'))
        hosts.push(new URL(r.url()).host);
    });
    return hosts;
  };
  test('open with the default servers until the visitor opts in', async ({
    page,
  }) => {
    await setup(page);
    const hosts = track(page);
    await page.goto(linkWith('https://example.org/osrm'));
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('#server-notice')).toBeVisible();
    await expect(page.locator('#server-notice-text')).toContainText(
      'example.org',
    );
    expect(hosts).toEqual(['router.project-osrm.org']);
    expect(page.url()).not.toContain('example');
    await expect(page.locator('#osrm')).toHaveValue(
      'https://router.project-osrm.org',
    );
    await page.locator('#use-link-servers').click();
    await expect(page.locator('#server-notice')).toBeHidden();
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    expect(hosts.at(-1)).toBe('example.org');
    await expect(page.locator('#osrm')).toHaveValue('https://example.org/osrm');
    await page.locator('#undo').click();
    await expect(page.locator('#osrm')).toHaveValue(
      'https://router.project-osrm.org',
    );
  });
  test('keeping the defaults dismisses the notice without contacting the link server', async ({
    page,
  }) => {
    await setup(page);
    const hosts = track(page);
    await page.goto(linkWith('https://example.org/osrm'));
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    await page.locator('#keep-default-servers').click();
    await expect(page.locator('#server-notice')).toBeHidden();
    await page.locator('#calculate').click();
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    expect(hosts.every((host) => host === 'router.project-osrm.org')).toBe(
      true,
    );
  });
  test('a link with default servers shows no notice', async ({ page }) => {
    await setup(page);
    await page.goto(linkWith());
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('#server-notice')).toBeHidden();
  });
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

test('the chosen language survives the logo link, undo, reloads and shared links', async ({
  page,
}) => {
  await setup(page);
  await fillPair(page);
  const routeStart = await page.locator('#location-0').inputValue();
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.locator('a.brand').click();
  await expect(page.locator('#location-0')).toHaveValue('');
  await expect(page.locator('#language')).toHaveValue('pt');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.locator('#undo').click();
  await expect(page.locator('#location-0')).toHaveValue(routeStart);
  await expect(page.locator('#language')).toHaveValue('pt');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.goto(base);
  await expect(page.locator('#language')).toHaveValue('pt');
  await page.goto(base + encodeState({ ...defaults(), language: 'en' }));
  await expect(page.locator('#language')).toHaveValue('en');
  await page.goto(base);
  await expect(page.locator('#language')).toHaveValue('pt');
  await page.goto(base + 'help.html');
  await expect(page.locator('#language')).toHaveValue('pt');
});
