import { URL } from 'node:url';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.env.SITE_URL || 'http://localhost:5173/';
const artifacts = '.browser-check.local';
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1280 },
  acceptDownloads: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let geometryPoints = 0;
page.on('response', async (r) => {
  if (r.url().includes('/route/v1/driving/') && r.ok()) {
    const x = await r.json();
    geometryPoints = x.routes?.[0]?.geometry?.coordinates?.length || 0;
  }
});
await page.goto(base);
await page.locator('#language').selectOption('en');
// Build the acceptance itinerary from the GPX fixture through the validated editor.
const fixtureXml = await fs.readFile('docs/example.gpx', 'utf8');
const fixturePoints = await page.evaluate((xml) => {
  const doc = new window.DOMParser().parseFromString(xml, 'application/xml');
  return [...doc.querySelectorAll('wpt')].map((point) => ({
    name: point.querySelector('name').textContent,
    coord: [
      Number(point.getAttribute('lat')),
      Number(point.getAttribute('lon')),
    ],
  }));
}, fixtureXml);
await page.locator('.settings').evaluate((el) => {
  el.open = true;
});
await page.locator('.json-settings').evaluate((el) => {
  el.open = true;
});
await page.locator('#export-json').click();
const fixtureState = JSON.parse(await page.locator('#state-json').inputValue());
fixtureState.points = fixturePoints;
fixtureState.name = 'Uruguai → Alto da Boa Vista → Grumari';
await page.locator('#state-json').fill(JSON.stringify(fixtureState));
await page.locator('#apply-json').click();
await page.locator('.settings').evaluate((el) => {
  el.open = false;
});
await page.locator('#download').waitFor({ state: 'visible' });
await page.waitForFunction(
  () => !document.querySelector('#download').disabled,
  {},
  { timeout: 80000 },
);
assert.equal(await page.locator('#points li').count(), 7);
const status = await page.locator('#status').innerText();
assert.ok(status.includes('Route ready'), status);
assert.match(await page.locator('#summary').innerText(), /OSRM|Valhalla/);
const routeSummary = await page.locator('#summary').innerText();
await fs.mkdir(artifacts, { recursive: true });
// Capture local acceptance evidence without adding screenshots to the repository.
async function tilesPainted(target) {
  await target.waitForFunction(
    () => {
      const tiles = [...document.querySelectorAll('#map img.leaflet-tile')];
      return (
        tiles.length > 0 &&
        tiles.every((tile) => tile.complete && tile.naturalWidth > 0)
      );
    },
    {},
    { timeout: 30000 },
  );
  await target.waitForTimeout(250);
}
await tilesPainted(page);
await page.locator('aside').evaluate((el) => {
  el.scrollTop = 0;
});
await page.screenshot({ path: `${artifacts}/screenshot.png` });
await page.locator('#language').selectOption('pt');
await page.getByRole('heading', { name: 'Criar rota' }).waitFor();
await page.screenshot({ path: `${artifacts}/screenshot.pt-BR.png` });
await page.locator('#language').selectOption('en');
await page.locator('#download').scrollIntoViewIfNeeded();
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download').click(),
]);
await download.saveAs(`${artifacts}/example.gpx`);
const xml = await fs.readFile(`${artifacts}/example.gpx`, 'utf8');
const trackPoints = (xml.match(/<trkpt /g) || []).length;
assert.ok(trackPoints > 500);
if (geometryPoints) assert.equal(trackPoints, geometryPoints);
assert.equal((xml.match(/<wpt /g) || []).length, 7);
const shared = page.url();
assert.ok(shared.includes('#v2='));
await page.locator('#language').selectOption('pt');
await page.getByRole('heading', { name: 'Criar rota' }).waitFor();
assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR');
assert.match(await page.locator('#download').innerText(), /Baixar/);
// GPX import must preserve all original geometry, without a network recalculation.
await page.locator('#import').setInputFiles(`${artifacts}/example.gpx`);
await page.waitForFunction(() =>
  document.querySelector('#summary').textContent.includes('Imported GPX'),
);
const [again] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('#download').click(),
]);
const rexml = await fs.readFile(await again.path(), 'utf8');
assert.equal((rexml.match(/<trkpt /g) || []).length, trackPoints);
// Advanced JSON editor remains available alongside the point editor.
await page.locator('.settings').evaluate((el) => {
  el.open = true;
});
await page.locator('.json-settings').evaluate((el) => {
  el.open = true;
});
await page.locator('#export-json').click();
const state = JSON.parse(await page.locator('#state-json').inputValue());
assert.equal(state.points.length, 7);
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
// Exercise the exact reported failure with real routing, not just the example.
await mobile.goto(base);
await mobile.locator('#language').selectOption('en');
await mobile.locator('#location-0').fill('-22.930929, -43.238286');
await mobile.locator('#location-1').fill('-23.050160, -43.535240');
await mobile.locator('#location-1').press('Tab');
await mobile.waitForFunction(
  () => !document.querySelector('#download').disabled,
  {},
  { timeout: 80000 },
);
assert.equal(await mobile.locator('.leaflet-marker-icon').count(), 2);
await mobile.locator('#undo').click();
assert.equal(await mobile.locator('#location-1').inputValue(), '');
assert.equal(await mobile.locator('#download').isDisabled(), true);
await mobile.goto(shared);
await mobile.locator('#language').selectOption('pt');
await mobile.getByRole('heading', { name: 'Criar rota' }).waitFor();
assert.ok(
  await mobile.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
);
await mobile.waitForFunction(
  () => !document.querySelector('#download').disabled,
  {},
  { timeout: 80000 },
);
await mobile.locator('#language').selectOption('en');
await mobile.getByRole('heading', { name: 'Plan your route' }).waitFor();
await mobile.evaluate(() => window.scrollTo(0, 0));
await mobile.locator('aside').evaluate((el) => {
  el.scrollTop = 0;
});
await mobile.locator('#points').evaluate((el) => {
  el.scrollTop = 0;
});
await tilesPainted(mobile);
await mobile.screenshot({ path: `${artifacts}/mobile.png`, fullPage: true });
const dark = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  colorScheme: 'dark',
});
await dark.goto(base);
assert.equal(
  await dark.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme,
  ),
  'light',
);
await tilesPainted(dark);
await dark.screenshot({ path: `${artifacts}/dark.png` });
const help = await browser.newPage();
await help.goto(
  new URL(await page.locator('#help').getAttribute('href'), base).href,
);
assert.equal(
  new URL(await help.locator('#back').getAttribute('href'), base).hash,
  new URL(page.url()).hash,
);
await help.getByRole('heading', { name: 'Ajuda', exact: true }).waitFor();
await help.locator('#language').selectOption('en');
await help.getByRole('heading', { name: 'Help', exact: true }).waitFor();
assert.deepEqual(errors, []);
await fs.writeFile(
  `${artifacts}/browser-check.json`,
  JSON.stringify(
    {
      base,
      routeSummary,
      trackPoints,
      geometryPoints,
      waypoints: 7,
      mobileWidth: 390,
      mobileScreenshotLanguage: 'en',
      manualPointEntry: true,
      undo: true,
      english: true,
      portuguese: true,
      importPreservesGeometry: true,
      pageErrors: errors,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    { routeSummary, trackPoints, geometryPoints, status, errors },
    null,
    2,
  ),
);
await browser.close();
