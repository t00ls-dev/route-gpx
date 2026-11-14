import type { Coord, Route, Step } from './core';
import { maneuverPositions } from './maneuvers';
import { isImportedRoute } from './track-legs';
import {
  indexTrack,
  locateOnTrack,
  pointAtDistance,
  rejoinPoint,
  trackSlice,
  type RejoinPoint,
  type TrackIndex,
} from './track-position';
import type { DistanceUnits } from './units';
import { bearingBetween } from './weather-wind';

/**
 * Guided navigation along the route on screen (#31), locally and without
 * requests: progress from each position fix, the next maneuver and the one
 * after it, remaining distance and whether the destination is reached.
 * Positions are never stored; this module only reads them. Pure; no DOM.
 */

/** Fixes less accurate than this (meters) are shown as a weak GPS signal. */
export const WEAK_ACCURACY = 30;
/** A maneuver this close behind the progress (meters) counts as passed. */
const PASSED = 10;
/** Within this distance (meters) of the end, on the route, the trip is over. */
const ARRIVAL = 30;
/** Farther than this (meters) from the track, a fix does not mark arrival. */
const ARRIVAL_OFF_TRACK = 100;
/** The map points along the route this far ahead (meters), not at GPS noise. */
const HEADING_AHEAD = 40;
/**
 * Off the route: farther from the track than the larger of `OFF_ROUTE_MIN`
 * and `OFF_ROUTE_ACCURACY` times the fix accuracy, for `OFF_ROUTE_DELAY`.
 * Back on it within the larger of `ON_ROUTE_MIN` and the accuracy (the gap
 * between both keeps a fix near the edge from flipping the state). Fixes
 * worse than `OFF_ROUTE_MAX_ACCURACY` leave the state as it is.
 */
export const OFF_ROUTE_MIN = 50;
export const OFF_ROUTE_ACCURACY = 1.5;
export const OFF_ROUTE_DELAY = 5000;
export const ON_ROUTE_MIN = 25;
export const OFF_ROUTE_MAX_ACCURACY = 100;

export interface NavigationManeuver {
  step: Step;
  /** Along-track distance of the maneuver, meters. */
  at: number;
}
export interface NavigationFix {
  coord: Coord;
  /** Accuracy radius reported by the device, meters. */
  accuracy: number;
  /** When the fix was taken, ms; defaults to now. */
  time?: number;
}
export interface NavigationReadout {
  /** Along-track distance travelled, meters. */
  progress: number;
  remaining: number;
  /** Distance from the fix to the track, meters. */
  offTrack: number;
  /** Next maneuver, or null when only the destination is left. */
  next: NavigationManeuver | null;
  /** Distance to the next maneuver, or to the destination without one. */
  toNext: number;
  /** The maneuver after the next one, and its distance from the next. */
  after: NavigationManeuver | null;
  afterGap: number;
  arrived: boolean;
  weak: boolean;
  /** Direction of the route ahead, degrees from north, or null. */
  heading: number | null;
  /** Off the route (sustained, accuracy-aware). */
  offRoute: boolean;
  /** Off the route, where to rejoin it ahead; null otherwise. */
  rejoin: RejoinPoint | null;
}

/**
 * Off-route state from successive fixes, with the thresholds above. Pure
 * apart from its own state; the caller passes each fix's time.
 */
export function createOffRouteDetector() {
  let off = false,
    since: number | null = null;
  return (offTrack: number, accuracy: number, time: number): boolean => {
    if (!(accuracy <= OFF_ROUTE_MAX_ACCURACY)) return off;
    if (off) {
      if (offTrack <= Math.max(ON_ROUTE_MIN, accuracy)) {
        off = false;
        since = null;
      }
      return off;
    }
    if (offTrack > Math.max(OFF_ROUTE_MIN, OFF_ROUTE_ACCURACY * accuracy)) {
      since ??= time;
      if (time - since >= OFF_ROUTE_DELAY) off = true;
    } else since = null;
    return off;
  };
}

/**
 * Maneuvers to announce, in route order: every step with a maneuver position
 * except the departure. An arrival step is kept even with zero length.
 */
export function navigationManeuvers(route: Route): NavigationManeuver[] {
  const positions = maneuverPositions(route, !isImportedRoute(route));
  const out: NavigationManeuver[] = [];
  route.steps.forEach((step, i) => {
    const at = positions[i];
    if (at === null || step.kind === 'depart') return;
    if (step.distance <= 0 && step.kind !== 'arrive') return;
    out.push({ step, at });
  });
  return out;
}

/** Direction of the track from a distance to a point a little ahead. */
function headingAt(index: TrackIndex, distance: number): number | null {
  const from = pointAtDistance(index, distance),
    to = pointAtDistance(
      index,
      Math.min(index.total, distance + HEADING_AHEAD),
    );
  if (!from || !to) return null;
  if (from.coord[0] === to.coord[0] && from.coord[1] === to.coord[1])
    return from.bearing;
  return bearingBetween(from.coord, to.coord);
}

/**
 * Follows one route through a sequence of fixes. Progress is kept between
 * fixes so loops and out-and-back routes keep the pass being travelled; a
 * jump back is accepted only within the fix's accuracy (GPS jitter).
 */
export function createNavigationTracker(route: Route) {
  const index = indexTrack(route.segments);
  const maneuvers = navigationManeuvers(route);
  const offRoute = createOffRouteDetector();
  let progress: number | undefined;
  return {
    total: index.total,
    hasManeuvers: maneuvers.length > 0,
    /** Track from the start to an along-track distance, split at segment gaps. */
    travelled: (distance: number) => trackSlice(index, 0, distance),
    update(fix: NavigationFix): NavigationReadout | null {
      const accuracy = Number.isFinite(fix.accuracy)
        ? Math.max(0, fix.accuracy)
        : Infinity;
      const position = locateOnTrack(index, fix.coord, {
        progress,
        backtrack: Math.max(50, Math.min(500, 2 * accuracy)),
      });
      if (!position) return null;
      progress = position.distance;
      const off = offRoute(position.offTrack, accuracy, fix.time ?? Date.now());
      const rejoin = off ? rejoinPoint(index, fix.coord, progress) : null;
      const nextIndex = maneuvers.findIndex((m) => m.at > progress! + PASSED);
      const next = nextIndex < 0 ? null : maneuvers[nextIndex];
      const after = nextIndex < 0 ? null : (maneuvers[nextIndex + 1] ?? null);
      return {
        progress,
        // Off the route: the straight line back plus the route from there.
        remaining: rejoin
          ? rejoin.straight + Math.max(0, index.total - rejoin.at)
          : position.remaining,
        offTrack: position.offTrack,
        next,
        toNext: Math.max(0, (next ? next.at : index.total) - progress),
        after,
        afterGap: after && next ? Math.max(0, after.at - next.at) : 0,
        arrived:
          position.remaining <= ARRIVAL &&
          position.offTrack <= Math.max(ARRIVAL_OFF_TRACK, accuracy),
        weak: !(accuracy <= WEAK_ACCURACY),
        heading: headingAt(index, progress),
        offRoute: off,
        rejoin,
      };
    },
  };
}

/**
 * Distance to a maneuver, rounded the way it is read while moving: 10 m
 * steps below 100 m, 50 m steps below 1 km, then kilometers (one decimal
 * below 10). Imperial: 50 ft steps below 0.1 mi, then miles.
 */
export function navigationDistanceLabel(
  meters: number,
  units: DistanceUnits = 'metric',
  locale = 'en',
): string {
  const value = Math.max(0, meters);
  const decimal = (n: number) =>
    n.toLocaleString(locale, {
      maximumFractionDigits: n < 10 ? 1 : 0,
      minimumFractionDigits: n < 10 ? 1 : 0,
    });
  if (units === 'imperial') {
    const miles = value / 1609.344;
    if (miles < 0.1) {
      const feet = Math.round((value * 3.280839895) / 50) * 50;
      return `${Math.max(50, feet).toLocaleString(locale)} ft`;
    }
    return `${decimal(miles)} mi`;
  }
  if (value < 100) return `${Math.max(10, Math.round(value / 10) * 10)} m`;
  if (value < 1000) {
    const rounded = Math.round(value / 50) * 50;
    if (rounded < 1000) return `${rounded} m`;
  }
  return `${decimal(value / 1000)} km`;
}

/** Remaining time as the summary writes it: "18 min", "1h 48 min". */
export function navigationDurationLabel(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h ${minutes % 60} min`;
}

/** Faster than this (m/s, about 7 km/h) the traveler is moving. */
export const MOVING_SPEED = 2;
/** Slower than this (m/s) a moving traveler has stopped (hysteresis). */
export const STOPPED_SPEED = 1;

/**
 * Moving or stopped, with hysteresis so GPS speed noise near the threshold
 * does not flip the map between the route direction and the compass.
 * An unknown speed keeps the previous state.
 */
export function isMoving(speed: number | null, wasMoving: boolean): boolean {
  if (speed === null || !Number.isFinite(speed)) return wasMoving;
  return wasMoving ? speed >= STOPPED_SPEED : speed >= MOVING_SPEED;
}

/** Orientation reading as browsers report it; iOS adds its own compass heading. */
export interface OrientationReading {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
}
/**
 * Direction the top of the phone points to, degrees clockwise from north,
 * corrected for the screen rotation, or null without a north reference.
 * iOS gives `webkitCompassHeading`; elsewhere an absolute `alpha` counts
 * counterclockwise from north.
 */
export function compassHeading(
  reading: OrientationReading,
  screenAngle = 0,
): number | null {
  const ios = reading.webkitCompassHeading;
  let heading: number;
  if (typeof ios === 'number' && Number.isFinite(ios) && ios >= 0)
    heading = ios;
  else if (
    reading.absolute &&
    reading.alpha !== null &&
    Number.isFinite(reading.alpha)
  )
    heading = 360 - reading.alpha;
  else return null;
  return (((heading + screenAngle) % 360) + 360) % 360;
}

/**
 * Turns `from` a share of the way toward `to` along the shorter arc, to
 * smooth compass jitter without lagging on the 359°→0° wrap.
 */
export function turnToward(from: number, to: number, share: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (((from + delta * share) % 360) + 360) % 360;
}
