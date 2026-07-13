// ── PartyManager ──────────────────────────────────────────────────────────────
//
//  Tracks the player's recruited monster minions.
//  Phase 6 cap: 5 followers.  Phase 7 will raise this to 20.

import type * as THREE from 'three';
import type { SlimeEnemy } from '@/enemy/SlimeEnemy';

export class PartyManager {
  /** Maximum number of followers allowed in Phase 6. */
  readonly maxSize: number;

  private readonly _members: SlimeEnemy[] = [];

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** Current number of living followers. */
  get size(): number { return this._members.length; }

  /** True when the party is at maximum capacity. */
  get isFull(): boolean { return this._members.length >= this.maxSize; }

  /** All current members (read-only view). */
  get members(): readonly SlimeEnemy[] { return this._members; }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Attempt to recruit an enemy into the party.
   * @returns `true` if recruited, `false` if the party is already full.
   */
  recruit(enemy: SlimeEnemy): boolean {
    if (this.isFull) return false;
    enemy.recruit();
    this._members.push(enemy);
    return true;
  }

  /**
   * Dismiss the member at the given index.
   * The dismissed minion is not killed; it simply leaves the party.
   */
  dismiss(index: number): void {
    if (index < 0 || index >= this._members.length) return;
    this._members.splice(index, 1);
  }

  /**
   * Remove any members that have died since the last call.
   * Call once per frame (or less frequently if performance matters).
   */
  pruneDead(): void {
    for (let i = this._members.length - 1; i >= 0; i--) {
      if (this._members[i].isDead) this._members.splice(i, 1);
    }
  }

  /**
   * Update all living followers each frame.
   * Delegates to each follower's own `update()` with a target position.
   *
   * @param playerPos   Where followers should try to stay near
   * @param enemies     Nearby hostile enemies followers can attack
   * @param dt          Frame delta time in seconds
   */
  updateFollowers(
    playerPos: THREE.Vector3,
    enemies: readonly SlimeEnemy[],
    dt: number,
  ): void {
    for (const member of this._members) {
      if (!member.isDead) member.updateAsFollower(playerPos, enemies, dt);
    }
  }
}
