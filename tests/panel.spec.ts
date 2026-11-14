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

  test('the open sheet shows the status once, at the top, and Calculate route spans its row', async ({
    page,
  }) => {
    await page.goto(base);
    const message =
      'Route imported. Edits recalculate only the changed sections.';
    await page.evaluate((text) => {
      document.getElementById('status')!.textContent = text;
    }, message);
    const peek = page.locator('#peek-status');
    await expect(peek).toHaveText(message);
    // Whole in up to two lines, not cut off.
    const lines = await peek.evaluate((element) => ({
      clipped: element.scrollHeight > element.clientHeight + 1,
      count: Math.round(
        element.clientHeight / parseFloat(getComputedStyle(element).lineHeight),
      ),
    }));
    expect(lines).toEqual({ clipped: false, count: 2 });
    // The panel row keeps the live region for screen readers only.
    const status = page.locator('#status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    expect((await status.boundingBox())!.width).toBeLessThanOrEqual(1);
    const row = (await page.locator('.status-row').boundingBox())!,
      calculate = (await page.locator('#calculate').boundingBox())!;
    expect(Math.abs(calculate.width - row.width)).toBeLessThanOrEqual(1);
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

for (const [width, language] of [
  [320, 'en'],
  [320, 'pt'],
  [390, 'pt'],
  [1280, 'en'],
  [1280, 'pt'],
] as const)
  test(`footer links sit on one line with icons at ${width}px in ${language}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(base);
    await page.locator('#language').selectOption(language);
    // Help left the header for the footer; Settings is a gear.
    await expect(page.locator('header #help')).toHaveCount(0);
    await expect(
      page.locator('#open-settings .icon-settings circle'),
    ).toHaveCount(1);
    const footer = page.locator('#route-panel footer');
    await expect(footer.locator('a')).toHaveText(
      language === 'pt'
        ? ['Ajuda', 'Novidades', 'GitHub']
        : ['Help', "What's new", 'GitHub'],
    );
    await expect(footer).not.toContainText(/servers|servidores/i);
    for (const [id, name] of [
      ['help', 'help'],
      ['changelog', 'news'],
      ['github', 'github'],
    ])
      await expect(footer.locator(`#${id} .icon-${name}`)).toHaveCount(1);
    await expect(footer.locator('.icon-external')).toHaveCount(0);
    const box = (await footer.boundingBox())!;
    const links = await footer
      .locator('a')
      .evaluateAll((els) =>
        els.map((e) => [
          e.getBoundingClientRect().left,
          e.getBoundingClientRect().right,
          e.getBoundingClientRect().top,
          e.getBoundingClientRect().height,
        ]),
      );
    // One line, inside the footer, each link on a single line.
    for (const [left, right, top, height] of links) {
      expect(top).toBeCloseTo(links[0][2], 0);
      expect(height).toBeLessThanOrEqual(48);
      expect(left).toBeGreaterThanOrEqual(box.x);
      expect(right).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    const before = links[0][0] - box.x,
      after = box.x + box.width - links.at(-1)![1];
    // Phones center the links; the desktop panel keeps them to the right.
    if (width < 760) expect(Math.abs(before - after)).toBeLessThan(2);
    else expect(after).toBeLessThan(2);
  });

for (const width of [320, 390, 1280])
  test(`the space reserved for the first two points matches them at ${width} px`, async ({
    page,
  }) => {
    // style.css reserves this height while the list is empty, so the panel
    // below does not shift on load; it must follow the rows' real height.
    await page.setViewportSize({ width, height: 800 });
    await page.goto(base);
    for (const language of ['en', 'pt']) {
      await page.locator('#language').selectOption(language);
      await expect(page.locator('#points > li')).toHaveCount(2);
      const [rendered, reserved] = await page.evaluate(() => {
        const list = document.getElementById('points')!;
        const rows = [...list.children];
        const height = () => list.getBoundingClientRect().height;
        const rendered = height();
        list.replaceChildren();
        const reserved = height();
        list.replaceChildren(...rows);
        return [rendered, reserved];
      });
      expect(Math.abs(rendered - reserved)).toBeLessThanOrEqual(1);
    }
  });

for (const mobile of [false, true])
  test(`disabled buttons keep their disabled look under hover (${mobile ? 'phone' : 'desktop'})`, async ({
    page,
  }) => {
    // A tap leaves :hover on touch screens; a disabled button (Download GPX
    // before a route exists) must not then look enabled.
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await page.goto(base);
    await expect(page.locator('#download')).toBeDisabled();
    const disabled = page.locator('button:disabled:visible');
    const count = await disabled.count();
    expect(count).toBeGreaterThan(0);
    const look = (i: number) =>
      disabled.nth(i).evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.color, style.borderColor];
      });
    for (let i = 0; i < count; i++) {
      await page.mouse.move(0, 0);
      const before = await look(i);
      await disabled.nth(i).hover({ force: true });
      expect(
        await look(i),
        await disabled.nth(i).evaluate((e) => e.id || e.textContent),
      ).toEqual(before);
    }
  });

test.describe('add to home screen', () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  for (const [width, lang] of [
    [320, 'pt'],
    [320, 'en'],
    [430, 'pt'],
  ] as const)
    test(`More actions shows the steps for this phone at ${width} px in ${lang}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(`${base}?lang=${lang}`);
      await page.locator('#more-actions').click();
      const button = page.locator('#add-home');
      await expect(button).toBeVisible();
      // The label stays on one line inside the button.
      expect(
        await button.evaluate((e) => {
          const label = e.querySelector('.button-label')!;
          return (
            e.scrollWidth <= e.clientWidth + 1 &&
            label.getBoundingClientRect().height < 24
          );
        }),
      ).toBe(true);
      await button.click();
      const dialog = page.locator('#home-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-platform="ios"]')).toBeVisible();
      await expect(dialog.locator('[data-platform="android"]')).toBeHidden();
      await expect(dialog).toContainText(
        lang === 'pt' ? 'Adicionar à Tela de Início' : 'Add to Home Screen',
      );
      // Help opens at its section, in the same language.
      await expect(page.locator('#home-help')).toHaveAttribute(
        'href',
        new RegExp(`help\\.html\\?lang=${lang}&section=home-screen`),
      );
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
      await page.locator('#close-home').click();
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
    });

  test('only the map zooms: the planner page blocks page zoom, Help keeps pinch', async ({
    page,
  }) => {
    await page.goto(base);
    const touch = (selector: string) =>
      page.locator(selector).evaluate((e) => getComputedStyle(e).touchAction);
    expect(await touch('html')).toBe('manipulation');
    expect(await touch('body')).toBe('pan-x pan-y');
    expect(await touch('#map')).toBe('none');
    // The viewport stays zoomable for accessibility settings.
    expect(
      await page.locator('meta[name="viewport"]').getAttribute('content'),
    ).not.toMatch(/user-scalable|maximum-scale/);
    await page.goto(`${base}help.html`);
    expect(await touch('html')).toBe('manipulation');
    expect(await touch('body')).toBe('auto');
  });
});

test('Add to home screen is a phone action only', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(base);
  await expect(page.locator('#add-home')).toBeHidden();
});

test('opened from the home screen, the status bar sits on a solid strip', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // An iOS web app runs under the status bar: the top safe area is not zero.
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: 59, bottom: 34 },
  });
  await page.goto(base);
  const strip = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body, '::before');
      return { height: style.height, background: style.backgroundColor };
    });
  expect(await strip()).toEqual({
    height: '59px',
    background: 'rgb(255, 255, 255)',
  });
  // It sits above the map, and the header stays below it.
  expect(
    await page.evaluate(
      () => getComputedStyle(document.body, '::before').zIndex,
    ),
  ).toBe('5000');
  const header = (await page.locator('header').first().boundingBox())!;
  expect(header.y).toBeGreaterThanOrEqual(59);
  // In the browser, whose toolbar covers that area, it is zero tall.
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets: {} });
  await expect.poll(async () => (await strip()).height).toBe('0px');
});
