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
import { poissonDisk } from '@/core/poissonDisk';
import RAPIER from '@dimforge/rapier3d-compat';
import type { WorldGrid }              from '@/world/WorldGrid';
import type { WorldData, DungeonEntry } from '@/world/WorldData';
import type { EntranceMeshKey }        from '@/world/DungeonType';
import { DUNGEON_TYPE_CONFIGS }         from '@/world/DungeonType';
import { generateBuilding }            from '@/world/buildings/BuildingGenerator';
import { cobblestoneTexture }          from '@/world/buildings/TextureFactory';
import { OWMinimap }                   from '@/ui/OWMinimap';
import { NPCEntity }                   from '@/world/NPCEntity';
import type { NPCRole }               from '@/world/NPCDnaGenerator';
import { eventsNear }                  from '@/world/WorldHistory';

// ── Fixed rendering constants (independent of world size) ─────────────────────

const T   = 2;                // tile side length in world units (= interior cell)
const SH  = 0.55;             // world-unit height increment per level

// ── Biome vertex colours [r, g, b] for height levels 0–4 ─────────────────────
//   Slightly darker at night-ish palette to match the dungeon interior mood.

const BIOME: readonly [number, number, number][] = [
  [0.20, 0.26, 0.11],   // 0  bog / muddy path
  [0.26, 0.44, 0.16],   // 1  grass
  [0.20, 0.36, 0.13],   // 2  forest floor
  [0.35, 0.41, 0.26],   // 3  highland
  [0.44, 0.41, 0.30],   // 4  rocky upland
];

const BIOME_RIVER: [number, number, number]       = [0.18, 0.38, 0.62]; // blue channel
const BIOME_WATER: [number, number, number]       = [0.14, 0.26, 0.48]; // deep water

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuildingType = 'greenhouse';

export interface BuildingEntrance {
  type:     BuildingType;
  position: THREE.Vector3;
  label:    string;
}

/** Lightweight handle returned by nearDungeonEntrance(). */
export interface DungeonEntranceHandle {
  entry:    DungeonEntry;
  position: THREE.Vector3;
}

// Internal storage entries (not exported)
interface TreeEntry { group: THREE.Group; px: number; pz: number; }
interface RockEntry { mesh: THREE.Mesh; px: number; py: number; pz: number; r: number; }

// ── OverworldScene ────────────────────────────────────────────────────────────

export class OverworldScene {
  // ── Visual geometry (built in constructor, never rebuilt)
  private readonly _terrain:   THREE.Mesh;
  private readonly _tower:     THREE.Group;
  private readonly _waterMesh: THREE.Mesh | null;
  private readonly _trees:     TreeEntry[] = [];
  private readonly _rocks:     RockEntry[] = [];
  private readonly _ruins:          THREE.Group[] = [];
  private readonly _enemies:        SlimeEnemy[]  = [];
  private readonly _dungeonGroups:  THREE.Group[] = [];
  private readonly _buildingGroups: THREE.Group[] = [];
  private _roadMeshes: THREE.Mesh[] = [];
  private _minimap!:   OWMinimap;
  private readonly _npcs: NPCEntity[] = [];

  /** Cached for fast-travel — populated in _buildSettlements(). */
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3 }> = [];

  readonly buildingEntrances:  BuildingEntrance[]   = [];
  readonly dungeonEntrances:   DungeonEntranceHandle[] = [];

  // ── Physics handles (created in enter(), cleared in exit())
  private _groundBody:   RAPIER.RigidBody | null = null;
  private _staticBodies: RAPIER.RigidBody[] = [];

  // ── World data (passed in; built by WorldGenerator externally)
  private readonly _wg:  WorldGrid;
  private readonly _GW:  number;
  private readonly _GH:  number;
  private readonly _GHW: number;
  private readonly _GHH: number;
  private readonly _FR:  number;   // flat-zone radius in tiles (~28% of half-width)

  /** Optional callback fired when an NPC generates and gives a quest to the player. */
  onQuestGiven?: (quest: import('@/world/QuestDef').QuestDef) => void;

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(
    private readonly scene:   THREE.Scene,
    private readonly physics: PhysicsWorld,
    private readonly player:  PlayerController,
    worldData: WorldData,
  ) {
    const { config, grid: worldGrid } = worldData;
    this._wg  = worldGrid;
    this._GW  = worldGrid.width;
    this._GH  = worldGrid.height;
    this._GHW = (worldGrid.width  - 1) / 2;
    this._GHH = (worldGrid.height - 1) / 2;
    this._FR  = Math.round(this._GHW * 0.28);

    const rand = mulberry32(config.seed ^ 0xA5_F0_3C_12);

    this._terrain   = this._buildTerrain();
    this._waterMesh = this._buildWaterMesh();
    this._tower     = this._buildTower();

    this._plantTrees(rand);
    this._placeRocks(rand);
    this._spawnCamps(rand, config.enemyCampCount);
    this._addRuins(rand);
    this._placeDungeonEntrances(worldData.dungeons, rand);
    this._buildSettlements(worldData);
    this._spawnSettlementNPCs(worldData);
    this._minimap = new OWMinimap(worldData);
    this._minimap.hide(); // shown only while overworld is active
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Add geometry to scene and register physics colliders. */
  enter(): void {
    this._minimap.show();
    // Flat base plane covers level-0 tiles and acts as the underfloor.
    this._groundBody = this.physics.createGroundPlane(0);
    // Heightfield collider mirrors the visual tile grid at SH-scaled heights.
    this._staticBodies.push(this._createTerrainCollider());

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
    if (this._waterMesh)  this.scene.add(this._waterMesh);
    for (const rm of this._roadMeshes) this.scene.add(rm);
    for (const tr of this._trees)        this.scene.add(tr.group);
    for (const rk of this._rocks)        this.scene.add(rk.mesh);
    for (const ru of this._ruins)        this.scene.add(ru);
    for (const en of this._enemies)      this.scene.add(en.group);
    for (const dg of this._dungeonGroups) this.scene.add(dg);
    for (const bg of this._buildingGroups) this.scene.add(bg);
    for (const npc of this._npcs)         npc.addToScene(this.scene);
  }

  /** Remove geometry from scene and destroy physics colliders. */
  exit(): void {
    this._minimap.hide();
    if (this._groundBody) {
      this.physics.rapierWorld.removeRigidBody(this._groundBody);
      this._groundBody = null;
    }
    for (const b of this._staticBodies) this.physics.rapierWorld.removeRigidBody(b);
    this._staticBodies = [];

    this.scene.remove(this._terrain, this._tower);
    if (this._waterMesh)  this.scene.remove(this._waterMesh);
    for (const rm of this._roadMeshes) this.scene.remove(rm);
    for (const tr of this._trees)        this.scene.remove(tr.group);
    for (const rk of this._rocks)        this.scene.remove(rk.mesh);
    for (const ru of this._ruins)        this.scene.remove(ru);
    for (const en of this._enemies)      this.scene.remove(en.group);
    for (const dg of this._dungeonGroups) this.scene.remove(dg);
    for (const bg of this._buildingGroups) this.scene.remove(bg);
    for (const npc of this._npcs)          npc.removeFromScene(this.scene);
  }

  /** Per-frame enemy AI tick. */
  update(dt: number, inputE = false): void {
    const pos = this.player.group.position;
    const { col, row } = this._wg.worldToGrid(pos.x, pos.z);
    this._minimap.updatePlayer(col, row);
    for (const en of this._enemies) {
      // Always call update even when dead so the death animation can run.
      // SlimeEnemy.update() handles state==='dead' by ticking _tickDeathAnim.
      if (en.isRecruited) {
        en.updateAsFollower(pos, this._enemies, dt);
      } else {
        en.update(pos, dt);
      }
    }
    for (const npc of this._npcs) npc.update(dt, pos, inputE);
  }

  /** Full teardown — disposes GPU resources. */
  dispose(): void {
    this._minimap.dispose();
    this.exit();
    (this._terrain.geometry as THREE.BufferGeometry).dispose();
    (this._terrain.material as THREE.Material).dispose();
    if (this._waterMesh) {
      this._waterMesh.geometry.dispose();
      (this._waterMesh.material as THREE.Material).dispose();
    }
    this._freeGroup(this._tower);
    for (const tr of this._trees) this._freeGroup(tr.group);
    for (const rk of this._rocks) {
      rk.mesh.geometry.dispose();
      (rk.mesh.material as THREE.Material).dispose();
    }
    for (const ru of this._ruins)        this._freeGroup(ru);
    for (const en of this._enemies)       en.dispose(this.physics);
    for (const npc of this._npcs)          npc.dispose();
    for (const dg of this._dungeonGroups) this._freeGroup(dg);
    for (const bg of this._buildingGroups) this._freeGroup(bg);
    for (const rm of this._roadMeshes) {
      rm.geometry.dispose();
      (rm.material as THREE.Material).dispose();
    }
    this._roadMeshes = [];
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

  /** Returns the nearest dungeon entrance if the player is within trigger range. */
  nearDungeonEntrance(pos: THREE.Vector3): DungeonEntranceHandle | null {
    const TRIGGER_R2 = 5.0 * 5.0;
    for (const d of this.dungeonEntrances) {
      const dx = pos.x - d.position.x;
      const dz = pos.z - d.position.z;
      if (dx * dx + dz * dz < TRIGGER_R2) return d;
    }
    return null;
  }

  getActiveEnemies(): SlimeEnemy[] { return this._enemies; }

  /** Returns all settlements with their world-space position for fast travel. */
  getSettlementPositions(): Array<{ name: string; worldPos: { x: number; y: number; z: number } }> {
    return this._settlementPositions.map(s => ({
      name:     s.name,
      worldPos: { x: s.worldPos.x, y: s.worldPos.y, z: s.worldPos.z },
    }));
  }

  /** Convert a world-space (x, z) position to the nearest grid (col, row). */
  worldToGrid(x: number, z: number): { col: number; row: number } {
    return {
      col: Math.round(x / T + this._GHW),
      row: Math.round(z / T + this._GHH),
    };
  }

  // ── Private builders ──────────────────────────────────────────────────────

  /**
   * Build a Rapier heightfield collider that mirrors the visual tile grid.
   *
   * Rapier heightfield convention (column-major):
   *   heights[gridRow * GW + gridCol] = elevation * SH
   *   nrows = GW − 1  (X direction, tile columns)
   *   ncols = GH − 1  (Z direction, tile rows)
   *   scale = { x: (GW−1)*T, y: 1.0, z: (GH−1)*T }
   *
   * World-space vertex positions produced:
   *   x = −(GW−1)*T/2 + gridCol*T = (gridCol − GHW)*T  ✓
   *   z = −(GH−1)*T/2 + gridRow*T = (gridRow − GHH)*T  ✓
   */
  private _createTerrainCollider(): RAPIER.RigidBody {
    const { _GW: GW, _GH: GH } = this;
    const heights = new Float32Array(GW * GH);

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        heights[row * GW + col] = this._wg.get(col, row).elevation * SH;
      }
    }

    const body = this.physics.rapierWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed(),
    );
    this.physics.rapierWorld.createCollider(
      RAPIER.ColliderDesc.heightfield(
        GW - 1, GH - 1, heights,
        new RAPIER.Vector3((GW - 1) * T, 1.0, (GH - 1) * T),
      ),
      body,
    );
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
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const pos: number[] = [];
    const nrm: number[] = [];
    const clr: number[] = [];
    const idx: number[] = [];

    /** Height level of a (possibly out-of-bounds) tile. */
    const lvl = (c: number, r: number): number =>
      this._wg.get(c, r).elevation;

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

        // Biome/feature-aware colour selection
        const cell = this._wg.get(col, row);
        let biomeRgb: [number, number, number];
        if (cell.biome === 'water') {
          biomeRgb = BIOME_WATER;
        } else if (cell.feature === 'river') {
          biomeRgb = BIOME_RIVER;
        } else if (cell.feature === 'river_bank') {
          const b = BIOME[H];
          biomeRgb = [b[0] * 0.88, b[1] * 0.80, b[2] * 0.68];
        } else {
          biomeRgb = BIOME[H];
        }
        const [rb, gb, bb] = biomeRgb;
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

  /**
   * Build a single semi-transparent water mesh for all river / water-biome tiles.
   * Each qualifying tile gets a flat quad placed at `elevation × SH + 0.05`
   * (just above the terrain top face).  All quads are merged into one
   * BufferGeometry → one draw call, `depthWrite:false` prevents z-fighting.
   */
  private _buildWaterMesh(): THREE.Mesh | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const pos: number[] = [];
    const idx: number[] = [];

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const cell = this._wg.get(col, row);
        if (cell.feature !== 'river' && cell.biome !== 'water') continue;

        const wx  = (col - GHW) * T;
        const wz  = (row - GHH) * T;
        const wy  = cell.elevation * SH + 0.05;

        const base = pos.length / 3;
        pos.push(
          wx,     wy, wz,
          wx + T, wy, wz,
          wx + T, wy, wz + T,
          wx,     wy, wz + T,
        );
        idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
      }
    }

    if (pos.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    return new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        color:      0x3a6aaa,
        transparent: true,
        opacity:     0.78,
        depthWrite:  false,
      }),
    );
  }

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
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const W  = GW * T;
    const H  = GH * T;
    const treeInner = FR * T + 5;
    const treeOuter = GHW * T * 0.88;
    const pts = poissonDisk(W, H, 5.5, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < treeInner || d > treeOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);

      const cell = this._wg.get(c, r);
      if (cell.elevation < 1)           continue;   // no trees on bog/water
      if (cell.feature === 'road')      continue;   // no trees on roads
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;   // no trees on buildings/entrances
      if (cell.settlementId > 0)        continue;   // no trees inside settlement zones
      const level = cell.elevation;

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
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const W  = GW * T;
    const H  = GH * T;
    const rockInner = FR * T + 6;
    const rockOuter = GHW * T * 0.92;
    const pts = poissonDisk(W, H, 8, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < rockInner || d > rockOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);

      const cell = this._wg.get(c, r);
      if (cell.feature === 'road')      continue;   // no rocks on roads
      if (cell.feature === 'road_dirt') continue;
      if (cell.content  !== 'empty')    continue;   // no rocks on buildings
      if (cell.settlementId > 0)        continue;   // no rocks inside settlement zones
      const level  = cell.elevation;
      const wy     = level * SH;
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

  private _spawnCamps(rand: () => number, campCount: number): void {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const W  = GW * T;
    const H  = GH * T;
    // Scale camp ring proportionally to world half-extent.
    const campInner   = GHW * T * 0.56;
    const campOuter   = GHW * T * 0.88;
    const campSpacing = Math.max(26, Math.round(GW * T * 0.255));
    const pts = poissonDisk(W, H, campSpacing, rand);
    let camps = 0;

    for (const [px, pz] of pts) {
      if (camps >= campCount) break;
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < campInner || d > campOuter) continue;

      const count = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i++) {
        const angle  = rand() * Math.PI * 2;
        const spread = 2 + rand() * 3;
        const ex = wx + Math.cos(angle) * spread;
        const ez = wz + Math.sin(angle) * spread;

        const c = Math.floor(ex / T + GHW);
        const r = Math.floor(ez / T + GHH);
        const level = this._wg.get(c, r).elevation;

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
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const W  = GW * T;
    const H  = GH * T;
    const ruinInner   = GHW * T * 0.60;
    const ruinOuter   = GHW * T * 0.88;
    const ruinSpacing = Math.max(45, Math.round(GW * T * 0.441));
    const pts = poissonDisk(W, H, ruinSpacing, rand);

    for (const [px, pz] of pts) {
      if (this.buildingEntrances.length >= 2) break;
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < ruinInner || d > ruinOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const level = this._wg.get(c, r).elevation;
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

  // ── Dungeon entrances ─────────────────────────────────────────────────────

  private _placeDungeonEntrances(dungeons: DungeonEntry[], rand: () => number): void {
    const { _GHW: GHW, _GHH: GHH } = this;

    for (const entry of dungeons) {
      const wx  = (entry.col - GHW) * T;
      const wz  = (entry.row - GHH) * T;
      const lv  = this._wg.get(entry.col, entry.row).elevation;
      const wy  = lv * SH;

      const meshKey = DUNGEON_TYPE_CONFIGS[entry.type].entranceMeshKey;
      const grp = this._buildEntranceMesh(meshKey, wx, wy, wz, rand);
      this._dungeonGroups.push(grp);
      this.dungeonEntrances.push({
        entry,
        position: new THREE.Vector3(wx, wy, wz),
      });
    }
  }

  private _buildEntranceMesh(
    key:  EntranceMeshKey,
    wx:   number,
    wy:   number,
    wz:   number,
    rand: () => number,
  ): THREE.Group {
    switch (key) {
      case 'crypt_door':   return this._makeCryptDoor(wx, wy, wz, rand);
      case 'ruin_pillars': return this._makeRuinPillars(wx, wy, wz, rand);
      case 'mine_shaft':   return this._makeMineShaft(wx, wy, wz, rand);
      case 'book_portal':  return this._makeBookPortal(wx, wy, wz, rand);
      case 'cave_arch':
      default:             return this._makeCaveArch(wx, wy, wz, rand);
    }
  }

  /** Two rough boulders flanking a dark arch opening. */
  private _makeCaveArch(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp = new THREE.Group();
    grp.position.set(cx, cy, cz);
    const stone = new THREE.MeshLambertMaterial({ color: 0x4a4540 });

    for (const side of [-1, 1]) {
      const h    = 1.2 + rand() * 0.6;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.7 + rand() * 0.3, 0),
        stone,
      );
      rock.position.set(side * 1.1, h * 0.5, 0);
      rock.scale.set(0.9, h, 0.85 + rand() * 0.25);
      rock.rotation.y = rand() * Math.PI;
      grp.add(rock);
    }

    // Arch cap
    const cap = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ color: 0x39332e }),
    );
    cap.position.set(0, 1.9, 0);
    cap.scale.set(1.6, 0.45, 0.7);
    grp.add(cap);

    // Debris pebbles at the base
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.14 + rand() * 0.1, 0),
        stone,
      );
      p.position.set((rand() - 0.5) * 2.4, 0.1, (rand() - 0.5) * 1.6);
      p.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      grp.add(p);
    }

    return grp;
  }

  /** Heavy stone-slab door frame. */
  private _makeCryptDoor(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp  = new THREE.Group();
    grp.position.set(cx, cy, cz);
    const slab = new THREE.MeshLambertMaterial({ color: 0x5a5248 });

    // Two frame posts
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 2.4, 0.38),
        slab,
      );
      post.position.set(side * 0.9, 1.2, 0);
      post.rotation.z = side * 0.05;
      grp.add(post);
    }
    // Lintel
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.32, 0.40),
      slab,
    );
    lintel.position.set(0, 2.4, 0);
    grp.add(lintel);

    // Slightly leaning door slab
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.2, 0.20),
      new THREE.MeshLambertMaterial({ color: 0x3a322c }),
    );
    door.position.set(0, 1.1, 0.05);
    door.rotation.y = 0.12 + rand() * 0.08;
    grp.add(door);

    return grp;
  }

  /** Ring of 3 broken columns at varying heights. */
  private _makeRuinPillars(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp  = new THREE.Group();
    grp.position.set(cx, cy, cz);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x524840 });

    const COUNT = 3;
    const R     = 1.4;
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + rand() * 0.4;
      const h     = 0.9 + rand() * 1.8;
      const col   = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, h, 6),
        stoneMat,
      );
      col.position.set(Math.cos(angle) * R, h / 2, Math.sin(angle) * R);
      col.rotation.z = (rand() - 0.5) * 0.22;
      grp.add(col);

      // Rubble at base
      for (let j = 0; j < 2; j++) {
        const peb = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.13 + rand() * 0.09, 0),
          stoneMat,
        );
        peb.position.set(
          Math.cos(angle) * (R + (rand() - 0.5) * 0.9),
          0.1,
          Math.sin(angle) * (R + (rand() - 0.5) * 0.9),
        );
        peb.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
        grp.add(peb);
      }
    }
    return grp;
  }

  /** Wooden A-frame mine entrance. */
  private _makeMineShaft(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp  = new THREE.Group();
    grp.position.set(cx, cy, cz);
    const wood = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });

    // Two angled support posts forming an A
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 2.2, 5),
        wood,
      );
      post.position.set(side * 0.7, 1.1, 0);
      post.rotation.z = side * 0.22;
      grp.add(post);
    }
    // Crossbeam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5),
      wood,
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 1.65, 0);
    grp.add(beam);

    // Dark opening (square frame inset)
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.6, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x1a1008 }),
    );
    opening.position.set(0, 0.8, 0.06);
    grp.add(opening);

    // Plank floor
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.0 + rand() * 0.4, 0.08, 0.18),
      wood,
    );
    plank.position.set((rand() - 0.5) * 0.5, 0.04, 0.4 + rand() * 0.4);
    plank.rotation.y = (rand() - 0.5) * 0.5;
    grp.add(plank);

    return grp;
  }

  /** Magical floating-book portal (reuses greenhouse glow aesthetic). */
  private _makeBookPortal(
    cx: number, cy: number, cz: number,
    rand: () => number,
  ): THREE.Group {
    const grp = new THREE.Group();
    grp.position.set(cx, cy, cz);

    // Open book — two planes angled like an open book
    const bookMat = new THREE.MeshLambertMaterial({
      color:            0xd4a855,
      emissive:         0x7a5020,
      emissiveIntensity: 0.3,
      side:             THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 1.1),
        bookMat,
      );
      page.rotation.y = side * 0.35;
      page.position.set(side * 0.38, 1.5, 0);
      grp.add(page);
    }

    // Central glow orb
    const glowMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshLambertMaterial({
        color:            0x88aaff,
        emissive:         0x4466ff,
        emissiveIntensity: 0.85,
      }),
    );
    glowMesh.position.set(0, 1.5, 0);
    grp.add(glowMesh);

    // Floating sparkle particles (tiny spheres)
    const sparkMat = new THREE.MeshLambertMaterial({
      color:            0xaaccff,
      emissive:         0x6688ee,
      emissiveIntensity: 0.6,
    });
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), sparkMat);
      sp.position.set(
        (rand() - 0.5) * 1.2,
        0.8 + rand() * 1.4,
        (rand() - 0.5) * 0.8,
      );
      grp.add(sp);
    }

    return grp;
  }

  // ── Settlements ────────────────────────────────────────────────────────────

  private _buildSettlements(worldData: WorldData): void {
    const { settlements } = worldData;
    if (!settlements || settlements.length === 0) return;

    const { _GHW: GHW, _GHH: GHH } = this;

    // Cache world-space positions for fast travel
    for (const entry of settlements) {
      const { plan } = entry;
      const wx = (plan.centerCol - GHW) * T;
      const wz = (plan.centerRow - GHH) * T;
      const wy = this._wg.get(plan.centerCol, plan.centerRow).elevation * SH + 2.0;
      this._settlementPositions.push({
        name:     plan.name,
        worldPos: new THREE.Vector3(wx, wy, wz),
      });
    }

    // ── Settlement interior road tiles — flat instanced planes ────────────
    // PlaneGeometry laid flat removes box-side seams; 8% oversizing fills gaps.
    const sqTex  = cobblestoneTexture(2, 2);
    const sqMat  = new THREE.MeshLambertMaterial({ map: sqTex, color: 0xb09878 });
    const sqGeo  = new THREE.PlaneGeometry(T * 1.08, T * 1.08);
    sqGeo.rotateX(-Math.PI / 2); // lie flat

    const sqPositions: THREE.Vector3[] = [];
    const sqSeen = new Set<string>();

    for (const entry of settlements) {
      const { plan } = entry;

      // Place building THREE.Groups
      for (const b of plan.buildings) {
        const wx = (b.col - GHW) * T;
        const wz = (b.row - GHH) * T;
        const lv = this._wg.get(b.col, b.row).elevation;
        const wy = lv * SH;
        const grp = generateBuilding(b.type, b.seed);
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        this._buildingGroups.push(grp);
      }

      // Collect settlement road tiles — all at centre elevation for a flat pavement
      const centreElev = this._wg.get(plan.centerCol, plan.centerRow).elevation;
      for (const r of plan.roads) {
        const k = `${r.col},${r.row}`;
        if (sqSeen.has(k)) continue;
        sqSeen.add(k);
        const wx = (r.col - GHW) * T;
        const wz = (r.row - GHH) * T;
        sqPositions.push(new THREE.Vector3(wx, centreElev * SH + 0.02, wz));
      }
    }

    if (sqPositions.length > 0) {
      const im = new THREE.InstancedMesh(sqGeo, sqMat, sqPositions.length);
      im.frustumCulled = false;
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < sqPositions.length; i++) {
        const p = sqPositions[i]!;
        mtx.makeTranslation(p.x, p.y, p.z);
        im.setMatrixAt(i, mtx);
      }
      im.instanceMatrix.needsUpdate = true;
      this._roadMeshes.push(im);
    }
    sqGeo.dispose();

    // ── Inter-settlement roads — axis-aligned flat dirt tile planes ──────
    const interRoads = worldData.interRoads ?? [];
    if (interRoads.length > 0) {
      const dirtGeo = new THREE.PlaneGeometry(T * 1.15, T * 1.15);
      dirtGeo.rotateX(-Math.PI / 2);
      const dirtMat  = new THREE.MeshLambertMaterial({ color: 0x7d5e3c });
      const dirtPos: THREE.Vector3[] = [];
      const dirtSeen = new Set<string>();

      for (const r of interRoads) {
        const k = `${r.col},${r.row}`;
        if (dirtSeen.has(k)) continue;
        dirtSeen.add(k);
        const wx = (r.col - GHW) * T;
        const wz = (r.row - GHH) * T;
        const wy = this._wg.get(r.col, r.row).elevation * SH + 0.01;
        dirtPos.push(new THREE.Vector3(wx, wy, wz));
      }

      if (dirtPos.length > 0) {
        const im2 = new THREE.InstancedMesh(dirtGeo, dirtMat, dirtPos.length);
        im2.frustumCulled = false;
        const mtx2 = new THREE.Matrix4();
        for (let i = 0; i < dirtPos.length; i++) {
          const p = dirtPos[i]!;
          mtx2.makeTranslation(p.x, p.y, p.z);
          im2.setMatrixAt(i, mtx2);
        }
        im2.instanceMatrix.needsUpdate = true;
        this._roadMeshes.push(im2);
      }
      dirtGeo.dispose();
    }
  }

  // ── NPC spawning ──────────────────────────────────────────────────────────

  private _spawnSettlementNPCs(worldData: WorldData): void {
    const { settlements, dungeons, history } = worldData;
    if (!settlements || settlements.length === 0) return;

    const { _GHW: GHW, _GHH: GHH } = this;
    const histEvents = history?.events ?? [];

    // Role distributions per settlement type
    const VILLAGE_ROLES: NPCRole[] = ['citizen','citizen','citizen','merchant','guard'];
    const TOWN_ROLES:    NPCRole[] = ['citizen','citizen','merchant','merchant','guard','guard','innkeeper','blacksmith'];
    const CITY_ROLES:    NPCRole[] = ['citizen','citizen','merchant','merchant','guard','guard','innkeeper','blacksmith','scholar'];

    for (const entry of settlements) {
      const { plan, seed } = entry;
      const { centerCol: cc, centerRow: cr } = plan;
      const wx0 = (cc - GHW) * T;
      const wz0 = (cr - GHH) * T;
      const lv  = this._wg.get(cc, cr).elevation;

      const roleList = plan.type === 'city' ? CITY_ROLES
                     : plan.type === 'town' ? TOWN_ROLES
                     :                         VILLAGE_ROLES;

      // Find nearest dungeon + direction
      let nearDungeonName: string | undefined;
      let nearDungeonDir:  'north' | 'south' | 'east' | 'west' | undefined;
      let bestDist2 = Infinity;
      for (const d of dungeons) {
        const dc = d.col - cc, dr = d.row - cr;
        const d2 = dc * dc + dr * dr;
        if (d2 < bestDist2) {
          bestDist2      = d2;
          nearDungeonName = d.name;
          nearDungeonDir  = Math.abs(dr) > Math.abs(dc)
            ? (dr < 0 ? 'north' : 'south')
            : (dc < 0 ? 'west'  : 'east');
        }
      }

      // Find nearest river + direction
      let nearRiverDir: 'north' | 'south' | 'east' | 'west' | undefined;
      const RIVER_SCAN = 20;
      outerRiver:
      for (let dist = 1; dist <= RIVER_SCAN; dist++) {
        for (let d = -dist; d <= dist; d++) {
          for (const [dc, dr] of [[d,-dist],[d,dist],[-dist,d],[dist,d]] as [number,number][]) {
            const c2 = cc + dc, r2 = cr + dr;
            const cell = this._wg.get(c2, r2);
            if (cell.feature === 'river' || cell.biome === 'water') {
              nearRiverDir = Math.abs(dr) > Math.abs(dc)
                ? (dr < 0 ? 'north' : 'south')
                : (dc < 0 ? 'west'  : 'east');
              break outerRiver;
            }
          }
        }
      }

      // Nearby history events (60-tile radius)
      const nearby = eventsNear(histEvents, cc, cr, 60);

      // Spawn NPCs scattered around the settlement centre
      const rand = mulberry32(seed ^ 0x4E_50_43_00);
      const npcCount = Math.min(roleList.length, plan.population > 0 ? Math.min(roleList.length, plan.population) : roleList.length);

      for (let i = 0; i < npcCount; i++) {
        const role   = roleList[i]!;
        const angle  = (i / npcCount) * Math.PI * 2 + rand() * 0.5;
        const radius = 2 + rand() * 6;
        const npcWx  = wx0 + Math.cos(angle) * radius;
        const npcWz  = wz0 + Math.sin(angle) * radius;
        const npcCol = Math.round(npcWx / T + GHW);
        const npcRow = Math.round(npcWz / T + GHH);

        this._npcs.push(new NPCEntity(
          npcCol, npcRow,
          npcWx, npcWz,
          role,
          entry,
          nearby,
          nearDungeonName,
          nearDungeonDir,
          nearRiverDir,
          dungeons,
        ));
        const npc = this._npcs[this._npcs.length - 1]!;
        if (this.onQuestGiven) npc.onQuestGiven = this.onQuestGiven;
        // Raise to terrain height (settlement zone is flattened to lv)
        this._npcs[this._npcs.length - 1]!.group.position.y = lv * SH;
      }
    }
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
