import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { SlimeEnemy } from '@/enemy/SlimeEnemy';
import { renderBlueprint, type RenderedRoom } from './BlueprintRenderer';
import { validateBlueprint, doorSpawnPosition, isInsideTrigger, type Blueprint } from './blueprint';
import type { WorldInteractable } from '@/interactables/InteractableSystem';

// Raw JSON imports — each is validated on first load.
import cellStartRaw from './blueprints/cell_start.json';
import corridorNsRaw from './blueprints/corridor_ns.json';
import corridorEwRaw from './blueprints/corridor_ew.json';
import librarySmallRaw from './blueprints/library_small.json';
import libraryLargeRaw from './blueprints/library_large.json';

// ── Constants ─────────────────────────────────────────────────────────────

const FADE_DURATION = 0.25;      // seconds for fade-out or fade-in
/** Grace period after a room loads before door triggers activate again. */
const TRIGGER_COOLDOWN = 1.5;

// ── SceneManager ──────────────────────────────────────────────────────────

type TransitionState = 'idle' | 'fading_out' | 'fading_in';

/** Manages the active room — loading, unloading, door transitions, and enemy
 *  spawning.  Wire into the game loop via `update(dt, playerPos)`. */
export class SceneManager {
  private readonly blueprints: Map<string, Blueprint>;

  private currentBpId: string | null = null;
  private currentRoom: RenderedRoom | null = null;
  private activeEnemies: SlimeEnemy[] = [];
  private _currentFloor = 0;
  private _startRoomId: string | null = null;

  // Transition state machine
  private transitionState: TransitionState = 'idle';
  private fadeTimer = 0;
  private pendingBpId: string | null = null;
  private pendingFromId: string | null = null;
  private triggerCooldown = 0;

  // Kill tracking across rooms
  private accumulatedKills = 0;

  private readonly fadeEl: HTMLDivElement;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly player: PlayerController,
  ) {
    // Validate and register all blueprints up-front so errors surface early.
    const rawList = [cellStartRaw, corridorNsRaw, corridorEwRaw, librarySmallRaw, libraryLargeRaw];
    this.blueprints = new Map(
      rawList.map((raw) => {
        const bp = validateBlueprint(raw);
        return [bp.id, bp];
      }),
    );

    // Fade overlay — black div that animates opacity for room transitions.
    this.fadeEl = document.createElement('div');
    Object.assign(this.fadeEl.style, {
      position: 'fixed',
      inset: '0',
      background: '#000',
      opacity: '0',
      pointerEvents: 'none',
      transition: `opacity ${FADE_DURATION}s linear`,
      zIndex: '100',
    });
    document.body.appendChild(this.fadeEl);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Load a room immediately (no fade). Use for the initial room. */
  loadRoomImmediate(id: string): void {
    this.executeRoomSwap(id, null);
    this.triggerCooldown = TRIGGER_COOLDOWN;
  }

  /**
   * Register a dynamically generated blueprint so the SceneManager can load
   * it by its `id`.  Generated blueprints (e.g. from DungeonGenerator) have
   * unique instance IDs that don't clash with the base blueprint names.
   */
  registerBlueprint(bp: import('./blueprint').Blueprint): void {
    this.blueprints.set(bp.id, bp);
  }

  /**
   * Load a generated dungeon plan: register all room instances then
   * immediately teleport the player to the starting room.
   */
  loadDungeon(plan: import('./DungeonGenerator').DungeonPlan): void {
    for (const [, bp] of plan.rooms) {
      this.registerBlueprint(bp);
    }
    this._startRoomId = plan.startRoomId;
    this.loadRoomImmediate(plan.startRoomId);
  }

  /** Instance ID of the dungeon's starting room, or `null` if no dungeon has
   *  been loaded yet.  Used by death-screen restart to return to the beginning. */
  get startRoomId(): string | null {
    return this._startRoomId;
  }

  /** Current total kill count (across all rooms visited). */
  get killCount(): number {
    const currentDead = this.activeEnemies.filter((e) => e.isDead).length;
    return this.accumulatedKills + currentDead;
  }

  /** Total enemies in the current room. */
  get totalEnemies(): number {
    return this.activeEnemies.length;
  }

  /** Enemies defeated (dead) in the currently loaded room only. */
  get roomEnemiesDefeated(): number {
    return this.activeEnemies.filter(e => e.isDead).length;
  }

  /** The floor number of the currently loaded room (0 = ground floor). */
  get currentFloor(): number {
    return this._currentFloor;
  }

  /** Enemies the player can target with attacks this frame. */
  getActiveEnemies(): SlimeEnemy[] {
    return this.activeEnemies;
  }

  /** World-positioned interactables for the currently loaded room.
   *  Returns an empty array if no room is active. */
  getActiveInteractables(): WorldInteractable[] {
    if (!this.currentBpId) return [];
    const bp = this.blueprints.get(this.currentBpId);
    if (!bp) return [];
    return bp.interactables.map((item, i) => ({
      id: `${bp.id}__${item.type}__${i}`,
      position: new THREE.Vector3(
        (item.x + 0.5) * bp.cellSize - (bp.width  * bp.cellSize) / 2,
        0,
        (item.z + 0.5) * bp.cellSize - (bp.depth  * bp.cellSize) / 2,
      ),
      type: item.type,
      content: item.content ?? '',
      spellUnlock: item.spellUnlock,
    }));
  }

  /** Show or hide the active room group (used by the level editor). */
  setVisible(v: boolean): void {
    if (this.currentRoom) this.currentRoom.group.visible = v;
  }

  /** Called once per frame by the game loop.
   *  @param dt Frame delta time in seconds.
   *  @param playerPos Player world position (read-only).
   */
  update(dt: number, playerPos: THREE.Vector3): void {
    // ── Transition state machine ──────────────────────────────────────────
    if (this.transitionState === 'fading_out') {
      this.fadeTimer += dt;
      const t = Math.min(1, this.fadeTimer / FADE_DURATION);
      this.fadeEl.style.opacity = String(t);
      if (t >= 1) {
        // Peak black — swap the room now
        this.executeRoomSwap(this.pendingBpId!, this.pendingFromId);
        this.transitionState = 'fading_in';
        this.fadeTimer = FADE_DURATION;
      }
      return; // skip trigger checks and enemy updates while transitioning
    }

    if (this.transitionState === 'fading_in') {
      this.fadeTimer -= dt;
      const t = Math.max(0, this.fadeTimer / FADE_DURATION);
      this.fadeEl.style.opacity = String(t);
      if (t <= 0) {
        this.fadeEl.style.opacity = '0';
        this.transitionState = 'idle';
      }
      return;
    }

    // ── Enemy updates ─────────────────────────────────────────────────────
    for (const enemy of this.activeEnemies) {
      enemy.update(playerPos, dt);
    }

    // ── Door trigger checks ───────────────────────────────────────────────
    this.triggerCooldown = Math.max(0, this.triggerCooldown - dt);
    if (this.triggerCooldown > 0 || !this.currentRoom) return;

    for (const trigger of this.currentRoom.doorTriggers) {
      if (
        !isInsideTrigger(
          playerPos.x,
          playerPos.z,
          { x: trigger.cx, z: trigger.cz },
          { x: trigger.hx, z: trigger.hz },
        )
      ) continue;
      if (trigger.targetId === null) break; // exterior — no destination yet

      // Start the fade-out transition
      this.pendingBpId = trigger.targetId;
      this.pendingFromId = this.currentBpId;
      this.transitionState = 'fading_out';
      this.fadeTimer = 0;
      this.fadeEl.style.opacity = '0'; // reset so CSS transition fires
      break;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Unload current room, load `newId`, reposition player, spawn enemies. */
  private executeRoomSwap(newId: string, fromId: string | null): void {
    // ── Teardown current room ─────────────────────────────────────────────
    if (this.currentRoom) {
      this.accumulatedKills += this.activeEnemies.filter((e) => e.isDead).length;

      for (const enemy of this.activeEnemies) {
        this.scene.remove(enemy.group);
        enemy.dispose(this.physics);
      }
      this.activeEnemies = [];

      this.scene.remove(this.currentRoom.group);
      this.currentRoom.dispose();
      this.currentRoom = null;
    }

    // ── Load new room ─────────────────────────────────────────────────────
    const bp = this.blueprints.get(newId);
    if (!bp) throw new Error(`SceneManager: unknown blueprint id "${newId}"`);

    this.currentRoom = renderBlueprint(bp, this.physics);
    this.currentBpId = newId;
    this._currentFloor = bp.floor;
    this.scene.add(this.currentRoom.group);

    // ── Spawn enemies ─────────────────────────────────────────────────────
    for (const spawn of bp.spawns) {
      const spawnPos = new THREE.Vector3(
        (spawn.x + 0.5) * bp.cellSize - (bp.width * bp.cellSize) / 2,
        1.5,
        (spawn.z + 0.5) * bp.cellSize - (bp.depth * bp.cellSize) / 2,
      );
      const enemy = new SlimeEnemy(spawnPos, this.physics, (dmg) =>
        this.player.health.takeDamage(dmg),
      );
      this.scene.add(enemy.group);
      this.activeEnemies.push(enemy);
    }

    // ── Teleport player to entry door ─────────────────────────────────────
    if (fromId !== null) {
      // Find the door in the new room that leads back to where we came from.
      const entryDoor = bp.doors.find((d) => d.targetId === fromId);
      if (entryDoor) {
        const sp = doorSpawnPosition(entryDoor, bp);
        this.player.teleport(new THREE.Vector3(sp.x, sp.y, sp.z));
      }
    } else {
      // Initial load — spawn at centre of room
      this.player.teleport(new THREE.Vector3(0, 1.5, 0));
    }

    this.triggerCooldown = TRIGGER_COOLDOWN;
  }
}
