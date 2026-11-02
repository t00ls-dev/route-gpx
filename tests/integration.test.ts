// Optional live tests. Default CI never sends requests to public routing servers.
// @vitest-environment node
import process from 'node:process';
import { expect, it } from 'vitest';
import { defaults, highways } from '../src/core';
import { osrmRoute } from '../src/services';
it.skipIf(process.env.RUN_OSRM !== '1')(
  'OSRM full geometry uses BR-493 and BR-101 on the original highway case',
  async () => {
    const state = defaults();
    state.points = [
      [-22.6917362, -43.4589026],
      [-22.742209, -43.722682],
      [-22.880232, -43.82581],
      [-22.941176, -44.04976],
      [-22.9805471, -44.2955088],
      [-22.9673333, -44.2989773],
      [-23.0041796, -44.4658686],
    ].map((p, i) => ({ name: `Point ${i}`, coord: [p[0], p[1]] }));
    const route = await osrmRoute(state);
    expect(highways(route.steps)).toEqual(
      expect.arrayContaining(['BR-493', 'BR-101']),
    );
    expect(route.distance / 1000).toBeGreaterThan(150);
    expect(route.distance / 1000).toBeLessThan(190);
    expect(route.segments[0].length).toBeGreaterThan(1000);
  },
  45000,
);
