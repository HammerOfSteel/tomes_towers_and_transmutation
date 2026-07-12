/** Drives the game update/render cycle via requestAnimationFrame.
 *
 * Physics and rendering are both fired inside the same tick to keep
 * them in lockstep. Registered callbacks receive a delta time in
 * seconds (capped at 50ms to prevent the spiral-of-death on tab resume).
 */
export class GameLoop {
  private lastTime = 0;
  private running = false;
  private readonly callbacks: ((dt: number) => void)[] = [];

  /** Register a callback to be called every frame. Returns an unsubscribe fn. */
  onTick(cb: (dt: number) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private readonly tick = (time: number): void => {
    if (!this.running) return;

    const rawDt = (time - this.lastTime) / 1000;
    // Cap at 50ms: prevents large jumps on tab-switch or debugger pause.
    const dt = Math.min(rawDt, 0.05);
    this.lastTime = time;

    for (const cb of this.callbacks) cb(dt);

    requestAnimationFrame(this.tick);
  };
}
