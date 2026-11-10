import type { Coord, Route } from './core';
import { cumulativeTrack } from './weather';
import { travelTimeSeconds } from './travel-time';

/**
 * Local solar position (SunCalc/NOAA-style low-precision formulas, about one
 * minute for sunrise and sunset at mid-latitudes). No network, no storage.
 */
const RAD = Math.PI / 180,
  DAY = 86_400_000,
  J1970 = 2440588,
  J2000 = 2451545,
  OBLIQUITY = RAD * 23.4397,
  J0 = 0.0009;
/** Upper limb on the sea-level horizon, with standard refraction. */
export const SUNRISE_ANGLE = -0.833;
/** Civil twilight ends when the sun is 6° below the horizon. */
export const CIVIL_ANGLE = -6;

const toDays = (time: number) => time / DAY - 0.5 + J1970 - J2000;
const fromJulian = (julian: number) => (julian + 0.5 - J1970) * DAY;
const meanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(m: number) {
  const center =
    RAD *
    (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + center + RAD * 102.9372 + Math.PI;
}
const declination = (l: number) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));

/** Sun elevation in degrees above the horizon at `time` for `[lat, lon]`. */
export function solarElevation(time: number, [lat, lon]: Coord): number {
  const d = toDays(time),
    l = eclipticLongitude(meanAnomaly(d)),
    dec = declination(l),
    ra = Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l)),
    hour = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra,
    phi = RAD * lat;
  return (
    Math.asin(
      Math.sin(phi) * Math.sin(dec) +
        Math.cos(phi) * Math.cos(dec) * Math.cos(hour),
    ) / RAD
  );
}

export type Light = 'day' | 'twilight' | 'night';
export function lightAt(time: number, coord: Coord): Light {
  const elevation = solarElevation(time, coord);
  return elevation > SUNRISE_ANGLE
    ? 'day'
    : elevation > CIVIL_ANGLE
      ? 'twilight'
      : 'night';
}

export interface SunTimes {
  dawn: number | null;
  sunrise: number | null;
  sunset: number | null;
  dusk: number | null;
  /** Set when the sun never crosses the sunrise angle on that solar day. */
  polar?: 'day' | 'night';
}
/** Sun times for the solar day whose noon is nearest to `time`. */
export function sunTimes(time: number, [lat, lon]: Coord): SunTimes {
  const lw = -RAD * lon,
    phi = RAD * lat,
    d = toDays(time),
    n = Math.round(d - J0 - lw / (2 * Math.PI)),
    approx = J0 + lw / (2 * Math.PI) + n,
    m = meanAnomaly(approx),
    l = eclipticLongitude(m),
    dec = declination(l),
    transit = (ds: number) =>
      J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l),
    noon = transit(approx);
  const crossing = (angle: number): [number, number] | null => {
    const cos =
      (Math.sin(RAD * angle) - Math.sin(phi) * Math.sin(dec)) /
      (Math.cos(phi) * Math.cos(dec));
    if (!(cos >= -1 && cos <= 1)) return null;
    const set = transit(J0 + (Math.acos(cos) + lw) / (2 * Math.PI) + n);
    return [fromJulian(noon - (set - noon)), fromJulian(set)];
  };
  const sun = crossing(SUNRISE_ANGLE),
    civil = crossing(CIVIL_ANGLE);
  return {
    dawn: civil?.[0] ?? null,
    sunrise: sun?.[0] ?? null,
    sunset: sun?.[1] ?? null,
    dusk: civil?.[1] ?? null,
    ...(sun
      ? {}
      : {
          polar:
            solarElevation(fromJulian(noon), [lat, lon]) > SUNRISE_ANGLE
              ? ('day' as const)
              : ('night' as const),
        }),
  };
}

interface DarkSection {
  /** Cumulative route distances in meters. */
  from: number;
  to: number;
  /** Passage times in milliseconds. */
  start: number;
  end: number;
}
/** Contiguous along-track stretch with the same light, in meters. */
interface LightRange {
  from: number;
  to: number;
  kind: Light;
}
export interface RouteDaylight {
  /** Whole route split by light at passage time, for map coloring. */
  ranges: LightRange[];
  nightDistance: number;
  twilightDistance: number;
  sections: DarkSection[];
  arrival: number;
  /** Latest departure that reaches the destination before its next sunset. */
  latestDeparture: number | null;
}
const STEP = 250,
  MAX_SECTIONS = 10;
/**
 * Classifies the route by the light at each passage time, using the same
 * constant-speed passage times as weather. Distance never spans GPX gaps.
 */
export function routeDaylight(
  route: Route,
  departure: number,
  speedKmh: number,
): RouteDaylight {
  const track = cumulativeTrack(route.segments);
  const at = (distance: number) =>
    departure + travelTimeSeconds(distance, speedKmh) * 1000;
  let nightDistance = 0,
    twilightDistance = 0;
  const sections: DarkSection[] = [];
  const ranges: LightRange[] = [];
  // Long edges are split so each piece is classified at its own passage time.
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1],
      b = track[i],
      length = b.distance - a.distance;
    if (length <= 0) continue;
    const pieces = Math.ceil(length / STEP);
    for (let k = 0; k < pieces; k++) {
      const from = a.distance + (length * k) / pieces,
        to = a.distance + (length * (k + 1)) / pieces,
        f = k / pieces,
        // Shortest longitude step, so edges across the antimeridian stay local.
        lon = a.coord[1] + (((b.coord[1] - a.coord[1] + 540) % 360) - 180) * f,
        coord: Coord = [
          a.coord[0] + (b.coord[0] - a.coord[0]) * f,
          ((lon + 540) % 360) - 180,
        ];
      const light = lightAt(at(from), coord);
      const range = ranges.at(-1);
      if (range && range.kind === light && Math.abs(range.to - from) < 1e-6)
        range.to = to;
      else ranges.push({ from, to, kind: light });
      if (light === 'twilight') twilightDistance += to - from;
      if (light !== 'night') continue;
      nightDistance += to - from;
      const last = sections.at(-1);
      if (last && Math.abs(last.to - from) < 1e-6) {
        last.to = to;
        last.end = at(to);
      } else sections.push({ from, to, start: at(from), end: at(to) });
    }
  }
  const total = track.at(-1)?.distance ?? 0,
    arrival = at(total),
    destination = track.at(-1)?.coord;
  let latestDeparture: number | null = null;
  if (destination) {
    let sunset = sunTimes(departure, destination).sunset;
    if (sunset !== null && sunset < departure)
      sunset = sunTimes(departure + DAY, destination).sunset;
    if (sunset !== null) latestDeparture = sunset - (arrival - departure);
  }
  return {
    ranges,
    nightDistance,
    twilightDistance,
    sections: sections.slice(0, MAX_SECTIONS),
    arrival,
    latestDeparture,
  };
}
