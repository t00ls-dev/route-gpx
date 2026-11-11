import { test, expect } from '@playwright/test';
import { defaults, encodeState } from '../src/core';
const base = 'http://127.0.0.1:5173/';
test('SEO metadata stays localized and excludes private route state', async ({
  page,
}) => {
  await page.route('https://tile.openstreetmap.org/**', (r) =>
    r.fulfill({ status: 204 }),
  );
  await page.goto(base);
  const canonical = 'https://route-gpx.t00ls.dev/';
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    canonical,
  );
  await page.locator('#language').selectOption('pt');
  await expect(page).toHaveTitle(/Planejador de rotas/);
  await expect(page.locator('meta[name=description]')).toHaveAttribute(
    'content',
    /Crie rotas pelas ruas/,
  );
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
    'content',
    'pt_BR',
  );
  await page.locator('#location-0').fill('-22.930929, -43.238286');
  await page.locator('#location-0').press('Tab');
  await expect(page).toHaveURL(/#v2=/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    canonical,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    canonical,
  );
  await page.locator('#language').selectOption('en');
  await expect(page).toHaveTitle(/Route Planner/);
  const schema = JSON.parse(
    await page.locator('script[type="application/ld+json"]').innerText(),
  );
  expect(schema.name).toBe('route-gpx');
  expect(schema.url).toBe(canonical);
});
test('manifest and icon files resolve at the custom-domain root', async ({
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
  expect(manifest.id).toBe('/');
  expect(manifest.display).toBe('browser');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
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

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.fulfill({ status: 204 }));

  await page.route('https://ipwho.is/**', (r) => r.fulfill({ status: 503 }));
});

test('help switches language and metadata while preserving the route in its return link', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00Z'));
  const hash = encodeState({
    ...defaults(),
    departure: '2026-11-09T10:00:00.000Z',
  });
  await page.goto(base + 'help.html?lang=pt' + hash);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('#help-pt')).toBeVisible();
  await expect(page.locator('#help-en')).toBeHidden();
  await expect(page).toHaveTitle(/Ajuda/);
  await expect(page.locator('#back')).toHaveAttribute(
    'href',
    './index.html' + hash,
  );
  await page.locator('#language').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#help-en')).toBeVisible();
  await expect(page.locator('#help-pt')).toBeHidden();
  await expect(page).toHaveTitle(/Route Planning/);
  await expect(page.locator('#back')).toHaveAttribute(
    'href',
    './index.html' + hash,
  );
  expect(new URL(page.url()).hash).toBe(hash);
  expect(new URL(page.url()).searchParams.get('lang')).toBe('en');
  await page.locator('#language').selectOption('pt');
  await expect(page.locator('#help-pt')).toBeVisible();
  await expect(page.locator('#back')).toHaveText('Voltar ao mapa');
});

test('help opens at a linked section and keeps the route hash for Back to map', async ({
  page,
}) => {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.goto(
    'http://127.0.0.1:5173/help.html?lang=pt&section=elevation#v2=abc',
  );
  await expect(page.locator('#elevation-pt')).toBeInViewport();
  await expect(page.locator('#back')).toHaveAttribute(
    'href',
    './index.html#v2=abc',
  );
});

test("What's new switches language and metadata and keeps the route for Back to map", async ({
  page,
}) => {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.goto(base + 'changelog.html?lang=pt#v2=abc');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('#changelog-pt')).toBeVisible();
  await expect(page.locator('#changelog-en')).toBeHidden();
  await expect(page).toHaveTitle('route-gpx — Novidades');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://route-gpx.t00ls.dev/changelog.html',
  );
  await expect(page.locator('#back')).toHaveAttribute(
    'href',
    './index.html#v2=abc',
  );
  await page.locator('#language').selectOption('en');
  await expect(page.locator('#changelog-en')).toBeVisible();
  await expect(page).toHaveTitle("route-gpx — What's New");
  await expect(page.locator('meta[name=description]')).toHaveAttribute(
    'content',
    /See what changed/,
  );
  // The help link keeps the language and the route.
  await expect(page.locator('#changelog-en a[data-page-link]')).toHaveAttribute(
    'href',
    './help.html?lang=en#v2=abc',
  );
});

test("the panel footer and the help page link to What's new in the chosen language", async ({
  page,
}) => {
  await page.route('https://**/*', (r) => r.fulfill({ status: 204 }));
  await page.goto(base);
  await page.locator('#language').selectOption('pt');
  const link = page.locator('#changelog');
  await expect(link).toHaveText('Novidades');
  await expect(link).toHaveAttribute('href', /^\.\/changelog\.html\?lang=pt#/);
  await page.goto(base + 'help.html?lang=pt#v2=abc');
  await expect(page.locator('#help-pt a[data-page-link]')).toHaveAttribute(
    'href',
    './changelog.html?lang=pt#v2=abc',
  );
});
