import type { Route } from './core';
import { isImportedRoute } from './track-legs';
import { indexTrack, locateOnTrack, pointAtDistance } from './track-position';

/**
 * When turn directions can be added to a route without changing its geometry:
 * imported tracks (no steps, or only for rerouted parts) get them by map
 * matching; routes saved before maneuver details existed get them from one
 * step-only route request, kept only when it follows the same road.
 */

export type DirectionsSource = 'match' | 'route';

/** How a route can get its missing directions, or null when it has them. */
export function missingDirections(route: Route): DirectionsSource | null {
  if (isImportedRoute(route)) {
    // Steps covering most of the track (matched before, then saved) are
    // enough; rerouted parts alone are not.
    const covered = route.steps.reduce((n, s) => n + s.distance, 0);
    return route.distance > 0 && covered >= 0.8 * route.distance
      ? null
      : 'match';
  }
  return route.steps.length > 1 &&
    route.steps.every((s) => !s.modifier && !s.at)
    ? 'route'
    : null;
}

/** A fresh route follows the saved one: length within 2%, every 200 m within 40 m. */
export function sameRoad(saved: Route, fresh: Route): boolean {
  const savedIndex = indexTrack(saved.segments),
    freshIndex = indexTrack(fresh.segments);
  if (!savedIndex.total || !freshIndex.total) return false;
  if (Math.abs(freshIndex.total - savedIndex.total) > 0.02 * savedIndex.total)
    return false;
  let progress = 0;
  for (let at = 0; at <= freshIndex.total; at += 200) {
    const point = pointAtDistance(freshIndex, at);
    const position =
      point && locateOnTrack(savedIndex, point.coord, { progress });
    if (!position || position.offTrack > 40) return false;
    progress = position.distance;
  }
  return true;
}
