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
} from '@/world/SettlementGenerator';
import type { LayoutType } from '@/world/SettlementModelGenerator';
import {
  renderSettlementPlan,
  type SettlementRenderResult,
} from '@/scene/SettlementRenderer';
import { mapStudioFactionToRuntimeFaction } from '@/world/buildings/BuildingTypeMap';
import { getFootprint, FLOOR_HEIGHT } from '@/world/buildings/BuildingDNA';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { SettlementLabPanel } from '@/ui/SettlementLabPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SIZE    = 64;
const TILE_UNIT    = 2;  // matches WorldGrid.tileUnit
const DEFAULT_SEED = 42;

const SETTLEMENT_TYPES: SettlementType[] = ['village', 'town', 'city'];
const STUDIO_FACTIONS = [
  'human', 'elven', 'dwarven', 'orcish',
  'vampire', 'undead', 'vulperia', 'slime', 'fae',
];
const LAYOUTS: LayoutType[] = [
  'auto', 'organic', 'grid', 'linear',
  'radial', 'terraced', 'perimeter', 'cluster',
];

// ── Regenerate params type ────────────────────────────────────────────────────

interface RegenParams {
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

  enter(): void {
    if (this._entered) return;
    this._entered = true;

    // ── Ground plane ────────────────────────────────────────────────────────
    const groundW = GRID_SIZE * TILE_UNIT;
    const groundH = GRID_SIZE * TILE_UNIT;
    const groundGeo = new THREE.PlaneGeometry(groundW, groundH);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5a7a40 });
    this._groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this._groundMesh.rotation.x = -Math.PI / 2;
    this._scene.add(this._groundMesh);

    this._groundBody = this._physics.createStaticBox(
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3(groundW / 2, 0.05, groundH / 2),
    );

    // ── Panel ────────────────────────────────────────────────────────────────
    this._panel = new SettlementLabPanel({
      initialSeed:     DEFAULT_SEED,
      settlementTypes: SETTLEMENT_TYPES,
      factions:        STUDIO_FACTIONS,
      layouts:         LAYOUTS,
      onRegenerate:    (params) => this._regenerate(params),
    });
    document.body.appendChild(this._panel.rootEl);

    // ── Initial settlement ────────────────────────────────────────────────
    this._regenerate({
      seed:    DEFAULT_SEED,
      type:    'village',
      faction: 'human',
      layout:  'auto',
    });
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
        grid.set(col, row, { elevation: 1 });
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
    });

    this._renderResult = result;

    // Add buildings + lamps
    for (const grp of result.buildingGroups) this._scene.add(grp);
    for (const grp of result.lampGroups)     this._scene.add(grp);
    for (const lt  of result.lampLights)     this._scene.add(lt);

    // Build road tile meshes
    const roadGeo = new THREE.PlaneGeometry(TILE_UNIT, TILE_UNIT);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x888060 });
    for (const rt of result.roadTiles) {
      const elevation = grid.get(rt.col, rt.row).elevation;
      const wy  = elevation * LEVEL_HEIGHT + 0.02;
      const wx  = (rt.col - ghw) * TILE_UNIT;
      const wz  = (rt.row - ghh) * TILE_UNIT;
      const mesh = new THREE.Mesh(roadGeo, roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(wx, wy, wz);
      this._scene.add(mesh);
      this._roadMeshes.push(mesh);
    }

    const readout = [
      `buildings: ${result.buildingGroups.length}`,
      `roads: ${result.roadTiles.length}`,
      `lamps: ${result.lampGroups.length}`,
    ].join('  |  ');
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
      }
      for (const lt of this._renderResult.lampLights) {
        this._scene.remove(lt);
      }
      this._renderResult = null;
    }

    for (const mesh of this._roadMeshes) {
      this._scene.remove(mesh);
      // geometry/material are shared instances — only dispose on final cleanup
    }
    this._roadMeshes = [];

    for (const body of this._buildingBodies) {
      this._physics.removeBody(body);
    }
    this._buildingBodies = [];
  }
}
