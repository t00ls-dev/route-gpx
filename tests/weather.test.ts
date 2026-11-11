import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaults,
  decodeState,
  encodeState,
  meters,
  type Route,
} from '../src/core';
import { speedToKmh, travelTimeSeconds } from '../src/travel-time';
import {
  cumulativeTrack,
  departureError,
  forecastBounds,
  forecastInterval,
  HOUR,
  localDateTime,
  nearestHour,
  passageTime,
  routeBends,
  sampleRoute,
  sampleRouteStops,
  weatherWindow,
  type WeatherHour,
} from '../src/weather';
const now = Date.parse('2026-11-07T10:00:00Z');
const route: Route = {
  segments: [
    [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  ],
  steps: [],
  duration: null,
  distance: 222390,
  provider: 'GPX',
};
afterEach(() => vi.useRealTimers());
it('accumulates full geometry without connecting GPX segment gaps or mutating the route', () => {
  const segments: Route['segments'] = [
    [
      [0, 0],
      [0, 1],
    ],
    [
      [10, 10],
      [10, 11],
    ],
  ];
  const original = structuredClone(segments);
  const track = cumulativeTrack(segments);
  expect(track.map((p) => p.distance)).toEqual([
    0,
    meters([0, 0], [0, 1]),
    meters([0, 0], [0, 1]),
    meters([0, 0], [0, 1]) + meters([10, 10], [10, 11]),
  ]);
  expect(segments).toEqual(original);
});
it('calculates passage in km/h and mph without changing the departure time', () => {
  expect(passageTime({ coord: [0, 0], distance: 50000 }, now, 50)).toBe(
    now + HOUR,
  );
  expect(
    passageTime(
      { coord: [0, 0], distance: 160934.4 },
      now,
      speedToKmh(60, 'imperial'),
    ),
  ).toBeCloseTo(now + 100 * 60000);
  expect(passageTime({ coord: [0, 0], distance: 0 }, now, 50)).toBe(now);
});
it('samples endpoints and projected waypoints on sparse geometry in itinerary order', () => {
  const points = [
    { name: 'Start', coord: [0, 0] as [number, number] },
    { name: 'Via', coord: [0, 0.3] as [number, number] },
    { name: 'End', coord: [0, 2] as [number, number] },
  ];
  const samples = sampleRoute(route, points);
  expect(samples[0].coord).toEqual([0, 0]);
  expect(samples.at(-1)!.coord).toEqual([0, 2]);
  expect(samples.find((p) => p.name === 'Via')!.coord[1]).toBeCloseTo(0.3);
  expect(samples.map((p) => p.distance)).toEqual(
    samples.map((p) => p.distance).sort((a, b) => a - b),
  );
  expect(samples.length).toBeLessThanOrEqual(20);
});
it('reduces spacing on short routes, caps long routes and samples at most 20 of many stops', () => {
  const short = {
    ...route,
    segments: [
      [
        [0, 0],
        [0, 0.001],
      ],
    ] as Route['segments'],
  };
  const samples = sampleRoute(short, []);
  expect(samples).toHaveLength(3);
  expect(samples[1].coord[1]).toBeCloseTo(0.0005);
  expect(
    sampleRoute(
      {
        ...route,
        segments: [
          [
            [0, 0],
            [0, 100],
          ],
        ],
      },
      [],
    ),
  ).toHaveLength(20);
  const controls = Array.from({ length: 21 }, (_, i) => ({
    name: String(i),
    coord: [0, i / 20] as [number, number],
  }));
  const line = {
    ...route,
    segments: [
      [
        [0, 0],
        [0, 1],
      ],
    ] as Route['segments'],
  };
  // 21 stops (19 inner): 20 samples, start and destination always kept.
  const many = sampleRouteStops(line, controls);
  expect(many.stops).toBe(21);
  expect(many.samples).toHaveLength(20);
  expect(many.samples[0].name).toBe('0');
  expect(many.samples.at(-1)!.name).toBe('20');
  expect(many.samples.every((p) => p.stop)).toBe(true);
  expect(sampleRouteStops(line, controls)).toEqual(many);
  expect(
    sampleRoute(
      {
        ...route,
        segments: [
          [
            [0, 0],
            [0, 0],
          ],
        ],
      },
      [],
    ),
  ).toHaveLength(1);
});
it('spreads samples along routes with up to 50 stops, preferring named stops', () => {
  const line = {
    ...route,
    segments: [
      [
        [0, 0],
        [0, 1],
      ],
    ] as Route['segments'],
  };
  for (const count of [23, 50]) {
    const controls = Array.from({ length: count }, (_, i) => ({
      name: `Stop ${i}`,
      coord: [0, i / (count - 1)] as [number, number],
    }));
    const { samples, stops } = sampleRouteStops(line, controls);
    expect(stops).toBe(count);
    expect(samples).toHaveLength(20);
    expect(samples[0].distance).toBe(0);
    expect(samples.at(-1)!.name).toBe(`Stop ${count - 1}`);
    // No gap is much larger than an even split into 19 parts.
    const gaps = samples
      .slice(1)
      .map((p, i) => p.distance - samples[i].distance);
    expect(Math.max(...gaps)).toBeLessThan((samples.at(-1)!.distance / 19) * 2);
  }
  // A named stop next to an automatic one wins its slot.
  const controls = Array.from({ length: 41 }, (_, i) => ({
    name: i === 20 ? 'Lunch' : `Stop ${i}`,
    coord: [0, i / 40] as [number, number],
  }));
  expect(
    sampleRouteStops(line, controls).samples.some((p) => p.name === 'Lunch'),
  ).toBe(true);
  // Up to 20 stops are all kept, with no note needed.
  const few = Array.from({ length: 20 }, (_, i) => ({
    name: String(i),
    coord: [0, i / 19] as [number, number],
  }));
  const kept = sampleRouteStops(line, few);
  expect(kept.samples.filter((p) => p.stop)).toHaveLength(20);
  expect(kept.stops).toBe(20);
});
it('accepts recent past and future, rejecting departures beyond 90 days or the 16-day horizon', () => {
  expect(departureError(new Date(now).toISOString(), now)).toBeNull();
  expect(departureError('2026-11-07T11:00:00Z', now)).toBeNull();
  expect(departureError('2026-11-07T09:59:00Z', now)).toBeNull();
  expect(departureError('2026-08-09T00:00:00Z', now)).toBeNull();
  expect(departureError('2026-08-08T23:59:59Z', now)).toContain('90 days');
  expect(
    forecastInterval(
      Date.parse('2026-08-09T00:00:00Z'),
      Date.parse('2026-08-09T01:00:00Z'),
      now,
    ),
  ).toEqual({
    start: Date.parse('2026-08-08T23:00:00Z'),
    end: Date.parse('2026-08-09T23:00:00Z'),
  });
  expect(() =>
    forecastInterval(Date.parse('2026-08-08T23:59:59Z'), now, now),
  ).toThrow('90 days');
  expect(departureError('2026-11-23T00:00:00Z', now)).toContain('16-day');
  expect(departureError('', now)).toContain('Choose');
  expect(forecastBounds(now).end).toBe(Date.parse('2026-11-22T23:00:00Z'));
  expect(forecastInterval(now, now + HOUR, now)).toEqual({
    start: now - HOUR,
    end: Date.parse('2026-11-07T23:00:00Z'),
  });
  expect(() =>
    forecastInterval(now, Date.parse('2026-11-22T23:00:00Z'), now),
  ).toThrow('16-day');
});
it('finds the closest UTC hour and includes the worst-case ±1h window, rounded outward', () => {
  const hours = Array.from(
    { length: 5 },
    (_, i) => ({ time: now + i * HOUR }) as WeatherHour,
  );
  expect(nearestHour(hours, now + 1.6 * HOUR)).toBe(hours[2]);
  expect(weatherWindow(hours, now + 2 * HOUR)).toEqual(hours.slice(1, 4));
  expect(weatherWindow(hours, now + 2.2 * HOUR)).toEqual(hours.slice(1, 5));
  expect(() => nearestHour([], now)).toThrow();
});
it('keeps old links and backups valid and validates departure syntax without expiring saved routes', () => {
  expect(decodeState(encodeState(defaults())).departure).toBeUndefined();
  const state = { ...defaults(), departure: '2020-01-01T12:00:00.000Z' };
  expect(decodeState(encodeState(state)).departure).toBe(state.departure);
  for (const value of ['garbage', '2026-02-30T10:00:00.000Z', 123])
    expect(() =>
      decodeState(encodeState({ ...state, departure: value } as typeof state)),
    ).toThrow();
  const decoded = decodeState(
    encodeState({ ...state, forecast: 'private' } as typeof state),
  );
  expect(decoded).not.toHaveProperty('forecast');
});
it('formats local datetime input with the device timezone', () => {
  const d = new Date('2026-11-07T12:34:00Z');
  const local = localDateTime(d.toISOString());
  expect(new Date(local).getTime()).toBe(d.getTime());
});

it('covers the previous UTC hour for departures near midnight today', () => {
  const early = Date.parse('2026-11-07T00:30:00Z');
  expect(forecastInterval(early, early + HOUR, early).start).toBe(
    Date.parse('2026-11-06T23:00:00Z'),
  );
});

it('keeps sampling the long remainder when mandatory waypoints cluster near the start', () => {
  const clustered = Array.from({ length: 6 }, (_, i) => ({
    name: `Stop ${i}`,
    coord: [0, i === 5 ? 1 : i * 0.001] as [number, number],
  }));
  const samples = sampleRoute(
    {
      ...route,
      segments: [
        [
          [0, 0],
          [0, 1],
        ],
      ],
    },
    clustered,
  );
  expect(samples.length).toBeLessThanOrEqual(20);
  for (const point of clustered)
    expect(samples.some((sample) => sample.name === point.name)).toBe(true);
  const gaps = samples
    .slice(1)
    .map((point, i) => point.distance - samples[i].distance);
  expect(Math.max(...gaps)).toBeLessThan(37500);
});

it('spaces samples evenly between route points, no more than 20 km apart', () => {
  const samples = sampleRoute(
    {
      ...route,
      segments: [
        [
          [0, 0],
          [0, 0.5],
        ],
      ],
    },
    [],
  );
  // 55.6 km between start and destination: three equal gaps of 18.5 km.
  const gaps = samples.slice(1).map((p, i) => p.distance - samples[i].distance);
  expect(gaps).toHaveLength(3);
  for (const gap of gaps) {
    expect(gap).toBeLessThanOrEqual(20000);
    expect(Math.abs(gap - gaps[0])).toBeLessThan(0.01);
  }
  expect(samples.at(-1)!.coord).toEqual([0, 0.5]);
});

it.each([1, 5, 15, 20, 60, 200, speedToKmh(10, 'imperial')])(
  'adapts sampling to %s km/h without gaps over one hour when the cap permits',
  (speed) => {
    const short = {
      ...route,
      segments: [
        [
          [0, 0],
          [0, 0.1],
        ],
      ] as Route['segments'],
    };
    const samples = sampleRoute(short, [], speed);
    const spacing = Math.min(20000, speed * 1000);
    for (let i = 1; i < samples.length; i++) {
      const gap = samples[i].distance - samples[i - 1].distance;
      expect(gap).toBeLessThanOrEqual(spacing + 0.01);
      expect(travelTimeSeconds(gap, speed)).toBeLessThanOrEqual(3600 + 0.01);
    }
    expect(samples[0].coord).toEqual([0, 0]);
    expect(samples.at(-1)!.coord).toEqual([0, 0.1]);
  },
);

it('lets the 20-point cap override hourly spacing while preserving mandatory waypoints', () => {
  const controls = [
    { name: 'Start', coord: [0, 0] as [number, number] },
    { name: 'Via', coord: [0, 0.3] as [number, number] },
    { name: 'End', coord: [0, 2] as [number, number] },
  ];
  const samples = sampleRoute(route, controls, 1);
  expect(samples.length).toBeLessThanOrEqual(20);
  for (const control of controls)
    expect(samples.some((sample) => sample.name === control.name)).toBe(true);
  expect(
    Math.max(
      ...samples.slice(1).map((p, i) => p.distance - samples[i].distance),
    ),
  ).toBeGreaterThan(1000);
  for (const speed of [0, -1, NaN, Infinity])
    expect(() => sampleRoute(route, [], speed)).toThrow();
});

it('covers the outward-rounded weather window when a long trip arrives near UTC midnight', () => {
  const arrival = Date.parse('2026-11-09T22:30:00Z');
  const interval = forecastInterval(now, arrival, now);
  expect(interval.end).toBe(Date.parse('2026-11-10T23:00:00Z'));
  const hours = Array.from(
    { length: (interval.end - interval.start) / HOUR + 1 },
    (_, i) => ({ time: interval.start + i * HOUR }) as WeatherHour,
  );
  expect(weatherWindow(hours, arrival).at(-1)!.time).toBe(
    Date.parse('2026-11-10T00:00:00Z'),
  );
});

it.each([1, -1])(
  'samples and projects controls across the antimeridian in direction %s',
  (direction) => {
    const crossing: Route = {
      ...route,
      segments: [
        [
          [0, 179 * direction],
          [0, -179 * direction],
        ],
      ],
    };
    const samples = sampleRoute(crossing, [
      { name: 'Start', coord: [0, 179 * direction] },
      { name: 'Via', coord: [0, 180 * direction] },
      { name: 'End', coord: [0, -179 * direction] },
    ]);
    expect(samples.find((p) => p.name === 'Via')!.distance).toBeCloseTo(
      meters([0, 179], [0, 180]),
      3,
    );
    expect(
      samples.every(
        (p) => Math.abs(p.coord[1]) >= 179 && Math.abs(p.coord[1]) <= 180,
      ),
    ).toBe(true);
    expect(samples.at(-1)!.coord).toEqual([0, -179 * direction]);
  },
);

it('counts only route points as stops, not the samples between them', () => {
  // Start, one stop and destination along a 111 km line, sampled every 20 km
  // at 60 km/h and every 1 km at 1 km/h: still three stops.
  const line: Route = {
    segments: [
      [
        [0, 0],
        [0, 0.5],
        [0, 1],
      ],
    ],
    distance: 111195,
    duration: 0,
    provider: 'test',
    steps: [],
  };
  const controls = [
    { name: 'Start', coord: [0, 0] as [number, number] },
    { name: 'Stop 1', coord: [0, 0.5] as [number, number] },
    { name: 'Destination', coord: [0, 1] as [number, number] },
  ];
  for (const speed of [60, 1]) {
    const { samples, stops } = sampleRouteStops(line, controls, speed);
    expect(stops).toBe(3);
    expect(samples.filter((p) => p.stop)).toHaveLength(3);
    expect(samples.length).toBeGreaterThan(3);
  }
});

describe('weather samples at sharp bends', () => {
  // About 111.2 m per 0.001° near the equator.
  const path = (...corners: [number, number][]): Route['segments'] => [
    corners.flatMap(([lat, lon], i) => {
      if (!i) return [[lat, lon] as [number, number]];
      const [plat, plon] = corners[i - 1];
      const n = Math.max(1, Math.round(meters([plat, plon], [lat, lon]) / 50));
      return Array.from({ length: n }, (_, k): [number, number] => [
        plat + ((lat - plat) * (k + 1)) / n,
        plon + ((lon - plon) * (k + 1)) / n,
      ]);
    }),
  ];
  const asRoute = (segments: Route['segments']): Route => ({
    segments,
    distance: 0,
    duration: 0,
    provider: 'test',
    steps: [],
  });
  const stops = (segments: Route['segments']) => [
    { name: 'A', coord: segments[0][0] },
    { name: 'B', coord: segments.at(-1)!.at(-1)! },
  ];
  it('finds a right-angle corner once and ignores gentle curves', () => {
    // 20 km east, then 20 km north.
    const corner = path([0, 0], [0, 0.18], [0.18, 0.18]);
    const bends = routeBends(corner);
    expect(bends).toHaveLength(1);
    expect(Math.abs(bends[0].distance - 20015)).toBeLessThan(150);
    expect(bends[0].turn).toBeGreaterThan(80);
    // A 30° change of direction is not a bend.
    expect(routeBends(path([0, 0], [0, 0.18], [0.104, 0.36]))).toEqual([]);
    expect(routeBends(path([0, 0], [0, 0.36]))).toEqual([]);
  });
  it('adds a sample just past the corner, facing the new direction', () => {
    // 8 km east, then 25 km north: the corner is far from the distance
    // sample in the middle of the 33 km leg.
    const corner = path([0, 0], [0, 0.072], [0.225, 0.072]);
    const { samples } = sampleRouteStops(asRoute(corner), stops(corner));
    const bend = samples.filter((p) => p.bend);
    expect(bend).toHaveLength(1);
    expect(bend[0].distance).toBeGreaterThan(8006);
    expect(bend[0].distance).toBeLessThan(8200);
    // Heading north after the turn.
    expect(Math.abs((((bend[0].bearing ?? 0) + 180) % 360) - 180)).toBeLessThan(
      5,
    );
  });
  it('uses only free slots, sharpest turns first, kept apart', () => {
    // A zigzag of 3 km legs alternating east and north, 60 km in all.
    const corners: [number, number][] = [[0, 0]];
    for (let i = 0; i < 20; i++) {
      const [lat, lon] = corners.at(-1)!;
      corners.push(i % 2 ? [lat + 0.027, lon] : [lat, lon + 0.027]);
    }
    const zigzag = path(...corners);
    const { samples } = sampleRouteStops(asRoute(zigzag), stops(zigzag));
    expect(samples.length).toBeLessThanOrEqual(20);
    const sorted = samples.map((p) => p.distance).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++)
      if (samples.find((p) => p.distance === sorted[i])?.bend)
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(2000);
  });
  it('leaves full and straight routes as they were', () => {
    // 800 km with a corner: distance samples stay those of a straight route
    // of the same length; the bend only takes a slot they leave free.
    const long = path([0, 0], [0, 3.6], [3.6, 3.6]);
    const straightLong = path([0, 0], [0, 7.2]);
    const bent = sampleRouteStops(asRoute(long), stops(long), 15).samples;
    const plain = sampleRouteStops(
      asRoute(straightLong),
      stops(straightLong),
      15,
    ).samples;
    expect(
      bent.filter((p) => !p.bend).map((p) => Math.round(p.distance)),
    ).toEqual(plain.map((p) => Math.round(p.distance)));
    expect(bent.length).toBeLessThanOrEqual(20);
    const straight = path([0, 0], [0, 0.9]);
    expect(
      sampleRouteStops(asRoute(straight), stops(straight)).samples.some(
        (p) => p.bend,
      ),
    ).toBe(false);
  });
  it('never finds a bend across a GPX segment gap', () => {
    // Two straight segments at a right angle, with a gap between them.
    const [east] = path([0, 0], [0, 0.18]);
    const [north] = path([0.001, 0.181], [0.18, 0.181]);
    expect(routeBends([east, north])).toEqual([]);
  });
});

it('never samples right beside a route point, without gaps over the spacing', () => {
  // Out-and-back: 15.3 km north to a stop, then back to the start.
  const out = Array.from({ length: 154 }, (_, i): [number, number] => [
    i * 0.0009,
    0,
  ]);
  const trip: Route = {
    segments: [[...out, ...out.slice(0, -1).reverse()]],
    distance: 0,
    duration: 0,
    provider: 'test',
    steps: [],
  };
  const controls = [
    { name: 'Start', coord: out[0] },
    { name: 'Stop 1', coord: out.at(-1)! },
    { name: 'Destination', coord: out[0] },
  ];
  // At 1 km/h, 30.6 km would need 30 points: the cap of 20 takes priority
  // and the spacing grows to 2 km.
  for (const [speed, spacing] of [
    [25, 20000],
    [15, 15000],
    [5, 5000],
    [1, 2000],
  ]) {
    const { samples } = sampleRouteStops(trip, controls, speed);
    expect(samples.length).toBeLessThanOrEqual(20);
    const stops = samples.filter((p) => p.stop);
    expect(stops).toHaveLength(3);
    for (const sample of samples.filter((p) => !p.stop))
      for (const stop of stops)
        expect(
          Math.abs(sample.distance - stop.distance),
        ).toBeGreaterThanOrEqual(spacing / 2 - 1);
    for (let i = 1; i < samples.length; i++)
      expect(samples[i].distance - samples[i - 1].distance).toBeLessThanOrEqual(
        spacing + 0.01,
      );
  }
});
