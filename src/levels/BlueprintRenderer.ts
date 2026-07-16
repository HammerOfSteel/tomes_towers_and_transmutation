import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { Blueprint, FloorType, StaircaseEntry } from './blueprint';
import { cellToWorld } from './blueprint';
import { PALETTE } from '@/shaders/palette';
import { MaterialLibrary } from '@/rendering/MaterialLibrary';
import { buildCauldron } from '@/rendering/ProceduralProps';

// ── Visual constants ──────────────────────────────────────────────────────

const FLOOR_COLORS: Record<FloorType, number> = {
  stone: PALETTE.STONE_DARK,
  grass: 0x2a5a22,
  dirt:  0x5a4020,
  wood:  0x6b4a2a,
};
const DOOR_FRAME_COLOR = 0x5a5870;
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

  // ── Shared materials (from MaterialLibrary — NOT added to dispose list) ─
  // Library materials are shared across rooms; they must NOT be disposed on
  // room unload.  Only one-off per-room materials go into `materials[]`.
  const floorType = bp.floorType ?? 'stone';
  const wallMat = floorType === 'wood'
    ? MaterialLibrary.get('wood_dark')
    : MaterialLibrary.get('stone_wall');
  const floorMat = ((): THREE.Material => {
    if (floorType === 'wood')  return MaterialLibrary.get('wood_plank');
    if (floorType === 'grass') return new THREE.MeshLambertMaterial({ color: FLOOR_COLORS.grass });
    if (floorType === 'dirt')  return new THREE.MeshLambertMaterial({ color: FLOOR_COLORS.dirt });
    return MaterialLibrary.get('stone_floor');
  })();
  // Push locally-created floor materials so they're disposed with the room
  if (floorType === 'grass' || floorType === 'dirt') materials.push(floorMat);
  const frameMat = new THREE.MeshLambertMaterial({ color: DOOR_FRAME_COLOR });
  const itemMat  = MaterialLibrary.get('wood_dark');
  materials.push(frameMat);

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

    } else if (item.type === 'lectern') {
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

    } else if (item.type === 'cauldron') {
      // Better cauldron via ProceduralProps (lathe profile + GeometryCache)
      const cauldronMat = MaterialLibrary.get('cauldron_iron');
      const glowMat     = new THREE.MeshBasicMaterial({ color: 0x44ff88, opacity: 0.7, transparent: true });
      materials.push(glowMat);
      const cauldronGroup = buildCauldron(cauldronMat, glowMat);
      cauldronGroup.position.set(ix, 0, iz);
      group.add(cauldronGroup);
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.75, iz),
        new THREE.Vector3(1.1, 0.75, 1.1),
      ));

    } else if (item.type === 'telescope') {
      // Brass telescope on a pivot mount
      const brassMat  = new THREE.MeshLambertMaterial({ color: 0xcc8800 });
      const darkMat   = MaterialLibrary.get('cauldron_iron');
      materials.push(brassMat);
      // Pedestal
      const pedGeo = new THREE.CylinderGeometry(0.25, 0.32, 1.1, 8);
      geometries.push(pedGeo);
      const ped = new THREE.Mesh(pedGeo, darkMat);
      ped.position.set(ix, 0.55, iz);
      ped.castShadow = true;
      group.add(ped);
      // Tube (angled ~30° upward toward south)
      const tubeGeo = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 10);
      geometries.push(tubeGeo);
      const tube = new THREE.Mesh(tubeGeo, brassMat);
      tube.position.set(ix, 1.55, iz + 0.35);
      tube.rotation.x = -0.55;   // tilt toward viewer
      tube.castShadow = true;
      group.add(tube);
      // Eyepiece cap
      const capGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 10);
      geometries.push(capGeo);
      const cap = new THREE.Mesh(capGeo, brassMat);
      cap.position.set(ix, 2.55, iz - 0.5);
      cap.rotation.x = -0.55;
      group.add(cap);
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 1.0, iz),
        new THREE.Vector3(0.32, 1.0, 0.32),
      ));

    } else if (item.type === 'forge') {
      // Runic forge: stone base + metal anvil + glowing interior
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x555566 });
      const metalMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
      const fireMat  = new THREE.MeshBasicMaterial({ color: 0xff5500, opacity: 0.85, transparent: true });
      materials.push(stoneMat, metalMat, fireMat);
      // Stone base
      const baseGeo = new THREE.BoxGeometry(1.6, 0.9, 1.2);
      geometries.push(baseGeo);
      const base = new THREE.Mesh(baseGeo, stoneMat);
      base.position.set(ix, 0.45, iz);
      base.castShadow = true;
      group.add(base);
      // Firepit hollow (visual glow quad)
      const pitGeo = new THREE.PlaneGeometry(1.0, 0.7);
      pitGeo.rotateX(-Math.PI / 2);
      geometries.push(pitGeo);
      const pit = new THREE.Mesh(pitGeo, fireMat);
      pit.position.set(ix, 0.91, iz);
      group.add(pit);
      // Anvil
      const anvilGeo = new THREE.BoxGeometry(0.55, 0.28, 0.38);
      geometries.push(anvilGeo);
      const anvil = new THREE.Mesh(anvilGeo, metalMat);
      anvil.position.set(ix + 0.6, 1.04, iz);
      group.add(anvil);
      // Chimney hood
      const hoodGeo = new THREE.BoxGeometry(1.5, 0.6, 1.1);
      geometries.push(hoodGeo);
      const hood = new THREE.Mesh(hoodGeo, stoneMat);
      hood.position.set(ix, wallHeight - 0.3, iz);
      group.add(hood);
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.45, iz),
        new THREE.Vector3(0.8, 0.45, 0.6),
      ));

    } else if (item.type === 'quest_board') {
      // Tall corkboard on a wooden frame
      const frameMat2 = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
      const corkMat   = new THREE.MeshLambertMaterial({ color: 0xc8a060 });
      materials.push(frameMat2, corkMat);
      // Frame
      const boardGeo = new THREE.BoxGeometry(1.5, 1.8, 0.12);
      geometries.push(boardGeo);
      const board = new THREE.Mesh(boardGeo, frameMat2);
      board.position.set(ix, 1.1, iz);
      board.castShadow = true;
      group.add(board);
      // Cork surface
      const corkGeo = new THREE.BoxGeometry(1.3, 1.55, 0.06);
      geometries.push(corkGeo);
      const cork = new THREE.Mesh(corkGeo, corkMat);
      cork.position.set(ix, 1.1, iz - 0.04);
      group.add(cork);
      // Two legs
      for (const lx of [-0.55, 0.55]) {
        const legGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08);
        geometries.push(legGeo);
        const leg = new THREE.Mesh(legGeo, frameMat2);
        leg.position.set(ix + lx, 0.3, iz + 0.06);
        group.add(leg);
      }
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 1.1, iz),
        new THREE.Vector3(0.75, 0.9, 0.1),
      ));

    } else if (item.type === 'greenhouse_orb') {
      // Hovering luminescent orb — magical grow-light
      const orbMat   = new THREE.MeshBasicMaterial({ color: 0xaaffcc });
      const ringMat  = new THREE.MeshLambertMaterial({ color: 0x557744 });
      materials.push(orbMat, ringMat);
      // Glow orb
      const orbGeo = new THREE.SphereGeometry(0.5, 14, 10);
      geometries.push(orbGeo);
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(ix, wallHeight * 0.75, iz);
      group.add(orb);
      // Decorative ring around the orb
      const ringGeo = new THREE.TorusGeometry(0.65, 0.055, 6, 20);
      geometries.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(ix, wallHeight * 0.75, iz);
      group.add(ring);
      // Thin chain down to a short post
      const chainGeo = new THREE.CylinderGeometry(0.025, 0.025, wallHeight * 0.4, 5);
      geometries.push(chainGeo);
      const chain = new THREE.Mesh(chainGeo, ringMat);
      chain.position.set(ix, wallHeight * 0.95, iz);
      group.add(chain);
      // (no physics body — player can walk under the orb)

    } else if (item.type === 'barrel') {
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x8b5e3c });
      const hoopMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
      materials.push(woodMat, hoopMat);
      // Main stave body — slightly tapered cylinder
      const bodyGeo = new THREE.CylinderGeometry(0.26, 0.30, 0.72, 10);
      geometries.push(bodyGeo);
      const body = new THREE.Mesh(bodyGeo, woodMat);
      body.position.set(ix, 0.36, iz);
      body.castShadow = true;
      group.add(body);
      // Two iron hoops
      for (const hy of [0.18, 0.54]) {
        const hoopGeo = new THREE.TorusGeometry(0.27, 0.025, 5, 16);
        geometries.push(hoopGeo);
        const hoop = new THREE.Mesh(hoopGeo, hoopMat);
        hoop.position.set(ix, hy, iz);
        hoop.rotation.x = Math.PI / 2;
        group.add(hoop);
      }
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.36, iz),
        new THREE.Vector3(0.28, 0.36, 0.28),
      ));

    } else if (item.type === 'crate') {
      const crateWoodMat = new THREE.MeshLambertMaterial({ color: 0xa08050 });
      const crateTrimMat = new THREE.MeshLambertMaterial({ color: 0x6b4a22 });
      materials.push(crateWoodMat, crateTrimMat);
      // Box body
      const boxGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
      geometries.push(boxGeo);
      const box = new THREE.Mesh(boxGeo, crateWoodMat);
      box.position.set(ix, 0.36, iz);
      box.castShadow = true;
      group.add(box);
      // Cross brace on top face
      for (const isX of [true, false]) {
        const braceGeo = new THREE.BoxGeometry(
          isX ? 0.72 : 0.055, 0.055, isX ? 0.055 : 0.72,
        );
        geometries.push(braceGeo);
        const brace = new THREE.Mesh(braceGeo, crateTrimMat);
        brace.position.set(ix, 0.725, iz);
        group.add(brace);
      }
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.36, iz),
        new THREE.Vector3(0.36, 0.36, 0.36),
      ));

    } else if (item.type === 'chest') {
      const chestMat  = new THREE.MeshLambertMaterial({ color: 0x6b3a1e });
      const metalMat2 = new THREE.MeshLambertMaterial({ color: 0x886633 });
      materials.push(chestMat, metalMat2);
      const rot = item.rotation ?? 0;
      // Base
      const chestBaseGeo = new THREE.BoxGeometry(0.82, 0.46, 0.52);
      geometries.push(chestBaseGeo);
      const chestBase = new THREE.Mesh(chestBaseGeo, chestMat);
      chestBase.position.set(ix, 0.23, iz);
      chestBase.rotation.y = THREE.MathUtils.degToRad(rot);
      chestBase.castShadow = true;
      group.add(chestBase);
      // Lid (slightly angled open)
      const lidGeo = new THREE.BoxGeometry(0.82, 0.18, 0.52);
      geometries.push(lidGeo);
      const lid = new THREE.Mesh(lidGeo, chestMat);
      lid.position.set(ix, 0.55, iz);
      lid.rotation.y = THREE.MathUtils.degToRad(rot);
      group.add(lid);
      // Clasp
      const claspGeo = new THREE.BoxGeometry(0.12, 0.08, 0.06);
      geometries.push(claspGeo);
      const clasp = new THREE.Mesh(claspGeo, metalMat2);
      clasp.position.set(ix, 0.48, iz - 0.26);
      clasp.rotation.y = THREE.MathUtils.degToRad(rot);
      group.add(clasp);
      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.32, iz),
        new THREE.Vector3(0.41, 0.32, 0.26),
      ));

    } else if (item.type === 'candelabra') {
      const metalMat3 = new THREE.MeshLambertMaterial({ color: 0x222233 });
      const waxMat    = new THREE.MeshLambertMaterial({ color: 0xeeddaa });
      const flameMat  = new THREE.MeshBasicMaterial({ color: 0xff9900, opacity: 0.9, transparent: true });
      materials.push(metalMat3, waxMat, flameMat);
      // Base disk
      const diskGeo = new THREE.CylinderGeometry(0.20, 0.24, 0.07, 8);
      geometries.push(diskGeo);
      const disk = new THREE.Mesh(diskGeo, metalMat3);
      disk.position.set(ix, 0.035, iz);
      group.add(disk);
      // Central stem
      const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 1.55, 7);
      geometries.push(stemGeo);
      const stem = new THREE.Mesh(stemGeo, metalMat3);
      stem.position.set(ix, 0.84, iz);
      stem.castShadow = true;
      group.add(stem);
      // Three arms fanning out at the top, each with a candle
      const ARM_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
      const ARM_RADIUS = 0.30;
      const ARM_Y = 1.42;
      for (const angle of ARM_ANGLES) {
        const ax = ix + Math.sin(angle) * ARM_RADIUS;
        const az = iz + Math.cos(angle) * ARM_RADIUS;
        // Arm rod
        const armGeo = new THREE.CylinderGeometry(0.018, 0.018, ARM_RADIUS * 2, 5);
        geometries.push(armGeo);
        const armRod = new THREE.Mesh(armGeo, metalMat3);
        armRod.position.set(ix + Math.sin(angle) * ARM_RADIUS * 0.5, ARM_Y, iz + Math.cos(angle) * ARM_RADIUS * 0.5);
        armRod.rotation.z = Math.PI / 2;
        armRod.rotation.y = angle;
        group.add(armRod);
        // Wax candle
        const candleGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.22, 6);
        geometries.push(candleGeo);
        const candle = new THREE.Mesh(candleGeo, waxMat);
        candle.position.set(ax, ARM_Y + 0.11, az);
        group.add(candle);
        // Tiny flame tip
        const flameGeo = new THREE.SphereGeometry(0.045, 5, 4);
        geometries.push(flameGeo);
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(ax, ARM_Y + 0.28, az);
        flame.scale.y = 1.6;
        group.add(flame);
      }
      // No collision — player can walk through candelabras (decorative only)

    } else {
      // Fallback: unknown type — render a small marker cube so it's visible in editor
      const unknownGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      geometries.push(unknownGeo);
      const marker = new THREE.Mesh(unknownGeo, itemMat);
      marker.position.set(ix, 0.2, iz);
      group.add(marker);
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
