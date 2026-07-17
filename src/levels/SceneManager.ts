import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { SlimeEnemy } from '@/enemy/SlimeEnemy';
import {
  loadEnemyById, getEnemyModelDef, disposeEnemyRig,
  type EnemyRig,
} from '@/enemy/EnemyLoader';
import { renderBlueprint, type RenderedRoom } from './BlueprintRenderer';
import { validateBlueprint, doorSpawnPosition, isInsideTrigger, type Blueprint } from './blueprint';
import type { WorldInteractable } from '@/interactables/InteractableSystem';
import { ENCOUNTER_POOLS, type RoomEncounterDef } from './RoomEncounterDef';
import { getFloorDef } from './TowerFloorDef';
import { mulberry32 } from '@/core/prng';
import { AggroSystem } from '@/enemy/AggroSystem';

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
  /** Callback invoked when the player walks through a null-target door (world exit). */
  onExitTrigger: (() => void) | null = null;
  /**
   * Called before any staircase or door transition begins.
   * Return `false` to block the transition (e.g., locked floors during the prologue).
   * The `direction` is `'up'` or `'down'` for staircases, `undefined` for flat doors.
   */
  onTransitionAttempt: ((targetId: string, direction?: 'up' | 'down') => boolean) | null = null;

  /** Callback invoked the first time every enemy in a room is defeated.
   *  Used by the story runner to track tower room clears for `clear_dungeon` beats. */
  onRoomCleared: (() => void) | null = null;

  /**
   * spawned and the player is repositioned).  Receives the newly active Blueprint
   * and the Three.js Scene.  Use this to add per-room lights via LightingSystem.
   */
  onRoomLoaded: ((bp: Blueprint, scene: THREE.Scene) => void) | null = null;

  // Transition state machine
  private transitionState: TransitionState = 'idle';
  private fadeTimer = 0;
  private pendingBpId: string | null = null;
  private pendingFromId: string | null = null;
  private triggerCooldown = 0;

  // Kill tracking across rooms
  private accumulatedKills = 0;

  // B3: Wave spawner state for swarm/boss encounters
  private _waveState: {
    def: RoomEncounterDef;
    bp: Blueprint;
    currentWave: number;   // 1-based
    totalWaves: number;
    killsAtWaveStart: number; // roomEnemiesDefeated when this wave began
    threshold: number;         // kills needed to trigger next wave (0 = wait for all dead)
  } | null = null;

  // Unique floor indices visited this session (used by the story runner's
  // explore_floor beat type).
  private _visitedFloorIndices = new Set<number>();

  // Cleared rooms — rooms where every spawned enemy was defeated.  Persisted
  // across sessions in localStorage so enemies don't respawn on revisit.
  private readonly CLEARED_KEY = 'tt3_cleared_rooms';
  private clearedRooms: Set<string>;

  private readonly fadeEl: HTMLDivElement;
  private readonly _titleCard: HTMLDivElement;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly player: PlayerController,
    private readonly onPlayerHit?: (dmg: number) => void,
  ) {
    // Validate and register all blueprints up-front so errors surface early.
    const rawList = [cellStartRaw, corridorNsRaw, corridorEwRaw, librarySmallRaw, libraryLargeRaw];
    this.blueprints = new Map(
      rawList.map((raw) => {
        const bp = validateBlueprint(raw);
        return [bp.id, bp];
      }),
    );

    this.clearedRooms = this._loadClearedRooms();

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

    // Floor title card — shown at peak-black during room transitions.
    this._titleCard = document.createElement('div');
    Object.assign(this._titleCard.style, {
      position: 'fixed', inset: '0',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '14px',
      pointerEvents: 'none',
      zIndex: '101',
      opacity: '0',
      transition: `opacity ${FADE_DURATION * 0.6}s ease`,
    });
    this._titleCard.innerHTML = `
      <div id="_tc-name" style="
        font-family:'Cinzel',serif;font-size:clamp(18px,3vw,34px);
        font-weight:700;color:#c8b8e8;letter-spacing:4px;
        text-shadow:0 0 30px rgba(160,100,255,.5),0 2px 6px rgba(0,0,0,.9);
      "></div>
      <div id="_tc-quote" style="
        font-family:'IM Fell English',Georgia,serif;font-style:italic;
        font-size:clamp(11px,1.4vw,15px);color:#6a5878;
        max-width:420px;text-align:center;line-height:1.7;
      "></div>
    `;
    document.body.appendChild(this._titleCard);
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

  /** The currently active Blueprint, or null if no room is loaded. */
  get currentBlueprint(): import('./blueprint').Blueprint | null {
    if (!this.currentBpId) return null;
    return this.blueprints.get(this.currentBpId) ?? null;
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

  /** Wave info for swarm encounters: null when no wave encounter is active. */
  get waveInfo(): { current: number; total: number } | null {
    return this._waveState
      ? { current: this._waveState.currentWave, total: this._waveState.totalWaves }
      : null;
  }

  /** The floor number of the currently loaded room (0 = ground floor). */
  get currentFloor(): number {
    return this._currentFloor;
  }

  /**
   * Returns a staircase approach hint string when the player is within 3.5u of
   * a staircase trigger, or null if none are close. Used for the HUD prompt.
   */
  getStaircaseHint(playerPos: THREE.Vector3): string | null {
    if (!this.currentRoom) return null;
    const HINT_RANGE = 3.5;
    for (const t of this.currentRoom.doorTriggers) {
      if (!t.direction) continue; // flat door, not a staircase
      const dx = playerPos.x - t.cx;
      const dz = playerPos.z - t.cz;
      if (Math.sqrt(dx * dx + dz * dz) > HINT_RANGE) continue;
      const destFloor = this._currentFloor + (t.direction === 'up' ? 1 : -1);
      const destLabel = destFloor === 0
        ? 'Ground Floor'
        : destFloor > 0
          ? `Floor ${destFloor}`
          : `Basement ${Math.abs(destFloor)}`;
      return t.direction === 'up' ? `↑ Climb to ${destLabel}` : `↓ Descend to ${destLabel}`;
    }
    return null;
  }

  /** Enemies the player can target with attacks this frame. */
  getActiveEnemies(): SlimeEnemy[] {
    return this.activeEnemies;
  }

  /** Directly add a pre-constructed SlimeEnemy to the active enemies list.
   *  Used by the Dev Sandbox to spawn enemies without a blueprint spawn entry. */
  addEnemy(enemy: SlimeEnemy): void {
    this.activeEnemies.push(enemy);
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

  /**
   * Remove the current dungeon room from the scene and destroy its physics
   * bodies. Call this before entering exterior mode so the dungeon geometry
   * and colliders don't interfere with the overworld.
   *
   * Inverse of loadRoomImmediate — the room can be reloaded later via
   * loadRoomImmediate / loadDungeon.
   */
  unloadCurrentRoom(): void {
    if (!this.currentRoom) return;
    this.accumulatedKills += this.activeEnemies.filter(e => e.isDead).length;
    for (const enemy of this.activeEnemies) {
      const rig = enemy.group.userData['enemyRig'] as EnemyRig | undefined;
      if (rig) disposeEnemyRig(rig);
      this.scene.remove(enemy.group);
      enemy.dispose(this.physics);
    }
    this.activeEnemies = [];
    this._waveState = null;
    AggroSystem.instance.clearAll();
    this.scene.remove(this.currentRoom.group);
    this.currentRoom.dispose();
    this.currentRoom = null;
    this.currentBpId  = null;
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
        // Show floor title card at peak-black
        this._showTitleCard();
      }
      return; // skip trigger checks and enemy updates while transitioning
    }

    if (this.transitionState === 'fading_in') {
      this.fadeTimer -= dt;
      const t = Math.max(0, this.fadeTimer / FADE_DURATION);
      this.fadeEl.style.opacity = String(t);
      if (t <= 0) {
        this.fadeEl.style.opacity = '0';
        // Hide title card as screen fades back in
        this._titleCard.style.opacity = '0';
        this.transitionState = 'idle';
      }
      return;
    }

    // ── Enemy updates ─────────────────────────────────────────────────────
    for (const enemy of this.activeEnemies) {
      enemy.update(playerPos, dt);
      // Tick the enemy's real-model AnimationMixer (B4: drive animation state).
      // G1: skip mixer update for enemies beyond 20u — not visible at that distance.
      const rig = enemy.group.userData['enemyRig'] as EnemyRig | undefined;
      if (rig?.mixer) {
        const dx = enemy.group.position.x - playerPos.x;
        const dz = enemy.group.position.z - playerPos.z;
        if (dx * dx + dz * dz < 400) { // 20u²
          this._driveRigAnimation(enemy, rig, dt);
          rig.mixer.update(dt);
        }
      }
    }

    // ── Cleared-room check ────────────────────────────────────────────────
    this._checkRoomCleared();

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
      if (trigger.targetId === null) {
        this.onExitTrigger?.();
        break; // exterior — delegate to caller
      }

      // Allow caller to block the transition (e.g., locked floors during prologue)
      if (this.onTransitionAttempt && !this.onTransitionAttempt(trigger.targetId, trigger.direction)) {
        break;
      }

      // Start the fade-out transition
      this.pendingBpId = trigger.targetId;
      this.pendingFromId = this.currentBpId;
      this.transitionState = 'fading_out';
      this.fadeTimer = 0;
      this.fadeEl.style.opacity = '0'; // reset so CSS transition fires
      break;
    }
  }

  // ── Public helpers ────────────────────────────────────────────────────────

  /** Reset cleared-room state (call when starting a new game). */
  resetCleared(): void {
    this.clearedRooms.clear();
    try { localStorage.removeItem(this.CLEARED_KEY); } catch { /* ignore */ }
  }

  /** Reset visited-floor tracking (call when starting a new game). */
  resetVisitedFloors(): void {
    this._visitedFloorIndices.clear();
  }

  /** Number of unique floor indices the player has visited this session. */
  get uniqueFloorsVisited(): number {
    return this._visitedFloorIndices.size;
  }

  /**
   * Returns a mutable reference to the currently active Blueprint so callers
   * can make one-shot live edits (e.g., removing a picked-up key item).
   * Returns null if no room is loaded.
   */
  currentBlueprintForPatch(): import('@/levels/blueprint').Blueprint | null {
    if (!this.currentBpId) return null;
    return this.blueprints.get(this.currentBpId) ?? null;
  }

  /**
   * Hide all THREE.js objects in the current room that have
   * `userData.pickupId === pickupId`. Used to make a key item
   * visually disappear when the player picks it up.
   */
  hidePickupItem(pickupId: string): void {
    if (!this.currentRoom) return;
    const targets: THREE.Object3D[] = [];
    this.currentRoom.group.traverse((obj) => {
      if (obj.userData['pickupId'] === pickupId) targets.push(obj);
    });
    // G3: "pop" scale animation then hide
    targets.forEach(obj => {
      const origScale = obj.scale.clone();
      const start = performance.now();
      const ANIM_MS = 280;
      const animate = (now: number) => {
        const t = Math.min(1, (now - start) / ANIM_MS);
        // Scale curve: 0→0.5: grow to 1.5×; 0.5→1: shrink to 0
        const scale = t < 0.5
          ? origScale.x * (1 + t * 2 * 0.5)   // 1→1.5
          : origScale.x * (1.5 - (t - 0.5) * 2 * 1.5); // 1.5→0
        obj.scale.setScalar(Math.max(0, scale));
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          obj.visible = false;
          obj.scale.copy(origScale);
        }
      };
      requestAnimationFrame(animate);
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _loadClearedRooms(): Set<string> {
    try {
      const raw = localStorage.getItem(this.CLEARED_KEY);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  }

  private _saveClearedRooms(): void {
    try {
      localStorage.setItem(this.CLEARED_KEY, JSON.stringify([...this.clearedRooms]));
    } catch { /* storage unavailable */ }
  }

  /**
   * Drive the animation state of an attached EnemyRig based on the SlimeEnemy's
   * current state (B4).  Plays the appropriate clip (idle/walk/run/attack/death)
   * and fades the model out after death.
   */
  private _driveRigAnimation(enemy: SlimeEnemy, rig: EnemyRig, dt: number): void {
    const state   = enemy.group.userData['enemyState'] as string | undefined;
    const curAnim = enemy.group.userData['rigCurrentAnim'] as string | undefined;

    // Read the enemy's state from its group.userData if set by SlimeEnemy,
    // otherwise derive from isDead.
    let targetAnim: string;
    if (enemy.isDead) {
      targetAnim = 'death';
    } else if (state === 'chase') {
      targetAnim = 'run';
    } else if (state === 'attack') {
      targetAnim = 'attack';
    } else {
      targetAnim = 'idle';
    }

    // Transition animation only when the target changes.
    if (targetAnim !== curAnim) {
      enemy.group.userData['rigCurrentAnim'] = targetAnim;
      const clips = rig.clips;
      const action =
        targetAnim === 'death'  ? clips.death  :
        targetAnim === 'run'    ? (clips.run ?? clips.walk) :
        targetAnim === 'attack' ? clips.attack :
        clips.idle;

      if (action) {
        rig.mixer!.stopAllAction();
        action.reset().setLoop(
          targetAnim === 'death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity,
        ).play();
      }
    }

    // Death fade: after SlimeEnemy's own death timer ends, fade the model out.
    const fadeTimer = enemy.group.userData['_modelFadeTimer'] as number | undefined;
    if (fadeTimer !== undefined && fadeTimer > 0) {
      const t = Math.max(0, fadeTimer - dt);
      enemy.group.userData['_modelFadeTimer'] = t;
      const opacity = t / 1.5; // 1.5 = MODEL_FADE_DURATION
      rig.group.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.opacity = opacity;
        }
      });
    }
  }

  /** Mark the current room cleared when all enemies are dead. */
  private _checkRoomCleared(): void {
    if (!this.currentBpId) return;
    if (this.clearedRooms.has(this.currentBpId)) return;
    if (this.activeEnemies.length === 0) return;   // nothing to clear (empty room)

    // B3: check if the current wave of a swarm encounter should advance
    if (this._waveState) {
      const ws = this._waveState;
      const killedThisWave = this.roomEnemiesDefeated - ws.killsAtWaveStart;
      const allWaveDead = this.activeEnemies.every(e => e.isDead);
      const thresholdMet = ws.threshold > 0
        ? killedThisWave >= ws.threshold
        : allWaveDead;

      if (thresholdMet && ws.currentWave < ws.totalWaves) {
        // Advance to the next wave
        ws.currentWave++;
        ws.killsAtWaveStart = this.roomEnemiesDefeated;
        this._spawnWave(ws.def, ws.bp, ws.currentWave);
        return; // don't mark room as cleared yet
      } else if (ws.currentWave >= ws.totalWaves && allWaveDead) {
        // All waves done — fall through to clear
        this._waveState = null;
      } else {
        return; // still in progress
      }
    }

    if (this.activeEnemies.every((e) => e.isDead)) {
      this.clearedRooms.add(this.currentBpId);
      this._saveClearedRooms();
      this.onRoomCleared?.();
    }
  }

  /**
   * Spawn the enemies for a designed encounter into the current room.
   * For swarm encounters: only spawns wave 1 and sets up _waveState.
   * Falls back to SlimeEnemy for any enemy ID not yet handled by EnemyLoader.
   */
  private _spawnEncounter(def: RoomEncounterDef, bp: Blueprint): void {
    this._waveState = null; // reset any previous wave state

    if (def.pattern === 'swarm' && (def.waveCount ?? 1) > 1) {
      // Swarm: initialise wave state and only spawn wave 1
      this._waveState = {
        def, bp,
        currentWave:      1,
        totalWaves:       def.waveCount!,
        killsAtWaveStart: 0,
        threshold:        def.waveKillThreshold ?? 0,
      };
      this._spawnWave(def, bp, 1);
      return;
    }

    // Non-swarm: spawn all enemies immediately
    this._spawnWave(def, bp, 1);
  }

  /** Spawn enemies for a specific wave number of an encounter.
   *  Wave 1 = first batch; subsequent waves are the same enemy groups re-spawned. */
  private _spawnWave(def: RoomEncounterDef, bp: Blueprint, wave: number): void {
    const bp_w = bp.width  * bp.cellSize;
    const bp_d = bp.depth  * bp.cellSize;
    // Offset hash by wave number so each wave spawns at different positions
    const hash = (def.id + wave).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
    const rng  = mulberry32(hash);

    // For patrol encounters, generate 4 waypoints at inner room corners.
    const isPatrol = def.pattern === 'patrol';
    const r = Math.min(bp_w, bp_d) * 0.3;
    const patrolWaypoints = isPatrol ? [
      { x:  r, z:  r },
      { x: -r, z:  r },
      { x: -r, z: -r },
      { x:  r, z: -r },
    ] : [];

    for (const group of def.enemies) {
      for (let i = 0; i < group.count; i++) {
        const x = (rng() * 0.7 - 0.35) * bp_w;
        const z = (rng() * 0.7 - 0.35) * bp_d;
        const spawnPos = new THREE.Vector3(x, 1.5, z);

        // Create SlimeEnemy for physics + AI (capsule collider, FSM, health).
        const enemy = new SlimeEnemy(spawnPos, this.physics, (dmg) => {
          this.player.health.takeDamage(dmg);
          if (dmg > 0) this.onPlayerHit?.(dmg);
        });
        enemy.group.userData['enemyId'] = group.enemyId;

        // B4: attach patrol behavior for patrol-pattern encounters.
        if (isPatrol && patrolWaypoints.length > 0) {
          const wpOffset = i * Math.floor(patrolWaypoints.length / Math.max(group.count, 1));
          const rotated  = [
            ...patrolWaypoints.slice(wpOffset),
            ...patrolWaypoints.slice(0, wpOffset),
          ];
          enemy.setPatrolBehavior({ waypoints: rotated });
        }

        this.scene.add(enemy.group);
        this.activeEnemies.push(enemy);

        // Asynchronously swap the visual to the real enemy model (EnemyLoader).
        // Falls back gracefully to the SlimeEnemy sphere if the model isn't found.
        const modelDef = getEnemyModelDef(group.enemyId);
        if (modelDef) {
          loadEnemyById(group.enemyId, spawnPos).then(rig => {
            // Hide the SlimeEnemy's procedural sphere children.
            enemy.group.traverse(child => {
              if (child !== enemy.group && (child as THREE.Mesh).isMesh) {
                child.visible = false;
              }
            });
            // Attach the real model to the enemy group (physics follows group pos).
            rig.group.position.set(0, -spawnPos.y + 0, 0); // ground the model
            enemy.group.add(rig.group);
            enemy.group.userData['enemyRig'] = rig;
          }).catch(err => {
            console.warn(`[SceneManager] model load failed for "${group.enemyId}":`, err);
          });
        }
      }
    }
  }

  /** Unload current room, load `newId`, reposition player, spawn enemies. */
  private executeRoomSwap(newId: string, fromId: string | null): void {
    // ── Teardown current room ─────────────────────────────────────────────
    if (this.currentRoom) {
      this.accumulatedKills += this.activeEnemies.filter((e) => e.isDead).length;

      for (const enemy of this.activeEnemies) {
        const rig = enemy.group.userData['enemyRig'] as EnemyRig | undefined;
        if (rig) disposeEnemyRig(rig);
        this.scene.remove(enemy.group);
        enemy.dispose(this.physics);
      }
      this.activeEnemies = [];
      this._waveState = null;
      AggroSystem.instance.clearAll();

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
    this._visitedFloorIndices.add(bp.floor);
    this.scene.add(this.currentRoom.group);

    // ── Spawn enemies (skip if room was previously cleared) ──────────────
    const skipEnemies = this.clearedRooms.has(newId);
    if (!skipEnemies) {
      // Prefer a designed encounter from the floor's encounter pool when the
      // room is a side room (bp.spawns list is the legacy slime-count path).
      // Side rooms carry spawns[] from TowerGenerator; the pool override runs
      // when bp.spawns is non-empty AND the floor has a designed encounter pool.
      const floorDef = getFloorDef(bp.floor);
      const pool = floorDef?.encounterPool ?? ENCOUNTER_POOLS[bp.floor];

      if (pool && pool.length > 0 && bp.spawns.length > 0) {
        // Seed the encounter selection with a hash of the room id so each
        // side room consistently gets the same encounter across save/loads.
        const hash = newId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
        const rng  = mulberry32(hash);
        const idx  = Math.floor(rng() * pool.length) % pool.length;
        this._spawnEncounter(pool[idx], bp);
      } else {
        // Legacy path: use blueprint spawn positions to place SlimeEnemy.
        for (const spawn of bp.spawns) {
          const spawnPos = new THREE.Vector3(
            (spawn.x + 0.5) * bp.cellSize - (bp.width * bp.cellSize) / 2,
            1.5,
            (spawn.z + 0.5) * bp.cellSize - (bp.depth * bp.cellSize) / 2,
          );
          const enemy = new SlimeEnemy(spawnPos, this.physics, (dmg) => {
            this.player.health.takeDamage(dmg);
            if (dmg > 0) this.onPlayerHit?.(dmg);
          });
          this.scene.add(enemy.group);
          this.activeEnemies.push(enemy);
        }
      }
    }

    // ── Teleport player to entry point ────────────────────────────────────
    if (fromId !== null) {
      // First try a door that leads back to where we came from.
      const entryDoor = bp.doors.find((d) => d.targetId === fromId);
      if (entryDoor) {
        const sp = doorSpawnPosition(entryDoor, bp);
        this.player.teleport(new THREE.Vector3(sp.x, sp.y, sp.z));
      } else {
        // Then try a staircase that leads back to the previous room.
        const entryStair = bp.staircases.find((s) => s.targetId === fromId);
        if (entryStair) {
          const sp = doorSpawnPosition(entryStair, bp);
          this.player.teleport(new THREE.Vector3(sp.x, sp.y, sp.z));
        }
      }
    } else {
      // Initial load — spawn at centre of room
      this.player.teleport(new THREE.Vector3(0, 1.5, 0));
    }

    // ── Scene ambiance ────────────────────────────────────────────────────────
    if (bp.floor === 9) {
      // Observatory rooftop — open twilight sky
      this.scene.background = new THREE.Color(0x0c0820);
      this.scene.fog = new THREE.Fog(0x0c0820, 30, 100);
    } else {
      this.scene.background = null;
      this.scene.fog = new THREE.Fog(0x0a0a0f, 30, 60);
    }

    this.triggerCooldown = TRIGGER_COOLDOWN;

    // Notify listeners (e.g. LightingSystem) that a room has been loaded
    this.onRoomLoaded?.(bp, this.scene);
  }

  // ── Floor title card ──────────────────────────────────────────────────────

  private _showTitleCard(): void {
    const floorDef = getFloorDef(this._currentFloor);
    const nameEl  = this._titleCard.querySelector<HTMLElement>('#_tc-name');
    const quoteEl = this._titleCard.querySelector<HTMLElement>('#_tc-quote');
    if (!nameEl || !quoteEl) return;

    const label = floorDef?.name
      ?? (this._currentFloor === 0
        ? 'Ground Floor'
        : this._currentFloor > 0
          ? `Floor ${this._currentFloor}`
          : `Basement ${Math.abs(this._currentFloor)}`);

    nameEl.textContent  = label;
    quoteEl.textContent = SOLMOR_QUOTES[Math.abs(this._currentFloor) % SOLMOR_QUOTES.length];

    // Fade in briefly then let the fade-in state machine hide it
    requestAnimationFrame(() => { this._titleCard.style.opacity = '1'; });
  }
}

// Atmospheric quotes attributed to Solmor's notes shown during floor transitions.
const SOLMOR_QUOTES: readonly string[] = [
  '"The tower remembers every candidate. The stones do not distinguish."',
  '"Ascension is not a gift. It is a debt the universe has not yet collected."',
  '"I have built this eight times. The ninth will be different. It must be."',
  '"What you are is not the question. What you do with it — that is the experiment."',
  '"The wards hold not to keep things out, but to keep what\'s inside honest."',
  '"Every floor is a thesis. Every room, a footnote. You are my conclusion."',
  '"I did not summon you. The tower did. I merely answered the door."',
  '"The archive knows things I wrote and things I only thought about writing."',
  '"There is no map. There was never a map. The path makes itself known."',
  '"Failure is data. I have an abundance of data."',
];
