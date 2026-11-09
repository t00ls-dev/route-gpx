import { test, expect } from '@playwright/test';
test.use({ isMobile: true, hasTouch: true });
const base = 'http://127.0.0.1:5173/';
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e3ecea"/></svg>';
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));

  for (const domain of [
    'tile.openstreetmap.org',
    'a.tile.opentopomap.org',
    'tiles.maps.eox.at',
  ])
    await page.route(`https://${domain}/**`, (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: tile }),
    );
  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({ json: { features: [] } }),
  );
});
for (const width of [320, 360, 390, 430]) {
  for (const language of ['en', 'pt']) {
    test(`compact controls and cards at ${width}px in ${language}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await page.emulateMedia({
        colorScheme: language === 'pt' ? 'dark' : 'light',
      });
      await page.goto(base);
      await page.locator('#language').selectOption(language);
      const smallInputs = await page
        .locator(
          'input:not([type="checkbox"], [type="radio"], [type="range"], [type="file"]), textarea, select',
        )
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) => parseFloat(getComputedStyle(element).fontSize) < 16,
            )
            .map((element) => element.id),
        );
      expect(smallInputs).toEqual([]);
      await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
        'content',
        /user-scalable=no|maximum-scale=1/,
      );
      const labels =
        language === 'pt'
          ? [
              'Usar minha localização',
              'Camadas do mapa',
              'Tela cheia',
              '◎ Ver rota',
              'Bloquear edição',
              '↶ Desfazer',
            ]
          : [
              'Use my location',
              'Map layers',
              'Full screen',
              '◎ Fit route',
              'Lock editing',
              '↶ Undo',
            ];
      const ids = [
        'locate',
        'layers-toggle',
        'fullscreen',
        'fit',
        'lock',
        'undo',
      ];
      let lastBottom = 0;
      for (let i = 0; i < ids.length; i++) {
        const locator = page.locator(`#${ids[i]}`);
        await expect(locator).toHaveAccessibleName(labels[i]);
        await expect(locator).toHaveAttribute('title', labels[i]);
        const box = (await locator.boundingBox())!;
        expect(box.width).toBe(44);
        expect(box.height).toBe(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(lastBottom);
        lastBottom = box.y + box.height;
        expect(await locator.locator('.button-label').isVisible()).toBe(false);
      }
      await expect(page.locator('.map-action-control #undo')).toHaveCount(1);
      await expect(page.locator('#example')).toHaveCount(0);
      expect(
        await page
          .locator('.saved-routes')
          .evaluate((el) =>
            el.nextElementSibling?.classList.contains('speed-options'),
          ),
      ).toBe(true);
      // Phones zoom with pinch and double tap, so the map tools column has room.
      await expect(page.locator('.leaflet-control-zoom')).toBeHidden();
      expect(lastBottom).toBeLessThanOrEqual(
        (await page.locator('#route-panel').boundingBox())!.y,
      );
      expect((await page.locator('header').boundingBox())!.height).toBe(44);
      await expect(page.locator('#help')).toHaveAccessibleName(
        language === 'pt' ? 'Ajuda' : 'Help',
      );
      await page.locator('#layers-toggle').tap();
      await page.locator('[data-layer=satellite]').tap();
      await page.locator('#layers-toggle').tap();
      await expect(page.locator('#layers-toggle')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const menu = (await page.locator('#layers-menu').boundingBox())!,
        column = (await page.locator('#layers-toggle').boundingBox())!;
      expect(menu.x).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThan(column.x);
      await page.keyboard.press('Escape');
      await expect(page.locator('.map-credits-toggle')).toBeHidden();
      await page.locator('#panel-toggle').tap();
      const credit = (await page.locator('.map-credits').boundingBox())!,
        handle = (await page.locator('#panel-toggle').boundingBox())!;
      expect(credit.y + credit.height).toBeLessThanOrEqual(handle.y);
      expect(credit.width).toBe(44);
      expect(credit.height).toBe(44);
      expect(
        Math.abs(credit.x + credit.width / 2 - (column.x + column.width / 2)),
      ).toBeLessThanOrEqual(1);
      const toggle = page.locator('.map-credits-toggle');
      await expect(toggle).toHaveAccessibleName(
        language === 'pt' ? 'Créditos do mapa' : 'Map credits',
      );
      await toggle.tap();
      await expect(page.locator('.map-credits-dialog')).toBeVisible();
      await expect(page.locator('.map-credits-dialog')).toContainText(
        'MapServer',
      );
      await expect(page.locator('.map-credits-dialog')).toContainText(
        'CC BY-NC-SA 4.0',
      );
      await page.keyboard.press('Escape');
      await expect(page.locator('.map-credits-dialog')).toBeHidden();
      await expect(toggle).toBeFocused();
      await page.locator('#layers-toggle').tap();
      await page.locator('#map-labels').uncheck();
      await expect(page.locator('.map-credits-dialog')).not.toContainText(
        'MapServer',
      );
      await page.keyboard.press('Escape');
      await page.locator('#panel-toggle').tap();
      await page.locator('#location-0').fill('38.72, -9.14');
      await page.locator('#location-0').press('Tab');
      const input = (await page.locator('#location-0').boundingBox())!,
        form = (await page
          .locator('#points li')
          .first()
          .locator('form')
          .boundingBox())!;
      await expect(page.locator('.point-location-form button')).toHaveCount(0);
      expect(input.height).toBe(44);
      expect(input.width).toBeGreaterThan(100);
      expect(Math.abs(input.width - form.width)).toBeLessThanOrEqual(1);
      const buttons = page.locator('#points li.selected .point-actions button');
      for (const button of await buttons.all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBe(44);
        expect(box.height).toBe(44);
        await expect(button).toHaveAttribute('title', /.+/);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator('aside')
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page
        .locator('#language')
        .selectOption(language === 'pt' ? 'en' : 'pt');
      await expect(toggle).toHaveAttribute(
        'aria-label',
        language === 'pt' ? 'Map credits' : 'Créditos do mapa',
      );
      await expect(page.locator('#locate')).toHaveAccessibleName(
        language === 'pt' ? 'Use my location' : 'Usar minha localização',
      );
    });
  }
}
