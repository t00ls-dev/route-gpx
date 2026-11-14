import type { BrowserContext, Page } from '@playwright/test';

/** 256 px tiles: Terrarium sea level for terrain, a green field for imagery. */
const TERRAIN_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAB+0lEQVR42u3TQQkAAAjAwEU3un8reHAJBmsK3pIAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgAJMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAyAASTAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADADHAnGpB4FDLHHvAAAAAElFTkSuQmCC';
const IMAGERY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACAElEQVR42u3TMQ0AAAgEsRfGjBz8j8xooEkVXHKpaXgrEmAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAOogAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAAMAAYAAwABgADgAHAAGAADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAANgABUwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADAAGAAOAAcAAYAAwABgADIABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA4ABwABgADAAGAAMAAYAA8C1RXcOEeTrLbsAAAAASUVORK5CYII=';
/** OpenFreeMap's style reduced to its two kinds of layers, on empty tiles. */
export const BASEMAP_STYLE = {
  version: 8,
  sources: {
    openmaptiles: {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
      maxzoom: 14,
    },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e3ecea' },
    },
    {
      id: 'road_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
    },
    {
      id: 'label_city',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-field': ['get', 'name:en'] },
    },
  ],
};

/**
 * Serves the base map without the network: the style, empty vector tiles and
 * plain imagery and terrain tiles. Register after any catch-all route.
 */
export async function mockBasemap(target: Page | BrowserContext) {
  await target.route('https://tiles.openfreemap.org/**', (route) =>
    route.request().url().includes('/styles/')
      ? route.fulfill({ json: BASEMAP_STYLE })
      : route.fulfill({ status: 204 }),
  );
  await target.route('https://tiles.maps.eox.at/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(IMAGERY_PNG, 'base64'),
    }),
  );
  await target.route(
    'https://s3.amazonaws.com/elevation-tiles-prod/**',
    (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(TERRAIN_PNG, 'base64'),
      }),
  );
}
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
