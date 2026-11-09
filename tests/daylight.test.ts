import { describe, expect, it } from 'vitest';
import type { Coord, Route } from '../src/core';
import {
  CIVIL_ANGLE,
  SUNRISE_ANGLE,
  lightAt,
  routeDaylight,
  solarElevation,
  sunTimes,
} from '../src/daylight';

const minutes = (a: number, b: number) => Math.abs(a - b) / 60_000;
const route = (segments: Coord[][]): Route => ({
  segments,
  steps: [],
  distance: 0,
  duration: null,
  provider: 'Imported GPX',
});

describe('sun times', () => {
  it('matches published London times at the June solstice', () => {
    // Greenwich, 2024-06-21: sunrise 04:43 BST and sunset 21:21 BST.
    const times = sunTimes(Date.UTC(2024, 5, 21, 12), [51.4769, 0]);
    expect(minutes(times.sunrise!, Date.UTC(2024, 5, 21, 3, 43))).toBeLessThan(
      3,
    );
    expect(minutes(times.sunset!, Date.UTC(2024, 5, 21, 20, 21))).toBeLessThan(
      3,
    );
    expect(times.polar).toBeUndefined();
  });

  it.each([
    ['London, winter', [51.5, -0.12], Date.UTC(2026, 11, 21, 12)],
    ['Equator, equinox', [0, 0], Date.UTC(2026, 2, 20, 12)],
    ['Rio de Janeiro, summer', [-22.9, -43.2], Date.UTC(2026, 11, 21, 15)],
    ['Lisbon, autumn', [38.72, -9.14], Date.UTC(2026, 9, 15, 13)],
  ] as [string, Coord, number][])(
    'puts the sun at the sunrise and civil angles: %s',
    (_, coord, noon) => {
      const times = sunTimes(noon, coord);
      for (const [time, angle] of [
        [times.sunrise, SUNRISE_ANGLE],
        [times.sunset, SUNRISE_ANGLE],
        [times.dawn, CIVIL_ANGLE],
        [times.dusk, CIVIL_ANGLE],
      ] as const)
        expect(Math.abs(solarElevation(time!, coord) - angle)).toBeLessThan(
          0.3,
        );
      expect(times.dawn!).toBeLessThan(times.sunrise!);
      expect(times.sunrise!).toBeLessThan(times.sunset!);
      expect(times.sunset!).toBeLessThan(times.dusk!);
      // The solar day whose noon is nearest to the given time.
      expect(Math.abs(times.sunrise! - noon)).toBeLessThan(24 * 3_600_000);
    },
  );

  it('reports polar night and polar day without inventing times', () => {
    const tromso: Coord = [69.65, 18.96];
    const winter = sunTimes(Date.UTC(2026, 11, 21, 11), tromso);
    expect(winter).toMatchObject({
      sunrise: null,
      sunset: null,
      polar: 'night',
    });
    expect(winter.dawn).not.toBeNull();
    const summer = sunTimes(Date.UTC(2026, 5, 21, 11), tromso);
    expect(summer).toMatchObject({
      sunrise: null,
      sunset: null,
      dawn: null,
      dusk: null,
      polar: 'day',
    });
    expect(lightAt(Date.UTC(2026, 5, 21, 23), tromso)).toBe('day');
    expect(lightAt(Date.UTC(2026, 11, 21, 23), tromso)).toBe('night');
  });
});

describe('route daylight', () => {
  // About 111 km along the equator; at 60 km/h it takes about 1 h 51 min.
  const equator = route([
    [
      [0, 0],
      [0, 0.5],
      [0, 1],
    ],
  ]);
  const evening = sunTimes(Date.UTC(2026, 10, 8, 12), [0, 1]);

  it('measures the distance after dark and the latest departure', () => {
    const departure = Date.UTC(2026, 10, 8, 16, 30);
    const result = routeDaylight(equator, departure, 60);
    expect(result.nightDistance).toBeGreaterThan(5_000);
    expect(result.nightDistance).toBeLessThan(40_000);
    expect(result.sections).toHaveLength(1);
    // Dark until the destination, about 111 km along the equator.
    expect(result.sections[0].to).toBeGreaterThan(111_000);
    // The section starts when civil dusk has passed at that point.
    expect(
      solarElevation(result.sections[0].start, [
        0,
        result.sections[0].from / 111_195,
      ]),
    ).toBeLessThanOrEqual(CIVIL_ANGLE + 0.2);
    const travel = result.arrival - departure;
    expect(minutes(travel, (111_195 / 60_000) * 3_600_000)).toBeLessThan(2);
    expect(result.latestDeparture).toBe(evening.sunset! - travel);
  });

  it('has nothing in the dark at midday', () => {
    const result = routeDaylight(equator, Date.UTC(2026, 10, 8, 10), 60);
    expect(result).toMatchObject({
      nightDistance: 0,
      twilightDistance: 0,
      sections: [],
    });
  });

  it('recalculates locally when only the speed changes', () => {
    const departure = Date.UTC(2026, 10, 8, 16, 30);
    const fast = routeDaylight(equator, departure, 120);
    const slow = routeDaylight(equator, departure, 30);
    expect(fast.nightDistance).toBe(0);
    expect(slow.nightDistance).toBeGreaterThan(40_000);
    expect(slow.latestDeparture!).toBeLessThan(fast.latestDeparture!);
  });

  it('never counts the gap between GPX segments', () => {
    const departure = Date.UTC(2026, 10, 8, 20);
    const split = routeDaylight(
      route([
        [
          [0, 0],
          [0, 0.1],
        ],
        [
          [0, 0.9],
          [0, 1],
        ],
      ]),
      departure,
      60,
    );
    // Two 11 km segments, both after dark; the 89 km gap is not travelled.
    expect(split.nightDistance).toBeGreaterThan(21_000);
    expect(split.nightDistance).toBeLessThan(23_000);
  });

  it('keeps edges across the antimeridian local', () => {
    // About 11 km; local midnight near the antimeridian is about 12:00 UTC.
    const result = routeDaylight(
      route([
        [
          [0, 179.95],
          [0, -179.95],
        ],
      ]),
      Date.UTC(2026, 10, 8, 12),
      60,
    );
    expect(result.nightDistance).toBeGreaterThan(11_000);
    expect(result.nightDistance).toBeLessThan(11_200);
  });

  it('uses the next sunset when departing after the day has ended', () => {
    const departure = Date.UTC(2026, 10, 8, 22);
    const result = routeDaylight(equator, departure, 60);
    const next = sunTimes(Date.UTC(2026, 10, 9, 12), [0, 1]).sunset!;
    expect(result.latestDeparture).toBe(next - (result.arrival - departure));
  });
});
