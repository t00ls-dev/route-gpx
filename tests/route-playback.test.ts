import { expect, it } from 'vitest';
import type { Step } from '../src/core';
import { roadAt } from '../src/route-playback';

const steps: Step[] = [
  { name: 'Avenida Brasil', ref: 'BR-101', distance: 1000, duration: 60 },
  { name: 'Arrive', ref: '', distance: 0, duration: 0 },
  { name: 'Rua Local', ref: '', distance: 500, duration: 60 },
  { name: '', ref: '', distance: 200, duration: 20 },
];

it('finds the road at an along-track distance from router steps', () => {
  expect(roadAt(steps, 0)).toBe('BR-101 Avenida Brasil');
  expect(roadAt(steps, 1000)).toBe('BR-101 Avenida Brasil');
  // Zero-length steps (arrivals, turns) are skipped.
  expect(roadAt(steps, 1001)).toBe('Rua Local');
  // A step without name or ref, and distances past the end, are unknown.
  expect(roadAt(steps, 1600)).toBeNull();
  expect(roadAt(steps, 5000)).toBeNull();
  expect(roadAt([], 0)).toBeNull();
});
