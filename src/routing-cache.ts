import type { Route, State } from './core';

/** Only router responses enter this page-memory cache, never imported/saved geometry. */
export class RoutingCache {
  private entries = new Map<string, { fetched: number; route: Route }>();
  constructor(
    private limit = 20,
    private ttl = 15 * 60000,
  ) {}
  private key(state: State) {
    return JSON.stringify([
      state.osrm,
      state.valhalla,
      state.prefer,
      state.points.map((point) => point.coord),
    ]);
  }
  get(state: State, now = Date.now()): Route | undefined {
    const key = this.key(state),
      entry = this.entries.get(key);
    if (!entry) return;
    if (now - entry.fetched >= this.ttl || now < entry.fetched) {
      this.entries.delete(key);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.route;
  }
  set(state: State, route: Route, now = Date.now()): void {
    const key = this.key(state);
    this.entries.delete(key);
    this.entries.set(key, { route, fetched: now });
    if (this.entries.size > this.limit)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
