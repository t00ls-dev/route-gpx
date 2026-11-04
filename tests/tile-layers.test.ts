import { expect, it } from 'vitest';
import {
  tileConfig,
  mapCredits,
  labelConfig,
  tileTemplate,
  validateTileConfig,
} from '../src/tile-layers';
it('validates built-in layers and both satellite editions with coherent zoom and mandatory credits', () => {
  for (const layer of ['standard', 'topographic', 'satellite'] as const) {
    const config = tileConfig(layer);
    expect(validateTileConfig(config)).toBe(config);
    expect(config.maxNativeZoom).toBeLessThanOrEqual(config.maxZoom);
    expect(config.attribution).toContain('https://');
  }
  expect(tileConfig('satellite').maxNativeZoom).toBe(14);
  expect(tileConfig('satellite', '2016').attribution).toContain('2016');
  expect(tileConfig('satellite', '2016').url).not.toContain('2025');
  expect(validateTileConfig(labelConfig)).toBe(labelConfig);
});
it('rejects insecure, incomplete, credentialed or unknown-token tile templates and inconsistent configs', () => {
  for (const url of [
    'http://tiles.example/{z}/{x}/{y}.png',
    'https://tiles.example/{z}/{x}.png',
    'https://user:pass@tiles.example/{z}/{x}/{y}',
    'https://tiles.example/{z}/{x}/{y}/{token}',
  ])
    expect(() => tileTemplate(url)).toThrow();
  const config = tileConfig('standard');
  expect(() => validateTileConfig({ ...config, attribution: ' ' })).toThrow();
  expect(() => validateTileConfig({ ...config, maxNativeZoom: 20 })).toThrow();
  expect(() => validateTileConfig({ ...config, maxZoom: 2.5 })).toThrow();
});

it('keeps unique active credits and selects the matching satellite license', () => {
  const street = mapCredits('standard');
  const satellite = mapCredits('satellite', '2025', true);
  const older = mapCredits('satellite', '2016', false);
  expect(street.map((item) => item.url)).toEqual([
    'https://www.openstreetmap.org/copyright',
  ]);
  expect(new Set(satellite.map((item) => item.text)).size).toBe(
    satellite.length,
  );
  expect(
    satellite.filter((item) => item.url.includes('openstreetmap.org')),
  ).toHaveLength(1);
  expect(satellite.some((item) => item.url.endsWith('/by-nc-sa/4.0/'))).toBe(
    true,
  );
  expect(older.some((item) => item.url.endsWith('/by/4.0/'))).toBe(true);
  expect(older.some((item) => item.text.includes('MapServer'))).toBe(false);
  const attribution =
    tileConfig('satellite', '2025').attribution + labelConfig.attribution;
  for (const credit of satellite) {
    expect(attribution).toContain(credit.url);
    expect(attribution).toContain(credit.text);
  }
});
