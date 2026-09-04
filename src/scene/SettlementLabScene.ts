/**
 * SettlementLabScene — a minimal dev-sandbox scene for regenerating and
 * inspecting a single settlement plan interactively, powered by
 * SettlementLabPanel.
 *
 * Lifecycle: constructor → enter() → [update(dt) loop] → exit()
 * Mirrors WaterLabScene's guarded _entered pattern.
 */

import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { PlayerController } from '@/player/PlayerController';
import { WorldGrid } from '@/world/WorldGrid';
import {
  planSettlement,
  applySettlementToGrid,
  type SettlementType,
  type PlacedBuilding,
} from '@/world/SettlementGenerator';
import type { LayoutType } from '@/world/SettlementModelGenerator';
import {
  renderSettlementPlan,
  type SettlementRenderResult,
} from '@/scene/SettlementRenderer';
import { mapStudioFactionToRuntimeFaction } from '@/world/buildings/BuildingTypeMap';
import { getFootprint, FLOOR_HEIGHT, type BuildingKind } from '@/world/buildings/BuildingDNA';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { SettlementLabPanel } from '@/ui/SettlementLabPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SIZE    = 64;
const TILE_UNIT    = 2;  // matches WorldGrid.tileUnit
const DEFAULT_SEED = 42;

// planSettlement()'s _valid() rejects any tile with elevation < 1 (treats it
// as below the settleable plateau), so the Lab's grid is force-flattened to
// this exact value everywhere. Buildings/roads are then rendered at
// GRID_ELEVATION * LEVEL_HEIGHT (see SettlementRenderer.ts / _regenerate()
// below) — the ground plane MUST sit at that same height, or everything
// renders floating above (or sunk below) a ground plane that doesn't match.
const GRID_ELEVATION = 1;

const SETTLEMENT_TYPES: SettlementType[] = ['village', 'town', 'city'];
const STUDIO_FACTIONS = [
  'human', 'elven', 'dwarven', 'orcish',
  'vampire', 'undead', 'vulperia', 'slime', 'fae',
];
const LAYOUTS: LayoutType[] = [
  'auto', 'organic', 'grid', 'linear',
  'radial', 'terraced', 'perimeter', 'cluster',
];

/**
 * Race-by-race procedural building POC rollout (see
 * TODO/organic_world_tiles_todo.md's Phase 6): as each race gets its own
 * researched "kit of parts" building(s), simply selecting that faction here
 * shows ONLY that race's new building(s), not the old generic mix —
 * exactly what the user asked for ("clear out the current elven buildings
 * ... and only have the towers so I can see them"), with zero extra UI
 * (no dropdown/toggle — picking the faction IS the override). Add an entry
 * here as each race's POC building ships; relax it to a per-building
 * SHOWCASE function (see `RenderContext.forceBuildingKind`'s function-form
 * doc comment) once a race has enough shipped building kinds that forcing
 * the WHOLE settlement to one single kind stops being useful for reviewing
 * everything at once (2026-09-04: elven crossed that line at 4 kits —
 * tower/treehouse-residential/market-stall/chapel).
 *
 * A plain `BuildingKind` value here forces EVERY building to that one
 * kind (the original single-kind isolation behavior, still available for
 * a race that's only shipped one kit so far). A function value instead
 * forces only SOME buildings (returning `undefined` for the rest falls
 * through to their normal ward-based kind) — used once a race has enough
 * variety that showing it all together is more useful than isolating one
 * kind.
 */
const POC_KIND_OVERRIDE_BY_FACTION: Partial<Record<string, BuildingKind | ((b: PlacedBuilding, index: number) => BuildingKind | undefined)>> = {
  // Elven now has 4 shipped building kits: the stone tower (watchtower/
  // tower kinds), the living-tree residential home (villa/house/terraced/
  // inn/blacksmith kinds, all via the same builder), the market stall
  // (shop kind), and the chapel (chapel kind) -- all reachable via normal
  // WARD_TO_KIND ward mapping EXCEPT watchtower/tower, which have no
  // WARD_TO_KIND entry at all and so never spawn naturally. Forcing the
  // very first building in the plan to 'watchtower' guarantees the tower
  // kit is always present alongside whatever natural ward variety the
  // settlement produces, so every shipped elven building type can be
  // reviewed together in one "Play in 3D" session instead of forcing the
  // whole settlement to a single isolated kind.
  elven: (_b, index) => (index === 0 ? 'watchtower' : undefined),
};

// ── Regenerate params type ────────────────────────────────────────────────────

export interface RegenParams {
  seed:    number;
  type:    string;
  faction: string;
  layout:  string;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export class SettlementLabScene {
  private readonly _scene:   THREE.Scene;
  private readonly _physics: PhysicsWorld;

  private _entered = false;

  // Ground
  private _groundMesh:     THREE.Mesh | null         = null;
  private _groundBody:     RAPIER.RigidBody | null   = null;

  // Current settlement render result
  private _renderResult:   SettlementRenderResult | null = null;
  private _roadMeshes:     THREE.Mesh[]                  = [];
  private _buildingBodies: RAPIER.RigidBody[]            = [];

  // Panel
  private _panel!: SettlementLabPanel;

  constructor(
    scene:   THREE.Scene,
    physics: PhysicsWorld,
    _player: PlayerController,
  ) {
    this._scene   = scene;
    this._physics = physics;
  }

  /**
   * @param initialParams Optional settlement to render on entry, carried
   *   over from Overworld Studio's Settlement tab "Play in 3D" button (see
   *   DevRoomHandoff.ts's `SettlementLabLaunchParams` / `readPendingSettlementLabParams`)
   *   instead of the Lab's own hardcoded default (seed 42 / village / human /
   *   auto). `type`/`faction`/`layout` are individually validated against
   *   this Lab's known-good option lists — an invalid/unrecognised value
   *   for any one of them falls back to that field's default rather than
   *   throwing or producing an inconsistent panel state; `seed` is used
   *   verbatim since any finite number is valid.
   */
  enter(initialParams?: RegenParams): void {
    if (this._entered) return;
    this._entered = true;

    // ── Ground plane ────────────────────────────────────────────────────────
    // Positioned at GRID_ELEVATION * LEVEL_HEIGHT to match the flattened
    // grid's elevation plateau (see GRID_ELEVATION doc comment above) —
    // previously this sat at y=0 while buildings/roads rendered at
    // y≈0.55, leaving everything visibly floating above a ground plane
    // that was a full elevation-step too low.
    const groundY  = GRID_ELEVATION * LEVEL_HEIGHT;
    const groundW = GRID_SIZE * TILE_UNIT;
    const groundH = GRID_SIZE * TILE_UNIT;
    const groundGeo = new THREE.PlaneGeometry(groundW, groundH);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5a7a40 });
    this._groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this._groundMesh.rotation.x = -Math.PI / 2;
    this._groundMesh.position.y = groundY;
    this._scene.add(this._groundMesh);

    this._groundBody = this._physics.createStaticBox(
      new THREE.Vector3(0, groundY - 0.05, 0),
      new THREE.Vector3(groundW / 2, 0.05, groundH / 2),
    );

    const seed    = initialParams?.seed ?? DEFAULT_SEED;
    const type    = initialParams && SETTLEMENT_TYPES.includes(initialParams.type as SettlementType)
      ? initialParams.type : 'village';
    const faction = initialParams && STUDIO_FACTIONS.includes(initialParams.faction)
      ? initialParams.faction : 'human';
    const layout  = initialParams && LAYOUTS.includes(initialParams.layout as LayoutType)
      ? initialParams.layout : 'auto';

    // ── Panel ────────────────────────────────────────────────────────────────
    this._panel = new SettlementLabPanel({
      initialSeed:     seed,
      settlementTypes: SETTLEMENT_TYPES,
      factions:        STUDIO_FACTIONS,
      layouts:         LAYOUTS,
      initialType:     type,
      initialFaction:  faction,
      initialLayout:   layout,
      onRegenerate:    (params) => this._regenerate(params),
    });
    document.body.appendChild(this._panel.rootEl);

    // ── Initial settlement ────────────────────────────────────────────────
    this._regenerate({ seed, type, faction, layout });
  }

  exit(): void {
    if (!this._entered) return;

    this._clearSettlement();

    // Ground
    if (this._groundMesh) {
      this._scene.remove(this._groundMesh);
      (this._groundMesh.geometry as THREE.BufferGeometry).dispose();
      (this._groundMesh.material as THREE.Material).dispose();
      this._groundMesh = null;
    }
    if (this._groundBody) {
      this._physics.removeBody(this._groundBody);
      this._groundBody = null;
    }

    this._panel.dispose();

    this._entered = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_dt: number): void {
    // No per-frame simulation needed in this lab.
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _regenerate(params: RegenParams): void {
    this._clearSettlement();

    // Build a fresh grid (set elevation=1 so _valid() passes for all tiles)
    const grid = new WorldGrid(GRID_SIZE, GRID_SIZE);
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        grid.set(col, row, { elevation: GRID_ELEVATION });
      }
    }

    const centerCol = Math.floor(GRID_SIZE / 2);
    const centerRow = Math.floor(GRID_SIZE / 2);

    const plan = planSettlement(
      params.type as SettlementType,
      centerCol,
      centerRow,
      params.seed,
      grid,
      undefined,
      params.faction,
      params.layout as LayoutType,
    );

    applySettlementToGrid(plan, grid, 0);

    const ghw = centerCol; // grid-half-width passed to renderSettlementPlan
    const ghh = centerRow; // grid-half-height

    // Race-by-race POC override (see POC_KIND_OVERRIDE_BY_FACTION's doc
    // comment) — picking a faction that has a shipped POC building
    // automatically shows ONLY that building, no separate UI action needed.
    const forceBuildingKind = POC_KIND_OVERRIDE_BY_FACTION[params.faction];

    const result = renderSettlementPlan(plan, grid, ghw, ghh, {
      registerBuildingCollider: (dna, pos, rotationY) => {
        const fp    = getFootprint(dna.buildingKind, dna.size);
        const halfH = (dna.floors * FLOOR_HEIGHT) / 2;
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          rotationY,
        );
        const body = this._physics.createStaticRotatedBox(
          new THREE.Vector3(pos.x, pos.y + halfH, pos.z),
          rotQuat,
          new THREE.Vector3(fp.w / 2, halfH, fp.d / 2),
        );
        this._buildingBodies.push(body);
      },
      mapFaction: mapStudioFactionToRuntimeFaction,
      forceBuildingKind,
    });

    this._renderResult = result;

    // Add buildings + lamps. lampLights are NOT added separately: each light
    // is already a child of its lamp group (added by makeLampPost()) — this
    // mirrors OverworldScene's usage, where _lampLights is only a parallel
    // bookkeeping array read/written for intensity toggling, never re-added
    // to the scene. Object3D.add() reparents on call, so doing `scene.add(lt)`
    // here would rip each light out of its lamp group and collapse it to
    // world position (0, 1.42, 0) instead of illuminating its actual post.
    for (const grp of result.buildingGroups) this._scene.add(grp);
    for (const grp of result.lampGroups)     this._scene.add(grp);
    for (const grp of result.featureGroups)  this._scene.add(grp);

    // Add ribbon-mesh streets (continuous, replaces the old per-tile flat
    // quads — see SettlementRenderer.ts's buildRoadRibbonMeshes()). Meshes
    // are already positioned/textured; just add and track for disposal.
    for (const mesh of result.roadRibbonMeshes) {
      this._scene.add(mesh);
      this._roadMeshes.push(mesh);
    }

    const overrideLabel = typeof forceBuildingKind === 'function'
      ? `showcase (all ${params.faction} kits)`
      : forceBuildingKind;
    const readout = [
      `buildings: ${result.buildingGroups.length}`,
      `roads: ${result.roadRibbonMeshes.length}`,
      `lamps: ${result.lampGroups.length}`,
      `features: ${result.featureGroups.length}`,
      overrideLabel ? `POC override: ${overrideLabel}` : null,
    ].filter((s): s is string => s !== null).join('  |  ');
    this._panel.setReadout(readout);
  }

  private _clearSettlement(): void {
    if (this._renderResult) {
      for (const grp of this._renderResult.buildingGroups) {
        this._scene.remove(grp);
        grp.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach(mt => mt.dispose());
            } else {
              (m.material as THREE.Material)?.dispose();
            }
          }
        });
      }
      for (const grp of this._renderResult.lampGroups) {
        this._scene.remove(grp);
        grp.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach(mt => mt.dispose());
            } else {
              (m.material as THREE.Material)?.dispose();
            }
          }
        });
      }
      for (const grp of this._renderResult.featureGroups) {
        this._scene.remove(grp);
        grp.traverse(obj => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach(mt => mt.dispose());
            } else {
              (m.material as THREE.Material)?.dispose();
            }
          }
        });
      }
      // lampLights are children of lampGroups (already removed/disposed
      // above) — nothing further to remove here since they were never
      // separately added to the scene root (see _regenerate()).
      this._renderResult = null;
    }

    for (const mesh of this._roadMeshes) {
      this._scene.remove(mesh);
      // Ribbon meshes each own their own geometry/material (unlike the old
      // shared-per-tile PlaneGeometry/Material pair), so dispose per-mesh.
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(mt => mt.dispose());
      } else {
        (mesh.material as THREE.Material)?.dispose();
      }
    }
    this._roadMeshes = [];

    for (const body of this._buildingBodies) {
      this._physics.removeBody(body);
    }
    this._buildingBodies = [];
  }
}
