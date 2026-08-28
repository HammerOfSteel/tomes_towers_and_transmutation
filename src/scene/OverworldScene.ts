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
import type { WorldData, DungeonEntry, CaveEntry, GladeEntry } from '@/world/WorldData';
import type { EntranceMeshKey }        from '@/world/DungeonType';
import { DUNGEON_TYPE_CONFIGS }         from '@/world/DungeonType';
import { buildBuilding }               from '@/world/buildings/BuildingBuilder';
import { createSettlementBuildingDna, settlementTypeToFaction } from '@/world/buildings/BuildingTypeMap';
import { closestDistanceToBuildingFootprint } from '@/world/buildings/BuildingCollision';
import { createWaterMaterial }          from '@/world/WaterMaterial';
import {
  factionBuildingDna,
  getFootprint,
  FLOOR_HEIGHT,
  type BuildingDNA,
  type Faction,
} from '@/world/buildings/BuildingDNA';
import { cobblestoneTexture }          from '@/world/buildings/TextureFactory';
import { WARD_TO_KIND, WARD_TO_SIZE, WARD_TO_FLOORS } from '@/buildingToDungeonPlan';
import {
  OVERWORLD_SETTLEMENT_PREVIEW_KEY,
  type OverworldSettlementPreviewPayload,
} from '@/overworld-studio/SettlementPreviewPayload';
import { OWMinimap }                   from '@/ui/OWMinimap';
import { ProceduralSkybox }            from '@/rendering/ProceduralSkybox';
import { NPCEntity }                   from '@/world/NPCEntity';
import type { NPCRole }               from '@/world/NPCDnaGenerator';
import { eventsNear }                  from '@/world/WorldHistory';
import type { ResourceNodeRecord }      from '@/world/ResourceNodePlacer';
import { selectLampRoadTiles } from '@/world/LampPlacement';
import { SpatialHash }                 from '@/core/SpatialHash';
import { buildCaveEntrance, isNearCaveEntrance, type BuiltCaveEntrance } from '@/world/CaveEntranceBuilder';
import { buildGladeEntrance, isNearGladeEntrance, type BuiltGladeEntrance } from '@/world/GladeEntranceBuilder';
import { buildTerrainGeometryData } from '@/world/TerrainGeometryBuilder';
import { pickTreeArchetype, pickRockArchetype } from '@/world/NatureAssetDNA';
import { makeMottledCanvasTexture } from '@/world/NatureAssetBuilder';
import { getWaterInfoAt } from '@/world/WaterDetection';
import { ChunkManager, CHUNK_SIZE, type ChunkCoord } from '@/world/ChunkManager';
import { LEVEL_HEIGHT, OCEAN_DEEP_DEPTH_WU } from '@/world/WaterDepthConfig';
import { SWIM_ENTER_DEPTH_THRESHOLD, SWIM_EXIT_DEPTH_THRESHOLD } from '@/player/PlayerController';
import { isScatterAllowed } from '@/world/ScatterRules';
import { mergeGroupMeshesByMaterial } from './MeshMergeUtils';

// ── Fixed rendering constants (independent of world size) ─────────────────────

const T   = 2;                // tile side length in world units (= interior cell)
// Shares the single depth-carving source of truth with TerrainGeometryBuilder
// and WaterDetection.getWaterInfoAt() (see WaterDepthConfig.ts) — keeping the
// name `SH` since it's used pervasively below, but it must always equal
// LEVEL_HEIGHT or the terrain mesh/collider and the swim water query would
// silently disagree about tile heights.
const SH  = LEVEL_HEIGHT;      // world-unit height increment per level

/**
 * Task 13 final review (Important issue #4) — caps how many NEW chunks
 * `_chunkManager` is allowed to actually load (geometry + Rapier trimesh +
 * Poisson scatter + tree/rock colliders) within a single scene `update()`
 * tick. Crossing one chunk boundary can bring a full edge (up to
 * `2*LOAD_RADIUS_CHUNKS+1 = 7`) of newly-in-range chunks at once, and a
 * diagonal crossing a full corner (up to 13) — building all of them
 * synchronously in one frame is a guaranteed visible hitch. Extra
 * newly-in-range chunks are queued by `ChunkManager` and drained a few at a
 * time across subsequent frames (see `ChunkManager.flushPendingLoads()` for
 * the escape hatch used at scene-entry/spawn time, where the world must not
 * appear empty for the first frame).
 */
const MAX_CHUNK_LOADS_PER_FRAME = 2;


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

/** Lightweight handle returned by nearCaveEntrance() (CG-1/CG-3 renderer wiring). */
export interface CaveEntranceHandle {
  entry:    CaveEntry;
  position: THREE.Vector3;
}

/** Lightweight handle returned by nearGladeEntrance() (CG-2/CG-3 renderer wiring). */
export interface GladeEntranceHandle {
  entry:    GladeEntry;
  position: THREE.Vector3;
}

// ── OverworldScene ────────────────────────────────────────────────────────────

/**
 * Payload tracked per streamed terrain chunk (Task 13 final review): terrain
 * mesh + its Rapier trimesh body, this chunk's tree/rock/bush/beach-decor
 * scatter group, and (Important issue #1 fix) the tree/rock static rigid
 * bodies for THIS chunk's scatter — created in `_loadTerrainChunk()`
 * alongside the scatter itself and torn down in `_unloadTerrainChunk()`,
 * instead of only ever being created once for whatever chunks happened to
 * be loaded at the very first `enter()`.
 */
interface TerrainChunkData {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  scatter: THREE.Group;
  colliders: RAPIER.RigidBody[];
}

export class OverworldScene {
  // ── Visual geometry (built in constructor, never rebuilt)
  /** Streams terrain mesh+collider per-chunk around the player (RI-4 wiring) —
   *  superseded the old whole-grid `_terrain` mesh + `_createTerrainCollider()`. */
  private _chunkManager!: ChunkManager<TerrainChunkData>;
  /**
   * Mirrors whatever's currently tracked inside `_chunkManager` (keyed by
   * "cx,cz") purely so `enter()`/`exit()` can cheaply toggle terrain
   * visibility + collision without unloading/rebuilding it. `ChunkManager`
   * itself exposes no accessor for its internal payload map, only
   * load/unload callbacks — so this side map is populated in
   * `_loadTerrainChunk()` and cleared in `_unloadTerrainChunk()`.
   * Needed because dungeon/tower interior rooms are built at/near the same
   * world-origin coordinates as the overworld (see `SceneManager`'s "most
   * rooms are centred at origin" convention) — without hiding terrain on
   * `exit()`, its mesh would render through interior geometry and its
   * Rapier trimesh would still collide with the player underfoot.
   * `scatter` (Task 11) is each chunk's tree/rock group, toggled alongside
   * `mesh`/`body` the same way.
   */
  private readonly _terrainChunkData = new Map<string, TerrainChunkData>();
  /**
   * Task 13 final review (Important issue #3) — small, fixed-size pool of
   * shared `MeshLambertMaterial`s (each with its own baked
   * `CanvasTexture`, where applicable) per nature-prop archetype ("kind"),
   * keyed by kind. Built lazily on first use and cached for this
   * `OverworldScene` instance's whole lifetime (not per-chunk), so every
   * chunk's tree/rock/bush/beach-decor scatter reuses the same handful of
   * materials/textures instead of allocating a brand new one per placed
   * instance — see `_pooledMaterial()`. Disposed once, in `dispose()`.
   */
  private readonly _materialPools = new Map<string, THREE.MeshLambertMaterial[]>();
  private readonly _tower:     THREE.Group;
  private readonly _waterMesh: THREE.Mesh | null;
  /** Shared shader material driving the animated water surface (null when no water tiles exist). */
  private readonly _waterMaterial: THREE.ShaderMaterial | null;
  private readonly _ruins:          THREE.Group[] = [];
  private readonly _enemies:        SlimeEnemy[]  = [];
  private readonly _dungeonGroups:  THREE.Group[] = [];
  /** CG-1/CG-2 — built entrance props (Three.js group + dispose + optional particle update). */
  private readonly _caveEntranceBuilts:  BuiltCaveEntrance[]  = [];
  private readonly _gladeEntranceBuilts: BuiltGladeEntrance[] = [];
  private readonly _buildingGroups: THREE.Group[] = [];
  /** DNA + world-space position + faction per placed building — used for building-entry proximity
   *  and to derive a matching interior style via buildingToDungeonPlan(). */
  private readonly _buildingData: Array<{ dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number }> = [];
  /** Collider specs for every registered building — persists across exit()/enter() cycles so
   *  colliders can be rebuilt each time the overworld scene is re-entered (exit() destroys all
   *  rigid bodies in `_staticBodies`, including buildings', so they must be recreated on enter()). */
  private readonly _buildingColliderSpecs: Array<{ dna: BuildingDNA; pos: THREE.Vector3; rotationY: number }> = [];
  private _roadMeshes: THREE.Mesh[] = [];
  /** Settlement lamp-post props (post + lantern mesh) — decorative, no collider. */
  private _lampGroups: THREE.Group[] = [];
  /** Parallel array to _lampGroups — each lamp's point light, for per-frame intensity updates. */
  private _lampLights: THREE.PointLight[] = [];
  private _minimap!:   OWMinimap;
  private readonly _npcs: NPCEntity[] = [];
  /** Phase 7h — spatial hash for O(1) hostile-enemy proximity lookups. */
  private readonly _hostileHash = new SpatialHash<SlimeEnemy>(8);
  /** Phase 7h.2 — one draw call for all slime bodies (128 slots; enemies never exceed that). */
  private readonly _slimeIM: THREE.InstancedMesh = createSlimeBodyIM(128);

  // ── Asset-upgraded geometry (added async after construction) ──────────────
  /** River tile GLBs replacing the procedural water mesh. */
  private _riverGroups: THREE.Group[] = [];
  /** GLB road-tile groups replacing the flat InstancedMesh roads. */
  private _roadTileGroups: THREE.Group[] = [];
  /** True while this scene's groups are live in the THREE.Scene. */
  private _isInScene = false;
  private _skybox: ProceduralSkybox | null = null;
  private _skyT    = 0;
  /** Hysteresis state for the live river/lake swim transition — mirrors
   *  WaterLabScene.ts's `_playerIsSwimming` pattern so entering/exiting real
   *  swim mode doesn't flicker at the depth boundary (see
   *  SWIM_ENTER_DEPTH_THRESHOLD/SWIM_EXIT_DEPTH_THRESHOLD in
   *  PlayerController.ts). */
  private _playerIsSwimming = false;


  /** Cached for fast-travel — populated in _buildSettlements(). */
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3; radius: number }> = [];
  /** SI-4: which settlement (index into _settlementPositions) the player was inside last frame, or -1. */
  private _settlementInsideIdx = -1;

  // ── Resource nodes (Phase 7e) ─────────────────────────────────────────────
  private _resourceGroups:  THREE.Group[] = [];
  private readonly _nodeRecords: ResourceNodeRecord[] = [];
  /** Remaining respawn time per node index (seconds). 0 = harvested and ready to respawn. */
  private _respawnTimers: number[] = [];
  /** Proxy radius in WU within which a node is considered "near". */
  private static readonly NODE_INTERACT_DIST = 4.5;

  readonly buildingEntrances:  BuildingEntrance[]   = [];
  readonly dungeonEntrances:   DungeonEntranceHandle[] = [];
  /** CG-3 renderer wiring — placed cave/glade entrances the player can approach. */
  readonly caveEntrances:  CaveEntranceHandle[]  = [];
  readonly gladeEntrances: GladeEntranceHandle[] = [];

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
  /** World-gen seed (Task 11) — seeds each chunk's `_buildChunkScatter()` deterministically
   *  alongside its chunk coordinate, so scatter is stable across reloads/re-streaming. */
  private readonly _seed: number;

  /** Optional callback fired when an NPC generates and gives a quest to the player. */
  onQuestGiven?: (quest: import('@/world/QuestDef').QuestDef) => void;
  /** Called when [E] is pressed on a merchant/innkeeper NPC. */
  onMerchant?: (name: string) => void;
  /** Called when a camp (by center position) is fully cleared. */
  onCampCleared?: (wx: number, wz: number) => void;
  /** Set of already-cleared camp keys ("wx:wz") — injected before enter(). */
  clearedCamps: Set<string> = new Set();
  /**
   * E1: Active player species — set from main.ts after character creation.
   * Controls which species-specific encounter NPCs spawn near the tower.
   */
  characterSpecies: string | null = null;

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
    this._seed = config.seed;

    const rand = mulberry32(config.seed ^ 0xA5_F0_3C_12);

    console.log('[OverworldScene] setting up terrain ChunkManager...');
    this._chunkManager = new ChunkManager<TerrainChunkData>(
      {
        load: (coord) => this._loadTerrainChunk(coord),
        unload: (coord, data) => this._unloadTerrainChunk(coord, data),
      },
      {
        tileSize: T,
        chunkSize: CHUNK_SIZE,
        // Task 13 final review (Important issue #4) — budget real chunk
        // loads per-frame; see `MAX_CHUNK_LOADS_PER_FRAME`'s doc comment.
        maxLoadsPerUpdate: MAX_CHUNK_LOADS_PER_FRAME,
      },
    );
    // Force an initial load centered on the player's starting position so
    // the world isn't empty for the first frame — `flushPendingLoads()`
    // ignores the per-frame budget above so every chunk within load radius
    // of spawn is actually ready synchronously, not merely queued.
    this._chunkManager.update(this.player.group.position.x, this.player.group.position.z);
    this._chunkManager.flushPendingLoads();
    console.log('[OverworldScene] _buildWaterMesh...');
    this._waterMesh     = this._buildWaterMesh();
    this._waterMaterial = (this._waterMesh?.material as THREE.ShaderMaterial | undefined) ?? null;
    console.log('[OverworldScene] _buildTower...');
    this._tower     = this._buildTower();
    // Tree/rock scatter (Task 11) AND bush/beach-decor ground clutter (Task
    // 13 final review, Important issue #3) are no longer built here for the
    // whole world up front — they all stream in per-chunk via
    // `_buildChunkScatter()`, called from `_loadTerrainChunk()` above
    // (superseded `_plantTrees()`/`_placeRocks()`/`_plantBushes()`/
    // `_scatterBeachDecor()`'s whole-world passes).
    console.log('[OverworldScene] _spawnCamps...');
    this._spawnCamps(rand, config.enemyCampCount);
    console.log('[OverworldScene] _addRuins...');
    this._addRuins(rand);
    console.log('[OverworldScene] _placeDungeonEntrances...');
    this._placeDungeonEntrances(worldData.dungeons, rand);
    console.log('[OverworldScene] _placeCaveGladeEntrances...');
    this._placeCaveGladeEntrances(worldData.caves ?? [], worldData.glades ?? []);
    console.log('[OverworldScene] _buildSettlements...');
    this._buildSettlements(worldData);
    console.log('[OverworldScene] _spawnSettlementNPCs...');
    this._spawnSettlementNPCs(worldData);
    console.log('[OverworldScene] _buildResourceNodes...');
    this._buildResourceNodes(worldData.resourceNodes ?? []);
    console.log('[OverworldScene] minimap...');
    this._minimap = new OWMinimap(worldData);
    this._minimap.hide();
    console.log('[OverworldScene] constructor DONE ✓');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Add geometry to scene and register physics colliders. */
  enter(): void {
    this._isInScene = true;
    this._minimap.show();
    if (!this._skybox) {
      this._skybox = new ProceduralSkybox(this.scene, 0x5a7c_f001);
    }
    // Underfloor safety net — catches the player if they ever fall through
    // a gap in the terrain trimesh. Must sit BELOW the deepest possible
    // carved water floor (physicalHeightWU() can reach roughly
    // -OCEAN_DEEP_DEPTH_WU for a deep-ocean tile at elevation 0), or this
    // "safety" plane silently becomes the real collision floor for every
    // carved water tile and swim mode can never trigger (see design spec
    // section A — this was the actual root cause of "the sea is too
    // shallow to swim in"). -5 WU of margin below the deepest carve is
    // comfortably clear of any real terrain.
    this._groundBody = this.physics.createGroundPlane(-(OCEAN_DEEP_DEPTH_WU + 5));
    // Terrain mesh/collider/scatter are streamed per-chunk by `_chunkManager`
    // (see `update()`), not created here — but any chunks that were hidden by
    // a previous exit() (or loaded before the first-ever enter(), from the
    // constructor's forced initial load) need to be shown/re-enabled now.
    // Tree/rock colliders (Task 11, Important issue #1 fix) are likewise
    // created once per chunk in `_loadTerrainChunk()` (not re-created here —
    // that used to double-create colliders for whatever chunks were already
    // loaded at scene-entry time) and just need re-enabling here, mirroring
    // the terrain trimesh body's own `setEnabled(true)` below.
    for (const { mesh, body, scatter, colliders } of this._terrainChunkData.values()) {
      this.scene.add(mesh);
      body?.setEnabled(true);
      this.scene.add(scatter);
      for (const c of colliders) c.setEnabled(true);
    }

    // Tower: treat as a tall capsule for the whole body (avoids cylinder API diff between Rapier versions)
    this._addStaticBody(0, 10, 0, RAPIER.ColliderDesc.capsule(9.0, 4.5));

    // Building colliders — must be recreated every enter() since exit() clears all
    // _staticBodies (buildings are placed once at construction time but their physics
    // bodies get destroyed on every scene exit).
    this._createBuildingColliders();

    // Add visuals
    this.scene.add(this._tower);
    if (this._waterMesh)  this.scene.add(this._waterMesh);
    for (const rm of this._roadMeshes) this.scene.add(rm);
    for (const ru of this._ruins)        this.scene.add(ru);
    for (const en of this._enemies)      this.scene.add(en.group);
    this.scene.add(this._slimeIM);  // Phase 7h.2: single draw call for all bodies
    for (const dg of this._dungeonGroups) this.scene.add(dg);
    for (const cb of this._caveEntranceBuilts)  this.scene.add(cb.root);
    for (const gb of this._gladeEntranceBuilts) this.scene.add(gb.root);
    for (const bg of this._buildingGroups) this.scene.add(bg);
    for (const npc of this._npcs)         npc.addToScene(this.scene);
    for (const lg of this._lampGroups)    this.scene.add(lg);
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

    // E1: Spawn species-specific NPC encounters near the tower door
    this._spawnSpeciesEncounters();
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

    this.scene.remove(this._tower);
    // Hide + disable (not unload) currently-streamed terrain chunks. They
    // stay tracked in `_terrainChunkData`/`_chunkManager` so a later
    // `enter()` (including a bare `enter()` with no scene.update() in
    // between, e.g. telescope remote-view mode) can cheaply restore them
    // without waiting for a chunk-streaming update() tick.
    for (const { mesh, body, scatter, colliders } of this._terrainChunkData.values()) {
      this.scene.remove(mesh);
      body?.setEnabled(false);
      this.scene.remove(scatter);
      for (const c of colliders) c.setEnabled(false);
    }
    if (this._waterMesh)  this.scene.remove(this._waterMesh);
    for (const rm of this._roadMeshes) this.scene.remove(rm);
    for (const ru of this._ruins)        this.scene.remove(ru);
    for (const en of this._enemies)      this.scene.remove(en.group);
    this.scene.remove(this._slimeIM);   // Phase 7h.2
    for (const dg of this._dungeonGroups) this.scene.remove(dg);
    for (const cb of this._caveEntranceBuilts)  this.scene.remove(cb.root);
    for (const gb of this._gladeEntranceBuilts) this.scene.remove(gb.root);
    for (const bg of this._buildingGroups) this.scene.remove(bg);
    for (const npc of this._npcs)          npc.removeFromScene(this.scene);
    for (const lg of this._lampGroups)     this.scene.remove(lg);
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
    if (this._waterMaterial) this._waterMaterial.uniforms.uTime.value += dt;
    const pos = this.player.group.position;
    const { col, row } = this._wg.worldToGrid(pos.x, pos.z);
    this._minimap.updatePlayer(col, row);

    // RI-4: stream terrain chunks in/out around the player.
    this._chunkManager.update(pos.x, pos.z);

    // RI-3: real per-tile swim collision for live overworld rivers/ocean
    // water, reusing the same hysteresis + setSwimming()/setSubmersion()
    // machinery proven in WaterLabScene.ts (see PlayerController.ts's
    // SWIM_ENTER_DEPTH_THRESHOLD/SWIM_EXIT_DEPTH_THRESHOLD doc comments for
    // why a single threshold isn't used). river_ford tiles report no water
    // info (waterDepth 0) so crossing one always reads as dry.
    const waterInfo = getWaterInfoAt(this._wg, pos.x, pos.z);
    if (waterInfo === null) {
      this._playerIsSwimming = false;
      this.player.setSubmersion(0);
      this.player.setSwimming(false);
    } else {
      const depthBelowSurface = waterInfo.surfaceY - pos.y;
      if (!this._playerIsSwimming && depthBelowSurface >= SWIM_ENTER_DEPTH_THRESHOLD) {
        this._playerIsSwimming = true;
      } else if (this._playerIsSwimming && depthBelowSurface < SWIM_EXIT_DEPTH_THRESHOLD) {
        this._playerIsSwimming = false;
      }

      if (this._playerIsSwimming) {
        this.player.setSubmersion(-0.6);
        this.player.setSwimming(true, waterInfo.surfaceY, waterInfo.floorY);
      } else if (depthBelowSurface > 0) {
        this.player.setSubmersion(0.4);
        this.player.setSwimming(false);
      } else {
        this.player.setSubmersion(0);
        this.player.setSwimming(false);
      }
    }

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

    // CG-2 — drift the glade entrance ambient particles.
    for (const gb of this._gladeEntranceBuilts) gb.update(dt);

    // A5: update tower window lights + portcullis gate
    const hour = (this as any)._timeHour ?? 12;   // set by DayNightSystem if wired
    this.updateTowerDetails(hour, pos);
    // Phase 4: update settlement lamp-post lights (same hour value, same day/night rhythm)
    this.updateNightLighting(hour);

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
    // RI-4: unload every currently-streamed terrain chunk — disposes each
    // chunk's mesh geometry/material, scatter (Task 11) tree/rock
    // geometries/materials, and removes its Rapier body, mirroring what the
    // old whole-grid `_terrain`/`_createTerrainCollider()` teardown (plus the
    // old whole-world `_plantTrees()`/`_placeRocks()` disposal) used to do.
    this._chunkManager.dispose();
    if (this._waterMesh) {
      this._waterMesh.geometry.dispose();
      (this._waterMesh.material as THREE.Material).dispose();
    }
    this._freeGroup(this._tower);
    for (const ru of this._ruins)        this._freeGroup(ru);
    for (const en of this._enemies)       en.dispose(this.physics);
    for (const npc of this._npcs)          npc.dispose();
    (this._slimeIM.geometry as THREE.BufferGeometry).dispose();
    (this._slimeIM.material as THREE.Material).dispose();
    for (const dg of this._dungeonGroups) this._freeGroup(dg);
    for (const cb of this._caveEntranceBuilts)  cb.dispose();
    for (const gb of this._gladeEntranceBuilts) gb.dispose();
    for (const bg of this._buildingGroups) this._freeGroup(bg);
    for (const rm of this._roadMeshes) {
      rm.geometry.dispose();
      (rm.material as THREE.Material).dispose();
    }
    this._roadMeshes = [];
    for (const lg of this._lampGroups) {
      lg.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    }
    this._lampGroups = [];
    this._lampLights = [];
    for (const rg of this._riverGroups)   this._freeGroup(rg);
    for (const rg of this._roadTileGroups) this._freeGroup(rg);
    this._roadTileGroups = [];
    this._riverGroups = [];
    for (const rg of this._resourceGroups) this._freeGroup(rg);
    this._resourceGroups = [];
    // Task 13 final review (Important issue #3) — dispose the shared
    // material/texture pools used by every chunk's tree/rock/bush/beach-decor
    // scatter (see `_pooledMaterial()`). Individual chunk unloads
    // (`_unloadTerrainChunk()`) deliberately do NOT dispose these — they're
    // shared across every currently-loaded chunk — so this is the one place
    // they're actually freed, when the whole scene is torn down.
    for (const pool of this._materialPools.values()) {
      for (const mat of pool) {
        (mat.map as THREE.Texture | null)?.dispose();
        mat.dispose();
      }
    }
    this._materialPools.clear();
  }


  /** True when the player is close enough to the tower door to press E.
   *  Radius 6.5 — larger than the tower capsule (4.5) + player radius (0.35),
   *  so the prompt fires as the player approaches the door, not after clipping in. */
  nearTowerEntrance(pos: THREE.Vector3): boolean {
    return pos.x * pos.x + pos.z * pos.z < 6.5 * 6.5;
  }

  /** Number of active static physics bodies (tower, buildings — terrain
   *  chunk mesh colliders AND tree/rock scatter colliders are tracked
   *  separately per chunk by `_chunkManager`/`_terrainChunkData`, not in
   *  `_staticBodies` — see Task 13 final review, Important issue #1).
   *  Used by tests to verify building colliders survive exit()/enter() cycles. */
  getStaticBodyCount(): number {
    return this._staticBodies.length;
  }

  /** Number of registered building collider specs (persists across exit()/enter(), unlike
   *  the physics bodies themselves). Used by tests. */
  getBuildingColliderSpecCount(): number {
    return this._buildingColliderSpecs.length;
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

  /** Returns the nearest cave entrance if the player is within trigger range (CG-1/CG-3). */
  nearCaveEntrance(pos: THREE.Vector3): CaveEntranceHandle | null {
    for (const c of this.caveEntrances) {
      if (isNearCaveEntrance({ x: pos.x, z: pos.z }, { x: c.position.x, z: c.position.z })) return c;
    }
    return null;
  }

  /** Returns the nearest glade entrance if the player is within trigger range (CG-2/CG-3). */
  nearGladeEntrance(pos: THREE.Vector3): GladeEntranceHandle | null {
    for (const g of this.gladeEntrances) {
      if (isNearGladeEntrance({ x: pos.x, z: pos.z }, { x: g.position.x, z: g.position.z })) return g;
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

  /** First river/water-tile world position found by scanning the grid (or null).
   *  For tests/dev-tooling only — used to locate a water tile deterministically
   *  for visual verification without hardcoding seed-dependent coordinates. */
  findFirstWaterTile(): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const centerCol = Math.round(GHW);
    const centerRow = Math.round(GHH);
    const settlements = this._settlementPositions;
    // Scan outward from the map center (spawn area) so we land on a genuine
    // river/lake tile rather than a default-initialized edge cell. Skip
    // candidates too close to a settlement or the tower's entrance courtyard
    // (both can visually override a river cell's ground look even though the
    // grid flag remains set underneath).
    const maxRadius = Math.max(GW, GH);
    for (let r = 0; r < maxRadius; r++) {
      for (let dRow = -r; dRow <= r; dRow++) {
        for (let dCol = -r; dCol <= r; dCol++) {
          if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== r) continue; // ring only
          const col = centerCol + dCol;
          const row = centerRow + dRow;
          if (col < 0 || col >= GW || row < 0 || row >= GH) continue;
          const cell = this._wg.get(col, row);
          if (cell.feature !== 'river' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;
          const wx = (col - GHW) * T;
          const wz = (row - GHH) * T;
          if (Math.sqrt(wx * wx + wz * wz) < 60) continue; // too close to tower courtyard
          const tooClose = settlements.some(s => {
            const dx = s.worldPos.x - wx, dz = s.worldPos.z - wz;
            return Math.sqrt(dx * dx + dz * dz) < 80;
          });
          if (tooClose) continue;
          return { x: wx, z: wz };
        }
      }
    }
    return null;
  }

  /** First river_ford-tile world position found by scanning the grid (or
   *  null if the generated world has no road-crossing fords). Mirrors
   *  `findFirstWaterTile()` — for tests/dev-tooling verification that fords
   *  stay walkable (no swim trigger) even though they sit on a river path. */
  findFirstFordTile(): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).feature !== 'river_ford') continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }

  /** Debug/dev-tooling only: water-mesh vertex count + visibility (for verification scripts). */
  getWaterMeshDebugInfo(): { exists: boolean; visible: boolean; vertexCount: number; inScene: boolean } {
    if (!this._waterMesh) return { exists: false, visible: false, vertexCount: 0, inScene: false };
    const posAttr = this._waterMesh.geometry.getAttribute('position');
    return {
      exists: true,
      visible: this._waterMesh.visible,
      vertexCount: posAttr ? posAttr.count : 0,
      inScene: this.scene.children.includes(this._waterMesh),
    };
  }

  /** Debug/dev-tooling only: raw cell data at a world position (for verification scripts). */
  debugCellAt(wx: number, wz: number): { feature: string; biome: string; elevation: number; waterDepth: number } {
    const { col, row } = this._wg.worldToGrid(wx, wz);
    const cell = this._wg.get(col, row);
    return { feature: cell.feature, biome: cell.biome, elevation: cell.elevation, waterDepth: cell.waterDepth };
  }

  /**
   * SI-4 — call once per frame with the player's current position. Detects
   * crossing a settlement boundary (2D distance vs. each settlement's cached
   * radius) and returns `{ name, crossing: 'entering' | 'exiting' }` the
   * first frame a transition happens, or `null` otherwise. Only one
   * settlement is tracked "inside" at a time (the nearest containing one),
   * matching how settlements are spaced apart on the world map.
   */
  checkSettlementBoundaryCrossing(pos: THREE.Vector3): { name: string; crossing: 'entering' | 'exiting' } | null {
    let insideIdx = -1;
    for (let i = 0; i < this._settlementPositions.length; i++) {
      const s = this._settlementPositions[i]!;
      const dx = pos.x - s.worldPos.x;
      const dz = pos.z - s.worldPos.z;
      if (Math.hypot(dx, dz) <= s.radius) { insideIdx = i; break; }
    }

    if (insideIdx === this._settlementInsideIdx) return null;

    const prevIdx = this._settlementInsideIdx;
    this._settlementInsideIdx = insideIdx;

    if (insideIdx !== -1) {
      return { name: this._settlementPositions[insideIdx]!.name, crossing: 'entering' };
    }
    if (prevIdx !== -1) {
      return { name: this._settlementPositions[prevIdx]!.name, crossing: 'exiting' };
    }
    return null;
  }

  /**
   * Returns the nearest building whose exterior surface is within `maxDist`
   * world units of `pos`, or null if none is close enough. Distance is
   * measured to the building's rotated footprint rectangle (its nearest
   * wall), not its center — see BuildingCollision.ts. Used by main.ts to
   * show the "Press E to enter" prompt.
   */
  getNearestBuilding(pos: THREE.Vector3, maxDist = 4): { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number } | null {
    let best: { dna: BuildingDNA; pos: THREE.Vector3; faction: Faction; rotationY: number } | null = null;
    let bestD = maxDist;
    for (const bd of this._buildingData) {
      const fp = getFootprint(bd.dna.buildingKind, bd.dna.size);
      const d = closestDistanceToBuildingFootprint(
        { x: pos.x, z: pos.z },
        { x: bd.pos.x, z: bd.pos.z },
        fp,
        bd.rotationY,
      );
      if (d < bestD) { bestD = d; best = bd; }
    }
    return best;
  }

  /**
   * Create and register a static box collider matching a building's
   * footprint, position, rotation, and floor count. Call this for every
   * building placed in the overworld (settlements, studio previews, and
   * dev test-spawn hooks) so every building blocks player movement.
   * `pos` is the building's placement position (its local origin — see
   * `BuildingCollision.ts` docs: buildings are authored centered at local
   * origin with the door facing local +Z).
   */
  registerBuildingCollider(dna: BuildingDNA, pos: THREE.Vector3, rotationY: number): void {
    this._buildingColliderSpecs.push({ dna, pos: pos.clone(), rotationY });
    // If the scene is currently active, create the physics body immediately (matches prior
    // behavior for callers invoked after enter(), e.g. dev spawnBuildingNearPlayer()).
    // Otherwise it will be created on the next enter() via _createBuildingColliders().
    if (this._isInScene) this._createOneBuildingCollider(dna, pos, rotationY);
  }

  /** Create a single static box collider matching a building's footprint/position/rotation/floors. */
  private _createOneBuildingCollider(dna: BuildingDNA, pos: THREE.Vector3, rotationY: number): void {
    const fp = getFootprint(dna.buildingKind, dna.size);
    const halfH = (dna.floors * FLOOR_HEIGHT) / 2;
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    this._staticBodies.push(
      this.physics.createStaticRotatedBox(
        new THREE.Vector3(pos.x, pos.y + halfH, pos.z),
        rotQuat,
        new THREE.Vector3(fp.w / 2, halfH, fp.d / 2),
      ),
    );
  }

  /** Recreate physics colliders for every registered building. Called on enter() since exit()
   *  destroys all rigid bodies in `_staticBodies` (buildings included). */
  private _createBuildingColliders(): void {
    for (const spec of this._buildingColliderSpecs) {
      this._createOneBuildingCollider(spec.dna, spec.pos, spec.rotationY);
    }
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
   * ChunkManager `load` handler: builds one chunk's terrain mesh + Rapier
   * trimesh collider from the same buffers (guarantees they agree — see
   * TerrainGeometryBuilder.ts's header comment), adds the mesh to the
   * scene, builds its tree/rock/bush/beach-decor scatter (Task 11 / Task 13
   * final review), creates a static Rapier collider for every tree/rock in
   * that scatter (Task 13 final review, Important issue #1 — this used to
   * only ever happen once, in `enter()`, for whatever chunks happened to be
   * loaded at that instant), and returns everything so `_unloadTerrainChunk`
   * can tear it all down.
   */
  /**
   * Converts a `ChunkManager` chunk coordinate into the `WorldGrid` col/row
   * grid-index origin of its top-left tile, applying the same GHW/GHH
   * centering offset that `worldToGrid()`/`gridToWorld()` use. Shared by
   * `_loadTerrainChunk()` (terrain mesh/collider) and `_buildChunkScatter()`
   * (tree/rock placement) so both derive a chunk's grid rectangle from one
   * formula — the earlier bug was exactly two independent reimplementations
   * of this offset silently drifting apart when only one got fixed.
   */
  private _chunkGridOrigin(coord: ChunkCoord): { colStart: number; rowStart: number } {
    return {
      colStart: coord.cx * CHUNK_SIZE + Math.floor(this._GHW),
      rowStart: coord.cz * CHUNK_SIZE + Math.floor(this._GHH),
    };
  }

  private _loadTerrainChunk(coord: ChunkCoord): TerrainChunkData {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    // ChunkManager's chunk coordinates live in a 0-centered world-space grid
    // (chunk (0,0) covers world X/Z in [0, chunkWorldSize)) — see
    // `worldToChunkCoord()` in ChunkManager.ts. `WorldGrid` col/row indices,
    // however, are centered so that world (0,0) sits at grid col/row
    // (GHW, GHH) (see `worldToGrid()`/`gridToWorld()` in WorldGrid.ts).
    // Without translating through that same GHW/GHH offset here, this
    // chunk's terrain mesh/collider was built from the wrong (often
    // out-of-bounds, default-cell) grid rectangle relative to where the
    // chunk actually renders in world space — a real regression: swim mode
    // in deep water never triggered because the collider under the player
    // was flat default terrain, not the carved water floor. `_buildChunkScatter()`
    // derives its own world-space origin from this exact same grid origin
    // (via `_chunkGridOrigin()`) so the two can never drift apart again the
    // way they briefly did (scatter kept using an unshifted formula after
    // this terrain fix landed, placing trees/rocks outside their chunk's
    // actual terrain footprint).
    const { colStart, rowStart } = this._chunkGridOrigin(coord);
    const { positions, normals, colors, indices } = buildTerrainGeometryData(
      this._wg, GW, GH, GHW, GHH, T, SH, colStart, rowStart, CHUNK_SIZE, CHUNK_SIZE,
    );

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    // Chunks can load before the scene is ever entered (the constructor
    // forces an initial load) or while exited (dungeon/tower interior) —
    // only add to the live scene graph when actually entered, matching the
    // `_isInScene` gating already used for buildings/enemies/ruins below.
    if (this._isInScene) this.scene.add(mesh);

    const body = (indices.length === 0)
      ? null
      : this.physics.createStaticTrimesh(new Float32Array(positions), new Uint32Array(indices));
    if (body && !this._isInScene) body.setEnabled(false);

    const scatter = this._buildChunkScatter(coord);

    // Tree trunk / rock colliders (Task 11 scatter, Task 13 final review
    // Important issue #1) — walk this chunk's own scatter group and create
    // one static collider per tree/rock, same shapes/sizes the old
    // `enter()`-only loop used. Tracked on this chunk's own payload (not
    // `_staticBodies`, which is cleared on every `exit()`) so they live and
    // die with the chunk itself, toggled enabled/disabled by enter()/exit()
    // exactly like the terrain trimesh body above.
    const colliders: RAPIER.RigidBody[] = [];
    for (const obj of scatter.children) {
      if (obj.userData.scatterKind === 'tree') {
        colliders.push(this._createChunkColliderBody(obj.position.x, 1.2, obj.position.z, RAPIER.ColliderDesc.capsule(1.0, 0.22)));
      } else if (obj.userData.scatterKind === 'rock') {
        const radius = obj.userData.scatterRadius as number;
        // `obj.position.y` is the wrapper's world Y (= ground level, set in
        // `_buildChunkScatter`) — the visual embed offset (`radius * 0.45`)
        // lives on the wrapper's inner mesh, not on `obj` itself, so it must
        // be re-added here to match the original `_placeRocks()` collider
        // placement (`wy + radius * 0.5`).
        colliders.push(this._createChunkColliderBody(obj.position.x, obj.position.y + radius * 0.5, obj.position.z, RAPIER.ColliderDesc.ball(radius * 0.85)));
      }
    }
    if (!this._isInScene) {
      for (const c of colliders) c.setEnabled(false);
    }

    const data: TerrainChunkData = { mesh, body, scatter, colliders };
    this._terrainChunkData.set(`${coord.cx},${coord.cz}`, data);
    return data;
  }

  /**
   * ChunkManager `unload` handler: removes the mesh from the scene and
   * disposes its GPU buffers, removes the physics body, removes this
   * chunk's tree/rock collider bodies (Task 13 final review, Important
   * issue #1 — these are chunk-scoped now, not part of `_staticBodies`),
   * and (Task 11) tears down the chunk's scatter group — removing it from
   * the scene and disposing every descendant mesh's geometry (but NOT its
   * material — scatter materials are shared/pooled across every loaded
   * chunk, see `_pooledMaterial()`, and are only ever disposed once for the
   * whole scene in `dispose()`). `traverse()` walks the whole subtree
   * regardless of nesting depth, so this also correctly catches rock
   * "cluster" archetypes (a Group of 3 Meshes nested one level inside the
   * top-level rock wrapper) — disposing the group alone would leak those
   * Meshes' geometries.
   */
  private _unloadTerrainChunk(coord: ChunkCoord, data: TerrainChunkData): void {
    this._terrainChunkData.delete(`${coord.cx},${coord.cz}`);
    this.scene.remove(data.mesh);
    data.mesh.geometry.dispose();
    (data.mesh.material as THREE.Material).dispose();
    if (data.body) this.physics.removeBody(data.body);

    for (const c of data.colliders) this.physics.removeBody(c);

    this.scene.remove(data.scatter);
    data.scatter.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }

  /** Create a fixed static rigid body with the given collider at (x, y, z),
   *  tracked in the global `_staticBodies` array (torn down on every
   *  `exit()` — used for things whose physics presence is tied to the
   *  scene being entered at all, like the tower and buildings). */
  private _addStaticBody(x: number, y: number, z: number, desc: RAPIER.ColliderDesc): void {
    this._staticBodies.push(this._createChunkColliderBody(x, y, z, desc));
  }

  /** Create a fixed static rigid body with the given collider at (x, y, z),
   *  WITHOUT tracking it in `_staticBodies` — the caller owns the returned
   *  body's lifetime instead (used for per-chunk tree/rock colliders, which
   *  must survive `exit()`/`enter()` cycles and only die when their own
   *  chunk unloads — see `_loadTerrainChunk()`/`_unloadTerrainChunk()`). */
  private _createChunkColliderBody(x: number, y: number, z: number, desc: RAPIER.ColliderDesc): RAPIER.RigidBody {
    const body = this.physics.rapierWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    );
    this.physics.rapierWorld.createCollider(desc, body);
    return body;
  }

  /** Builds one chunk's tree + rock scatter, deterministically seeded by
   *  world seed + chunk coordinate so results are stable across reloads.
   *  Runs its own small Poisson-disk pass over just this chunk's world-unit
   *  extent (CHUNK_SIZE * T on a side) rather than the whole world — the
   *  dominant fix for scatter's unbounded-with-world-size cost. Known
   *  tradeoff: chunk-seam density can be slightly uneven since neighbouring
   *  chunks' points aren't visible to each other's sampling pass.
   *
   *  Each placed tree/rock is tagged with `userData.scatterKind` (and,
   *  for rocks, `userData.scatterRadius`) so `_loadTerrainChunk()` can walk
   *  this chunk's scatter group to create their individual trunk/boulder
   *  colliders without needing a separate whole-world `_trees`/`_rocks`
   *  array. Task 13 final review (Important issue #3) folded the former
   *  whole-world `_plantBushes()`/`_scatterBeachDecor()` passes into this
   *  same per-chunk group too (via `_buildChunkBushes()`/
   *  `_buildChunkBeachDecor()`) — they don't need colliders, so they're
   *  just extra visual children tagged with their own `scatterKind`,
   *  ignored by the tree/rock collider loop above. */
  private _buildChunkScatter(coord: ChunkCoord): THREE.Group {
    const group = new THREE.Group();
    const { _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const chunkWorldSize = T * CHUNK_SIZE;
    // Origin must land on the exact same world-space corner as this chunk's
    // terrain mesh (built by `_loadTerrainChunk()` from `_chunkGridOrigin()`'s
    // colStart/rowStart via `gridToWorld()`'s (col - GHW) * T convention) —
    // using a bare `- GHW * T` here (the pre-fix formula) desyncs scatter
    // from terrain by `Math.floor(GHW/GHH) * T` world units whenever GHW/GHH
    // aren't already integers.
    const { colStart, rowStart } = this._chunkGridOrigin(coord);
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;
    const rand = mulberry32((this._seed ^ 0x5C47_7E12) ^ (coord.cx * 92821) ^ (coord.cz * 68917));

    const treePts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, rand);
    for (const [px, pz] of treePts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 5) continue; // tower clear-zone
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'tree')) continue;
      const tree = this._makeTree(rand, wx, wz);
      tree.position.set(wx, cell.elevation * SH, wz);
      tree.rotation.y = rand() * Math.PI * 2;
      tree.userData.scatterKind = 'tree';
      group.add(tree);
    }

    const rockPts = poissonDisk(chunkWorldSize, chunkWorldSize, 8, rand);
    for (const [px, pz] of rockPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d = Math.sqrt(wx * wx + wz * wz);
      if (d < FR * T + 6) continue;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'rock')) continue;
      const rock = this._makeRock(rand, wx, wz);
      rock.position.set(wx, cell.elevation * SH, wz);
      rock.userData.scatterKind = 'rock';
      group.add(rock);
    }

    this._buildChunkBushes(coord, group);
    this._buildChunkBeachDecor(coord, group);

    // Collapse every individual tree/rock/bush/decor Mesh in this chunk into
    // a handful of merged per-material meshes — see `mergeGroupMeshesByMaterial()`.
    // Was the dominant cause of sub-7fps in loaded areas: with 7x7 loaded
    // chunks at default settings, un-merged scatter alone produced 3000+
    // individual draw calls (measured), before any buildings/terrain/NPCs.
    mergeGroupMeshesByMaterial(group);

    // Chunks can load before the scene is ever entered (the constructor's
    // forced initial load) or while exited (dungeon/tower interior) — only
    // add to the live scene graph when actually entered, mirroring
    // `_loadTerrainChunk`'s `_isInScene` gating for its terrain mesh just
    // above. Without this, scatter loaded while exited would render through
    // interior geometry the same way ungated terrain did before Task 10.
    if (this._isInScene) this.scene.add(group);
    return group;
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
        if (cell.feature !== 'river' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;

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
        // Wound so the cross product (v1-v0)x(v3-v0) yields +Y — i.e. the quad's
        // front face (and computed normal) points up, visible from the default
        // above-terrain camera angle. The naive (0,1,2 / 0,2,3) winding produces
        // a downward-facing normal here, which silently back-face-culled the
        // entire water surface from every normal gameplay camera angle.
        idx.push(base, base + 3, base + 2,  base, base + 2, base + 1);
      }
    }

    if (pos.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, this._makeWaterMaterial());
  }

  /**
   * Animated, stylized water shader (Link's Awakening-remake-inspired look).
   * Delegates to the shared factory in `@/world/WaterMaterial` so
   * OverworldScene and WaterLabScene use the identical material without
   * duplicating GLSL.
   */
  private _makeWaterMaterial(): THREE.ShaderMaterial {
    return createWaterMaterial();
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

    // A5: Portcullis gate — iron bar grid that rises when player approaches
    const gateGroup = new THREE.Group();
    gateGroup.name = '__portcullis';
    const barMat = new THREE.MeshLambertMaterial({ color: 0x2a2824 });
    // 4 vertical bars
    for (let b = 0; b < 4; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.5, 0.1), barMat);
      bar.position.set(-0.75 + b * 0.5, 1.75, DZ + 0.05);
      gateGroup.add(bar);
    }
    // 3 horizontal cross-bars
    for (let h = 0; h < 3; h++) {
      const hbar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.1), barMat);
      hbar.position.set(0, 0.8 + h * 1.2, DZ + 0.05);
      gateGroup.add(hbar);
    }
    grp.add(gateGroup);

    // A5: Window point lights (activated at night via TimeSystem)
    const winLightPositions: [number, number, number][] = [
      [0, 5.0,  3.9],  // floor 1 south
      [0, 10.0, 3.6],  // floor 2 south
      [0, 15.0, 3.3],  // floor 3 south
    ];
    for (const [lx, ly, lz] of winLightPositions) {
      const wLight = new THREE.PointLight(0xffcc66, 0, 5);  // starts off
      wLight.name = '__window_light';
      wLight.position.set(lx, ly, lz);
      grp.add(wLight);
    }

    return grp;
  }

  /** A5: Update tower window lights and portcullis gate each frame.
   *  @param hour  Game hour (0–24)
   *  @param playerPos  Player world position
   */
  updateTowerDetails(hour: number, playerPos: THREE.Vector3): void {
    // Night = hours 18–6 (roughly)
    const isNight = hour >= 18 || hour < 6;
    const intensity = isNight ? 0.7 + 0.1 * Math.sin(Date.now() * 0.001) : 0;

    let portcullis: THREE.Group | null = null;
    this._tower.traverse(child => {
      if (child.name === '__window_light') {
        (child as THREE.PointLight).intensity = intensity;
      }
      if (child.name === '__portcullis') {
        portcullis = child as THREE.Group;
      }
    });

    // Raise gate when player is within 6 WU of tower door, lower otherwise
    if (portcullis !== null) {
      const pc = portcullis as THREE.Group;
      const dist = playerPos.distanceTo(this._tower.position);
      const targetY = dist < 6 ? 3.2 : 0;
      pc.position.y += (targetY - pc.position.y) * 0.08;
    }
  }

  /** Phase 4: fade all settlement lamp-post lights on/off based on game hour.
   *  Uses the same isNight threshold + flicker formula as updateTowerDetails
   *  so all of the overworld's night light sources pulse in the same rhythm. */
  updateNightLighting(hour: number): void {
    const isNight = hour >= 18 || hour < 6;
    const intensity = isNight ? 0.7 + 0.1 * Math.sin(Date.now() * 0.001) : 0;
    for (const light of this._lampLights) light.intensity = intensity;
  }

  // ── Tree placement ─────────────────────────────────────────────────────────

  /**
   * Task 13 final review (Important issue #3) — returns a shared
   * `MeshLambertMaterial` from a small, fixed-size pool for `kind`
   * (archetype name, e.g. `'conifer-lower'`), lazily building the pool
   * (each variant with its own baked `CanvasTexture` when `variance` is
   * given) on first use and caching it on `_materialPools` for this
   * `OverworldScene` instance's whole lifetime. A given instance's material
   * is picked from the pool via `rand()`, so scatter placement stays fully
   * deterministic (same seed + chunk coord → same picks) while no longer
   * allocating a brand-new material + texture per placed object — before
   * this, a `worldSize: 512` world's full tree/rock/bush/beach-decor
   * scatter created roughly one unique texture PER OBJECT (~14,000 of
   * them); now each archetype/kind shares `variantColors.length` (a
   * handful) of them for its entire lifetime. `variance` omitted (e.g. bare
   * trunk colors) skips the texture/map entirely, matching the original
   * flat-color materials. */
  private _pooledMaterial(
    kind: string,
    variantColors: number[],
    rand: () => number,
    variance?: number,
  ): THREE.MeshLambertMaterial {
    let pool = this._materialPools.get(kind);
    if (!pool) {
      // Simple string hash so different `kind`s never collide on texture seed.
      let hash = 0;
      for (let i = 0; i < kind.length; i++) hash = (hash * 31 + kind.charCodeAt(i)) | 0;
      pool = variantColors.map((color, i) => new THREE.MeshLambertMaterial(
        variance != null
          ? { color, map: makeMottledCanvasTexture(color, variance, (hash ^ (i * 104729)) >>> 0) }
          : { color },
      ));
      this._materialPools.set(kind, pool);
    }
    return pool[Math.floor(rand() * pool.length)]!;
  }

  private _makeTree(rand: () => number, wx: number, wz: number): THREE.Group {
    const archetype = pickTreeArchetype(wx, wz);
    if (archetype === 'deciduous') return this._buildDeciduousTree(rand);
    if (archetype === 'sparse')    return this._buildSparseTree(rand);
    return this._buildConiferTree(rand);
  }

  /** Original cone-stack conifer — kept as archetype 1 of 3 for visual continuity. */
  private _buildConiferTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.2;
    const trunkR = 0.12 + rand() * 0.07;
    const coneR  = 0.85 + rand() * 0.55;
    const coneH  = 2.0 + rand() * 1.2;

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.72, trunkR, trunkH, 6),
      this._pooledMaterial('tree-trunk', [0x4a2810], rand),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // Lower canopy cone — 6 variants spanning the original 0x1a4610..+5*0x010100 range.
    const canopyMat = this._pooledMaterial(
      'conifer-lower',
      [0x1a4610, 0x1a4610 + 0x010100, 0x1a4610 + 0x020200, 0x1a4610 + 0x030300, 0x1a4610 + 0x040400, 0x1a4610 + 0x050500],
      rand,
      0.18,
    );
    const coneL = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 6), canopyMat);
    coneL.position.y = trunkH + coneH * 0.48;
    g.add(coneL);

    // Upper canopy cone (smaller, slightly lighter) — same range, +0x040800 offset.
    const upperBase = 0x1a4610 + 0x040800;
    const coneU = new THREE.Mesh(
      new THREE.ConeGeometry(coneR * 0.65, coneH * 0.70, 6),
      this._pooledMaterial(
        'conifer-upper',
        [upperBase, upperBase + 0x010100, upperBase + 0x020200, upperBase + 0x030300, upperBase + 0x040400, upperBase + 0x050500],
        rand,
        0.18,
      ),
    );
    coneU.position.y = trunkH + coneH * 0.88;
    g.add(coneU);

    return g;
  }

  /** Rounded/lumpy canopy built from overlapping icosahedra — broadleaf tree archetype. */
  private _buildDeciduousTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.3 + rand() * 0.9;
    const trunkR = 0.16 + rand() * 0.08;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.8, trunkR, trunkH, 6),
      this._pooledMaterial('tree-trunk', [0x4a2810], rand),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // 5 variants spanning the original 0x2c5a18..+4*0x010200 range.
    const canopyMat = this._pooledMaterial(
      'deciduous',
      [0x2c5a18, 0x2c5a18 + 0x010200, 0x2c5a18 + 0x020400, 0x2c5a18 + 0x030600, 0x2c5a18 + 0x040800],
      rand,
      0.22,
    );

    // 3 overlapping blobs give a rounded, non-symmetric canopy silhouette.
    const blobCount = 3;
    for (let i = 0; i < blobCount; i++) {
      const radius = 0.65 + rand() * 0.45;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), canopyMat);
      const angle = (i / blobCount) * Math.PI * 2 + rand() * 0.6;
      const spread = 0.35 + rand() * 0.25;
      blob.position.set(
        Math.cos(angle) * spread,
        trunkH + radius * 0.75 + rand() * 0.3,
        Math.sin(angle) * spread,
      );
      g.add(blob);
    }

    return g;
  }

  /** Thin trunk with sparse bare-branch fragments — bog/dead-tree archetype. */
  private _buildSparseTree(rand: () => number): THREE.Group {
    const g      = new THREE.Group();
    const trunkH = 1.8 + rand() * 1.4;
    const trunkR = 0.08 + rand() * 0.04;

    // 4 variants spanning the original 0x3a2818..+3*0x010101 range.
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.5, trunkR, trunkH, 5),
      this._pooledMaterial(
        'sparse-trunk',
        [0x3a2818, 0x3a2818 + 0x010101, 0x3a2818 + 0x020202, 0x3a2818 + 0x030303],
        rand,
      ),
    );
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // A few small angular "sparse foliage / bare branch" fragments near the top.
    const fragmentCount = 2 + Math.floor(rand() * 2);
    // 4 variants spanning the original 0x3a4a20..+3*0x010100 range.
    const fragMat = this._pooledMaterial(
      'sparse-foliage',
      [0x3a4a20, 0x3a4a20 + 0x010100, 0x3a4a20 + 0x020200, 0x3a4a20 + 0x030300],
      rand,
      0.28,
    );
    for (let i = 0; i < fragmentCount; i++) {
      const size = 0.25 + rand() * 0.2;
      const frag = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), fragMat);
      const angle = rand() * Math.PI * 2;
      const spread = 0.2 + rand() * 0.3;
      frag.position.set(
        Math.cos(angle) * spread,
        trunkH - 0.1 + rand() * 0.4,
        Math.sin(angle) * spread,
      );
      g.add(frag);
    }

    return g;
  }

  // ── Rock placement ─────────────────────────────────────────────────────────

  /** Builds one unpositioned rock (boulder/slab/cluster archetype, chosen via
   *  `pickRockArchetype(wx, wz)`), wrapped in a `THREE.Group` whose local
   *  origin already accounts for the "half-embedded in ground" vertical
   *  offset (`radius * 0.45`) that the old `_placeRocks()` baked directly
   *  into world-space Y — so the caller only needs to set world (x, level *
   *  SH, z), mirroring `_makeTree()`'s unpositioned-group contract. Also
   *  tags `userData.scatterRadius` so `_loadTerrainChunk()` can size this
   *  rock's ball collider without a separate whole-world `_rocks` array. */
  private _makeRock(rand: () => number, wx: number, wz: number): THREE.Group {
    const radius = 0.48 + rand() * 0.84;

    // 5 variants spanning the original grey range (0x58..0x58+0x17).
    const greyVariants = [0x58, 0x60, 0x68, 0x6c, 0x6f];
    const colorForGrey = (grey: number) => (grey << 16) | (Math.floor(grey * 0.96) << 8) | Math.floor(grey * 0.88);
    const mat = this._pooledMaterial('rock', greyVariants.map(colorForGrey), rand, 0.12);

    const archetype = pickRockArchetype(wx, wz);
    let mesh: THREE.Object3D;
    if (archetype === 'slab') {
      // Flattened box — mimics a flat rock outcrop/slab.
      mesh = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, radius * 0.5, radius * 1.3), mat);
    } else if (archetype === 'cluster') {
      // Grouped small dodecahedra scattered around a shared centre — rock pile look.
      const grp = new THREE.Group();
      const pieceCount = 3;
      for (let i = 0; i < pieceCount; i++) {
        const pieceR = radius * (0.45 + rand() * 0.35);
        const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(pieceR, 0), mat);
        const angle = (i / pieceCount) * Math.PI * 2 + rand() * 0.5;
        const spread = radius * 0.5;
        piece.position.set(Math.cos(angle) * spread, pieceR * 0.4, Math.sin(angle) * spread);
        piece.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        grp.add(piece);
      }
      mesh = grp;
    } else {
      // Default 'boulder' — original dodecahedron look.
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), mat);
    }
    // Local-only vertical embed offset (world x/z stay 0 here — the caller
    // sets the wrapper group's world position).
    mesh.position.y = radius * 0.45;
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    mesh.scale.set(1 + rand() * 0.4, 0.5 + rand() * 0.55, 0.9 + rand() * 0.3);

    const wrapper = new THREE.Group();
    wrapper.add(mesh);
    wrapper.userData.scatterRadius = radius;
    return wrapper;
  }

  // ── Bush placement (ground clutter — no physics collider) ─────────────────

  /** Chunk-scoped bush placement (Task 13 final review, Important issue #3)
   *  — was a whole-world `_plantBushes()` Poisson-disk pass over the FULL
   *  grid extent at construction time; now built per-chunk (own Poisson-disk
   *  pass over just this chunk's extent, own deterministic seed) exactly
   *  like `_buildChunkScatter()`'s tree/rock placement, so bush count scales
   *  with loaded-chunk count instead of total world size. Bushes are purely
   *  visual (no collider) so they're just added straight into the shared
   *  per-chunk `scatter` group, tagged `userData.scatterKind = 'bush'` so
   *  `_loadTerrainChunk()`'s tree/rock collider loop correctly ignores
   *  them. */
  private _buildChunkBushes(coord: ChunkCoord, group: THREE.Group): void {
    const { _GHW: GHW, _GHH: GHH, _FR: FR } = this;
    const chunkWorldSize = T * CHUNK_SIZE;
    const { colStart, rowStart } = this._chunkGridOrigin(coord);
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;
    const bushInner = FR * T + 4;
    const bushOuter = GHW * T * 0.90;
    const rand = mulberry32((this._seed ^ 0x8B21_44F7) ^ (coord.cx * 51749) ^ (coord.cz * 40361));

    // Tighter spacing than trees (5.5) — bushes are denser undergrowth.
    const pts = poissonDisk(chunkWorldSize, chunkWorldSize, 3.2, rand);

    for (const [px, pz] of pts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < bushInner || d > bushOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);

      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'bush')) continue;
      // Only plant a bush on roughly 1 in 3 valid candidates — trees already use a
      // similar Poisson pass at a different spacing; without this thinning, bushes
      // would be too dense given the tighter 3.2 spacing above.
      if (rand() > 0.35) continue;

      const level = cell.elevation;
      const bush = this._makeBush(rand);
      bush.position.set(wx, level * SH, wz);
      bush.rotation.y = rand() * Math.PI * 2;
      bush.userData.scatterKind = 'bush';
      group.add(bush);
    }
  }

  private _makeBush(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // 5 variants spanning the original 0x2e4a1a..+4*0x010200 range.
    const mat = this._pooledMaterial(
      'bush',
      [0x2e4a1a, 0x2e4a1a + 0x010200, 0x2e4a1a + 0x020400, 0x2e4a1a + 0x030600, 0x2e4a1a + 0x040800],
      rand,
      0.20,
    );

    const blobCount = 2 + Math.floor(rand() * 3); // 2..4 blobs
    for (let i = 0; i < blobCount; i++) {
      const radius = 0.22 + rand() * 0.2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), mat);
      const angle = rand() * Math.PI * 2;
      const spread = rand() * 0.22;
      blob.position.set(Math.cos(angle) * spread, radius * 0.7, Math.sin(angle) * spread);
      blob.scale.y = 0.7 + rand() * 0.3; // flatten slightly — low mound, not a sphere
      g.add(blob);
    }

    return g;
  }

  // ── Beach decor (sand-only ground clutter — no physics collider) ──────────

  /** Chunk-scoped beach-decor placement (Task 13 final review, Important
   *  issue #3) — was a whole-world `_scatterBeachDecor()` pass, now built
   *  per-chunk exactly like `_buildChunkBushes()` above. Purely visual (no
   *  collider), tagged `userData.scatterKind = 'decor'`. */
  private _buildChunkBeachDecor(coord: ChunkCoord, group: THREE.Group): void {
    const { _GHW: GHW, _GHH: GHH } = this;
    const chunkWorldSize = T * CHUNK_SIZE;
    const { colStart, rowStart } = this._chunkGridOrigin(coord);
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;
    const rand = mulberry32((this._seed ^ 0x3F9C_61A2) ^ (coord.cx * 76003) ^ (coord.cz * 86243));

    // Denser than bushes (3.2) since beach strips are typically narrow —
    // a wider spacing would mean most candidate points land off the sand.
    const pts = poissonDisk(chunkWorldSize, chunkWorldSize, 2.4, rand);

    for (const [px, pz] of pts) {
      const wx = originX + px;
      const wz = originZ + pz;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (cell.biome !== 'beach') continue;
      if (cell.feature === 'road' || cell.feature === 'road_dirt') continue;
      if (cell.content !== 'empty') continue;
      if (cell.settlementId > 0) continue;

      const level = cell.elevation;
      const roll = rand();
      const decor = roll < 0.34 ? this._makeDriftwood(rand)
                  : roll < 0.67 ? this._makeDuneGrassTuft(rand)
                  : this._makeBeachPebbles(rand);
      decor.position.set(wx, level * SH, wz);
      decor.rotation.y = rand() * Math.PI * 2;
      decor.userData.scatterKind = 'decor';
      group.add(decor);
    }
  }

  private _makeDriftwood(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const len = 1.1 + rand() * 0.9;
    const r0 = 0.06 + rand() * 0.03;
    // 4 variants spanning the original 0x6a5a48..+3*0x040302 range.
    const mat = this._pooledMaterial(
      'driftwood',
      [0x6a5a48, 0x6a5a48 + 0x040302, 0x6a5a48 + 0x080604, 0x6a5a48 + 0x0c0906],
      rand,
      0.16,
    );
    const log = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.8, r0, len, 6), mat);
    log.rotation.z = Math.PI / 2; // lying flat
    log.rotation.y = rand() * Math.PI;
    log.position.y = r0;
    g.add(log);
    return g;
  }

  private _makeDuneGrassTuft(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // 4 variants spanning the original 0x9a9660..+3*0x030200 range.
    const mat = this._pooledMaterial(
      'dunegrass',
      [0x9a9660, 0x9a9660 + 0x030200, 0x9a9660 + 0x060400, 0x9a9660 + 0x090600],
      rand,
      0.22,
    );
    const bladeCount = 3 + Math.floor(rand() * 3); // 3..5 blades
    for (let i = 0; i < bladeCount; i++) {
      const h = 0.35 + rand() * 0.3;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), mat);
      const angle = (i / bladeCount) * Math.PI * 2 + rand() * 0.4;
      const spread = 0.05 + rand() * 0.06;
      blade.position.set(Math.cos(angle) * spread, h / 2, Math.sin(angle) * spread);
      blade.rotation.z = (rand() - 0.5) * 0.3;
      g.add(blade);
    }
    return g;
  }

  private _makeBeachPebbles(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // 5 variants spanning the original 0x8a8478..+4*0x020202 range.
    const mat = this._pooledMaterial(
      'pebbles',
      [0x8a8478, 0x8a8478 + 0x020202, 0x8a8478 + 0x040404, 0x8a8478 + 0x060606, 0x8a8478 + 0x080808],
      rand,
      0.10,
    );
    const pieceCount = 2 + Math.floor(rand() * 3); // 2..4 pebbles
    for (let i = 0; i < pieceCount; i++) {
      const pr = 0.08 + rand() * 0.1;
      const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(pr, 0), mat);
      const angle = rand() * Math.PI * 2;
      const spread = rand() * 0.18;
      piece.position.set(Math.cos(angle) * spread, pr * 0.5, Math.sin(angle) * spread);
      piece.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      piece.scale.set(1, 0.5 + rand() * 0.3, 0.8 + rand() * 0.3);
      g.add(piece);
    }
    return g;
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
        const cell = this._wg.get(c, r);
        if (!isScatterAllowed(cell, 'camp')) continue;
        const level = cell.elevation;

        this._enemies.push(new SlimeEnemy(
          new THREE.Vector3(ex, level * SH + 0.9, ez),
          this.physics,
          (dmg) => this.player.health.takeDamage(dmg),
        ));
      }
      camps++;
    }
  }

  // ── E1: Species-specific NPC encounter triggers ──────────────────────────────

  private _spawnSpeciesEncounters(): void {
    if (!this.characterSpecies) return;

    const { _GHW: GHW, _GHH: GHH } = this;

    if (this.characterSpecies === 'vulperia') {
      // Bounty hunter — lurks south-east of the tower, 12–14 WU from door
      const bCol = GHW + 5; const bRow = GHH + 4;
      const bWx  = 14; const bWz = 10;
      const hunter = new NPCEntity(
        bCol, bRow, bWx, bWz,
        'guard',
        { seed: 0xB077F, type: 'village', population: 0, name: 'Road', col: bCol, row: bRow } as any,
        [],
        undefined, undefined, undefined,
        [],
      );
      if (this.onQuestGiven) hunter.onQuestGiven = this.onQuestGiven;
      // Override dialogue to hint at the bounty contract (checked by StoryRunner)
      (hunter as any)._isSpeciesEncounter = 'vulperia_bounty_hunter';
      this._npcs.push(hunter);
      hunter.addToScene(this.scene);
    }

    if (this.characterSpecies === 'undead') {
      // Wandering scholar — found near the western ruins, 10 WU from tower
      const sCol = GHW - 4; const sRow = GHH + 3;
      const sWx  = -10; const sWz = 8;
      const scholar = new NPCEntity(
        sCol, sRow, sWx, sWz,
        'scholar',
        { seed: 0x5C1101, type: 'village', population: 0, name: 'Road', col: sCol, row: sRow } as any,
        [],
        undefined, undefined, undefined,
        [],
      );
      if (this.onQuestGiven) scholar.onQuestGiven = this.onQuestGiven;
      (scholar as any)._isSpeciesEncounter = 'undead_wandering_scholar';
      this._npcs.push(scholar);
      scholar.addToScene(this.scene);
    }
  }

  private _addRuins(rand: () => number): void {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const W  = GW * T;
    const H  = GH * T;
    const ruinInner   = GHW * T * 0.60;
    const ruinOuter   = GHW * T * 0.88;
    const ruinSpacing = Math.max(45, Math.round(GW * T * 0.441));
    console.log(`[_addRuins] W=${W} H=${H} spacing=${ruinSpacing} inner=${ruinInner.toFixed(0)} outer=${ruinOuter.toFixed(0)}`);
    const pts = poissonDisk(W, H, ruinSpacing, rand);
    console.log(`[_addRuins] poissonDisk done — ${pts.length} candidate points`);

    for (let i = 0; i < pts.length; i++) {
      const [px, pz] = pts[i];
      if (this.buildingEntrances.length >= 2) break;
      const wx = px - W / 2;
      const wz = pz - H / 2;
      const d  = Math.sqrt(wx * wx + wz * wz);
      if (d < ruinInner || d > ruinOuter) continue;

      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isScatterAllowed(cell, 'ruin')) continue;
      const level = cell.elevation;
      const wy = level * SH;
      console.log(`[_addRuins] making ruin ${i} at (${wx.toFixed(1)}, ${wz.toFixed(1)})...`);

      this._ruins.push(this._makeRuin(wx, wy, wz, rand));
      console.log(`[_addRuins] ruin ${i} built`);
      this.buildingEntrances.push({
        type:     'greenhouse',
        position: new THREE.Vector3(wx, wy, wz),
        label:    'Ruined Greenhouse',
      });

      // C1: Spawn a mysterious NPC near each ruin
      const mCol = Math.round((wx + 3) / T + GHW);
      const mRow = Math.round((wz + 1) / T + GHH);
      console.log(`[_addRuins] creating NPC for ruin ${i}...`);
      const syntheticSettlement: import('@/world/WorldData').SettlementEntry = {
        id:   0,
        seed: (mCol * 73856093) ^ (mRow * 19349663),
        plan: {
          type:       'hamlet' as import('@/world/SettlementGenerator').SettlementType,
          name:       'Ruins',
          faction:    'human',
          centerCol:  mCol,
          centerRow:  mRow,
          buildings:  [],
          roads:      [],
          population: 0,
        },
      };
      const mystNpc = new NPCEntity(
        mCol, mRow, wx + 3, wz + 1,
        'mysterious',
        syntheticSettlement,
        [],
        undefined, undefined, undefined,
        [],
      );
      console.log(`[_addRuins] NPC created for ruin ${i}`);
      if (this.onQuestGiven) mystNpc.onQuestGiven = this.onQuestGiven;
      mystNpc.group.position.y = wy;
      this._npcs.push(mystNpc);
    }
    console.log('[_addRuins] DONE');
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

  // ── Cave / Glade entrances (CG-1, CG-2, CG-3 renderer wiring) ─────────────

  private _placeCaveGladeEntrances(caves: CaveEntry[], glades: GladeEntry[]): void {
    const { _GHW: GHW, _GHH: GHH } = this;

    for (const entry of caves) {
      const wx = (entry.col - GHW) * T;
      const wz = (entry.row - GHH) * T;
      const lv = this._wg.get(entry.col, entry.row).elevation;
      const wy = lv * SH;

      const built = buildCaveEntrance(entry.biome);
      built.root.position.set(wx, wy, wz);
      this._caveEntranceBuilts.push(built);
      this.caveEntrances.push({ entry, position: new THREE.Vector3(wx, wy, wz) });
    }

    for (const entry of glades) {
      const wx = (entry.col - GHW) * T;
      const wz = (entry.row - GHH) * T;
      const lv = this._wg.get(entry.col, entry.row).elevation;
      const wy = lv * SH;

      const built = buildGladeEntrance();
      built.root.position.set(wx, wy, wz);
      this._gladeEntranceBuilts.push(built);
      this.gladeEntrances.push({ entry, position: new THREE.Vector3(wx, wy, wz) });
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

  private _readStudioSettlementPreview(): OverworldSettlementPreviewPayload | null {
    try {
      const raw = localStorage.getItem(OVERWORLD_SETTLEMENT_PREVIEW_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<OverworldSettlementPreviewPayload> | null;
      if (!parsed || parsed.version !== 1 || !parsed.model?.wards?.length) return null;
      return parsed as OverworldSettlementPreviewPayload;
    } catch (e) {
      console.warn('[OverworldScene] failed to parse studio settlement preview:', e);
      return null;
    }
  }

  private _mapStudioFactionToRuntimeFaction(faction: string): Faction {
    const map: Record<string, Faction> = {
      human: 'human_town',
      elven: 'elven',
      dwarven: 'dwarven',
      orcish: 'orcish',
      vampire: 'vampire',
      undead: 'undead_common',
      vulperia: 'vulperia',
      slime: 'slime',
      fae: 'fae',
    };
    return map[faction] ?? 'human_town';
  }

  private _buildStudioSettlementPreview(): void {
    const payload = this._readStudioSettlementPreview();
    if (!payload) return;

    const cityWards = payload.model.wards.filter(w => w.withinCity);
    if (cityWards.length === 0) return;

    const { _GHW: GHW, _GHH: GHH, _GW: GW, _GH: GH } = this;
    const anchorCol = Math.max(6, Math.min(GW - 7, Math.round(GHW + this._FR + 7)));
    const anchorRow = Math.max(6, Math.min(GH - 7, Math.round(GHH + this._FR + 7)));
    const anchorWx = (anchorCol - GHW) * T;
    const anchorWz = (anchorRow - GHH) * T;
    const previewRadiusWU = 14;
    const runtimeFaction = this._mapStudioFactionToRuntimeFaction(payload.faction);
    const usedTiles = new Set<string>();
    let buildingCount = 0;

    for (const ward of cityWards) {
      const kind = WARD_TO_KIND[ward.type];
      if (!kind) continue;

      const dx = (ward.center.x - payload.model.centre.x) / Math.max(1, payload.model.radius);
      const dz = (ward.center.y - payload.model.centre.y) / Math.max(1, payload.model.radius);

      let wx = anchorWx + dx * previewRadiusWU;
      let wz = anchorWz + dz * previewRadiusWU;

      let { col, row } = this._wg.worldToGrid(wx, wz);
      col = Math.max(3, Math.min(GW - 4, Math.round(col)));
      row = Math.max(3, Math.min(GH - 4, Math.round(row)));

      const tileKey = `${col},${row}`;
      if (usedTiles.has(tileKey)) continue;
      usedTiles.add(tileKey);

      wx = (col - GHW) * T;
      wz = (row - GHH) * T;
      const wy = this._wg.get(col, row).elevation * SH;

      const seed = ((payload.seed ^ (Math.round(ward.center.x) * 73856093 + Math.round(ward.center.y) * 19349663)) >>> 0);
      const size = WARD_TO_SIZE[ward.type] ?? 'medium';
      const floors = WARD_TO_FLOORS[ward.type] ?? (payload.settlementType === 'city' ? 2 : 1);
      const dna = factionBuildingDna(kind, runtimeFaction, seed, size, floors as 1 | 2 | 3 | 4);
      const inst = buildBuilding(dna);
      const grp = inst.exteriorGroup;

      const buildingRotationY = (seed % 4) * (Math.PI / 2);
      grp.position.set(wx, wy, wz);
      grp.rotation.y = buildingRotationY;
      grp.userData['studioPreview'] = true;
      grp.userData['studioWardType'] = ward.type;

      // Each building's exterior is built from 50+ individual wall/roof/
      // window/door/trim/chimney/etc. meshes (BuildingBuilder.ts) — collapse
      // them per-material now, same technique/rationale as chunk scatter
      // (see `mergeGroupMeshesByMaterial()`), since this dominated the
      // scene's total draw-call count far more than scatter did.
      mergeGroupMeshesByMaterial(grp);

      this._buildingGroups.push(grp);
      this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: runtimeFaction, rotationY: buildingRotationY });
      this.registerBuildingCollider(dna, new THREE.Vector3(wx, wy, wz), buildingRotationY);
      buildingCount++;
    }

    const centreElev = this._wg.get(anchorCol, anchorRow).elevation * SH + 2.0;
    this._settlementPositions.push({
      name: `${payload.name} (Preview)`,
      worldPos: new THREE.Vector3(anchorWx, centreElev, anchorWz),
      radius: 16, // dev-preview only — no boundary-crossing gameplay hookup needed here
    });

    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as any).__tttOverworldPreviewLoaded = {
        name: payload.name,
        seed: payload.seed,
        faction: payload.faction,
        buildingCount,
      };
    }

    console.log(`[OverworldScene] studio preview "${payload.name}" loaded (${buildingCount} buildings)`);
  }

  private _buildSettlements(worldData: WorldData): void {
    const { settlements } = worldData;
    if (!settlements || settlements.length === 0) {
      this._buildStudioSettlementPreview();
      return;
    }

    const { _GHW: GHW, _GHH: GHH } = this;

    // Cache world-space positions for fast travel
    for (const entry of settlements) {
      const { plan } = entry;
      const wx = (plan.centerCol - GHW) * T;
      const wz = (plan.centerRow - GHH) * T;
      const wy = this._wg.get(plan.centerCol, plan.centerRow).elevation * SH + 2.0;
      // SI-4: boundary radius = farthest building from centre + a margin, so the
      // boundary sits just outside the settlement rather than through a building.
      let maxDist = 0;
      for (const b of plan.buildings) {
        const dx = (b.col - plan.centerCol) * T;
        const dz = (b.row - plan.centerRow) * T;
        maxDist = Math.max(maxDist, Math.hypot(dx, dz));
      }
      const radius = (maxDist > 0 ? maxDist : 10) + 4;
      this._settlementPositions.push({
        name:     plan.name,
        worldPos: new THREE.Vector3(wx, wy, wz),
        radius,
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
        const runtimeFaction = this._mapStudioFactionToRuntimeFaction(plan.faction);
        const dna = createSettlementBuildingDna(b, plan.type, runtimeFaction);
        if (!dna) continue;
        const inst = buildBuilding(dna);
        const grp = inst.exteriorGroup;
        grp.position.set(wx, wy, wz);
        grp.rotation.y = b.rotation;
        // See `mergeGroupMeshesByMaterial()` doc comment — collapses each
        // building's 50+ individual exterior-part meshes into a handful of
        // merged-per-material meshes; buildings, not scatter, turned out to
        // be the dominant source of draw calls (measured: 41 buildings ->
        // 2382 individual meshes vs. only 77 for all merged scatter).
        mergeGroupMeshesByMaterial(grp);
        this._buildingGroups.push(grp);
        if (b.isAnchor) {
          this._buildingData.push({ dna, pos: new THREE.Vector3(wx, wy, wz), faction: runtimeFaction, rotationY: b.rotation });
        }
        this.registerBuildingCollider(dna, new THREE.Vector3(wx, wy, wz), b.rotation);
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

      // Place lamp posts along a stride-sampled subset of this settlement's roads.
      const lampTiles = selectLampRoadTiles(plan.roads, 4);
      for (const t of lampTiles) {
        const wx = (t.col - GHW) * T + 0.6; // small perpendicular offset so the post
        const wz = (t.row - GHH) * T;       // doesn't sit dead-center of the walking path
        const { group, light } = this._makeLampPost();
        group.position.set(wx, centreElev * SH, wz);
        this._lampGroups.push(group);
        this._lampLights.push(light);
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

    this._buildStudioSettlementPreview();

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
    const VILLAGE_ROLES: NPCRole[] = ['citizen','citizen','citizen','merchant','guard','quest_giver'];
    const TOWN_ROLES:    NPCRole[] = ['citizen','citizen','merchant','merchant','guard','guard','innkeeper','blacksmith','settlement_elder'];
    const CITY_ROLES:    NPCRole[] = ['citizen','citizen','merchant','merchant','guard','guard','innkeeper','blacksmith','scholar','settlement_elder','quest_giver'];

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
            if (cell.feature === 'river' || cell.biome === 'ocean' || cell.biome === 'deep_ocean') {
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

  // ── Settlement lamp posts (Phase 4 — night lighting) ───────────────────────

  private _makeLampPost(): { group: THREE.Group; light: THREE.PointLight } {
    const g = new THREE.Group();

    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.4, 6), postMat);
    post.position.y = 0.7;
    g.add(post);

    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xffcc77,
      emissive: 0xffaa44,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });
    const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternMat);
    lantern.position.y = 1.42;
    g.add(lantern);

    const light = new THREE.PointLight(0xffaa55, 0, 5); // starts off — day
    light.position.y = 1.42;
    g.add(light);

    return { group: g, light };
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
