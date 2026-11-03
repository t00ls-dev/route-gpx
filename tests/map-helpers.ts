import type { Page } from '@playwright/test';
export async function holdMap(page: Page, x = 205, y = 245) {
  const box = (await page.locator('#map').boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + x, y: box.y + y }],
  });
  await page.waitForTimeout(550);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
}
