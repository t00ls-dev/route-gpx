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
export interface MapCredit {
  text: string;
  url: string;
}
export const osmCredit: MapCredit = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
};
const labelCredits: MapCredit[] = [
  osmCredit,
  { text: 'Rendering © EOX::Maps', url: 'https://maps.eox.at/' },
  { text: 'MapServer', url: 'https://github.com/mapserver/basemaps' },
];
export function mapCredits(
  layer: BaseLayer,
  vintage: SatelliteVintage = '2025',
  labels = false,
): MapCredit[] {
  const credits = [osmCredit];
  if (layer === 'topographic')
    credits.push(
      { text: 'SRTM', url: 'https://opentopomap.org/about' },
      { text: '© OpenTopoMap', url: 'https://opentopomap.org/about' },
      {
        text: 'CC BY-SA 3.0',
        url: 'https://creativecommons.org/licenses/by-sa/3.0/',
      },
    );
  if (layer === 'satellite') {
    credits.push(
      {
        text: 'EOxCloudless by EOX IT Services GmbH',
        url: 'https://cloudless.eox.at/',
      },
      {
        text: `Contains modified Copernicus Sentinel data ${vintage}`,
        url: 'https://cloudless.eox.at/',
      },
      {
        text: `CC ${vintage === '2016' ? 'BY' : 'BY-NC-SA'} 4.0`,
        url: `https://creativecommons.org/licenses/${vintage === '2016' ? 'by' : 'by-nc-sa'}/4.0/`,
      },
    );
    if (labels) credits.push(...labelCredits.slice(1));
  }
  return credits;
}
const attribution = (credits: MapCredit[]) =>
  credits.map(({ text, url }) => `<a href="${url}">${text}</a>`).join(' · ');
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
      attribution: attribution(mapCredits('standard')),
    });
  if (layer === 'topographic')
    return validateTileConfig({
      name: 'Topographic',
      url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
      maxNativeZoom: 17,
      maxZoom: 19,
      attribution: attribution(mapCredits('topographic')),
    });
  const id = vintage === '2016' ? 's2cloudless_3857' : 's2cloudless-2025_3857';
  return validateTileConfig({
    name: 'Satellite',
    url: `${eox}${id}/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg`,
    maxNativeZoom: 14,
    maxZoom: 19,
    attribution: attribution(mapCredits('satellite', vintage)),
  });
}
export const labelConfig = validateTileConfig({
  name: 'Labels',
  url: `${eox}overlay_bright_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.png`,
  maxNativeZoom: 14,
  maxZoom: 19,
  attribution: `Labels: ${attribution(labelCredits)}`,
});
