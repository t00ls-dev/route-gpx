import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaults, decodeState, encodeState } from '../src/core';
import { weatherResponse } from './weather-fixture';
const base = 'http://127.0.0.1:5173/';
const gpx =
  '<gpx><trk><name>Weather route</name><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg></trk></gpx>';
async function setup(
  page: Page,
  routed = false,
  speed: number | null = 60,
  longNames = false,
) {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00Z'));
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
  const state = {
    ...defaults(),
    language: 'en' as const,
    averageSpeedKmh: speed === null ? undefined : speed,
  };
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
    await expect(page.locator('#weather-speed')).toContainText(
      'Velocidade utilizada: 60 km/h',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#weather-speed')).toContainText(
      'Weather speed: 60 km/h',
    );
    expect(calls).toBe(1);
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
    await expect(page.locator('#weather-status')).toContainText(message);
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
    await page.locator('#weather-retry').click();
    await page.clock.fastForward(61000);
    await fetchWeather(page);
    expect(calls).toBe(2);
  });
test('clearly shows default and selected speeds, recalculates locally and supports slow/fast travel and miles', async ({
  page,
}) => {
  await setup(page, false, null);
  await expect(page.locator('#weather-speed')).toContainText(
    '60 km/h (default)',
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
  await page.locator('.speed-options > summary').click();
  await page.locator('#use-average-speed').check();
  await page.locator('#average-speed').fill('30');
  await expect(page.locator('#weather-speed')).toContainText('30 km/h.');
  await expect(page.locator('.weather-marker').last()).not.toHaveAttribute(
    'aria-label',
    before!,
  );
  await page.locator('#average-speed').fill('5');
  await expect(page.locator('#weather-status')).toContainText('exceed');
  await expect(page.locator('#weather-retry')).toBeVisible();
  await page.locator('#average-speed').fill('200');
  await expect(page.locator('#weather-speed')).toContainText('200 km/h');
  await expect(page.locator('#weather-result')).toBeVisible();
  await page.locator('#units').selectOption('imperial');
  await expect(page.locator('#weather-speed')).toContainText('125 mph');
  expect(calls).toBe(0);
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
    [
      ...Object.keys(defaults()),
      'averageSpeedKmh',
      'departure',
      'language',
    ].sort(),
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
      for (const row of rows) {
        const values = row.hourly;
        values.temperature_2m.fill(20);
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
  await page.locator('.speed-options > summary').click();
  await page.clock.install({ time: new Date('2026-11-07T10:00:00Z') });
  await page.locator('#average-speed').fill('15');
  await page.locator('#average-speed').fill('60');
  await expect(page.locator('#weather-result')).toBeVisible();
  await page.locator('#average-speed').fill('15');
  await page.clock.fastForward(6500);
  await expect(page.locator('#weather-speed')).toContainText('15 km/h');
  await expect(page.locator('.weather-card')).toHaveCount(9, {
    timeout: 15000,
  });
  await expect(page.locator('#weather-result')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].searchParams.get('latitude')!.split(',')).toHaveLength(6);
  await expect(page.locator('.weather-card').nth(1)).toContainText('15 km');
  await page.locator('#average-speed').fill('60');
  await expect(page.locator('#weather-result')).toBeVisible();
  await expect(page.locator('#weather-speed')).toContainText('60 km/h');
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
    await expect(page.locator('#weather-period')).toHaveText(
      mixed ? 'Past estimates and forecast' : 'Past estimates',
    );
    await expect(page.locator('.weather-card')).toHaveCount(7);
    await page.locator('#language').selectOption('pt');
    await expect(page.locator('#weather-section > summary')).toHaveText(
      'Clima',
    );
    await expect(page.locator('#weather-period')).toHaveText(
      mixed ? 'Estimativas do passado e previsão' : 'Estimativas do passado',
    );
    await page.locator('#language').selectOption('en');
    await expect(page.locator('#weather-section > summary')).toHaveText(
      'Weather',
    );
    await expect(page.locator('#weather-period')).toHaveText(
      mixed ? 'Past estimates and forecast' : 'Past estimates',
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
  await expect(page.locator('.weather-card')).toHaveCount(3);
  await expect(page.locator('.weather-card-wind .icon-wind')).toHaveCount(3);
  await expect(
    page.locator('.weather-card-wind .icon-wind').first(),
  ).toHaveAttribute('aria-hidden', 'true');
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
  await page.locator('#units').selectOption('imperial');
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
  await page.locator('.speed-options > summary').click();
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
    await page.locator('#units').selectOption('imperial');
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
