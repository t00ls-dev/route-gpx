import { afterEach, expect, it, vi } from 'vitest';
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

it('samples at regular 20 km intervals before the destination', () => {
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
  expect(samples.slice(0, -1).map((point) => point.distance)).toEqual([
    0, 20000, 40000,
  ]);
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
