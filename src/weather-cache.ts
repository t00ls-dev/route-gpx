import { serverUrl } from './core';
import type { WeatherHour, WeatherPoint } from './weather';

export function weatherCoordinateKey(point: WeatherPoint): string {
  return point.coord.map((value) => value.toFixed(3)).join(',');
}

/** Page memory only; one fresh covered interval per rounded location and endpoint. */
export class WeatherCache {
  private entries = new Map<
    string,
    { fetched: number; hours: WeatherHour[] }
  >();
  private cells = 0;
  constructor(
    private pointLimit = 200,
    private hourLimit = 100000,
    private ttl = 10 * 60000,
  ) {}
  private key(base: string, point: WeatherPoint) {
    return JSON.stringify([serverUrl(base), weatherCoordinateKey(point)]);
  }
  get(
    base: string,
    point: WeatherPoint,
    start: number,
    end: number,
    now = Date.now(),
  ): WeatherHour[] | undefined {
    const key = this.key(base, point),
      entry = this.entries.get(key);
    if (!entry) return;
    if (now - entry.fetched >= this.ttl || now < entry.fetched) {
      this.entries.delete(key);
      this.cells -= entry.hours.length;
      return;
    }
    const first = entry.hours[0].time,
      last = entry.hours.at(-1)!.time;
    if (first > start || last < end) return;
    this.entries.delete(key);
    this.entries.set(key, entry);
    const step = 3600000;
    return entry.hours.slice((start - first) / step, (end - first) / step + 1);
  }
  set(
    base: string,
    point: WeatherPoint,
    hours: WeatherHour[],
    now = Date.now(),
  ): void {
    if (!hours.length || hours.length > this.hourLimit) return;
    const key = this.key(base, point),
      old = this.entries.get(key);
    if (old) {
      this.cells -= old.hours.length;
      this.entries.delete(key);
    }
    this.entries.set(key, { fetched: now, hours });
    this.cells += hours.length;
    while (this.entries.size > this.pointLimit || this.cells > this.hourLimit) {
      const oldest = this.entries.keys().next().value!;
      this.cells -= this.entries.get(oldest)!.hours.length;
      this.entries.delete(oldest);
    }
  }
}
