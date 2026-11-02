import { expect, it } from 'vitest';
import { UndoHistory } from '../src/history';
it('restores coordinates and removed points without retaining mutable references', () => {
  const initial = { points: [{ coord: [1, 2] }, { coord: [3, 4] }] };
  const history = new UndoHistory(initial);
  initial.points[0].coord = [5, 6];
  history.record(initial);
  initial.points.pop();
  history.record(initial);
  expect(history.undo()?.points).toHaveLength(2);
  const old = history.undo()!;
  expect(old.points[0].coord).toEqual([1, 2]);
  old.points[0].coord = [9, 9];
  expect(history.canUndo).toBe(false);
  expect(history.undo()).toBeNull();
});
it('does not create extra undo steps when recalculating an unchanged route', () => {
  const h = new UndoHistory({ point: 1 });
  h.record({ point: 1 });
  expect(h.canUndo).toBe(false);
  h.record({ point: 2 });
  h.record({ point: 2 });
  expect(h.undo()).toEqual({ point: 1 });
  expect(h.canUndo).toBe(false);
});
it('bounds the undo history', () => {
  const h = new UndoHistory(0, 2);
  h.record(1);
  h.record(2);
  h.record(3);
  expect(h.undo()).toBe(2);
  expect(h.undo()).toBe(1);
  expect(h.undo()).toBeNull();
});
