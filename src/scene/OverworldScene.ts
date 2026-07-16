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
import { SlimeEnemy, createSlimeBodyIM } from '@/enemy/SlimeEnemy';
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
import { ProceduralSkybox }            from '@/rendering/ProceduralSkybox';
import { NPCEntity }                   from '@/world/NPCEntity';
import type { NPCRole }               from '@/world/NPCDnaGenerator';
import { eventsNear }                  from '@/world/WorldHistory';
import type { ResourceNodeRecord }      from '@/world/ResourceNodePlacer';
import { SpatialHash }                 from '@/core/SpatialHash';

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
  /** Phase 7h — spatial hash for O(1) hostile-enemy proximity lookups. */
  private readonly _hostileHash = new SpatialHash<SlimeEnemy>(8);
  /** Phase 7h.2 — one draw call for all slime bodies (128 slots; enemies never exceed that). */
  private readonly _slimeIM: THREE.InstancedMesh = createSlimeBodyIM(128);

  // ── Asset-upgraded geometry (added async after construction) ──────────────
  /** Ground-clutter props (grass, flowers, mushrooms) from nature-kit. */
  private _clutter:     THREE.Group[] = [];
  /** River tile GLBs replacing the procedural water mesh. */
  private _riverGroups: THREE.Group[] = [];
  /** GLB road-tile groups replacing the flat InstancedMesh roads. */
  private _roadTileGroups: THREE.Group[] = [];
  /** True while this scene's groups are live in the THREE.Scene. */
  private _isInScene = false;
  private _skybox: ProceduralSkybox | null = null;
  private _skyT    = 0;

  /** Cached for fast-travel — populated in _buildSettlements(). */
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3 }> = [];

  // ── Resource nodes (Phase 7e) ─────────────────────────────────────────────
  private _resourceGroups:  THREE.Group[] = [];
  private readonly _nodeRecords: ResourceNodeRecord[] = [];
  /** Remaining respawn time per node index (seconds). 0 = harvested and ready to respawn. */
  private _respawnTimers: number[] = [];
  /** Proxy radius in WU within which a node is considered "near". */
  private static readonly NODE_INTERACT_DIST = 4.5;

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
  /** Called when [E] is pressed on a merchant/innkeeper NPC. */
  onMerchant?: (name: string) => void;
  /** Called when a camp (by center position) is fully cleared. */
  onCampCleared?: (wx: number, wz: number) => void;
  /** Set of already-cleared camp keys ("wx:wz") — injected before enter(). */
  clearedCamps: Set<string> = new Set();

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
    this._buildResourceNodes(worldData.resourceNodes ?? []);
    this._minimap = new OWMinimap(worldData);
    this._minimap.hide(); // shown only while overworld is active
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Add geometry to scene and register physics colliders. */
  enter(): void {
    this._isInScene = true;
    this._minimap.show();
    if (!this._skybox) {
      this._skybox = new ProceduralSkybox(this.scene, 0x5a7c_f001);
    }
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
    this.scene.add(this._slimeIM);  // Phase 7h.2: single draw call for all bodies
    for (const dg of this._dungeonGroups) this.scene.add(dg);
    for (const bg of this._buildingGroups) this.scene.add(bg);
    for (const npc of this._npcs)         npc.addToScene(this.scene);
    for (const cl of this._clutter)       this.scene.add(cl);
    for (const rg of this._resourceGroups) this.scene.add(rg);
    // River tile groups supersede the procedural water mesh when present
    if (this._riverGroups.length > 0) {
      if (this._waterMesh) this._waterMesh.visible = false;
      for (const rg of this._riverGroups) this.scene.add(rg);
    }
    // GLB road tiles supersede the procedural InstancedMesh roads when present
    if (this._roadTileGroups.length > 0) {
      for (const rm of this._roadMeshes) rm.visible = false;
      for (const rg of this._roadTileGroups) this.scene.add(rg);
    }
  }

  /** Remove geometry from scene and destroy physics colliders. */
  exit(): void {
    this._isInScene = false;
    this._minimap.hide();
    this._skybox?.dispose();
    this._skybox = null;
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
    this.scene.remove(this._slimeIM);   // Phase 7h.2
    for (const dg of this._dungeonGroups) this.scene.remove(dg);
    for (const bg of this._buildingGroups) this.scene.remove(bg);
    for (const npc of this._npcs)          npc.removeFromScene(this.scene);
    for (const cl of this._clutter)        this.scene.remove(cl);
    for (const rg of this._riverGroups)    this.scene.remove(rg);
    for (const rg of this._roadTileGroups) this.scene.remove(rg);
    for (const rg of this._resourceGroups) this.scene.remove(rg);
    if (this._waterMesh) this._waterMesh.visible = true; // restore for next enter
    for (const rm of this._roadMeshes) rm.visible = true; // restore
  }

  /** Per-frame enemy AI tick. */
  update(dt: number, inputE = false, camera?: THREE.Camera): void {
    this._skyT += dt;
    if (this._skybox && camera) {
      this._skybox.update(this._skyT, camera);
    }
    const pos = this.player.group.position;
    const { col, row } = this._wg.worldToGrid(pos.x, pos.z);
    this._minimap.updatePlayer(col, row);

    // ── Phase 7h: rebuild hostile-enemy spatial hash once per frame ─────────
    this._hostileHash.clear();
    for (const en of this._enemies) {
      if (!en.isDead && !en.isRecruited) this._hostileHash.insert(en);
    }

    for (const en of this._enemies) {
      // Always call update even when dead so the death animation can run.
      // SlimeEnemy.update() handles state==='dead' by ticking _tickDeathAnim.
      if (en.isRecruited) {
        en.updateAsFollower(pos, this._hostileHash, dt);
      } else {
        en.update(pos, dt);
      }
    }
    for (const npc of this._npcs) npc.update(dt, pos, inputE);

    // Phase 7h.2: sync all slime body matrices/colours into the InstancedMesh
    this._syncSlimeIM();

    // Tick resource node respawn timers
    for (let i = 0; i < this._respawnTimers.length; i++) {
      if (this._respawnTimers[i]! > 0) {
        this._respawnTimers[i]! -= dt;
        if (this._respawnTimers[i]! <= 0) {
          this._respawnTimers[i] = 0;
          // Restore mesh visibility
          const grp = this._resourceGroups[i];
          if (grp) grp.visible = true;
        }
      }
    }
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
    (this._slimeIM.geometry as THREE.BufferGeometry).dispose();
    (this._slimeIM.material as THREE.Material).dispose();
    for (const dg of this._dungeonGroups) this._freeGroup(dg);
    for (const bg of this._buildingGroups) this._freeGroup(bg);
    for (const rm of this._roadMeshes) {
      rm.geometry.dispose();
      (rm.material as THREE.Material).dispose();
    }
    this._roadMeshes = [];
    for (const cl of this._clutter)       this._freeGroup(cl);
    this._clutter = [];
    for (const rg of this._riverGroups)   this._freeGroup(rg);
    for (const rg of this._roadTileGroups) this._freeGroup(rg);
    this._roadTileGroups = [];
    this._riverGroups = [];
    for (const rg of this._resourceGroups) this._freeGroup(rg);
    this._resourceGroups = [];
  }

  // ── Asset upgrade ─────────────────────────────────────────────────────────

  /**
   * Swap every procedural tree group's children for a real GLB model loaded
   * from the Kenney nature-kit.  Safe to call fire-and-forget: if any model
   * fails to load the procedural fallback geometry remains for that tree.
   * Physics colliders are keyed by world position and are NOT affected.
   */
  async upgradeTreesWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const TREE_MODELS = [
      '/assets/nature/tree_default.glb',
      '/assets/nature/tree_cone.glb',
      '/assets/nature/tree_blocks.glb',
      '/assets/nature/tree_detailed.glb',
    ];

    await loader.preload(TREE_MODELS);

    for (const tr of this._trees) {
      // Deterministic model selection from world position (no extra RNG needed)
      const hash  = Math.abs((Math.round(tr.px * 17) ^ Math.round(tr.pz * 31)));
      const idx   = hash % TREE_MODELS.length;
      const model = loader.getClone(TREE_MODELS[idx]);
      if (!model) continue;

      // Kenney nature-kit uses 1-unit tiles; our world tile is T=2 WU, and
      // the trees should be roughly 4–5 WU tall to match the procedural ones.
      model.scale.setScalar(3.0);

      // The group already has the correct world position + random Y rotation;
      // just replace the visual children, leaving transform intact.
      tr.group.clear();
      tr.group.add(model);
    }

    // Expose a flag the Playwright test layer can read
    (this.scene as any).__assetTreesLoaded = true;
  }

  // ── Phase 1.2 — Rock upgrade ────────────────────────────────────────────

  /**
   * Replace DodecahedronGeometry rocks with Kenney nature-kit rock GLBs.
   * Three size tiers mapped from procedural radius.
   */
  async upgradeRocksWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const SMALL  = [
      '/assets/nature/rock_smallA.glb', '/assets/nature/rock_smallB.glb',
      '/assets/nature/rock_smallC.glb', '/assets/nature/rock_smallD.glb',
      '/assets/nature/rock_smallE.glb', '/assets/nature/rock_smallF.glb',
    ];
    const LARGE  = [
      '/assets/nature/rock_largeA.glb', '/assets/nature/rock_largeB.glb',
      '/assets/nature/rock_largeC.glb', '/assets/nature/rock_largeD.glb',
      '/assets/nature/rock_largeE.glb', '/assets/nature/rock_largeF.glb',
    ];
    const TALL   = [
      '/assets/nature/rock_tallA.glb',  '/assets/nature/rock_tallB.glb',
      '/assets/nature/rock_tallC.glb',  '/assets/nature/rock_tallD.glb',
      '/assets/nature/rock_tallE.glb',  '/assets/nature/rock_tallF.glb',
    ];
    await loader.preload([...SMALL, ...LARGE, ...TALL]);

    for (const rk of this._rocks) {
      // Pick pool based on procedural radius
      const pool = rk.r < 0.7 ? SMALL : rk.r < 1.1 ? LARGE : TALL;
      const hash  = Math.abs((Math.round(rk.px * 13) ^ Math.round(rk.pz * 29)));
      const model = loader.getClone(pool[hash % pool.length]!);
      if (!model) continue;
      // Scale so the GLB rock matches the procedural rock's radius.
      // Kenney rocks are ~0.5 WU in their native 1-unit scale.
      model.scale.setScalar(rk.r * 2.0);
      // Preserve Y rotation from the original mesh for natural variation
      model.rotation.y = rk.mesh.rotation.y;
      // Blank the original geometry so the Mesh no longer draws its
      // DodecahedronGeometry self, while still acting as a positioned container.
      rk.mesh.geometry = new THREE.BufferGeometry();
      rk.mesh.clear();
      rk.mesh.add(model);
    }
    (this.scene as any).__assetRocksLoaded = true;
  }

  // ── Phase 1.3 — Ground clutter ──────────────────────────────────────────

  /**
   * Scatter nature-kit grass, flowers and mushrooms across the world.
   * Props are stored in `_clutter` and added to the scene immediately if
   * the scene is already active.
   */
  async addGroundClutter(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;

    const GRASS    = ['/assets/nature/grass.glb', '/assets/nature/grass_large.glb'];
    const FLOWERS  = [
      '/assets/nature/flower_redA.glb',    '/assets/nature/flower_purpleA.glb',
      '/assets/nature/flower_yellowA.glb',
    ];
    const MUSHROOM = ['/assets/nature/mushroom_red.glb', '/assets/nature/mushroom_tan.glb'];
    await loader.preload([...GRASS, ...FLOWERS, ...MUSHROOM]);

    const W  = GW * T;
    const H  = GH * T;
    // Poisson disk with generous spacing — we only want visual accents
    const rand = mulberry32(0xC1_07_7E_42);
    const pts  = poissonDisk(W, H, 6.5, rand);

    for (const [px, pz] of pts) {
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const c  = Math.floor(wx / T + GHW);
      const r  = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);

      if (cell.feature !== 'none')  continue; // don't clutter roads/rivers
      if (cell.content  !== 'empty') continue;
      if (cell.settlementId > 0)    continue;

      const lv = cell.elevation;
      const wy = lv * SH;

      // Choose prop type by biome + hash
      const hash = Math.abs((Math.round(wx * 11) ^ Math.round(wz * 23)));
      let path: string;
      if (cell.biome === 'forest' || lv >= 2) {
        path = lv >= 3
          ? MUSHROOM[hash % MUSHROOM.length]!
          : GRASS[hash % GRASS.length]!;
      } else if (lv === 1) {
        path = (hash % 3 === 0)
          ? FLOWERS[hash % FLOWERS.length]!
          : GRASS[hash % GRASS.length]!;
      } else {
        continue; // no clutter on bog/water tiles
      }

      const model = loader.getClone(path);
      if (!model) continue;
      model.scale.setScalar(1.4);
      model.rotation.y = (hash % 8) * Math.PI / 4;
      const grp = new THREE.Group();
      grp.position.set(wx, wy, wz);
      grp.add(model);
      this._clutter.push(grp);
    }

    if (this._isInScene) {
      for (const cl of this._clutter) this.scene.add(cl);
    }
    (this.scene as any).__assetClutterLoaded = true;
  }

  // ── Phase 1.4 — River tiles ─────────────────────────────────────────────

  /**
   * Replace the procedural semi-transparent water mesh with Kenney nature-kit
   * river tile GLBs.  Tile type is selected by looking at N/S/E/W river
   * neighbours (classic 4-bit auto-tiling).
   */
  async replaceWaterWithRiverTiles(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;

    const PATHS = [
      '/assets/nature/ground_riverStraight.glb',
      '/assets/nature/ground_riverBend.glb',
      '/assets/nature/ground_riverCorner.glb',
      '/assets/nature/ground_riverEnd.glb',
      '/assets/nature/ground_riverCross.glb',
      '/assets/nature/ground_riverSplit.glb',
      '/assets/nature/ground_riverTile.glb',
    ];
    await loader.preload(PATHS);

    const isRiver = (col: number, row: number) =>
      this._wg.get(col, row).feature === 'river';

    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (!isRiver(col, row)) continue;

        const n = isRiver(col, row - 1) ? 1 : 0;  // north (−Z)
        const s = isRiver(col, row + 1) ? 1 : 0;  // south (+Z)
        const e = isRiver(col + 1, row) ? 1 : 0;  // east  (+X)
        const w = isRiver(col - 1, row) ? 1 : 0;  // west  (−X)
        const count = n + s + e + w;

        // Pick GLB path and Y-rotation
        let path: string;
        let rotY = 0;

        if (count === 4) {
          path = '/assets/nature/ground_riverCross.glb';
        } else if (count === 3) {
          path = '/assets/nature/ground_riverSplit.glb';
          // Rotate so the "closed" side faces the missing neighbour
          if (!n) rotY = Math.PI;
          else if (!s) rotY = 0;
          else if (!e) rotY = Math.PI / 2;
          else         rotY = -Math.PI / 2;
        } else if (count === 2) {
          if ((n && s) || (e && w)) {
            path = '/assets/nature/ground_riverStraight.glb';
            rotY = (e && w) ? Math.PI / 2 : 0;
          } else {
            path = '/assets/nature/ground_riverBend.glb';
            // Bend: rotate so the open ends face the river neighbours
            if      (n && e) rotY = 0;
            else if (e && s) rotY = Math.PI / 2;
            else if (s && w) rotY = Math.PI;
            else             rotY = -Math.PI / 2;  // w && n
          }
        } else if (count === 1) {
          path = '/assets/nature/ground_riverEnd.glb';
          if      (s) rotY = 0;
          else if (e) rotY = Math.PI / 2;
          else if (n) rotY = Math.PI;
          else        rotY = -Math.PI / 2;
        } else {
          path = '/assets/nature/ground_riverTile.glb'; // isolated tile
        }

        const model = loader.getClone(path);
        if (!model) continue;

        // Kenney river tiles are 1-unit. Scale to fill our T=2 tile.
        model.scale.setScalar(T);
        model.rotation.y = rotY;

        const wx = (col - GHW) * T + T / 2;  // tile centre x
        const wz = (row - GHH) * T + T / 2;  // tile centre z
        const wy = this._wg.get(col, row).elevation * SH;

        const grp = new THREE.Group();
        grp.position.set(wx, wy, wz);
        grp.add(model);
        this._riverGroups.push(grp);
      }
    }

    // Activate in scene if already running
    if (this._isInScene) {
      if (this._waterMesh) this._waterMesh.visible = false;
      for (const rg of this._riverGroups) this.scene.add(rg);
    }
    (this.scene as any).__assetRiverLoaded = true;
  }

  // ── Phase 1.5 — Tower upgrade ───────────────────────────────────────────

  /**
   * Replace the procedural cylinder tower with stacked castle-kit modules
   * (tower-square-base → mid × 3 → top).  Physics collider unchanged.
   */
  async upgradeTowerWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const BASE   = '/assets/castle/tower-square-base.glb';
    const MID    = '/assets/castle/tower-square-mid.glb';
    const MID_W  = '/assets/castle/tower-square-mid-windows.glb';
    const MID_D  = '/assets/castle/tower-square-mid-door.glb';
    const TOP    = '/assets/castle/tower-square-top.glb';
    const ROOF   = '/assets/castle/tower-square-roof.glb';

    await loader.preload([BASE, MID, MID_W, MID_D, TOP, ROOF]);

    // Kenney castle tower modules are exactly 1 × 1.01 × 1 WU native.
    // Scale S = 2 fills a T=2 game tile footprint and gives ~2.02 WU per module.
    // The module origin sits at the BOTTOM face, so stacking interval = 1.01 × S.
    const S       = 2.0;
    const tileH   = 1.01 * S;  // ≈ 2.02 WU per module – correct stacking interval

    // Layer order bottom → top: base, door-mid, plain-mid, window-mid, plain-mid, top, roof
    const layers: Array<string> = [BASE, MID_D, MID, MID_W, MID, TOP, ROOF];
    const modules = layers.map(path => loader.getClone(path));
    if (modules.some(m => !m)) return;

    this._tower.clear();
    modules.forEach((m, i) => {
      m!.scale.setScalar(S);
      m!.position.set(0, i * tileH, 0);
      this._tower.add(m!);
    });
    (this.scene as any).__assetTowerLoaded = true;
  }

  // ── Phase 2 — Settlement decoration ────────────────────────────────────────

  /**
   * Scatter town-kit props (lanterns, fountains, stalls, hedges, banners,
   * carts) around each settlement using the settlement road-tile positions
   * stored in WorldGrid.  Props are added directly to the scene so they
   * appear immediately when `enter()` has already been called.
   *
   * Strategy: for every settlement, pull its road-edge tiles (tiles that
   * are adjacent to at least one non-road walkable tile) and place a random
   * prop there.  The fountain goes at the settlement centre tile.
   */
  async upgradeSettlementsWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
    worldData: import('@/world/WorldData').WorldData,
  ): Promise<void> {
    const { settlements } = worldData;
    if (!settlements || settlements.length === 0) return;

    const { _GHW: GHW, _GHH: GHH } = this;

    // Props to preload
    const LANTERN   = '/assets/town/lantern.glb';
    const FOUNTAIN  = '/assets/town/fountain-round.glb';
    const STALL_G   = '/assets/town/stall-green.glb';
    const STALL_R   = '/assets/town/stall-red.glb';
    const HEDGE     = '/assets/town/hedge.glb';
    const HEDGE_L   = '/assets/town/hedge-large.glb';
    const BANNER_G  = '/assets/town/banner-green.glb';
    const BANNER_R  = '/assets/town/banner-red.glb';
    const CART      = '/assets/town/cart.glb';
    const CART_H    = '/assets/town/cart-high.glb';
    const FENCE     = '/assets/town/fence.glb';

    await loader.preload([
      LANTERN, FOUNTAIN, STALL_G, STALL_R, HEDGE, HEDGE_L,
      BANNER_G, BANNER_R, CART, CART_H, FENCE,
    ]);

    const _decor: THREE.Group[] = [];

    const addProp = (path: string, wx: number, wy: number, wz: number, rotY = 0, s = 1.8) => {
      const m = loader.getClone(path);
      if (!m) return;
      m.scale.setScalar(s);
      m.rotation.y = rotY;
      const g = new THREE.Group();
      g.position.set(wx, wy, wz);
      g.add(m);
      _decor.push(g);
    };

    for (const entry of settlements) {
      const { plan } = entry;
      const { centerCol: cc, centerRow: cr } = plan;
      const centreElev = this._wg.get(cc, cr).elevation;
      const centreWy   = centreElev * SH;

      // ── Fountain at settlement centre ──────────────────────────────────
      const fwx = (cc - GHW) * T;
      const fwz = (cr - GHH) * T;
      addProp(FOUNTAIN, fwx, centreWy, fwz, 0, 2.0);

      // ── Lanterns at road-tile corners ──────────────────────────────────
      // Sample every 3rd road tile, put a lantern at alternating corners.
      const roads = plan.roads ?? [];
      let roadIdx = 0;
      const lanternInterval = Math.max(2, Math.floor(roads.length / 8));

      for (const r of roads) {
        roadIdx++;
        if (roadIdx % lanternInterval !== 0) continue;
        // Check if this road tile is on the settlement perimeter
        const n = this._wg.get(r.col, r.row - 1);
        const s2 = this._wg.get(r.col, r.row + 1);
        const e2 = this._wg.get(r.col + 1, r.row);
        const w2 = this._wg.get(r.col - 1, r.row);
        const isEdge = n.feature !== 'road' || s2.feature !== 'road' ||
                       e2.feature !== 'road' || w2.feature !== 'road';
        if (!isEdge) continue;

        const lx = (r.col - GHW) * T + T * 0.35;
        const lz = (r.row - GHH) * T + T * 0.35;
        const ly = centreElev * SH;
        const hash = Math.abs((r.col * 17) ^ (r.row * 31));
        addProp(LANTERN, lx, ly, lz, hash * 0.4, 1.6);
      }

      // ── Perimeter hedges/fences / stalls / carts ──────────────────────
      // Place stalls and carts near roads using a hash to pick type.
      let stallCount = 0;
      const maxStalls = plan.type === 'city' ? 6 : plan.type === 'town' ? 3 : 1;

      for (const r of roads) {
        if (stallCount >= maxStalls) break;
        const hash = Math.abs((r.col * 13) ^ (r.row * 7));
        if (hash % 6 !== 0) continue;   // sparse

        const rx = (r.col - GHW) * T + (((hash >> 2) % 3) - 1) * T * 0.3;
        const rz = (r.row - GHH) * T + (((hash >> 4) % 3) - 1) * T * 0.3;
        const ry = centreElev * SH;
        const rotY = (hash % 4) * (Math.PI / 2);

        if (hash % 3 === 0) {
          addProp(hash % 2 === 0 ? STALL_G : STALL_R, rx, ry, rz, rotY, 1.8);
        } else if (hash % 3 === 1) {
          addProp(hash % 2 === 0 ? CART : CART_H, rx, ry, rz, rotY, 1.8);
        } else {
          addProp(hash % 2 === 0 ? BANNER_G : BANNER_R, rx, ry, rz, rotY, 1.8);
        }
        stallCount++;
      }

      // ── Hedges along settlement perimeter ─────────────────────────────
      for (const r of roads) {
        const hash = Math.abs((r.col * 19) ^ (r.row * 23));
        if (hash % 10 !== 0) continue;  // ~10% of road-edge tiles

        const n2 = this._wg.get(r.col, r.row - 1);
        const isEdge2 = n2.feature !== 'road';
        if (!isEdge2) continue;

        const hx = (r.col - GHW) * T - T * 0.4;
        const hz = (r.row - GHH) * T - T * 0.4;
        const hy = centreElev * SH;
        addProp(hash % 2 === 0 ? HEDGE : HEDGE_L, hx, hy, hz, 0, 1.8);
      }
    }

    // Add to scene if active
    for (const g of _decor) {
      this._clutter.push(g);
      if (this._isInScene) this.scene.add(g);
    }
    (this.scene as any).__assetSettlementLoaded = true;
  }

  // ── Phase 2b — Modular building upgrade ────────────────────────────────────

  /**
   * Replace all procedural `generateBuilding()` groups with modular-kit
   * assemblies from the Kenney Retro Fantasy Kit (buildings/ pack).
   *
   * Strategy: clear the existing `_buildingGroups`, assemble fresh GLB-based
   * groups for every building in every settlement, and add them back to the
   * scene if it is currently active.
   */
  async upgradeBuildingsWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
    worldData: import('@/world/WorldData').WorldData,
  ): Promise<void> {
    const {
      assembleBuilding,
      BUILDING_PRELOAD_PATHS,
    } = await import('@/world/buildings/AssetBuildingAssembler');

    await loader.preload([...BUILDING_PRELOAD_PATHS]);

    const { settlements } = worldData;
    if (!settlements || settlements.length === 0) return;

    const { _GHW: GHW, _GHH: GHH } = this;

    // Remove old procedural building groups from scene and free GPU resources.
    if (this._isInScene) {
      for (const bg of this._buildingGroups) this.scene.remove(bg);
    }
    for (const bg of this._buildingGroups) this._freeGroup(bg);
    (this._buildingGroups as THREE.Group[]).length = 0;

    // Assemble new GLB buildings for each settlement's plan.
    for (const entry of settlements) {
      const { plan } = entry;

      for (const b of plan.buildings) {
        const wx = (b.col - GHW) * T;
        const wz = (b.row - GHH) * T;
        const lv = this._wg.get(b.col, b.row).elevation;
        const wy = lv * SH;

        const grp = assembleBuilding(loader, b.type, b.seed);
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;

        this._buildingGroups.push(grp);
        if (this._isInScene) this.scene.add(grp);
      }
    }

    (this.scene as any).__assetBuildingsLoaded = true;
  }

  // ── Phase 2c — Road tile upgrade ───────────────────────────────────────────

  /**
   * Replace the flat cobblestone InstancedMesh road tiles with proper Kenney
   * town-kit road GLBs (settlement interior) and nature-kit ground-path GLBs
   * (inter-settlement dirt roads).
   *
   * A 4-bit neighbour bitmask drives auto-tiling:
   *   bit 0 = North, bit 1 = South, bit 2 = East, bit 3 = West
   * Missing variants fall back to road.glb / ground_pathStraight.glb.
   */
  async upgradeRoadsWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
    worldData: import('@/world/WorldData').WorldData,
  ): Promise<void> {
    const ROAD        = '/assets/town/road.glb';
    const ROAD_CORNER = '/assets/town/road-corner.glb';
    const PATH        = '/assets/nature/ground_pathStraight.glb';
    const PATH_BEND   = '/assets/nature/ground_pathBend.glb';
    const PATH_CROSS  = '/assets/nature/ground_pathCross.glb';

    await loader.preload([ROAD, ROAD_CORNER, PATH, PATH_BEND, PATH_CROSS]);

    const { settlements, interRoads } = worldData;
    const { _GHW: GHW, _GHH: GHH } = this;

    // Build a fast lookup of which (col, row) cells are road tiles.
    const roadSet = new Set<string>();
    if (settlements) {
      for (const { plan } of settlements) {
        for (const r of plan.roads) roadSet.add(`${r.col},${r.row}`);
      }
    }
    const interSet = new Set<string>();
    for (const r of interRoads ?? []) interSet.add(`${r.col},${r.row}`);

    // ── Town road GLB tiles (settlement interiors) ──────────────────────
    const settlementRoadsSeen = new Set<string>();
    const roadGroups: THREE.Group[] = [];

    if (settlements) {
      for (const { plan } of settlements) {
        const centreElev = this._wg.get(plan.centerCol, plan.centerRow).elevation;
        const wy = centreElev * SH + 0.02;

        for (const r of plan.roads) {
          const key = `${r.col},${r.row}`;
          if (settlementRoadsSeen.has(key)) continue;
          settlementRoadsSeen.add(key);

          // 4-bit neighbour mask: N=1, S=2, E=4, W=8
          const n = roadSet.has(`${r.col},${r.row - 1}`) ? 1 : 0;
          const s = roadSet.has(`${r.col},${r.row + 1}`) ? 2 : 0;
          const e = roadSet.has(`${r.col + 1},${r.row}`) ? 4 : 0;
          const w = roadSet.has(`${r.col - 1},${r.row}`) ? 8 : 0;
          const mask = n | s | e | w;

          const wx = (r.col - GHW) * T;
          const wz = (r.row - GHH) * T;

          // Choose tile + rotation
          let path = ROAD;
          let rotY = 0;

          // Two adjacent perpendicular neighbours → corner
          if      (mask === (1 | 4))  { path = ROAD_CORNER; rotY = 0; }          // N+E
          else if (mask === (2 | 4))  { path = ROAD_CORNER; rotY =  Math.PI / 2; }  // S+E
          else if (mask === (2 | 8))  { path = ROAD_CORNER; rotY =  Math.PI; }    // S+W
          else if (mask === (1 | 8))  { path = ROAD_CORNER; rotY = -Math.PI / 2; }  // N+W
          // E–W straight (or single E/W)
          else if ((mask & (1 | 2)) === 0 && (mask & (4 | 8)) !== 0) {
            path = ROAD; rotY = Math.PI / 2;
          }
          // N–S straight (or single N/S) — default rotY=0

          const clone = loader.getClone(path);
          if (!clone) continue;
          clone.scale.setScalar(T);
          clone.rotation.y = rotY;
          const g = new THREE.Group();
          g.position.set(wx, wy, wz);
          g.add(clone);
          roadGroups.push(g);
        }
      }
    }

    // Ground-path GLB tiles (inter-settlement dirt roads)
    const pathSeen = new Set<string>();

    for (const r of interRoads ?? []) {
      const key = `${r.col},${r.row}`;
      if (pathSeen.has(key)) continue;
      pathSeen.add(key);

      const n = interSet.has(`${r.col},${r.row - 1}`) ? 1 : 0;
      const s = interSet.has(`${r.col},${r.row + 1}`) ? 2 : 0;
      const e = interSet.has(`${r.col + 1},${r.row}`) ? 4 : 0;
      const w = interSet.has(`${r.col - 1},${r.row}`) ? 8 : 0;
      const mask = n | s | e | w;

      const wx = (r.col - GHW) * T;
      const wz = (r.row - GHH) * T;
      const wy = this._wg.get(r.col, r.row).elevation * SH + 0.02;

      let path = PATH;
      let rotY = 0;

      // Bend (2 perpendicular neighbours)
      if      (mask === (1 | 4))  { path = PATH_BEND; rotY =  0; }
      else if (mask === (2 | 4))  { path = PATH_BEND; rotY =  Math.PI / 2; }
      else if (mask === (2 | 8))  { path = PATH_BEND; rotY =  Math.PI; }
      else if (mask === (1 | 8))  { path = PATH_BEND; rotY = -Math.PI / 2; }
      // 4-way cross
      else if (mask === 15)       { path = PATH_CROSS; rotY = 0; }
      // E–W straight
      else if ((mask & (1 | 2)) === 0 && (mask & (4 | 8)) !== 0) {
        path = PATH; rotY = Math.PI / 2;
      }

      const clone = loader.getClone(path);
      if (!clone) continue;
      clone.scale.setScalar(T);
      clone.rotation.y = rotY;
      const g = new THREE.Group();
      g.position.set(wx, wy, wz);
      g.add(clone);
      roadGroups.push(g);
    }

    // Hide old procedural road meshes; add new GLB groups.
    if (this._isInScene) {
      for (const rm of this._roadMeshes) rm.visible = false;
      for (const rg of roadGroups) this.scene.add(rg);
    }
    for (const rg of roadGroups) this._roadTileGroups.push(rg);

    (this.scene as any).__assetRoadsLoaded = true;
  }

  // ── Phase 3 — Dungeon entrance upgrade ─────────────────────────────────────

  /**
   * Replace the procedural dungeon entrance meshes with Kenney dungeon-kit
   * GLBs.  Each entrance gets a gate GLB with a matching rotY and the
   * procedural group's children are swapped out (the group itself stays, so
   * world-space position / physics trigger radius is unchanged).
   */
  async upgradeDungeonEntrancesWithAssets(
    loader: import('@/assets/AssetLoader').AssetLoader,
  ): Promise<void> {
    const GATE       = '/assets/dungeon/gate.glb';
    const GATE_DOOR  = '/assets/dungeon/gate-door.glb';
    const GATE_BARS  = '/assets/dungeon/gate-metal-bars.glb';
    const CORRIDOR_E = '/assets/dungeon/corridor-end.glb';
    const STAIRS     = '/assets/dungeon/stairs.glb';

    await loader.preload([GATE, GATE_DOOR, GATE_BARS, CORRIDOR_E, STAIRS]);

    // Cycle through entrance variants for variety
    const variants = [GATE, GATE_DOOR, GATE_BARS, CORRIDOR_E, STAIRS];

    for (let i = 0; i < this._dungeonGroups.length; i++) {
      const grp = this._dungeonGroups[i]!;
      const path = variants[i % variants.length]!;
      const model = loader.getClone(path);
      if (!model) continue;

      // Kenney dungeon tiles are ~4-unit squares at native scale.
      // Scale down to fit nicely at ground level (~2.5 WU wide).
      model.scale.setScalar(0.65);
      model.rotation.y = (i % 4) * (Math.PI / 2);

      grp.clear();
      grp.add(model);
    }
    (this.scene as any).__assetDungeonLoaded = true;
  }

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

  /** Returns the name of the nearest interactable NPC within `radius` world units, or null. */
  nearestNPC(pos: THREE.Vector3, radius = 2.8): string | null {
    const r2 = radius * radius;
    for (const npc of this._npcs) {
      const np = npc.group.position;
      const dx = pos.x - np.x;
      const dz = pos.z - np.z;
      if (dx * dx + dz * dz < r2) return npc.name;
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

  // ── Overworld Editor integration ──────────────────────────────────────────

  /**
   * Apply a layout exported from OverworldEditor.
   *
   * - `enemy_camp`        → spawn a SlimeEnemy cluster at the given position.
   * - `building_entrance` → register a BuildingEntrance (shows [E] prompt).
   * - `resource_node`     → add a harvestable resource node mesh + record.
   *
   * Safe to call multiple times; new items are appended.  Existing procedural
   * content is untouched (the editor layout is an overlay, not a replacement).
   *
   * If the scene is already active (`enter()` has been called) the new meshes
   * are added to the THREE.Scene immediately.
   */
  applyEditorLayout(layout: import('@/editor/OverworldEditor').OWLayout): void {
    for (const item of layout.items) {
      switch (item.kind) {
        case 'enemy_camp':
          this._spawnEditorCamp(item.wx, item.wz, item.count);
          break;
        case 'building_entrance':
          this.buildingEntrances.push({
            type:     'greenhouse',           // default type; extend OWLayout schema to add type later
            position: new THREE.Vector3(item.wx, 0, item.wz),
            label:    item.label,
          });
          break;
        case 'resource_node':
          this._addEditorResourceNode(item.wx, item.wz, item.type);
          break;
      }
    }
  }

  /** Spawn `count` SlimeEnemies in a loose ring around (wx, wz). */
  private _spawnEditorCamp(wx: number, wz: number, count: number): void {
    const rand = mulberry32(
      (Math.round(wx * 100) ^ Math.round(wz * 100)) >>> 0,
    );
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
      const r     = 2.5 + rand() * 2.0;
      const ex    = wx + Math.cos(angle) * r;
      const ez    = wz + Math.sin(angle) * r;
      const spawnPos = new THREE.Vector3(ex, 0.9, ez);
      const enemy = new SlimeEnemy(
        spawnPos,
        this.physics,
        (dmg) => this.player.health.takeDamage(dmg),
      );
      this._enemies.push(enemy);
      if (this._isInScene) this.scene.add(enemy.group);
    }
  }

  /** Add a single resource node at the given world position. */
  private _addEditorResourceNode(
    wx: number,
    wz: number,
    type: 'ore' | 'timber' | 'essence',
  ): void {
    const idx = this._nodeRecords.length;

    // Mesh — reuse the same geometry/colours as the procedural placer
    const grp = this._buildResourceNodeMesh(wx, wz, type);
    this._resourceGroups.push(grp);
    this._respawnTimers.push(0);

    const baseYield = type === 'ore' ? 2 : type === 'timber' ? 3 : 1;
    this._nodeRecords.push({ wx, wz, type, baseYield, index: idx });

    if (this._isInScene) this.scene.add(grp);
  }

  /**
   * Build the visual mesh for a resource node (mirrors the code in
   * `_buildResourceNodes` but for a single node).
   */
  private _buildResourceNodeMesh(
    wx: number,
    wz: number,
    type: 'ore' | 'timber' | 'essence',
  ): THREE.Group {
    const grp = new THREE.Group();
    grp.position.set(wx, 0, wz);

    if (type === 'ore') {
      const geo = new THREE.DodecahedronGeometry(0.55);
      const mat = new THREE.MeshLambertMaterial({ color: 0x7a6050 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.55;
      grp.add(mesh);
      // Crystal shard
      const sGeo = new THREE.OctahedronGeometry(0.22);
      const sMat = new THREE.MeshLambertMaterial({ color: 0xffa040, emissive: 0x804000 });
      const shard = new THREE.Mesh(sGeo, sMat);
      shard.position.set(0.2, 0.9, 0.1);
      shard.rotation.z = 0.4;
      grp.add(shard);
    } else if (type === 'timber') {
      const geo = new THREE.CylinderGeometry(0.22, 0.28, 1.2, 8);
      const mat = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.6;
      grp.add(mesh);
    } else {
      // essence
      const geo = new THREE.SphereGeometry(0.3, 8, 8);
      const mat = new THREE.MeshLambertMaterial({ color: 0x88eecc, emissive: 0x224433 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.8;
      grp.add(mesh);
    }
    return grp;
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

  // ── Phase 7h.2 — InstancedMesh sync ──────────────────────────────────────

  private _syncSlimeIM(): void {
    const im = this._slimeIM;
    const n  = this._enemies.length;
    im.count = n;   // only render the active slots; unused trailing slots stay zero-scale
    for (let i = 0; i < n; i++) {
      this._enemies[i]!.writeToIM(im, i);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
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
        if (this.onQuestGiven)  npc.onQuestGiven  = this.onQuestGiven;
        if (this.onMerchant)    npc.onOpenMerchant = this.onMerchant;
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

  // ── Resource nodes (Phase 7e) ─────────────────────────────────────────────

  private _buildResourceNodes(nodes: ResourceNodeRecord[]): void {
    for (const node of nodes) {
      const grp = this._makeNodeMesh(node);
      grp.position.set(node.wx, 0.12, node.wz);
      this._resourceGroups.push(grp);
      this._nodeRecords.push(node);
      this._respawnTimers.push(0);
    }
  }

  private _makeNodeMesh(node: ResourceNodeRecord): THREE.Group {
    const grp = new THREE.Group();
    if (node.type === 'ore') {
      // Grey/metallic pebble cluster — 4 small icosahedra
      const mat = new THREE.MeshStandardMaterial({
        color: 0x888899, roughness: 0.55, metalness: 0.6,
        emissive: 0x334455, emissiveIntensity: 0.12,
      });
      const sizes = [0.28, 0.22, 0.34, 0.18];
      const offsets = [[0,0],[0.35,0.1],[-0.28,0.14],[0.12,0.3]];
      for (let i = 0; i < 4; i++) {
        const geo = new THREE.IcosahedronGeometry(sizes[i]!, 0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(offsets[i]![0]!, sizes[i]! * 0.5, offsets[i]![1]!);
        m.rotation.set(Math.random(), Math.random(), Math.random());
        m.castShadow = true;
        grp.add(m);
      }
    } else if (node.type === 'timber') {
      // Felled log — horizontal cylinder with flat endcaps
      const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.9, metalness: 0.0 });
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x9b6843, roughness: 0.8, metalness: 0.0 });
      const logGeo = new THREE.CylinderGeometry(0.22, 0.25, 1.2, 10);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.24;
      log.castShadow = true;
      grp.add(log);
      // Ring cross-section end
      const ringGeo = new THREE.CircleGeometry(0.22, 10);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0.6, 0.24, 0);
      grp.add(ring);
    } else {
      // Essence blossom — glowing flower sphere cluster
      const mat = new THREE.MeshStandardMaterial({
        color: 0xcc77ff,
        emissive: 0x8833cc,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.1,
      });
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x447766, roughness: 0.8 });
      const positions = [[0,0],[0.3,0.1],[-0.25,0.2]];
      for (const [ox, oz] of positions) {
        const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.45, 5);
        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.set(ox!, 0.22, oz!);
        grp.add(stem);
        const blosGeo = new THREE.SphereGeometry(0.14, 7, 6);
        const blos = new THREE.Mesh(blosGeo, mat);
        blos.position.set(ox!, 0.48, oz!);
        grp.add(blos);
      }
    }
    return grp;
  }

  /**
   * Find the nearest harvestable resource node within interact range.
   * Returns null if no node is close enough or all nearby nodes are on
   * respawn cooldown (invisible).
   */
  nearResourceNode(pos: THREE.Vector3): { node: ResourceNodeRecord; index: number } | null {
    const D2 = OverworldScene.NODE_INTERACT_DIST * OverworldScene.NODE_INTERACT_DIST;
    let bestDist = D2 + 1;
    let best: { node: ResourceNodeRecord; index: number } | null = null;
    for (let i = 0; i < this._nodeRecords.length; i++) {
      if (!this._resourceGroups[i]!.visible) continue; // on cooldown
      const nr = this._nodeRecords[i]!;
      const dx = pos.x - nr.wx;
      const dz = pos.z - nr.wz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; best = { node: nr, index: i }; }
    }
    return best;
  }

  /**
   * Mark node as harvested: hide its mesh and start the 180s respawn timer.
   * Returns the node's `baseYield` so the caller can apply the Cunning
   * multiplier to get the final resource amount.
   */
  harvestNode(index: number): number {
    const grp = this._resourceGroups[index];
    if (!grp) return 0;
    grp.visible = false;
    this._respawnTimers[index] = 180;
    return this._nodeRecords[index]?.baseYield ?? 1;
  }
}

