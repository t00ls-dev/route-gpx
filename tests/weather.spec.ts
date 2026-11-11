import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaults, decodeState, encodeState } from '../src/core';
import { weatherResponse } from './weather-fixture';
import { chooseUnits } from './unit-settings';
const base = 'http://127.0.0.1:5173/';
const gpx =
  '<gpx><trk><name>Weather route</name><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg></trk></gpx>';
async function setup(
  page: Page,
  routed = false,
  speed: number | null = 60,
  longNames = false,
  automatic = false,
) {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  // Most tests check a departure the user chooses; the automatic one has its own.
  if (!automatic)
    await page.addInitScript(() =>
      localStorage.setItem('auto-departure', 'off'),
    );
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('**/v1/forecast?**', (r) =>
    r.fulfill({ json: weatherResponse(new URL(r.request().url())) }),
  );
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: [0, 0], distance: 0 },
          { location: [1, 0], distance: 0 },
        ],
        routes: [
          {
            distance: 111195,
            duration: 7200,
            geometry: {
              coordinates: [
                [0, 0],
                [1, 0],
              ],
            },
            legs: [],
          },
        ],
      },
    }),
  );
  // The average speed is a device preference; null keeps the 60 km/h default.
  if (speed !== null)
    await page.addInitScript(
      (value) => localStorage.setItem('average-speed', String(value)),
      speed,
    );
  const state = { ...defaults(), language: 'en' as const };
  if (routed)
    state.points = [
      { name: longNames ? 'A'.repeat(240) : 'Start', coord: [0, 0] },
      { name: longNames ? 'B'.repeat(240) : 'Destination', coord: [0, 1] },
    ];
  await page.goto(base + encodeState(state));
  if (!routed)
    await page.locator('#import').setInputFiles({
      name: 'weather.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(gpx),
    });
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#weather-section > summary').click();
}
async function date(page: Page, value = '2026-11-08T10:00') {
  await page.locator('#departure').fill(value);
  await page.locator('#departure').press('Tab');
}
async function fetchWeather(page: Page) {
  await expect(page.locator('#weather-result')).toBeVisible();
}
for (const mobile of [false, true])
  test(`automatic weather, keyboard and translations: ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await setup(page, true);
    let calls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/v1/forecast?')) calls++;
    });
    await expect(page.locator('#weather-section a')).toHaveCount(0);
    await expect(page.locator('.map-credits-dialog')).toContainText(
      'Weather data by Open-Meteo',
    );
    await expect(page.locator('#weather-fetch')).toHaveCount(0);
    await expect(page.locator('#weather-stops')).toHaveCount(0);
    await expect(page.locator('#weather-timezone')).toHaveCount(0);
    await expect(page.locator('#weather-privacy')).toHaveCount(0);
    await date(page);
    await fetchWeather(page);
    expect(calls).toBe(1);
    await expect(page.locator('#weather-details').first()).toContainText(
      'Heavy rain',
    );
    await expect(page.locator('.weather-item')).toHaveCount(0);
    await expect(page.locator('#weather-details li')).toHaveCount(7);
    expect(
      await page
        .locator('#weather-details')
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
    ).toBe(true);
    await expect(page.locator('#weather-alerts')).toHaveCount(0);
    await expect(page.locator('.weather-card')).toHaveCount(7);
    await expect(page.locator('.weather-card').first()).toHaveAttribute(
      'data-severity',
      '3',
    );
    await expect(page.locator('.weather-card-severity').first()).toHaveText(
      'Alert 3',
    );
    // UV 7 from the fixture: shown with its WHO category, below the alert threshold.
    await expect(page.locator('.weather-card-uv').first()).toHaveText(
      'UV 7 · High',
    );
    await expect(page.locator('#weather-details').first()).not.toContainText(
      'Very high UV',
    );
    await expect(page.locator('.weather-marker')).toHaveCount(7);
    const marker = page.locator('.weather-marker').first();
    await expect(marker).toHaveAttribute('aria-label', /View weather.*Nov.*km/);
    expect(await marker.getAttribute('aria-label')).not.toContain('Start');
    await page.locator('#weather-section > summary').click();
    await page.locator('#panel-toggle').click();
    await marker.focus();
    await page.keyboard.press('Enter');
    const firstCard = page.locator('.weather-card').first();
    await expect(firstCard).toBeFocused();
    await expect(firstCard).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#weather-section')).toHaveAttribute('open', '');
    await expect(page.locator('#route-panel')).toBeVisible();
    await expect(page.locator('.weather-tooltip,.leaflet-popup')).toHaveCount(
      0,
    );
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#weather-details').first()).toContainText(
      'Chuva forte',
    );
    await expect(page.locator('.weather-card-severity').first()).toHaveText(
      'Alerta 3',
    );
    await expect(page.locator('.weather-card-uv').first()).toHaveText(
      'UV 7 · alto',
    );
    await expect(page.locator('#summary .stats-basis')).toHaveText(
      'A 60 km/h · sem paradas',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#summary .stats-basis')).toHaveText(
      'At 60 km/h · no stops',
    );
    expect(calls).toBe(1);
  });
test('daylight shows today without a departure, dark sections for an evening departure and translates', async ({
  page,
}) => {
  await setup(page, true);
  let routes = 0;
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/')) routes++;
  });
  const line = page.locator('#daylight-summary .daylight-line');
  await expect(line).toContainText(
    /Today at the start: Sunrise \d\d:\d\d [AP]M Sunset \d\d:\d\d [AP]M/,
  );
  await expect(page.locator('#daylight-summary')).toContainText(
    'Choose a departure date to see dark sections.',
  );
  await expect(page.locator('#daylight-details')).toBeHidden();
  // About 1 h 51 min at 60 km/h from 16:30 UTC; the equator gets dark near 18:06.
  await date(page, '2026-11-08T16:30');
  await expect(line).toContainText(
    /Sunrise \d\d:\d\d [AP]M Sunset \d\d:\d\d [AP]M · [\d.]+ km in the dark/,
  );
  const details = page.locator('#daylight-details');
  await expect(details).toBeVisible();
  await expect(details).toContainText(
    /Dark from [\d.]+ km \(.+\) to 111\.2 km/,
  );
  await expect(details).toContainText(/Leave by .+ to arrive before sunset\./);
  // 1 h 51 min at the 60 km/h set by the test, after a 16:30 UTC departure.
  await expect(page.locator('#summary dt')).toHaveText([
    'Distance',
    'Time',
    'Arrival',
  ]);
  await expect(page.locator('#summary dd').nth(2)).toHaveText('06:21 PM');
  await expect(page.locator('#summary')).toContainText('At 60 km/h · no stops');
  await expect(details).toContainText(
    /Daylight at the start from \d\d:\d\d [AP]M\./,
  );
  await date(page, '2026-11-08T10:00');
  await expect(line).toContainText('None in the dark');
  await expect(details).not.toContainText('Dark from');
  await page.locator('#language').selectOption('pt');
  await expect(line).toContainText(
    /Nascer do sol \d\d:\d\d Pôr do sol \d\d:\d\d · Nada no escuro/,
  );
  await expect(details).toContainText('Luz do dia');
  await expect(page.locator('#summary dt').nth(2)).toHaveText('Chegada');
  await expect(details).toContainText(
    /Saia até .+ para chegar antes do pôr do sol\./,
  );
  await page.locator('#language').selectOption('en');
  await expect(line).toContainText('None in the dark');
  expect(routes).toBe(0);
});
test('route coloring by daylight needs a departure, colors dark stretches, persists and translates', async ({
  page,
}) => {
  await setup(page, true);
  let routes = 0;
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/')) routes++;
  });
  const daylight = page.locator('[data-coloring=daylight]');
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#coloring-heading')).toHaveText('Route coloring');
  await expect(daylight).toHaveAttribute('aria-disabled', 'true');
  await expect(daylight).toContainText('Choose a departure date');
  await expect(page.locator('path.route-coloring')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // About 1 h 51 min at 60 km/h from 16:30 UTC; the equator gets dark near 18:06.
  await date(page, '2026-11-08T16:30');
  await page.locator('#layers-toggle').click();
  await expect(daylight).toHaveAttribute('aria-disabled', 'false');
  await daylight.click();
  await expect(daylight).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('path.route-coloring-day').first()).toBeAttached();
  await expect(
    page.locator('path.route-coloring-night').first(),
  ).toBeAttached();
  await expect(page.locator('.route-legend')).toHaveText(
    /Day\s*Twilight\s*Dark/,
  );
  // A device preference: kept across reloads, never in the link.
  expect(new URL(page.url()).hash).not.toContain('daylight');
  expect(routes).toBe(0);
  await page.reload();
  await expect(page.locator('#download')).toBeEnabled();
  // Reopening the link routes once, as always; coloring adds no request.
  routes = 0;
  await expect(
    page.locator('path.route-coloring-night').first(),
  ).toBeAttached();
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('.route-legend')).toHaveText(
    /Dia\s*Crepúsculo\s*Escuro/,
  );
  await page.locator('#layers-toggle').click();
  await expect(page.locator('#coloring-heading')).toHaveText('Colorir a rota');
  await page.locator('[data-coloring=none]').click();
  await expect(page.locator('path.route-coloring')).toHaveCount(0);
  await expect(page.locator('.route-legend')).toBeHidden();
  expect(routes).toBe(0);
});
test('elevation is requested only when opened, shows stats and the map cursor, and converts units without refetching', async ({
  page,
}) => {
  await setup(page, true);
  // Registered after setup so it takes precedence over its catch-all route.
  let fail = true;
  const requests: URL[] = [];
  await page.route('**/v1/elevation?**', (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    if (fail) return r.fulfill({ status: 500 });
    // Elevation rises with longitude: 0 m at the start, 1,000 m at the end.
    const lons = url.searchParams.get('longitude')!.split(',').map(Number);
    return r.fulfill({ json: { elevation: lons.map((lon) => lon * 1000) } });
  });
  await page.waitForTimeout(300);
  expect(requests).toHaveLength(0);
  await page.locator('#elevation > summary').click();
  await expect(page.locator('#elevation-status')).toHaveText(
    'Elevation unavailable. Try again.',
  );
  fail = false;
  await page.locator('#elevation-retry').click();
  await expect(page.locator('#elevation-stats')).toContainText(
    'Min 0 m · Max 1,000 m · Avg 500 m',
  );
  await expect(page.locator('#elevation-stats')).toContainText(
    'Elevation gain 1,000 m · Elevation loss 0 m',
  );
  await expect(page.locator('#elevation-stats')).toContainText(
    'Elevation estimated from terrain. See the help.',
  );
  await expect(page.locator('#elevation-stats a')).toHaveAttribute(
    'href',
    /^\.\/help\.html\?lang=en&section=elevation#v2=/,
  );
  // About 300 samples in chunks of 100, plus the failed first attempt.
  expect(requests.length).toBeLessThanOrEqual(5);
  const count = requests.length;
  const chart = (await page.locator('.elevation-frame').boundingBox())!;
  await page.mouse.move(chart.x + chart.width / 2, chart.y + chart.height / 2);
  await expect(page.locator('path.elevation-cursor')).toHaveCount(1);
  // Halfway along a steady climb from 0 to 1,000 m: about 500 m gained so far.
  await expect(page.locator('.elevation-readout')).toContainText(
    /Gain so far (4|5)\d\d m · Loss so far 0 m/,
  );
  await chooseUnits(page, { distance: 'imperial' });
  await expect(page.locator('#elevation-stats')).toContainText('Max 3,281 ft');
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#elevation-stats')).toContainText('Mín 0 ft');
  await expect(page.locator('#elevation-stats')).toContainText(
    'Ganho de elevação 3.281 ft',
  );
  await expect(page.locator('#elevation-stats')).toContainText(
    'Altitude estimada pelo relevo. Veja a ajuda.',
  );
  expect(requests).toHaveLength(count);
});
test('the automatic departure follows the next half hour until the user chooses one', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-07T10:07:00Z') });
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  const forecasts: URL[] = [];
  await page.route('**/v1/forecast?**', (r) => {
    forecasts.push(new URL(r.request().url()));
    return r.fulfill({ json: weatherResponse(new URL(r.request().url())) });
  });
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: [0, 0], distance: 0 },
          { location: [1, 0], distance: 0 },
        ],
        routes: [
          {
            distance: 111195,
            duration: 7200,
            geometry: {
              coordinates: [
                [0, 0],
                [1, 0],
              ],
            },
            legs: [],
          },
        ],
      },
    }),
  );
  const state = { ...defaults(), language: 'en' as const };
  state.points = [
    { name: 'Start', coord: [0, 0] },
    { name: 'Destination', coord: [0, 1] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled();
  // 10:07 UTC (the test browser's time zone) leaves at 10:30, automatically.
  await expect(page.locator('#departure')).toHaveValue('2026-11-07T10:30');
  await expect(page.locator('#auto-departure')).toBeChecked();
  await expect(page.locator('#summary dt')).toHaveText([
    'Distance',
    'Time',
    'Arrival',
  ]);
  await page.locator('#weather-section > summary').click();
  await expect(page.locator('#weather-result')).toBeVisible();
  expect(forecasts).toHaveLength(1);
  // Never written to the link.
  expect(decodeState(new URL(page.url()).hash).departure).toBeUndefined();

  // Half an hour later it moves to 11:00 and refreshes the weather.
  await page.clock.fastForward(30 * 60_000);
  await expect(page.locator('#departure')).toHaveValue('2026-11-07T11:00');
  await expect(page.locator('#weather-result')).toBeVisible();
  expect(forecasts).toHaveLength(2);

  // Choosing the same time fixes it: it no longer moves.
  await page.locator('#departure').fill('2026-11-07T11:00');
  await page.locator('#departure').press('Tab');
  await expect(page.locator('#auto-departure')).not.toBeChecked();
  expect(decodeState(new URL(page.url()).hash).departure).toBe(
    '2026-11-07T11:00:00.000Z',
  );
  await page.clock.fastForward(30 * 60_000);
  await expect(page.locator('#departure')).toHaveValue('2026-11-07T11:00');

  // Checking Automatic departure again returns to the next half hour.
  await page.locator('#auto-departure').check();
  await expect(page.locator('#departure')).toHaveValue('2026-11-07T11:30');
  expect(decodeState(new URL(page.url()).hash).departure).toBeUndefined();

  // Clearing turns it off: no new time and no request until reload.
  const before = forecasts.length;
  await page.locator('#departure').fill('');
  await page.locator('#departure').press('Tab');
  await expect(page.locator('#auto-departure')).not.toBeChecked();
  // Weather explains why it is empty.
  await expect(page.locator('#weather-status')).toHaveText(
    'Choose a departure to see the weather along the route. Choose departure',
  );
  // The link takes the user to the departure field.
  await page
    .locator('#weather-status')
    .getByRole('button', { name: 'Choose departure' })
    .click();
  await expect(page.locator('#departure')).toBeFocused();
  await page.locator('#departure').blur();
  await page.clock.fastForward(30 * 60_000);
  await expect(page.locator('#departure')).toHaveValue('');
  expect(forecasts).toHaveLength(before);

  // A link with its own departure keeps it; Portuguese labels.
  await page.goto(
    base +
      encodeState({
        ...state,
        language: 'pt',
        departure: '2026-11-08T15:00:00.000Z',
      }),
  );
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#departure')).toHaveValue('2026-11-08T15:00');
  await expect(page.locator('#auto-departure')).not.toBeChecked();
  await expect(page.locator('label.departure-automatic')).toHaveText(
    'Saída automática',
  );
});
test('departure changes keep the field in place without scroll anchoring', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, true, 60, false, true);
  await fetchWeather(page);
  // Like Safari, which does not compensate for content resized above.
  await page.addStyleTag({
    content: '* { overflow-anchor: none !important; }',
  });
  const box = page.locator('#auto-departure');
  await box.scrollIntoViewIfNeeded();
  const top = (locator = box) =>
    locator.evaluate((e) => Math.round(e.getBoundingClientRect().top));
  const before = await top();
  await box.uncheck();
  await expect(page.locator('#weather-result')).toBeHidden();
  await expect.poll(() => top()).toBe(before);
  await box.check();
  await expect.poll(() => top()).toBe(before);
  const field = page.locator('#departure');
  const fieldTop = await top(field);
  await field.fill('');
  await field.press('Tab');
  await expect.poll(() => top(field)).toBe(fieldTop);
});
test('the automatic departure can be turned off on the device', async ({
  page,
}) => {
  await setup(page, true, 60, false, true);
  // setup opened Weather; the automatic departure already requested it.
  await expect(page.locator('#departure')).toHaveValue('2026-11-07T10:00');
  await expect(page.locator('#weather-result')).toBeVisible();
  await page.locator('#auto-departure').uncheck();
  await expect(page.locator('#departure')).toHaveValue('');
  await expect(page.locator('#weather-result')).toBeHidden();
  await expect(page.locator('#weather-status')).toHaveText(
    'Choose a departure to see the weather along the route. Choose departure',
  );
  await page.reload();
  await expect(page.locator('#download')).toBeEnabled();
  await expect(page.locator('#departure')).toHaveValue('');
  await expect(page.locator('#auto-departure')).not.toBeChecked();
});
test('routes with more than 20 stops still get weather', async ({ page }) => {
  await setup(page);
  // 23 named waypoints (the import maximum) plus start and destination.
  const wpts = Array.from(
    { length: 23 },
    (_, i) =>
      `<wpt lat="0" lon="${((i + 1) / 24).toFixed(5)}"><name>Town ${i + 1}</name></wpt>`,
  ).join('');
  const track = Array.from(
    { length: 25 },
    (_, i) => `<trkpt lat="0" lon="${(i / 24).toFixed(5)}"/>`,
  ).join('');
  await page.locator('#import').setInputFiles({
    name: 'towns.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      `<gpx><trk><name>Towns</name><trkseg>${track}</trkseg></trk>${wpts}</gpx>`,
    ),
  });
  await expect(page.locator('#points li')).toHaveCount(25);
  await date(page);
  await fetchWeather(page);
  await expect(page.locator('.weather-card')).toHaveCount(20);
  await expect(page.locator('#weather-status')).toHaveText(
    'Weather sampled at 20 of 25 stops.',
  );
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#weather-status')).toHaveText(
    'Clima amostrado em 20 de 25 paradas.',
  );
});
test('climbs are listed, shaded in the chart and shown on the map', async ({
  page,
}) => {
  await setup(page, true);
  // Flat at 100 m, a 500 m climb between longitude 0.40 and 0.45 (about 9%),
  // then flat again: one climb near km 44.
  await page.route('**/v1/elevation?**', (r) => {
    const lons = new URL(r.request().url()).searchParams
      .get('longitude')!
      .split(',')
      .map(Number);
    const ele = (lon: number) =>
      100 + 500 * Math.min(1, Math.max(0, (lon - 0.4) / 0.05));
    return r.fulfill({ json: { elevation: lons.map(ele) } });
  });
  await date(page);
  await page.locator('#elevation > summary').click();
  const climbs = page.locator('.climbs .climb');
  await expect(page.locator('.climbs-heading')).toHaveText('Climbs (1)');
  await expect(climbs).toHaveCount(1);
  // Position, length, gain, average and steepest grade, then passage time.
  await expect(climbs.first()).toHaveText(
    /^km 4[45]\.\d · [56](\.\d)? km · \+(49\d|500) m · (9|8\.\d|9\.\d)% · max (9|1\d)(\.\d)?% · \d\d:\d\d( [AP]M)?Hardest$/,
  );
  await expect(page.locator('rect.elevation-climb')).toHaveCount(1);
  await expect(page.locator('path.climb-line')).toHaveCount(0);
  await climbs.first().click();
  await expect(climbs.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('rect.elevation-climb.selected')).toHaveCount(1);
  await expect(page.locator('path.climb-line')).toHaveCount(1);
  await expect(page.locator('.climb-summit svg')).toHaveCount(1);
  // Units and language re-render without a new request.
  await chooseUnits(page, { distance: 'imperial' });
  await expect(climbs.first()).toContainText('mi 2');
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('.climbs-heading')).toHaveText('Subidas (1)');
  await expect(climbs.first()).toContainText('máx');
  // The hardest climb: a summit icon on the row, its name for screen readers.
  await expect(climbs.first().locator('svg.climb-mark')).toHaveCount(1);
  await expect(climbs.first().locator('.sr-only')).toHaveText('Mais difícil');
  // Closing Elevation removes the highlight from the map.
  await page.locator('#elevation > summary').click();
  await expect(page.locator('path.climb-line')).toHaveCount(0);
});
test('a recalculated route waits to settle and reuses cached elevation', async ({
  page,
}) => {
  await setup(page, true);
  const requests: string[] = [];
  await page.route('**/v1/elevation?**', (r) => {
    requests.push(r.request().url());
    const count = new URL(r.request().url()).searchParams
      .get('longitude')!
      .split(',').length;
    return r.fulfill({ json: { elevation: Array(count).fill(80) } });
  });
  await page.locator('#elevation > summary').click();
  await expect(page.locator('#elevation-stats')).toContainText('Min 80 m');
  const first = requests.length;
  expect(first).toBeGreaterThan(0);
  // Editing a point recalculates the route (the mock returns the same road):
  // the row waits for the route to settle, then every sample is cached.
  await page.locator('#location-1').fill('0, 1.0000001');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#elevation-status')).toHaveText(
    'Loading elevation…',
  );
  await expect(page.locator('#elevation-stats')).toContainText('Min 80 m', {
    timeout: 10000,
  });
  expect(requests).toHaveLength(first);
});
test('a usage limit counts down, retries once by itself, then offers the button', async ({
  page,
}) => {
  await setup(page, true);
  let refusals = 2;
  const requests: string[] = [];
  await page.route('**/v1/elevation?**', (r) => {
    requests.push(r.request().url());
    if (refusals-- > 0)
      // Exposed, as a cross-origin script can only read exposed headers.
      return r.fulfill({
        status: 429,
        headers: {
          'Retry-After': '2',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Retry-After',
        },
      });
    const count = new URL(r.request().url()).searchParams
      .get('longitude')!
      .split(',').length;
    return r.fulfill({ json: { elevation: Array(count).fill(70) } });
  });
  await page.locator('#elevation > summary').click();
  const status = page.locator('#elevation-status');
  // A live countdown and no button while waiting.
  await expect(status).toHaveText(
    'Elevation usage limit reached. Try again in 2s.',
  );
  await expect(page.locator('#elevation-retry')).toBeHidden();
  await expect(status).toHaveText(
    'Elevation usage limit reached. Try again in 1s.',
  );
  // It retried once on its own, was refused again, counted down again and
  // only then offers the button: two requests, no third attempt.
  await expect(page.locator('#elevation-retry')).toBeVisible({
    timeout: 10000,
  });
  await expect(status).toHaveText('Elevation usage limit reached.');
  expect(requests).toHaveLength(2);
  await page.waitForTimeout(2500);
  expect(requests).toHaveLength(2);
  await page.locator('#elevation-retry').click();
  await expect(page.locator('#elevation-stats')).toContainText('Min 70 m');
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#elevation-stats')).toContainText('Mín 70 m');
});
test('a flat route has no climbs', async ({ page }) => {
  await setup(page, true);
  await page.route('**/v1/elevation?**', (r) => {
    const count = new URL(r.request().url()).searchParams
      .get('longitude')!
      .split(',').length;
    return r.fulfill({ json: { elevation: Array(count).fill(50) } });
  });
  await page.locator('#elevation > summary').click();
  await expect(page.locator('.climbs')).toHaveText(
    'No significant climbs on this route.',
  );
});
test('recorded GPX elevations need no request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/elevation')) requests.push(r.url());
  });
  await setup(page);
  const track = Array.from(
    { length: 11 },
    (_, i) =>
      `<trkpt lat="0" lon="${i * 0.01}"><ele>${100 + i * 10}</ele></trkpt>`,
  ).join('');
  await page.locator('#import').setInputFiles({
    name: 'climb.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(`<gpx><trk><trkseg>${track}</trkseg></trk></gpx>`),
  });
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#elevation > summary').click();
  await expect(page.locator('#elevation-stats')).toContainText(
    'Min 100 m · Max 200 m',
  );
  await expect(page.locator('#elevation-stats')).toContainText(
    'Recorded in the imported file.',
  );
  expect(requests).toHaveLength(0);
});
test('no date or invalid dates never request weather', async ({ page }) => {
  await setup(page);
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) calls++;
  });
  for (const [value, message] of [
    ['2026-08-08T10:00', '90 days'],
    ['2026-11-24T10:00', '16-day'],
  ]) {
    await date(page, value);
    await expect(page.locator('#departure-error')).toContainText(message);
    await expect(page.locator('#departure')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  }
  await date(page, '');
  await page.locator('#route-name').fill('No weather');
  await page.locator('#save-route').click();
  await expect(page.locator('#saved-count')).toHaveText('(1)');
  expect(calls).toBe(0);
});
for (const failure of ['429', 'network', 'invalid', 'timeout'])
  test(`automatic weather ${failure}, manual retry and usable download`, async ({
    page,
  }) => {
    await setup(page);
    await page.clock.install({ time: new Date('2026-11-07T10:00:00Z') });
    let calls = 0;
    await page.route('**/v1/forecast?**', async (r) => {
      calls++;
      if (calls > 1)
        return r.fulfill({ json: weatherResponse(new URL(r.request().url())) });
      if (failure === 'network') return r.abort();
      if (failure === 'timeout') return;
      return r.fulfill(
        failure === '429' ? { status: 429 } : { json: { broken: true } },
      );
    });
    await date(page);
    await expect.poll(() => calls).toBe(1);
    if (failure === 'timeout') await page.clock.fastForward(21000);
    await expect(page.locator('#weather-status')).toContainText(
      failure === '429'
        ? 'limit'
        : failure === 'network'
          ? 'network'
          : failure === 'timeout'
            ? 'timed out'
            : 'invalid',
    );
    await expect(page.locator('#download')).toBeEnabled();
    expect(calls).toBe(1);
    if (failure === '429') {
      // Usage limit: a countdown (60 s without Retry-After), no button, then
      // one retry on its own.
      await expect(page.locator('#weather-status')).toHaveText(
        'Weather usage limit reached. Try again in 60s.',
      );
      await expect(page.locator('#weather-retry')).toBeHidden();
      for (let i = 0; i < 61; i++) await page.clock.runFor(1000);
      await page.clock.fastForward(6500);
      await fetchWeather(page);
      expect(calls).toBe(2);
      return;
    }
    await page.locator('#weather-retry').click();
    // Pass only the 6 s weather queue spacing: advancing past the retry's 20 s
    // request deadline would race the mocked response and time it out again.
    await page.clock.fastForward(6500);
    await fetchWeather(page);
    expect(calls).toBe(2);
  });
test('selected speeds recalculate weather locally and support slow/fast travel and miles', async ({
  page,
}) => {
  await setup(page, false, null);
  // Nothing stored yet: the 60 km/h default, also for an imported GPX.
  await expect(page.locator('#summary .stats-basis')).toHaveText(
    'At 60 km/h · no stops',
  );
  await date(page);
  await fetchWeather(page);
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) calls++;
  });
  const before = await page
    .locator('.weather-marker')
    .last()
    .getAttribute('aria-label');
  await page.locator('#average-speed').fill('30');
  await expect(page.locator('#summary .stats-basis')).toHaveText(
    'At 30 km/h · no stops',
  );
  await expect(page.locator('.weather-marker').last()).not.toHaveAttribute(
    'aria-label',
    before!,
  );
  await page.locator('#average-speed').fill('5');
  await expect(page.locator('#weather-status')).toContainText('exceed');
  await expect(page.locator('#weather-retry')).toBeVisible();
  await page.locator('#average-speed').fill('200');
  await expect(page.locator('#summary .stats-basis')).toContainText('200 km/h');
  await expect(page.locator('#weather-result')).toBeVisible();
  await chooseUnits(page, { distance: 'imperial' });
  await expect(page.locator('#summary .stats-basis')).toContainText('125 mph');
  expect(calls).toBe(0);
});
test('changing only the weather server refreshes weather without rerouting', async ({
  page,
}) => {
  await setup(page);
  await date(page);
  await fetchWeather(page);
  const hosts: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) hosts.push(new URL(r.url()).host);
    if (r.url().includes('/route/v1/')) hosts.push('routing');
  });
  await page.locator('#open-settings').click();
  await page.locator('#weather-server').fill('https://weather.example.org');
  await page.locator('#save-settings').click();
  await expect(page.locator('#status')).toHaveText('Settings applied.');
  await expect(page.locator('#weather-result')).toBeVisible({ timeout: 15000 });
  expect(hosts).toEqual(['weather.example.org']);
});
test('changed departure refreshes automatically and obsolete responses cannot restore old weather', async ({
  page,
}) => {
  await setup(page);
  await date(page);
  await fetchWeather(page);
  await page.clock.install({ time: new Date('2026-11-07T10:00:00Z') });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route('**/v1/forecast?**', async (r) => {
    started = true;
    await pending;
    await r.fulfill({ json: weatherResponse(new URL(r.request().url())) });
  });
  await date(page, '2026-11-09T10:00');
  await expect(page.locator('.weather-marker')).toHaveCount(0);
  await page.clock.fastForward(61000);
  await expect.poll(() => started).toBe(true);
  await date(page, '');
  release();
  await expect(page.locator('#weather-result')).toBeHidden();
  await expect(page.locator('.weather-marker')).toHaveCount(0);
});
test('departure persists but forecasts and samples do not; reload refreshes; GPX bytes are unchanged', async ({
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
  const original = await download();
  await date(page);
  await fetchWeather(page);
  expect(await download()).toBe(original);
  const state = decodeState(new URL(page.url()).hash);
  expect(state.departure).toBe('2026-11-08T10:00:00.000Z');
  expect(Object.keys(state).sort()).toEqual(
    [...Object.keys(defaults()), 'departure', 'language'].sort(),
  );
  await page.locator('#route-name').fill('Weather saved');
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
    return { local: { ...localStorage }, session: { ...sessionStorage }, rows };
  });
  for (const word of [
    'temperature',
    'precipitation',
    'windDirection',
    'wind_direction_10m',
    'bearing',
    '0.500',
  ])
    expect(JSON.stringify(stored)).not.toContain(word);
  expect((stored.rows[0] as { state: typeof state }).state).toEqual({
    ...state,
    name: 'Weather saved',
  });
  await page.reload();
  await expect(page.locator('#departure')).toHaveValue('2026-11-08T10:00');
  await page.locator('#weather-section > summary').click();
  await fetchWeather(page);
  await page.goto(base);
  await page.locator('.saved-routes > summary').click();
  await page
    .getByRole('button', {
      name: 'Open saved route: Weather saved',
      exact: true,
    })
    .click();
  await page.locator('#weather-section > summary').click();
  await fetchWeather(page);
});
test.describe('device timezone', () => {
  test.use({ timezoneId: 'America/Sao_Paulo' });
  test('local input sends UTC while retaining local display', async ({
    page,
  }) => {
    await setup(page);
    const request = page.waitForRequest('**/v1/forecast?**');
    await date(page);
    await fetchWeather(page);
    expect(decodeState(new URL(page.url()).hash).departure).toBe(
      '2026-11-08T13:00:00.000Z',
    );
    const url = new URL((await request).url());
    expect(url.searchParams.get('start_hour')).toBe('2026-11-08T12:00');
    await expect(page.locator('.weather-marker').first()).toHaveAttribute(
      'aria-label',
      /10:00/,
    );
  });
});
for (const width of [320, 360, 390, 430])
  for (const language of ['en', 'pt'])
    test(`weather stays within the mobile panel at ${width}px in ${language}, including long names`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await setup(page, true, 60, true);
      await page.locator('#language').selectOption(language);
      await date(page);
      await fetchWeather(page);
      const overflow = await page.evaluate(() => {
        const panel = document.getElementById('route-panel')!;
        const box = panel.getBoundingClientRect();
        return {
          page: document.documentElement.scrollWidth > innerWidth,
          panel: panel.scrollWidth > panel.clientWidth,
          escaped: [
            ...document.querySelectorAll(
              '#weather-section input,#weather-section p,.weather-card,.weather-card-header,.weather-card-conditions,.weather-card-wind',
            ),
          ]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return b.left < box.left || b.right > box.right;
            })
            .map((el) => el.id),
        };
      });
      expect(overflow).toEqual({ page: false, panel: false, escaped: [] });
      const marker = page.locator('.weather-marker').last();
      await marker.focus();
      await expect(marker).toBeFocused();
      await expect(marker).not.toHaveAttribute('aria-label', /BBBBB/);
    });

for (const language of ['en', 'pt'])
  test(`weather card values use the ${language} number format and show one topic per line at 320px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await setup(page);
    await page.route('**/v1/forecast?**', (route) => {
      const rows = weatherResponse(new URL(route.request().url()));
      for (const { hourly } of rows) {
        hourly.temperature_2m.fill(24.1);
        hourly.precipitation.fill(0.2);
        hourly.precipitation_probability.fill(13);
        hourly.weather_code.fill(1);
      }
      return route.fulfill({ json: rows });
    });
    await page.locator('#language').selectOption(language);
    await date(page);
    await fetchWeather(page);
    const card = page.locator('.weather-card').first();
    const pt = language === 'pt';
    await expect(card.locator('.weather-card-conditions')).toHaveText(
      pt ? 'Predominantemente limpo' : 'Mainly clear',
    );
    await expect(card.locator('.weather-card-temperature')).toHaveText(
      pt ? '24,1 °C' : '24.1 °C',
    );
    await expect(card.locator('.weather-card-rain')).toHaveText(
      pt ? 'Chuva 13% · 0,2 mm' : 'Rain 13% · 0.2 mm',
    );
    await expect(
      card.locator('.weather-card-temperature .icon-thermometer'),
    ).toHaveCount(1);
    await expect(card.locator('.weather-card-rain .icon-droplet')).toHaveCount(
      1,
    );
    // One topic per line: each line is as tall as the one-line wind row.
    const heights = await card.evaluate((element) =>
      [
        '.weather-card-conditions',
        '.weather-card-temperature',
        '.weather-card-rain',
        '.weather-card-wind',
      ].map((selector) =>
        Math.round(
          element.querySelector(selector)!.getBoundingClientRect().height,
        ),
      ),
    );
    expect(new Set(heights).size).toBe(1);
    await expect(card).toHaveAttribute(
      'aria-label',
      pt
        ? /Predominantemente limpo · 24,1 °C · Chuva 13% · 0,2 mm/
        : /Mainly clear · 24.1 °C · Rain 13% · 0.2 mm/,
    );
  });

test.describe('phone page height', () => {
  test.use({
    viewport: { width: 390, height: 664 },
    isMobile: true,
    hasTouch: true,
  });
  test('selecting a weather marker never scrolls the page off screen', async ({
    page,
  }) => {
    await setup(page, true);
    await date(page);
    await fetchWeather(page);
    const page_ = () =>
      page.evaluate(() => ({
        scrollY: Math.round(scrollY),
        height: document.documentElement.scrollHeight,
        screen: innerHeight,
      }));
    // Nothing inside the panel (hidden status, screen-reader text) may make
    // the page taller than the screen; otherwise revealing a card scrolls it.
    expect(await page_()).toEqual({ scrollY: 0, height: 664, screen: 664 });
    await page.locator('.weather-marker').nth(3).click();
    await expect(page.locator('.weather-card').nth(3)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await page.waitForTimeout(600); // Smooth scrolling of the panel.
    expect(await page_()).toEqual({ scrollY: 0, height: 664, screen: 664 });
    expect((await page.locator('header').boundingBox())!.y).toBeGreaterThan(0);
  });
});

test('weather icons can be hidden from the map, keeping the cards and the forecast', async ({
  page,
}) => {
  await setup(page, true);
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) calls++;
  });
  await date(page);
  await fetchWeather(page);
  const cards = await page.locator('.weather-card').count();
  await expect(page.locator('.weather-marker').first()).toBeVisible();
  const before = calls;
  await page.locator('#layers-toggle').click();
  const toggle = page.locator('#marks-weather');
  await expect(toggle).toBeChecked();
  await expect(page.locator('label:has(#marks-weather)')).toHaveText(
    'Weather on the map',
  );
  await toggle.uncheck();
  await expect(page.locator('.weather-marker').first()).toBeHidden();
  await expect(page.locator('.weather-card')).toHaveCount(cards);
  expect(calls).toBe(before);
  // A device preference: kept across reloads, never in the link.
  expect(new URL(page.url()).hash).not.toMatch(/weather/);
  await page.reload();
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#weather-section > summary').click();
  await fetchWeather(page);
  await expect(page.locator('.weather-card')).toHaveCount(cards);
  await expect(page.locator('.weather-marker').first()).toBeHidden();
  await page.locator('#language').selectOption('pt');
  await page.locator('#layers-toggle').click();
  await expect(page.locator('label:has(#marks-weather)')).toHaveText(
    'Clima no mapa',
  );
  await page.locator('#marks-weather').check();
  await expect(page.locator('.weather-marker').first()).toBeVisible();
});

test('a sharp bend gets its own weather sample with the wind relation of the new direction', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('auto-departure', 'off'));
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  let calls = 0;
  await page.route('**/v1/forecast?**', (r) => {
    calls++;
    const rows = weatherResponse(new URL(r.request().url()));
    // Wind from the north everywhere.
    for (const { hourly } of rows) hourly.wind_direction_10m.fill(0);
    return r.fulfill({ json: rows });
  });
  // 13 km east, then 20 km north.
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: [0, 0], distance: 0 },
          { location: [0.117, 0.18], distance: 0 },
        ],
        routes: [
          {
            distance: 33000,
            duration: 2000,
            geometry: {
              coordinates: [
                [0, 0],
                [0.117, 0],
                [0.117, 0.18],
              ],
            },
            legs: [],
          },
        ],
      },
    }),
  );
  const state = { ...defaults(), language: 'en' as const };
  state.points = [
    { name: 'Start', coord: [0, 0] },
    { name: 'Destination', coord: [0.18, 0.117] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#weather-section > summary').click();
  await date(page);
  await fetchWeather(page);
  const wind = page.locator('.weather-card-wind');
  // Heading east the north wind is a crosswind; past the corner, a headwind.
  await expect(wind.first()).toContainText('Crosswind');
  const corner = page.locator('.weather-card').filter({
    has: page.locator('.weather-card-header', { hasText: '13.1 km' }),
  });
  await expect(corner).toHaveCount(1);
  await expect(corner.locator('.weather-card-wind')).toContainText('Headwind');
  expect(calls).toBe(1);
});

test('consecutive samples with equivalent weather share one card and one marker', async ({
  page,
}) => {
  // 111 km at 5 km/h: samples every 10 km between start and destination.
  await setup(page, true, 5);
  let calls = 0;
  await page.route('**/v1/forecast?**', (route) => {
    calls++;
    const rows = weatherResponse(new URL(route.request().url()));
    rows.forEach(({ hourly }, i) => {
      hourly.temperature_2m.fill(22 + (i % 3) * 0.5);
      hourly.precipitation.fill(0);
      hourly.precipitation_probability.fill(10);
      hourly.weather_code.fill(0);
      hourly.wind_gusts_10m.fill(10);
    });
    return route.fulfill({ json: rows });
  });
  await date(page);
  await fetchWeather(page);
  const cards = page.locator('.weather-card');
  // Start and destination keep their own cards; the stretch between merges.
  await expect(cards).toHaveCount(3);
  // Every route point has a card, so no "sampled at N of M stops" note.
  await expect(page.locator('#weather-section')).not.toContainText(
    'Weather sampled at',
  );
  await expect(page.locator('.weather-marker')).toHaveCount(3);
  const merged = cards.nth(1);
  await expect(merged.locator('.weather-card-header')).toContainText(
    '10–110 km',
  );
  // From the first to the last hour of the stretch, on the next day.
  await expect(merged.locator('.weather-card-header')).toContainText(
    /Nov 8, \d{2}:\d{2} [AP]M–Nov 9, \d{2}:\d{2} [AP]M/,
  );
  await expect(merged.locator('.weather-card-temperature')).toHaveText(
    '22–23 °C',
  );
  await expect(merged).toHaveAttribute('aria-label', /10–110 km/);
  await page.locator('.weather-marker').nth(1).click();
  await expect(merged).toHaveAttribute('aria-current', 'true');
  await page.locator('#language').selectOption('pt');
  await expect(merged.locator('.weather-card-header')).toContainText(
    '10–110 km',
  );
  await expect(merged.locator('.weather-card-rain')).toHaveText(
    'Chuva 10% · 0 mm',
  );
  // Merging only changes the presentation: still one weather request.
  expect(calls).toBe(1);
});

test('a road used both ways labels outbound and return, with both markers visible', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('auto-departure', 'off'));
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  let calls = 0;
  await page.route('**/v1/forecast?**', (r) => {
    calls++;
    return r.fulfill({ json: weatherResponse(new URL(r.request().url())) });
  });
  // East along the equator to 1°, then back west on the same road.
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [
          { location: [0, 0], distance: 0 },
          { location: [1, 0], distance: 0 },
          { location: [0, 0], distance: 0 },
        ],
        routes: [
          {
            distance: 222390,
            duration: 14400,
            geometry: {
              coordinates: [
                [0, 0],
                [1, 0],
                [0, 0],
              ],
            },
            legs: [],
          },
        ],
      },
    }),
  );
  const state = { ...defaults(), language: 'en' as const };
  state.points = [
    { name: 'Start', coord: [0, 0] },
    { name: 'Turn', coord: [0, 1] },
    { name: 'Destination', coord: [0, 0] },
  ];
  await page.goto(base + encodeState(state));
  await expect(page.locator('#download')).toBeEnabled();
  await page.locator('#weather-section > summary').click();
  await date(page);
  await fetchWeather(page);
  const cards = page.locator('.weather-card');
  const first = cards.first(),
    last = cards.last();
  await expect(first.locator('.weather-card-header')).toContainText(
    '0 km · Outbound',
  );
  await expect(last.locator('.weather-card-header')).toContainText('Return');
  // Wind from the east: against the outbound pass, behind the return.
  await expect(first.locator('.weather-card-wind')).toContainText('Headwind');
  await expect(last.locator('.weather-card-wind')).toContainText('Tailwind');
  await expect(last).toHaveAttribute('aria-label', /Return/);
  // Start and destination share a place; their markers sit side by side.
  const markers = page.locator('.weather-marker');
  const start = markers.first(),
    end = markers.last();
  await expect(start).not.toHaveClass(/weather-marker-return/);
  await expect(end).toHaveClass(/weather-marker-return/);
  const a = (await start.boundingBox())!,
    b = (await end.boundingBox())!;
  // Mirrored around the shared point: at most the 4 px next to it in common.
  expect(b.x + b.width - a.x).toBeLessThanOrEqual(4);
  expect(a.x + a.width / 2 - (b.x + b.width / 2)).toBeGreaterThanOrEqual(50);
  await end.click();
  await expect(last).toHaveAttribute('aria-current', 'true');
  await start.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
  await page.locator('#language').selectOption('pt');
  await expect(first.locator('.weather-card-header')).toContainText('Ida');
  await expect(last.locator('.weather-card-header')).toContainText('Volta');
  // Labels come from the route itself: no extra weather request.
  expect(calls).toBe(1);
});

test('temperature units switch the weather card to °F and inches without another request', async ({
  page,
}) => {
  await setup(page);
  let calls = 0;
  await page.route('**/v1/forecast?**', (route) => {
    calls++;
    const rows = weatherResponse(new URL(route.request().url()));
    for (const { hourly } of rows) {
      hourly.temperature_2m.fill(24.1);
      hourly.precipitation.fill(12.7);
      hourly.precipitation_probability.fill(13);
    }
    return route.fulfill({ json: rows });
  });
  await date(page);
  await fetchWeather(page);
  const card = page.locator('.weather-card').first();
  await expect(card.locator('.weather-card-temperature')).toHaveText('24.1 °C');
  await expect(card.locator('.weather-card-rain')).toHaveText(
    'Rain 13% · 12.7 mm',
  );
  const requests = calls;
  await chooseUnits(page, { temperature: 'fahrenheit' });
  await expect(card.locator('.weather-card-temperature')).toHaveText('75.4 °F');
  await expect(card.locator('.weather-card-rain')).toHaveText(
    'Rain 13% · 0.5 in',
  );
  // Distance units are a separate choice.
  await expect(card.locator('.weather-card-header')).toContainText('km');
  await page.locator('#language').selectOption('pt');
  await expect(card.locator('.weather-card-rain')).toHaveText(
    'Chuva 13% · 0,5 in',
  );
  expect(calls).toBe(requests);
});

test('a UV alert shows on the UV line as the range up to the worst hour of its window', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/v1/forecast?**', (route) => {
    const rows = weatherResponse(new URL(route.request().url()));
    for (const { hourly } of rows) {
      hourly.precipitation.fill(0);
      hourly.precipitation_probability.fill(0);
      hourly.weather_code.fill(0);
      hourly.wind_gusts_10m.fill(10);
      // UV 7 at the departure hour, 8 within the hour after it.
      hourly.uv_index = hourly.time.map((time) =>
        new Date(time * 1000).getUTCHours() === 10 ? 7 : 8,
      );
    }
    return route.fulfill({ json: rows });
  });
  await date(page);
  await fetchWeather(page);
  const card = page.locator('.weather-card').first();
  await expect(card.locator('.weather-card-severity')).toHaveText('Alert 1');
  const uv = card.locator('.weather-card-uv');
  await expect(uv).toHaveText('UV 7–8 · Very high');
  await expect(uv.locator('.icon-alert')).toHaveCount(1);
  // One UV line: the alert is not repeated as a separate warning.
  await expect(card).not.toContainText('Very high UV');
  await expect(card).toHaveAttribute('aria-label', /UV 7–8 · Very high/);
  await page.locator('#language').selectOption('pt');
  await expect(uv).toHaveText('UV 7–8 · muito alto');
});

for (const [severity, color] of [
  [0, 'rgb(245, 247, 249)'],
  [1, 'rgb(255, 248, 221)'],
  [2, 'rgb(255, 240, 223)'],
  [3, 'rgb(255, 240, 240)'],
] as const) {
  test(`one consolidated weather card per point, with alert level ${severity} and matching color`, async ({
    page,
  }) => {
    await setup(page);
    await page.route('**/v1/forecast?**', (route) => {
      const rows = weatherResponse(new URL(route.request().url()));
      for (const [location, row] of rows.entries()) {
        const values = row.hourly;
        values.temperature_2m.fill(location % 2 ? 23 : 20);
        values.precipitation_probability.fill(severity === 1 ? 80 : 0);
        values.precipitation.fill(severity === 3 ? 12 : 0);
        values.weather_code.fill(severity === 3 ? 65 : 0);
        values.wind_gusts_10m.fill(severity === 2 ? 65 : 10);
      }
      return route.fulfill({ json: rows });
    });
    await date(page);
    await fetchWeather(page);
    await expect(page.locator('.weather-card')).toHaveCount(7);
    await expect(page.locator('#weather-alerts')).toHaveCount(0);
    await expect(page.locator('#weather-summary')).toHaveCount(0);
    const card = page.locator('.weather-card').first();
    await expect(card).toHaveAttribute('data-severity', String(severity));
    await expect(card).toHaveCSS('background-color', color);
    await expect(card.locator('.weather-card-severity')).toHaveText(
      severity ? `Alert ${severity}` : 'No alert',
    );
    await expect(card).toContainText('20 °C');
    await expect(card).toContainText('0 km');
    await expect(card).toContainText('Nov');
    expect(
      await card.locator('.weather-card-conditions').textContent(),
    ).not.toContain('Heavy rain · Heavy rain');
  });
}

for (const native of [false, true]) {
  test(`weather marker opens its matching card in one click from ${native ? 'native' : 'fallback'} fullscreen`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page, true);
    await date(page);
    await fetchWeather(page);
    if (!native)
      await page.evaluate(() =>
        Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
          value: undefined,
        }),
      );
    await page.locator('#weather-section > summary').click();
    await page.locator('#panel-toggle').click();
    await page.locator('#fullscreen').click();
    await expect(page.locator('body')).toHaveClass(/map-fullscreen/);
    await page.locator('.weather-marker').nth(3).click();
    const target = page.locator('#weather-point-3');
    await expect(target).toBeFocused();
    await expect(target).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('body')).not.toHaveClass(/map-fullscreen/);
    await expect(page.locator('#route-panel')).toBeVisible();
    await expect(page.locator('.leaflet-tooltip,.leaflet-popup')).toHaveCount(
      0,
    );
    await expect
      .poll(async () => {
        const card = (await target.boundingBox())!,
          panel = (await page.locator('#route-panel').boundingBox())!;
        return (
          card.y >= panel.y && card.y + card.height <= panel.y + panel.height
        );
      })
      .toBe(true);
  });
}

test('slower travel adds hourly samples automatically and faster travel reuses them', async ({
  page,
}) => {
  await setup(page, false, 60);
  // Temperature follows longitude (about 2.4 °C per 15 km sample along the
  // equator), so samples from separate requests never merge into one card.
  await page.route('**/v1/forecast?**', (route) => {
    const url = new URL(route.request().url());
    const longitudes = url.searchParams.get('longitude')!.split(',');
    const rows = weatherResponse(url);
    rows.forEach(({ hourly }, i) =>
      hourly.temperature_2m.fill(20 + Number(longitudes[i]) * 18),
    );
    return route.fulfill({ json: rows });
  });
  const requests: URL[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/forecast?'))
      requests.push(new URL(request.url()));
  });
  await date(page);
  await fetchWeather(page);
  await expect(page.locator('.weather-card')).toHaveCount(7);
  expect(requests).toHaveLength(1);
  expect(requests[0].searchParams.get('latitude')!.split(',')).toHaveLength(7);
  await page.clock.install({ time: new Date('2026-11-07T10:00:00Z') });
  await page.locator('#average-speed').fill('15');
  await page.locator('#average-speed').fill('60');
  await expect(page.locator('#weather-result')).toBeVisible();
  await page.locator('#average-speed').fill('15');
  await page.clock.fastForward(6500);
  await expect(page.locator('#summary .stats-basis')).toContainText('15 km/h');
  await expect(page.locator('.weather-card')).toHaveCount(9, {
    timeout: 15000,
  });
  await expect(page.locator('#weather-result')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].searchParams.get('latitude')!.split(',')).toHaveLength(6);
  await expect(page.locator('.weather-card').nth(1)).toContainText('15 km');
  await page.locator('#average-speed').fill('60');
  await expect(page.locator('#weather-result')).toBeVisible();
  await expect(page.locator('#summary .stats-basis')).toContainText('60 km/h');
  expect(requests).toHaveLength(2);
});

for (const mixed of [false, true])
  test(`recent past weather ${mixed ? 'crossing into the forecast' : 'at the 90-day boundary'} uses one request and translates`, async ({
    page,
  }) => {
    await setup(page);
    const requests: URL[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/forecast?'))
        requests.push(new URL(request.url()));
    });
    await expect(page.locator('#weather-section > summary')).toHaveText(
      'Weather',
    );
    await date(page, mixed ? '2026-11-07T09:00' : '2026-08-09T00:00');
    await fetchWeather(page);
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.has('past_days')).toBe(false);
    if (!mixed)
      expect(requests[0].searchParams.get('start_hour')).toBe(
        '2026-08-08T23:00',
      );
    await expect(page.locator('.weather-card')).toHaveCount(7);
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#weather-section > summary')).toHaveText(
      'Clima',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#weather-section > summary')).toHaveText(
      'Weather',
    );
    expect(decodeState(new URL(page.url()).hash).departure).toBe(
      mixed ? '2026-11-07T09:00:00.000Z' : '2026-08-09T00:00:00.000Z',
    );
    expect(requests).toHaveLength(1);
  });

for (const mobile of [false, true])
  test(`weather card returns to its point on the map by click and keyboard: ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await setup(page);
    await date(page);
    await fetchWeather(page);
    const card = page.locator('.weather-card').nth(3);
    const marker = page.locator('.weather-marker').nth(3);
    let calls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/v1/forecast?')) calls++;
    });
    await expect(card).toHaveAttribute('aria-label', /Show on map.*60 km/);
    await card.click();
    await expect(marker).toBeFocused();
    await expect(page.locator('#panel-toggle')).toHaveAttribute(
      'aria-expanded',
      String(!mobile),
    );
    const map = (await page.locator('#map').boundingBox())!,
      icon = (await marker.boundingBox())!;
    expect(
      Math.abs(icon.x + icon.width / 2 - map.x - map.width / 2),
    ).toBeLessThan(60);
    expect(
      Math.abs(icon.y + icon.height / 2 - map.y - map.height / 2),
    ).toBeLessThan(60);
    await marker.press('Enter');
    await expect(card).toBeFocused();
    await card.press('Space');
    await expect(marker).toBeFocused();
    await marker.press('Enter');
    await expect(card).toBeFocused();
    await card.press('Enter');
    await expect(marker).toBeFocused();
    expect(calls).toBe(0);
  });

for (const mobile of [false, true])
  test(`long routes share a maximum of 20 weather cards, markers and queried points: ${mobile ? 'mobile' : 'desktop'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await setup(page);
    await page.locator('#import').setInputFiles({
      name: 'long.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(
        '<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="19.7"/></trkseg></trk></gpx>',
      ),
    });
    await expect(page.locator('#download')).toBeEnabled();
    const requests: URL[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/v1/forecast?'))
        requests.push(new URL(request.url()));
    });
    await date(page);
    await fetchWeather(page);
    await expect(page.locator('.weather-card')).toHaveCount(20);
    await expect(page.locator('.weather-marker')).toHaveCount(20);
    expect(requests).toHaveLength(1);
    const longitudes = requests[0].searchParams.get('longitude')!.split(',');
    expect(longitudes).toHaveLength(20);
    expect(longitudes[0]).toBe('0.000');
    expect(longitudes.at(-1)).toBe('19.700');
    await expect(page.locator('.weather-card').nth(1)).toContainText('120 km');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });

test('wind follows bends, translates and switches units without another weather request', async ({
  page,
}) => {
  await setup(page);
  await page.locator('#import').setInputFiles({
    name: 'wind.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(
      '<gpx><trk><name>Wind bend</name><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.1"/><trkpt lat="0.1" lon="0.1"/></trkseg></trk></gpx>',
    ),
  });
  await expect(page.locator('#route-name')).toHaveValue('Wind bend');
  const requests: URL[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) requests.push(new URL(r.url()));
  });
  await date(page);
  await fetchWeather(page);
  // Start, the sample just past the corner, 20 km and the destination.
  await expect(page.locator('.weather-card')).toHaveCount(4);
  await expect(page.locator('.weather-card-wind .icon-wind')).toHaveCount(4);
  await expect(
    page.locator('.weather-card-wind .icon-wind').first(),
  ).toHaveAttribute('aria-hidden', 'true');
  // Wind from the east: against the first leg, across the second one.
  await expect(page.locator('.weather-card-wind').nth(1)).toHaveText(
    'Crosswind · 20 km/h',
  );
  await expect(page.locator('.weather-card-wind').first()).toHaveText(
    'Headwind · 20 km/h',
  );
  await expect(page.locator('.weather-card-wind').last()).toHaveText(
    'Crosswind · 20 km/h',
  );
  expect(requests[0].searchParams.get('hourly')).toContain(
    'wind_direction_10m',
  );
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('.weather-card-wind').first()).toHaveText(
    'Vento contra · 20 km/h',
  );
  await expect(page.locator('.weather-card-wind').last()).toHaveText(
    'Vento lateral · 20 km/h',
  );
  await chooseUnits(page, { distance: 'imperial' });
  await expect(page.locator('.weather-card-wind').first()).toHaveText(
    'Vento contra · 12,4 mph',
  );
  await page.locator('#language').selectOption('en');
  await expect(page.locator('.weather-card-wind').first()).toHaveText(
    'Headwind · 12.4 mph',
  );
  expect(requests).toHaveLength(1);
});

for (const [speed, direction, label] of [
  [20, 270, 'Tailwind'],
  [0.5, null, 'Calm wind'],
  [20, null, 'Wind direction unavailable'],
  [null, 90, 'Wind unavailable'],
] as const)
  test(`wind handles ${label} without blocking the route`, async ({ page }) => {
    await setup(page);
    await page.route('**/v1/forecast?**', (r) => {
      const rows = weatherResponse(new URL(r.request().url()));
      return r.fulfill({
        json: rows.map((row) => ({
          ...row,
          hourly: {
            ...row.hourly,
            wind_speed_10m: row.hourly.time.map(() => speed),
            wind_direction_10m: row.hourly.time.map(() => direction),
          },
        })),
      });
    });
    await date(page);
    await fetchWeather(page);
    await expect(page.locator('.weather-card-wind').first()).toContainText(
      label,
    );
    await expect(page.locator('#download')).toBeEnabled();
    expect(
      await page.locator('.weather-card-wind').first().innerText(),
    ).not.toContain('NaN');
  });

test('changing passage speed selects the wind at the new hour without another request', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/v1/forecast?**', (route) => {
    const rows = weatherResponse(new URL(route.request().url()));
    return route.fulfill({
      json: rows.map((row) => ({
        ...row,
        hourly: {
          ...row.hourly,
          wind_direction_10m: row.hourly.time.map((time) =>
            new Date(time * 1000).getUTCHours() >= 11 ? 270 : 90,
          ),
        },
      })),
    });
  });
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/v1/forecast?')) calls++;
  });
  await date(page);
  await fetchWeather(page);
  await expect(page.locator('.weather-card-wind').nth(3)).toContainText(
    'Tailwind',
  );
  await page.locator('#average-speed').fill('120');
  await expect(page.locator('.weather-card-wind').nth(3)).toContainText(
    'Headwind',
  );
  expect(calls).toBe(1);
});

for (const [code, name, description] of [
  [0, 'weather-sun', 'Clear sky'],
  [2, 'weather-partly-cloudy', 'Partly cloudy'],
  [3, 'weather-cloud', 'Overcast'],
  [45, 'weather-fog', 'Fog'],
  [51, 'weather-drizzle', 'Light drizzle'],
  [61, 'weather-rain', 'Light rain'],
  [65, 'weather-heavy-rain', 'Heavy rain'],
  [66, 'weather-freezing-rain', 'Freezing rain'],
  [71, 'weather-snow', 'Light snow'],
  [95, 'weather-thunderstorm', 'Thunderstorm'],
  [96, 'weather-hail', 'Thunderstorm with hail'],
  [null, 'help', 'Weather unavailable'],
] as const)
  test(`matching outline weather icons in cards and map: ${name}`, async ({
    page,
  }) => {
    await setup(page);
    await page.route('**/v1/forecast?**', (route) => {
      const rows = weatherResponse(new URL(route.request().url()));
      return route.fulfill({
        json: rows.map((row) => ({
          ...row,
          hourly: {
            ...row.hourly,
            weather_code: row.hourly.time.map(() => code),
          },
        })),
      });
    });
    await date(page);
    await fetchWeather(page);
    const card = page.locator('.weather-card').first();
    const symbol = card.locator(`.weather-card-conditions .icon-${name}`);
    await expect(symbol).toHaveCount(1);
    await expect(symbol).toHaveAttribute('aria-hidden', 'true');
    await expect(symbol).toHaveAttribute('stroke-width', '2');
    const geometry = await page
      .locator('.weather-marker-symbol')
      .first()
      .locator('svg')
      .evaluate((svg) => {
        const b = (svg as SVGSVGElement).getBBox();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      });
    expect(geometry.x).toBeCloseTo(12, 2);
    expect(geometry.y).toBeCloseTo(12, 2);
    await expect(card.locator('.weather-card-conditions')).toContainText(
      description,
    );
    await expect(
      page.locator('.weather-marker').first().locator(`.icon-${name}`),
    ).toHaveCount(1);
    await expect(page.locator('.weather-marker').first()).toHaveAttribute(
      'aria-label',
      new RegExp(description),
    );
    expect(await symbol.evaluate((el) => getComputedStyle(el).color)).toBe(
      await card
        .locator('.icon-wind')
        .evaluate((el) => getComputedStyle(el).color),
    );
  });

for (const [speed, direction, strength, angle] of [
  [10, 0, 'light', 180],
  [20, 90, 'moderate', 270],
  [39, 180, 'strong', 0],
  [62, 270, 'very-strong', 90],
  [0.5, null, 'calm', null],
  [20, null, 'moderate', null],
  [null, 90, 'unknown', null],
] as const)
  test(`map wind speed, strength and flow: ${speed}/${direction}`, async ({
    page,
  }) => {
    await setup(page);
    await page.route('**/v1/forecast?**', (r) =>
      r.fulfill({
        json: weatherResponse(new URL(r.request().url())).map((row) => ({
          ...row,
          hourly: {
            ...row.hourly,
            wind_speed_10m: row.hourly.time.map(() => speed),
            wind_direction_10m: row.hourly.time.map(() => direction),
          },
        })),
      }),
    );
    await date(page);
    await fetchWeather(page);
    const marker = page.locator('.weather-marker').first(),
      badge = marker.locator('.weather-marker-wind');
    await expect(badge).toHaveAttribute('data-strength', strength);
    const expectedRelation =
      speed === null
        ? 'Wind unavailable'
        : speed < 1
          ? 'Calm wind'
          : direction === null
            ? 'Wind direction unavailable'
            : direction === 90
              ? 'Headwind'
              : direction === 270
                ? 'Tailwind'
                : 'Crosswind';
    await expect(badge).toHaveAttribute('data-relation', expectedRelation);
    if (expectedRelation === 'Headwind')
      await expect(badge).toHaveCSS('color', 'rgb(154, 34, 39)');
    if (expectedRelation === 'Tailwind')
      await expect(badge).toHaveCSS('color', 'rgb(32, 111, 85)');
    if (expectedRelation === 'Crosswind')
      await expect(badge).toHaveCSS('color', 'rgb(133, 96, 19)');
    await expect(page.locator('.weather-card').first()).toContainText(
      expectedRelation,
    );
    await expect(badge.locator('.weather-marker-wind-unit')).toHaveText('km/h');
    await expect(badge.locator('.weather-marker-wind-value')).toHaveText(
      speed === null ? '—' : String(speed),
    );
    if (angle === null)
      await expect(badge.locator('.weather-wind-arrow')).toHaveCount(0);
    else
      await expect(badge.locator('.weather-wind-arrow')).toHaveAttribute(
        'data-direction',
        String(angle),
      );
    await chooseUnits(page, { distance: 'imperial' });
    await expect(page.locator('.weather-marker-wind').first()).toHaveAttribute(
      'data-strength',
      strength,
    );
    await expect(page.locator('.weather-marker-wind-unit').first()).toHaveText(
      'mph',
    );
    await page.locator('#weather-section > summary').click();
    await page.locator('#panel-toggle').click();
    await page.locator('.weather-marker-wind').first().click();
    await expect(page.locator('.weather-card').first()).toBeFocused();
  });

test('automatic routing reuses recent geometry while Calculate route requests a fresh result', async ({
  page,
}) => {
  let calls = 0;
  page.on('request', (r) => {
    if (r.url().includes('/route/v1/driving/')) calls++;
  });
  await setup(page, true);
  expect(calls).toBe(1);
  await page.locator('#location-1').fill('0, 0.5');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled();
  await expect.poll(() => calls).toBe(2);
  await page.locator('#location-1').fill('0, 1');
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#download')).toBeEnabled();
  expect(calls).toBe(2);
  await page.locator('#calculate').click();
  await expect.poll(() => calls).toBe(3);
  await expect(page.locator('#download')).toBeEnabled();
});

test('weather markers leave route endpoint controls clickable', async ({
  page,
}) => {
  await setup(page, true);
  await date(page);
  await fetchWeather(page);
  const destination = page.locator('.route-marker').last();
  await destination.click();
  await expect(destination).toHaveClass(/active/);
  await expect(page.locator('.weather-marker').first()).toHaveCSS(
    'pointer-events',
    'none',
  );
});
