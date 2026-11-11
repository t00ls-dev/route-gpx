import { test, expect, type Page } from '@playwright/test';
import { chooseUnits } from './unit-settings';
const base = 'http://127.0.0.1:5173/';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: { features: [] } }),
  );
});
const sheetHeight = async (page: Page) =>
  Math.round((await page.locator('#sheet').boundingBox())!.height);

test('trip options are available before a route exists', async ({ page }) => {
  await page.goto(base);
  await expect(page.locator('#summary')).toBeHidden();
  for (const id of ['departure', 'average-speed', 'prefer'])
    await expect(page.locator(`#trip-options #${id}`)).toBeVisible();
  // Units moved to Settings and apply at once.
  await expect(page.locator('#trip-options select')).toHaveCount(0);
  await chooseUnits(page, { distance: 'imperial' });
  await expect(page.locator('#speed-unit')).toHaveText('mph');
});

test('settings open in a dialog, report errors inside it and close when applied', async ({
  page,
}) => {
  await page.goto(base);
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeHidden();
  await page.locator('#open-settings').click();
  await expect(dialog).toBeVisible();
  await page.locator('#osrm').fill('https://user:secret@router.example');
  await page.locator('#save-settings').click();
  await expect(dialog).toBeVisible();
  await expect(page.locator('#settings-status')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#open-settings')).toBeFocused();
  await page.locator('#open-settings').click();
  await expect(page.locator('#settings-status')).toBeEmpty();
  // Closing without applying discards the edit.
  await expect(page.locator('#osrm')).toHaveValue(
    'https://router.project-osrm.org',
  );
  await page.locator('#photon').fill('https://photon.example');
  await page.locator('#save-settings').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#status')).toHaveText('Settings applied.');
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#open-settings')).toHaveAccessibleName(
    'Configurações',
  );
});

test('wide screens collapse the side panel from its header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(base);
  const map = () => page.locator('#map').boundingBox();
  expect((await map())!.width).toBe(880);
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#route-panel')).toBeHidden();
  await expect.poll(async () => (await map())!.width).toBe(1280);
  await expect(page.locator('#panel-toggle')).toBeVisible();
  await page.locator('#panel-toggle').click();
  await expect(page.locator('#download')).toBeVisible();
});

test.describe('bottom sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('closed sheet keeps status and export actions; More actions shows the rest', async ({
    page,
  }) => {
    await page.goto(base);
    await page.locator('#panel-toggle').click();
    await expect(page.locator('#route-panel')).toBeHidden();
    await expect(page.locator('#peek-status')).toHaveText(
      'Set your start and destination.',
    );
    await expect(page.locator('#download')).toBeVisible();
    await expect(page.locator('#share')).toBeVisible();
    await expect(page.locator('#route-name')).toBeHidden();
    const more = page.locator('#more-actions');
    await expect(more).toHaveAccessibleName('More actions');
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#route-name')).toBeVisible();
    await expect(page.locator('#save-route')).toBeVisible();
    await expect(page.locator('.secondary-actions .file-button')).toBeVisible();
    await more.click();
    await expect(page.locator('#route-name')).toBeHidden();
  });

  test('dragging the handle moves between closed, half and full height', async ({
    page,
    context,
  }) => {
    await page.goto(base);
    const half = await sheetHeight(page);
    expect(half).toBe(464);
    const session = await context.newCDPSession(page);
    const drag = async (to: number) => {
      const handle = (await page.locator('#panel-toggle').boundingBox())!;
      const from = handle.y + 10;
      const touch = (
        type: 'touchStart' | 'touchMove' | 'touchEnd',
        y?: number,
      ) =>
        session.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: y === undefined ? [] : [{ x: 195, y }],
        });
      await touch('touchStart', from);
      for (let step = 1; step <= 8; step++)
        await touch('touchMove', from + ((to - from) * step) / 8);
      await touch('touchEnd');
    };
    await drag(70);
    await expect(page.locator('body')).toHaveClass(/sheet-full/);
    await expect.poll(() => sheetHeight(page)).toBe(784);
    await expect(page.locator('#route-panel')).toBeVisible();
    await drag(420);
    await expect(page.locator('body')).not.toHaveClass(/sheet-full/);
    await expect.poll(() => sheetHeight(page)).toBe(half);
    await drag(830);
    await expect(page.locator('#route-panel')).toBeHidden();
    await expect(page.locator('#panel-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // The first tap after a drag still toggles, and reopens at the last open
    // height; browsers may drop the click of that tap.
    await page.locator('#panel-toggle').tap();
    await expect(page.locator('#route-panel')).toBeVisible();
    await expect.poll(() => sheetHeight(page)).toBe(half);
    await drag(70);
    await expect.poll(() => sheetHeight(page)).toBe(784);
    await page.locator('#panel-toggle').tap();
    await expect(page.locator('#route-panel')).toBeHidden();
  });

  test('arrow keys on the handle change the sheet height', async ({ page }) => {
    await page.goto(base);
    const handle = page.locator('#panel-toggle');
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('body')).toHaveClass(/sheet-full/);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('body')).toHaveClass(/sheet-full/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#route-panel')).toBeHidden();
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
    // Enter toggles back to the last open height.
    await page.keyboard.press('Enter');
    await expect(page.locator('#route-panel')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/sheet-full/);
  });
});

test.describe('phone summary', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    timezoneId: 'America/Sao_Paulo',
  });
  test('arrival on another day keeps the time on one line, with the date below', async ({
    page,
  }) => {
    // 23:20 local: the automatic departure is 23:30 and the arrival after midnight.
    await page.clock.setFixedTime(new Date('2026-11-11T02:20:00Z'));
    await page.route('**/route/v1/driving/**', async (r) => {
      const part = new URL(r.request().url()).pathname.split('/driving/')[1]!;
      const coords = part.split(';').map((p) => p.split(',').map(Number));
      await r.fulfill({
        json: {
          code: 'Ok',
          waypoints: coords.map((location) => ({ location, distance: 0 })),
          routes: [
            {
              distance: 30900,
              duration: 2000,
              geometry: { coordinates: coords },
              legs: [{ steps: [] }],
            },
          ],
        },
      });
    });
    await page.addInitScript(() => localStorage.setItem('average-speed', '25'));
    await page.goto(base);
    await page.locator('#language').selectOption('pt');
    await page.locator('#location-0').fill('-22.591897, -43.416001');
    await page.locator('#location-1').fill('-22.692000, -43.459000');
    await page.locator('#location-1').press('Tab');
    await expect(page.locator('#download')).toBeEnabled({ timeout: 15000 });
    const arrival = page.locator('#summary .stats > div').nth(2);
    await expect(arrival.locator('strong')).toHaveText('00:44');
    await expect(arrival.locator('dd span')).toHaveText('11 de nov.');
    // Each value stays on one line, and the three point actions share a row.
    for (const value of await page.locator('#summary .stats strong').all())
      expect(
        await value.evaluate((e) => {
          const range = document.createRange();
          range.selectNodeContents(e);
          return new Set([...range.getClientRects()].map((r) => r.top)).size;
        }),
      ).toBe(1);
    const tops = await page
      .locator('.inline-actions > button')
      .evaluateAll((buttons) =>
        buttons.map((b) => Math.round(b.getBoundingClientRect().top)),
      );
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe('narrow phone', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true });
  test('Set on map keeps its name with the pin only, and Departure sits below its label', async ({
    page,
  }) => {
    await page.goto(base);
    const onMap = page
      .locator('#points li.selected .point-actions button')
      .first();
    await expect(onMap).toHaveAccessibleName('Set on map');
    await expect(onMap.locator('.button-label')).toBeHidden();
    const label = (await page.locator('label[for=departure]').boundingBox())!;
    const field = (await page.locator('#departure').boundingBox())!;
    expect(field.y).toBeGreaterThanOrEqual(label.y + label.height - 1);
    expect(Math.round(field.height)).toBe(44);
    await expect(page.locator('.departure-automatic')).toHaveText(
      'Automatic departure',
    );
  });
});
