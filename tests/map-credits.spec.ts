import { test, expect } from '@playwright/test';
test.use({ isMobile: true, hasTouch: true });
const base = 'http://127.0.0.1:5173/';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));

  await page.addInitScript(() =>
    localStorage.setItem('detect-region', 'false'),
  );
  for (const domain of [
    'tile.openstreetmap.org',
    'a.tile.opentopomap.org',
    'tiles.maps.eox.at',
  ])
    await page.route(`https://${domain}/**`, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>',
      }),
    );
});
for (const [width, height] of [
  [360, 844],
  [390, 844],
  [430, 844],
  [844, 360],
  [844, 390],
  [844, 430],
  [1280, 800],
]) {
  for (const layer of ['standard', 'satellite']) {
    test(`${layer} credits stay anchored and accessible at ${width}×${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(base);
      const toggle = page.locator('.map-credits-toggle');
      if (width < 760) {
        await expect(toggle).toBeHidden();
        await page.locator('#panel-toggle').tap();
      }
      await page.locator('#layers-toggle').tap();
      await page.locator(`[data-layer=${layer}]`).tap();
      await expect(toggle).toHaveAccessibleName('Map credits');
      await expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
      const button = (await toggle.boundingBox())!;
      const map = (await page.locator('#map').boundingBox())!;
      // Phones hide the zoom buttons; the credits sit below the map tools instead.
      const zoom = (await page
        .locator(width < 760 ? '#undo' : '.leaflet-control-zoom-out')
        .boundingBox())!;
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(
        Math.abs(button.x + button.width / 2 - zoom.x - zoom.width / 2),
      ).toBeLessThanOrEqual(1);
      expect(button.y).toBeGreaterThanOrEqual(zoom.y + zoom.height);
      expect(map.x + map.width - button.x - button.width).toBe(10);
      // Phones keep the credits above the closed bottom sheet.
      expect(map.y + map.height - button.y - button.height).toBe(
        width < 760
          ? (await page.locator('#sheet').boundingBox())!.height + 10
          : 10,
      );
      if (width < 760)
        expect(button.y + button.height).toBeLessThanOrEqual(
          (await page.locator('#panel-toggle').boundingBox())!.y - 8,
        );
      await toggle.tap();
      const dialog = page.getByRole('dialog', { name: 'Map credits' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(
        dialog.getByRole('button', { name: 'Close', exact: true }),
      ).toBeFocused();
      await expect(page.locator('#map-credits-summary')).toHaveCount(0);
      await expect(
        dialog.getByRole('link', {
          name: '© OpenStreetMap contributors',
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(
        dialog.getByRole('link', { name: 'Leaflet', exact: true }),
      ).toHaveCount(1);
      if (layer === 'satellite') {
        await expect(dialog).toContainText(
          'EOxCloudless by EOX IT Services GmbH',
        );
        await expect(dialog).toContainText(
          'Contains modified Copernicus Sentinel data 2025',
        );
        await expect(dialog).toContainText('EOX::Maps');
        await expect(dialog).toContainText('MapServer');
        await expect(
          dialog.getByRole('link', { name: 'CC BY-NC-SA 4.0', exact: true }),
        ).toHaveAttribute(
          'href',
          'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        );
      } else await expect(dialog).not.toContainText('EOX');
      for (const link of await dialog.getByRole('link').all()) {
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(
          43.99,
        );
      }
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      expect(box.width).toBeLessThanOrEqual(360);
      const titleBox = (await dialog.getByRole('heading').boundingBox())!;
      const closeBox = (await dialog.getByRole('button').boundingBox())!;
      expect(titleBox.y).toBeGreaterThanOrEqual(box.y + 8);
      expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(
        box.y + box.height - 8,
      );
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('link').first()).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.tap();
      await page.mouse.click(2, 2);
      await expect(dialog).toBeHidden();
      await expect(toggle).toBeFocused();
      if (width < 760) {
        await page.locator('#panel-toggle').tap();
        await expect(toggle).toBeHidden();
      }
    });
  }
}
test('credit and help links preserve a route in the app; modal translates and follows layer changes', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.route('https://leafletjs.com/**', (route) =>
    route.fulfill({ body: 'Leaflet' }),
  );
  await context.route('https://creativecommons.org/**', (route) =>
    route.fulfill({ body: 'License' }),
  );
  await page.goto(base);
  await page.locator('#import').setInputFiles('docs/example.gpx');
  await expect(page.locator('#download')).toBeEnabled();
  const appUrl = page.url();
  const toggle = page.locator('.map-credits-toggle');
  const dialog = page.getByRole('dialog');
  await page.locator('#layers-toggle').click();
  await page.locator('[data-layer=satellite]').click();
  await toggle.click();
  for (const name of ['Leaflet', 'CC BY-NC-SA 4.0']) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      dialog.getByRole('link', { name, exact: true }).click(),
    ]);
    await popup.waitForLoadState();
    await popup.close();
    expect(page.url()).toBe(appUrl);
    await expect(dialog).toBeVisible();
  }
  // A device preference update can occur while the modal is open.
  await page
    .locator('[data-layer=standard]')
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toBeHidden();
  await toggle.click();
  await expect(dialog).not.toContainText('EOX');
  await page.keyboard.press('Escape');
  await page.locator('#language').selectOption('pt');
  await expect(toggle).toHaveAccessibleName('Créditos do mapa');
  await page.locator('#layers-toggle').click();
  await page.locator('[data-layer=satellite]').click();
  await toggle.click();
  await expect(dialog).toHaveAccessibleName('Créditos do mapa');
  await expect(dialog).toContainText(
    'Contém dados Copernicus Sentinel modificados de 2025',
  );
  await expect(dialog).toContainText('© colaboradores do OpenStreetMap');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(toggle).toBeFocused();
  await page.locator('#language').selectOption('en');
  await expect(toggle).toHaveAccessibleName('Map credits');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.click();
  await expect(dialog).toContainText(
    'Contains modified Copernicus Sentinel data 2025',
  );
  expect(
    await dialog.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.keyboard.press('Escape');
  const [help] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('#help').click(),
  ]);
  await help.waitForLoadState();
  await expect(help).toHaveURL(/help.html/);
  await help.close();
  expect(page.url()).toBe(appUrl);
  await expect(page.locator('#download')).toBeEnabled();
});
