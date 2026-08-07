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
 * the deep floor crosses SWIM_DEPTH_THRESHOLD and triggers full swim mode
 * (setSwimming) — buoyant float, capped speed, no jump.
 *
 * No settlements/NPCs/trees/skybox/fog — kept as cheap as the existing
 * sandbox_arena interior so it loads and runs at full FPS for testing.
 */
import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  buildWaterLabTiers,
  WATER_LAB_ROOM_SIZE,
  WATER_LAB_SURFACE_Y,
  type WaterLabTier,
} from '@/levels/WaterLab';
import { createWaterMaterial } from '@/world/WaterMaterial';

/** WU below the water surface at which wading becomes full swimming.
 *  Chosen so the lab's shallow shelf (0.3 WU below surface) reads as
 *  wading and the deep floor (1.2 WU below surface) reads as swimming. */
const SWIM_DEPTH_THRESHOLD = 0.9;

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
  private _waterMesh: THREE.Mesh | null = null;
  private _waterMaterial: THREE.ShaderMaterial | null = null;
  private _ambientLight: THREE.AmbientLight | null = null;
  private _dirLight: THREE.DirectionalLight | null = null;
  private _entered = false;

  constructor(
    private readonly _scene: THREE.Scene,
    private readonly _physics: PhysicsWorld,
    private readonly _player: PlayerController,
  ) {}

  enter(): void {
    if (this._entered) return;
    this._entered = true;

    // ── Tier meshes + colliders ──────────────────────────────────────────
    for (const tier of this._tiers) {
      const size = tier.halfExtent * 2;
      const geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: TIER_COLORS[tier.name] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(tier.centerX, tier.y, tier.centerZ);
      mesh.receiveShadow = true;
      this._scene.add(mesh);
      this._tierMeshes.push(mesh);

      const body = this._physics.createStaticBox(
        new THREE.Vector3(tier.centerX, tier.y - 0.025, tier.centerZ),
        new THREE.Vector3(tier.halfExtent, 0.025, tier.halfExtent),
      );
      this._tierBodies.push(body);
    }

    // ── Water mesh (covers the shallow+deep footprint, sits at bank height) ──
    // shallow tier footprint (deep tier is nested inside it, so this fully covers both)
    const poolHalfExtent = this._tiers[1]!.halfExtent;
    const waterGeo = new THREE.PlaneGeometry(poolHalfExtent * 2, poolHalfExtent * 2, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this._waterMaterial = createWaterMaterial();
    this._waterMesh = new THREE.Mesh(waterGeo, this._waterMaterial);
    this._waterMesh.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
    this._scene.add(this._waterMesh);

    // ── Lighting (minimal — no skybox/fog, matches sandbox_arena cheapness) ──
    this._ambientLight = new THREE.AmbientLight(0x8090a0, 0.6);
    this._dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._dirLight.position.set(10, 20, 10);
    this._scene.add(this._ambientLight);
    this._scene.add(this._dirLight);

    // ── Perimeter walls so the player can't walk off the 24×24 room ──────
    const half = WATER_LAB_ROOM_SIZE / 2;
    const wallHeight = 4;
    const wallSpecs: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(0, wallHeight / 2, -half), new THREE.Vector3(half, wallHeight / 2, 0.25)],
      [new THREE.Vector3(0, wallHeight / 2, half),  new THREE.Vector3(half, wallHeight / 2, 0.25)],
      [new THREE.Vector3(-half, wallHeight / 2, 0), new THREE.Vector3(0.25, wallHeight / 2, half)],
      [new THREE.Vector3(half, wallHeight / 2, 0),  new THREE.Vector3(0.25, wallHeight / 2, half)],
    ];
    for (const [pos, half3] of wallSpecs) {
      this._tierBodies.push(this._physics.createStaticBox(pos, half3));
    }
  }

  exit(): void {
    if (!this._entered) return;
    this._entered = false;
    for (const m of this._tierMeshes) this._scene.remove(m);
    if (this._waterMesh) this._scene.remove(this._waterMesh);
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
  }

  /** Advances the water shader animation and applies swim/wading state to
   *  the player based on their live depth below the water surface. */
  update(dt: number): void {
    if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;

    const playerY = this._player.group.position.y;
    const depthBelowSurface = WATER_LAB_SURFACE_Y - playerY;

    if (depthBelowSurface >= SWIM_DEPTH_THRESHOLD) {
      this._player.setSubmersion(1.0);
      this._player.setSwimming(true, WATER_LAB_SURFACE_Y);
    } else if (depthBelowSurface > 0) {
      this._player.setSubmersion(0.4);
      this._player.setSwimming(false);
    } else {
      this._player.setSubmersion(0);
      this._player.setSwimming(false);
    }
  }

  dispose(): void {
    if (this._tierMeshes.length === 0 && !this._waterMesh) return;
    this.exit();
    for (const m of this._tierMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this._tierMeshes.length = 0;
    if (this._waterMesh) {
      this._waterMesh.geometry.dispose();
      (this._waterMesh.material as THREE.Material).dispose();
      this._waterMesh = null;
    }
    this._waterMaterial = null;
  }
}
