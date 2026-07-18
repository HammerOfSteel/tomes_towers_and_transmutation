/**
 * BlueprintLayer.ts
 *
 * Renders the game's room/world layout as a non-selectable, semi-transparent
 * reference overlay directly in the editor 3D viewport.
 *
 * Purpose: let the designer SEE where walls, doors, staircases, and key
 * fixtures are (from TOWER_FLOOR_DEFS / WorldGenerator) so they know where
 * to place decorative assets.
 *
 * The group returned by build() must be added to the THREE.js scene OUTSIDE
 * EditorCore so it is never selectable or moveable.
 */

import * as THREE from 'three';
import { TOWER_FLOOR_DEFS } from '@/levels/TowerFloorDef';
import { buildWorldData }          from '@/world/WorldGenerator';
import { DEFAULT_WORLD_GEN_CONFIG } from '@/world/WorldGenConfig';
import type { DungeonEntry, WorldData } from '@/world/WorldData';

// ── Shared layout constants (mirror TowerGenerator) ───────────────────────────
const CELL       = 2;      // world units per cell
const WALL_H     = 3.5;    // wall height (world units)
const FLOOR_H    = 0.05;   // floor tile thickness
const R          = 7;      // chamber radius (cells)
const SZ         = 17;     // grid side length (2*R+3)
const CX         = 8;      // grid centre X
const CZ         = 8;      // grid centre Z
const STAIR_UP   = { x: CX, z: 1 };
const STAIR_DOWN = { x: CX, z: SZ - 2 };
const DOOR_SLOTS = [
  { x: SZ - 2, z: 5  },   // NE-east
  { x: SZ - 2, z: 11 },   // SE-east
  { x: 1,      z: 5  },   // NW-west
  { x: 1,      z: 11 },   // SW-west
] as const;

// Side-room offset from door slot (attaches outside the circle)
const SR_W = 9; const SR_D = 9;
const SIDE_ROOM_OFFSETS: Record<number, { ox: number; oz: number }> = {
  0: { ox:  SR_W / 2 + 1, oz: 0 },  // east
  1: { ox:  SR_W / 2 + 1, oz: 0 },  // east
  2: { ox: -SR_W / 2 - 1, oz: 0 },  // west
  3: { ox: -SR_W / 2 - 1, oz: 0 },  // west
};

// ── Materials ─────────────────────────────────────────────────────────────────

function mat(color: number, opacity: number, wire = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    wireframe: wire,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

const M = {
  floor:     () => mat(0x4a4070, 0.22),       // grey-purple floor tile
  wall:      () => mat(0x1a0e2a, 0.70),       // dark purple wall
  wallEdge:  () => mat(0x8855cc, 0.30, true), // wireframe wall edge
  door:      () => mat(0xffcc44, 0.55),       // gold door opening
  stairUp:   () => mat(0x44ffcc, 0.70),       // teal stair-up
  stairDown: () => mat(0xff8844, 0.70),       // orange stair-down
  fixture:   () => mat(0xffffff, 0.70),       // white key fixture
  scatter:   () => mat(0x88bbff, 0.55),       // blue scatter items
  sideRoom:  () => mat(0x2a1e40, 0.35),       // darker side-room floor
  sideWall:  () => mat(0x100820, 0.65),       // side-room walls
  label:     () => mat(0xeeeeee, 0.00),       // invisible (canvas sprites below)
};

// ── Geometry helpers ──────────────────────────────────────────────────────────

function tile(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Add a box mesh at grid cell (cx, cz) centred on the cell. */
function addCell(
  group: THREE.Group,
  cx: number, cz: number,
  w: number, height: number, depth: number,
  mat: THREE.Material,
  yOffset = 0,
): THREE.Mesh {
  const wx = (cx - CX) * CELL;
  const wz = (cz - CZ) * CELL;
  const m  = new THREE.Mesh(tile(w * CELL, height, depth * CELL), mat);
  m.position.set(wx, height / 2 + yOffset, wz);
  m.userData['blueprint'] = true;
  group.add(m);
  return m;
}

/** Canvas sprite label. */
function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const sp  = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2, 0.75, 1);
  sp.userData['blueprint'] = true;
  return sp;
}

// ── Chamber blueprint (tower floor) ───────────────────────────────────────────

function buildTowerChamber(floorIndex: number): THREE.Group {
  const group = new THREE.Group();
  group.name  = `blueprint_tower_${floorIndex}`;

  const def = TOWER_FLOOR_DEFS.find(d => d.floorIndex === floorIndex);
  if (!def) return group;

  const wallH = def.wallHeight ?? WALL_H;

  // ── Floor and wall tiles ────────────────────────────────────────────────────
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SZ; x++) {
      const dx = x - CX;
      const dz = z - CZ;
      const insideCircle = dx * dx + dz * dz <= R * R;

      if (insideCircle) {
        // Floor tile
        addCell(group, x, z, 1, FLOOR_H, 1, M.floor(), 0);
      } else {
        // Wall tile (only within the bounding box, not corners far outside)
        if (Math.abs(dx) <= R + 1 && Math.abs(dz) <= R + 1) {
          addCell(group, x, z, 1, wallH, 1, M.wall(), 0);
          // Wireframe overlay so edges are visible
          addCell(group, x, z, 1.02, wallH + 0.04, 1.02, M.wallEdge(), 0);
        }
      }
    }
  }

  // ── Door slot openings (clear the wall, add gold highlight) ────────────────
  for (let i = 0; i < DOOR_SLOTS.length; i++) {
    const slot = DOOR_SLOTS[i];
    // Remove the wall here by adding a transparent floor-height opening
    addCell(group, slot.x, slot.z, 1, FLOOR_H * 2, 1, M.door(), 0.01);
    // Vertical door frame highlight
    const frameH = wallH * 0.7;
    addCell(group, slot.x, slot.z, 0.15, frameH, 1, M.door(), 0.01);
    // Label
    const lbl = makeLabel('🚪', '#ffcc44');
    lbl.position.set((slot.x - CX) * CELL, wallH * 0.5, (slot.z - CZ) * CELL);
    group.add(lbl);
  }

  // ── Side rooms (attach at each door slot) ──────────────────────────────────
  const maxRooms = def.sideRoomCount[1];
  for (let i = 0; i < Math.min(maxRooms, DOOR_SLOTS.length); i++) {
    const slot   = DOOR_SLOTS[i];
    const offset = SIDE_ROOM_OFFSETS[i] ?? { ox: 0, oz: 0 };
    const srCX   = slot.x + offset.ox;
    const srCZ   = slot.z + offset.oz;
    // Floor
    addCell(group, srCX, srCZ, SR_W / CELL, FLOOR_H, SR_D / CELL, M.sideRoom(), 0);
    // Walls (4 sides as thin slabs)
    const hw = SR_W / CELL / 2;
    const hd = SR_D / CELL / 2;
    for (const [ox, oz, w, d] of [
      [0,   -hd,  hw * 2,  0.12],  // north
      [0,    hd,  hw * 2,  0.12],  // south
      [-hw,  0,   0.12,    hd * 2], // west
      [ hw,  0,   0.12,    hd * 2], // east
    ]) {
      const wm = new THREE.Mesh(tile((w as number) * CELL, wallH, (d as number) * CELL), M.sideWall());
      wm.position.set((srCX - CX + (ox as number)) * CELL, wallH / 2, (srCZ - CZ + (oz as number)) * CELL);
      wm.userData['blueprint'] = true;
      group.add(wm);
    }
  }

  // ── Staircases ──────────────────────────────────────────────────────────────
  if (floorIndex > -1) {
    addCell(group, STAIR_DOWN.x, STAIR_DOWN.z, 0.9, FLOOR_H * 4, 0.9, M.stairDown(), 0.01);
    const lbl = makeLabel('▼', '#ff8844');
    lbl.position.set((STAIR_DOWN.x - CX) * CELL, 0.5, (STAIR_DOWN.z - CZ) * CELL);
    group.add(lbl);
  }
  addCell(group, STAIR_UP.x, STAIR_UP.z, 0.9, FLOOR_H * 4, 0.9, M.stairUp(), 0.01);
  const lblUp = makeLabel('▲', '#44ffcc');
  lblUp.position.set((STAIR_UP.x - CX) * CELL, 0.5, (STAIR_UP.z - CZ) * CELL);
  group.add(lblUp);

  // ── Key fixture at centre ───────────────────────────────────────────────────
  const fx = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.0, 8), M.fixture());
  fx.position.set(0, 0.5, 0);
  fx.userData['blueprint'] = true;
  group.add(fx);
  const fxLbl = makeLabel(def.keyFixture.type, '#ffffff');
  fxLbl.position.set(0, 1.8, 0);
  group.add(fxLbl);

  // ── chamberScatter items ────────────────────────────────────────────────────
  if (def.chamberScatter) {
    for (const s of def.chamberScatter) {
      const mx = (s.x - CX) * CELL;
      const mz = (s.z - CZ) * CELL;
      const sm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), M.scatter());
      sm.position.set(mx, 0.3, mz);
      sm.userData['blueprint'] = true;
      group.add(sm);
      const sLbl = makeLabel(s.type, '#88bbff');
      sLbl.position.set(mx, 1.1, mz);
      group.add(sLbl);
    }
  }

  // ── Decorative elements from flags ─────────────────────────────────────────
  if (def.chamberPillars) {
    for (const p of [
      { x: CX + 5, z: CZ },
      { x: CX + 4, z: CZ + 3 },
      { x: CX,     z: CZ + 5 },
      { x: CX - 4, z: CZ + 3 },
      { x: CX - 5, z: CZ },
      { x: CX - 4, z: CZ - 3 },
      { x: CX,     z: CZ - 5 },
      { x: CX + 4, z: CZ - 3 },
    ]) {
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.5, 6), mat(0x9966cc, 0.50));
      pm.position.set((p.x - CX) * CELL, 1.25, (p.z - CZ) * CELL);
      pm.userData['blueprint'] = true;
      group.add(pm);
    }
  }

  // ── Floor label ─────────────────────────────────────────────────────────────
  const floorLabel = makeLabel(def.name, '#cc99ff');
  floorLabel.scale.set(6, 2, 1);
  floorLabel.position.set(0, 8, 0);
  group.add(floorLabel);

  return group;
}

// ── Overworld blueprint ───────────────────────────────────────────────────────

/** Fixed blueprint seed — same view every time so the editor is deterministic. */
const BLUEPRINT_SEED = 0xBEEF_CAFE;
/** Render scale: WU per tile. Full world = worldSize × TILE_SCALE WU. */
const TILE_SCALE = 0.5;

const BIOME_COLORS: Record<string, number> = {
  grass:    0x4a7c3f,
  forest:   0x2d5a27,
  bog:      0x3d4a2a,
  highland: 0x6b5a3a,
  rocky:    0x555555,
  water:    0x1a3a5c,
};

let _cachedWorldData: WorldData | null = null;
function _getWorldData(): WorldData {
  if (!_cachedWorldData) {
    _cachedWorldData = buildWorldData(BLUEPRINT_SEED, { ...DEFAULT_WORLD_GEN_CONFIG });
  }
  return _cachedWorldData;
}

function buildOverworldBlueprint(
  onDungeonClick?: (entry: DungeonEntry) => void,
): THREE.Group {
  const group = new THREE.Group();
  group.name  = 'blueprint_overworld';

  const world = _getWorldData();
  const { grid, dungeons, settlements } = world;
  const GW = grid.width;
  const GH = grid.height;

  // ── Biome floor tiles using InstancedMesh per biome ─────────────────────────
  const biomeIds = Object.keys(BIOME_COLORS) as (keyof typeof BIOME_COLORS)[];
  const biomeGroups: Record<string, THREE.Matrix4[]> = {};
  biomeIds.forEach(b => { biomeGroups[b] = []; });

  const tileGeo  = new THREE.PlaneGeometry(TILE_SCALE * 0.98, TILE_SCALE * 0.98);
  const dummy    = new THREE.Object3D();

  for (let row = 0; row < GH; row++) {
    for (let col = 0; col < GW; col++) {
      const cell  = grid.get(col, row);
      const biome = cell.biome ?? 'grass';
      if (!biomeGroups[biome]) biomeGroups[biome] = [];
      dummy.position.set(
        (col - GW / 2 + 0.5) * TILE_SCALE,
        0,
        (row - GH / 2 + 0.5) * TILE_SCALE,
      );
      dummy.rotation.x = -Math.PI / 2;
      dummy.updateMatrix();
      biomeGroups[biome].push(dummy.matrix.clone());
    }
  }

  for (const biome of biomeIds) {
    const matrices = biomeGroups[biome];
    if (!matrices.length) continue;
    const mesh = new THREE.InstancedMesh(
      tileGeo,
      new THREE.MeshBasicMaterial({ color: BIOME_COLORS[biome], transparent: true, opacity: 0.75 }),
      matrices.length,
    );
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData['blueprint'] = true;
    mesh.userData['biome']     = biome;
    group.add(mesh);
  }

  // ── Dungeon entrance markers ─────────────────────────────────────────────────
  for (const d of dungeons) {
    const wx = (d.col - GW / 2 + 0.5) * TILE_SCALE;
    const wz = (d.row - GH / 2 + 0.5) * TILE_SCALE;

    const markerGeo = new THREE.CylinderGeometry(TILE_SCALE * 0.7, TILE_SCALE * 0.7, TILE_SCALE, 6);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 });
    const marker    = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(wx, TILE_SCALE / 2, wz);
    marker.userData['blueprint'] = true;
    marker.userData['dungeon']   = d;

    if (onDungeonClick) {
      marker.userData['clickable'] = true;
      marker.userData['onClick']   = () => onDungeonClick(d);
    }
    group.add(marker);

    // Label
    const lbl = makeLabel(`⚔ ${d.name}`, '#ff8888');
    lbl.scale.set(3, 1, 1);
    lbl.position.set(wx, TILE_SCALE * 2.5, wz);
    group.add(lbl);
  }

  // ── Settlement markers ───────────────────────────────────────────────────────
  for (const s of settlements) {
    const wx = (s.plan.centerCol - GW / 2 + 0.5) * TILE_SCALE;
    const wz = (s.plan.centerRow - GH / 2 + 0.5) * TILE_SCALE;

    const settGeo = new THREE.CylinderGeometry(TILE_SCALE * 0.6, TILE_SCALE * 0.6, TILE_SCALE * 0.6, 4);
    const settMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.9 });
    const sett    = new THREE.Mesh(settGeo, settMat);
    sett.position.set(wx, TILE_SCALE * 0.3, wz);
    sett.rotation.y = Math.PI / 4;
    sett.userData['blueprint'] = true;
    group.add(sett);

    const lbl = makeLabel(`🏘 ${s.plan.name}`, '#ffee88');
    lbl.scale.set(3, 1, 1);
    lbl.position.set(wx, TILE_SCALE * 2, wz);
    group.add(lbl);
  }

  return group;
}

// ── Dungeon blueprint (from blueprint JSON files) ─────────────────────────────

interface BlueprintFile {
  id:        string;
  width:     number;
  depth:     number;
  cellSize:  number;
  wallHeight: number;
  tiles:     Array<{ x: number; z: number; type: string }>;
  doors?:    Array<{ x: number; z: number; facing: string; targetId: string | null }>;
  staircases?: Array<{ x: number; z: number; direction: string }>;
  interactables?: Array<{ x: number; z: number; type: string }>;
}

// Import the static blueprint files
import corridorNS    from '@/levels/blueprints/corridor_ns.json';
import corridorEW    from '@/levels/blueprints/corridor_ew.json';
import librarySmall  from '@/levels/blueprints/library_small.json';
import libraryLarge  from '@/levels/blueprints/library_large.json';
import cellStart     from '@/levels/blueprints/cell_start.json';

const ALL_BLUEPRINTS: BlueprintFile[] = [
  cellStart as BlueprintFile,
  corridorNS as BlueprintFile,
  corridorEW as BlueprintFile,
  librarySmall as BlueprintFile,
  libraryLarge as BlueprintFile,
];

function buildDungeonBlueprint(dungeonEntry?: DungeonEntry | null): THREE.Group {
  const group = new THREE.Group();
  group.name  = 'blueprint_dungeon';

  // Lay the blueprint rooms out in a row, separated by gaps
  let offsetX = 0;
  const GAP = 3;

  for (const bp of ALL_BLUEPRINTS) {
    const cs = bp.cellSize ?? 2;
    const wh = bp.wallHeight ?? 3;

    // Floor tiles
    const floorW = bp.width  * cs;
    const floorD = bp.depth  * cs;
    const floor  = new THREE.Mesh(
      new THREE.PlaneGeometry(floorW, floorD),
      new THREE.MeshBasicMaterial({ color: 0x2a1e3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(offsetX + floorW / 2, 0, floorD / 2);
    floor.userData['blueprint'] = true;
    group.add(floor);

    // Wall tiles
    for (const t of bp.tiles) {
      if (t.type !== 'wall') continue;
      const wx = offsetX + (t.x + 0.5) * cs;
      const wz = (t.z + 0.5) * cs;
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(cs * 0.96, wh, cs * 0.96),
        new THREE.MeshBasicMaterial({ color: 0x140d20, transparent: true, opacity: 0.75 }),
      );
      wall.position.set(wx, wh / 2, wz);
      wall.userData['blueprint'] = true;
      group.add(wall);
      // Wireframe edge
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(cs, wh + 0.1, cs),
        new THREE.MeshBasicMaterial({ color: 0x8855cc, transparent: true, opacity: 0.25, wireframe: true }),
      );
      edge.position.copy(wall.position);
      edge.userData['blueprint'] = true;
      group.add(edge);
    }

    // Door markers
    for (const d of bp.doors ?? []) {
      const dx = offsetX + (d.x + 0.5) * cs;
      const dz = (d.z + 0.5) * cs;
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(cs * 0.3, wh * 0.7, cs * 0.9),
        new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.7 }),
      );
      door.position.set(dx, wh * 0.35, dz);
      door.userData['blueprint'] = true;
      group.add(door);
    }

    // Interactable markers
    for (const item of bp.interactables ?? []) {
      const ix = offsetX + (item.x + 0.5) * cs;
      const iz = (item.z + 0.5) * cs;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.8 }),
      );
      marker.position.set(ix, 0.3, iz);
      marker.userData['blueprint'] = true;
      group.add(marker);
      const lbl = makeLabel(item.type, '#88ffcc');
      lbl.position.set(ix, 1.2, iz);
      group.add(lbl);
    }

    // Room label
    const roomLbl = makeLabel(bp.id, '#cc88ff');
    roomLbl.scale.set(4, 1.2, 1);
    roomLbl.position.set(offsetX + floorW / 2, wh + 1, floorD / 2);
    group.add(roomLbl);

    offsetX += floorW + GAP;
  }

  // Dungeon name label at top if we have a specific dungeon
  if (dungeonEntry) {
    const titleLbl = makeLabel(`⚔ ${dungeonEntry.name}`, '#ff8888');
    titleLbl.scale.set(8, 2, 1);
    titleLbl.position.set(offsetX / 2, 12, -4);
    group.add(titleLbl);
  }

  return group;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class BlueprintLayer {
  private _group: THREE.Group | null = null;
  /** Clickable dungeon marker meshes for raycasting. */
  clickables: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Show the blueprint for a tower floor. Pass null to clear. */
  showTowerFloor(floorIndex: number | null): void {
    this._clear();
    if (floorIndex === null) return;
    this._group = buildTowerChamber(floorIndex);
    this.scene.add(this._group);
    this.clickables = [];
  }

  /** Show the overworld map blueprint. onDungeonClick fires when a dungeon marker is clicked. */
  showOverworld(onDungeonClick?: (entry: DungeonEntry) => void): void {
    this._clear();
    this._group = buildOverworldBlueprint(onDungeonClick);
    this.scene.add(this._group);
    // Collect clickable dungeon markers for raycasting
    this.clickables = [];
    this._group.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.userData['clickable']) {
        this.clickables.push(obj);
      }
    });
  }

  /** Show the dungeon room blueprints, optionally for a specific dungeon. */
  showDungeon(dungeonEntry?: DungeonEntry | null): void {
    this._clear();
    this._group = buildDungeonBlueprint(dungeonEntry);
    this.scene.add(this._group);
    this.clickables = [];
  }

  /** Clear the blueprint overlay. */
  hide(): void { this._clear(); }

  get visible(): boolean { return this._group !== null; }

  private _clear(): void {
    if (!this._group) return;
    this._group.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else (obj.material as THREE.Material).dispose();
      }
      if (obj instanceof THREE.Sprite) {
        (obj.material as THREE.SpriteMaterial).map?.dispose();
        obj.material.dispose();
      }
    });
    this.scene.remove(this._group);
    this._group = null;
    this.clickables = [];
  }
}
