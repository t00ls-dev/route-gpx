import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import { localNames } from './basemap';

/**
 * Local adjustments to the OpenFreeMap style for the navigation map (#140):
 * street names as on the signs, and roads wide enough to hold their names.
 */

/** Roads are drawn this much wider than the style draws them. */
export const ROAD_WIDTH_SCALE = 2;
/**
 * Road names grow with the zoom, as the widened minor roads do, staying a
 * little smaller than the road so the text stays inside it.
 */
export const ROAD_LABEL_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  15,
  10,
  16,
  11,
  17,
  14,
  18,
  17,
  19,
  20,
];
/** White like the minor roads, so a name never draws on the casing. */
const ROAD_LABEL_HALO = '#ffffff';

/** Line layers of streets and roads (not paths or rail), casings included. */
export function isRoadLine(id: string): boolean {
  return (
    /^(road|bridge|tunnel)_/.test(id) &&
    !/rail|path|pedestrian|one_way/.test(id)
  );
}

/** Multiplies a zoom-dependent width; zoom curves are scaled at each stop. */
export function scaleWidth(width: unknown, factor: number): unknown {
  if (typeof width === 'number') return width * factor;
  if (Array.isArray(width) && width[0] === 'interpolate')
    return width.map((value, i) =>
      i >= 4 && i % 2 === 0 && typeof value === 'number'
        ? value * factor
        : value,
    );
  if (
    width &&
    typeof width === 'object' &&
    Array.isArray((width as { stops?: unknown }).stops)
  ) {
    const legacy = width as { stops: [number, number][] };
    return {
      ...legacy,
      stops: legacy.stops.map(([zoom, value]) => [zoom, value * factor]),
    };
  }
  return width;
}

export function navigationStyle(style: StyleSpecification): StyleSpecification {
  // Local names, as on the street signs, instead of English ones.
  localNames(style);
  for (const layer of style.layers) {
    if (layer.type === 'line' && isRoadLine(layer.id) && layer.paint) {
      const width = layer.paint['line-width'];
      if (width !== undefined)
        layer.paint['line-width'] = scaleWidth(
          width,
          ROAD_WIDTH_SCALE,
        ) as typeof width;
    }
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue;
    if (
      layer.id.startsWith('highway-name') &&
      layer.id !== 'highway-name-path'
    ) {
      layer.layout['text-size'] = ROAD_LABEL_SIZE;
      layer.paint = {
        ...layer.paint,
        'text-halo-color': ROAD_LABEL_HALO,
        'text-halo-width': 1,
      };
    }
  }
  return style;
}
