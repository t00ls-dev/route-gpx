import { describe, expect, it } from 'vitest';
import type { Coord, Route, Step } from '../src/core';
import {
  compassHeading,
  createNavigationTracker,
  isMoving,
  turnToward,
  navigationDistanceLabel,
  navigationDurationLabel,
  navigationManeuvers,
} from '../src/navigation';

// About 111.2 m per 0.001° along the equator.
const M = 111.195;
const east = (from: number, to: number): Coord[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [0, (from + i) * 0.001]);
const step = (extra: Partial<Step>): Step => ({
  name: 'Road',
  ref: '',
  distance: 100,
  duration: 10,
  ...extra,
});
/** About 2.2 km east with a right turn at 0.5 km and a left one at 1.5 km. */
const route = (extra: Partial<Route> = {}): Route => ({
  segments: [east(0, 20)],
  steps: [
    step({ name: 'Start road', kind: 'depart', at: [0, 0], distance: 5 * M }),
    step({
      name: 'Second road',
      kind: 'turn',
      modifier: 'right',
      at: [0, 0.005],
      distance: 10 * M,
    }),
    step({
      name: 'Third road',
      kind: 'turn',
      modifier: 'left',
      at: [0, 0.015],
      distance: 5 * M,
    }),
    step({ name: '', kind: 'arrive', at: [0, 0.02], distance: 0 }),
  ],
  distance: 20 * M,
  duration: 200,
  provider: 'OSRM',
  ...extra,
});

describe('navigation maneuvers', () => {
  it('lists every maneuver after the departure, the arrival included', () => {
    expect(
      navigationManeuvers(route()).map((m) => [m.step.name, Math.round(m.at)]),
    ).toEqual([
      ['Second road', Math.round(5 * M)],
      ['Third road', Math.round(15 * M)],
      ['', Math.round(20 * M)],
    ]);
  });
  it('has none for a track without directions', () => {
    expect(navigationManeuvers(route({ steps: [] }))).toEqual([]);
    expect(createNavigationTracker(route({ steps: [] })).hasManeuvers).toBe(
      false,
    );
  });
});

describe('navigation tracker', () => {
  it('gives the next maneuver, the one after it and the remaining distance', () => {
    const tracker = createNavigationTracker(route());
    const r = tracker.update({ coord: [0.0001, 0.002], accuracy: 5 })!;
    expect(r.progress).toBeCloseTo(2 * M, 0);
    expect(r.remaining).toBeCloseTo(18 * M, 0);
    expect(r.next?.step.name).toBe('Second road');
    expect(r.toNext).toBeCloseTo(3 * M, 0);
    expect(r.after?.step.name).toBe('Third road');
    expect(r.afterGap).toBeCloseTo(10 * M, 0);
    expect(r.weak).toBe(false);
    expect(r.arrived).toBe(false);
    expect(r.heading).toBeCloseTo(90, 3);
  });
  it('moves on once a maneuver is passed', () => {
    const tracker = createNavigationTracker(route());
    tracker.update({ coord: [0, 0.004], accuracy: 5 });
    const r = tracker.update({ coord: [0, 0.0052], accuracy: 5 })!;
    expect(r.next?.step.name).toBe('Third road');
    expect(r.after?.step.kind).toBe('arrive');
  });
  it('arrives near the end of the route, not just near its line', () => {
    const tracker = createNavigationTracker(route());
    expect(tracker.update({ coord: [0, 0.0199], accuracy: 5 })!.arrived).toBe(
      true,
    );
    // Far to the side of the end, the destination is not reached.
    expect(
      createNavigationTracker(route()).update({
        coord: [0.002, 0.02],
        accuracy: 5,
      })!.arrived,
    ).toBe(false);
  });
  it('marks imprecise fixes as a weak signal', () => {
    const tracker = createNavigationTracker(route());
    expect(tracker.update({ coord: [0, 0.002], accuracy: 31 })!.weak).toBe(
      true,
    );
    expect(tracker.update({ coord: [0, 0.002], accuracy: NaN })!.weak).toBe(
      true,
    );
  });
  it('keeps the pass being travelled on an out-and-back route', () => {
    const back = [...east(0, 10)].reverse();
    const outAndBack = route({
      segments: [[...east(0, 10), ...back.slice(1)]],
      steps: [],
    });
    const tracker = createNavigationTracker(outAndBack);
    // Outbound, then the turnaround, then on the way back past the same spot.
    tracker.update({ coord: [0, 0.004], accuracy: 5 });
    tracker.update({ coord: [0, 0.01], accuracy: 5 });
    const r = tracker.update({ coord: [0, 0.004], accuracy: 5 })!;
    expect(r.progress).toBeCloseTo(16 * M, 0);
    expect(r.heading).toBeCloseTo(270, 3);
  });
  it('without maneuvers counts down to the destination', () => {
    const r = createNavigationTracker(route({ steps: [] })).update({
      coord: [0, 0.005],
      accuracy: 5,
    })!;
    expect(r.next).toBeNull();
    expect(r.toNext).toBeCloseTo(15 * M, 0);
  });
  it('draws the travelled part up to the progress', () => {
    const tracker = createNavigationTracker(route());
    const [part] = tracker.travelled(2 * M);
    expect(part[0]).toEqual([0, 0]);
    expect(part.at(-1)![1]).toBeCloseTo(0.002, 6);
  });
});

describe('navigation labels', () => {
  it.each<[number, 'metric' | 'imperial', string]>([
    [4, 'metric', '10 m'],
    [87, 'metric', '90 m'],
    [263, 'metric', '250 m'],
    [990, 'metric', '1.0 km'],
    [1260, 'metric', '1.3 km'],
    [12400, 'metric', '12 km'],
    [20, 'imperial', '50 ft'],
    [120, 'imperial', '400 ft'],
    [320, 'imperial', '0.2 mi'],
    [20000, 'imperial', '12 mi'],
  ])('%d m in %s reads %s', (meters, units, label) => {
    expect(navigationDistanceLabel(meters, units)).toBe(label);
  });
  it('uses the language decimal separator', () => {
    expect(navigationDistanceLabel(1260, 'metric', 'pt-BR')).toBe('1,3 km');
  });
  it('writes the remaining time like the route summary', () => {
    expect(navigationDurationLabel(18 * 60)).toBe('18 min');
    expect(navigationDurationLabel(108 * 60)).toBe('1h 48 min');
  });
});

describe('navigation heading', () => {
  it('switches between moving and stopped with hysteresis', () => {
    expect(isMoving(1.5, false)).toBe(false);
    expect(isMoving(2.5, false)).toBe(true);
    expect(isMoving(1.5, true)).toBe(true);
    expect(isMoving(0.5, true)).toBe(false);
    expect(isMoving(null, true)).toBe(true);
    expect(isMoving(null, false)).toBe(false);
  });
  it('reads the compass from iOS and from absolute orientation', () => {
    expect(
      compassHeading({ alpha: 10, absolute: false, webkitCompassHeading: 45 }),
    ).toBe(45);
    expect(compassHeading({ alpha: 90, absolute: true })).toBe(270);
    expect(compassHeading({ alpha: 0, absolute: true })).toBe(0);
    // Without a north reference there is no compass.
    expect(compassHeading({ alpha: 90, absolute: false })).toBeNull();
    expect(compassHeading({ alpha: null, absolute: true })).toBeNull();
    // A phone turned to landscape points 90° further.
    expect(compassHeading({ alpha: 0, absolute: true }, 90)).toBe(90);
  });
  it('smooths along the shorter arc across north', () => {
    expect(turnToward(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(turnToward(10, 350, 0.5)).toBeCloseTo(0, 6);
    expect(turnToward(90, 180, 0.25)).toBeCloseTo(112.5, 6);
  });
});
