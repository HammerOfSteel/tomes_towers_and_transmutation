/**
 * AggroSystem — shared enemy detection / alert broadcast.
 *
 * Phase B4.
 *
 * When one enemy detects the player, it calls `AggroSystem.shout(position)`.
 * All other registered enemies within `SHOUT_RADIUS` world units are
 * immediately alerted and set to chase the player.
 *
 * Design: single global singleton accessed via `AggroSystem.instance`.
 * Reset via `AggroSystem.instance.clearAll()` on room unload.
 *
 * Usage:
 *   // On enemy spawn:
 *   AggroSystem.instance.register(this);
 *
 *   // On enemy death / room unload:
 *   AggroSystem.instance.unregister(this);
 *
 *   // When an enemy detects the player for the first time:
 *   AggroSystem.instance.shout(this.worldPosition);
 */

import * as THREE from 'three';

// ── AggroListener ─────────────────────────────────────────────────────────────

/** Minimal interface any enemy must implement to participate in the aggro system. */
export interface AggroListener {
  /** Current world position of the enemy (used to compute shout radius). */
  readonly worldPosition: THREE.Vector3;
  /**
   * Called when a nearby ally has detected the player.
   * The enemy should enter 'alert' or 'chase' state immediately.
   */
  onAggroShout(shouter: AggroListener): void;
}

// ── AggroSystem ───────────────────────────────────────────────────────────────

/** Shout radius in world units — alerted enemies within this range alert others. */
export const SHOUT_RADIUS = 8;

/** Rate-limit shouts — one broadcast per this many seconds per shouter. */
const SHOUT_COOLDOWN = 2.0;

export class AggroSystem {
  private static _instance: AggroSystem | null = null;

  static get instance(): AggroSystem {
    if (!AggroSystem._instance) AggroSystem._instance = new AggroSystem();
    return AggroSystem._instance;
  }

  private readonly _listeners = new Set<AggroListener>();
  private readonly _shoutCooldowns = new WeakMap<AggroListener, number>();

  // ── Registration ──────────────────────────────────────────────────────────

  register(listener: AggroListener): void {
    this._listeners.add(listener);
  }

  unregister(listener: AggroListener): void {
    this._listeners.delete(listener);
    this._shoutCooldowns.delete(listener);
  }

  /** Remove all listeners — call when a room is unloaded. */
  clearAll(): void {
    this._listeners.clear();
  }

  // ── Shout broadcast ───────────────────────────────────────────────────────

  /**
   * Broadcast a detection event from `shouter` at `pos`.
   * All registered enemies within `SHOUT_RADIUS` that are not the shouter
   * receive `onAggroShout`.
   *
   * Rate-limited: if the same shouter called `shout` within `SHOUT_COOLDOWN`
   * seconds, this call is a no-op.
   *
   * @param shouter   The enemy that just detected the player.
   */
  shout(shouter: AggroListener): void {
    const now = performance.now() / 1000;
    const last = this._shoutCooldowns.get(shouter) ?? -Infinity;
    if (now - last < SHOUT_COOLDOWN) return;
    this._shoutCooldowns.set(shouter, now);

    const pos = shouter.worldPosition;
    for (const listener of this._listeners) {
      if (listener === shouter) continue;
      const dist = listener.worldPosition.distanceTo(pos);
      if (dist <= SHOUT_RADIUS) {
        listener.onAggroShout(shouter);
      }
    }
  }

  // ── Tick (optional) — advance shout cooldown timers ──────────────────────

  /** Number of active registered listeners (used for debug display). */
  get listenerCount(): number { return this._listeners.size; }
}
