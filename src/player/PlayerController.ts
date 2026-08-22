import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { InputState } from '@/core/InputManager';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PALETTE } from '@/shaders/palette';
import { rapierToThreeInto } from '@/physics/helpers';
import { HealthComponent } from '@/combat/Health';
import type { CreatureDNA } from '@/creatures/CreatureDNA';
import { buildCreature, computeQuadNaturalFootY, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';
import { ProceduralWalkController } from '@/rendering/ProceduralWalk';
import type { CharModelDef } from '@/characters/charManifest';
import { loadCharModel } from '@/characters/CharacterLoader';
import { CharacterController } from '@/characters/CharacterController';
import { LevitateEffect } from '@/player/LevitateEffect';

// ── Capsule dimensions ─────────────────────────────────────────────────────

const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.35;
const KCC_OFFSET = 0.01;

// ── Speed ─────────────────────────────────────────────────────────────────

const WALK_SPEED = 5;
const RUN_SPEED = 10;
/** Snappy ground acceleration (units/s²). */
const ACCEL_GROUND = 40;
/** Ground friction when no input. */
const DECEL_GROUND = 30;
/** Air acceleration — less responsive than ground. */
const ACCEL_AIR = 12;
/** Air deceleration — almost zero, preserve momentum. */
const DECEL_AIR = 4;

// ── Jump ──────────────────────────────────────────────────────────────────

const JUMP_VELOCITY = 11;
/** Low gravity while holding Space on the way up → floaty rise. */
const GRAVITY_RISE = 22;
/** High gravity when Space released early → short hop. */
const GRAVITY_RELEASE = 60;
/** Snappier fall gravity — faster to land than to rise. */
const GRAVITY_FALL = 40;
const MAX_FALL_SPEED = 25;
/** Tiny downward push every grounded frame keeps KCC contact detection happy. */
const GROUND_PUSH = -2;

const SWIM_SPEED = 3.5;          // world units/sec — slower than WALK_SPEED (5)
/** WU below water surface the player floats toward while swimming. Must
 *  stay comfortably deeper than WaterLabScene's SWIM_EXIT_DEPTH_THRESHOLD
 *  (currently 0.45) — otherwise the buoyant equilibrium point sits outside
 *  the zone that keeps swim mode active, and the caller's depth-based state
 *  machine "hunts": buoyancy floats the player up past the exit threshold,
 *  swim mode (and its buoyancy) turns off, gravity drags them back down
 *  past the enter threshold, swim mode turns back on, repeat — a visible
 *  bobbing loop, not the intended calm float. See WaterLabScene.ts's
 *  SWIM_ENTER_DEPTH_THRESHOLD/SWIM_EXIT_DEPTH_THRESHOLD for the paired
 *  values this must stay compatible with. Kept as shallow as that
 *  constraint allows (only 0.1 above the exit threshold) so the player's
 *  head/shoulders read clearly above the water surface while floating,
 *  matching OOT/SM64-style visible-swimmer readability rather than
 *  appearing to sink under the drawn surface. */
const SWIM_FLOAT_DEPTH = 0.55;

/** Position-error gain (rad/s) for the swim/dive vertical spring — see the
 *  VERTICAL_SPRING_DAMPING_MULTIPLIER comment below for why this alone
 *  isn't the damping rate. */
const SWIM_VERTICAL_EASE = 6;
const DIVE_TARGET_DEPTH = 3.0;   // WU below surface the player eases toward while diving
/** Position-error gain (rad/s) for diving — slower than surfacing. */
const DIVE_VERTICAL_EASE = 4;
/** Damping-rate multiplier applied on top of the position-error gain
 *  (SWIM_VERTICAL_EASE / DIVE_VERTICAL_EASE) when blending velocity.y
 *  toward its target each frame (see the swim/dive gravity override in
 *  update()). Modeling the vertical float as a spring-damper (stiffness K =
 *  gain, damping C = blend-rate), using the SAME value for both — as this
 *  code used to — gives a damping ratio of only 0.5 (underdamped: C =
 *  2*sqrt(K*0.5) instead of the critical C = 2*sqrt(K)), which oscillates
 *  indefinitely and never settles — the "bobbing in place" bug. Using
 *  4x the gain as the blend-rate makes C = 2*sqrt(K) exactly (critically
 *  damped, ζ=1); this constant adds a bit of margin (ζ≈1.1, slightly
 *  overdamped) so discrete per-frame stepping at low frame rates can't tip
 *  it back into oscillation. */
const VERTICAL_SPRING_DAMPING_MULTIPLIER = 4.5;

/** Frames after walking off a ledge where jump is still accepted. */
const COYOTE_TIME = 0.1;
/** Frames before landing where a pre-pressed jump fires on contact. */
const JUMP_BUFFER_TIME = 0.12;

// ── Dodge-roll ────────────────────────────────────────────────────────────

/** Dodge dash speed (units/s). */
const DODGE_SPEED = 16;
/** How long the dodge lasts (seconds). */
const DODGE_DURATION = 0.22;
/** Cooldown after the dodge ends before another can be triggered. */
const DODGE_COOLDOWN = 0.7;
/** i-frame window while dodging. */
const DODGE_IFRAME = 0.3;

// ── Player stats ──────────────────────────────────────────────────────────

const PLAYER_HP = 10;
const PLAYER_IFRAME = 0.5; // seconds of invulnerability after a hit

// ── Animation ─────────────────────────────────────────────────────────────

const TURN_SPEED_GROUND = 16; // rad/s
const TURN_SPEED_AIR = 8;
/** Maximum forward tilt at full run speed (radians). */
const MAX_LEAN = 0.15;
/** Head-bob amplitude (world units). */
const BOB_AMP = 0.05;
/** Bob cycles per world unit. */
const BOB_FREQ = 0.5;

// ── Isometric movement directions (normalized) ─────────────────────────────
// Camera looks from (+x,+y,+z) toward origin (45° azimuth).
// WASD are remapped to world-space diagonals to match screen axes.

export const ISO_FORWARD = new THREE.Vector3(-1, 0, -1).normalize();
export const ISO_BACKWARD = new THREE.Vector3(1, 0, 1).normalize();
export const ISO_LEFT = new THREE.Vector3(-1, 0, 1).normalize();
export const ISO_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

// ── Pure helpers (exported for unit tests) ─────────────────────────────────

/** Returns the desired horizontal direction from input as a normalized Vector3
 *  (y=0). Returns zero-vector when no keys are pressed. */
export function calculateMoveDirection(
  input: Pick<InputState, 'moveForward' | 'moveBackward' | 'moveLeft' | 'moveRight'>,
): THREE.Vector3 {
  const dir = new THREE.Vector3();
  if (input.moveForward) dir.add(ISO_FORWARD);
  if (input.moveBackward) dir.add(ISO_BACKWARD);
  if (input.moveLeft) dir.add(ISO_LEFT);
  if (input.moveRight) dir.add(ISO_RIGHT);
  if (dir.lengthSq() > 0) dir.normalize();
  return dir;
}

/** Returns the desired horizontal direction from forward/backward (and,
 *  while strafing, left/right) input, relative to the given facing angle
 *  (radians), as a normalized Vector3 (y=0). Used in WoW camera mode.
 *
 *  Movement always follows the player's own facing angle (updated by A/D
 *  turning and by right-drag camera-look sync), NOT the camera's free
 *  orbit yaw on its own.
 *
 *  A/D behave contextually, matching real WoW:
 *   - `strafing` false (no look-button held): A/D turn the character in
 *     place instead of moving, so moveLeft/moveRight are ignored here.
 *   - `strafing` true (look-button held, so the mouse already controls
 *     facing): A/D become strafe — sideways movement relative to facing,
 *     without touching facingAngle.
 *
 *  Yaw convention matches facingAngle: forward = (sin(yaw), 0, cos(yaw)),
 *  right = forward × up = (-cos(yaw), 0, sin(yaw)) — this matches the
 *  handedness already established by ISO_RIGHT/ISO_LEFT in isometric mode
 *  (ISO_RIGHT = cross(ISO_FORWARD, up)), not the mirrored cross(up, forward)
 *  used by an earlier, incorrect version of this function. */
export function calculateWoWMoveDirection(
  input: Pick<InputState, 'moveForward' | 'moveBackward' | 'moveLeft' | 'moveRight'>,
  facingAngle: number,
  strafing = false,
): THREE.Vector3 {
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3(Math.sin(facingAngle), 0, Math.cos(facingAngle));
  if (input.moveForward) dir.add(forward);
  if (input.moveBackward) dir.sub(forward);
  if (strafing) {
    const right = new THREE.Vector3(-Math.cos(facingAngle), 0, Math.sin(facingAngle));
    if (input.moveRight) dir.add(right);
    if (input.moveLeft) dir.sub(right);
  }
  if (dir.lengthSq() > 0) dir.normalize();
  return dir;
}


// ── Internal math helpers ──────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function lerpAngle(current: number, target: number, t: number): number {
  const raw = target - current;
  const delta = ((raw % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return current + delta * Math.min(1, t);
}

// ── PlayerController ────────────────────────────────────────────────────────

/** The player's physics body, kinematic controller, and visual mesh.
 *
 *  Add both `player.group` and `player.shadow` to the scene.
 *  Call `player.update(input, dt)` each frame after `physicsWorld.step(dt)`.
 */
export class PlayerController {
  /** Add to scene — the player's visual representation. */
  readonly group: THREE.Group;
  /** Add to scene — blob shadow that tracks the player and scales with height. */
  readonly shadow: THREE.Mesh;
  /** Health component — wire to HUD and combat system. */
  readonly health: HealthComponent;

  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;

  // Movement
  private readonly velocity = new THREE.Vector3();
  private facingAngle = 0;
  /** Current WoW-mode A/D turn angular velocity (rad/sec), eased toward its
   *  target each frame (see section 5a in update()) so turning ramps up and
   *  spins down smoothly instead of snapping to a fixed rate, matching
   *  isometric mode's eased facing feel. */
  private wowTurnVelocity = 0;
  private _swimming = false;
  /** World Y of the water surface the player is currently swimming under.
   *  Set by setSwimming(); used by update()'s gravity override each frame. */
  private _swimSurfaceY = 0;
  /** Lowest Y the dive/swim vertical spring is allowed to ease toward, set
   *  by setSwimming()'s optional floorY argument. The spring otherwise
   *  always targets a fixed depth below the water surface with no idea
   *  what's actually beneath the player's current X/Z — over any tier
   *  shallower than the deepest "abyss" footprint that's a lie, and lets
   *  the player swim laterally underneath that tier's floor into open
   *  space. Defaults to -Infinity (no clamp) for callers that don't pass
   *  a floor (e.g. any other swimmable area with a uniform depth). */
  private _swimMinY = -Infinity;

  private isGrounded = false;

  // Jump state
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private lastJumpInput = false;
  private jumpHeld = false;

  // Dodge-roll state
  private dodgeTimer = 0;
  private dodgeCooldown = 0;
  private dodgeDir = new THREE.Vector3();
  private lastDodgeInput = false;

  // Animation / feedback
  private bobTimer = 0;
  private flashTimer = 0;

  // ── Extended animation state machine (B4 / E-phase) ──────────────────────
  /** Jump phase for sequencing Jump_Start → Jump_Idle → Jump_Land. */
  private _jumpPhase: 'grounded' | 'rising' | 'falling' | 'landing' = 'grounded';
  /** Whether a one-shot cast animation is blocking the loop state. */
  private _castAnimActive = false;
  /** Pitch/roll tilt applied to charController.scene during levitate/fly (radians). */
  private _leanX = 0;
  private _leanZ = 0;
  /**
   * Levitate mode: active while levitate buff is running AND jump key held.
   * Different from flyMode (dev cheat) — uses mana and plays Jump_Idle.
   */
  levitateMode = false;
  /** Remaining seconds on the levitate buff (countdown from 30). */
  _levitateBuffTimer = 0;
  private _levitateTargetY = 0;
  /** Sinusoidal bob offset applied on top of target height. */
  private _levitateBobY  = 0;
  private readonly LEVITATE_HEIGHT = 1.8; // WU above ground when levitating
  /** Cloud-puff particle effect at foot level while levitating. */
  private readonly _levitateEffect = new LevitateEffect();
  /**
   * Fly spell mode — full 3D free flight, faster than levitate.
   * Space = ascend, Shift (run) = descend, WASD = 2× run speed horizontal.
   * Toggles on/off. Separate from flyMode (dev cheat).
   */
  flySpellMode = false;

  // Direct sub-mesh references (squash/stretch applied here, NOT on group)
  private readonly bodyMesh: THREE.Mesh;
  private readonly headMesh: THREE.Mesh;

  /** Local point light that brightens while swimming, so the player reads
   *  clearly against the water surface's flat-shaded (unlit) color from any
   *  camera angle — see-through water alone isn't enough contrast once the
   *  player is submerged, especially top-down/isometric views (OOT/SM64
   *  keep the swimmer readable underwater the same way: extra local light/
   *  rim brightness on the character, not just transparent water). Attached
   *  to the group so it moves with the player automatically; model-agnostic
   *  (works whether the capsule fallback or the princess rig is visible).
   *  Intensity is 0 (no cost, no visible effect) whenever not swimming. */
  private readonly _swimGlowLight = new THREE.PointLight(PALETTE.PLAYER_GLOW, 0, 4, 2);

  // DNA-based creature rig (replaces bodyMesh/headMesh visually when applied)
  private _creatureRig: CreatureRig | null = null;
  private _walkCtrl: ProceduralWalkController | null = null;
  /** Scratch vector for floor-level position passed to walk controller. */
  private readonly _floorPos = new THREE.Vector3();
  /** Asset-model character controller (mutually exclusive with _creatureRig). */
  private _charController: CharacterController | null = null;
  /** PC4: Princess-creator instance (mutually exclusive with _creatureRig/_charController). */
  private _princessInstance: import('@/princess-creator/factory').PrincessInstance | null = null;
  /** Tracks last-set animation state so we only call setState on change. */
  private _princessAnimState: string = 'idle';
  /** Counts down while a princess one-shot (attack/cast) is playing. Prevents
   *  base-state updates from clearing the one-shot before it finishes. */
  private _princessOneShotTimer = 0;

  /** Tracks the active visual rig root + its un-submerged base Y, so
   *  setSubmersion() can be called every frame without cumulative drift. */
  private _submersionRoot: THREE.Object3D | null = null;
  private _submersionBaseY = 0;

  /** Small warm/white point light parented to the active visual rig,
   *  visible only while submerged (intensity driven by depthFraction in
   *  setSubmersion()). Keeps the player legible against dark/busy water
   *  in any camera angle, independent of the water shader's own alpha.
   *  Recreated whenever the active rig changes; the outgoing light is
   *  explicitly disposed via `this._submergedGlow?.dispose()` in
   *  `setSubmersion()` before the new rig is assigned — not implicitly
   *  by the applyDNA/applyAssetModel/applyPrincess call. */
  private _submergedGlow: THREE.PointLight | null = null;

  /** Max intensity of `_submergedGlow` at full (1.0) depthFraction. */
  private static readonly SUBMERGED_GLOW_MAX_INTENSITY = 0.6;

  /** Amount (world units) the visual rig sinks below its resting foot
   *  position at full (1.0) submersion depth. */
  private static readonly SUBMERSION_MAX_OFFSET = (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) * 2 * 0.4;

  /**
   * Shift the active visual rig (creature / asset-model / princess) down by
   * `depthFraction` (0 = dry, 1 = fully submerged) to give a simple Mario
   * 64/Zelda-style "wading" look when standing in water. Does not touch
   * `this.group.position` (the authoritative physics/gameplay position) —
   * only the child visual root is offset, mirroring the existing
   * squash/stretch pattern applied to bodyMesh elsewhere in this class.
   * Safe to call every frame; recomputes from the stored base each time so
   * repeated calls never compound.
   */
  setSubmersion(depthFraction: number): void {
    const active: THREE.Object3D | null =
      this._creatureRig?.root ?? this._charController?.scene ?? this._princessInstance?.root ?? null;
    if (!active) return;

    // Rig swapped since last call (or first call) — capture its resting Y
    // and (re)create the submerged glow light as a child of the new rig.
    if (active !== this._submersionRoot) {
      this._submergedGlow?.dispose(); // free GPU shadow resources before replacing
      this._submersionRoot = active;
      this._submersionBaseY = active.position.y;
      this._submergedGlow = new THREE.PointLight(0xfff2e0, 0, 2.2, 2);
      active.add(this._submergedGlow);
    }

    active.position.y = this._submersionBaseY - depthFraction * PlayerController.SUBMERSION_MAX_OFFSET;
    if (this._submergedGlow) {
      this._submergedGlow.intensity =
        Math.max(0, Math.min(1, depthFraction)) * PlayerController.SUBMERGED_GLOW_MAX_INTENSITY;
    }
  }

  /**
   * Enables/disables swim movement mode. While swimming:
   *  - Gravity is overridden: velocity.y eases toward a float target
   *    (SWIM_FLOAT_DEPTH below the water surface) instead of falling.
   *  - Horizontal speed is capped to SWIM_SPEED regardless of run input.
   *  - Jump input is ignored (no jump impulse is applied).
   * Safe to call every frame (idempotent) — matches setSubmersion()'s idiom.
   *
   * @param isSwimming Whether the player should be in swim mode this frame.
   * @param waterSurfaceY World Y of the local water surface (only meaningful
   *   when isSwimming is true; ignored otherwise). Defaults to 0.
   * @param floorY Lowest Y the dive/swim vertical spring may ease toward —
   *   the actual floor height beneath the player's current X/Z, if the
   *   caller knows it (e.g. WaterLabScene's tiered basin). Defaults to
   *   -Infinity (no clamp), matching prior unclamped behavior.
   */
  setSwimming(isSwimming: boolean, waterSurfaceY = 0, floorY = -Infinity): void {
    this._swimming = isSwimming;
    this._swimSurfaceY = waterSurfaceY;
    this._swimMinY = floorY;
  }

  get isSwimming(): boolean {
    return this._swimming;
  }

  /** 0 when swimming at/near the surface, ramping to 1 as the player dives
   *  toward DIVE_TARGET_DEPTH. Used by the underwater screen effect; 0 when
   *  not swimming at all. */
  get underwaterDepthFraction(): number {
    if (!this._swimming) return 0;
    const depth = this._swimSurfaceY - this._pos.y;
    return Math.max(0, Math.min(1, depth / DIVE_TARGET_DEPTH));
  }

  /** Current facing angle in radians — read by CombatSystem for melee arc aim. */
  get facingAngleRad(): number { return this.facingAngle; }

  /** Directly set the player's facing angle (radians) and sync the visual
   *  rotation immediately. Used by WoWCameraController's left-drag handler
   *  to keep facing in sync with camera yaw. */
  setFacingAngle(angle: number): void {
    this.facingAngle = angle;
    this.group.rotation.y = angle;
  }

  /** 0 = dodge just used (full cooldown), 1 = fully ready. */
  get dodgeReadyFraction(): number {
    return this.dodgeCooldown <= 0 ? 1 : Math.max(0, 1 - this.dodgeCooldown / DODGE_COOLDOWN);
  }

  // ── Animation trigger API (called from main.ts / AbilitySystem) ───────────

  /** Play the melee attack one-shot animation. */
  triggerAttack(): void {
    if (this._charController) {
      const returnTo = this._resolveLoopState(0);
      this._charController.playOnce('attack', returnTo);
    }
    this._princessInstance?.play('attack_1');
    this._princessOneShotTimer = 0.55;
  }

  /** Play the spell-cast one-shot animation (Throw / Use_Item). */
  triggerCast(): void {
    if (this._charController) {
      const returnTo = this._resolveLoopState(0);
      this._charController.playOnce('cast', returnTo, () => { this._castAnimActive = false; });
      this._castAnimActive = true;
    }
    this._princessInstance?.play('cast_spell_1');
    this._princessOneShotTimer = 0.9;
  }

  /** Play the blink/teleport arrival animation (Spawn_Air). */
  triggerSpawnAir(): void {
    if (!this._charController) return;
    this._charController.playOnce('spawn_air', 'idle');
  }

  /** Play the appear-from-ground animation (Spawn_Ground). */
  triggerSpawnGround(): void {
    if (!this._charController) return;
    this._charController.playOnce('spawn_ground', 'idle');
  }

  /** Play the item pickup animation. */
  triggerPickup(): void {
    if (!this._charController) return;
    this._charController.playOnce('pickup', this._resolveLoopState(0));
  }

  /** Play the interact animation. */
  triggerInteract(): void {
    if (!this._charController) return;
    this._charController.playOnce('interact', this._resolveLoopState(0));
  }

  /** Force the death animation (one-shot, stays in final pose). */
  triggerDeath(): void {
    if (!this._charController) return;
    this._charController.playOnce('die', 'idle');
  }

  /**
   * Swap the player's visual for a DNA-based creature rig.
   * The existing capsule physics body is unchanged.
   * Called from main.ts after character creation.
   */
  applyDNA(dna: CreatureDNA): void {
    if (this._creatureRig) {
      this.group.remove(this._creatureRig.root);
      this._creatureRig.dispose();
    }
    this._walkCtrl = null;
    this.bodyMesh.visible = false;
    this.headMesh.visible = false;
    this._creatureRig = buildCreature(dna);
    this._creatureRig.root.scale.setScalar(dna.proportions.global);
    if (dna.archetype !== 'biped') {
      const wc = new ProceduralWalkController(this._creatureRig);
      if (wc.isApplicable) {
        const natFootY = wc.naturalFootY;
        this._creatureRig.root.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) - natFootY;
        this._walkCtrl = wc;
      } else {
        this._creatureRig.root.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS)
          - computeQuadNaturalFootY(this._creatureRig);
      }
    }
    this.group.add(this._creatureRig.root);
  }

  /**
   * Swap the player's visual for a loaded GLB/FBX asset model.
   * Physics capsule is unchanged. Returns a promise that resolves once loaded.
   */
  async applyAssetModel(def: CharModelDef): Promise<void> {
    // Remove previous asset model if any
    if (this._charController) {
      this.group.remove(this._charController.scene);
      this._charController.dispose();
      this._charController = null;
    }
    // Remove procedural rig if any
    if (this._creatureRig) {
      this.group.remove(this._creatureRig.root);
      this._creatureRig.dispose();
      this._creatureRig = null;
      this._walkCtrl = null;
    }
    this.bodyMesh.visible = false;
    this.headMesh.visible = false;

    const loaded = await loadCharModel(def);
    this._charController = new CharacterController(loaded);

    // Scale and position the model so feet sit at the capsule bottom
    const scene = this._charController.scene;
    // Most KayKit models are ~2 units tall — fit them to our capsule height
    const box = new THREE.Box3().setFromObject(scene);
    const modelH = box.max.y - box.min.y;
    const targetH = (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) * 2;
    const scale = modelH > 0.01 ? targetH / modelH : 1;
    scene.scale.setScalar(scale);
    // Recompute after scaling
    box.setFromObject(scene);
    scene.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) - box.min.y;

    this.group.add(scene);
  }

  /**
   * PC4: Swap the player's visual for a princess-creator model.
   * Calls `buildPrincess(dna, {targetHeight: 1.6})` from the factory,
   * attaches `instance.root` to the player group, stores the instance for
   * per-frame `update(t, dt)` calls.
   *
   * Safe to call multiple times — disposes the previous instance.
   */
  async applyPrincess(dna: import('@/princess-creator/types').PrincessDNA): Promise<void> {
    console.log('[PlayerController] applyPrincess called — dna:', dna ? `name=${dna.name} species=${dna.species}` : 'NULL');
    // Dispose previous visuals
    if (this._princessInstance) {
      this.group.remove(this._princessInstance.root);
      this._princessInstance.dispose();
      this._princessInstance = null;
    }
    if (this._charController) {
      this.group.remove(this._charController.scene);
      this._charController.dispose();
      this._charController = null;
    }
    if (this._creatureRig) {
      this.group.remove(this._creatureRig.root);
      this._creatureRig.dispose();
      this._creatureRig = null;
      this._walkCtrl = null;
    }
    this.bodyMesh.visible = false;
    this.headMesh.visible = false;

    // Dynamically import the factory to avoid pulling the whole princess-creator
    // bundle into the main game chunk unless this code path is actually exercised.
    const { buildPrincess } = await import('@/princess-creator/factory');
    this._princessInstance = buildPrincess(dna, { targetHeight: 1.6 });
    console.log('[PlayerController] buildPrincess complete — root children:', this._princessInstance.root.children.length);

    // Position feet at capsule bottom
    const box = new THREE.Box3().setFromObject(this._princessInstance.root);
    this._princessInstance.root.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) - box.min.y;
    console.log('[PlayerController] princess added to group ✓');

    this.group.add(this._princessInstance.root);

    // Tag every mesh on the player (including accessories/hat/orb) so the
    // OcclusionManager never fades the character's own geometry.
    this.group.traverse(obj => { obj.userData.isNotOccluder = true; });
  }

  /** PC4: Per-frame update for princess animations (call from game loop). */
  updatePrincess(elapsedSeconds: number, dt: number): void {
    if (!this._princessInstance) return;

    // Count down the one-shot guard; while positive, skip base-state changes
    // so attack/cast animations aren't interrupted by movement state updates.
    if (this._princessOneShotTimer > 0) {
      this._princessOneShotTimer = Math.max(0, this._princessOneShotTimer - dt);
    } else {
      // Bridge player movement state to princess animation states.
      // Only call setState when state changes — calling every frame resets the clip.
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      const nextState = this._swimming
        ? (hSpeed > 0.3 ? 'swim' : 'swim_idle')
        : !this.isGrounded
        ? 'jump_idle'
        : hSpeed > RUN_SPEED * 0.5 ? 'run'
        : hSpeed > 0.3             ? 'walk'
        :                            'idle';

      if (nextState !== this._princessAnimState) {
        this._princessAnimState = nextState;
        this._princessInstance.setState(nextState as import('@/princess-creator/anim/clips').AnimId);
      }
    }

    this._princessInstance.update(elapsedSeconds, dt);
  }

  /** Returns the current princess animation state string (for tests). */
  get princessAnimState(): string { return this._princessAnimState; }

  /** True when a princess model is currently active. */
  get hasPrincess(): boolean { return this._princessInstance !== null; }

  /** Instantly reposition both the physics body and the visual mesh.
   *  Use for room transitions only — not for gameplay movement. */
  teleport(pos: THREE.Vector3): void {
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    this.group.position.copy(pos);
    this._pos.copy(pos);
    // Reset vertical velocity so the player lands cleanly in the new room
    this.velocity.set(0, 0, 0);
  }

  private readonly _pos = new THREE.Vector3();

  constructor(physicsWorld: PhysicsWorld, startPosition: THREE.Vector3) {
    const { body, collider } = physicsWorld.createKinematicCapsule(
      startPosition,
      CAPSULE_HALF_HEIGHT,
      CAPSULE_RADIUS,
    );
    this.body = body;
    this.collider = collider;

    this.kcc = physicsWorld.createCharacterController(KCC_OFFSET);
    this.kcc.setSlideEnabled(true);
    this.kcc.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((30 * Math.PI) / 180);
    // Allow the KCC to step up tile edges (heightfield transitions and box edges).
    // maxHeight = 0.7 clears one full tile level (SH=0.55) plus margin.
    // minWidth  = 0.3 avoids stepping over narrow slivers / geometry artefacts.
    this.kcc.enableAutostep(0.7, 0.3, false);
    // Snap the character back down to the floor when descending steps/tiles.
    // Without this the player floats momentarily after walking off an elevated tile.
    // Distance 0.7 is just above one tile-level height (SH=0.55) so any single-step
    // descent is snapped in the same frame.
    this.kcc.enableSnapToGround(0.7);

    const built = PlayerController.buildMesh();
    this.group = built.group;
    this.bodyMesh = built.bodyMesh;
    this.headMesh = built.headMesh;
    this.group.position.copy(startPosition);

    // Attach cloud-puff levitate effect (hidden until buff is active)
    this.group.add(this._levitateEffect.group);

    // Swim glow light — parented near chest height, off by default (see field doc).
    this._swimGlowLight.position.set(0, CAPSULE_HALF_HEIGHT, 0);
    this.group.add(this._swimGlowLight);

    this.shadow = PlayerController.buildShadow();

    this.health = new HealthComponent(
      PLAYER_HP,
      PLAYER_IFRAME,
      () => this.onHit(),
    );
  }

  /** Dev fly mode — disables gravity and lets the player soar freely.
   *  Space = ascend, F (dodge key) = descend, WASD = 2.5× normal speed. */
  flyMode = false;

  /**
   * Creative mode speed multiplier applied on top of normal movement speed.
   * 1 = normal, 3 = fast, 10 = very fast, 50 = teleport-speed.
   * Only active while flyMode is true (creative movement).
   */
  creativeSpeedMultiplier = 1;

  /**
   * No-clip mode — disables collision detection so the player passes through walls.
   * Only meaningful when flyMode is true.
   */
  noClipMode = false;

  update(
    input: InputState,
    dt: number,
    cameraMode: 'isometric' | 'wow' = 'isometric',
  ): void {
    // ── 1. TIMERS ──────────────────────────────────────────────────────────
    this.health.tick(dt);
    this.coyoteTimer -= dt;
    this.jumpBufferTimer -= dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const wasGrounded = this.isGrounded;

    // ── Ability signals from AbilitySystem (via group.userData) ────────────
    // Blink teleport arrival
    if (this.group.userData['_triggerSpawnAir']) {
      this.group.userData['_triggerSpawnAir'] = false;
      this.triggerSpawnAir();
    }
    // Levitate buff: AbilitySystem sets _levitateBuffDuration on cast
    if (typeof this.group.userData['_levitateBuffDuration'] === 'number') {
      this._levitateBuffTimer = this.group.userData['_levitateBuffDuration'] as number;
      // Also handle old toggle path for backward-compat
      delete this.group.userData['_levitateBuffDuration'];
      delete this.group.userData['_levitateMode'];
    }
    // Tick buff countdown
    if (this._levitateBuffTimer > 0) {
      this._levitateBuffTimer = Math.max(0, this._levitateBuffTimer - dt);
    }
    // Levitate is ACTIVE while buff running AND jump key held
    const wasLevitating = this.levitateMode;
    this.levitateMode = this._levitateBuffTimer > 0 && input.jump;
    if (this.levitateMode && !wasLevitating) {
      // Just entered levitate — anchor target Y to current position + height
      this._levitateTargetY = this._pos.y + this.LEVITATE_HEIGHT;
    } else if (!this.levitateMode && wasLevitating) {
      // Just released — transition to falling
      this._jumpPhase = 'falling';
    }
    // Fly spell toggle (replaces old fly burst system)
    if (typeof this.group.userData['_flySpellMode'] === 'boolean') {
      this.flySpellMode = this.group.userData['_flySpellMode'] as boolean;
      delete this.group.userData['_flySpellMode'];
    }

    // ── LEVITATE MODE (buff active + space held — hover with bob + cloud puffs) ──
    if (this.levitateMode) {
      const LEVITATE_H = RUN_SPEED * 0.7;  // slower horizontal movement while floating
      const md = calculateMoveDirection(input);
      this.velocity.x = lerp(this.velocity.x, md.x * LEVITATE_H, ACCEL_GROUND * dt);
      this.velocity.z = lerp(this.velocity.z, md.z * LEVITATE_H, ACCEL_GROUND * dt);
      // Bob offset from the cloud effect (sinusoidal ±0.15 WU at ~1.5 Hz)
      this._levitateBobY = this._levitateEffect.update(dt, true);
      const cur = this.body.translation();
      const targetY = this._levitateTargetY + this._levitateBobY;
      const yDelta = targetY - cur.y;
      this.velocity.y = lerp(this.velocity.y, yDelta * 5, 8 * dt);

      this.body.setNextKinematicTranslation({
        x: cur.x + this.velocity.x * dt,
        y: cur.y + this.velocity.y * dt,
        z: cur.z + this.velocity.z * dt,
      });
      rapierToThreeInto(this.body.translation(), this._pos);
      this.group.position.copy(this._pos);

      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeed > 0.3) {
        this.facingAngle = lerpAngle(
          this.facingAngle,
          Math.atan2(this.velocity.x, this.velocity.z),
          TURN_SPEED_GROUND * dt,
        );
        this.group.rotation.y = this.facingAngle;
      }
      // Fall through to animation section (skips physics below)
      this.isGrounded = false;
      // (animation + visual section runs below)
      const hSpeedLev = hSpeed;
      { // scoped to run visual/animation updates
        const speedFactor = Math.min(hSpeedLev / RUN_SPEED, 1);
        this.bodyMesh.rotation.x = lerp(this.bodyMesh.rotation.x, -speedFactor * 0.2, 0.12);
        const headMat = this.headMesh.material as THREE.MeshLambertMaterial;
        headMat.emissiveIntensity = lerp(headMat.emissiveIntensity, 0.7, 0.05);
        const bodyMat = this.bodyMesh.material as THREE.MeshLambertMaterial;
        bodyMat.color.setHex(PALETTE.PLAYER_BODY);
        this.group.visible = true;
        this.bodyMesh.scale.x = lerp(this.bodyMesh.scale.x, 1, 12 * dt);
        this.bodyMesh.scale.y = lerp(this.bodyMesh.scale.y, 1, 12 * dt);
        this.bodyMesh.scale.z = lerp(this.bodyMesh.scale.z, 1, 12 * dt);
        if (this._charController) {
          this._charController.setState('levitate');
          const targetLeanX = -Math.min(hSpeedLev / RUN_SPEED, 1) * 0.28;
          const strafeSign = Math.cos(this.facingAngle) * this.velocity.x - Math.sin(this.facingAngle) * this.velocity.z;
          const targetLeanZ = -Math.min(Math.abs(strafeSign) / RUN_SPEED, 1) * 0.18 * Math.sign(strafeSign);
          this._leanX = lerp(this._leanX, targetLeanX, 8 * dt);
          this._leanZ = lerp(this._leanZ, targetLeanZ, 8 * dt);
          this._charController.scene.rotation.x = this._leanX;
          this._charController.scene.rotation.z = this._leanZ;
          this._charController.update(dt);
        }
        const height = Math.max(0, this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS));
        const floorY = this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
        this.shadow.position.set(this._pos.x, floorY - this.LEVITATE_HEIGHT * 0.9 + 0.03, this._pos.z);
        this.shadow.scale.setScalar(Math.max(0.05, 0.6 - height * 0.04));
        (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.2;
      }
      return;
    }

    // Buff active but space not held — fade out cloud puffs, allow normal movement
    if (this._levitateBuffTimer > 0) {
      this._levitateEffect.update(dt, false);
    }

    // ── FLY SPELL MODE (gameplay — full 3D free flight, toggleable) ──────────
    if (this.flySpellMode) {
      const FLY_H = RUN_SPEED * 2.2;  // fast horizontal movement
      const FLY_V = RUN_SPEED * 1.5;  // vertical speed
      const md = calculateMoveDirection(input);
      this.velocity.x = lerp(this.velocity.x, md.x * FLY_H, ACCEL_GROUND * dt);
      this.velocity.z = lerp(this.velocity.z, md.z * FLY_H, ACCEL_GROUND * dt);
      // Space = ascend, Shift (run key) = descend
      if (input.jump)      this.velocity.y = lerp(this.velocity.y, FLY_V, 8 * dt);
      else if (input.run)  this.velocity.y = lerp(this.velocity.y, -FLY_V, 8 * dt);
      else                 this.velocity.y = lerp(this.velocity.y, 0, 6 * dt);

      const cur = this.body.translation();
      this.body.setNextKinematicTranslation({
        x: cur.x + this.velocity.x * dt,
        y: cur.y + this.velocity.y * dt,
        z: cur.z + this.velocity.z * dt,
      });
      rapierToThreeInto(this.body.translation(), this._pos);
      this.group.position.copy(this._pos);

      const hSpeedFly = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeedFly > 0.4) {
        this.facingAngle = lerpAngle(
          this.facingAngle,
          Math.atan2(this.velocity.x, this.velocity.z),
          TURN_SPEED_GROUND * dt,
        );
        this.group.rotation.y = this.facingAngle;
      }
      this.isGrounded = false;

      // Animation + tilt: aggressive forward lean based on speed
      const speedT = Math.min(hSpeedFly / (RUN_SPEED * 2.2), 1);
      const flyLeanX = -speedT * 0.62;  // up to ~35° forward
      const strafeSignFly = Math.cos(this.facingAngle) * this.velocity.x - Math.sin(this.facingAngle) * this.velocity.z;
      const flyLeanZ = -Math.min(Math.abs(strafeSignFly) / FLY_H, 1) * 0.22 * Math.sign(strafeSignFly);
      this._leanX = lerp(this._leanX, flyLeanX, 10 * dt);
      this._leanZ = lerp(this._leanZ, flyLeanZ, 10 * dt);

      if (this._charController) {
        this._charController.setState('fly');
        this._charController.scene.rotation.x = this._leanX;
        this._charController.scene.rotation.z = this._leanZ;
        this._charController.update(dt);
      }

      const floorY = this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
      this.shadow.position.set(this._pos.x, floorY - 1.5, this._pos.z);
      this.shadow.scale.setScalar(0.4);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.12;
      return;
    }

    // ── FLY MODE (dev cheat / creative mode) ─────────────────────────────
    if (this.flyMode) {
      const FLY_H = RUN_SPEED * 2.5 * this.creativeSpeedMultiplier;
      const FLY_V = RUN_SPEED * 2.0 * Math.max(1, this.creativeSpeedMultiplier * 0.6);
      const md = calculateMoveDirection(input);
      this.velocity.x = lerp(this.velocity.x, md.x * FLY_H, ACCEL_GROUND * dt);
      this.velocity.z = lerp(this.velocity.z, md.z * FLY_H, ACCEL_GROUND * dt);
      // Space = ascend, F/dodge key = descend, neither = gently level off
      if (input.jump)       this.velocity.y = FLY_V;
      else if (input.dodge) this.velocity.y = -FLY_V;
      else                  this.velocity.y = lerp(this.velocity.y, 0, 8 * dt);

      const cur = this.body.translation();
      // No-clip: position moves freely; with clip: normal kinematic translation
      this.body.setNextKinematicTranslation({
        x: cur.x + this.velocity.x * dt,
        y: cur.y + this.velocity.y * dt,
        z: cur.z + this.velocity.z * dt,
      });
      rapierToThreeInto(this.body.translation(), this._pos);
      this.group.position.copy(this._pos);

      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (hSpeed > 0.4) {
        this.facingAngle = lerpAngle(
          this.facingAngle,
          Math.atan2(this.velocity.x, this.velocity.z),
          TURN_SPEED_GROUND * dt,
        );
        this.group.rotation.y = this.facingAngle;
      }
      return; // skip normal physics
    }

    // ── 1b. DODGE-ROLL ─────────────────────────────────────────────────────
    const dodgeJustPressed = input.dodge && !this.lastDodgeInput;
    this.lastDodgeInput = input.dodge;

    if (dodgeJustPressed && this.dodgeCooldown <= 0 && this.dodgeTimer <= 0) {
      // Direction: current facing, or movement direction if any
      const moveDir = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      if (moveDir.lengthSq() < 0.01) {
        moveDir.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle));
      } else {
        moveDir.normalize();
      }
      this.dodgeDir.copy(moveDir);
      this.dodgeTimer = DODGE_DURATION;
      this.dodgeCooldown = DODGE_COOLDOWN;
      this.flashTimer = DODGE_IFRAME;
      // G3: Squash on launch — Y compress, Z stretch in dodge direction
      this._applyModelScale(0.85, 0.65, 1.35);
    }

    if (this.dodgeTimer > 0) {
      this.dodgeTimer -= dt;
      const rollFrac = this.dodgeTimer / DODGE_DURATION; // 1 at start → 0 at end
      if (rollFrac > 0.15) {
        // Mid-roll: maintain stretch
        this._applyModelScale(0.88, 0.80, 1.28);
      } else {
        // End of roll: land-bounce squash
        this._applyModelScale(1.15, 0.72, 1.15);
      }
      // Override horizontal velocity with dodge
      this.velocity.x = this.dodgeDir.x * DODGE_SPEED;
      this.velocity.z = this.dodgeDir.z * DODGE_SPEED;
    }

    // ── 2. JUMP INPUT — rising-edge detect, buffer window ─────────────────
    // Suppress jump when levitate buff is active (space = levitate, not jump)
    const jumpJustPressed = input.jump && !this.lastJumpInput && this._levitateBuffTimer <= 0;
    this.lastJumpInput = input.jump;
    if (jumpJustPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;
    if (!input.jump) this.jumpHeld = false;

    // ── 3. EXECUTE JUMP ────────────────────────────────────────────────────
    const canJump = wasGrounded || this.coyoteTimer > 0;
    let justJumped = false;

    if (this.jumpBufferTimer > 0 && canJump && !this._swimming) {
      this.velocity.y = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpHeld = true;
      justJumped = true;
      this.squashStretchJump();
    }

    // ── 4. GRAVITY ─────────────────────────────────────────────────────────
    if (this._swimming) {
      // Buoyant float / dive: ease velocity.y so _pos.y approaches a target
      // depth below the water surface, instead of falling under normal
      // gravity. Holding jump (input.jump) is repurposed as "dive" — jump's
      // on-land execution branch already excludes swim mode (see the
      // `!this._swimming` guard above), so this is conflict-free.
      const rawTargetY = input.jump
        ? this._swimSurfaceY - DIVE_TARGET_DEPTH   // holding jump: ease down toward dive depth
        : this._swimSurfaceY - SWIM_FLOAT_DEPTH;   // released: ease up toward surface float depth
      // Never ease toward a target below the actual floor beneath the
      // player's current X/Z (see _swimMinY doc comment) — otherwise
      // diving over a deep spot then swimming sideways over a shallower
      // one keeps demanding downward velocity that fights (and can defeat)
      // the KCC's collision response every frame instead of just resting
      // on that shallower floor like solid ground normally would.
      const targetY = Math.max(rawTargetY, this._swimMinY);
      const gain = input.jump ? DIVE_VERTICAL_EASE : SWIM_VERTICAL_EASE;
      const yDelta = targetY - this._pos.y;
      const targetVel = yDelta * gain;
      const dampingRate = gain * VERTICAL_SPRING_DAMPING_MULTIPLIER;
      this.velocity.y = lerp(this.velocity.y, targetVel, dampingRate * dt);
    } else if (!wasGrounded || justJumped) {
      let g: number;
      if (this.velocity.y > 0) {
        g = this.jumpHeld ? GRAVITY_RISE : GRAVITY_RELEASE;
      } else {
        g = GRAVITY_FALL;
      }
      this.velocity.y -= g * dt;
      this.velocity.y = Math.max(this.velocity.y, -MAX_FALL_SPEED);
    } else {
      this.velocity.y = GROUND_PUSH;
    }

    // ── 5a. WOW-MODE TURNING (A/D rotate character in place, not strafe) ───
    // Must run before movement direction is computed below, so W/S move
    // along the facing angle this same frame's A/D turn just produced
    // (not last frame's stale facing).
    // While left-drag is held, the mouse is already continuously syncing
    // facing to the camera (see WoWCameraController's onTurnPlayer), so
    // A/D become strafe instead — matching real WoW, where turning is
    // handled by the mouse during that drag and the side keys move the
    // character sideways relative to its facing. Right-drag ("look-only")
    // doesn't touch facing, so A/D there still turns as normal.
    //
    // Turn angular velocity is eased toward its target (WOW_TURN_RATE or 0)
    // each frame rather than snapping instantly, so starting/releasing a
    // turn ramps up/spins down smoothly — matching isometric mode's eased
    // facing feel instead of a stiff constant-rate rotation.
    if (cameraMode === 'wow') {
      const WOW_TURN_RATE = 2.4; // radians/sec, target angular velocity at full turn
      const WOW_TURN_EASE = 10;  // ease factor — higher = snappier ramp up/down
      let targetTurnVel = 0;
      if (!input.turnDragHeld) {
        if (input.moveLeft) targetTurnVel -= WOW_TURN_RATE;
        if (input.moveRight) targetTurnVel += WOW_TURN_RATE;
      }
      this.wowTurnVelocity = lerp(this.wowTurnVelocity, targetTurnVel, WOW_TURN_EASE * dt);
      if (!input.turnDragHeld) {
        this.facingAngle += this.wowTurnVelocity * dt;
        this.group.rotation.y = this.facingAngle;
      }
    } else {
      this.wowTurnVelocity = 0;
    }

    // ── 5. HORIZONTAL MOVEMENT ─────────────────────────────────────────────
    // Skip normal acceleration when dodge is active (dodge overrides velocity)
    if (this.dodgeTimer <= 0) {
      const topSpeed = this._swimming ? SWIM_SPEED : (input.run ? RUN_SPEED : WALK_SPEED);
      const moveDir = cameraMode === 'wow'
        ? calculateWoWMoveDirection(input, this.facingAngle, input.turnDragHeld)
        : calculateMoveDirection(input);
      const isMoving = moveDir.lengthSq() > 0.01;
      const accel = wasGrounded ? ACCEL_GROUND : ACCEL_AIR;
      const decel = wasGrounded ? DECEL_GROUND : DECEL_AIR;

      if (isMoving) {
        this.velocity.x = lerp(this.velocity.x, moveDir.x * topSpeed, accel * dt);
        this.velocity.z = lerp(this.velocity.z, moveDir.z * topSpeed, accel * dt);
      } else {
        this.velocity.x = lerp(this.velocity.x, 0, decel * dt);
        this.velocity.z = lerp(this.velocity.z, 0, decel * dt);
      }
    }

    // ── 6. KCC ─────────────────────────────────────────────────────────────
    const desired = {
      x: this.velocity.x * dt,
      y: this.velocity.y * dt,
      z: this.velocity.z * dt,
    };

    this.kcc.computeColliderMovement(this.collider, desired);
    this.isGrounded = this.kcc.computedGrounded() && this.velocity.y <= 0.1;
    const actual = this.kcc.computedMovement();

    if (this.velocity.y > 0 && actual.y < desired.y * 0.5) {
      this.velocity.y = 0; // hit ceiling
    }

    const cur = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: cur.x + actual.x,
      y: cur.y + actual.y,
      z: cur.z + actual.z,
    });

    // ── 7. POST-STEP STATE ─────────────────────────────────────────────────
    if (wasGrounded && !this.isGrounded && !justJumped) {
      this.coyoteTimer = COYOTE_TIME; // walked off ledge
    }
    if (!wasGrounded && this.isGrounded) {
      this.squashStretchLand(this.velocity.y);
      this.velocity.y = GROUND_PUSH;
    }

    // ── 8. SYNC POSITION ───────────────────────────────────────────────────
    rapierToThreeInto(this.body.translation(), this._pos);
    this.group.position.copy(this._pos);

    // ── 9. VISUALS ─────────────────────────────────────────────────────────
    const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);

    // Rotate group to face direction of travel — isometric mode only.
    // WoW mode's facing is driven explicitly by A/D turning (5b, above) and
    // by left-drag camera sync (setFacingAngle()), not by movement direction.
    if (cameraMode !== 'wow' && hSpeed > 0.4) {
      const targetAngle = Math.atan2(this.velocity.x, this.velocity.z);
      const turnRate = wasGrounded ? TURN_SPEED_GROUND : TURN_SPEED_AIR;
      this.facingAngle = lerpAngle(this.facingAngle, targetAngle, turnRate * dt);
      this.group.rotation.y = this.facingAngle;
    }

    // Forward lean on bodyMesh (not group — keeps shadow/head unaffected)
    const speedFactor = Math.min(hSpeed / RUN_SPEED, 1);
    this.bodyMesh.rotation.x = lerp(this.bodyMesh.rotation.x, -speedFactor * MAX_LEAN, 0.12);

    // Head bob while running on ground
    const headBaseY = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25;
    if (this.isGrounded && hSpeed > 0.3) {
      this.bobTimer += hSpeed * dt * BOB_FREQ;
      const bob = Math.abs(Math.sin(this.bobTimer * Math.PI * 2)) * BOB_AMP * speedFactor;
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY + bob, 0.3);
    } else {
      this.headMesh.position.y = lerp(this.headMesh.position.y, headBaseY, 0.2);
    }

    // Head glow brighter when sprinting
    const headMat = this.headMesh.material as THREE.MeshLambertMaterial;
    const glowTarget = input.run && hSpeed > 1 ? 1.2 : 0.4;
    headMat.emissiveIntensity = lerp(headMat.emissiveIntensity, glowTarget, 0.08);

    // Swim visibility glow — see _swimGlowLight's field doc.
    const swimGlowTarget = this._swimming ? 1.4 : 0;
    this._swimGlowLight.intensity = lerp(this._swimGlowLight.intensity, swimGlowTarget, 0.1);

    // i-frame / hit flash: blink the body between white and normal colour
    const bodyMat = this.bodyMesh.material as THREE.MeshLambertMaterial;
    if (this.flashTimer > 0) {
      const blink = Math.sin(this.flashTimer * 40) > 0;
      bodyMat.color.setHex(blink ? 0xffffff : PALETTE.PLAYER_BODY);
      this.group.visible = this.dodgeTimer <= 0 || blink; // flicker during dodge
    } else {
      bodyMat.color.setHex(PALETTE.PLAYER_BODY);
      this.group.visible = true;
    }

    // Squash/stretch scale decays back to (1,1,1) on bodyMesh and char model
    this.bodyMesh.scale.x = lerp(this.bodyMesh.scale.x, 1, 12 * dt);
    this.bodyMesh.scale.y = lerp(this.bodyMesh.scale.y, 1, 12 * dt);
    this.bodyMesh.scale.z = lerp(this.bodyMesh.scale.z, 1, 12 * dt);
    if (this._charController) {
      this._charController.scene.scale.x = lerp(this._charController.scene.scale.x, 1, 12 * dt);
      this._charController.scene.scale.y = lerp(this._charController.scene.scale.y, 1, 12 * dt);
      this._charController.scene.scale.z = lerp(this._charController.scene.scale.z, 1, 12 * dt);
    }

    // DNA rig animation (runs alongside hidden bodyMesh/headMesh logic)
    if (this._creatureRig) {
      const t = performance.now() * 0.001;
      if (this._walkCtrl) {
        // Pass rig root world position — ProceduralWalk uses root-local foot offsets.
        this._creatureRig.root.getWorldPosition(this._floorPos);
        this._walkCtrl.update(dt, this._floorPos, this.facingAngle);
      } else {
        // Serpent trail: run BEFORE animateCreature so the sway overlay (+=) layers on top.
        if (this._creatureRig.snakeLoco) {
          this._creatureRig.snakeLoco.update(
            this._creatureRig.root,
            this._creatureRig.bones.segments ?? [],
          );
        }
        if (this.flashTimer > 0) {
          animateCreature(this._creatureRig, { state: 'hit', time: t, timeSinceHit: PLAYER_IFRAME - this.flashTimer });
        } else if (hSpeed > RUN_SPEED * 0.5) {
          animateCreature(this._creatureRig, { state: 'run',  time: t, velocity: Math.min(hSpeed / RUN_SPEED, 1) });
        } else if (hSpeed > 0.3) {
          animateCreature(this._creatureRig, { state: 'walk', time: t, velocity: Math.min(hSpeed / RUN_SPEED, 1) });
        } else {
          animateCreature(this._creatureRig, { state: 'idle', time: t });
        }
      }
    }

    // Asset model animation — full state machine with jump sequence, tilt, death
    if (this._charController) {
      // ── Jump sequence ─────────────────────────────────────────────────────
      const justLanded  = !wasGrounded && this.isGrounded;
      const justLeftGround = wasGrounded && !this.isGrounded;

      if (justLanded && this._jumpPhase !== 'landing' && this._jumpPhase !== 'grounded') {
        this._jumpPhase = 'landing';
        this._charController.playOnce('jump_land', this._resolveLoopState(hSpeed), () => {
          this._jumpPhase = 'grounded';
        });
      } else if (justLeftGround && !this._charController.isPlayingOneShot) {
        // Only trigger jump_start if we went airborne from a jump (not a fall-off edge)
        if (this.velocity.y > 0.5) {
          this._jumpPhase = 'rising';
          this._charController.playOnce('jump_start', 'jump_air', () => {
            // After jump_start, settle into jump_air loop
            this._charController?.setState('jump_air');
          });
        } else {
          this._jumpPhase = 'falling';
          this._charController.setState('jump_air');
        }
      }

      // Peak → falling transition
      if (this._jumpPhase === 'rising' && this.velocity.y < 0) {
        this._jumpPhase = 'falling';
      }

      // ── Levitate visual ───────────────────────────────────────────────────
      if (this.levitateMode) {
        this._charController.setState('levitate');
      } else if (!this.isGrounded && this._jumpPhase === 'grounded') {
        // Fell off a ledge without jumping — play air idle
        this._jumpPhase = 'falling';
        this._charController.setState('jump_air');
      }

      // ── Ground loop state ─────────────────────────────────────────────────
      if (this.isGrounded && this._jumpPhase === 'grounded' && !this._charController.isPlayingOneShot) {
        const nextLoop = this._resolveLoopState(hSpeed);
        this._charController.setState(nextLoop);
      }

      // ── Hit flash ─────────────────────────────────────────────────────────
      if (this.flashTimer > 0.3 && !this._charController.isPlayingOneShot) {
        this._charController.playOnce('hit', this._resolveLoopState(hSpeed));
      }

      // ── Tilt during levitate ─────────────────────────────────────────────
      // (Fly spell has its own tilt block inside flySpellMode early-return above)
      const targetLeanX = this.levitateMode
        ? -Math.min(hSpeed / RUN_SPEED, 1) * 0.30
        : this.flyMode
          ? -Math.min(hSpeed / RUN_SPEED, 1) * 0.55
          : 0;
      const strafeSign = Math.cos(this.facingAngle) * this.velocity.x
                       - Math.sin(this.facingAngle) * this.velocity.z;
      const targetLeanZ = (this.levitateMode || this.flyMode)
        ? -Math.min(Math.abs(strafeSign) / RUN_SPEED, 1) * 0.18 * Math.sign(strafeSign)
        : 0;

      this._leanX = lerp(this._leanX, targetLeanX, 8 * dt);
      this._leanZ = lerp(this._leanZ, targetLeanZ, 8 * dt);
      this._charController.scene.rotation.x = this._leanX;
      this._charController.scene.rotation.z = this._leanZ;

      this._charController.update(dt);
    }

    // Shadow blob tracks position, shrinks with height
    const height = Math.max(0, this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS));
    // Y follows the player's actual floor height so the shadow stays on elevated tiles.
    const floorY = this._pos.y - (CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);
    this.shadow.position.set(this._pos.x, floorY + 0.03, this._pos.z);
    this.shadow.scale.setScalar(Math.max(0.05, 1 - height * 0.09));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0,
      (1 - height * 0.11) * 0.5,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resolve the appropriate looping animation state for the current speed.
   * Used to set the return-to state after a one-shot.
   */
  private _resolveLoopState(hSpeed: number): import('@/characters/CharacterController').CharAnimLoopState {
    if (this.levitateMode) return 'levitate';
    if (this.flySpellMode) return 'fly';
    if (this.flyMode)      return 'fly';
    if (!this.isGrounded)  return 'jump_air';
    return hSpeed > RUN_SPEED * 0.5 ? 'run' : hSpeed > 0.3 ? 'walk' : 'idle';
  }

  /** Flash and squash when the player is hit. */
  private onHit(): void {
    this.flashTimer = PLAYER_IFRAME;
    this.bodyMesh.scale.set(1.3, 0.7, 1.3);
    // Trigger hit one-shot on character model
    if (this._charController && !this._charController.isPlayingOneShot) {
      const hSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      this._charController.playOnce('hit', this._resolveLoopState(hSpeed));
    }
  }

  /** Jump take-off: vertical stretch on bodyMesh only. */
  private squashStretchJump(): void {
    this._applyModelScale(0.75, 1.35, 0.75);
  }

  /** Landing splat proportional to fall speed, on bodyMesh only. */
  private squashStretchLand(fallVelocity: number): void {
    const t = Math.min(Math.abs(fallVelocity) / MAX_FALL_SPEED, 1);
    const sy = Math.max(0.6, 1 - t * 0.4);
    const sxz = 1 + t * 0.5;
    this._applyModelScale(sxz, sy, sxz);
  }

  /** Apply scale to whichever visual is active: charController scene or fallback bodyMesh. */
  private _applyModelScale(sx: number, sy: number, sz: number): void {
    if (this._charController) {
      this._charController.scene.scale.set(sx, sy, sz);
    }
    this.bodyMesh.scale.set(sx, sy, sz);
  }

  // ── Static builders ────────────────────────────────────────────────────────

  private static buildMesh(): { group: THREE.Group; bodyMesh: THREE.Mesh; headMesh: THREE.Mesh } {
    const group = new THREE.Group();

    const bodyGeo = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 16);
    const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.PLAYER_BODY });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;

    const headGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const headMat = new THREE.MeshLambertMaterial({
      color: PALETTE.PLAYER_BODY,
      emissive: new THREE.Color(PALETTE.PLAYER_GLOW),
      emissiveIntensity: 0.4,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.25;
    headMesh.castShadow = true;

    group.add(bodyMesh, headMesh);
    return { group, bodyMesh, headMesh };
  }

  private static buildShadow(): THREE.Mesh {
    const geo = new THREE.CircleGeometry(0.45, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 1;
    return mesh;
  }
}

