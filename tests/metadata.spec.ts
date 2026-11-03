import { test, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5173/route-gpx/';
test('SEO metadata stays localized and excludes private route state', async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.goto(base);
  const canonical = 'https://t00ls-dev.github.io/route-gpx/';
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    canonical,
  );
  await page.locator('#language').selectOption('pt');
  await expect(page).toHaveTitle(/Rotas de carro/);
  await expect(page.locator('meta[name=description]')).toHaveAttribute(
    'content',
    /Crie rotas de carro/,
  );
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
    'content',
    'pt_BR',
  );
  await page.locator('#location-0').fill('-22.930929, -43.238286');
  await page.locator('#location-0').press('Tab');
  await expect(page).toHaveURL(/#v1=/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    canonical,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    canonical,
  );
  await page.locator('#language').selectOption('en');
  await expect(page).toHaveTitle(/Driving Route Planner/);
  const schema = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(schema.name).toBe('route-gpx');
  expect(schema.url).toBe(canonical);
});
test('manifest and icon files resolve inside the GitHub Pages project scope', async ({
  page,
  request,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.goto(base);
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifestUrl = new URL(href!, base);
  const response = await request.get(manifestUrl.href);
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/route-gpx/');
  expect(manifest.scope).toBe('/route-gpx/');
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok()).toBeTruthy();
    const dimensions = await page.evaluate(async (url: string) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return `${img.naturalWidth}x${img.naturalHeight}`;
    }, new URL(icon.src, manifestUrl).href);
    expect(dimensions).toBe(icon.sizes);
  }
  const apple = await page
    .locator('link[rel=apple-touch-icon]')
    .getAttribute('href');
  expect((await request.get(new URL(apple!, base).href)).ok()).toBeTruthy();
  expect(
    (await request.get(new URL('sitemap.xml', base).href)).ok(),
  ).toBeTruthy();
});
