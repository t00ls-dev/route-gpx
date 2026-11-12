import { expect, test, type Page, type Route } from '@playwright/test';
import { defaults, encodeState, meters, type Coord } from '../src/core';
import { decodePolyline } from '../src/services';
import { chooseUnits } from './unit-settings';

const base = 'http://127.0.0.1:5173/';

/**
 * A mocked Valhalla `/trace_attributes`: one edge between each pair of sent
 * points, gravel between longitude 0.3 and 0.5 and paved elsewhere.
 */
function traceAnswer(body: string) {
  const coords = decodePolyline(JSON.parse(body).encoded_polyline) as Coord[];
  const edges = coords.slice(1).map((c, i) => {
    const middle = (c[1] + coords[i][1]) / 2;
    return {
      length: meters(coords[i], c) / 1000,
      surface: middle > 0.3 && middle < 0.5 ? 'gravel' : 'paved_smooth',
    };
  });
  return {
    edges,
    matched_points: coords.map((_, k) => ({
      type: 'matched',
      edge_index: Math.min(k, edges.length - 1),
      distance_along_edge: k < edges.length ? 0 : 1,
    })),
  };
}

async function setup(page: Page, lon = 1) {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('auto-departure', 'off'));
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  // The road runs east along the equator to the requested destination.
  await page.route('**/route/v1/driving/**', (r) => {
    const to = Number(
      new URL(r.request().url()).pathname.split(';')[1].split(',')[0],
    );
    const count = Math.round(to * 100);
    return r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: [0, 0], distance: 0 },
          { location: [to, 0], distance: 0 },
        ],
        routes: [
          {
            distance: to * 111195,
            duration: to * 3600,
            geometry: {
              coordinates: Array.from({ length: count + 1 }, (_, i) => [
                (i / count) * to,
                0,
              ]),
            },
            legs: [],
          },
        ],
      },
    });
  });
  const state = { ...defaults(), language: 'en' as const };
  state.points = [
    { name: 'Start', coord: [0, 0] },
    { name: 'Destination', coord: [0, lon] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled();
}

async function mockTrace(
  page: Page,
  answer: (route: Route, index: number) => Promise<void> | void = (r) =>
    r.fulfill({ json: traceAnswer(r.request().postData()!) }),
) {
  const requests: { at: number; body: string }[] = [];
  await page.route('**/trace_attributes', (r) => {
    requests.push({ at: Date.now(), body: r.request().postData()! });
    return answer(r, requests.length - 1);
  });
  return requests;
}

test('surface is asked only when opened, totals and stretches translate and convert without another request', async ({
  page,
}) => {
  await setup(page);
  const requests = await mockTrace(page);
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(0);
  await page.locator('#surface > summary').click();
  const totals = page.locator('.surface-totals li');
  await expect(totals).toHaveCount(2);
  // About 89 km paved and 22 km gravel on a 111 km route.
  await expect(totals.nth(0)).toHaveText(/^Paved(8[89]|90)(\.\d)? km · 80%$/);
  await expect(totals.nth(1)).toHaveText(/^Unpaved2[12](\.\d)? km · 20%$/);
  expect(requests).toHaveLength(1);
  // A POST to the Valhalla server with the sent shape and attributes.
  const sent = JSON.parse(requests[0].body);
  expect(sent).toMatchObject({ costing: 'auto', shape_match: 'map_snap' });
  expect(sent.filters.attributes).toContain('edge.surface');
  const sections = page.locator('.surface-section');
  await expect(page.locator('.surface-sections .climbs-heading')).toHaveText(
    'Unpaved stretches (1)',
  );
  await expect(sections).toHaveText(/^km 33\.\d · 2[12](\.\d)? km · Unpaved$/);
  await sections.first().click();
  await expect(sections.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('path.surface-line')).toHaveCount(1);
  await expect(page.locator('#surface')).toContainText(
    'Roads without a mapped surface count as paved',
  );
  await chooseUnits(page, { distance: 'imperial' });
  await expect(totals.nth(1)).toContainText(' mi · 20%');
  await page.locator('#language').selectOption('pt');
  await expect(totals.nth(1)).toContainText('Sem asfalto');
  await expect(sections.first()).toContainText('Sem asfalto');
  await expect(page.locator('#surface > summary')).toHaveText('Pavimento');
  // Closing hides the stretch on the map; reopening uses the answer kept.
  await page.locator('#surface > summary').click();
  await expect(page.locator('path.surface-line')).toHaveCount(0);
  await page.locator('#surface > summary').click();
  await expect(totals).toHaveCount(2);
  expect(requests).toHaveLength(1);
});

test('the Surface coloring asks on its own choice and shows only the surfaces present', async ({
  page,
}) => {
  await setup(page);
  const requests = await mockTrace(page);
  await page.locator('#layers-toggle').click();
  await page.locator('[data-coloring="surface"]').click();
  await expect(
    page.locator('path.route-coloring-unpaved').first(),
  ).toBeAttached();
  await expect(
    page.locator('path.route-coloring-paved').first(),
  ).toBeAttached();
  await expect(page.locator('.route-legend > span')).toHaveText([
    'Paved',
    'Unpaved',
  ]);
  expect(requests).toHaveLength(1);
});

test('a long route is asked in spaced pieces and a failed piece shows as unknown', async ({
  page,
}) => {
  // About 445 km: three pieces of up to 190 km.
  await setup(page, 4);
  const requests = await mockTrace(page, (r, i) =>
    i === 1
      ? r.fulfill({ status: 503 })
      : r.fulfill({ json: traceAnswer(r.request().postData()!) }),
  );
  await page.locator('#surface > summary').click();
  await expect(page.locator('.surface-totals')).toBeVisible({ timeout: 15000 });
  expect(requests).toHaveLength(3);
  // Serialized on the routing queue, at least 1.5 s apart.
  for (let i = 1; i < requests.length; i++)
    expect(requests[i].at - requests[i - 1].at).toBeGreaterThanOrEqual(1400);
  await expect(page.locator('#surface')).toContainText(
    'Surface unavailable for part of the route.',
  );
  await expect(page.locator('.surface-totals')).toContainText('Unknown');
});

test('editing a point asks again only for the pieces that changed', async ({
  page,
}) => {
  await setup(page, 4);
  const requests = await mockTrace(page);
  await page.locator('#surface > summary').click();
  await expect(page.locator('.surface-totals')).toBeVisible({ timeout: 15000 });
  expect(requests).toHaveLength(3);
  // The same road comes back: every piece is in the page-memory cache.
  await page.locator('#location-1').fill('0, 4.0000001');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#surface-status')).toHaveText('Loading surface…');
  await expect(page.locator('.surface-totals')).toBeVisible({ timeout: 10000 });
  expect(requests).toHaveLength(3);
});

test('an answer for an older route is discarded', async ({ page }) => {
  await setup(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const requests = await mockTrace(page, async (r, i) => {
    if (i === 0) await held;
    return r.fulfill({ json: traceAnswer(r.request().postData()!) });
  });
  await page.locator('#surface > summary').click();
  await expect.poll(() => requests.length).toBe(1);
  // A new route while the first answer is pending.
  await page.locator('#location-1').fill('0, 0.5');
  await page.locator('#location-1').press('Tab');
  release();
  await expect(page.locator('.surface-totals')).toBeVisible({ timeout: 10000 });
  // Only the new route's surface: about 55 km, gravel from 33 to 55 km.
  await expect(page.locator('.surface-totals li').nth(1)).toHaveText(
    /^Unpaved2[12](\.\d)? km · 40%$/,
  );
  expect(requests).toHaveLength(2);
});

for (const width of [320, 360, 390, 430, 1280])
  for (const language of ['en', 'pt'] as const)
    test(`surface rows stay on one line at ${width}px in ${language}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await setup(page);
      await mockTrace(page);
      await chooseUnits(page, { distance: 'imperial' });
      await page.locator('#language').selectOption(language);
      if (width < 760 && !(await page.locator('#route-panel').isVisible()))
        await page.locator('#panel-toggle').click();
      await page.locator('#surface > summary').click();
      await expect(page.locator('.surface-totals li')).toHaveCount(2);
      const lines = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.surface-totals li > span, .surface-section .climb-grid > span:last-child',
          ),
        ].map((e) => {
          const r = document.createRange();
          r.selectNodeContents(e);
          return r.getClientRects().length > 0
            ? new Set([...r.getClientRects()].map((x) => Math.round(x.top)))
                .size
            : 1;
        }),
      );
      for (const count of lines) expect(count).toBe(1);
    });
