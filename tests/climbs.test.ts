import { describe, expect, it } from 'vitest';
import { climbScore, detectClimbs, hardestClimb } from '../src/climbs';
import { smoothProfile, type ProfilePoint } from '../src/elevation';

/** Profile sampled every `step` meters from an elevation function of distance. */
const profile = (
  length: number,
  ele: (at: number) => number,
  step = 100,
): ProfilePoint[] =>
  Array.from({ length: Math.floor(length / step) + 1 }, (_, i) => ({
    at: i * step,
    ele: ele(i * step),
  }));
/** Piecewise-linear elevation through [distance, elevation] points. */
const through =
  (...points: [number, number][]) =>
  (at: number) => {
    const k = points.findIndex(([d]) => d >= at);
    if (k <= 0) return points[Math.max(0, k)][1];
    const [d0, e0] = points[k - 1],
      [d1, e1] = points[k];
    return e0 + ((e1 - e0) * (at - d0)) / (d1 - d0);
  };

describe('climb detection', () => {
  it('finds none on flat or gently rolling routes', () => {
    expect(
      detectClimbs(
        profile(20000, () => 50),
        'terrain',
      ),
    ).toEqual([]);
    // 20 m hills every 2 km: below the 40 m minimum gain.
    const rolling = profile(20000, (at) => 50 + 10 * Math.sin(at / 318));
    expect(detectClimbs(smoothProfile(rolling, 'terrain'), 'terrain')).toEqual(
      [],
    );
  });

  it('measures a long mountain pass with stable boundaries and values', () => {
    // Flat 5 km, 900 m over 15 km (6%), then 5 km down.
    const pass = profile(
      25000,
      through([0, 100], [5000, 100], [20000, 1000], [25000, 600]),
    );
    const [climb, ...rest] = detectClimbs(
      smoothProfile(pass, 'terrain'),
      'terrain',
    );
    expect(rest).toEqual([]);
    // The terrain median rounds the summit slightly.
    expect(climb.start).toBe(5000);
    expect(climb.end).toBeGreaterThanOrEqual(19500);
    expect(climb.end).toBeLessThanOrEqual(20000);
    expect(climb.gain).toBeGreaterThan(870);
    expect(climb.gain).toBeLessThanOrEqual(900);
    expect(climb.grade).toBeCloseTo(6, 0);
    expect(climb.maxGrade).toBeCloseTo(6, 0);
    expect(climb.score).toBeCloseTo(climbScore(climb.gain, climb.grade), 5);
  });

  it('keeps a long climb through a short dip and splits at a real descent', () => {
    // 200 m up, a 10 m dip, 200 m up: one climb.
    const dip = profile(
      9000,
      through([0, 0], [4000, 200], [4500, 190], [8500, 390], [9000, 390]),
    );
    expect(detectClimbs(dip, 'terrain')).toHaveLength(1);
    // 200 m up, 100 m down, 200 m up: two climbs.
    const valley = profile(
      10000,
      through([0, 0], [4000, 200], [5000, 100], [9000, 300], [10000, 300]),
    );
    const climbs = detectClimbs(valley, 'terrain');
    expect(climbs.map((c) => [c.start, c.end, Math.round(c.gain)])).toEqual([
      [0, 4000, 200],
      [5000, 9000, 200],
    ]);
  });

  it('ends a climb on a long plateau instead of joining the next one', () => {
    const plateau = profile(
      14000,
      through([0, 0], [3000, 150], [8000, 150], [11000, 300], [14000, 300]),
    );
    expect(
      detectClimbs(plateau, 'terrain').map((c) => [c.start, c.end]),
    ).toEqual([
      [0, 3000],
      [8000, 11000],
    ]);
  });

  it('smooths a noisy recorded track without inventing climbs', () => {
    // 300 m over 6 km recorded every 10 m, with ±1.5 m GPS noise and spikes.
    let seed = 7;
    const noise = () =>
      ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 3;
    const noisy = profile(
      8000,
      (at) =>
        through([0, 0], [1000, 0], [7000, 300], [8000, 300])(at) +
        noise() +
        (at % 1000 === 500 ? 25 : 0),
      10,
    );
    const climbs = detectClimbs(smoothProfile(noisy, 'recorded'), 'recorded');
    expect(climbs).toHaveLength(1);
    expect(climbs[0].start).toBeGreaterThan(800);
    expect(climbs[0].start).toBeLessThan(1200);
    expect(climbs[0].gain).toBeGreaterThan(290);
    expect(climbs[0].gain).toBeLessThan(310);
    expect(climbs[0].maxGrade).toBeLessThan(10);
  });

  it('never joins a climb across a GPX segment gap', () => {
    const first = profile(3000, through([0, 0], [3000, 30]));
    const second = profile(3000, through([0, 500], [3000, 530])).map(
      (p, i) => ({
        at: p.at + 3000,
        ele: p.ele,
        ...(i === 0 ? { gap: true } : {}),
      }),
    );
    // 30 m each side: not climbs, and the 470 m jump across the gap is not one.
    expect(detectClimbs([...first, ...second], 'terrain')).toEqual([]);
  });

  it('measures the steepest stretch over the window for the source', () => {
    // 1 km at 4%, 200 m at 15%, 1 km at 4%.
    const steep = profile(
      2400,
      through([0, 0], [1000, 40], [1200, 70], [2200, 110], [2400, 110]),
      20,
    );
    const [recorded] = detectClimbs(steep, 'recorded');
    const [terrain] = detectClimbs(steep, 'terrain');
    expect(recorded.maxGrade).toBeCloseTo(15, 0);
    // Over 500 m the ramp is diluted: (30 + 300 m × 4%) / 500 m.
    expect(terrain.maxGrade).toBeCloseTo(8.4, 0);
  });

  it('flags terrain climbs too steep for a road, and never as the hardest', () => {
    // A tunnel under a hill: the terrain rises 300 m in 1 km (30%).
    const tunnel = profile(
      9000,
      through([0, 0], [1000, 300], [2000, 0], [8000, 360], [9000, 360]),
    );
    const climbs = detectClimbs(tunnel, 'terrain');
    expect(climbs.map((c) => c.suspect)).toEqual([true, false]);
    expect(hardestClimb(climbs)).toBe(1);
    // The same shape recorded on the road is taken at face value.
    expect(detectClimbs(tunnel, 'recorded')[0].suspect).toBe(false);
  });

  it('marks the hardest climb by score', () => {
    const route = profile(
      30000,
      through(
        [0, 0],
        [3000, 300], // 300 m at 10%: score 30
        [6000, 100],
        [16000, 700], // 600 m at 6%: score 36
        [20000, 700],
      ),
    );
    const climbs = detectClimbs(route, 'terrain');
    expect(climbs).toHaveLength(2);
    expect(hardestClimb(climbs)).toBe(1);
    expect(hardestClimb([])).toBe(-1);
  });
});
