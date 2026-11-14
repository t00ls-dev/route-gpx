import { test, expect, type BrowserContext, type Page } from '@playwright/test';
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

    await page.getByRole('button', { name: 'End navigation' }).click();
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
    // The screen, not its first button, takes focus: none looks selected.
    await expect(page.locator('#nav-screen')).toBeFocused();
    // From the keyboard, focus moves to the button that replaces it.
    await page.getByRole('button', { name: 'Route overview' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#nav-rotor')).toHaveAttribute('data-turn', '0');
    const resume = page.getByRole('button', { name: 'Re-center' });
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
      'data-turn',
      '-90',
    );
  });

  test('the map zooms and pans by touch, with Resume back to following', async ({
    page,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    const rotor = page.locator('#nav-rotor'),
      resume = page.locator('#nav-resume'),
      marker = page.locator('.nav-arrow');
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    await expect(resume).toBeHidden();
    const stage = (await page.locator('#nav-stage').boundingBox())!;
    const x = stage.x + 120,
      y = stage.y + 200;
    // A double tap zooms in around the traveler and keeps following.
    const before = (await marker.boundingBox())!;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
    await expect(resume).toBeVisible();
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    const zoomed = (await marker.boundingBox())!;
    expect(Math.abs(zoomed.x - before.x)).toBeLessThan(2);
    expect(Math.abs(zoomed.y - before.y)).toBeLessThan(2);
    await resume.click();
    await expect(resume).toBeHidden();
    // The browser's long-press menu never opens on the map: selection is
    // off on the whole page while navigating (iOS ignores it on the map).
    expect(
      await page.evaluate(() => getComputedStyle(document.body).userSelect),
    ).toBe('none');
    // The browser's long-press menu never opens on the map.
    expect(
      await page.evaluate(() =>
        document
          .getElementById('nav-map')!
          .dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
          ),
      ),
    ).toBe(false);
    // Touches on the map are cancelled, so iOS starts no loupe or callout.
    expect(
      await page.evaluate(() => {
        const canvas = document.querySelector('#nav-map canvas')!;
        const touch = new Touch({
          identifier: 9,
          target: canvas,
          clientX: 100,
          clientY: 300,
        });
        const init = { touches: [touch], changedTouches: [touch] };
        const cancelled = !canvas.dispatchEvent(
          new TouchEvent('touchstart', {
            ...init,
            bubbles: true,
            cancelable: true,
          }),
        );
        canvas.dispatchEvent(
          new TouchEvent('touchend', {
            changedTouches: [touch],
            bubbles: true,
          }),
        );
        return cancelled;
      }),
    ).toBe(true);
    // A pan on the turned map follows the finger and stops following.
    const drag = async (dx: number, dy: number) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 8 });
      await page.mouse.up();
    };
    const start = (await marker.boundingBox())!;
    await drag(-60, 80);
    const moved = (await marker.boundingBox())!;
    expect(moved.x - start.x).toBeLessThan(-40);
    expect(moved.y - start.y).toBeGreaterThan(60);
    await expect(resume).toBeVisible();
    // Panned, the map stays as the finger left it: the compass no longer
    // turns it.
    await page.evaluate(() =>
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientationabsolute', {
          alpha: 0,
          absolute: true,
        }),
      ),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLElement>('.nav-arrow')!.style.transform,
        ),
      )
      .not.toBe('rotate(0deg)');
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    await resume.click();
    await expect(resume).toBeHidden();
    // The whole route stays north-up when panned.
    await page.locator('#nav-overview').click();
    await drag(40, 0);
    await expect(page.locator('#nav-overview')).toBeVisible();
    await expect(rotor).toHaveAttribute('data-turn', '0');
  });

  test('one finger zooms: double tap and drag, around the traveler', async ({
    page,
    context,
  }) => {
    await setup(page);
    const zoom = async () =>
      Number(await page.locator('#nav-rotor').getAttribute('data-zoom'));
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    await expect.poll(zoom).toBeGreaterThan(0);
    const before = await zoom();
    const marker = (await page.locator('.nav-arrow').boundingBox())!;
    const stage = (await page.locator('#nav-stage').boundingBox())!;
    const x = stage.x + 120,
      y = stage.y + stage.height / 3;
    const session = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty = y) =>
      session.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty }],
      });
    await touch('touchStart');
    await touch('touchEnd');
    await page.waitForTimeout(80);
    await touch('touchStart');
    for (let step = 1; step <= 10; step++) {
      await touch('touchMove', y + 22 * step);
      await page.waitForTimeout(30);
    }
    await touch('touchEnd');
    await expect.poll(zoom).toBeGreaterThanOrEqual(before + 1);
    // A zoom, not a pan: still following, the traveler where it was.
    await expect(page.locator('#nav-resume')).toBeVisible();
    await expect(page.locator('#nav-rotor')).toHaveAttribute(
      'data-turn',
      '-90',
    );
    const after = (await page.locator('.nav-arrow').boundingBox())!;
    expect(Math.abs(after.x - marker.x)).toBeLessThan(2);
    expect(Math.abs(after.y - marker.y)).toBeLessThan(2);
  });

  test('two fingers turning turn the map; Re-center turns it back', async ({
    page,
    context,
  }) => {
    await setup(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-fix-text')).toHaveText('GPS on ±6 m');
    const rotor = page.locator('#nav-rotor'),
      resume = page.getByRole('button', { name: 'Re-center' });
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    const stage = (await page.locator('#nav-stage').boundingBox())!;
    const cx = stage.x + stage.width / 2,
      cy = stage.y + stage.height / 2,
      r = 80;
    const session = await context.newCDPSession(page);
    // Two fingers on a circle, turning together by `degrees` clockwise.
    const fingers = (degrees: number) => {
      const a = (degrees * Math.PI) / 180;
      return [
        { x: cx - r * Math.cos(a), y: cy - r * Math.sin(a), id: 0 },
        { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), id: 1 },
      ];
    };
    const turn = async (degrees: number) => {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: fingers(0),
      });
      for (let step = 1; step <= 10; step++)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: fingers((degrees * step) / 10),
        });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    };
    const angle = async () => Number(await rotor.getAttribute('data-turn'));
    // A small twist during a pinch does not turn the map.
    await turn(8);
    expect(await angle()).toBeCloseTo(-90, 0);
    await expect(resume).toBeHidden();
    // Past MapLibre's threshold the map turns clockwise with the fingers.
    await turn(45);
    expect(await angle()).toBeGreaterThan(-65);
    expect(await angle()).toBeLessThan(-40);
    await expect(resume).toBeVisible();
    // At the bottom left, where a thumb reaches it.
    const box = (await resume.boundingBox())!;
    expect(box.x).toBeLessThan(20);
    expect(box.y + box.height).toBeGreaterThan(stage.y + stage.height - 60);
    await resume.click();
    await expect(resume).toBeHidden();
    expect(await angle()).toBeCloseTo(-90, 0);
    // The compass shows on a turned map; it turns the map north-up and
    // keeps following, and Re-center goes back to heading-up.
    const compass = page.getByRole('button', { name: 'North up' });
    await expect(compass).toBeVisible();
    await compass.click();
    await expect(rotor).toHaveAttribute('data-turn', '0');
    await expect(compass).toBeHidden();
    await expect(resume).toBeVisible();
    await resume.click();
    expect(await angle()).toBeCloseTo(-90, 0);
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
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    const turned = async () => Number(await rotor.getAttribute('data-turn'));
    const arrow = () =>
      page
        .locator('.nav-arrow')
        .evaluate((e) => (e as HTMLElement).style.transform);
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
    // The map turns to true north, the declination away from magnetic
    // north, and the arrow points up the screen.
    await expect
      .poll(() => turned())
      .toBeCloseTo(-((declination + 360) % 360), 0);
    expect(await arrow()).toBe('rotate(0deg)');
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
    await expect.poll(() => turned()).toBeCloseTo(-(90 + declination), 0);
    // Moving about 300 m in a moment: the direction of travel wins.
    await context.setGeolocation({
      latitude: lat,
      longitude: lon(9),
      accuracy: 5,
    });
    await expect(rotor).toHaveAttribute('data-turn', '-90');
    await expect(page.locator('#nav-compass')).toBeHidden();
  });

  for (const [language, width] of [
    ['en', 390],
    ['pt', 320],
  ] as const)
    test(`off the route, a straight-line hint points back to it (${language}, ${width} px)`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await setup(page);
      await page.locator('#language').selectOption(language);
      await page.locator('#navigate').click();
      await page.locator('#nav-notice-start').click();
      const road = page.locator('#nav-road'),
        hint = page.locator('#nav-hint');
      await expect(road).toHaveText('Estrada das Furnas');
      await expect(hint).toBeHidden();
      const zoom = async () =>
        Number(await page.locator('#nav-rotor').getAttribute('data-zoom'));
      await expect.poll(zoom).toBeGreaterThan(0);
      const following = await zoom();
      // About 330 m north of the route: off it only once it lasts 5 s.
      const off = (shift: number) =>
        context.setGeolocation({
          latitude: lat + 0.003 + shift,
          longitude: lon(7),
          accuracy: 8,
        });
      await off(0);
      await page.waitForTimeout(1000);
      await expect(hint).toBeHidden();
      await page.waitForTimeout(4500);
      await off(0.00001);
      const back = language === 'pt' ? 'Volte à rota' : 'Back to route';
      await expect(road).toHaveText(back);
      await expect(hint).toHaveText(
        language === 'pt'
          ? 'Em linha reta, não pelas ruas'
          : 'Straight line, not by road',
      );
      await expect(page.locator('#nav-screen')).toHaveClass(/off-route/);
      await expect(page.locator('#nav-then')).toBeHidden();
      await expect(page.locator('#nav-announce')).toHaveText(
        language === 'pt'
          ? 'Fora da rota · Volte à rota'
          : 'Off the route · Back to route',
      );
      // Straight-line distance to a point ahead, rounded like maneuvers.
      await expect(page.locator('#nav-distance')).toHaveText(/^\d+ m$/);
      // On the map turned east-up, the route (south) is to the right and
      // ahead (east) is up: the arrow points up and to the right.
      const angle = Number(
        /rotate\((-?[\d.]+)deg\)/.exec(
          (await page.locator('#nav-turn svg.rejoin').getAttribute('style')) ??
            '',
        )?.[1],
      );
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThan(90);
      // The map steps out so the rejoin point shows.
      await expect.poll(zoom).toBeLessThan(following);
      expect(await fits(page)).toEqual([]);
      // Back on the route, the maneuver returns at the chosen zoom.
      await context.setGeolocation({
        latitude: lat,
        longitude: lon(8),
        accuracy: 5,
      });
      await expect(road).toHaveText('Estrada das Furnas');
      await expect(hint).toBeHidden();
      await expect(page.locator('#nav-screen')).not.toHaveClass(/off-route/);
      await expect.poll(zoom).toBeCloseTo(following, 1);
    });

  /**
   * Recalculation requests (any routing request not from the planned
   * start), answered with a path east then south back to the route, or
   * refused. Registered after `setup`, so it is matched first.
   */
  async function mockReroute(page: Page, ok = true) {
    const asked: string[] = [];
    const reroute = (url: string) => !url.includes(`/${lon(0)},${lat};`);
    await page.route('**/route/v1/driving/**', (r) => {
      if (!reroute(r.request().url())) return r.fallback();
      asked.push(r.request().url());
      if (!ok) return r.fulfill({ status: 503, body: '' });
      const [from, to] = decodeURIComponent(
        r.request().url().split('/driving/')[1].split('?')[0],
      )
        .split(';')
        .map((p) => p.split(',').map(Number));
      const corner = [to[0], from[1]];
      return r.fulfill({
        json: {
          code: 'Ok',
          waypoints: [from, to].map((location) => ({ location, distance: 0 })),
          routes: [
            {
              distance: 700,
              duration: 60,
              geometry: { coordinates: [from, corner, to] },
              legs: [
                {
                  steps: [
                    {
                      name: 'Rua Lateral',
                      distance: 400,
                      duration: 30,
                      maneuver: { type: 'depart', location: from },
                    },
                    {
                      name: 'Rua de Volta',
                      distance: 300,
                      duration: 30,
                      maneuver: {
                        type: 'turn',
                        modifier: 'right',
                        location: corner,
                      },
                    },
                    {
                      name: '',
                      distance: 0,
                      duration: 0,
                      maneuver: { type: 'arrive', location: to },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
    });
    await page.route('**/valhalla1.openstreetmap.de/**', (r) => {
      asked.push(r.request().url());
      return r.fulfill({ status: 503, body: '' });
    });
    return asked;
  }
  /** About 330 m north of the route at the 0.7 km mark; `shift` makes a new fix. */
  const offRoute = (context: BrowserContext, shift = 0) =>
    context.setGeolocation({
      latitude: lat + 0.003 + shift,
      longitude: lon(7) + shift,
      accuracy: 8,
    });

  test('off the route for 15 s, the route is recalculated once', async ({
    page,
    context,
  }) => {
    await setup(page);
    const asked = await mockReroute(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-road')).toHaveText('Estrada das Furnas');
    // New fixes every few seconds while off the route.
    for (let i = 0; i < 7; i++) {
      await offRoute(context, i * 0.00001);
      await page.waitForTimeout(3000);
    }
    await expect(page.locator('#nav-road')).toHaveText('Rua de Volta');
    await expect(page.locator('#nav-rerouted')).toBeVisible();
    await expect(page.locator('#nav-screen')).not.toHaveClass(/off-route/);
    expect(asked).toHaveLength(1);
    // Only the position, rounded to 4 decimals (about 10 m), is sent.
    const [from] = asked[0].split('/driving/')[1].split(';');
    const [x, y] = from.split(',');
    expect(x).toMatch(/^-43\.\d{4}$/);
    expect(y).toMatch(/^-22\.\d{4}$/);
    expect(Number(y)).toBeCloseTo(lat + 0.003, 3);
    // The planned route goes on after the recalculated path.
    await expect(page.locator('#nav-then')).toBeVisible();
    // Nothing more within the minute, and the planner's route is unchanged.
    await page.waitForTimeout(2000);
    expect(asked).toHaveLength(1);
    await page.locator('#nav-stop').click();
    expect(page.url()).not.toContain('43.233');
  });

  test('Recalculate route asks once; a failure keeps the hint', async ({
    page,
    context,
  }) => {
    await setup(page);
    const asked = await mockReroute(page, false);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-road')).toHaveText('Estrada das Furnas');
    const button = page.getByRole('button', { name: 'Recalculate route' });
    await offRoute(context);
    await page.waitForTimeout(5500);
    await offRoute(context, 0.00001);
    await expect(page.locator('#nav-road')).toHaveText('Back to route');
    await expect(button).toBeEnabled();
    await button.click();
    // OSRM, then the Valhalla fallback once; no retry.
    await expect(page.locator('#nav-reroute-failed')).toBeVisible({
      timeout: 10000,
    });
    expect(asked).toHaveLength(2);
    await expect(page.locator('#nav-road')).toHaveText('Back to route');
    await expect(page.locator('#nav-hint')).toBeVisible();
    // The button waits out the minute, saying how long.
    const waiting = page.locator('#nav-reroute');
    await expect(waiting).toBeDisabled();
    await expect(waiting).toHaveText(/^Recalculate in \d+ s$/);
    expect(await fits(page)).toEqual([]);
    // Offline, there is no button and nothing is sent.
    await context.setOffline(true);
    await offRoute(context, 0.00002);
    await expect(waiting).toBeHidden();
    expect(asked).toHaveLength(2);
    await context.setOffline(false);
  });

  test('the recalculation texts fit at 320 px in Portuguese', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await setup(page);
    await page.locator('#language').selectOption('pt');
    await mockReroute(page, false);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await offRoute(context);
    await page.waitForTimeout(5500);
    await offRoute(context, 0.00001);
    const button = page.getByRole('button', { name: 'Recalcular rota' });
    await expect(button).toBeVisible();
    expect(await fits(page)).toEqual([]);
    await button.click();
    await expect(page.locator('#nav-reroute-failed')).toHaveText(
      'Não foi possível recalcular a rota',
      { timeout: 10000 },
    );
    await expect(page.locator('#nav-reroute')).toHaveText(
      /^Recalcular em \d+ s$/,
    );
    expect(await fits(page)).toEqual([]);
  });

  test('without map tiles the route still shows with a notice', async ({
    page,
  }) => {
    await setup(page);
    await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-no-map')).toBeVisible();
    await expect(page.locator('#nav-no-gl')).toBeHidden();
    await expect(page.locator('#nav-rotor')).toHaveAttribute(
      'data-turn',
      '-90',
    );
    // The route ahead draws up the screen from the traveler, in its color,
    // over the neutral background.
    const arrow = (await page.locator('.nav-arrow').boundingBox())!;
    const color = async (x: number, y: number) => {
      const png = await page.screenshot({
        clip: { x, y, width: 1, height: 1 },
      });
      return page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      }, png.toString('base64'));
    };
    const cx = arrow.x + arrow.width / 2;
    await expect
      .poll(() => color(cx, arrow.y - 60))
      .toEqual([0x12, 0x79, 0x6e]);
    expect(await color(cx + 60, arrow.y - 60)).toEqual([0xe9, 0xec, 0xe9]);
  });

  test('without WebGL the directions still guide, with a notice', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        return /webgl/.test(type)
          ? null
          : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof get;
    });
    await setup(page);
    await page.locator('#navigate').click();
    await page.locator('#nav-notice-start').click();
    await expect(page.locator('#nav-no-gl')).toBeVisible();
    await expect(page.locator('#nav-no-map')).toBeHidden();
    await expect(page.locator('#nav-road')).toHaveText('Estrada das Furnas');
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
