import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import {
  ROAD_LABEL_SIZE,
  ROAD_WIDTH_SCALE,
  isRoadLine,
  navigationStyle,
  scaleWidth,
} from '../src/navigation-style';

const englishName = [
  'coalesce',
  ['get', 'name_en'],
  ['get', 'name'],
] as unknown as string;
const style = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [
    {
      id: 'road_minor',
      type: 'line',
      source: 'openmaptiles',
      paint: {
        'line-width': [
          'interpolate',
          ['exponential', 1.2],
          ['zoom'],
          14,
          2.5,
          20,
          18,
        ],
      },
    },
    {
      id: 'road_major_rail',
      type: 'line',
      source: 'openmaptiles',
      paint: { 'line-width': 2 },
    },
    {
      id: 'highway-name-minor',
      type: 'symbol',
      source: 'openmaptiles',
      layout: { 'text-field': englishName, 'text-size': 13 },
      paint: { 'text-color': '#666' },
    },
    {
      id: 'highway-shield-non-us',
      type: 'symbol',
      source: 'openmaptiles',
      layout: { 'text-field': ['to-string', ['get', 'ref']] },
    },
  ],
});

describe('navigation map style', () => {
  it('widens streets and roads, not rail or paths', () => {
    expect(isRoadLine('road_minor')).toBe(true);
    expect(isRoadLine('bridge_street_casing')).toBe(true);
    expect(isRoadLine('tunnel_trunk_primary')).toBe(true);
    expect(isRoadLine('road_major_rail')).toBe(false);
    expect(isRoadLine('road_path_pedestrian')).toBe(false);
    expect(isRoadLine('road_one_way_arrow')).toBe(false);
    const [minor, rail] = navigationStyle(style()).layers;
    expect(minor.type === 'line' && minor.paint!['line-width']).toEqual([
      'interpolate',
      ['exponential', 1.2],
      ['zoom'],
      14,
      2.5 * ROAD_WIDTH_SCALE,
      20,
      18 * ROAD_WIDTH_SCALE,
    ]);
    expect(rail.type === 'line' && rail.paint!['line-width']).toBe(2);
  });

  it('scales numbers, zoom curves and legacy stops', () => {
    expect(scaleWidth(3, 2)).toBe(6);
    expect(
      scaleWidth(
        {
          base: 1.2,
          stops: [
            [14, 1],
            [20, 9],
          ],
        },
        2,
      ),
    ).toEqual({
      base: 1.2,
      stops: [
        [14, 2],
        [20, 18],
      ],
    });
  });

  it('names roads as the signs do, sized to stay inside the road', () => {
    const [, , names, shield] = navigationStyle(style()).layers;
    if (names.type !== 'symbol' || shield.type !== 'symbol') throw new Error();
    expect(names.layout!['text-field']).toEqual([
      'coalesce',
      ['get', 'name'],
      ['get', 'name:latin'],
    ]);
    expect(names.layout!['text-size']).toEqual(ROAD_LABEL_SIZE);
    expect(names.paint!['text-halo-color']).toBe('#ffffff');
    // Road numbers keep their own text.
    expect(shield.layout!['text-field']).toEqual(['to-string', ['get', 'ref']]);
  });

  it('keeps every road name smaller than the widened minor road', () => {
    // road_minor in OpenFreeMap's liberty style: 2.5 px at 14, 18 px at 20,
    // exponential base 1.2.
    const minorWidth = (zoom: number) =>
      (2.5 + ((18 - 2.5) * (1.2 ** (zoom - 14) - 1)) / (1.2 ** 6 - 1)) *
      ROAD_WIDTH_SCALE;
    const stops = ROAD_LABEL_SIZE.slice(3) as number[];
    for (let i = 0; i < stops.length; i += 2)
      if (stops[i] >= 16)
        expect(stops[i + 1]).toBeLessThan(minorWidth(stops[i]));
  });
});
