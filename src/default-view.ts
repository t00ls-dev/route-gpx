import type { Coord } from './core';

export interface View {
  center: Coord;
  zoom: number;
}
const view = (lat: number, lon: number, zoom = 6): View => ({
  center: [lat, lon],
  zoom,
});
// Regional centers, intentionally broad; extend with IANA timezone identifiers.
const zones: Record<string, View> = {
  'America/Sao_Paulo': view(-23, -46, 7),
  'America/Fortaleza': view(-5, -39),
  'America/Manaus': view(-3, -60),
  'America/Recife': view(-8, -35),
  'America/New_York': view(40.7, -74, 7),
  'America/Chicago': view(41.9, -87.6, 7),
  'America/Denver': view(39.7, -105, 7),
  'America/Los_Angeles': view(34, -118, 7),
  'America/Toronto': view(43.7, -79.4, 7),
  'America/Vancouver': view(49.3, -123, 7),
  'America/Mexico_City': view(19.4, -99.1, 7),
  'America/Argentina/Buenos_Aires': view(-34.6, -58.4, 7),
  'America/Santiago': view(-33.4, -70.7, 7),
  'America/Bogota': view(4.7, -74.1, 7),
  'Europe/Lisbon': view(39.5, -8),
  'Europe/London': view(53, -2),
  'Europe/Paris': view(47, 2),
  'Europe/Berlin': view(51, 10),
  'Europe/Madrid': view(40, -4),
  'Europe/Rome': view(43, 12),
  'Europe/Warsaw': view(52, 19),
  'Europe/Moscow': view(55.8, 37.6, 7),
  'Europe/Istanbul': view(39, 35),
  'Asia/Kolkata': view(22, 79, 5),
  'Asia/Calcutta': view(22, 79, 5),
  'Asia/Shanghai': view(35, 105, 5),
  'Asia/Tokyo': view(36, 138),
  'Asia/Seoul': view(36, 128),
  'Asia/Jakarta': view(-6.2, 106.8, 7),
  'Asia/Singapore': view(1.35, 103.8, 10),
  'Asia/Dubai': view(24, 54, 7),
  'Africa/Johannesburg': view(-29, 25),
  'Africa/Cairo': view(27, 30),
  'Africa/Lagos': view(9, 8),
  'Australia/Sydney': view(-33.9, 151.2, 7),
  'Australia/Perth': view(-31.9, 115.9, 7),
  'Pacific/Auckland': view(-41, 174),
};
const countries: Record<string, View> = {
  BR: zones['America/Sao_Paulo'],
  PT: zones['Europe/Lisbon'],
  US: view(39, -98, 4),
  CA: view(56, -106, 4),
  GB: zones['Europe/London'],
  FR: zones['Europe/Paris'],
  DE: zones['Europe/Berlin'],
  ES: zones['Europe/Madrid'],
  IT: zones['Europe/Rome'],
  IN: zones['Asia/Kolkata'],
  CN: zones['Asia/Shanghai'],
  JP: zones['Asia/Tokyo'],
  AU: view(-25, 134, 4),
  MX: zones['America/Mexico_City'],
  AR: zones['America/Argentina/Buenos_Aires'],
};
const languages: Record<string, string> = {
  pt: 'BR',
  en: 'US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  ja: 'JP',
  zh: 'CN',
  hi: 'IN',
};
export function defaultView(
  timeZone: string,
  preferredLanguages: readonly string[],
): View {
  if (zones[timeZone]) return zones[timeZone];
  for (const language of preferredLanguages) {
    const parts = language.split('-');
    const country = parts.slice(1).find((p) => /^[A-Z]{2}$/i.test(p));
    const match =
      countries[country?.toUpperCase() ?? languages[parts[0].toLowerCase()]];
    if (match) return match;
  }
  return view(20, 0, 2);
}

export async function initialView(options: {
  hasRoute: boolean;
  authorizedPosition: () => Promise<View | null>;
  approximateRegion: () => Promise<View | null>;
  local: () => View;
}): Promise<View | null> {
  if (options.hasRoute) return null;
  return (
    (await options.authorizedPosition()) ??
    (await options.approximateRegion()) ??
    options.local()
  );
}
