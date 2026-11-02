/** In-memory snapshots. No locations are persisted outside the route URL. */
export class UndoHistory<T> {
  private past: T[] = [];
  private present: T;
  constructor(
    initial: T,
    private limit = 50,
  ) {
    this.present = structuredClone(initial);
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  record(next: T): void {
    if (JSON.stringify(next) === JSON.stringify(this.present)) return;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = structuredClone(next);
  }
  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.present = previous;
    return structuredClone(previous);
  }
}
