import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { Blueprint, DoorEntry } from './blueprint';
import { cellToWorld } from './blueprint';
import { PALETTE } from '@/shaders/palette';

// ── Visual constants ──────────────────────────────────────────────────────

const WALL_COLOR = PALETTE.STONE_MID;
const FLOOR_COLOR = PALETTE.STONE_DARK;
const DOOR_FRAME_COLOR = 0x5a5870;
const INTERACTABLE_COLOR = PALETTE.WOOD_BROWN;

// How deep the door trigger box extends into the room (world units).
const TRIGGER_DEPTH = 1.8;

// ── Types ─────────────────────────────────────────────────────────────────

export interface DoorTrigger {
  readonly entry: DoorEntry;
  /** World-space centre of the trigger AABB. */
  readonly cx: number;
  readonly cz: number;
  /** Half-extents of the trigger AABB (X and Z only — Y is not checked). */
  readonly hx: number;
  readonly hz: number;
}

export interface RenderedRoom {
  readonly group: THREE.Group;
  readonly doorTriggers: DoorTrigger[];
  dispose(): void;
}

// ── Renderer ──────────────────────────────────────────────────────────────

/** Builds Three.js geometry and Rapier physics from a Blueprint.
 *  Add `room.group` to the scene.
 *  Call `room.dispose()` when unloading. */
export function renderBlueprint(bp: Blueprint, physics: PhysicsWorld): RenderedRoom {
  const group = new THREE.Group();
  const bodies: ReturnType<PhysicsWorld['createStaticBox']>[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const doorTriggers: DoorTrigger[] = [];

  const { cellSize, wallHeight, width, depth } = bp;

  // ── Shared materials ──────────────────────────────────────────────────
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  const floorMat = new THREE.MeshLambertMaterial({ color: FLOOR_COLOR });
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
      entry: door,
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
      const shelfGeo = new THREE.BoxGeometry(cellSize * 0.75, wallHeight * 0.72, cellSize * 0.28);
      geometries.push(shelfGeo);
      const shelf = new THREE.Mesh(shelfGeo, itemMat);
      shelf.position.set(ix, wallHeight * 0.36, iz);
      shelf.castShadow = true;
      group.add(shelf);
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(ix, wallHeight * 0.36, iz),
          new THREE.Vector3(cellSize * 0.375, wallHeight * 0.36, cellSize * 0.14),
        ),
      );
    } else {
      // lectern
      const baseGeo = new THREE.BoxGeometry(0.55, 1.05, 0.38);
      const topGeo = new THREE.BoxGeometry(0.48, 0.07, 0.48);
      geometries.push(baseGeo, topGeo);

      const base = new THREE.Mesh(baseGeo, itemMat);
      base.position.set(ix, 0.525, iz);
      base.castShadow = true;

      const top = new THREE.Mesh(topGeo, itemMat);
      top.position.set(ix, 1.09, iz);
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
