import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  parseRadarTimeline,
  radarTileUrl,
  RadarImageCache,
} from '../src/radar';
import { radarMetadata, radarNow } from './radar-fixture';
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('accepts chronological past frames including opaque IDs, and ignores future/satellite data', () => {
  const data = radarMetadata();
  const timeline = parseRadarTimeline(
    {
      ...data,
      radar: { ...data.radar, nowcast: [{ time: Infinity, path: '/future' }] },
    },
    radarNow.getTime(),
  );
  expect(timeline.frames).toHaveLength(3);
  expect(radarTileUrl(timeline, timeline.frames[2], 7, 1, 2)).toBe(
    'https://tilecache.rainviewer.com/v2/radar/frame2/512/7/1/2/2/0_0.png',
  );
  expect(radarTileUrl(timeline, null, 0, 0, 0)).toContain(
    '/coverage/0/512/0/0/0/0/0_0.png',
  );
  for (const coords of [
    [8, 0, 0],
    [7, 128, 0],
    [-1, 0, 0],
    [0, -1, 0],
  ])
    expect(() =>
      radarTileUrl(timeline, null, ...(coords as [number, number, number])),
    ).toThrow();
});
it.each(['host', 'path', 'future', 'old', 'order', 'many', 'empty', 'null'])(
  'rejects %s metadata without trusting remote tile hosts',
  (mode) => {
    const data = radarMetadata();
    if (mode === 'host') data.host = 'https://evil.test';
    if (mode === 'path') data.radar.past[0].path = '/v2/radar/../../secret';
    if (mode === 'future') data.radar.past[2].time += 3600;
    if (mode === 'old') data.radar.past[0].time -= 86400;
    if (mode === 'order') data.radar.past.reverse();
    if (mode === 'many') data.radar.past = Array(14).fill(data.radar.past[0]);
    if (mode === 'empty') data.radar.past = [];
    expect(() =>
      parseRadarTimeline(mode === 'null' ? null : data, radarNow.getTime()),
    ).toThrow();
  },
);
it('bounds the memory cache by image count and bytes, retaining recently viewed tiles', () => {
  const cache = new RadarImageCache(2, 5);
  const blob = new Blob(['12']);
  cache.set('a', blob);
  cache.set('b', blob);
  expect(cache.get('a')).toBe(blob);
  cache.set('c', blob);
  expect(cache.get('b')).toBeUndefined();
  cache.set('d', new Blob(['1234']));
  expect(cache.get('a')).toBeUndefined();
  expect(cache.get('c')).toBeUndefined();
  cache.set('large', new Blob(['123456']));
  expect(cache.get('large')).toBeUndefined();
});
it('shares serialized spacing across metadata and images, caches successes and suppresses aborted queued tiles', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(radarNow);
  const times: number[] = [];
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', async () => ({ close }));
  const fetch = vi.fn(async () => {
    times.push(Date.now());
    return {
      ok: true,
      status: 200,
      json: async () => radarMetadata(),
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    };
  });
  vi.stubGlobal('fetch', fetch);
  const { fetchRadarTimeline, fetchRadarImage } =
    await import('../src/services');
  const signal = new AbortController().signal;
  const timelinePromise = fetchRadarTimeline(signal);
  await vi.runAllTimersAsync();
  const timeline = await timelinePromise;
  const url = radarTileUrl(timeline, timeline.frames[0], 0, 0, 0);
  const first = fetchRadarImage(url, signal);
  const abort = new AbortController();
  const obsolete = fetchRadarImage(
    radarTileUrl(timeline, null, 0, 0, 0),
    abort.signal,
  );
  const assertion = expect(obsolete).rejects.toMatchObject({
    name: 'AbortError',
  });
  abort.abort();
  await vi.runAllTimersAsync();
  await first;
  await assertion;
  await fetchRadarImage(url, signal);
  await fetchRadarTimeline(signal);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(800);
  expect(close).toHaveBeenCalledTimes(1);
  expect(vi.mocked(globalThis.fetch).mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
});
it.each([429, 'network', 'invalid', 'timeout'] as const)(
  'reports %s once without retrying',
  async (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(radarNow);
    const fetch = vi.fn(async () => {
      if (mode === 'network') throw new TypeError();
      if (mode === 'timeout') throw new DOMException('Timeout', 'TimeoutError');
      return {
        ok: mode !== 429,
        status: mode === 429 ? 429 : 200,
        json: async () => ({}),
      };
    });
    vi.stubGlobal('fetch', fetch);
    const { fetchRadarTimeline } = await import('../src/services');
    const promise = fetchRadarTimeline(new AbortController().signal);
    const assertion = expect(promise).rejects.toThrow(
      mode === 429
        ? 'limit'
        : mode === 'network'
          ? 'network'
          : mode === 'timeout'
            ? 'timed out'
            : 'invalid',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
