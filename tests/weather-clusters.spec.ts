import { expect, test, type Page } from '@playwright/test';
import { defaults, encodeState } from '../src/core';
import { chooseUnits } from './unit-settings';

const base = 'http://127.0.0.1:5173/';
// A winding road of about 390 km, so the whole-route view clusters markers.
const road: [number, number][] = [];
for (let i = 0; i <= 240; i++) {
  const f = i / 240;
  road.push([
    -43.2 - 3.4 * f + 0.05 * Math.cos(f * Math.PI * 7),
    -22.9 - 0.65 * f + 0.12 * Math.sin(f * Math.PI * 5),
  ]);
}
// Two alerts of different severity: heavy rain (sample 8) and a thunderstorm
// with strong gusts (sample 5); the rest is mild.
const codes = [0, 2, 3, 1, 0, 95, 3, 2, 63, 2, 0, 3];
function forecast(url: URL) {
  const start = Date.parse(url.searchParams.get('start_hour')! + ':00Z');
  const end = Date.parse(url.searchParams.get('end_hour')! + ':00Z');
  const time = Array.from(
    { length: Math.round((end - start) / 3600000) + 1 },
    (_, i) => start / 1000 + i * 3600,
  );
  return url.searchParams
    .get('latitude')!
    .split(',')
    .map((_, n) => {
      const code = codes[n % codes.length];
      return {
        utc_offset_seconds: 0,
        hourly: {
          time,
          temperature_2m: time.map(() => 18 + ((n * 7) % 13)),
          precipitation_probability: time.map(() => (code >= 61 ? 70 : 5)),
          precipitation: time.map(() => (code >= 61 ? 4 : 0)),
          weather_code: time.map(() => code),
          wind_speed_10m: time.map(() => [8, 15.5, 22, 31.4, 12, 99.9][n % 6]),
          wind_direction_10m: time.map(() => (n * 47) % 360),
          wind_gusts_10m: time.map(() => (code === 95 ? 110 : 25)),
          visibility: time.map(() => 20000),
          uv_index: time.map(() => 3),
        },
      };
    });
}
async function open(page: Page, language: 'en' | 'pt') {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('auto-departure', 'off'));
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('**/v1/forecast?**', (r) =>
    r.fulfill({ json: forecast(new URL(r.request().url())) }),
  );
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: road[0], distance: 0 },
          { location: road.at(-1), distance: 0 },
        ],
        routes: [
          {
            distance: 394000,
            duration: 18000,
            geometry: { coordinates: road },
            legs: [{ steps: [] }],
          },
        ],
      },
    }),
  );
  const state = { ...defaults(), language };
  state.points = [
    { name: 'Rio de Janeiro', coord: [road[0][1], road[0][0]] },
    { name: 'São Paulo', coord: [road.at(-1)![1], road.at(-1)![0]] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await page.locator('#weather-section > summary').click();
  await page.locator('#departure').fill('2026-11-08T10:00');
  await page.locator('#departure').press('Tab');
  await expect(page.locator('.weather-card')).toHaveCount(11);
  // On phones, lower the bottom sheet so the map shows; the side panel stays.
  if (page.viewportSize()!.width < 760)
    await page.locator('#panel-toggle').click();
  await page.locator('#fit').click();
}
/** What the map shows: visible markers, their counts and the layout boxes. */
function layout(page: Page) {
  return page.evaluate(() => {
    const boxes = (e: Element, selector: string) =>
      [...e.querySelectorAll(selector)].map((p) => p.getBoundingClientRect());
    const markers = [
      ...document.querySelectorAll('.leaflet-marker-icon.weather-marker'),
    ];
    const visible = markers.filter(
      (m) => getComputedStyle(m).display !== 'none',
    );
    return {
      total: markers.length,
      visible: visible.map((m) => ({
        card: m.getAttribute('aria-controls')!,
        parts: boxes(m, '.weather-marker-symbol, .weather-marker-wind').map(
          (r) => [r.left, r.top, r.right, r.bottom],
        ),
        count: (() => {
          const c = m.querySelector<HTMLElement>(
            '.weather-marker-count:not([hidden])',
          );
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return {
            n: Number(c.textContent!.slice(1)),
            alerts: c.classList.contains('has-alerts'),
            box: [r.left, r.top, r.right, r.bottom],
          };
        })(),
        note: document.getElementById(m.getAttribute('aria-describedby')!)!
          .textContent,
      })),
      pins: [...document.querySelectorAll('.route-marker')].map((p) => {
        const r = p.getBoundingClientRect();
        return [r.left, r.top, r.right, r.bottom];
      }),
    };
  });
}
type Box = number[];
const hit = (a: Box, b: Box) =>
  a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
/** The card of the thunderstorm, the worst sample. */
const storm = (page: Page) =>
  page.locator('.weather-card', {
    has: page.locator('.icon-weather-thunderstorm'),
  });

for (const [width, language] of [
  [320, 'pt'],
  [390, 'en'],
  [430, 'pt'],
  [1280, 'en'],
] as const)
  test(`weather markers cluster without overlapping at ${width}px (${language})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, language);
    if (width === 430) await chooseUnits(page, { distance: 'imperial' });
    await expect
      .poll(async () => (await layout(page)).visible.length)
      .toBeLessThan(11);
    const map = await layout(page);
    // No two visible markers touch, and no count covers a pin or a marker.
    for (const [i, a] of map.visible.entries()) {
      for (const b of map.visible.slice(i + 1))
        for (const pa of a.parts)
          for (const pb of b.parts) expect(hit(pa, pb)).toBe(false);
      if (!a.count) continue;
      for (const pin of map.pins) expect(hit(a.count.box, pin)).toBe(false);
      for (const b of map.visible)
        if (b !== a)
          for (const part of b.parts)
            expect(hit(a.count.box, part)).toBe(false);
    }
    // Every hidden sample is counted exactly once.
    const counted = map.visible.reduce((sum, m) => sum + (m.count?.n ?? 0), 0);
    expect(counted + map.visible.length).toBe(map.total);
    // The thunderstorm, the worst alert, always shows.
    const stormCard = await storm(page).getAttribute('id');
    const shownStorm = map.visible.find((m) => m.card === stormCard);
    expect(shownStorm).toBeDefined();
    if (shownStorm!.count) {
      expect(shownStorm!.note).toContain(
        language === 'pt' ? 'nenhuma pior' : 'none worse',
      );
    }
  });

test('a count rings hidden alerts, zooms in when tapped, and markers then show on their own', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, 'en');
  const before = await layout(page);
  const stormCard = await storm(page).getAttribute('id');
  const shownStorm = before.visible.find((m) => m.card === stormCard)!;
  // The heavy rain alert hides inside the thunderstorm's cluster.
  expect(shownStorm.count?.alerts).toBe(true);
  expect(shownStorm.note).toMatch(
    /^\d+ more samples here, none worse · 2 of \d+ with alerts · Zoom in to see them$/,
  );
  // A count without hidden alerts has no ring.
  for (const m of before.visible)
    if (m.count && !/ with alerts/.test(m.note!))
      expect(m.count.alerts).toBe(false);
  // Tapping counts zooms in until every sample has its own marker.
  for (let i = 0; i < 8; i++) {
    const count = page.locator('.weather-marker-count:not([hidden])').first();
    if (!(await count.count())) break;
    const shown = (await layout(page)).visible.length;
    await count.click();
    await expect
      .poll(async () => (await layout(page)).visible.length)
      .toBeGreaterThan(shown);
  }
  const after = await layout(page);
  expect(after.visible).toHaveLength(11);
  expect(after.visible.every((m) => !m.count && m.note === '')).toBe(true);
});

test('a hidden sample is not focusable, and its card shows it on the map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, 'pt');
  // The whole route on a desktop already clusters some samples.
  await expect
    .poll(async () => (await layout(page)).visible.length)
    .toBeLessThan(11);
  const card = await page
    .locator('.leaflet-marker-icon.weather-marker-clustered')
    .first()
    .getAttribute('aria-controls');
  // By its card: a locator for "the first clustered marker" would move on.
  const marker = page.locator(
    `.leaflet-marker-icon.weather-marker[aria-controls="${card}"]`,
  );
  await expect(marker).toBeHidden();
  await marker.evaluate((e) => (e as HTMLElement).focus());
  await expect(marker).not.toBeFocused();
  await page.locator(`#${card}`).click();
  await expect(marker).toBeVisible();
  await expect(marker).not.toHaveClass(/weather-marker-clustered/);
  await expect(marker).toBeFocused();
});

test('a loop with stops that comes back near itself shows no overlapping markers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 760 });
  // Rio de Janeiro round trip with four stops; the way back runs near the start.
  const stops: [number, number][] = [
    [-22.9, -43.2],
    [-22.79, -43.31],
    [-22.52, -44.1],
    [-22.41, -42.97],
    [-22.74, -42.86],
    [-22.9, -43.17],
  ];
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('auto-departure', 'off'));
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('**/v1/forecast?**', (r) =>
    r.fulfill({ json: forecast(new URL(r.request().url())) }),
  );
  await page.route('**/route/v1/driving/**', (r) => {
    const part = new URL(r.request().url()).pathname.split('/driving/')[1];
    const points = part.split(';').map((p) => p.split(',').map(Number));
    const coordinates: number[][] = [];
    for (let i = 0; i + 1 < points.length; i++)
      for (let k = 0; k < 40; k++) {
        const f = k / 40;
        coordinates.push([
          points[i][0] + (points[i + 1][0] - points[i][0]) * f,
          points[i][1] + (points[i + 1][1] - points[i][1]) * f,
        ]);
      }
    coordinates.push(points.at(-1)!);
    return r.fulfill({
      json: {
        code: 'Ok',
        waypoints: points.map((location) => ({ location, distance: 0 })),
        routes: [
          {
            distance: 420000,
            duration: 21000,
            geometry: { coordinates },
            legs: points.slice(1).map(() => ({ steps: [] })),
          },
        ],
      },
    });
  });
  const state = { ...defaults(), language: 'pt' as const };
  state.points = stops.map((coord, i) => ({ name: `Point ${i}`, coord }));
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
  await page.locator('#weather-section > summary').click();
  await page.locator('#departure').fill('2026-11-08T10:00');
  await page.locator('#departure').press('Tab');
  await expect(page.locator('.weather-card').first()).toBeVisible();
  await page.locator('#panel-toggle').click();
  await page.locator('#fit').click();
  for (let zoomOut = 0; zoomOut < 2; zoomOut++) {
    if (zoomOut) {
      await page.locator('#map').focus();
      await page.keyboard.press('Minus');
      await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
      await page.waitForTimeout(400);
    }
    const map = await layout(page);
    for (const [i, a] of map.visible.entries())
      for (const b of map.visible.slice(i + 1))
        for (const pa of a.parts)
          for (const pb of b.parts) expect(hit(pa, pb)).toBe(false);
    const counted = map.visible.reduce((sum, m) => sum + (m.count?.n ?? 0), 0);
    expect(counted + map.visible.length).toBe(map.total);
  }
});
