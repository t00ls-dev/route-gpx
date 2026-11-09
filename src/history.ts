/** In-memory snapshots. No locations are persisted outside the route URL. */
export class UndoHistory<T, A = unknown> {
  private past: { value: T; attachment?: A }[] = [];
  private present: { value: T; attachment?: A };
  constructor(
    initial: T,
    private limit = 50,
  ) {
    this.present = { value: structuredClone(initial) };
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  /** What was attached to the current snapshot, such as the route shown for it. */
  get attachment(): A | undefined {
    return this.present.attachment;
  }
  record(next: T): void {
    if (JSON.stringify(next) === JSON.stringify(this.present.value)) return;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = { value: structuredClone(next) };
  }
  /** Stores a reference (not a copy) with the current snapshot; it is released with the snapshot. */
  attach(attachment: A): void {
    this.present.attachment = attachment;
  }
  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.present = previous;
    return structuredClone(previous.value);
  }
}
