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
  /** Remaining frames of hit-stop freeze (dt passed as 0 while > 0). */
  private _freezeFrames = 0;
  /** Global time scale multiplier (1 = normal, 0.1 = slow-motion). Clamped [0.01, 2]. */
  timeScale = 1;

  /** Register a callback to be called every frame. Returns an unsubscribe fn. */
  onTick(cb: (dt: number) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  /**
   * Hit-stop: freeze game time for `frames` frames (dt=0).
   * Multiple calls accumulate; the max is capped at 8 frames to avoid
   * making the game unresponsive.
   */
  freeze(frames: number): void {
    this._freezeFrames = Math.min(this._freezeFrames + frames, 8);
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

    // Hit-stop: pass dt=0 while freeze frames are pending.
    let effectiveDt = dt;
    if (this._freezeFrames > 0) {
      this._freezeFrames--;
      effectiveDt = 0;
    } else {
      effectiveDt *= Math.max(0.01, Math.min(2, this.timeScale));
    }

    for (const cb of this.callbacks) cb(effectiveDt);

    requestAnimationFrame(this.tick);
  };
}
