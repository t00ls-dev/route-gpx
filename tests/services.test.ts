import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults } from '../src/core';
import {
  calculate,
  decodePolyline,
  osrmRoute,
  RequestQueue,
  valhallaRoute,
} from '../src/services';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const response = (x: unknown) => ({ ok: true, json: async () => x });
const osrm = {
  code: 'Ok',
  waypoints: [
    { location: [-43, -22], distance: 0 },
    { location: [-44, -23], distance: 0 },
  ],
  routes: [
    {
      distance: 123,
      duration: 45,
      geometry: {
        coordinates: [
          [-43, -22],
          [-44, -23],
        ],
      },
      legs: [
        {
          steps: [
            {
              name: 'Highway',
              ref: 'BR-101',
              distance: 123,
              duration: 45,
              maneuver: { type: 'depart' },
            },
          ],
        },
      ],
    },
  ],
};
const state = () => {
  const s = defaults();
  s.points = [
    { name: 'A', coord: [-22, -43] },
    { name: 'B', coord: [-23, -44] },
  ];
  return s;
};
describe('routing adapters', () => {
  it('requests full geometry with lon,lat and returns lat,lon', async () => {
    const fetch = vi.fn().mockResolvedValue(response(osrm));
    vi.stubGlobal('fetch', fetch);
    const r = await osrmRoute(state());
    expect(fetch.mock.calls[0][0]).toContain(
      '-43,-22;-44,-23?overview=full&geometries=geojson&steps=true',
    );
    expect(r.segments[0]).toEqual([
      [-22, -43],
      [-23, -44],
    ]);
    expect(r.steps[0].ref).toBe('BR-101');
  });
  it('rejects no-route responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ code: 'NoRoute' })),
    );
    await expect(osrmRoute(state())).rejects.toThrow('No driving route');
  });
  it('decodes Valhalla geometry at precision 6', () => {
    expect(decodePolyline('??_c`|@_gayB')).toEqual([
      [0, 0],
      [1, 2],
    ]);
  });
  it('uses Valhalla automatically when OSRM fails', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(
        response({
          trip: {
            status: 0,
            summary: { length: 1, time: 90 },
            legs: [
              {
                shape: '??_c`|@_gayB',
                maneuvers: [
                  { street_names: ['BR-101'], length: 1, time: 90, type: 1 },
                ],
              },
            ],
          },
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const promise = calculate(state());
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.provider).toContain('Valhalla');
    expect(r.distance).toBe(1000);
    expect(r.steps[0].ref).toBe('BR-101');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('reports an unavailable fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'No route' })),
    );
    await expect(valhallaRoute(state())).rejects.toThrow('No route');
  });
  it('serializes requests and spaces starts', async () => {
    vi.useFakeTimers();
    const q = new RequestQueue(1100),
      times: number[] = [];
    const f = async () => {
      times.push(Date.now());
      return 1;
    };
    const a = q.run(f),
      b = q.run(f);
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1100);
  });
});
