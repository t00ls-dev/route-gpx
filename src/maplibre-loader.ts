/**
 * MapLibre GL JS, loaded on demand with its stylesheet and same-origin worker,
 * shared by the planner map and the navigation map.
 */
let loading: Promise<typeof import('maplibre-gl')> | null = null;

export function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  loading ??= (async () => {
    const [ml, worker] = await Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]);
    ml.setWorkerUrl(worker.default);
    return ml;
  })();
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
