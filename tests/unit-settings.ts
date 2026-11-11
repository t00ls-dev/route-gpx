import type { Page } from '@playwright/test';

/** Chooses units in the Settings dialog, where they apply at once. */
export async function chooseUnits(
  page: Page,
  units: { distance?: string; temperature?: string },
): Promise<void> {
  await page.locator('#open-settings').click();
  if (units.distance)
    await page.locator('#distance-units').selectOption(units.distance);
  if (units.temperature)
    await page.locator('#temperature-units').selectOption(units.temperature);
  await page.locator('#close-settings').click();
}
