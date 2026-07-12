import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { Blueprint, FloorType, StaircaseEntry } from './blueprint';
import { cellToWorld } from './blueprint';
import { PALETTE } from '@/shaders/palette';

// ── Visual constants ──────────────────────────────────────────────────────

const WALL_COLOR = PALETTE.STONE_MID;
const FLOOR_COLORS: Record<FloorType, number> = {
  stone: PALETTE.STONE_DARK,
  grass: 0x2a5a22,
  dirt:  0x5a4020,
  wood:  0x6b4a2a,
};
const DOOR_FRAME_COLOR = 0x5a5870;
const INTERACTABLE_COLOR = PALETTE.WOOD_BROWN;
const STAIR_COLOR = 0x4a4a62;          // slightly lighter stone for step faces
const STAIR_UP_GLOW = 0xff9933;        // warm amber — climbing toward light
const STAIR_DOWN_GLOW = 0x4488ff;      // cool blue — descending into depth
const SPAWN_MARKER_COLOR = 0xff2255;   // editor-only spawn pin colour

// How deep the door trigger box extends into the room (world units).
const TRIGGER_DEPTH = 1.8;

// ── Types ─────────────────────────────────────────────────────────────────

export interface DoorTrigger {
  /** Blueprint ID of the connected room, or null for an exterior exit. */
  readonly targetId: string | null;
  /** Present for staircase triggers; absent for flat door triggers. */
  readonly direction?: 'up' | 'down';
  /** World-space centre of the trigger AABB. */
  readonly cx: number;
  readonly cz: number;
  /** Half-extents of the trigger AABB (X and Z only). */
  readonly hx: number;
  readonly hz: number;
}

/** Options for renderBlueprint. */
export interface RenderOptions {
  /** When true, renders visible markers for spawn points and other
   *  editor-only indicators that are invisible during normal gameplay. */
  showEditorMarkers?: boolean;
}

export interface RenderedRoom {
  readonly group: THREE.Group;
  readonly doorTriggers: DoorTrigger[];
  dispose(): void;
}

// ── Staircase builder ─────────────────────────────────────────────────────

/** Builds a 7-step procedural staircase with per-step Rapier colliders and a trigger AABB.
 *
 *  'up'  stairs: steps rise from floor level; warm amber glow at the landing.
 *  'down' stairs: steps descend below the floor; cool blue glow at floor level
 *  plus a dark stone rim around the opening. */
function buildStaircase(
  stair: StaircaseEntry,
  bp: Blueprint,
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  doorTriggers: DoorTrigger[],
  physics: PhysicsWorld,
  bodies: ReturnType<PhysicsWorld['createStaticBox']>[],
): void {
  const { cellSize, wallHeight } = bp;
  const { x: wx, z: wz } = cellToWorld(stair.x, stair.z, bp);
  const STEPS = 7;
  const stepH = Math.min(0.36, wallHeight * 0.11);
  const stepD = cellSize / STEPS;
  const stepW = cellSize * 1.1;  // slightly wider than one cell for easier climbing

  // Approach axis unit vector (direction toward wall / up the stairs)
  let ax = 0, az = 0;
  if (stair.facing === 'north') az = -1;
  else if (stair.facing === 'south') az = 1;
  else if (stair.facing === 'east') ax = 1;
  else ax = -1;

  const stepMat = new THREE.MeshLambertMaterial({ color: STAIR_COLOR });
  materials.push(stepMat);

  const stepHalfW = stepW / 2;
  const stepHalfD = stepD / 2;

  for (let i = 0; i < STEPS; i++) {
    // Step i=0 is at the player approach side; i=STEPS-1 is at the wall.
    const along = (STEPS / 2 - i - 0.5) * stepD; // + = approach side, - = wall side
    const sx = wx - ax * along;
    const sz = wz - az * along;
    const sy = stair.direction === 'up' ? (i + 0.5) * stepH : -(i + 0.5) * stepH;

    const geoW = ax !== 0 ? stepD : stepW;
    const geoD = az !== 0 ? stepD : stepW;
    const geo = new THREE.BoxGeometry(geoW, stepH, geoD);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, stepMat);
    mesh.position.set(sx, sy, sz);
    mesh.castShadow = true;
    group.add(mesh);

    // Physics collider matching each step exactly
    bodies.push(
      physics.createStaticBox(
        new THREE.Vector3(sx, sy, sz),
        new THREE.Vector3(
          ax !== 0 ? stepHalfD : stepHalfW,
          stepH / 2,
          az !== 0 ? stepHalfD : stepHalfW,
        ),
      ),
    );
  }

  // For 'down' stairs: dark stone rim at floor level around the opening
  if (stair.direction === 'down') {
    const rimMat = new THREE.MeshLambertMaterial({ color: PALETTE.STONE_DARK });
    materials.push(rimMat);
    const rimThick = 0.14;
    const rimH = 0.12;
    const half = cellSize / 2;

    // Four rim pieces around the staircase opening
    const rimDefs = [
      [0,         rimH / 2, -(half + rimThick / 2), cellSize + rimThick * 2, rimH, rimThick],
      [0,         rimH / 2,  (half + rimThick / 2), cellSize + rimThick * 2, rimH, rimThick],
      [-(half + rimThick / 2), rimH / 2, 0, rimThick, rimH, cellSize],
      [ (half + rimThick / 2), rimH / 2, 0, rimThick, rimH, cellSize],
    ] as const;

    for (const [rx, ry, rz, rw, rh, rd] of rimDefs) {
      const rimGeo = new THREE.BoxGeometry(rw, rh, rd);
      geometries.push(rimGeo);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.set(wx + rx, ry, wz + rz);
      group.add(rimMesh);
    }
  }

  // Glowing directional indicator — a flat torus ring
  const glowColor = stair.direction === 'up' ? STAIR_UP_GLOW : STAIR_DOWN_GLOW;
  const glowY = stair.direction === 'up' ? (STEPS - 0.5) * stepH + 0.3 : 0.3;
  // Position at the wall-side end of the staircase
  const glowAlong = -(STEPS / 2 - 0.2) * stepD;
  const glowX = wx - ax * glowAlong;
  const glowZ = wz - az * glowAlong;

  const glowGeo = new THREE.TorusGeometry(0.28, 0.055, 6, 14);
  geometries.push(glowGeo);
  const glowMat = new THREE.MeshBasicMaterial({ color: glowColor, fog: false });
  materials.push(glowMat);
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.set(glowX, glowY, glowZ);
  glowMesh.rotation.x = Math.PI / 2; // lay flat (horizontal ring)
  group.add(glowMesh);

  // Trigger AABB at the player approach end of the staircase
  const tHalf = TRIGGER_DEPTH / 2;
  const wHalf = (cellSize * 0.75) / 2;
  const isNS = az !== 0;
  doorTriggers.push({
    targetId: stair.targetId,
    direction: stair.direction,
    cx: wx,
    cz: wz,
    hx: isNS ? wHalf : tHalf,
    hz: isNS ? tHalf : wHalf,
  });
}

// ── Renderer ──────────────────────────────────────────────────────────────

/** Builds Three.js geometry and Rapier physics from a Blueprint.
 *  Add `room.group` to the scene.
 *  Call `room.dispose()` when unloading. */
export function renderBlueprint(bp: Blueprint, physics: PhysicsWorld, opts: RenderOptions = {}): RenderedRoom {
  const group = new THREE.Group();
  const bodies: ReturnType<PhysicsWorld['createStaticBox']>[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const doorTriggers: DoorTrigger[] = [];

  const { cellSize, wallHeight, width, depth } = bp;

  // ── Shared materials ──────────────────────────────────────────────────
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  const floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLORS[bp.floorType ?? 'stone'] });
  const frameMat = new THREE.MeshLambertMaterial({ color: DOOR_FRAME_COLOR });
  const itemMat = new THREE.MeshLambertMaterial({ color: INTERACTABLE_COLOR });
  materials.push(wallMat, floorMat, frameMat, itemMat);

  // ── Floor ─────────────────────────────────────────────────────────────
  const floorW = width * cellSize;
  const floorD = depth * cellSize;
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
  floorGeo.rotateX(-Math.PI / 2);
  geometries.push(floorGeo);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  bodies.push(
    physics.createStaticBox(
      new THREE.Vector3(0, -0.025, 0),
      new THREE.Vector3(floorW / 2, 0.025, floorD / 2),
    ),
  );

  // ── Walls & pillars ───────────────────────────────────────────────────
  // Door cells skip wall placement (opening left empty).
  const doorKeys = new Set(bp.doors.map((d) => `${d.x},${d.z}`));

  for (const tile of bp.tiles) {
    if (doorKeys.has(`${tile.x},${tile.z}`)) continue;

    const { x: wx, z: wz } = cellToWorld(tile.x, tile.z, bp);
    const tH = tile.h ?? wallHeight;

    if (tile.type === 'wall') {
      const geo = new THREE.BoxGeometry(cellSize, tH, cellSize);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(wx, tH / 2, wz);
      mesh.rotation.y = THREE.MathUtils.degToRad(tile.rotation ?? 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(wx, tH / 2, wz),
          new THREE.Vector3(cellSize / 2, tH / 2, cellSize / 2),
        ),
      );
    } else {
      // pillar
      const geo = new THREE.CylinderGeometry(0.25, 0.3, tH, 8);
      geometries.push(geo);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(wx, tH / 2, wz);
      mesh.castShadow = true;
      group.add(mesh);
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(wx, tH / 2, wz),
          new THREE.Vector3(0.3, tH / 2, 0.3),
        ),
      );
    }
  }

  // ── Door frames & triggers ────────────────────────────────────────────
  for (const door of bp.doors) {
    const { x: dx, z: dz } = cellToWorld(door.x, door.z, bp);
    const postH = wallHeight * 0.82;
    const postHalf = postH / 2;
    const lintelH = wallHeight - postH;
    const postOffset = cellSize / 2 - 0.15;
    const isNS = door.facing === 'north' || door.facing === 'south';

    // Two door posts + lintel
    const postGeo = new THREE.BoxGeometry(0.22, postH, 0.22);
    const lintelGeo = new THREE.BoxGeometry(
      isNS ? cellSize : 0.22,
      lintelH,
      isNS ? 0.22 : cellSize,
    );
    geometries.push(postGeo, lintelGeo);

    const postA = new THREE.Mesh(postGeo, frameMat);
    const postB = new THREE.Mesh(postGeo, frameMat);
    const lintelMesh = new THREE.Mesh(lintelGeo, frameMat);

    if (isNS) {
      postA.position.set(dx - postOffset, postHalf, dz);
      postB.position.set(dx + postOffset, postHalf, dz);
    } else {
      postA.position.set(dx, postHalf, dz - postOffset);
      postB.position.set(dx, postHalf, dz + postOffset);
    }
    lintelMesh.position.set(dx, postH + lintelH / 2, dz);

    group.add(postA, postB, lintelMesh);

    // Trigger AABB — centred on the door cell, shallow along the door normal
    const tHalf = TRIGGER_DEPTH / 2;
    const wHalf = (cellSize * 0.75) / 2;
    doorTriggers.push({
      targetId: door.targetId,
      cx: dx,
      cz: dz,
      hx: isNS ? wHalf : tHalf,
      hz: isNS ? tHalf : wHalf,
    });
  }

  // ── Interactables ─────────────────────────────────────────────────────
  for (const item of bp.interactables) {
    const { x: ix, z: iz } = cellToWorld(item.x, item.z, bp);

    if (item.type === 'bookshelf') {
      const rot = item.rotation ?? 0;
      const rotRad = THREE.MathUtils.degToRad(rot);
      const isRotated = rot === 90 || rot === 270;
      const shelfGeo = new THREE.BoxGeometry(cellSize * 0.75, wallHeight * 0.72, cellSize * 0.28);
      geometries.push(shelfGeo);
      const shelf = new THREE.Mesh(shelfGeo, itemMat);
      shelf.position.set(ix, wallHeight * 0.36, iz);
      shelf.rotation.y = rotRad;
      shelf.castShadow = true;
      group.add(shelf);
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(ix, wallHeight * 0.36, iz),
          new THREE.Vector3(
            isRotated ? cellSize * 0.14 : cellSize * 0.375,
            wallHeight * 0.36,
            isRotated ? cellSize * 0.375 : cellSize * 0.14,
          ),
        ),
      );
    } else {
      // lectern
      const rot = item.rotation ?? 0;
      const rotRad = THREE.MathUtils.degToRad(rot);
      const baseGeo = new THREE.BoxGeometry(0.55, 1.05, 0.38);
      const topGeo = new THREE.BoxGeometry(0.48, 0.07, 0.48);
      geometries.push(baseGeo, topGeo);

      const base = new THREE.Mesh(baseGeo, itemMat);
      base.position.set(ix, 0.525, iz);
      base.rotation.y = rotRad;
      base.castShadow = true;

      const top = new THREE.Mesh(topGeo, itemMat);
      top.position.set(ix, 1.09, iz);
      top.rotation.y = rotRad;
      top.rotation.x = -0.38;
      top.castShadow = true;

      group.add(base, top);
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(ix, 0.525, iz),
          new THREE.Vector3(0.275, 0.525, 0.19),
        ),
      );
    }
  }

  // ── Staircases ────────────────────────────────────────────────────────
  for (const stair of bp.staircases) {
    buildStaircase(stair, bp, group, geometries, materials, doorTriggers, physics, bodies);
  }

  // ── Editor markers (spawn indicators, etc.) ───────────────────────────
  if (opts.showEditorMarkers && bp.spawns.length > 0) {
    const markerMat = new THREE.MeshBasicMaterial({ color: SPAWN_MARKER_COLOR });
    materials.push(markerMat);
    for (const spawn of bp.spawns) {
      const { x: sx, z: sz } = cellToWorld(spawn.x, spawn.z, bp);
      // Thin vertical pole
      const poleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.8, 6);
      geometries.push(poleGeo);
      const pole = new THREE.Mesh(poleGeo, markerMat);
      pole.position.set(sx, 0.9, sz);
      group.add(pole);
      // Diamond tip (octahedron)
      const tipGeo = new THREE.OctahedronGeometry(0.22, 0);
      geometries.push(tipGeo);
      const tip = new THREE.Mesh(tipGeo, markerMat);
      tip.position.set(sx, 1.9, sz);
      group.add(tip);
    }
  }

  return {
    group,
    doorTriggers,
    dispose() {
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      for (const body of bodies) physics.rapierWorld.removeRigidBody(body);
    },
  };
}
