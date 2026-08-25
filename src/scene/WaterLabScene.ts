/**
 * WaterLabScene — a minimal, cheap-to-load dev-sandbox room for iterating
 * on the water shader and testing swim movement in isolation from the
 * full overworld scene (which is expensive to boot and has water tiles
 * scattered/hard to reach reliably).
 *
 * Layout: a single flat 24×24 room with a stepped 3-tier basin cut into
 * its center (dry bank → shallow shelf → deep floor, see
 * src/levels/WaterLab.ts), covered by one animated water quad at the
 * bank's height. Walking from the bank onto the shallow shelf triggers
 * the existing shallow "wading" visual (setSubmersion); walking down onto
 * the deep floor crosses SWIM_ENTER_DEPTH_THRESHOLD and triggers full swim
 * mode (setSwimming) — buoyant float, capped speed, no jump.
 *
 * No settlements/NPCs/trees/skybox/fog — kept as cheap as the existing
 * sandbox_arena interior so it loads and runs at full FPS for testing.
 */
import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { SWIM_ENTER_DEPTH_THRESHOLD, SWIM_EXIT_DEPTH_THRESHOLD } from '@/player/PlayerController';
import type { ParticleSystem, EmitterHandle } from '@/rendering/ParticleSystem';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  buildWaterLabTiers,
  WATER_LAB_ROOM_SIZE,
  WATER_LAB_SURFACE_Y,
  type WaterLabTier,
} from '@/levels/WaterLab';
import {
  createReflectiveWater,
  createFlowRefractiveWater,
  type WaterVariantKind,
} from '@/world/WaterVariants';
import { createWaterMaterial } from '@/world/WaterMaterial';
import type { Water } from 'three/examples/jsm/objects/Water.js';

/** SWIM_ENTER_DEPTH_THRESHOLD / SWIM_EXIT_DEPTH_THRESHOLD (hysteresis band
 *  for the wade↔swim transition) now live in `PlayerController.ts` — see
 *  that file's doc comments for the full rationale — imported above so
 *  `OverworldScene.ts` can share the exact same pair of thresholds. */
/** Fraction of underwaterDepthFraction (0=surface, 1=full dive depth) below
 *  which the player counts as "near the surface" for the wake-trail VFX.
 *  0.3 of DIVE_TARGET_DEPTH (3.0 WU) is 0.9 WU, matching
 *  SWIM_ENTER_DEPTH_THRESHOLD's own depth — so the wake persists through
 *  the normal SWIM_FLOAT_DEPTH (0.55) float-idle bobbing but cuts off once
 *  she's genuinely diving down, not just swimming at the surface. */
const WAKE_NEAR_SURFACE_DEPTH_FRACTION = 0.3;

/** Minimum horizontal speed (world units/second) — measured directly from
 *  frame-to-frame player XZ displacement, since PlayerController doesn't
 *  expose its internal velocity — to start the wake VFX (treading water in
 *  place shouldn't leave a trail). Split into separate start/stop thresholds
 *  to prevent emitter churn when speed oscillates near the boundary. */
const WAKE_START_SPEED = 0.3;
/** Lower threshold for stopping the wake once active — creating a hysteresis
 *  band between 0.2 and 0.3 so gentle oscillations don't repeatedly stop and
 *  recreate the emitter before its first particle even emits. */
const WAKE_STOP_SPEED = 0.2;

const TIER_COLORS: Record<WaterLabTier['name'], number> = {
  bank:    0x6b5a3c,
  shallow: 0x4a6b4a,
  deep:    0x2f4a52,
  abyss:   0x15242b,
};

export class WaterLabScene {
  private readonly _tiers = buildWaterLabTiers();
  private readonly _tierMeshes: THREE.Mesh[] = [];
  private readonly _tierBodies: RAPIER.RigidBody[] = [];
  private _waterVariant: WaterVariantKind = 'stylized';
  private _waterObject: THREE.Object3D | null = null; // Water | Water2 instance
  private _ambientLight: THREE.AmbientLight | null = null;
  private _dirLight: THREE.DirectionalLight | null = null;
  private _entered = false;

  /** Previous frame's depthBelowSurface, used to detect entry/exit crossings
   *  for splash VFX. -Infinity so the very first frame never counts as a
   *  crossing (nothing to compare against yet). */
  private _prevDepthBelowSurface = -Infinity;

  /** Hysteresis memory for the swim/wade state machine (see
   *  SWIM_ENTER_DEPTH_THRESHOLD/SWIM_EXIT_DEPTH_THRESHOLD below) — whether
   *  the player is currently considered "swimming" persists across frames
   *  instead of being recomputed from a single depth threshold every frame,
   *  so it can't flicker at the boundary. */
  private _playerIsSwimming = false;

  /** Continuous wake-trail emitter handle while swimming+moving near the
   *  surface — see _updateWake(). null when no wake is currently active
   *  (or before the room has ever been entered). A stopped EmitterHandle
   *  can never be restarted (see ParticleSystem.EmitterHandle.stop()'s
   *  doc), so re-activating the wake always creates a fresh handle. */
  private _wakeEmitter: EmitterHandle | null = null;

  /** Previous frame's player X/Z, used by _updateWake() to measure
   *  horizontal speed directly. null when tracking hasn't started yet
   *  (before enter() or after exit(), or immediately after a teleport-sized
   *  single-frame jump) — the first tracked frame after a null simply
   *  records the position and treats speed as zero for that frame. */
  private _prevWakePos: { x: number; z: number } | null = null;

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _physics: PhysicsWorld,
    private readonly _player: PlayerController,
    private readonly _particles: ParticleSystem,
  ) {}

  /** (Re)builds the water surface object for the current `_waterVariant`,
   *  disposing whichever one was there before. Sized to the `shallow` tier's
   *  footprint (deep/abyss tiers nest inside it, so this fully covers all
   *  of them). */
  private _buildWater(): void {
    if (this._waterObject) {
      this._scene.remove(this._waterObject);
      const obj = this._waterObject as unknown as {
        geometry: THREE.BufferGeometry;
        material: THREE.ShaderMaterial;
      };
      // Water.js/Water2.js keep their WebGLRenderTarget(s) fully closure-private
      // with no exposed reference or dispose() method (verified by reading
      // three/examples/jsm/objects/Water.js and Water2.js) — there is no
      // supported way to free those render targets without patching the
      // vendored module. Dispose what IS reachable (their output textures) as
      // a partial mitigation; the render-target framebuffers themselves leak
      // on every reflective/flow-refractive -> other variant switch. Low
      // impact: only reachable via manual Dev Sandbox toggling, never in the
      // shipping game (default variant is 'stylized').
      const uniforms = obj.material.uniforms as Record<string, { value?: THREE.Texture } | undefined> | undefined;
      uniforms?.mirrorSampler?.value?.dispose();
      uniforms?.tReflectionMap?.value?.dispose();
      uniforms?.tRefractionMap?.value?.dispose();
      obj.geometry.dispose();
      obj.material.dispose();
    }
    const poolHalfExtent = this._tiers[1]!.halfExtent;
    const size = poolHalfExtent * 2;
    if (this._waterVariant === 'stylized') {
      const geo = new THREE.PlaneGeometry(size, size);
      this._waterObject = new THREE.Mesh(geo, createWaterMaterial());
    } else {
      this._waterObject = this._waterVariant === 'reflective'
        ? createReflectiveWater(size)
        : createFlowRefractiveWater(size);
    }
    this._waterObject.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
    this._waterObject.rotation.x = -Math.PI / 2;
    this._scene.add(this._waterObject);
  }

  /** Switches the water-surface visual between 'stylized' (see-through),
   *  'reflective' (Water.js), and 'flow-refractive' (Water2.js). No-op if
   *  already on the requested kind. If the room isn't currently entered,
   *  just remembers the preference for the next enter() call. */
  setWaterVariant(kind: WaterVariantKind): void {
    if (kind === this._waterVariant) return;
    this._waterVariant = kind;
    if (this._entered) this._buildWater();
  }

  enter(): void {
    if (this._entered) return;
    this._entered = true;

    // ── Tier meshes + colliders ──────────────────────────────────────────
    // Each tier (except the innermost) is built as a "picture frame" — 4
    // rectangular pieces covering the ring between its own footprint and
    // the next (deeper) tier's footprint — instead of one full solid
    // square. A full square would form an unbroken ceiling directly above
    // the nested deeper tier (they're all centered at the same XZ point),
    // trapping the player's capsule between the deep floor and the
    // shallower slab above it, and preventing normal walking from ever
    // actually descending into the basin. Only the deepest tier (no tier
    // nested inside it) gets a full solid floor piece.
    // The outermost tier's floor must reach all the way to the room's own
    // half-extent (12), not just its own `halfExtent` (11, chosen only for
    // visual bank-width proportions) — otherwise a 1-unit-wide ring right
    // next to the perimeter walls (11..12) has no floor at all. Since the
    // player's swim/wade state is driven purely by Y vs. WATER_LAB_SURFACE_Y
    // (not by which tier mesh is underneath), falling into that gap dropped
    // the player into "swimming" with no floor and no visible water mesh
    // there — exactly the "floating below the terrain, out past the pool"
    // bug reported (confirmed via teleporting into that gap: player fell
    // from y=2 to swim-float depth with nothing solid beneath them).
    const roomHalf = WATER_LAB_ROOM_SIZE / 2;
    this._tiers.forEach((tier, i) => {
      const holeHalfExtent = this._tiers[i + 1]?.halfExtent ?? 0;
      const outerHalfExtent = i === 0 ? roomHalf : tier.halfExtent;
      const pieces = holeHalfExtent > 0
        ? this._frameRectPieces(outerHalfExtent, holeHalfExtent)
        : [{ cx: 0, cz: 0, hx: outerHalfExtent, hz: outerHalfExtent }];

      for (const piece of pieces) {
        const sizeX = piece.hx * 2;
        const sizeZ = piece.hz * 2;
        const geo = new THREE.PlaneGeometry(sizeX, sizeZ, 1, 1);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshLambertMaterial({ color: TIER_COLORS[tier.name] });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(tier.centerX + piece.cx, tier.y, tier.centerZ + piece.cz);
        mesh.receiveShadow = true;
        this._scene.add(mesh);
        this._tierMeshes.push(mesh);

        const body = this._physics.createStaticBox(
          new THREE.Vector3(tier.centerX + piece.cx, tier.y - 0.025, tier.centerZ + piece.cz),
          new THREE.Vector3(piece.hx, 0.025, piece.hz),
        );
        this._tierBodies.push(body);
      }
    });

    // ── Water surface (covers the shallow+deep+abyss footprint, at bank height) ──
    this._buildWater();

    // ── Lighting (minimal — no skybox/fog, matches sandbox_arena cheapness) ──
    this._ambientLight = new THREE.AmbientLight(0x8090a0, 0.6);
    this._dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._dirLight.position.set(10, 20, 10);
    this._scene.add(this._ambientLight);
    this._scene.add(this._dirLight);

    // ── Perimeter walls so the player can't walk (or swim) off the 24×24
    // room. Must reach down to below the abyss floor (-5.0, see
    // src/levels/WaterLab.ts) — a swimming player's capsule floats around
    // y ≈ -0.5 to -1 (SWIM_FLOAT_DEPTH below the surface), well below where
    // a wall centered on the dry-bank floor (y=0..4) would reach, so a wall
    // that only covers y=0..4 lets swimmers pass clean underneath it at the
    // room edge (confirmed: player could swim out past the pool boundary).
    // Extending the bottom to -6 (below the abyss floor) closes that gap.
    const half = roomHalf;
    const wallTop = 4;
    const wallBottom = -6;
    const wallCenterY = (wallTop + wallBottom) / 2;
    const wallHalfHeight = (wallTop - wallBottom) / 2;
    const wallSpecs: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(0, wallCenterY, -half), new THREE.Vector3(half, wallHalfHeight, 0.25)],
      [new THREE.Vector3(0, wallCenterY, half),  new THREE.Vector3(half, wallHalfHeight, 0.25)],
      [new THREE.Vector3(-half, wallCenterY, 0), new THREE.Vector3(0.25, wallHalfHeight, half)],
      [new THREE.Vector3(half, wallCenterY, 0),  new THREE.Vector3(0.25, wallHalfHeight, half)],
    ];
    for (const [pos, half3] of wallSpecs) {
      this._tierBodies.push(this._physics.createStaticBox(pos, half3));
    }

    // Reset wake-trail tracking — see _updateWake(). Set to null instead of
    // seeding from current position since enter() runs before the real
    // post-room-switch teleport (see src/main.ts enterWaterLab()).
    this._prevWakePos = null;
  }

  /**
   * Splits a `outerHalfExtent`-square footprint into 4 axis-aligned
   * rectangles forming a "picture frame" ring around a centered
   * `innerHalfExtent`-square hole (the next tier down's footprint). Both
   * tiers are assumed centered at the same local (0,0) — callers offset the
   * returned rects by the tier's actual centerX/centerZ.
   */
  private _frameRectPieces(
    outerHalfExtent: number,
    innerHalfExtent: number,
  ): Array<{ cx: number; cz: number; hx: number; hz: number }> {
    const edge = (outerHalfExtent - innerHalfExtent) / 2;
    const mid = (outerHalfExtent + innerHalfExtent) / 2;
    return [
      { cx: 0,    cz:  mid, hx: outerHalfExtent, hz: edge },           // north
      { cx: 0,    cz: -mid, hx: outerHalfExtent, hz: edge },           // south
      { cx:  mid, cz: 0,    hx: edge,             hz: innerHalfExtent }, // east
      { cx: -mid, cz: 0,    hx: edge,             hz: innerHalfExtent }, // west
    ];
  }

  /** Finds which tier's own footprint (each a concentric square, per
   *  `_tiers`) actually contains the given world (x,z) — i.e. the smallest
   *  (innermost) tier whose square half-extent contains the point, since
   *  inner tiers' footprints are "holes" cut into the outer tiers' rings.
   *  Used to look up the real floor height beneath an arbitrary point,
   *  which the fixed-depth dive/swim vertical spring has no way to know. */
  private _tierAt(x: number, z: number): WaterLabTier {
    let result = this._tiers[0]!;
    for (const tier of this._tiers) {
      if (Math.abs(x - tier.centerX) <= tier.halfExtent && Math.abs(z - tier.centerZ) <= tier.halfExtent) {
        result = tier; // tiers are listed outer→inner, so keep narrowing
      }
    }
    return result;
  }

  exit(): void {
    if (!this._entered) return;
    this._entered = false;
    for (const m of this._tierMeshes) this._scene.remove(m);
    if (this._waterObject) this._scene.remove(this._waterObject);
    if (this._ambientLight) {
      this._scene.remove(this._ambientLight);
      this._ambientLight = null;
    }
    if (this._dirLight) {
      this._scene.remove(this._dirLight);
      this._dirLight = null;
    }
    for (const b of this._tierBodies) this._physics.removeBody(b);
    this._tierBodies.length = 0;
    if (this._wakeEmitter) {
      this._wakeEmitter.stop();
      this._wakeEmitter = null;
    }
    this._prevWakePos = null;
  }

  /** Advances the water shader animation and applies swim/wading state to
   *  the player based on their live depth below the water surface. Also
   *  detects the player crossing the water surface (either direction) to
   *  trigger a one-shot splash VFX burst. */
  update(dt: number): void {
    // Water2's flow animation self-advances via its own internal clock in
    // onBeforeRender (called automatically by the renderer each frame it's
    // in the scene) — only Water.js's `time` uniform needs manual ticking.
    if (this._waterObject && this._waterVariant === 'reflective') {
      (this._waterObject as Water).material.uniforms.time!.value += dt;
    } else if (this._waterObject && this._waterVariant === 'stylized') {
      ((this._waterObject as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uTime!.value += dt;
    }

    const playerY = this._player.group.position.y;
    const depthBelowSurface = WATER_LAB_SURFACE_Y - playerY;

    const enteredWater = this._prevDepthBelowSurface <= 0 && depthBelowSurface > 0;
    const exitedWater  = this._prevDepthBelowSurface > 0 && depthBelowSurface <= 0;
    if (enteredWater || exitedWater) {
      const pos = this._player.group.position;
      this._spawnSplash(pos.x, pos.z, enteredWater);
    }
    this._prevDepthBelowSurface = depthBelowSurface;

    // Hysteresis: only *enter* swim mode crossing the (higher) enter
    // threshold, and only *leave* it crossing the (lower) exit threshold —
    // see the constants' doc comments for why a single threshold flickers.
    if (!this._playerIsSwimming && depthBelowSurface >= SWIM_ENTER_DEPTH_THRESHOLD) {
      this._playerIsSwimming = true;
    } else if (this._playerIsSwimming && depthBelowSurface < SWIM_EXIT_DEPTH_THRESHOLD) {
      this._playerIsSwimming = false;
    }

    if (this._playerIsSwimming) {
      // The dive vertical spring (PlayerController) eases toward a single
      // fixed depth relative to the water surface, with no idea what's
      // actually beneath the player's current X/Z — so diving in the abyss
      // (the only footprint deep enough to trigger real swim state from a
      // vertical fall) and then holding a direction to swim sideways
      // carried the player, still near that dive depth, straight under the
      // much-shallower deep/shallow/bank floor slabs and out to the
      // perimeter wall with nothing solid ever stopping them — exactly the
      // "swim out of bounds while diving" bug reported repeatedly.
      // Confirmed via a repro test: dive at the abyss center, hold a
      // lateral direction, and the player glided at y≈-3 clear across
      // every tier boundary (radius 2, 4, 7) to the outer wall.
      // Passing the actual local floor height as setSwimming()'s floorY
      // clamps the spring's target so it eases toward (and rests on) that
      // floor once the player crosses under a shallower tier, instead of
      // continually demanding downward velocity that fights the KCC's
      // collision response every frame.
      const tier = this._tierAt(this._player.group.position.x, this._player.group.position.z);
      // setSubmersion() also accepts negative fractions to LIFT the rig
      // above its resting Y (see PlayerController.setSubmersion doc) — this
      // is deliberately used here, not just "a small positive fraction",
      // because measurement showed a small positive value still only broke
      // the *hair-tip* through the surface, not the whole head:
      //   1.0  (original bug)   -> head-top  0.26 WU *below*  surface
      //   0.15 (first attempt)  -> head-top  0.31 WU above surface (only
      //                            hair visible — the "just the very top of
      //                            her head" complaint)
      //  -0.6  (this value)     -> head-top  0.82 WU above surface, clearing
      //                            the whole head/ears/neck (verified via
      //                            getPlayerVisualBounds() + close-up
      //                            screenshots, not eyeballed at a glance)
      // Zelda OOT / SM64 keep the whole head out of the water while
      // swimming (you don't drown at the neck) — this matches that.
      this._player.setSubmersion(-0.6);
      this._player.setSwimming(true, WATER_LAB_SURFACE_Y, tier.y);
    } else if (depthBelowSurface > 0) {
      this._player.setSubmersion(0.4);
      this._player.setSwimming(false);
    } else {
      this._player.setSubmersion(0);
      this._player.setSwimming(false);
    }

    this._updateWake(dt);
  }

  /** Starts/updates/stops a continuous wake-trail particle emitter that
   *  follows the player while she's swimming, near the surface (not
   *  diving deep), and actually moving (not treading water in place) — a
   *  subtle continuous trail behind a surface swimmer, distinct from the
   *  one-shot splash burst in _spawnSplash(). Turns off automatically the
   *  instant any of the three conditions stops holding. */
  private _updateWake(dt: number): void {
    const pos = this._player.group.position;
    
    // If we haven't started tracking yet (first frame, or post-teleport),
    // just record the current position and treat speed as zero this frame.
    if (this._prevWakePos === null) {
      this._prevWakePos = { x: pos.x, z: pos.z };
      return;
    }

    const dx = pos.x - this._prevWakePos.x;
    const dz = pos.z - this._prevWakePos.z;
    const distance = Math.hypot(dx, dz);
    
    // Treat implausibly large single-frame jumps as teleports rather than
    // real movement — cap at 7 WU/frame (generous overage beyond real swim
    // motion, since SWIM_SPEED is 3.5 WU/s → ~0.058 WU/frame at 60Hz).
    const TELEPORT_THRESHOLD = 7;
    let horizSpeed = 0;
    if (dt > 0 && distance < TELEPORT_THRESHOLD) {
      horizSpeed = distance / dt;
    }
    
    this._prevWakePos.x = pos.x;
    this._prevWakePos.z = pos.z;

    const nearSurface = this._player.underwaterDepthFraction < WAKE_NEAR_SURFACE_DEPTH_FRACTION;
    // Use hysteresis: start at WAKE_START_SPEED, stop at WAKE_STOP_SPEED.
    const speedThreshold = (this._wakeEmitter && this._wakeEmitter.active)
      ? WAKE_STOP_SPEED
      : WAKE_START_SPEED;
    const shouldWake = this._player.isSwimming && nearSurface && horizSpeed > speedThreshold;

    if (shouldWake) {
      if (this._wakeEmitter && this._wakeEmitter.active) {
        this._wakeEmitter.setPos(pos.x, WATER_LAB_SURFACE_Y, pos.z);
      } else {
        this._wakeEmitter = this._particles.addEmitter(
          new THREE.Vector3(pos.x, WATER_LAB_SURFACE_Y, pos.z),
          {
            color:    0xdff3ff, // same pale blue/white as the splash burst
            rate:     10,
            speed:    0.4,
            lifetime: 0.5,
            upBias:   0,
            spread:   Math.PI,
            gravity:  false,
          },
        );
      }
    } else if (this._wakeEmitter && this._wakeEmitter.active) {
      this._wakeEmitter.stop();
    }
  }

  /** Fires a one-shot radial burst of pale-blue/white particles at
   *  (x, WATER_LAB_SURFACE_Y, z) — a bigger, more energetic burst on entry
   *  than on exit, matching how a body displaces more water diving in than
   *  climbing out. */
  private _spawnSplash(x: number, z: number, isEntry: boolean): void {
    const count = isEntry ? 12 : 8;
    const origin = new THREE.Vector3(x, WATER_LAB_SURFACE_Y, z);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const radialSpeed = (isEntry ? 2.5 : 1.6) * (0.6 + Math.random() * 0.6);
      const vx = Math.cos(angle) * radialSpeed;
      const vz = Math.sin(angle) * radialSpeed;
      const vy = (isEntry ? 3.0 : 2.0) * (0.7 + Math.random() * 0.5);
      const lifetime = 0.4 + Math.random() * 0.25;
      this._particles.emit(origin, 0xdff3ff, vx, vy, vz, lifetime, true);
    }
  }

  dispose(): void {
    if (this._tierMeshes.length === 0 && !this._waterObject) return;
    this.exit();
    for (const m of this._tierMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this._tierMeshes.length = 0;
    if (this._waterObject) {
      const obj = this._waterObject as unknown as { geometry: THREE.BufferGeometry; material: THREE.Material };
      obj.geometry.dispose();
      obj.material.dispose();
      this._waterObject = null;
    }
  }
}
