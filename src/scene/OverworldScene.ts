// ── OverworldScene ────────────────────────────────────────────────────────────
//
//  The exterior world: a procedurally generated landscape with a heightmap
//  terrain, procedural trees + rocks, enemy camps, and building entrances.
//
//  Scene modes:
//    enter() — adds all geometry to the Three.js scene + creates physics ground
//    exit()  — removes geometry + removes physics bodies
//    update(dt) — ticks enemies each frame
//
//  Trigger API (polled by main.ts each frame):
//    nearTowerEntrance(pos)  → true when player can press E to enter the tower
//    nearBuilding(pos)       → BuildingEntrance | null

import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { SlimeEnemy } from '@/enemy/SlimeEnemy';
import { mulberry32, randInt } from '@/core/prng';
import { createNoise2D, fbm } from '@/core/SimplexNoise';
import { poissonDisk } from '@/core/poissonDisk';
import RAPIER from '@dimforge/rapier3d-compat';

// ── World constants ───────────────────────────────────────────────────────────

const WORLD_SIZE  = 200; // world units across
const TERRAIN_RES = 80;  // vertices per side
const MAX_HEIGHT  = 10;  // maximum terrain elevation
const FLAT_INNER  = 18;  // radius of perfectly flat zone (tower area)
const FLAT_OUTER  = 32;  // radius where terrain reaches full height

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuildingType = 'greenhouse';

export interface BuildingEntrance {
  type: BuildingType;
  position: THREE.Vector3;
  label: string;
}

// ── OverworldScene ────────────────────────────────────────────────────────────

export class OverworldScene {
  private readonly _terrainMesh: THREE.Mesh;
  private readonly _objectGroup  = new THREE.Group();
  private readonly _enemies: SlimeEnemy[] = [];
  private _groundBody: RAPIER.RigidBody | null = null;

  readonly buildingEntrances: BuildingEntrance[] = [];

  /** Height function (world-space x, z → y). Used for placing objects. */
  private readonly _heightAt: (x: number, z: number) => number;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly player: PlayerController,
    seed: number,
  ) {
    // XOR the seed so the overworld layout is always different from the dungeon
    const overworldSeed = seed ^ 0xA5_F0_3C_12;
    const rand  = mulberry32(overworldSeed);
    const noise = createNoise2D(overworldSeed ^ 0x5E_A1_9D_7B);

    // Build the height function (shared by terrain + object placement)
    this._heightAt = (x: number, z: number): number => {
      const dist = Math.sqrt(x * x + z * z);
      const flatFactor = dist < FLAT_INNER
        ? 0
        : Math.min(1, (dist - FLAT_INNER) / (FLAT_OUTER - FLAT_INNER));
      return fbm(noise, x * 0.018, z * 0.018, 4) * MAX_HEIGHT * flatFactor;
    };

    this._terrainMesh = this._buildTerrain();
    this._populateTrees(rand);
    this._populateRocks(rand);
    this._spawnEnemyCamps(rand);
    this._placeBuildings(rand);

    // Tower entrance marker (procedural archway at world origin)
    this._buildTowerEntrance();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Add all overworld objects to the scene and create the physics ground. */
  enter(): void {
    this._groundBody = this.physics.createGroundPlane(0);
    this.scene.add(this._terrainMesh);
    this.scene.add(this._objectGroup);
    for (const e of this._enemies) this.scene.add(e.group);
  }

  /** Remove all overworld objects from the scene and destroy the physics ground. */
  exit(): void {
    this.scene.remove(this._terrainMesh);
    this.scene.remove(this._objectGroup);
    for (const e of this._enemies) this.scene.remove(e.group);
    if (this._groundBody) {
      this.physics.rapierWorld.removeRigidBody(this._groundBody);
      this._groundBody = null;
    }
  }

  /** Per-frame update: tick enemy AI. */
  update(dt: number): void {
    const pos = this.player.group.position;
    for (const e of this._enemies) {
      if (!e.isDead) e.update(pos, dt);
    }
  }

  dispose(): void {
    this.exit();
    (this._terrainMesh.geometry as THREE.BufferGeometry).dispose();
    (this._terrainMesh.material as THREE.Material).dispose();
    for (const child of this._objectGroup.children) {
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
      else m.material?.dispose();
    }
    for (const e of this._enemies) e.dispose(this.physics);
  }

  // ── Trigger queries ───────────────────────────────────────────────────────

  /** True when `playerPos` is within the tower entrance trigger radius. */
  nearTowerEntrance(playerPos: THREE.Vector3): boolean {
    return playerPos.x * playerPos.x + playerPos.z * playerPos.z < 3.5 * 3.5;
  }

  /** Returns the nearest building entrance if the player is within 3.5 units. */
  nearBuilding(playerPos: THREE.Vector3): BuildingEntrance | null {
    for (const b of this.buildingEntrances) {
      const dx = playerPos.x - b.position.x;
      const dz = playerPos.z - b.position.z;
      if (dx * dx + dz * dz < 3.5 * 3.5) return b;
    }
    return null;
  }

  getActiveEnemies(): SlimeEnemy[] { return this._enemies; }

  // ── Private builders ──────────────────────────────────────────────────────

  private _buildTerrain(): THREE.Mesh {
    const geo  = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_RES, TERRAIN_RES);
    geo.rotateX(-Math.PI / 2);

    const pos    = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this._heightAt(x, z);
      pos.setY(i, h);

      // Vertex colour by normalised height → biome palette
      const t = Math.max(0, Math.min(1, (h + 1) / (MAX_HEIGHT + 1)));
      if (t < 0.12) {                               // bog — dark, waterlogged
        colors[i*3] = 0.17; colors[i*3+1] = 0.21; colors[i*3+2] = 0.13;
      } else if (t < 0.52) {                        // forest floor — muted green
        colors[i*3] = 0.10 + t * 0.12;
        colors[i*3+1] = 0.30 + t * 0.12;
        colors[i*3+2] = 0.06;
      } else if (t < 0.78) {                        // upper forest — faded green
        colors[i*3] = 0.28; colors[i*3+1] = 0.36; colors[i*3+2] = 0.18;
      } else {                                      // highlands — grey rock
        colors[i*3] = 0.42 + t * 0.1;
        colors[i*3+1] = 0.40 + t * 0.08;
        colors[i*3+2] = 0.38 + t * 0.06;
      }
    }

    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  // ── Trees ─────────────────────────────────────────────────────────────────

  private _populateTrees(rand: () => number): void {
    const HALF = WORLD_SIZE / 2;
    const pts  = poissonDisk(WORLD_SIZE, WORLD_SIZE, 6, rand);

    for (const [px, pz] of pts) {
      const wx = px - HALF;
      const wz = pz - HALF;
      if (wx * wx + wz * wz < 20 * 20) continue; // avoid tower area

      const h = this._heightAt(wx, wz);
      const t = (h + 1) / (MAX_HEIGHT + 1);
      if (t < 0.10 || t > 0.76) continue; // bogs & highlands have no trees

      this._objectGroup.add(this._makeTree(rand, wx, h, wz));
    }
  }

  private _makeTree(rand: () => number, x: number, groundY: number, z: number): THREE.Group {
    const g      = new THREE.Group();
    const height = 3.5 + rand() * 3.0;
    const radius = 0.18 + rand() * 0.12;

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(radius * 0.55, radius, height, 6);
    const trunk    = new THREE.Mesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4a3020 }));
    trunk.position.y = height / 2;
    trunk.castShadow  = true;
    g.add(trunk);

    // Canopy: 1–2 overlapping spheres with slight vertex displacement
    const canopyCount = 1 + Math.floor(rand() * 2);
    for (let c = 0; c < canopyCount; c++) {
      const cr  = 1.1 + rand() * 0.9;
      const geo = new THREE.SphereGeometry(cr, 7, 5);

      // Organic noise displacement
      const pa = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pa.count; v++) {
        pa.setX(v, pa.getX(v) + (rand() - 0.5) * 0.35);
        pa.setY(v, pa.getY(v) + (rand() - 0.5) * 0.35);
        pa.setZ(v, pa.getZ(v) + (rand() - 0.5) * 0.35);
      }
      geo.computeVertexNormals();

      const greenVal = 0.22 + rand() * 0.28;
      const canopy   = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: new THREE.Color(0.05, greenVal, 0.04) }),
      );
      canopy.position.set(
        (rand() - 0.5) * 0.9,
        height - cr * 0.25 + c * 0.55,
        (rand() - 0.5) * 0.9,
      );
      canopy.castShadow = true;
      g.add(canopy);
    }

    g.position.set(x, groundY, z);
    return g;
  }

  // ── Rocks ─────────────────────────────────────────────────────────────────

  private _populateRocks(rand: () => number): void {
    const HALF = WORLD_SIZE / 2;
    const pts  = poissonDisk(WORLD_SIZE, WORLD_SIZE, 9, rand);

    for (const [px, pz] of pts.slice(0, 70)) {
      const wx = px - HALF;
      const wz = pz - HALF;
      if (wx * wx + wz * wz < 13 * 13) continue;

      const h = this._heightAt(wx, wz);
      this._objectGroup.add(this._makeRock(rand, wx, h, wz));
    }
  }

  private _makeRock(rand: () => number, x: number, groundY: number, z: number): THREE.Mesh {
    const r    = 0.35 + rand() * 0.85;
    const geo  = new THREE.DodecahedronGeometry(r, 0);
    const grey = 0.28 + rand() * 0.28;
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(grey, grey * 0.95, grey * 0.87) }),
    );
    mesh.scale.set(1.0 + rand() * 0.5, 0.55 + rand() * 0.55, 0.85 + rand() * 0.45);
    mesh.rotation.set(0, rand() * Math.PI * 2, rand() * 0.4 - 0.2);
    mesh.position.set(x, groundY + r * 0.25, z);
    mesh.castShadow = true;
    return mesh;
  }

  // ── Enemy camps ───────────────────────────────────────────────────────────

  private _spawnEnemyCamps(rand: () => number): void {
    const HALF     = WORLD_SIZE / 2;
    const campPts  = poissonDisk(WORLD_SIZE, WORLD_SIZE, 28, rand);

    const camps = campPts
      .map(([px, pz]): [number, number] => [px - HALF, pz - HALF])
      .filter(([wx, wz]) => wx * wx + wz * wz > 28 * 28)
      .slice(0, 5);

    for (const [cx, cz] of camps) {
      const count = 3 + randInt(rand, 3); // 3–5 per camp
      for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2;
        const dist  = rand() * 4.5;
        const ex    = cx + Math.cos(angle) * dist;
        const ez    = cz + Math.sin(angle) * dist;
        const ey    = this._heightAt(ex, ez) + 1.0;

        const slime = new SlimeEnemy(
          new THREE.Vector3(ex, ey, ez),
          this.physics,
          (dmg) => this.player.health.takeDamage(dmg),
        );
        this._enemies.push(slime);
      }
    }
  }

  // ── Outdoor buildings ─────────────────────────────────────────────────────

  private _placeBuildings(rand: () => number): void {
    const HALF = WORLD_SIZE / 2;
    const pts  = poissonDisk(WORLD_SIZE, WORLD_SIZE, 45, rand);

    const candidates = pts
      .map(([px, pz]): [number, number] => [px - HALF, pz - HALF])
      .filter(([wx, wz]) => {
        const d = Math.sqrt(wx * wx + wz * wz);
        return d > 38 && d < HALF - 18;
      })
      .slice(0, 2);

    for (const [bx, bz] of candidates) {
      const h = this._heightAt(bx, bz);
      this._buildGreenhouseRuin(rand, bx, h, bz);
      this.buildingEntrances.push({
        type:     'greenhouse',
        position: new THREE.Vector3(bx, h, bz),
        label:    'Ruined Greenhouse',
      });
    }
  }

  private _buildGreenhouseRuin(rand: () => number, cx: number, groundY: number, cz: number): void {
    const PILLARS = 10;
    const RADIUS  = 4.5;

    for (let i = 0; i < PILLARS; i++) {
      const angle  = (i / PILLARS) * Math.PI * 2;
      const intact = rand() > 0.35;
      const h      = intact ? 2.8 + rand() * 1.2 : 0.7 + rand() * 0.9;
      const r      = 0.22 + rand() * 0.1;

      const geo  = new THREE.CylinderGeometry(r * (intact ? 0.9 : 1.2), r, h, 8);
      const grey = 0.35 + rand() * 0.18;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ color: new THREE.Color(grey, grey * 0.94, grey * 0.88) }),
      );
      mesh.position.set(
        cx + Math.cos(angle) * RADIUS,
        groundY + h / 2,
        cz + Math.sin(angle) * RADIUS,
      );
      mesh.rotation.y = rand() * 0.3 - 0.15; // slight lean for ruin feel
      this._objectGroup.add(mesh);
    }

    // Overgrown stone-slab floor (round disc)
    const floorGeo = new THREE.CylinderGeometry(RADIUS * 0.88, RADIUS * 0.88, 0.12, 14);
    const floor    = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: 0x38362d }));
    floor.position.set(cx, groundY + 0.04, cz);
    this._objectGroup.add(floor);

    // Entrance glow — small emissive sphere marks the entry point
    const glowGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const glow    = new THREE.Mesh(
      glowGeo,
      new THREE.MeshLambertMaterial({ color: 0x55ff99, emissive: 0x22aa44, emissiveIntensity: 0.7 }),
    );
    glow.position.set(cx, groundY + 1.9, cz);
    this._objectGroup.add(glow);
  }

  // ── Tower entrance marker ─────────────────────────────────────────────────

  private _buildTowerEntrance(): void {
    // Simple archway: two pillars + lintel over the tower door
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.35, 4, 8);
    const stoneMat  = new THREE.MeshLambertMaterial({ color: 0x4a4540 });

    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, stoneMat);
      p.position.set(side * 1.4, 2, -2.5);
      this._objectGroup.add(p);
    }

    const lintelGeo  = new THREE.BoxGeometry(3.4, 0.4, 0.5);
    const lintel     = new THREE.Mesh(lintelGeo, stoneMat);
    lintel.position.set(0, 4.2, -2.5);
    this._objectGroup.add(lintel);

    // Entry glow
    const glowGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const glow    = new THREE.Mesh(
      glowGeo,
      new THREE.MeshLambertMaterial({ color: 0xaaddff, emissive: 0x4488cc, emissiveIntensity: 0.8 }),
    );
    glow.position.set(0, 2.0, -2.5);
    this._objectGroup.add(glow);
  }
}
