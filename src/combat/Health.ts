/** Everything needed to deal or receive damage. */

export interface Damageable {
  readonly hp: number;
  readonly maxHp: number;
  readonly isDead: boolean;
  /** Returns actual damage applied (0 if in i-frames or already dead). */
  takeDamage(amount: number, source?: string): number;
}

// ── HealthComponent ────────────────────────────────────────────────────────

/** Reusable HP component — embed in any entity that can be hurt.
 *
 *  Fires an optional `onDeath` callback once when HP first reaches 0.
 *  Fires an optional `onDamage(amount)` callback on every hit that lands.
 */
export class HealthComponent implements Damageable {
  private _hp: number;
  private _iframeTimer = 0;

  constructor(
    private readonly _maxHp: number,
    private readonly iframeDuration = 0,
    private readonly onDamage?: (amount: number) => void,
    private readonly onDeath?: () => void,
  ) {
    if (_maxHp <= 0) throw new RangeError('maxHp must be > 0');
    this._hp = _maxHp;
  }

  get hp(): number {
    return this._hp;
  }

  get maxHp(): number {
    return this._maxHp;
  }

  get isDead(): boolean {
    return this._hp <= 0;
  }

  get isInvulnerable(): boolean {
    return this._iframeTimer > 0;
  }

  /** Call once per frame with the frame delta (seconds). */
  tick(dt: number): void {
    if (this._iframeTimer > 0) {
      this._iframeTimer = Math.max(0, this._iframeTimer - dt);
    }
  }

  takeDamage(amount: number): number {
    if (this.isDead || this.isInvulnerable || amount <= 0) return 0;

    const actual = Math.min(amount, this._hp);
    this._hp -= actual;
    this._iframeTimer = this.iframeDuration;

    this.onDamage?.(actual);
    if (this._hp <= 0) this.onDeath?.();

    return actual;
  }

  /** Restore HP (e.g. from a potion). Clamped to maxHp. */
  heal(amount: number): void {
    if (this.isDead || amount <= 0) return;
    this._hp = Math.min(this._maxHp, this._hp + amount);
  }

  /** Fully restore HP and clear i-frame timer (use for respawn / restart). */
  reset(): void {
    this._hp = this._maxHp;
    this._iframeTimer = 0;
  }
}
