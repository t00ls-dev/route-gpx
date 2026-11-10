import type { ElevationSource, ProfilePoint } from './elevation';

/**
 * Climb detection on an elevation profile already passed through
 * `smoothProfile`. Pure; no DOM or network. A climb runs from a low point to
 * the highest point reached before the profile drops more than the dip
 * tolerance or stops gaining for too long; short dips inside a long climb do
 * not split it. Climbs never cross GPX segment gaps.
 */

export interface Climb {
  /** Along-track distance of the start (low point) and the summit, meters. */
  start: number;
  end: number;
  length: number;
  /** Elevation of the start and the summit, meters. */
  low: number;
  high: number;
  /** Net elevation gain, summit minus start, meters. */
  gain: number;
  /** Average grade, percent. */
  grade: number;
  /** Steepest grade over `GRADE_WINDOW` for the source, percent. */
  maxGrade: number;
  /** Planning score: gain times average grade (see `climbScore`). */
  score: number;
  /**
   * Terrain elevation steeper than roads usually are: most likely a tunnel
   * (the model reads the hill above it) or a bridge (the valley below).
   */
  suspect: boolean;
}

/** Start and summit move past flat stretches within this band (noise). */
const FLAT_BAND = 3;
/** A drop larger than this ends the climb at its highest point. */
const DIP_TOLERANCE = 15;
/** This far past the highest point without gaining, the climb ends. */
const PLATEAU = 1500;
/** Smallest climb listed: net gain, length and average grade. */
const MIN_GAIN = 40;
const MIN_LENGTH = 400;
const MIN_GRADE = 2.5;
/**
 * Window for the steepest grade, meters. The 90 m terrain model inflates
 * short grades (slopes beside the road, viaducts), so it uses a longer one.
 */
const GRADE_WINDOW: Record<ElevationSource, number> = {
  terrain: 500,
  recorded: 100,
};

/** Steeper than this over the terrain window flags a likely tunnel or bridge. */
const SUSPECT_GRADE = 15;
/**
 * Mode-neutral planning score: gain (m) × average grade (%) / 100. Long
 * steep climbs score highest; it is a review aid, not an effort measure.
 */
export const climbScore = (gain: number, grade: number) => (gain * grade) / 100;

export function detectClimbs(
  profile: ProfilePoint[],
  source: ElevationSource,
): Climb[] {
  const climbs: Climb[] = [];
  let start = 0;
  for (let end = 1; end <= profile.length; end++) {
    if (end < profile.length && !profile[end].gap) continue;
    climbs.push(...climbsIn(profile.slice(start, end), source));
    start = end;
  }
  return climbs;
}

function climbsIn(part: ProfilePoint[], source: ElevationSource): Climb[] {
  const out: Climb[] = [];
  if (part.length < 2) return out;
  let low = 0,
    high = 0,
    // Lowest point since the current high: where a following climb starts.
    trough = 0;
  const finish = () => {
    if (high > low) {
      const climb = describe(part, low, high, source);
      if (climb) out.push(climb);
    }
  };
  for (let i = 1; i < part.length; i++) {
    const ele = part[i].ele;
    if (ele > part[high].ele) {
      high = i;
      trough = i;
      continue;
    }
    if (ele < part[trough].ele) trough = i;
    const dropped = part[high].ele - ele > DIP_TOLERANCE;
    const stalled = part[i].at - part[high].at > PLATEAU;
    if (high === low) {
      // Not climbing yet: keep moving the start down to the lowest point.
      if (ele <= part[low].ele) low = high = trough = i;
      continue;
    }
    if (dropped || stalled) {
      finish();
      low = high = trough;
      // The trough may be behind `i`; anything higher since then restarts here.
      for (let j = trough + 1; j <= i; j++)
        if (part[j].ele > part[high].ele) high = j;
      trough = high;
      for (let j = high + 1; j <= i; j++)
        if (part[j].ele < part[trough].ele) trough = j;
    }
  }
  finish();
  return out;
}

function describe(
  part: ProfilePoint[],
  low: number,
  high: number,
  source: ElevationSource,
): Climb | null {
  const window = GRADE_WINDOW[source];
  // A flat (noisy) run before the rise or after the summit is not climbing:
  // start just before the profile first rises FLAT_BAND above the low point,
  // and end where it first comes within FLAT_BAND of the summit.
  const base = part[low].ele,
    top = part[high].ele;
  for (let i = low + 1; i < high; i++)
    if (part[i].ele - base >= FLAT_BAND) {
      low = i - 1;
      break;
    }
  for (let i = low + 1; i <= high; i++)
    if (top - part[i].ele <= FLAT_BAND) {
      high = i;
      break;
    }
  const a = part[low],
    b = part[high];
  const length = b.at - a.at,
    gain = b.ele - a.ele;
  if (length <= 0) return null;
  const grade = (gain / length) * 100;
  if (gain < MIN_GAIN || length < MIN_LENGTH || grade < MIN_GRADE) return null;
  // Only stretches at least `window` long, so a short tail cannot inflate it;
  // a climb shorter than the window keeps its average.
  let maxGrade = grade;
  for (let i = low, j = low; i < high; i++) {
    while (j < high && part[j].at - part[i].at < window) j++;
    const run = part[j].at - part[i].at;
    if (run < window) break;
    maxGrade = Math.max(maxGrade, ((part[j].ele - part[i].ele) / run) * 100);
  }

  return {
    start: a.at,
    end: b.at,
    length,
    low: a.ele,
    high: b.ele,
    gain,
    grade,
    maxGrade,
    score: climbScore(gain, grade),
    suspect: source === 'terrain' && maxGrade > SUSPECT_GRADE,
  };
}

/** Index of the hardest climb by score, never a suspect one; -1 if none. */
export function hardestClimb(climbs: Climb[]): number {
  let best = -1;
  climbs.forEach((c, i) => {
    if (!c.suspect && (best < 0 || c.score > climbs[best].score)) best = i;
  });
  return best;
}
