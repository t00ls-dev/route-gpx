import { test, expect, type Page } from '@playwright/test';
import { chooseUnits } from './unit-settings';
import { decimalYear, magneticDeclination } from '../src/declination';
const base = 'http://127.0.0.1:5173/';
// A route about 2.2 km east along a parallel, with a right turn at 1 km.
const lat = -22.93;
const lon = (i: number) => -43.24 + i * 0.001;
const coords = Array.from({ length: 21 }, (_, i) => [lon(i), lat]);
const start = `${lat}, ${lon(0)}`,
  end = `${lat}, ${lon(20)}`;
const longName = 'Avenida Prefeito Dulcídio Cardoso';

async function setup(page: Page, road = 'Estrada das Furnas') {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.route('**/route/v1/driving/**', (r) =>
    r.fulfill({
      json: {
        code: 'Ok',
        waypoints: [coords[0], coords[20]].map((location) => ({
          location,
          distance: 0,
        })),
        routes: [
          {
            distance: 2100,
            duration: 150,
            geometry: { coordinates: coords },
            legs: [
              {
                steps: [
                  {
                    name: 'Rua Uruguai',
                    distance: 1000,
                    duration: 70,
                    maneuver: { type: 'depart', location: coords[0] },
                  },
                  {
                    name: road,
                    distance: 500,
                    duration: 40,
                    maneuver: {
                      type: 'turn',
                      modifier: 'right',
                      location: coords[10],
                    },
                  },
                  {
                    name: 'Estrada do Joá',
                    distance: 600,
                    duration: 40,
                    maneuver: {
                      type: 'turn',
                      modifier: 'left',
                      location: coords[15],
                    },
                  },
                  {
                    name: '',
                    distance: 0,
                    duration: 0,
                    maneuver: { type: 'arrive', location: coords[20] },
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto(base);
  await page.locator('#language').selectOption('en');
  await page.locator('#location-0').fill(start);
  await page.locator('#location-0').press('Tab');
  await page.locator('#location-1').fill(end);
  await page.locator('#location-1').press('Tab');
  await expect(page.locator('#navigate')).toBeEnabled({ timeout: 15000 });
}
/** Every navigation text stays on its line inside the screen. */
async function fits(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const e of document.querySelectorAll<HTMLElement>(
      '.nav-distance, .nav-then, .nav-time, .nav-rest, .nav-stop, .nav-status, .nav-chip:not([hidden]), #navigate, #download, .nav-notice li, .nav-notice .check',
    )) {
      const box = e.getBoundingClientRect();
      if (!box.width) continue;
      if (box.right > innerWidth + 0.5 || box.left < -0.5)
        problems.push(`${e.className || e.id} leaves the screen`);
      if (e.scrollWidth > e.clientWidth + 1)
        problems.push(`${e.className || e.id} overflows`);
    }
    const eta = document.querySelector('.nav-eta')!.getBoundingClientRect(),
      stop = document.querySelector('.nav-stop')!.getBoundingClientRect();
    if (eta.width && eta.right > stop.left) problems.push('time under Stop');
    return problems;
  });
}

test.describe('phone navigation', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    // Motion sensors are allowed by default on phones; geolocation asks.
    permissions: ['geolocation', 'accelerometer', 'gyroscope', 'magnetometer'],
    geolocation: { latitude: lat + 0.00003, longitude: lon(6), accuracy: 6 },
  });

  test('follows the route with the next maneuver and arrival', async ({
    page,
    context,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    const notice = page.getByRole('dialog', { name: 'Before you go' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Avoid handling the phone');
    await notice.getByRole('button', { name: 'Start navigation' }).click();
    const screen = page.getByRole('dialog', { name: 'Navigation' });
    await expect(screen).toBeVisible();
    await expect(page.locator('#nav-road')).toHaveText('Estrada das Furnas');
    // About 410 m to the turn (0.001° is 102 m here), read in 50 m steps.
    await expect(page.locator('#nav-distance')).toHaveText('400 m');
    await expect(page.locator('#nav-turn svg.mirror')).toHaveCount(1);
    await expect(page.locator('#nav-then')).toContainText('Then');
    await expect(page.locator('#nav-then-distance')).toHaveText('500 m');
    // Our own estimate from the default 60 km/h.
    await expect(page.locator('#nav-time')).toHaveText('1 min');
    await expect(page.locator('#nav-rest')).toContainText('1.4 km ·');
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    await expect(page.locator('#nav-gps')).toBeHidden();
    await expect(page.locator('#nav-announce')).toHaveText(
      'Turn right · Estrada das Furnas',
    );

    // Past the turn, the next maneuver follows; a weak fix is flagged.
    await context.setGeolocation({
      latitude: lat,
      longitude: lon(12),
      accuracy: 60,
    });
    await expect(page.locator('#nav-road')).toHaveText('Estrada do Joá');
    await expect(page.locator('#nav-gps')).toBeVisible();
    await expect(page.locator('#nav-fix-text')).toHaveText('Weak GPS ±60 m');

    await context.setGeolocation({
      latitude: lat,
      longitude: lon(20),
      accuracy: 5,
    });
    await expect(page.locator('#nav-road')).toHaveText('You have arrived');
    await expect(page.locator('#nav-then')).toBeHidden();

    await page.getByRole('button', { name: 'Stop navigation' }).click();
    await expect(screen).toBeHidden();
    await expect(page.locator('#navigate')).toBeFocused();
  });

  test('the notice can be turned off and back on in Settings', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    await page.getByLabel("Don't show this notice again").check();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#nav-screen')).toBeHidden();
    // Started again: straight to the navigation screen.
    await page.locator('#navigate').click();
    await expect(page.locator('#nav-screen')).toBeVisible();
    await expect(page.locator('#nav-notice')).toBeHidden();
    await page.locator('#nav-stop').click();
    await page.locator('#open-settings').click();
    const setting = page.getByLabel('Show the notice when navigation starts');
    await expect(setting).not.toBeChecked();
    await setting.check();
    await page.keyboard.press('Escape');
    await page.locator('#navigate').click();
    await expect(page.locator('#nav-notice')).toBeVisible();
  });

  test('location is watched only while navigating and the page is visible', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const geo = navigator.geolocation;
      const watch = geo.watchPosition.bind(geo),
        clear = geo.clearWatch.bind(geo);
      const w = window as unknown as { watching: number; hidden: boolean };
      w.watching = 0;
      w.hidden = false;
      geo.watchPosition = (...args) => {
        w.watching++;
        return watch(...args);
      };
      geo.clearWatch = (id) => {
        w.watching--;
        clear(id);
      };
      Object.defineProperty(document, 'visibilityState', {
        get: () => (w.hidden ? 'hidden' : 'visible'),
      });
    });
    await setup(page);
    const watching = () =>
      page.evaluate(() => (window as unknown as { watching: number }).watching);
    expect(await watching()).toBe(0);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    expect(await watching()).toBe(1);
    const visibility = (hidden: boolean) =>
      page.evaluate((value) => {
        (window as unknown as { hidden: boolean }).hidden = value;
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await visibility(true);
    await expect.poll(watching).toBe(0);
    await visibility(false);
    await expect.poll(watching).toBe(1);
    await page.locator('#nav-stop').click();
    await expect.poll(watching).toBe(0);
    // No position ever reaches the address or storage.
    expect(page.url()).not.toContain(String(lon(6)).slice(0, 7));
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toContain('-43.234');
  });

  test('the whole-route view has a clear way back to following', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    await page.getByRole('button', { name: 'Route overview' }).click();
    await expect(page.locator('#nav-rotor')).not.toHaveAttribute(
      'style',
      /rotate/,
    );
    const resume = page.getByRole('button', { name: 'Resume navigation' });
    await expect(resume).toBeVisible();
    await expect(resume).toBeFocused();
    // On top of the map, where a finger reaches it, not under its layers.
    const onTop = () =>
      page.evaluate(() =>
        ['nav-resume', 'nav-overview', 'nav-stop'].filter((id) => {
          const e = document.getElementById(id)!;
          if (e.hidden) return false;
          const b = e.getBoundingClientRect();
          const hit = document.elementFromPoint(
            b.x + b.width / 2,
            b.y + b.height / 2,
          );
          return !e.contains(hit);
        }),
      );
    expect(await onTop()).toEqual([]);
    await expect(page.locator('#nav-overview')).toBeHidden();
    await resume.click();
    await expect(resume).toBeHidden();
    await expect(page.locator('#nav-overview')).toBeVisible();
    expect(await onTop()).toEqual([]);
    await expect(page.locator('#nav-rotor')).toHaveAttribute(
      'style',
      /rotate\(-90deg\)/,
    );
  });

  test('stopped, the map turns with the compass; moving, with the route', async ({
    page,
    context,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    const rotor = page.locator('#nav-rotor');
    // The route runs east: without a compass the map turns to it.
    await expect(rotor).toHaveAttribute('style', /rotate\(-90deg\)/);
    const turned = async (selector: string) =>
      Number(
        /rotate\((-?[\d.]+)deg\)/.exec(
          (await page.locator(selector).getAttribute('style')) ?? '',
        )?.[1],
      );
    // Here magnetic north is about 23° west of true north (WMM2025).
    const declination = magneticDeclination(
      lat,
      lon(6),
      decimalYear(new Date()),
    );
    // Standing still, the phone's top pointing to magnetic north.
    await page.evaluate(() =>
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientationabsolute', {
          alpha: 0,
          absolute: true,
        }),
      ),
    );
    // The map turns to true north, the declination away from magnetic north.
    await expect
      .poll(() => turned('.nav-arrow'))
      .toBeCloseTo((declination + 360) % 360, 0);
    expect(await turned('#nav-rotor')).toBeCloseTo(
      -((declination + 360) % 360),
      0,
    );
    await expect(page.locator('#nav-compass')).toBeHidden();
    // iOS gives its own heading and accuracy; a poor one asks to calibrate.
    await page.evaluate(() => {
      const event = new DeviceOrientationEvent('deviceorientation', {
        alpha: 10,
        absolute: false,
      });
      Object.defineProperty(event, 'webkitCompassHeading', { value: 90 });
      Object.defineProperty(event, 'webkitCompassAccuracy', { value: -1 });
      for (let i = 0; i < 40; i++) window.dispatchEvent(event);
    });
    await expect(page.locator('#nav-compass')).toBeVisible();
    await expect
      .poll(() => turned('.nav-arrow'))
      .toBeCloseTo(90 + declination, 0);
    // Moving about 300 m in a moment: the direction of travel wins.
    await context.setGeolocation({
      latitude: lat,
      longitude: lon(9),
      accuracy: 5,
    });
    await expect(rotor).toHaveAttribute('style', /rotate\(-90deg\)/);
    await expect(page.locator('#nav-compass')).toBeHidden();
  });

  test('without map tiles the route still shows with a notice', async ({
    page,
  }) => {
    await setup(page);
    await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-no-map')).toBeVisible();
    await expect(page.locator('#nav-map path.nav-route')).toHaveCount(1);
  });

  for (const [language, width] of [
    ['en', 320],
    ['pt', 320],
    ['pt', 360],
    ['en', 430],
  ] as const)
    test(`navigation text fits at ${width} px in ${language} with long values`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 640 });
      // A slow average speed (a device preference) for a time over an hour.
      await page.addInitScript(() =>
        localStorage.setItem('average-speed', '1'),
      );
      await setup(page, longName);
      await chooseUnits(page, { distance: 'imperial' });
      await page.locator('#language').selectOption(language);
      expect(await fits(page)).toEqual([]);
      await page.locator('#navigate').click();
      expect(await fits(page)).toEqual([]);
      await page.locator('#nav-notice-start').click();
      await context.setGeolocation({
        latitude: lat + 0.0003,
        longitude: lon(3),
        accuracy: 400,
      });
      await expect(page.locator('#nav-gps')).toBeVisible();
      await expect(page.locator('#nav-road')).toHaveText(longName);
      await expect(page.locator('#nav-time')).toContainText('h');
      expect(await fits(page)).toEqual([]);
      // The long name wraps to two lines at most, below the distance.
      const lines = await page
        .locator('#nav-road')
        .evaluate(
          (e) =>
            e.getBoundingClientRect().height /
            parseFloat(getComputedStyle(e).lineHeight),
        );
      expect(lines).toBeLessThanOrEqual(2.05);
    });
});

test('a denied location permission ends navigation with a message', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.locator('#navigate').click();
  await page.locator('#nav-notice-start').click();
  await expect(page.locator('#nav-screen')).toBeHidden();
  await expect(page.locator('#status')).toContainText(
    'Location permission denied',
  );
});

test('wide screens keep Download GPX as the main action', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page);
  await expect(page.locator('#navigate')).toBeHidden();
  await expect(page.locator('#download')).toHaveClass(/primary/);
  await expect(page.locator('#download')).toContainText('Download GPX');
});
