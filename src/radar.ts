export const RADAR_METADATA_URL =
  'https://api.rainviewer.com/public/weather-maps.json';
const RADAR_TILE_HOST = 'https://tilecache.rainviewer.com';
export const RADAR_MAX_ZOOM = 7;
export const RADAR_REQUEST_SPACING = 800; // At most 75 starts/minute per page, below the published 100/IP/minute.
export interface RadarFrame {
  time: number;
  path: string;
}
export interface RadarTimeline {
  host: string;
  frames: RadarFrame[];
}
export function parseRadarTimeline(
  data: unknown,
  now = Date.now(),
): RadarTimeline {
  const value = data as { host?: unknown; radar?: { past?: unknown } } | null;
  if (value?.host !== RADAR_TILE_HOST || !Array.isArray(value.radar?.past))
    throw new Error('Radar service returned an invalid response.');
  const frames = value.radar.past as RadarFrame[];
  if (!frames.length)
    throw new Error('No recent radar images available. Try again later.');
  if (
    frames.length > 13 ||
    frames.some(
      (frame, i) =>
        !frame ||
        !Number.isInteger(frame.time) ||
        frame.time < now / 1000 - 3 * 3600 ||
        frame.time > now / 1000 + 300 ||
        (i > 0 && frame.time <= frames[i - 1].time) ||
        typeof frame.path !== 'string' ||
        !/^\/v2\/radar\/[a-zA-Z0-9_-]{1,64}$/.test(frame.path),
    )
  )
    throw new Error('Radar service returned an invalid response.');
  return {
    host: RADAR_TILE_HOST,
    frames: frames.map(({ time, path }) => ({ time, path })),
  };
}
export function radarTileUrl(
  timeline: RadarTimeline,
  frame: RadarFrame | null,
  z: number,
  x: number,
  y: number,
): string {
  if (
    timeline.host !== RADAR_TILE_HOST ||
    ![z, x, y].every(Number.isInteger) ||
    z < 0 ||
    z > RADAR_MAX_ZOOM ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z ||
    (frame && !/^\/v2\/radar\/[a-zA-Z0-9_-]{1,64}$/.test(frame.path))
  )
    throw new Error('Radar service returned an invalid response.');
  const path = frame?.path ?? '/v2/coverage/0';
  return `${timeline.host}${path}/512/${z}/${x}/${y}/${frame ? 2 : 0}/0_0.png`;
}
/** Bounded page-memory cache. No storage or offline/HTTP cache. */
export class RadarImageCache {
  private entries = new Map<string, Blob>();
  private bytes = 0;
  constructor(
    private limit = 64,
    private byteLimit = 16 * 1024 * 1024,
  ) {}
  get(key: string): Blob | undefined {
    const value = this.entries.get(key);
    if (value) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }
  set(key: string, value: Blob): void {
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.bytes -= old.size;
    }
    if (value.size > this.byteLimit) return;
    this.entries.set(key, value);
    this.bytes += value.size;
    while (this.entries.size > this.limit || this.bytes > this.byteLimit) {
      const key = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(key)!.size;
      this.entries.delete(key);
    }
  }
}
