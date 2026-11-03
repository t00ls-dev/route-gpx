export interface TileConfig {
  name: string;
  url: string;
  maxNativeZoom: number;
  maxZoom: number;
  attribution: string;
}
export type BaseLayer = 'standard' | 'topographic' | 'satellite';
export type SatelliteVintage = '2025' | '2016';
export function tileTemplate(value: string): string {
  if (
    !['{z}', '{x}', '{y}'].every((token) => value.includes(token)) ||
    /\{(?![zxy]\})/.test(value)
  )
    throw new Error('Invalid tile template');
  const url = new URL(
    value.replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0'),
  );
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('Invalid tile URL');
  return value;
}
export function validateTileConfig(config: TileConfig): TileConfig {
  tileTemplate(config.url);
  if (
    !config.name.trim() ||
    !config.attribution.trim() ||
    !Number.isInteger(config.maxNativeZoom) ||
    !Number.isInteger(config.maxZoom) ||
    config.maxNativeZoom < 0 ||
    config.maxNativeZoom > config.maxZoom ||
    config.maxZoom > 22
  )
    throw new Error('Invalid tile configuration');
  return config;
}
const osm =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const eox = 'https://tiles.maps.eox.at/wmts/1.0.0/';
export function tileConfig(
  layer: BaseLayer,
  vintage: SatelliteVintage = '2025',
): TileConfig {
  if (layer === 'standard')
    return validateTileConfig({
      name: 'Standard',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxNativeZoom: 19,
      maxZoom: 19,
      attribution: osm,
    });
  if (layer === 'topographic')
    return validateTileConfig({
      name: 'Topographic',
      url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxNativeZoom: 17,
      maxZoom: 19,
      attribution: `${osm}, SRTM | © <a href="https://opentopomap.org/about">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>)`,
    });
  const id = vintage === '2016' ? 's2cloudless_3857' : 's2cloudless-2025_3857';
  const license = vintage === '2016' ? 'by' : 'by-nc-sa';
  return validateTileConfig({
    name: 'Satellite',
    url: `${eox}${id}/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`,
    maxNativeZoom: 14,
    maxZoom: 19,
    attribution: `${osm} | <a href="https://cloudless.eox.at/">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${vintage}) · <a href="https://creativecommons.org/licenses/${license}/4.0/">CC ${vintage === '2016' ? 'BY' : 'BY-NC-SA'} 4.0</a>`,
  });
}
export const labelConfig = validateTileConfig({
  name: 'Labels',
  url: `${eox}overlay_bright_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.png`,
  maxNativeZoom: 14,
  maxZoom: 19,
  attribution: `Labels: ${osm}, Rendering © <a href="https://maps.eox.at/">EOX::Maps</a> and <a href="https://github.com/mapserver/basemaps">MapServer</a>`,
});
