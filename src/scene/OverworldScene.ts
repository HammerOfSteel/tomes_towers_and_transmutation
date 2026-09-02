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
import type { WorldGrid, BiomeId }     from '@/world/WorldGrid';
import type { WorldData, DungeonEntry, CaveEntry, GladeEntry } from '@/world/WorldData';
import type { EntranceMeshKey }        from '@/world/DungeonType';
import { DUNGEON_TYPE_CONFIGS }         from '@/world/DungeonType';
import { buildBuilding }               from '@/world/buildings/BuildingBuilder';
import { mapStudioFactionToRuntimeFaction } from '@/world/buildings/BuildingTypeMap';
import { closestDistanceToBuildingFootprint } from '@/world/buildings/BuildingCollision';
import { createWaterMaterial }          from '@/world/WaterMaterial';
import type { SettlementFaction } from '@/overworld-studio';
import { territoryPlacementProbability, findTerritoryFaction } from '@/world/TerritoryDressing';
import {
  meshVulperiaWarrenMound, meshVulperiaBurrowHole, meshVulperiaDenMarker,
  meshUndeadGravestone, meshUndeadBonePile, meshUndeadCrumblingMound,
  meshFaeSmallMushroom, meshFaeLargeMushroom, meshFaeMushroomRing,
} from '@/world/buildings/FactionTerritoryProps';
import {
  factionBuildingDna,
  getFootprint,
  FLOOR_HEIGHT,
  type BuildingDNA,
  type Faction,
} from '@/world/buildings/BuildingDNA';
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
import { SpatialHash }                 from '@/core/SpatialHash';
import { buildCaveEntrance, isNearCaveEntrance, type BuiltCaveEntrance } from '@/world/CaveEntranceBuilder';
import { buildGladeEntrance, isNearGladeEntrance, type BuiltGladeEntrance } from '@/world/GladeEntranceBuilder';
import { buildTerrainGeometryData, getTerrainHeightAt } from '@/world/TerrainGeometryBuilder';
import { buildWaterMeshGeometryData } from '@/world/WaterMeshBuilder';
import type { RoadPathSegment } from '@/world/RoadPathSampler';
import { roadVariantTexture, GENERIC_ROAD_VARIANT } from '@/world/RoadTextures';
import { terrainVariantTexture } from '@/world/TerrainTextures';
import { chaikin } from '@/core/chaikin';
import { pickTreeArchetype, pickRockArchetype, hashIndex } from '@/world/NatureAssetDNA';
import { makeMottledCanvasTexture } from '@/world/NatureAssetBuilder';
import { getWaterInfoAt } from '@/world/WaterDetection';
import { ChunkManager, CHUNK_SIZE, type ChunkCoord } from '@/world/ChunkManager';
import { LEVEL_HEIGHT, OCEAN_DEEP_DEPTH_WU, physicalHeightWU } from '@/world/WaterDepthConfig';
import { SWIM_ENTER_DEPTH_THRESHOLD, SWIM_EXIT_DEPTH_THRESHOLD } from '@/player/PlayerController';
import { isScatterAllowed, isWaterDecorAllowed, isNearWaterTile } from '@/world/ScatterRules';
import { GrassField, GRASS_PRESETS } from '@/world/GrassField';
import { AmbientCreature, selectAmbientSpawnPoints, MAX_ACTIVE_AMBIENT_CREATURES } from '@/world/AmbientWildlife';
import { TrampleMap } from '@/world/GrassTrample';
import { mergeGroupMeshesByMaterial } from './MeshMergeUtils';
import { renderSettlementPlan } from './SettlementRenderer';

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
  /** Textured road sub-tile surface meshes (one per texture variant present
   *  in this chunk) — built alongside the main terrain mesh from the same
   *  buildTerrainGeometryData() call's roadGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See RoadPathSampler.ts /
   *  docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2. */
  roadMeshes: THREE.Mesh[];
  /** Textured ground surface meshes (one per ground-texture variant present
   *  in this chunk) — built alongside roadMeshes from the same
   *  buildTerrainGeometryData() call's groundGeometry output, sharing this
   *  chunk's own load/unload/enter/exit lifecycle. See TerrainTextures.ts /
   *  docs/superpowers/specs/2026-08-30-ground-tile-texture-variety-design.md. */
  groundMeshes: THREE.Mesh[];
  /** Peaceful ambient wildlife (rabbits/goats) spawned for this chunk — see
   *  AmbientWildlife.ts / docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md.
   *  Unlike tree/rock/grass scatter, these need individual per-frame movement updates, so
   *  they're tracked here (and in `_activeAmbientCreatures`) rather than merged into `scatter`. */
  ambientCreatures: AmbientCreature[];
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
  /** Trees/rocks placed via the dev-only OverworldEditor's paint_tree/
   *  paint_rock tools (applyEditorLayout()'s 'scatter_prop' case) — no
   *  chunk-streaming lifecycle, mirrors the existing editor-placed
   *  enemy_camp/resource_node bookkeeping style exactly. */
  private readonly _editorScatterProps: THREE.Group[] = [];
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
  /** World-space road centerlines (settlement streets + Chaikin-smoothed
   *  inter-settlement roads) computed once at construction time and passed
   *  to every per-chunk buildTerrainGeometryData() call, so a road bakes
   *  directly into the terrain sub-tile surface instead of being rendered
   *  as a separate overlay mesh (see RoadPathSampler.ts /
   *  docs/superpowers/plans/2026-08-30-biome-terrain-overhaul.md Phase 2). */
  private _roadPaths: RoadPathSegment[] = [];
  /** Settlement lamp-post props (post + lantern mesh) — decorative, no collider. */
  private _lampGroups: THREE.Group[] = [];
  /** Parallel array to _lampGroups — each lamp's point light, for per-frame intensity updates. */
  private _lampLights: THREE.PointLight[] = [];
  private _minimap!:   OWMinimap;
  private readonly _npcs: NPCEntity[] = [];
  /** Phase 7h — spatial hash for O(1) hostile-enemy proximity lookups. */
  private readonly _hostileHash = new SpatialHash<SlimeEnemy>(8);
  /** Flat running list of every currently-loaded chunk's ambient creatures, mirroring
   *  `_enemies` — appended to in `_loadTerrainChunk()`, spliced from in `_unloadTerrainChunk()`,
   *  ticked once per frame in `update()`. Capped at MAX_ACTIVE_AMBIENT_CREATURES globally. */
  private readonly _activeAmbientCreatures: AmbientCreature[] = [];
  /** Shared, single trampled-grass trail grid sampled by every GrassField below — one
   *  instance, not one per biome, so a trail reads continuously as the player crosses
   *  biome boundaries. See docs/superpowers/specs/2026-09-01-trampled-grass-trail-design.md. */
  private readonly _trampleMap = new TrampleMap();
  /** Phase 7h.2 — one draw call for all slime bodies (128 slots; enemies never exceed that). */
  private readonly _slimeIM: THREE.InstancedMesh = createSlimeBodyIM(128);
  /** Procedural grass — one `GrassField` per `GRASS_PRESETS` entry (grassland/savanna/forest/
   *  taiga/tundra, see batch 2's design spec). Built in the constructor once `this._wg`/
   *  `this._seed` are set (needs both, so it can't be a field initializer default like
   *  `_slimeIM` above, which has no such dependency). */
  private _grassFields!: GrassField[];

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
  private readonly _settlementPositions: Array<{ name: string; worldPos: THREE.Vector3; radius: number; faction: SettlementFaction }> = [];
  /** SI-4: which settlement (index into _settlementPositions) the player was inside last frame, or -1. */
  private _settlementInsideIdx = -1;

  /** Pre-built territory-dressing prop pool, one small set of variants per
   *  faction with a batch-1 implementation (vulperia/undead/fae) — built
   *  once at construction (see _buildTerritoryPropPool()), cloned (never
   *  rebuilt) at each qualifying scatter point in _buildChunkScatter().
   *  Phase 6 batch 1, see docs/superpowers/specs/2026-08-31-race-
   *  territory-dressing-design.md §2.5. */
  private readonly _territoryPropPool: Partial<Record<SettlementFaction, THREE.Group[]>> = {};

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

    // Must run BEFORE the ChunkManager below — the very first chunk load
    // (triggered synchronously a few lines down via flushPendingLoads())
    // already needs road path data to bake settlement streets/inter-
    // settlement roads into that chunk's terrain sub-tile surface.
    this._roadPaths = this._collectRoadPaths(worldData);

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
    this._buildTerritoryPropPool();
    this._grassFields = Object.values(GRASS_PRESETS).map(
      preset => new GrassField(this._wg, this._seed, preset, this._trampleMap),
    );
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
    for (const { mesh, body, scatter, colliders, roadMeshes, groundMeshes } of this._terrainChunkData.values()) {
      this.scene.add(mesh);
      body?.setEnabled(true);
      this.scene.add(scatter);
      for (const c of colliders) c.setEnabled(true);
      for (const rm of roadMeshes) this.scene.add(rm);
      for (const gm of groundMeshes) this.scene.add(gm);
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
    for (const gf of this._grassFields) this.scene.add(gf.mesh);
    for (const c of this._activeAmbientCreatures) this.scene.add(c.root);
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
    for (const { mesh, body, scatter, colliders, roadMeshes, groundMeshes } of this._terrainChunkData.values()) {
      this.scene.remove(mesh);
      body?.setEnabled(false);
      this.scene.remove(scatter);
      for (const c of colliders) c.setEnabled(false);
      for (const rm of roadMeshes) this.scene.remove(rm);
      for (const gm of groundMeshes) this.scene.remove(gm);
    }
    if (this._waterMesh)  this.scene.remove(this._waterMesh);
    for (const rm of this._roadMeshes) this.scene.remove(rm);
    for (const ru of this._ruins)        this.scene.remove(ru);
    for (const en of this._enemies)      this.scene.remove(en.group);
    this.scene.remove(this._slimeIM);   // Phase 7h.2
    for (const gf of this._grassFields) this.scene.remove(gf.mesh);
    for (const c of this._activeAmbientCreatures) this.scene.remove(c.root);
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

    // Trampled-grass trail: tick the shared grid BEFORE the grass fields' own update()
    // calls below, so their uTrampleCenter refresh reads this frame's (possibly just-
    // recentered) center, not the previous frame's stale one.
    this._trampleMap.update(pos.x, pos.z, dt);

    // Procedural grass (batch 2: 5 biome presets): rebuild each field's instance buffer
    // only when the player has moved past REBUILD_HYSTERESIS; tick wind uniforms every
    // frame. A given tile is only ever one biome, so at most one field actually places
    // blades near the player at a time — the others just do a cheap no-op update() call.
    for (const gf of this._grassFields) {
      gf.update(pos.x, pos.z);
      gf.tickWind(dt);
    }

    for (const creature of this._activeAmbientCreatures) creature.update(this._wg, pos, dt);

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
    for (const gf of this._grassFields) gf.dispose();
    this._trampleMap.dispose();
    for (const c of this._activeAmbientCreatures) c.dispose();
    this._activeAmbientCreatures.length = 0;
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

  /** Number of currently-active ambient wildlife creatures (for tests/dev-tooling). */
  getActiveAmbientCreatureCount(): number {
    return this._activeAmbientCreatures.length;
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

  /** First river/lake/ocean water-tile world position found by scanning the
   *  grid (or null). For tests/dev-tooling only — used to locate a water
   *  tile deterministically for visual verification without hardcoding
   *  seed-dependent coordinates. */
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
          if (cell.feature !== 'river' && cell.feature !== 'lake' && cell.biome !== 'ocean' && cell.biome !== 'deep_ocean') continue;
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

  /** First tile of the given biome found by scanning the grid (or null). For tests/dev-tooling
   *  verification of the procedural grass system (batch 2 — generalized from the batch-1-only
   *  `findFirstGrasslandTile()`) — mirrors `findFirstFordTile()`. */
  findFirstBiomeTile(biome: BiomeId): { x: number; z: number } | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        if (this._wg.get(col, row).biome !== biome) continue;
        return { x: (col - GHW) * T, z: (row - GHH) * T };
      }
    }
    return null;
  }

  /** Debug/dev-tooling only: per-biome grass instanced-mesh blade counts + scene membership
   *  (for verification scripts). Mirrors `getWaterMeshDebugInfo()`. `bladeCounts` is keyed by
   *  biome name (one entry per `GRASS_PRESETS` biome, e.g. `{ grassland: 8207, savanna: 0,
   *  tundra: 0, forest: 0, taiga: 0 }` when the player stands on a grassland tile). */
  getGrassDebugInfo(): { bladeCounts: Record<string, number>; inScene: boolean } {
    const bladeCounts: Record<string, number> = {};
    for (const gf of this._grassFields) bladeCounts[gf.preset.biome] = gf.mesh.count;
    return {
      bladeCounts,
      inScene: this._grassFields.every(gf => this.scene.children.includes(gf.mesh)),
    };
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
        case 'scatter_prop':
          this._spawnEditorScatterProp(item.wx, item.wz, item.propType);
          break;
      }
    }
  }

  /**
   * Spawn a single real tree/rock at (wx, wz), painted via the dev-only
   * OverworldEditor's paint_tree/paint_rock tools. Reuses the same
   * single-object builders (_makeTree/_makeRock) and elevation-aware
   * positioning convention as the procedural chunk-scatter builder
   * (_buildChunkScatter()) — a seeded rand keyed off position, matching
   * _spawnEditorCamp()'s existing pattern, so re-applying the same layout
   * always reproduces the same tree/rock variant deterministically.
   */
  private _spawnEditorScatterProp(wx: number, wz: number, propType: 'tree' | 'rock'): void {
    const rand = mulberry32(
      (Math.round(wx * 100) ^ Math.round(wz * 100)) >>> 0,
    );
    const { col, row } = this._wg.worldToGrid(wx, wz);
    const cell = this._wg.get(col, row);

    const grp = propType === 'tree'
      ? this._makeTree(rand, cell.biome, wx, wz)
      : this._makeRock(rand, wx, wz);
    grp.position.set(wx, cell.elevation * SH, wz);
    if (propType === 'tree') grp.rotation.y = rand() * Math.PI * 2;

    this._editorScatterProps.push(grp);
    if (this._isInScene) this.scene.add(grp);
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
   * Builds the world-space road centerlines fed to every per-chunk
   * buildTerrainGeometryData() call — the data that lets a road bake
   * directly into the terrain sub-tile surface (RoadPathSampler.ts)
   * instead of rendering as a separate overlay mesh (the previous overlay
   * approach was the root cause of the reported road z-fighting/flicker:
   * two coincident planes competing for the same depth). Two sources:
   *   - Settlement streets: each settlement's ward-model-derived
   *     `plan.roadRibbons` (already a continuous, organically-curved
   *     centerline), tagged with that settlement's own faction so
   *     `RoadTextures.ts` can give each race's streets a distinct texture.
   *   - Inter-settlement roads: `worldData.interRoadPaths`' per-edge tile
   *     paths are Chaikin-smoothed (same corner-cutting technique already
   *     used for river paths in RealmGenerator.ts) into an organic curve
   *     instead of staying locked to the A* path's blocky tile-by-tile
   *     turns, tagged with the generic (non-faction) open-road variant.
   */
  private _collectRoadPaths(worldData: WorldData): RoadPathSegment[] {
    const { _GHW: GHW, _GHH: GHH } = this;
    const paths: RoadPathSegment[] = [];

    for (const entry of worldData.settlements ?? []) {
      const { plan } = entry;
      for (const ribbon of plan.roadRibbons) {
        if (ribbon.points.length < 2) continue;
        paths.push({
          points: ribbon.points.map(p => ({
            x: (p.x + plan.centerCol - GHW) * T,
            z: (p.z + plan.centerRow - GHH) * T,
          })),
          width: ribbon.width,
          variant: plan.faction,
        });
      }
    }

    const INTER_ROAD_WIDTH = 1.5;
    for (const gridPath of worldData.interRoadPaths ?? []) {
      if (gridPath.length < 2) continue;
      // Chaikin-smooth in grid space first (matches RealmGenerator.ts's
      // river-smoothing convention), then convert tile centers to world
      // coordinates — turns the A*/L-shape path's blocky right-angle
      // turns into an organic curve.
      const smoothed = chaikin(gridPath.map(p => ({ x: p.col + 0.5, y: p.row + 0.5 })), 2);
      paths.push({
        points: smoothed.map(p => ({
          x: (p.x - GHW) * T,
          z: (p.y - GHH) * T,
        })),
        width: INTER_ROAD_WIDTH,
        variant: GENERIC_ROAD_VARIANT,
      });
    }

    return paths;
  }

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
    const { positions, normals, colors, indices, roadGeometry, groundGeometry } = buildTerrainGeometryData(
      this._wg, GW, GH, GHW, GHH, T, SH, colStart, rowStart, CHUNK_SIZE, CHUNK_SIZE,
      this._roadPaths,
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

    // Road sub-tile surface meshes — one per texture variant present in
    // this chunk. These fill exactly the holes the ground mesh above left
    // where a road sub-tile was classified as road instead of ground (see
    // buildTerrainGeometryData()'s roadGeometry doc comment), so there is
    // no second surface competing with the ground for the same footprint.
    const roadMeshes: THREE.Mesh[] = [];
    for (const [variant, rg] of Object.entries(roadGeometry)) {
      if (rg.indices.length === 0) continue;
      const roadGeo = new THREE.BufferGeometry();
      roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rg.positions, 3));
      roadGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(rg.normals, 3));
      roadGeo.setAttribute('color',    new THREE.Float32BufferAttribute(rg.colors, 3));
      roadGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(rg.uvs, 2));
      roadGeo.setIndex(rg.indices);
      const roadMesh = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
        map: roadVariantTexture(variant), vertexColors: true, roughness: 0.92, metalness: 0,
      }));
      if (this._isInScene) this.scene.add(roadMesh);
      roadMeshes.push(roadMesh);
    }

    // Textured ground surface meshes — one per ground-texture variant
    // present in this chunk. These fill exactly the tiles whose top face
    // was routed to groundGeometry instead of the plain vertex-color base
    // buffer above (see buildTerrainGeometryData()'s groundGeometry doc
    // comment / TerrainTextures.ts), so a covered biome renders with real
    // surface detail instead of a flat color.
    const groundMeshes: THREE.Mesh[] = [];
    for (const [variant, gg] of Object.entries(groundGeometry)) {
      if (gg.indices.length === 0) continue;
      const groundGeo = new THREE.BufferGeometry();
      groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(gg.positions, 3));
      groundGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(gg.normals, 3));
      groundGeo.setAttribute('color',    new THREE.Float32BufferAttribute(gg.colors, 3));
      groundGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(gg.uvs, 2));
      groundGeo.setIndex(gg.indices);
      const groundMesh = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
        map: terrainVariantTexture(variant), vertexColors: true, roughness: 0.95, metalness: 0,
      }));
      if (this._isInScene) this.scene.add(groundMesh);
      groundMeshes.push(groundMesh);
    }

    // The physics collider must cover the WHOLE tile surface (ground holes
    // + road sub-tiles both), even though the two are rendered as separate
    // meshes/materials visually — merge every road variant's triangles
    // into the same trimesh buffer the ground alone would otherwise use,
    // so walking over a road sub-tile can never fall through a "hole" that
    // only exists in the ground mesh's own visual buffer.
    const colliderPositions = positions.slice();
    const colliderIndices   = indices.slice();
    for (const rg of Object.values(roadGeometry)) {
      const vertOffset = colliderPositions.length / 3;
      colliderPositions.push(...rg.positions);
      for (const i of rg.indices) colliderIndices.push(i + vertOffset);
    }
    for (const gg of Object.values(groundGeometry)) {
      const vertOffset = colliderPositions.length / 3;
      colliderPositions.push(...gg.positions);
      for (const i of gg.indices) colliderIndices.push(i + vertOffset);
    }

    const body = (colliderIndices.length === 0)
      ? null
      : this.physics.createStaticTrimesh(new Float32Array(colliderPositions), new Uint32Array(colliderIndices));
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

    // Ambient wildlife — chunk-scoped like scatter, but tracked individually (not merged into
    // the static `scatter` group) since each creature needs its own per-frame movement update.
    const ambientCreatures: AmbientCreature[] = [];
    const chunkWorldSize = T * CHUNK_SIZE;
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;
    const spawnPoints = selectAmbientSpawnPoints(
      this._wg, originX, originZ, chunkWorldSize,
      (this._seed ^ 0x4A2E_1F87) ^ (coord.cx * 55871) ^ (coord.cz * 74653),
    );
    for (const sp of spawnPoints) {
      if (this._activeAmbientCreatures.length >= MAX_ACTIVE_AMBIENT_CREATURES) break;
      const spawnPos = new THREE.Vector3(sp.x, getTerrainHeightAt(this._wg, sp.x, sp.z), sp.z);
      const creature = new AmbientCreature(
        sp.species, spawnPos,
        (this._seed ^ 0x1B7A_9E33) ^ Math.round(sp.x * 131) ^ Math.round(sp.z * 977),
      );
      if (this._isInScene) this.scene.add(creature.root);
      ambientCreatures.push(creature);
      this._activeAmbientCreatures.push(creature);
    }

    const data: TerrainChunkData = { mesh, body, scatter, colliders, roadMeshes, groundMeshes, ambientCreatures };
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

    for (const rm of data.roadMeshes) {
      this.scene.remove(rm);
      rm.geometry.dispose();
      // The material instance is per-mesh (not shared) and safe to
      // dispose; the texture it references IS shared/cached across many
      // chunks (RoadTextures.ts's own module-level cache) and must NOT be
      // disposed here — Material.dispose() only releases the material
      // itself, never textures it references.
      (rm.material as THREE.Material).dispose();
    }

    for (const gm of data.groundMeshes) {
      this.scene.remove(gm);
      gm.geometry.dispose();
      // Same reasoning as roadMeshes above: the material is per-mesh and
      // safe to dispose, but the texture it references is shared/cached
      // across chunks (TerrainTextures.ts's own module-level canvas cache)
      // and must NOT be disposed here.
      (gm.material as THREE.Material).dispose();
    }

    this.scene.remove(data.scatter);
    data.scatter.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });

    for (const creature of data.ambientCreatures) {
      this.scene.remove(creature.root);
      creature.dispose();
      const idx = this._activeAmbientCreatures.indexOf(creature);
      if (idx !== -1) this._activeAmbientCreatures.splice(idx, 1);
    }
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
  /** Phase 6 batch 1: if (wx, wz) falls within a settlement's territory
   *  (a faction with a prop pool in this batch — vulperia/undead/fae),
   *  roll the distance-based gradient probability and, on a hit, return a
   *  cloned territory-dressing prop instead of the caller's normal
   *  tree/rock. Returns null (caller falls through to its normal scatter)
   *  when outside every territory, when the roll misses, or when the
   *  matched faction has no batch-1 prop pool yet. Cloning (not
   *  rebuilding) the pooled THREE.Group keeps this cheap per scatter
   *  point — see _buildTerritoryPropPool(). */
  private _tryPlaceTerritoryProp(wx: number, wz: number, wy: number, rand: () => number): THREE.Group | null {
    const match = findTerritoryFaction({ x: wx, z: wz }, this._settlementPositions);
    if (!match) return null;
    const pool = this._territoryPropPool[match.faction];
    if (!pool || pool.length === 0) return null;
    const probability = territoryPlacementProbability(match.distanceFromCenter, match.territoryRadius);
    if (rand() >= probability) return null;
    const template = pool[Math.floor(rand() * pool.length)]!;
    const prop = template.clone();
    prop.position.set(wx, wy, wz);
    prop.rotation.y = rand() * Math.PI * 2;
    prop.userData.scatterKind = 'territoryProp';
    return prop;
  }

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
      const territoryProp = this._tryPlaceTerritoryProp(wx, wz, cell.elevation * SH, rand);
      if (territoryProp) { group.add(territoryProp); continue; }
      const tree = this._makeTree(rand, cell.biome, wx, wz);
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
      const territoryProp = this._tryPlaceTerritoryProp(wx, wz, cell.elevation * SH, rand);
      if (territoryProp) { group.add(territoryProp); continue; }
      const rock = this._makeRock(rand, wx, wz);
      rock.position.set(wx, cell.elevation * SH, wz);
      rock.userData.scatterKind = 'rock';
      group.add(rock);
    }

    this._buildChunkBushes(coord, group);
    this._buildChunkBeachDecor(coord, group);
    this._buildChunkWaterDecor(coord, group);

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
   * Build a single semi-transparent water mesh for all river / lake / water-
   * biome tiles. Each qualifying tile gets a flat quad placed at
   * `elevation × SH + 0.05` (just above the terrain top face).  All quads
   * are merged into one BufferGeometry → one draw call, `depthWrite:false`
   * prevents z-fighting.
   */
  private _buildWaterMesh(): THREE.Mesh | null {
    const { _GW: GW, _GH: GH, _GHW: GHW, _GHH: GHH } = this;
    const { positions: pos, indices: idx } = buildWaterMeshGeometryData(this._wg, GW, GH, GHW, GHH, T, SH);

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

  private _makeTree(rand: () => number, biome: BiomeId, wx: number, wz: number): THREE.Group {
    const archetype = pickTreeArchetype(biome, wx, wz);
    if (archetype === 'deciduous')  return this._buildDeciduousTree(rand);
    if (archetype === 'sparse')     return this._buildSparseTree(rand);
    if (archetype === 'cactus')     return this._buildCactusTree(rand, wx, wz);
    if (archetype === 'acacia')     return this._buildAcaciaTree(rand);
    if (archetype === 'joshuatree') return this._buildJoshuaTree(rand);
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

  /** Dispatches to one of 3 cactus silhouettes, deterministically chosen
   *  per-position (independent of the archetype-selection hash) — desert's
   *  primary flora, per NatureAssetDNA.ts's BIOME_TREE_ARCHETYPES. */
  private _buildCactusTree(rand: () => number, wx: number, wz: number): THREE.Group {
    const variant = (['saguaro', 'barrel', 'pricklypear'] as const)[hashIndex(wx, wz, 3)]!;
    if (variant === 'barrel')      return this._buildBarrelCactus(rand);
    if (variant === 'pricklypear') return this._buildPricklyPearCactus(rand);
    return this._buildSaguaroCactus(rand);
  }

  /** Saguaro-style cactus — a vertical trunk cylinder with 0-2 shorter
   *  vertical "arm" cylinders offset to either side. */
  private _buildSaguaroCactus(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const trunkH = 1.6 + rand() * 1.4;
    const trunkR = 0.16 + rand() * 0.07;
    const mat = this._pooledMaterial(
      'cactus-saguaro',
      [0x3f7d32, 0x3f7d32 + 0x010100, 0x3f7d32 + 0x020200, 0x3f7d32 + 0x030300],
      rand,
      0.16,
    );

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR, trunkR * 1.1, trunkH, 8), mat);
    trunk.position.y = trunkH / 2;
    g.add(trunk);

    // 0-2 short vertical side arms, a classic saguaro silhouette.
    const armCount = Math.floor(rand() * 3);
    for (let i = 0; i < armCount; i++) {
      const armH = 0.5 + rand() * 0.5;
      const armR = trunkR * 0.7;
      const side = i % 2 === 0 ? 1 : -1;
      const armY = trunkH * (0.35 + rand() * 0.35);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(armR, armR * 1.05, armH, 6), mat);
      arm.position.set(side * (trunkR + armR + 0.02), armY + armH / 2, 0);
      g.add(arm);
    }

    return g;
  }

  /** Short, squat, ribbed-reading barrel cactus — a single wide cylinder
   *  body with a rounded dome cap, no arms. */
  private _buildBarrelCactus(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const r = 0.32 + rand() * 0.18;
    const h = r * (1.3 + rand() * 0.6);
    const mat = this._pooledMaterial(
      'cactus-barrel',
      [0x4a8a3a, 0x4a8a3a + 0x010100, 0x4a8a3a + 0x020200, 0x4a8a3a + 0x030300],
      rand,
      0.14,
    );

    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, h, 10), mat);
    body.position.y = h / 2;
    g.add(body);

    // Rounded dome cap so the top doesn't read as a flat-cut cylinder.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.88, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    cap.position.y = h;
    g.add(cap);

    return g;
  }

  /** Prickly-pear-style cactus — a chain of 2-4 flattened oval "paddle"
   *  pads branching upward and outward from the base. */
  private _buildPricklyPearCactus(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const mat = this._pooledMaterial(
      'cactus-pad',
      [0x3f8a3a, 0x3f8a3a + 0x010100, 0x3f8a3a + 0x020200, 0x3f8a3a + 0x030300],
      rand,
      0.15,
    );

    const padCount = 2 + Math.floor(rand() * 3);
    let px = 0, py = 0.05, pz = 0;
    for (let i = 0; i < padCount; i++) {
      const padW = 0.38 + rand() * 0.22;
      const padH = 0.42 + rand() * 0.22;
      const pad = new THREE.Mesh(new THREE.SphereGeometry(padW, 8, 6), mat);
      pad.scale.set(1, padH / padW, 0.26); // flatten into an oval paddle
      const angle = rand() * Math.PI * 2;
      const lean = 0.14 + rand() * 0.22;
      px += Math.cos(angle) * lean;
      pz += Math.sin(angle) * lean;
      py += padH * 0.65;
      pad.position.set(px, py, pz);
      pad.rotation.y = angle;
      pad.rotation.z = (rand() - 0.5) * 0.4;
      g.add(pad);
    }

    return g;
  }

  /** Short gnarled trunk topped by a wide, flat-topped "umbrella" canopy —
   *  savanna's tree archetype, distinct from conifer's tall narrow cone
   *  stack and deciduous's rounded lumpy canopy (see NatureAssetDNA.ts's
   *  BIOME_TREE_ARCHETYPES). Built from several vertically-flattened
   *  overlapping blobs arranged in a wide ring (same overlapping-blob
   *  technique as _buildDeciduousTree(), squashed and ring-arranged
   *  instead of clustered) so the canopy has real rounded volume at its
   *  silhouette edges instead of a flat cone's hard, pancake-like edge. */
  private _buildAcaciaTree(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const trunkH = 1.3 + rand() * 0.7;
    const trunkR = 0.10 + rand() * 0.05;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.55, trunkR, trunkH, 6),
      this._pooledMaterial('acacia-trunk', [0x4a3820, 0x4a3820 + 0x010100], rand),
    );
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25; // slight gnarled lean
    g.add(trunk);

    const canopyMat = this._pooledMaterial(
      'acacia-canopy',
      [0x5c7a2e, 0x5c7a2e + 0x010100, 0x5c7a2e + 0x020200, 0x5c7a2e + 0x030300],
      rand,
      0.2,
    );

    const canopyY = trunkH + 0.15;
    const ringR = 0.85 + rand() * 0.5;
    const blobCount = 5 + Math.floor(rand() * 2);
    for (let i = 0; i < blobCount; i++) {
      const radius = 0.55 + rand() * 0.35;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 0), canopyMat);
      blob.scale.set(1, 0.38, 1); // squash vertically -> flat umbrella look
      const angle = (i / blobCount) * Math.PI * 2 + rand() * 0.4;
      blob.position.set(
        Math.cos(angle) * ringR,
        canopyY + rand() * 0.1,
        Math.sin(angle) * ringR,
      );
      g.add(blob);
    }
    // Center blob fills the middle so the ring doesn't read as a hollow donut.
    const centerBlob = new THREE.Mesh(new THREE.IcosahedronGeometry(ringR * 0.7, 0), canopyMat);
    centerBlob.scale.set(1, 0.4, 1);
    centerBlob.position.y = canopyY;
    g.add(centerBlob);

    return g;
  }

  /** Joshua-tree-style sparse desert tree — a twisted, leafless trunk with
   *  1-3 upward-angled branch arms, each ending in a spiky yucca-like
   *  tuft (radiating thin cones, no rounded "leaf" canopy mass at all).
   *  Desert's occasional tall-tree archetype, per NatureAssetDNA.ts's
   *  BIOME_TREE_ARCHETYPES (cactus dominates; this appears ~1-in-4). */
  private _buildJoshuaTree(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    const trunkH = 1.2 + rand() * 1.0;
    const trunkR = 0.14 + rand() * 0.05;
    const trunkMat = this._pooledMaterial(
      'joshuatree-trunk',
      [0x6b5a3a, 0x6b5a3a + 0x010100, 0x6b5a3a + 0x020200, 0x6b5a3a + 0x030300],
      rand,
      0.15,
    );
    const spikeMat = this._pooledMaterial(
      'joshuatree-spike',
      [0x4a6b3a, 0x4a6b3a + 0x010100, 0x4a6b3a + 0x020200],
      rand,
      0.12,
    );

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.85, trunkR, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    g.add(trunk);

    // Radiating thin cone "spikes" around a tuft point — no rounded
    // canopy mass, matching the "no leafs" yucca-spike look. `parent`
    // receives the spikes as children so they automatically inherit
    // whatever position/rotation the caller already applied to it.
    const addSpikyTuft = (parent: THREE.Object3D, atLocalY: number, scale: number): void => {
      const spikeCount = 7 + Math.floor(rand() * 5);
      for (let s = 0; s < spikeCount; s++) {
        const spikeLen = (0.16 + rand() * 0.12) * scale;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, spikeLen, 4), spikeMat);
        const sAngle = (s / spikeCount) * Math.PI * 2 + rand() * 0.3;
        const sTilt = 0.35 + rand() * 0.55;
        spike.position.y = atLocalY + spikeLen * 0.4 * Math.cos(sTilt);
        spike.rotation.z = Math.cos(sAngle) * sTilt;
        spike.rotation.x = Math.sin(sAngle) * sTilt;
        parent.add(spike);
      }
    };

    // Main trunk crown tuft.
    addSpikyTuft(g, trunkH, 1.0);

    // 1-3 branch arms, each its own tilted Group (so its local +Y points
    // "up the branch"), with its own spiky tuft parented directly to it.
    const branchCount = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < branchCount; i++) {
      const branchLen = 0.5 + rand() * 0.5;
      const branchR = trunkR * 0.6;
      const branchGroup = new THREE.Group();
      branchGroup.position.y = trunkH * (0.45 + rand() * 0.4);
      const angle = (i / branchCount) * Math.PI * 2 + rand() * 0.8;
      branchGroup.rotation.y = angle;
      branchGroup.rotation.z = 0.5 + rand() * 0.5;

      const branch = new THREE.Mesh(new THREE.CylinderGeometry(branchR * 0.7, branchR, branchLen, 5), trunkMat);
      branch.position.y = branchLen / 2;
      branchGroup.add(branch);

      addSpikyTuft(branchGroup, branchLen, 0.8 + rand() * 0.3);
      g.add(branchGroup);
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

  /**
   * Scatters shoreline reeds (any dry tile adjacent to river/lake/ocean water,
   * excluding beach which already has its own decor) and underwater rock/seaweed
   * props (any actually-submerged tile) — see design spec
   * docs/superpowers/specs/2026-09-01-water-riverbank-decor-props-design.md.
   *
   * **2026-09-02 revision:** the original spacing (2.4/3.5 WU) read as "sticks
   * randomly dumped in the water" rather than natural vegetation — a lake's
   * entire non-beach shoreline ring qualifies for reeds, so a tight spacing put
   * a cluster on nearly every qualifying tile, and thin seaweed blades read as
   * isolated dark line segments from this game's steep top-down isometric
   * angle no matter how much a single blade is widened. Fixed by widening the
   * spacing considerably (fewer, more spread-out clusters — reads as occasional
   * accents, not a hedge) while making each cluster denser (so an individual
   * clump still reads as a real patch of vegetation up close), and by favouring
   * underwater rocks over seaweed (rocks read well from this angle — the
   * "lake beds have more assets and texture now" feedback was specifically
   * about them — while thin seaweed blades are the main "stick" offender).
   * Two independent poissonDisk passes, each with its own seed salt so their
   * point sets don't correlate with any other scatter pass this chunk already
   * runs. Purely decorative (no collider), reusing `_pooledMaterial()` and
   * folded into the same `mergeGroupMeshesByMaterial(group)` pass as everything
   * else in `_buildChunkScatter()`.
   */
  private _buildChunkWaterDecor(coord: ChunkCoord, group: THREE.Group): void {
    const { _GHW: GHW, _GHH: GHH } = this;
    const chunkWorldSize = T * CHUNK_SIZE;
    const { colStart, rowStart } = this._chunkGridOrigin(coord);
    const originX = (colStart - GHW) * T;
    const originZ = (rowStart - GHH) * T;

    const reedRand = mulberry32((this._seed ^ 0x2B81_4F6D) ^ (coord.cx * 65599) ^ (coord.cz * 96179));
    // Widened from 2.4 -> 5.5 WU: a lake/river's entire non-beach shoreline
    // ring qualifies for reeds, so the original tight spacing put a cluster
    // on nearly every qualifying tile, reading as a scattered mess rather
    // than occasional shoreline accents.
    const reedPts = poissonDisk(chunkWorldSize, chunkWorldSize, 5.5, reedRand);
    for (const [px, pz] of reedPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isWaterDecorAllowed(cell, 'reed')) continue;
      if (!isNearWaterTile(this._wg, c, r)) continue;
      const reed = this._makeReedCluster(reedRand);
      reed.position.set(wx, cell.elevation * SH, wz);
      reed.rotation.y = reedRand() * Math.PI * 2;
      reed.userData.scatterKind = 'decor';
      group.add(reed);
    }

    const waterRand = mulberry32((this._seed ^ 0x71DA_2C93) ^ (coord.cx * 54983) ^ (coord.cz * 41729));
    // Widened from 3.5 -> 6.0 WU: fewer, more spread-out props read as
    // occasional lake-bed features rather than debris scattered across the
    // whole water surface.
    const waterPts = poissonDisk(chunkWorldSize, chunkWorldSize, 6.0, waterRand);
    for (const [px, pz] of waterPts) {
      const wx = originX + px;
      const wz = originZ + pz;
      const c = Math.floor(wx / T + GHW);
      const r = Math.floor(wz / T + GHH);
      const cell = this._wg.get(c, r);
      if (!isWaterDecorAllowed(cell, 'underwater')) continue;
      // Favour rocks (0.8) over seaweed (0.2) — rocks read well from this
      // game's steep top-down isometric angle ("lake beds have more assets
      // and texture now" feedback was specifically about them) while thin
      // seaweed blades are the main "looks like randomly dumped sticks"
      // offender no matter how much a single blade is widened.
      const prop = waterRand() < 0.8 ? this._makeUnderwaterRocks(waterRand) : this._makeSeaweed(waterRand);
      prop.position.set(wx, physicalHeightWU(cell, SH), wz);
      prop.rotation.y = waterRand() * Math.PI * 2;
      prop.userData.scatterKind = 'decor';
      group.add(prop);
    }
  }

  private _makeReedCluster(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // Cool, wet green — distinct from dune grass's dry tan-green (0x9a9660).
    const mat = this._pooledMaterial(
      'reeds',
      [0x4a6a3a, 0x4a6a3a + 0x030602, 0x4a6a3a + 0x060c04, 0x4a6a3a + 0x091206],
      rand,
      0.20,
    );
    const bladeCount = 8 + Math.floor(rand() * 6); // 8..13 blades — a full, bushy clump
                                                    // (was 4..7: too sparse, individual
                                                    // blades read as isolated sticks from
                                                    // this game's steep top-down angle)
    for (let i = 0; i < bladeCount; i++) {
      const h = 0.4 + rand() * 0.3; // shorter (was 0.55-1.05) — less stick-like from above
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, h, 4), mat);
      const angle = (i / bladeCount) * Math.PI * 2 + rand() * 0.4;
      const spread = 0.06 + rand() * 0.1;
      blade.position.set(Math.cos(angle) * spread, h / 2, Math.sin(angle) * spread);
      blade.rotation.z = (rand() - 0.5) * 0.25;
      g.add(blade);
    }
    return g;
  }

  private _makeUnderwaterRocks(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // Darker, more saturated than beach pebbles (0x8a8478) — a wet, algae-tinged look.
    // Sized up somewhat from the original beach-pebbles proportions (0.08-0.18 radius) —
    // the isometric camera's steep top-down angle already reads chunky rock silhouettes
    // reasonably well (unlike thin blade props), so this is mostly about making sure a
    // cluster reads as a real cluster rather than a barely-visible speck at typical
    // camera distance from the water surface.
    const mat = this._pooledMaterial(
      'underwater-rocks',
      [0x3a4038, 0x3a4038 + 0x020402, 0x3a4038 + 0x040804, 0x3a4038 + 0x060c06],
      rand,
      0.12,
    );
    const pieceCount = 3 + Math.floor(rand() * 3); // 3..5 pieces
    for (let i = 0; i < pieceCount; i++) {
      const pr = 0.16 + rand() * 0.18;
      const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(pr, 0), mat);
      const angle = rand() * Math.PI * 2;
      const spread = rand() * 0.28;
      piece.position.set(Math.cos(angle) * spread, pr * 0.5, Math.sin(angle) * spread);
      piece.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      piece.scale.set(1, 0.5 + rand() * 0.3, 0.8 + rand() * 0.3);
      g.add(piece);
    }
    return g;
  }

  private _makeSeaweed(rand: () => number): THREE.Group {
    const g = new THREE.Group();
    // Brownish-green, distinct from both reeds and land grass — reads as
    // submerged plant matter rather than anything growing in open air.
    const mat = this._pooledMaterial(
      'seaweed',
      [0x3a5030, 0x3a5030 + 0x040602, 0x3a5030 + 0x080c04],
      rand,
      0.18,
    );
    const bladeCount = 6 + Math.floor(rand() * 4); // 6..9 blades — a fuller clump
                                                    // (was 3..4: too sparse, read as
                                                    // isolated sticks from this game's
                                                    // steep top-down angle)
    for (let i = 0; i < bladeCount; i++) {
      const h = 0.35 + rand() * 0.3; // shorter (was 0.7-1.5) — less stick-like from above
      // A gently curved blade: a thin box, tilted and twisted, rather than a
      // straight cone — reads more like a soft underwater plant swaying in
      // place than a rigid land blade. Widened from an original 0.05 to 0.15 —
      // a viewer looking almost straight down (this game's isometric camera)
      // sees very little of a thin vertical blade's length, so the blade's
      // WIDTH is what actually determines its visible footprint from that
      // angle; too thin and the whole clump reads as barely-there specks.
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, 0.04), mat);
      const angle = (i / bladeCount) * Math.PI * 2 + rand() * 0.6;
      const spread = 0.05 + rand() * 0.09;
      blade.position.set(Math.cos(angle) * spread, h / 2, Math.sin(angle) * spread);
      blade.rotation.z = (rand() - 0.5) * 0.5;
      blade.rotation.y = rand() * Math.PI * 2;
      g.add(blade);
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
          roadRibbons: [],
          population: 0,
          wardFeatures: [],
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
    const runtimeFaction = mapStudioFactionToRuntimeFaction(payload.faction);
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
      faction: payload.faction as SettlementFaction,
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
        faction:  plan.faction as SettlementFaction,
      });
    }

    // Settlement roads (streets + inter-settlement) are baked directly into
    // the terrain sub-tile surface via `this._roadPaths`/`_collectRoadPaths()`
    // (computed once at construction time, before terrain chunks first
    // load) — see RoadPathSampler.ts / TerrainGeometryBuilder.ts's
    // roadGeometry output and the plan doc's Phase 2 "roads as a first-
    // class terrain surface" item. No separate road overlay geometry is
    // built here anymore.

    for (const entry of settlements) {
      const { plan } = entry;

      const result = renderSettlementPlan(
        plan,
        this._wg,
        GHW,
        GHH,
        {
          registerBuildingCollider: (dna, pos, rotationY) => this.registerBuildingCollider(dna, pos, rotationY),
          mapFaction: (f) => mapStudioFactionToRuntimeFaction(f),
        },
      );

      for (const grp of result.buildingGroups) {
        this._buildingGroups.push(grp);
      }
      // Ward feature clusters (park-ward Sacred Grove/Slime Pool/etc.) are
      // decorative, non-collider props — reuse the same add/dispose array
      // as buildings since OverworldScene treats _buildingGroups generically.
      for (const grp of result.featureGroups) {
        this._buildingGroups.push(grp);
      }

      for (const grp of result.lampGroups)   this._lampGroups.push(grp);
      for (const lt  of result.lampLights)   this._lampLights.push(lt);

      const runtimeFaction = mapStudioFactionToRuntimeFaction(plan.faction);
      for (const rec of result.buildingRecords) {
        if (rec.isAnchor) {
          this._buildingData.push({ dna: rec.dna, pos: rec.pos, faction: runtimeFaction, rotationY: rec.rotationY });
        }
      }
    }

    this._buildStudioSettlementPreview();
  }

  /** Builds the small pre-built pool of territory-dressing prop variants
   *  for every faction with a batch-1 implementation. Called once from
   *  the constructor — see the call site added in the constructor's
   *  init sequence just below _buildSettlements(). */
  private _buildTerritoryPropPool(): void {
    this._territoryPropPool.vulperia = [
      meshVulperiaWarrenMound(1), meshVulperiaWarrenMound(2),
      meshVulperiaBurrowHole(3), meshVulperiaDenMarker(),
    ];
    this._territoryPropPool.undead = [
      meshUndeadGravestone(), meshUndeadBonePile(4),
      meshUndeadBonePile(5), meshUndeadCrumblingMound(6),
    ];
    this._territoryPropPool.fae = [
      meshFaeSmallMushroom(), meshFaeSmallMushroom(),
      meshFaeLargeMushroom(), meshFaeMushroomRing(7),
    ];
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
            if (cell.feature === 'river' || cell.feature === 'lake' || cell.biome === 'ocean' || cell.biome === 'deep_ocean') {
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
