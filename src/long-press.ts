export class LongPress {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private origin: { x: number; y: number } | undefined;
  constructor(
    private open: () => void,
    private delay = 500,
    private movement = 7,
  ) {}
  start(x: number, y: number) {
    this.cancel();
    this.origin = { x, y };
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.open();
    }, this.delay);
  }
  move(x: number, y: number) {
    if (
      this.origin &&
      Math.hypot(x - this.origin.x, y - this.origin.y) > this.movement
    )
      this.cancel();
  }
  cancel() {
    clearTimeout(this.timer);
    this.origin = undefined;
  }
}
