import { expect, it, vi } from 'vitest';
import { defaultView, initialView } from '../src/default-view';

it('uses a known timezone before language, then region and language fallbacks', () => {
  expect(defaultView('Europe/Lisbon', ['en-US']).center).toEqual([39.5, -8]);
  expect(defaultView('Unknown', ['en-AU']).center).toEqual([-25, 134]);
  expect(defaultView('Unknown', ['pt']).center).toEqual([-23, -46]);
  expect(defaultView('Unknown', ['unknown', 'ja']).center).toEqual([36, 138]);
});
it('has a world fallback with no network access', () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect(defaultView('Etc/UTC', ['xx'])).toEqual({ center: [20, 0], zoom: 2 });
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
it('stops at the first resolved layer: URL, authorized GPS, IP, local', async () => {
  const gps = { center: [1, 2] as [number, number], zoom: 16 };
  const ip = { center: [3, 4] as [number, number], zoom: 10 };
  const local = vi.fn(() => defaultView('Europe/London', []));
  const authorizedPosition = vi
    .fn<() => Promise<typeof gps | null>>()
    .mockResolvedValue(gps);
  const approximateRegion = vi
    .fn<() => Promise<typeof ip | null>>()
    .mockResolvedValue(ip);
  const options = {
    hasRoute: true,
    authorizedPosition,
    approximateRegion,
    local,
  };
  expect(await initialView(options)).toBeNull();
  expect(authorizedPosition).not.toHaveBeenCalled();
  options.hasRoute = false;
  expect(await initialView(options)).toEqual(gps);
  expect(approximateRegion).not.toHaveBeenCalled();
  authorizedPosition.mockResolvedValue(null);
  expect(await initialView(options)).toEqual(ip);
  expect(local).not.toHaveBeenCalled();
  approximateRegion.mockResolvedValue(null);
  expect(await initialView(options)).toEqual(local());
});
