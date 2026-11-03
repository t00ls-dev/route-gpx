import { afterEach, expect, it, vi } from 'vitest';
import { photonSearch, defaultPhotonUrl } from '../src/services';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('caches suggestions by query and coarse bias and aborts obsolete queued searches', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      features: [
        {
          properties: { name: 'Lisboa', country: 'Portugal' },
          geometry: { type: 'Point', coordinates: [-9.14, 38.72] },
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetch);
  const first = photonSearch(
    'Lisboa',
    defaultPhotonUrl,
    [38.712345, -9.123456],
    new AbortController().signal,
  );
  await vi.runAllTimersAsync();
  const results = await first;
  expect(results[0].lat).toBe('38.72');
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toContain('lat=38.7');
  expect(String(url)).not.toContain('38.712345');
  expect(options.credentials).toBe('omit');
  expect(
    await photonSearch(
      'Lisboa',
      defaultPhotonUrl,
      [38.712345, -9.123456],
      new AbortController().signal,
    ),
  ).toEqual(results);
  expect(fetch).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const obsolete = photonSearch(
    'Old',
    defaultPhotonUrl,
    [0, 0],
    controller.signal,
  );
  const assertion = expect(obsolete).rejects.toMatchObject({
    name: 'AbortError',
  });
  controller.abort();
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(1);
});
