import { expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  basemapStyle,
  mapCredits,
  satelliteUrl,
  terrainIndex,
  vectorCredits,
} from '../src/basemap';

/** The shape of OpenFreeMap's liberty style: raster shading, fills, roads, labels. */
const base = (): StyleSpecification => ({
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' },
    ne2_shaded: { type: 'raster', url: 'https://tiles.example/ne2' },
  },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'natural_earth', type: 'raster', source: 'ne2_shaded' },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
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
});
const terrain = { dem: 'dem://{z}/{x}/{y}', contours: 'contour://{z}/{x}/{y}' };
const ids = (style: StyleSpecification) => style.layers.map((l) => l.id);

it('draws the standard map with local names and never changes the fetched style', () => {
  const original = base();
  const style = basemapStyle(original, 'standard');
  expect(ids(style)).toEqual(ids(original));
  const label = style.layers.at(-1) as { layout: Record<string, unknown> };
  expect(label.layout['text-field']).toEqual([
    'coalesce',
    ['get', 'name'],
    ['get', 'name:latin'],
  ]);
  expect(original).toEqual(base());
});

it('puts terrain shading and contours under roads and labels on the topographic map', () => {
  const style = basemapStyle(base(), 'topographic', { terrain });
  expect(ids(style)).toEqual([
    'background',
    'natural_earth',
    'water',
    'terrain-hillshade',
    'terrain-contours',
    'road_minor',
    'label_city',
  ]);
  expect(style.sources.terrain).toMatchObject({
    type: 'raster-dem',
    encoding: 'terrarium',
    tiles: [terrain.dem],
  });
  expect(style.sources.contours).toMatchObject({ tiles: [terrain.contours] });
  // Until the contour generator loads, the map stays the standard one.
  expect(ids(basemapStyle(base(), 'topographic'))).toEqual(ids(base()));
  expect(terrainIndex([{ id: 'background', type: 'background' }])).toBe(1);
});

it('draws the chosen imagery with only the labels on top, or nothing vector without them', () => {
  const labelled = basemapStyle(base(), 'satellite', { vintage: '2016' });
  expect(ids(labelled)).toEqual(['background', 'satellite', 'label_city']);
  expect(Object.keys(labelled.sources).sort()).toEqual([
    'openmaptiles',
    'satellite',
  ]);
  expect(labelled.sources.satellite).toMatchObject({
    tiles: [satelliteUrl('2016')],
    maxzoom: 14,
  });
  expect(satelliteUrl('2016')).toContain('s2cloudless_3857');
  expect(satelliteUrl('2025')).toContain('s2cloudless-2025_3857');
  const plain = basemapStyle(base(), 'satellite', {
    vintage: '2025',
    labels: false,
  });
  expect(ids(plain)).toEqual(['background', 'satellite']);
  expect(Object.keys(plain.sources)).toEqual(['satellite']);
});

it('credits each layer once, keeps OpenStreetMap and names the imagery license', () => {
  for (const [layer, vintage, labels] of [
    ['standard', '2016', true],
    ['topographic', '2016', true],
    ['satellite', '2016', true],
    ['satellite', '2025', false],
  ] as const) {
    const credits = mapCredits(layer, vintage, labels);
    expect(new Set(credits.map((c) => c.text)).size).toBe(credits.length);
    expect(
      credits.filter((c) => c.url.includes('openstreetmap.org')),
    ).toHaveLength(1);
    expect(credits.every((c) => c.url.startsWith('https://'))).toBe(true);
  }
  expect(mapCredits('standard')).toEqual(vectorCredits);
  expect(
    mapCredits('topographic').some((c) => c.url.includes('terrain-tiles')),
  ).toBe(true);
  const older = mapCredits('satellite', '2016');
  expect(older.some((c) => c.url.endsWith('/by/4.0/'))).toBe(true);
  expect(older.some((c) => c.text.endsWith('2016 & 2017'))).toBe(true);
  const newer = mapCredits('satellite', '2025', false);
  expect(newer.some((c) => c.url.endsWith('/by-nc-sa/4.0/'))).toBe(true);
  expect(newer.some((c) => c.text === 'OpenFreeMap')).toBe(false);
});
