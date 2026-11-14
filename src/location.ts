import type { Coord } from './core';
import type { View } from './default-view';

export function positionView(position: GeolocationPosition): View {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    throw new Error('Invalid position');
  return {
    center: [latitude, longitude],
    zoom: accuracy < 100 ? 16 : accuracy < 1000 ? 14 : 11,
  };
}
export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000,
    }),
  );
}
export async function authorizedView(): Promise<View | null> {
  try {
    if (
      !window.isSecureContext ||
      !navigator.geolocation ||
      !navigator.permissions
    )
      return null;
    const permission = await navigator.permissions.query({
      name: 'geolocation',
    });
    if (permission.state !== 'granted') return null;
    return positionView(await getPosition());
  } catch {
    return null;
  }
}
export function locationError(code: number): string {
  return code === 1
    ? 'Location permission denied. Allow location in your browser site settings, then try again. You can still plan routes without GPS.'
    : code === 3
      ? 'Location timed out. Move to an open area and try again, or choose a point on the map.'
      : 'Location unavailable. Check your device location settings or choose a point on the map.';
}
/**
 * The traveler's position for a navigation recalculation (#31): about 10 m
 * (4 decimals), so the new route starts on the right street. It is the only
 * position ever sent, at that moment only, and never stored.
 */
export function navigationPoint(coord: Coord): Coord {
  return coord.map((n) => Number(n.toFixed(4))) as Coord;
}
// Route services only receive an explicitly chosen approximate point (~100 m grid).
export function approximatePoint(coord: Coord): Coord {
  const rounded = coord.map((n) => Number(n.toFixed(3))) as Coord;
  // Even a device that reports coordinates already on the grid stays separate.
  if (rounded[0] === coord[0] && rounded[1] === coord[1])
    rounded[0] = Number(
      (rounded[0] + (rounded[0] >= 90 ? -0.001 : 0.001)).toFixed(3),
    );
  return rounded;
}
