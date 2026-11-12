import { describe, expect, it } from 'vitest';
import {
  type ClusterItem,
  clusterWeather,
  compareSeverity,
  markerBox,
  overlaps,
  shownMember,
} from '../src/weather-clusters';

/** A sample whose route point sits `x` pixels along a horizontal road. */
function item(x: number, extra: Partial<ClusterItem> = {}): ClusterItem {
  return {
    box: markerBox(x, 100, extra.pass),
    severity: 0,
    condition: 'weather-sun',
    headwind: false,
    wind: 10,
    point: false,
    ...extra,
  };
}

describe('markerBox', () => {
  it('hangs outbound markers right of the point and return markers left, count included', () => {
    // The 68 × 52 icon and 6 px more above for the count.
    expect(markerBox(100, 100)).toEqual({
      left: 98,
      top: 54,
      right: 166,
      bottom: 112,
    });
    expect(markerBox(100, 100, 'return')).toEqual({
      left: 34,
      top: 54,
      right: 102,
      bottom: 112,
    });
  });
});

describe('overlaps', () => {
  it('needs a 2 px gap between markers', () => {
    expect(overlaps(markerBox(0, 0), markerBox(69, 0))).toBe(true);
    expect(overlaps(markerBox(0, 0), markerBox(71, 0))).toBe(false);
    expect(overlaps(markerBox(0, 0), markerBox(0, 61))).toBe(false);
    expect(overlaps(markerBox(0, 0), markerBox(0, 59))).toBe(true);
  });
});

describe('compareSeverity', () => {
  it('ranks alerts, then condition, then headwind, then wind', () => {
    const sun = item(0),
      storm = item(0, { condition: 'weather-thunderstorm' }),
      alert = item(0, { severity: 1 }),
      head = item(0, { headwind: true, wind: 5 }),
      strong = item(0, { wind: 60 });
    expect(compareSeverity(alert, storm)).toBeGreaterThan(0);
    expect(compareSeverity(storm, head)).toBeGreaterThan(0);
    expect(compareSeverity(head, strong)).toBeGreaterThan(0);
    expect(compareSeverity(strong, sun)).toBeGreaterThan(0);
    expect(compareSeverity(sun, sun)).toBe(0);
  });
});

describe('shownMember', () => {
  it('shows the worst alert, else a route point, else the worst sample', () => {
    const items = [
      item(0, { point: true }),
      item(10, { condition: 'weather-rain' }),
      item(20, { severity: 1, condition: 'weather-fog' }),
      item(30, { severity: 2, condition: 'weather-cloud' }),
    ];
    expect(shownMember(items, [0, 1, 2, 3])).toBe(3);
    expect(shownMember(items, [0, 1])).toBe(0);
    expect(shownMember(items, [1, 2])).toBe(2);
    expect(shownMember(items, [1])).toBe(1);
  });
});

describe('clusterWeather', () => {
  it('leaves markers alone when they fit', () => {
    const clusters = clusterWeather([item(0), item(100), item(200)]);
    expect(clusters.map((c) => c.members)).toEqual([[0], [1], [2]]);
    expect(clusters.every((c) => c.noneWorse && c.alerts === 0)).toBe(true);
  });

  it('merges overlapping markers until shown markers fit', () => {
    const items = [0, 20, 40, 60, 80, 200].map((x) => item(x));
    items[2] = item(40, { condition: 'weather-rain' });
    const clusters = clusterWeather(items);
    const shown = clusters.map((c) => items[c.shown].box);
    for (const [a, box] of shown.entries())
      for (const other of shown.slice(a + 1))
        expect(overlaps(box, other)).toBe(false);
    // Every sample belongs to exactly one cluster.
    expect(clusters.flatMap((c) => c.members).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    const rain = clusters.find((c) => c.members.includes(2))!;
    expect(rain.shown).toBe(2);
    expect(rain.noneWorse).toBe(true);
  });

  it('counts alerts and hidden alerts', () => {
    const items = [
      item(0, { severity: 1, condition: 'weather-rain' }),
      item(10, { severity: 3, condition: 'weather-thunderstorm' }),
      item(20),
    ];
    const [cluster] = clusterWeather(items);
    expect(cluster).toMatchObject({
      members: [0, 1, 2],
      shown: 1,
      noneWorse: true,
      alerts: 2,
      hiddenAlerts: 1,
    });
  });

  it('keeps a route point over a worse sample without alerts', () => {
    const items = [
      item(0, { point: true }),
      item(10, { condition: 'weather-rain' }),
    ];
    const [cluster] = clusterWeather(items);
    expect(cluster.shown).toBe(0);
    expect(cluster.noneWorse).toBe(false);
    expect(cluster.hiddenAlerts).toBe(0);
  });

  it('shares markers where the route comes back near itself', () => {
    // A loop: samples 0 and 3 are far apart along the route, close on screen.
    const items = [
      item(0),
      item(200),
      item(400),
      item(15, { severity: 1, condition: 'weather-rain' }),
    ];
    const clusters = clusterWeather(items);
    expect(clusters.map((c) => c.members)).toEqual([[0, 3], [1], [2]]);
    expect(clusters[0].shown).toBe(3);
  });

  it('keeps an outbound and a return marker on the same point side by side', () => {
    const items = [
      item(100, { pass: 'outbound', point: true }),
      item(100, { pass: 'return', point: true }),
    ];
    expect(clusterWeather(items).map((c) => c.members)).toEqual([[0], [1]]);
  });
});
