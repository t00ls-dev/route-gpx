import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaults, type Coord, type Route } from '../src/core';
import { missingDirections, sameRoad } from '../src/directions';
import { withUpdatedSteps, type SavedRoute } from '../src/saved-routes';
import { matchPlan, osrmMatch } from '../src/services';
import { legDistances } from '../src/track-position';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// About 111 m per 0.001° of longitude at the equator.
const east = (from: number, to: number): Coord[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [0, (from + i) * 0.001]);
const route = (extra: Partial<Route> = {}): Route => ({
  segments: [east(0, 100)],
  steps: [],
  distance: 11120,
  duration: null,
  provider: 'Imported GPX',
  ...extra,
});
const step = (name: string, kind: string, distance: number, extra = {}) => ({
  name,
  distance,
  duration: distance / 10,
  maneuver: { type: kind, location: [0.001, 0], ...extra },
});
const match = (...steps: ReturnType<typeof step>[]) => ({
  code: 'Ok',
  matchings: [{ legs: [{ steps }] }],
});

describe('which routes need directions', () => {
  it('imported tracks without most of their steps, and old saved routes', () => {
    expect(missingDirections(route())).toBe('match');
    // Only a rerouted part has steps.
    expect(
      missingDirections(
        route({
          provider: 'Imported GPX + OSRM',
          steps: [
            { name: 'A', ref: '', distance: 1000, duration: 1, at: [0, 0] },
          ],
        }),
      ),
    ).toBe('match');
    // Matched before (and saved): nothing to do.
    expect(
      missingDirections(
        route({
          steps: [{ name: 'A', ref: '', distance: 11000, duration: 1 }],
        }),
      ),
    ).toBeNull();
    const old = route({
      provider: 'OSRM',
      steps: [
        { name: 'A', ref: '', distance: 5000, duration: 1, kind: 'depart' },
        { name: 'B', ref: '', distance: 6000, duration: 1, kind: 'turn' },
      ],
    });
    expect(missingDirections(old)).toBe('route');
    old.steps[1].modifier = 'left';
    expect(missingDirections(old)).toBeNull();
  });

  it('keeps fresh steps only for the same road', () => {
    const saved = route({ provider: 'OSRM' });
    expect(sameRoad(saved, route({ segments: [east(0, 100)] }))).toBe(true);
    // A detour 1 km off the saved road.
    const detour = east(0, 100).map(([lat, lon], i): Coord => [
      i > 40 && i < 60 ? 0.009 : lat,
      lon,
    ]);
    expect(sameRoad(saved, route({ segments: [detour] }))).toBe(false);
    expect(sameRoad(saved, route({ segments: [east(0, 90)] }))).toBe(false);
  });
});

describe('map matching', () => {
  it('samples each segment into chunks of 10 that share their ends', () => {
    const chunks = matchPlan([east(0, 100), east(200, 230)]);
    expect(chunks.every((c) => c.length >= 2 && c.length <= 10)).toBe(true);
    // 11.1 km every 300 m: 38 points in chunks of 10 sharing one point.
    expect(chunks[1][0]).toEqual(chunks[0][9]);
    // A gap never joins two segments in one chunk.
    expect(
      chunks.some(
        (c) => c.some((p) => p[1] > 0.1) && c.some((p) => p[1] < 0.1),
      ),
    ).toBe(false);
    // Long tracks are capped at 40 requests.
    expect(matchPlan([east(0, 10000)]).length).toBeLessThanOrEqual(41);
  });

  it('joins chunks into one itinerary and skips unmatched stretches', async () => {
    vi.useFakeTimers();
    const replies = [
      match(
        step('Rua A', 'depart', 100),
        step('Rua B', 'turn', 200, { modifier: 'left' }),
        step('Rua B', 'arrive', 0),
      ),
      { code: 'NoMatch' },
      match(
        step('Rua B', 'depart', 300),
        step('Rua C', 'turn', 400, { modifier: 'sharp right' }),
        step('Rua C', 'arrive', 0),
      ),
      match(step('Rua D', 'depart', 50), step('Rua D', 'arrive', 0)),
    ];
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(init.credentials).toBe('omit');
        urls.push(url);
        const body =
          replies.shift() ??
          match(step('Rua D', 'depart', 10), step('Rua D', 'arrive', 0));
        return new Response(JSON.stringify(body), {
          status: body.code === 'Ok' ? 200 : 400,
        });
      }),
    );
    const progress: string[] = [];
    const promise = osrmMatch(
      defaults().osrm,
      [east(0, 100)],
      [],
      () => true,
      (done, all) => progress.push(`${done}/${all}`),
    );
    await vi.runAllTimersAsync();
    const steps = await promise;
    expect(urls[0]).toMatch(
      /\/match\/v1\/driving\/0,0;[^?]+\?steps=true&overview=false&waypoints=0;\d$/,
    );
    expect(progress.at(-1)).toBe(`${urls.length}/${urls.length}`);
    expect(steps.map((s) => [s.name, s.kind, s.modifier, s.distance])).toEqual([
      ['Rua A', 'depart', undefined, 100],
      // The same road continues across a chunk: merged.
      ['Rua B', 'turn', 'left', 500],
      ['Rua C', 'turn', 'sharp right', 400],
      // A new road after a chunk: a plain continue, not a departure.
      // Later chunks on the same road merge into it.
      ['Rua D', 'continue', undefined, 60],
      ['Rua D', 'arrive', undefined, 0],
    ]);
    expect(steps[0].at).toEqual([0, 0.001]);
  });

  it('fails when nothing matches or the router misbehaves', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'NoMatch' }), { status: 400 }),
      ),
    );
    const none = osrmMatch(defaults().osrm, [east(0, 20)]);
    const noneDone = expect(none).rejects.toThrow(
      'Directions unavailable for this track.',
    );
    await vi.runAllTimersAsync();
    await noneDone;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify(
              match(
                step('Rua A', 'turn', 100, { modifier: 'left', exit: 1.5 }),
              ),
            ),
          ),
      ),
    );
    // A malformed exit is left out, not trusted.
    const odd = osrmMatch(defaults().osrm, [east(0, 5)]);
    await vi.runAllTimersAsync();
    expect((await odd)[0]).not.toHaveProperty('exit');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'TooBig' }), { status: 400 }),
      ),
    );
    const big = osrmMatch(defaults().osrm, [east(300, 305)]);
    const bigDone = expect(big).rejects.toThrow(
      'Directions unavailable for this track.',
    );
    await vi.runAllTimersAsync();
    await bigDone;
  });
});

describe('match cache', () => {
  it('requests again only the legs next to an edited point', async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(
          JSON.stringify(
            match(step('Rua', 'depart', 100), step('Rua', 'arrive', 0)),
          ),
        );
      }),
    );
    // Four legs of about 2.2 km each (route points every 20 vertices).
    const track = east(1000, 1080);
    const points = (t: Coord[]) => [0, 20, 40, 60, 80].map((i) => t[i]);
    const legs = legDistances([track], points(track));
    const first = osrmMatch(defaults().osrm, [track], legs);
    await vi.runAllTimersAsync();
    await first;
    const all = urls.length;
    expect(all).toBeGreaterThanOrEqual(4);
    // Same track and points: everything from the cache.
    const again = osrmMatch(defaults().osrm, [track], legs);
    await vi.runAllTimersAsync();
    await again;
    expect(urls).toHaveLength(all);
    // Moving the third route point changes only its two legs.
    const edited = [
      ...track.slice(0, 40),
      [0.0005, 1.05] as Coord,
      ...track.slice(41),
    ];
    const moved = legDistances([edited], points(edited));
    const after = osrmMatch(defaults().osrm, [edited], moved);
    await vi.runAllTimersAsync();
    await after;
    // The first and last legs are unchanged: their chunks come from the cache.
    expect(urls.length - all).toBe(matchPlan([edited], moved).length - 2);
  });
});

describe('saved directions', () => {
  it('stores only the steps, and only for the same geometry', () => {
    const saved: SavedRoute = {
      id: 'a',
      name: 'A',
      state: defaults(),
      route: route({ provider: 'OSRM' }),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    };
    const withSteps = route({
      provider: 'OSRM',
      steps: [
        {
          name: 'A',
          ref: '',
          distance: 11120,
          duration: 1,
          kind: 'turn',
          modifier: 'left',
        },
      ],
    });
    const updated = withUpdatedSteps(saved, withSteps)!;
    expect(updated.route.steps).toEqual(withSteps.steps);
    expect(updated.updatedAt).toBe(saved.updatedAt);
    expect(updated.state).toEqual(saved.state);
    expect(
      withUpdatedSteps(saved, route({ segments: [east(0, 99)] })),
    ).toBeNull();
  });
});
