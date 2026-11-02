// Optional live test. Default CI never sends requests to public routing servers.
// @vitest-environment node
import process from 'node:process';
import { expect, it } from 'vitest';
import { defaults, examplePoints, meters } from '../src/core';
import { osrmRoute } from '../src/services';
it.skipIf(process.env.RUN_OSRM !== '1')(
  'routes the current Uruguai–Alto da Boa Vista–Grumari example on the main roads',
  async () => {
    const state = defaults();
    state.points = structuredClone(examplePoints);
    const route = await osrmRoute(state);
    const roads = route.steps.map((s) => s.name);
    expect(roads).toEqual(
      expect.arrayContaining([
        'Rua Conde de Bonfim',
        'Estrada das Furnas',
        'Avenida das Américas',
        'Avenida Estado da Guanabara',
      ]),
    );
    expect(route.distance / 1000).toBeGreaterThan(35);
    expect(route.distance / 1000).toBeLessThan(55);
    expect(route.segments[0].length).toBeGreaterThan(500);
    expect(route.snapped).toHaveLength(examplePoints.length);
    route.snapped!.forEach((point, i) =>
      expect(meters(point, examplePoints[i].coord!)).toBeLessThan(100),
    );
    console.log(
      JSON.stringify(
        {
          example:
            'Metrô Uruguai → Alto da Boa Vista → Postinho → Furnas → Barra → Prainha → Grumari',
          km: route.distance / 1000,
          minutes: route.duration! / 60,
          geometryPoints: route.segments[0].length,
          roads: [...new Set(roads)],
        },
        null,
        2,
      ),
    );
  },
  45000,
);
