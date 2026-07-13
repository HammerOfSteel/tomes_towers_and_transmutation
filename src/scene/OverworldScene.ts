/**
 * OverworldScene — tile-based exterior world
 *
 * TERRAIN
 *   51×51 grid of 2-unit square tiles, each at an integer height level 0–4.
 *   Levels are determined by simplex noise with a flat zone around the tower.
 *   All tile tops and exposed side-walls are baked into a single merged
 *   BufferGeometry so the terrain is one draw call.
 *   Tile-to-world:  worldX = (col − 25) × 2,  worldZ = (row − 25) × 2
 *   This matches the 2×2 interior cell footprint for visual coherence.
 *
 * PHYSICS
 *   Ground plane at y = 0 (player KCC walks on this flat surface).
 *   Tree trunks and rocks get static Rapier capsule/ball colliders.
 *   The tower gets a static cylinder/capsule collider.
 *   All static bodies are created in enter() and removed in exit().
 *
 * TOWER
 *   Multi-floor procedural octagonal stone tower at world origin.
 *   Foundation → three 5-unit floors (each slightly tapered) → parapet
 *   → 8 battlements → conical spire.  Door arch on the south face (+Z).
 *
 * OBJECTS
 *   Trees   — CylinderGeometry trunk + two layered ConeGeometry canopy cones
 *   Rocks   — DodecahedronGeometry, random rotation / scale
 *   Ruins   — circular ring of broken stone pillars + overgrown floor disc
 *   Enemies — SlimeEnemy camps placed via Poisson disk
 */

import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { SlimeEnemy } from '@/enemy/SlimeEnemy';
import { mulberry32 } from '@/core/prng';
import { createNoise2D, fbm } from '@/core/SimplexNoise';
import { poissonDisk } from '@/core/poissonDisk';
import RAPIER from '@dimforge/rapier3d-compat';

// ── Grid constants ────────────────────────────────────────────────────────────

const GW  = 51;               // grid columns
const GH  = 51;               // grid rows
const GHW = (GW - 1) / 2;    // 25 — centre column
const GHH = (GH - 1) / 2;    // 25 — centre row
const T   = 2;                // tile side length in world units (= interior cell)
const SH  = 0.55;             // world-unit height increment per level
const MLV = 4;                // max height level index (0 = ground, 4 = highland)
const FR  = 7;                // flat-zone radius in tiles around tower

// ── Biome vertex colours [r, g, b] for height levels 0–4 ─────────────────────
//   Slightly darker at night-ish palette to match the dungeon interior mood.

const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuildingType = 'greenhouse';

export interface BuildingEntrance {
  type:     BuildingType;
  position: THREE.Vector3;
  label:    string;
}

// Internal storage entries (not exported)
interface TreeEntry { group: THREE.Group; px: number; pz: number; }
interface RockEntry { mesh: THREE.Mesh; px: number; py: number; pz: number; r: number; }

// ── OverworldScene ────────────────────────────────────────────────────────────

export class OverworldScene {
  // ── Visual geometry (built in constructor, never rebuilt)
  private readonly _terrain: THREE.Mesh;
  private readonly _tower:   THREE.Group;
  private readonly _trees:   TreeEntry[] = [];
  private readonly _rocks:   RockEntry[] = [];
  private readonly _ruins:   THREE.Group[] = [];
  private readonly _enemies: SlimeEnemy[]  = [];

  readonly buildingEntrances: BuildingEntrance[] = [];

  // ── Physics handles (created in enter(), cleared in exit())
  private _groundBody:   RAPIER.RigidBody | null = null;
  private _staticBodies: RAPIER.RigidBody[] = [];

  // ── Height data (used during construction for object placement)
  private readonly _grid: Uint8Array; // [row * GW + col] → level 0–4

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(
    private readonly scene:   THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly player:  PlayerController,
    seed: number,
  ) {
    const rand  = mulberry32(seed ^ 0xA5_F0_3C_12);
    const noise = createNoise2D(seed ^ 0x5E_A1_9D_7B);

    this._grid    = this._buildGrid(noise);
    this._terrain = this._buildTerrain();
    this._tower   = this._buildTower();

    this._plantTrees(rand);
    this._placeRocks(rand);
    this._spawnCamps(rand);
    this._addRuins(rand);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Add geometry to scene and register physics colliders. */
  enter(): void {
    // Flat base plane covers level-0 tiles and acts as the underfloor.
    this._groundBody = this.physics.createGroundPlane(0);
    // Per-tile box colliders for elevated terrain: each box is a solid block from
    // y=0 to y=level*SH, so the top surface is perfectly flat and exactly matches
    // the visual tile height.  This avoids the triangulated-slope artefact of a
    // heightfield where adjacent tiles share interpolated corner vertices.
    this._staticBodies.push(this._createTileBoxColliders());

    // Tower: treat as a tall capsule for the whole body (avoids cylinder API diff between Rapier versions)
    this._addStaticBody(0, 10, 0, RAPIER.ColliderDesc.capsule(9.0, 4.5));

    // Tree trunk colliders
    for (const tr of this._trees) {
      this._addStaticBody(tr.px, 1.2, tr.pz, RAPIER.ColliderDesc.capsule(1.0, 0.22));
    }

    // Rock colliders
    for (const rk of this._rocks) {
      this._addStaticBody(rk.px, rk.py, rk.pz, RAPIER.ColliderDesc.ball(rk.r * 0.85));
    }

    // Add visuals
    this.scene.add(this._terrain, this._tower);
    for (const tr of this._trees)   this.scene.add(tr.group);
    for (const rk of this._rocks)   this.scene.add(rk.mesh);
    for (const ru of this._ruins)   this.scene.add(ru);
    for (const en of this._enemies) this.scene.add(en.group);
  }

  /** Remove geometry from scene and destroy physics colliders. */
  exit(): void {
    if (this._groundBody) {
      this.physics.rapierWorld.removeRigidBody(this._groundBody);
      this._groundBody = null;
    }
    for (const b of this._staticBodies) this.physics.rapierWorld.removeRigidBody(b);
    this._staticBodies = [];

    this.scene.remove(this._terrain, this._tower);
    for (const tr of this._trees)   this.scene.remove(tr.group);
    for (const rk of this._rocks)   this.scene.remove(rk.mesh);
    for (const ru of this._ruins)   this.scene.remove(ru);
    for (const en of this._enemies) this.scene.remove(en.group);
  }

  /** Per-frame enemy AI tick. */
  update(dt: number): void {
    const pos = this.player.group.position;
    for (const en of this._enemies) {
      if (!en.isDead) en.update(pos, dt);
    }
  }

  /** Full teardown — disposes GPU resources. */
  dispose(): void {
    this.exit();
    (this._terrain.geometry as THREE.BufferGeometry).dispose();
    (this._terrain.material as THREE.Material).dispose();
    this._freeGroup(this._tower);
    for (const tr of this._trees) this._freeGroup(tr.group);
    for (const rk of this._rocks) {
      rk.mesh.geometry.dispose();
      (rk.mesh.material as THREE.Material).dispose();
    }
    for (const ru of this._ruins) this._freeGroup(ru);
    for (const en of this._enemies) en.dispose(this.physics);
  }

  // ── Trigger queries ───────────────────────────────────────────────────────

  /** True when the player is close enough to the tower door to press E.
   *  Radius 6.5 — larger than the tower capsule (4.5) + player radius (0.35),
   *  so the prompt fires as the player approaches the door, not after clipping in. */
  nearTowerEntrance(pos: THREE.Vector3): boolean {
    return pos.x * pos.x + pos.z * pos.z < 6.5 * 6.5;
  }

  /** Returns the nearest building entrance if the player is within range. */
  nearBuilding(pos: THREE.Vector3): BuildingEntrance | null {
    for (const b of this.buildingEntrances) {
      const dx = pos.x - b.position.x;
      const dz = pos.z - b.position.z;
      if (dx * dx + dz * dz < 4.0 * 4.0) return b;
    }
    return null;
  }

  getActiveEnemies(): SlimeEnemy[] { return this._enemies; }

  // ── Private builders ──────────────────────────────────────────────────────

  /**
   * Build a Rapier heightfield collider that mirrors the visual tile grid.
   *
   * Rapier heightfield convention (verified from type definitions):
   *   – heights are stored **column-major**: heights[col_j * (nrows+1) + row_i]
   *   – rows span the X axis  (row_i  → world x)
   *   – columns span the Z axis (col_j  → world z)
   *   – the field is centred at the body's translation
   *
   * Our mapping:
   *   row_i  = gridCol  (x-direction, 0..50)
   *   col_j  = gridRow  (z-direction, 0..50)
   *   heights[gridRow * (nrows+1) + gridCol] = grid[gridRow*GW + gridCol] * SH
   *   scale  = { x: (GW-1)*T=100, y: 1.0, z: (GH-1)*T=100 }
   *
   * This gives world-space vertex positions:
   *   x = -50 + gridCol*2 = (gridCol-25)*2  ✓
   *   z = -50 + gridRow*2 = (gridRow-25)*2  ✓
   */
  private _createTileBoxColliders(): RAPIER.RigidBody {
    // One fixed body; one cuboid collider per elevated tile.
    // Cuboid half-extents: (T/2, level*SH/2, T/2) centred at the tile centre
    // and at height level*SH/2 so its top surface sits at exactly level*SH.
    // Level-0 tiles are covered by the ground plane added in enter().
    const body = this.physics.rapierWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed(),
    );

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const level = this._grid[row * GW + col];
        if (level === 0) continue;

        const cx    = (col - GHW) * T + T * 0.5;
        const cz    = (row - GHH) * T + T * 0.5;
        const halfH = level * SH * 0.5;

        this.physics.rapierWorld.createCollider(
          RAPIER.ColliderDesc.cuboid(T * 0.5, halfH, T * 0.5)
            .setTranslation(cx, halfH, cz),
          body,
        );
      }
    }

    return body;
  }

  /** Create a fixed static rigid body with the given collider at (x, y, z). */
  private _addStaticBody(x: number, y: number, z: number, desc: RAPIER.ColliderDesc): void {
    const body = this.physics.rapierWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    this.physics.rapierWorld.createCollider(desc, body);
    this._staticBodies.push(body);
  }

  /** Build the integer height grid from seeded simplex noise. */
  private _buildGrid(noise: (x: number, y: number) => number): Uint8Array {
    const grid = new Uint8Array(GW * GH);

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const dc = col - GHW;
        const dr = row - GHH;
        const tR = Math.sqrt(dc * dc + dr * dr); // tile-space radius from centre

        // Normalised fbm noise → 0..1
        const nx  = dc / GW;
        const nz  = dr / GH;
        const raw = (fbm(noise, nx * 3.8, nz * 3.8, 4) + 1) * 0.5;
        let level = Math.min(MLV, Math.floor(raw * (MLV + 1)));

        // Smooth flatness gradient: levels fade to 0 within FR tiles of centre
        const flatness = Math.max(0, 1 - tR / FR);
        level = Math.round(level * (1 - flatness));

        // Outer rim bias: terrain rises toward the map edge (bowl effect)
        const rimBias = Math.max(0, (tR - 20) / 9);
        level = Math.min(MLV, Math.round(level + rimBias * 1.8));

        grid[row * GW + col] = level;
      }
    }
    return grid;
  }

  /**
   * Build the merged terrain BufferGeometry.
   *
   * For each tile at height H:
   *   – Top face     (normal +Y)
   *   – South wall   (normal +Z) when south neighbour is lower
   *   – North wall   (normal −Z) when north neighbour is lower
   *   – East  wall   (normal +X) when east  neighbour is lower
   *   – West  wall   (normal −X) when west  neighbour is lower
   *
   * Winding:  triangles (v0,v1,v2) and (v0,v2,v3) produce the outward normal.
   * All vertex-order derivations verified with the right-hand rule.
   */
  private _buildTerrain(): THREE.Mesh {
    const pos: number[] = [];
    const nrm: number[] = [];
    const clr: number[] = [];
    const idx: number[] = [];

    /** Height level of a (possibly out-of-bounds) tile. */
    const lvl = (c: number, r: number): number =>
      (c < 0 || c >= GW || r < 0 || r >= GH) ? 0 : this._grid[r * GW + c];

    /**
     * Append a quad face to the buffers.
     * v0→v1→v2→v3 must be counter-clockwise when viewed along the outward normal.
     */
    const addFace = (
      v0: [number, number, number], v1: [number, number, number],
      v2: [number, number, number], v3: [number, number, number],
      nx: number, ny: number, nz: number,
      r: number, g: number, b: number,
    ): void => {
      const base = pos.length / 3;
      pos.push(...v0, ...v1, ...v2, ...v3);
      nrm.push(nx, ny, nz,  nx, ny, nz,  nx, ny, nz,  nx, ny, nz);
      clr.push(r, g, b,  r, g, b,  r, g, b,  r, g, b);
      idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
    };

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const H   = lvl(col, row);
        const wy  = H * SH;
        const wx  = (col - GHW) * T;
        const wz  = (row - GHH) * T;
        const wx1 = wx + T;
        const wz1 = wz + T;

        // Subtle per-tile brightness variation (avoids repetitive flat look)
        const v = 0.92 + ((col * 29 + row * 19) % 18) / 200;
        const [rb, gb, bb] = BIOME[H];
        const tr = rb * v, tg = gb * v, tb = bb * v;

        // ── TOP face (normal +Y) ─────────────────────────────────────────
        // v0(wx,wz) → v1(wx,wz1) → v2(wx1,wz1) → v3(wx1,wz) gives +Y normal
        addFace(
          [wx, wy, wz], [wx, wy, wz1], [wx1, wy, wz1], [wx1, wy, wz],
          0, 1, 0,  tr, tg, tb,
        );

        // ── SOUTH wall (+Z face, at wz1) ─────────────────────────────────
        const Hs = lvl(col, row + 1);
        if (Hs < H) {
          const wy2 = Hs * SH;
          const d = 0.76;
          addFace(
            [wx1, wy, wz1], [wx, wy, wz1], [wx, wy2, wz1], [wx1, wy2, wz1],
            0, 0, 1,  tr * d, tg * d, tb * d,
          );
        }

        // ── NORTH wall (−Z face, at wz) ──────────────────────────────────
        const Hn = lvl(col, row - 1);
        if (Hn < H) {
          const wy2 = Hn * SH;
          const d = 0.50;
          addFace(
            [wx, wy, wz], [wx1, wy, wz], [wx1, wy2, wz], [wx, wy2, wz],
            0, 0, -1,  tr * d, tg * d, tb * d,
          );
        }

        // ── EAST wall (+X face, at wx1) ──────────────────────────────────
        const He = lvl(col + 1, row);
        if (He < H) {
          const wy2 = He * SH;
          const d = 0.63;
          addFace(
            [wx1, wy, wz], [wx1, wy, wz1], [wx1, wy2, wz1], [wx1, wy2, wz],
            1, 0, 0,  tr * d, tg * d, tb * d,
          );
        }

        // ── WEST wall (−X face, at wx) ───────────────────────────────────
        const Hw = lvl(col - 1, row);
        if (Hw < H) {
          const wy2 = Hw * SH;
          const d = 0.55;
          addFace(
            [wx, wy, wz1], [wx, wy, wz], [wx, wy2, wz], [wx, wy2, wz1],
            -1, 0, 0,  tr * d, tg * d, tb * d,
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(clr, 3));
    geo.setIndex(idx);

    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  /**
   * Build the multi-storey tower group centered at world origin.
   *
   * Structure (bottom to top, Y values are mesh centres):
   *   Foundation      CylinderGeometry(4.8, 5.2, 2.5, 8)   y = 1.25
   *   Floor 1         CylinderGeometry(4.2, 4.5, 5.0, 8)   y = 5.0
   *   Floor 2         CylinderGeometry(3.9, 4.2, 5.0, 8)   y = 10.0
   *   Floor 3         CylinderGeometry(3.6, 3.9, 5.0, 8)   y = 15.0
   *   Parapet ring    CylinderGeometry(4.05, 3.6, 0.9, 8)  y = 17.95
   *   8 merlons       BoxGeometry(0.85, 1.9, 0.75)          y = 19.35
   *   Spire           ConeGeometry(3.2, 5.5, 8)             y = 20.65
   *
   * All cylinders are rotated π/8 so their flat faces align to cardinal axes
   * (i.e. flat-face normals point N/S/E/W/NE/NW/SE/SW).
   */
  private _buildTower(): THREE.Group {
    const grp = new THREE.Group();
    const m   = (hex: number) => new THREE.MeshLambertMaterial({ color: hex });
    const ROT = Math.PI / 8;  // aligns flat faces to cardinal directions

    // ── Foundation ────────────────────────────────────────────────────────
    const fnd = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 2.5, 8), m(0x524840));
    fnd.position.y = 1.25;
    fnd.rotation.y = ROT;
    grp.add(fnd);

    // ── Three tower floors ────────────────────────────────────────────────
    const floorDefs = [
      { rt: 4.2, rb: 4.5, h: 5.0, cy: 5.0,  hex: 0x706860 as number },
      { rt: 3.9, rb: 4.2, h: 5.0, cy: 10.0, hex: 0x686058 as number },
      { rt: 3.6, rb: 3.9, h: 5.0, cy: 15.0, hex: 0x706860 as number },
    ];

    for (const { rt, rb, h, cy, hex } of floorDefs) {
      const flr = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), m(hex));
      flr.position.y = cy;
      flr.rotation.y = ROT;
      grp.add(flr);

      // 4 windows per floor (cardinal directions: S, E, N, W)
      const faceApothem = ((rt + rb) / 2) * Math.cos(Math.PI / 8) + 0.06;
      const winDefs: [number, number, number][] = [
        [ 0,           faceApothem,  0          ],   // south (+Z)
        [ faceApothem, 0,           -Math.PI / 2 ],  // east  (+X)
        [ 0,          -faceApothem,  Math.PI     ],  // north (−Z)
        [-faceApothem, 0,            Math.PI / 2 ],  // west  (−X)
      ];
      for (const [wx, wz, ry] of winDefs) {
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.92, 0.16),
          m(0x14100c),
        );
        win.position.set(wx, cy, wz);
        win.rotation.y = ry;
        grp.add(win);
      }
    }

    // ── Parapet ───────────────────────────────────────────────────────────
    const par = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 3.6, 0.9, 8), m(0x625a52));
    par.position.y = 17.95;
    par.rotation.y = ROT;
    grp.add(par);

    // ── Battlements (8 merlons) ───────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const angle  = (i / 8) * Math.PI * 2 + Math.PI / 16;
      const bx     = Math.sin(angle) * 3.85;
      const bz     = Math.cos(angle) * 3.85;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.72), m(0x625a52));
      merlon.position.set(bx, 19.35, bz);
      merlon.rotation.y = -angle;
      grp.add(merlon);
    }

    // ── Spire ─────────────────────────────────────────────────────────────
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.2, 5.5, 8), m(0x3c3a4a));
    spire.position.y = 20.65;
    spire.rotation.y = ROT;
    grp.add(spire);

    // ── Door arch on the south face (z+ direction) ────────────────────────
    //   Foundation south-face apothem ≈ 5.2 × cos(π/8) ≈ 4.8 world units
    const DZ   = 4.62;                                  // door face Z position
    const arcM = m(0x4c4438);
    const opnM = m(0x100e0c);
    const glwM = new THREE.MeshLambertMaterial({
      color: 0xffaa44, emissive: 0xffaa44, emissiveIntensity: 0.55,
    });

    // Left pillar
    const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 3.8, 6), arcM);
    pL.position.set(-0.92, 1.9, DZ);
    grp.add(pL);

    // Right pillar
    const pR = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.27, 3.8, 6), arcM);
    pR.position.set(0.92, 1.9, DZ);
    grp.add(pR);

    // Lintel
    const lin = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.44, 0.48), arcM);
    lin.position.set(0, 3.82, DZ);
    grp.add(lin);

    // Dark opening
    const opn = new THREE.Mesh(new THREE.BoxGeometry(1.76, 3.62, 0.1), opnM);
    opn.position.set(0, 1.81, DZ + 0.05);
    grp.add(opn);

    // Interior warm glow
    const glw = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), glwM);
    glw.position.set(0, 1.55, DZ - 1.4);
    grp.add(glw);

    return grp;
  }

  // ── Tree placement ─────────────────────────────────────────────────────────

  private _plantTrees(rand: () => number): void {
    const W  = GW * T;   // 102
    const H  = GH * T;   // 102
    const pts = poissonDisk(W, H, 5.5, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 5 || d > 44) continue;   // outside flat zone, inside grid edge

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      if (c < 0 || c >= GW || r < 0 || r >= GH) continue;

      const level = this._grid[r * GW + c];
      if (level < 1) continue;   // no trees on bog

      const tree = this._makeTree(rand);
      tree.position.set(wx, level * SH, wz);
      tree.rotation.y = rand() * Math.PI * 2;
      this._trees.push({ group: tree, px: wx, pz: wz });
    }
  }

  private _makeTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.2;
    const trunkR = 0.12 + rand() * 0.07;
    const coneR  = 0.85 + rand() * 0.55;
    const coneH  = 2.0 + rand() * 1.2;

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.72, trunkR, trunkH, 6),
      new THREE.MeshLambertMaterial({ color: 0x4a2810 }),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // Lower canopy cone
    const greenBase = 0x1a4610 + Math.floor(rand() * 6) * 0x010100;
    const coneL = new THREE.Mesh(
      new THREE.ConeGeometry(coneR, coneH, 6),
      new THREE.MeshLambertMaterial({ color: greenBase }),
    );
    coneL.position.y = trunkH + coneH * 0.48;
    g.add(coneL);

    // Upper canopy cone (smaller, slightly lighter)
    const coneU = new THREE.Mesh(
      new THREE.ConeGeometry(coneR * 0.65, coneH * 0.70, 6),
      new THREE.MeshLambertMaterial({ color: greenBase + 0x040800 }),
    );
    coneU.position.y = trunkH + coneH * 0.88;
    g.add(coneU);

    return g;
  }

  // ── Rock placement ─────────────────────────────────────────────────────────

  private _placeRocks(rand: () => number): void {
    const W  = GW * T;
    const H  = GH * T;
    const pts = poissonDisk(W, H, 8, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 6 || d > 46) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      if (c < 0 || c >= GW || r < 0 || r >= GH) continue;

      const level = this._grid[r * GW + c];
      const wy    = level * SH;
      const radius = 0.48 + rand() * 0.84;

      const grey  = 0x58 + Math.floor(rand() * 0x18);
      const color = (grey << 16) | (Math.floor(grey * 0.96) << 8) | Math.floor(grey * 0.88);
      const mesh  = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        new THREE.MeshLambertMaterial({ color }),
      );
      mesh.position.set(wx, wy + radius * 0.45, wz);
      mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      mesh.scale.set(1 + rand() * 0.4, 0.5 + rand() * 0.55, 0.9 + rand() * 0.3);

      this._rocks.push({ mesh, px: wx, py: wy + radius * 0.5, pz: wz, r: radius });
    }
  }

  // ── Enemy camps ────────────────────────────────────────────────────────────

  private _spawnCamps(rand: () => number): void {
    const W  = GW * T;
    const H  = GH * T;
    const pts = poissonDisk(W, H, 26, rand);
    let camps = 0;

    for (const [px, pz] of pts) {
      if (camps >= 5) break;
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < 28 || d > 44) continue;

      const count = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const angle  = rand() * Math.PI * 2;
        const spread = 2 + rand() * 3;
        const ex = wx + Math.cos(angle) * spread;
        const ez = wz + Math.sin(angle) * spread;

        const c = Math.floor(ex / T + GHW);
        const r = Math.floor(ez / T + GHH);
        const level = (c >= 0 && c < GW && r >= 0 && r < GH) ? this._grid[r * GW + c] : 0;

        this._enemies.push(new SlimeEnemy(
          new THREE.Vector3(ex, level * SH + 0.9, ez),
          this.physics,
          (dmg) => this.player.health.takeDamage(dmg),
        ));
      }
      camps++;
    }
  }

  // ── Ruined greenhouse structures ───────────────────────────────────────────

  private _addRuins(rand: () => number): void {
    const W  = GW * T;
    const H  = GH * T;
    const pts = poissonDisk(W, H, 45, rand);

    for (const [px, pz] of pts) {
      if (this.buildingEntrances.length >= 2) break;
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < 30 || d > 44) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const level = (c >= 0 && c < GW && r >= 0 && r < GH) ? this._grid[r * GW + c] : 0;
      const wy = level * SH;

      this._ruins.push(this._makeRuin(wx, wy, wz, rand));
      this.buildingEntrances.push({
        type:     'greenhouse',
        position: new THREE.Vector3(wx, wy, wz),
        label:    'Ruined Greenhouse',
      });
    }
  }

  private _makeRuin(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp     = new THREE.Group();
    grp.position.set(cx, cy, cz);   // all child positions are relative to this

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x504838 });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x383428 });
    const PILLARS  = 10;
    const RING_R   = 4.5;

    // Cracked stone floor disc
    const flr = new THREE.Mesh(
      new THREE.CylinderGeometry(RING_R + 0.28, RING_R + 0.28, 0.16, 16),
      floorMat,
    );
    flr.position.y = 0.08;
    grp.add(flr);

    // Broken pillars — random heights for a ruined look
    for (let i = 0; i < PILLARS; i++) {
      const angle = (i / PILLARS) * Math.PI * 2;
      const ph    = 1.4 + rand() * 2.8;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.20, 0.24, ph, 6),
        stoneMat,
      );
      pillar.position.set(Math.cos(angle) * RING_R, ph / 2, Math.sin(angle) * RING_R);
      pillar.rotation.y = rand() * 0.28 - 0.14;
      grp.add(pillar);
    }

    // Bioluminescent glow — cleared area becomes safe space eventually
    const glw = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshLambertMaterial({
        color:            0x44cc88,
        emissive:         0x44cc88,
        emissiveIntensity: 0.55,
      }),
    );
    glw.position.set(0, 0.48, 0);
    grp.add(glw);

    return grp;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  private _freeGroup(g: THREE.Group): void {
    for (const child of g.children) {
      const m = child as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach(mt => (mt as THREE.Material).dispose());
      } else if (m.material) {
        (m.material as THREE.Material).dispose();
      }
    }
  }
}
