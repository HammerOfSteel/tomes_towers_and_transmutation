/** Everything needed to deal or receive damage. */
// ── HealthComponent ────────────────────────────────────────────────────────
/** Reusable HP component — embed in any entity that can be hurt.
 *
 *  Fires an optional `onDeath` callback once when HP first reaches 0.
 *  Fires an optional `onDamage(amount)` callback on every hit that lands.
 */
export class HealthComponent {
    _maxHp;
    iframeDuration;
    onDamage;
    onDeath;
    _hp;
    _iframeTimer = 0;
    /** When true this component never takes damage (dev/cheat flag). */
    godMode = false;
    constructor(_maxHp, iframeDuration = 0, onDamage, onDeath) {
        this._maxHp = _maxHp;
        this.iframeDuration = iframeDuration;
        this.onDamage = onDamage;
        this.onDeath = onDeath;
        if (_maxHp <= 0)
            throw new RangeError('maxHp must be > 0');
        this._hp = _maxHp;
    }
    get hp() {
        return this._hp;
    }
    get maxHp() {
        return this._maxHp;
    }
    get isDead() {
        return this._hp <= 0;
    }
    get isInvulnerable() {
        return this._iframeTimer > 0;
    }
    /** Call once per frame with the frame delta (seconds). */
    tick(dt) {
        if (this._iframeTimer > 0) {
            this._iframeTimer = Math.max(0, this._iframeTimer - dt);
        }
    }
    takeDamage(amount) {
        if (this.isDead || this.isInvulnerable || this.godMode || amount <= 0)
            return 0;
        const actual = Math.min(amount, this._hp);
        this._hp -= actual;
        this._iframeTimer = this.iframeDuration;
        this.onDamage?.(actual);
        if (this._hp <= 0)
            this.onDeath?.();
        return actual;
    }
    /** Restore HP (e.g. from a potion). Clamped to maxHp. */
    heal(amount) {
        if (this.isDead || amount <= 0)
            return;
        this._hp = Math.min(this._maxHp, this._hp + amount);
    }
    /** Fully restore HP and clear i-frame timer (use for respawn / restart). */
    reset() {
        this._hp = this._maxHp;
        this._iframeTimer = 0;
    }
    /** Dev/cheat: set HP to an exact value, bypassing isDead guard. */
    forceSetHp(amount) {
        this._hp = Math.max(1, Math.min(this._maxHp, Math.round(amount)));
        this._iframeTimer = 0;
    }
}
