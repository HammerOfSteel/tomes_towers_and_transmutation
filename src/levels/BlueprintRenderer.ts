import * as THREE from 'three';
import type { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { Blueprint, FloorType, StaircaseEntry } from './blueprint';
import { cellToWorld } from './blueprint';
import { PALETTE } from '@/shaders/palette';
import { MaterialLibrary } from '@/rendering/MaterialLibrary';
import {
  buildCauldron,
  buildPotionRack, buildDistillationCoil, buildFermentingVat, buildHerbBundle,
  buildAnvil, buildCoolingTrough,
  buildBed, buildWardrobe, buildBunk, buildMessTable,
  buildReadingTable, buildGlobe,
  buildMapTable, buildWeaponStand,
  buildPlantPot, buildRaisedPlanter,
  buildContainmentRing, buildAstrolabe,
  buildBanner, buildRug,
} from '@/rendering/ProceduralProps';

// ── Visual constants ──────────────────────────────────────────────────────

/** Floor base tint used only for fallback MeshLambertMaterial floors. */
const FLOOR_COLORS: Record<FloorType, number> = {
  stone:           PALETTE.STONE_DARK,
  stone_alchemy:   0x1a1a22,
  stone_herald:    0x22201c,
  stone_damp:      0x1a2422,
  stone_scorched:  0x1c1410,
  stone_sealed:    0x181820,
  stone_celestial: 0x0e1020,
  grass:           0x2a5a22,
  dirt:            0x5a4020,
  wood:            0x6b4a2a,
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
  // Span 1.8 cells so the staircase visibly projects through the wall opening
  const STAIR_SPAN = cellSize * 1.8;
  const stepD = STAIR_SPAN / STEPS;
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
    if (floorType === 'wood')            return MaterialLibrary.get('wood_plank');
    if (floorType === 'grass')           return MaterialLibrary.get('grass_floor');
    if (floorType === 'dirt')            return new THREE.MeshLambertMaterial({ color: FLOOR_COLORS.dirt });
    if (floorType === 'stone_alchemy')   return MaterialLibrary.get('alchemy_stone_floor');
    if (floorType === 'stone_herald')    return MaterialLibrary.get('herald_stone_floor');
    if (floorType === 'stone_damp')      return MaterialLibrary.get('damp_stone_floor');
    if (floorType === 'stone_scorched')  return MaterialLibrary.get('scorched_stone_floor');
    if (floorType === 'stone_sealed')    return MaterialLibrary.get('sealed_stone_floor');
    if (floorType === 'stone_celestial') return MaterialLibrary.get('celestial_stone_floor');
    return MaterialLibrary.get('stone_floor');
  })();
  // Push locally-created floor materials so they're disposed with the room
  if (floorType === 'dirt') materials.push(floorMat);
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

  // The single wall tile directly behind each staircase is removed so the
  // opening is visible and the staircase clearly pokes through the wall.
  const stairBackingKeys = new Set<string>();
  for (const stair of bp.staircases) {
    let sbx = 0, sbz = 0;
    if      (stair.facing === 'north') sbz = -1;
    else if (stair.facing === 'south') sbz =  1;
    else if (stair.facing === 'east')  sbx =  1;
    else                               sbx = -1;
    stairBackingKeys.add(`${stair.x + sbx},${stair.z + sbz}`);
  }

  for (const tile of bp.tiles) {
    if (doorKeys.has(`${tile.x},${tile.z}`)) continue;
    if (stairBackingKeys.has(`${tile.x},${tile.z}`)) continue;  // staircase opening

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

  // ── Corner pilasters — softens the inner silhouette of circular walls ─
  // Where the ring makes a diagonal step, two wall tiles share a corner
  // vertex that forms a 90° convex angle visible from inside the room.
  // A low-poly (6-sided) cylinder at each such joint rounds the sharp angle
  // without adding geometry along straight tile runs → no pearl-necklace.
  // Detection: exactly one of the two straight-bridge tiles is floor
  // (both-wall = interior corner, buried; both-floor = degenerate, skip).
  {
    const wallTileSet = new Set(
      bp.tiles
        .filter(t => t.type === 'wall' && !doorKeys.has(`${t.x},${t.z}`) && !stairBackingKeys.has(`${t.x},${t.z}`))
        .map(t => `${t.x},${t.z}`),
    );
    const placedCorners = new Set<string>();

    for (const tile of bp.tiles) {
      if (tile.type !== 'wall' || doorKeys.has(`${tile.x},${tile.z}`) || stairBackingKeys.has(`${tile.x},${tile.z}`)) continue;
      const { x: wx, z: wz } = cellToWorld(tile.x, tile.z, bp);
      const tH = tile.h ?? wallHeight;

      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
        if (!wallTileSet.has(`${tile.x + dx},${tile.z + dz}`)) continue;
        const bridgeX = wallTileSet.has(`${tile.x + dx},${tile.z}`);
        const bridgeZ = wallTileSet.has(`${tile.x},${tile.z + dz}`);
        // Skip buried interior corners (both bridges are wall)
        // and skip degenerate floating corners (both bridges are floor).
        if (bridgeX === bridgeZ) continue;

        const cx = wx + dx * cellSize * 0.5;
        const cz = wz + dz * cellSize * 0.5;
        const key = `${cx.toFixed(2)},${cz.toFixed(2)}`;
        if (placedCorners.has(key)) continue;
        placedCorners.add(key);

        // 6-sided low-poly pilaster — same material as surrounding wall blocks
        const colGeo = new THREE.CylinderGeometry(cellSize * 0.28, cellSize * 0.28, tH, 6);
        geometries.push(colGeo);
        const col = new THREE.Mesh(colGeo, wallMat);
        col.position.set(cx, tH / 2, cz);
        col.castShadow = true;
        col.receiveShadow = true;
        group.add(col);
      }
    }
  }

  // ── Wall-top decorations — themed low-poly props on top of the wall ring ─
  {
    const ft = floorType;
    const floorIdx = bp.floor;

    // LCG seeded from floor index — deterministic, no library needed
    let rngSeed = ((floorIdx + 7) * 1664525 + 1013904223) >>> 0;
    const rng = (): number => {
      rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
      return rngSeed / 0x100000000;
    };

    // Collect non-door wall tiles sorted by ring angle for even distribution
    const dkSet = new Set([...bp.doors.map(d => `${d.x},${d.z}`), ...stairBackingKeys]);
    const wallPts: { wx: number; wz: number }[] = [];
    for (const tile of bp.tiles) {
      if (tile.type !== 'wall' || dkSet.has(`${tile.x},${tile.z}`)) continue;
      const { x: wx, z: wz } = cellToWorld(tile.x, tile.z, bp);
      wallPts.push({ wx, wz });
    }
    wallPts.sort((a, b) => Math.atan2(a.wx, a.wz) - Math.atan2(b.wx, b.wz));

    const tH = wallHeight;
    const N  = wallPts.length;

    // Pick every Nth tile — N~40 tiles; step=4 → ~10 props, step=2 → ~20
    const pick = (step: number): { wx: number; wz: number }[] => {
      const out: { wx: number; wz: number }[] = [];
      for (let i = 0; i < N; i += step) out.push(wallPts[i]!);
      return out;
    };

    if (ft === 'stone' && floorIdx === 5) {
      // ── F5 Barracks: alternating merlons (classic battlements) ───────
      const crenMat = new THREE.MeshLambertMaterial({ color: 0x666677 });
      materials.push(crenMat);
      for (let i = 0; i < N; i += 2) {
        const { wx, wz } = wallPts[i]!;
        const mGeo = new THREE.BoxGeometry(cellSize * 0.68, cellSize * 0.4, cellSize * 0.68);
        geometries.push(mGeo);
        const merlon = new THREE.Mesh(mGeo, crenMat);
        merlon.position.set(wx, tH + cellSize * 0.2, wz);
        merlon.castShadow = true;
        group.add(merlon);
      }

    } else if (ft === 'stone_alchemy') {
      // ── B Alchemy: retort flasks (emissive spheres) + rune slabs ─────
      const flaskMat = new THREE.MeshBasicMaterial({ color: 0x88ffaa });
      const runeMat  = new THREE.MeshLambertMaterial({ color: 0x2a1f3a });
      materials.push(flaskMat, runeMat);
      for (const { wx, wz } of pick(4)) {
        if (rng() > 0.45) {
          const fGeo = new THREE.SphereGeometry(0.2 + rng() * 0.06, 5, 4);
          geometries.push(fGeo);
          const f = new THREE.Mesh(fGeo, flaskMat);
          f.position.set(wx, tH + 0.22, wz);
          group.add(f);
        } else {
          const rGeo = new THREE.BoxGeometry(0.16, 0.36, 0.1);
          geometries.push(rGeo);
          const r = new THREE.Mesh(rGeo, runeMat);
          r.position.set(wx, tH + 0.18, wz);
          r.rotation.y = rng() * Math.PI;
          group.add(r);
        }
      }

    } else if (ft === 'stone_herald') {
      // ── F0 Herald: stone finials (octahedra) ─────────────────────────
      const finMat = new THREE.MeshLambertMaterial({ color: 0x8888aa });
      materials.push(finMat);
      for (const { wx, wz } of pick(4)) {
        const fGeo = new THREE.OctahedronGeometry(0.26 + rng() * 0.08, 0);
        geometries.push(fGeo);
        const fin = new THREE.Mesh(fGeo, finMat);
        fin.position.set(wx, tH + 0.26, wz);
        fin.castShadow = true;
        group.add(fin);
      }

    } else if (ft === 'wood' && floorIdx === 1) {
      // ── F1 Library: stacked book clusters ────────────────────────────
      const bookMat2 = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
      materials.push(bookMat2);
      for (const { wx, wz } of pick(4)) {
        let stackY = tH;
        const count = 2 + Math.floor(rng() * 2);
        for (let b = 0; b < count; b++) {
          const bH = 0.1 + rng() * 0.08;
          const bW = 0.26 + rng() * 0.14;
          const bGeo = new THREE.BoxGeometry(bW, bH, cellSize * 0.38);
          geometries.push(bGeo);
          const bk = new THREE.Mesh(bGeo, bookMat2);
          bk.position.set(wx + (rng() - 0.5) * 0.1, stackY + bH / 2, wz + (rng() - 0.5) * 0.08);
          bk.rotation.y = (rng() - 0.5) * 0.25;
          bk.castShadow = true;
          group.add(bk);
          stackY += bH;
        }
      }

    } else if (ft === 'stone_damp') {
      // ── F2 Brewery: mini barrels (on side) + mushroom clusters ───────
      const barMat  = new THREE.MeshLambertMaterial({ color: 0x5a3820 });
      const mushMat = new THREE.MeshLambertMaterial({ color: 0xccaa88 });
      materials.push(barMat, mushMat);
      for (const { wx, wz } of pick(4)) {
        if (rng() > 0.4) {
          const bGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 7);
          geometries.push(bGeo);
          const bar = new THREE.Mesh(bGeo, barMat);
          bar.position.set(wx, tH + 0.18, wz);
          bar.rotation.z = Math.PI / 2;
          bar.rotation.y = rng() * Math.PI;
          group.add(bar);
        } else {
          const capGeo3 = new THREE.SphereGeometry(0.18, 6, 4);
          geometries.push(capGeo3);
          const cap3 = new THREE.Mesh(capGeo3, mushMat);
          cap3.position.set(wx, tH + 0.22, wz);
          cap3.scale.set(1.0, 0.55, 1.0);
          group.add(cap3);
          const stGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.16, 5);
          geometries.push(stGeo);
          const st = new THREE.Mesh(stGeo, mushMat);
          st.position.set(wx, tH + 0.08, wz);
          group.add(st);
        }
      }

    } else if (ft === 'wood' && floorIdx === 3) {
      // ── F3 Quarters: star/moon finials (icosahedra) ──────────────────
      const starMat2 = new THREE.MeshLambertMaterial({ color: 0xd0e8ff });
      materials.push(starMat2);
      for (const { wx, wz } of pick(4)) {
        const iGeo = new THREE.IcosahedronGeometry(0.18 + rng() * 0.1, 0);
        geometries.push(iGeo);
        const ico = new THREE.Mesh(iGeo, starMat2);
        ico.position.set(wx, tH + 0.2, wz);
        group.add(ico);
      }

    } else if (ft === 'stone_scorched') {
      // ── F4 Forge: emissive fire bowls + slag lumps ───────────────────
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const slagMat = new THREE.MeshLambertMaterial({ color: 0x4a2210 });
      materials.push(fireMat, slagMat);
      for (const { wx, wz } of pick(4)) {
        if (rng() > 0.5) {
          const bGeo2 = new THREE.BoxGeometry(0.3, 0.18, 0.3);
          geometries.push(bGeo2);
          const bowl2 = new THREE.Mesh(bGeo2, fireMat);
          bowl2.position.set(wx, tH + 0.09, wz);
          group.add(bowl2);
        } else {
          const sGeo = new THREE.DodecahedronGeometry(0.2, 0);
          geometries.push(sGeo);
          const slag = new THREE.Mesh(sGeo, slagMat);
          slag.position.set(wx, tH + 0.2, wz);
          slag.rotation.y = rng() * Math.PI;
          group.add(slag);
        }
      }

    } else if (ft === 'wood' && floorIdx === 6) {
      // ── F6 War Room: small trophy poles with flag patches ─────────────
      const polMat = new THREE.MeshLambertMaterial({ color: 0x6b4422 });
      const flgMat = new THREE.MeshLambertMaterial({ color: 0x8b1a1a, side: THREE.DoubleSide });
      materials.push(polMat, flgMat);
      for (const { wx, wz } of pick(4)) {
        const pGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.56, 5);
        geometries.push(pGeo);
        const pol = new THREE.Mesh(pGeo, polMat);
        pol.position.set(wx, tH + 0.28, wz);
        group.add(pol);
        const fGeo2 = new THREE.PlaneGeometry(0.26, 0.18);
        geometries.push(fGeo2);
        const flg = new THREE.Mesh(fGeo2, flgMat);
        flg.position.set(wx + 0.13, tH + 0.47, wz);
        group.add(flg);
      }

    } else if (ft === 'grass') {
      // ── F7 Garden: flower clusters (low-poly icosahedra) ─────────────
      const PETAL_COLORS = [0xff88aa, 0xffee44, 0xcc88ff, 0xff7766];
      for (const { wx, wz } of pick(3)) {
        const ci = Math.floor(rng() * PETAL_COLORS.length);
        const fMat = new THREE.MeshLambertMaterial({ color: PETAL_COLORS[ci] });
        materials.push(fMat);
        const flGeo = new THREE.IcosahedronGeometry(0.16 + rng() * 0.1, 0);
        geometries.push(flGeo);
        const fl = new THREE.Mesh(flGeo, fMat);
        fl.position.set(
          wx + (rng() - 0.5) * 0.28,
          tH + 0.16 + rng() * 0.12,
          wz + (rng() - 0.5) * 0.28,
        );
        group.add(fl);
      }

    } else if (ft === 'stone_sealed') {
      // ── F8 Archive: upright rune slabs + warding orbs ────────────────
      const rslatMat = new THREE.MeshLambertMaterial({ color: 0x223355 });
      const wardMat  = new THREE.MeshBasicMaterial({ color: 0x44aadd });
      materials.push(rslatMat, wardMat);
      for (const { wx, wz } of pick(4)) {
        if (rng() > 0.5) {
          const rsGeo = new THREE.BoxGeometry(0.13, 0.4, 0.08);
          geometries.push(rsGeo);
          const rs = new THREE.Mesh(rsGeo, rslatMat);
          rs.position.set(wx, tH + 0.2, wz);
          rs.rotation.y = rng() * Math.PI;
          group.add(rs);
        } else {
          const wGeo = new THREE.SphereGeometry(0.16, 6, 5);
          geometries.push(wGeo);
          const wo = new THREE.Mesh(wGeo, wardMat);
          wo.position.set(wx, tH + 0.16, wz);
          group.add(wo);
        }
      }

    } else if (ft === 'stone_celestial') {
      // ── F9 Observatory: crystal formations + brass rings ─────────────
      const cryMat = new THREE.MeshBasicMaterial({ color: 0x88eeff });
      const briMat = new THREE.MeshLambertMaterial({ color: 0xcc9922 });
      materials.push(cryMat, briMat);
      for (const { wx, wz } of pick(3)) {
        if (rng() > 0.45) {
          const cGeo = new THREE.OctahedronGeometry(0.22 + rng() * 0.1, 0);
          geometries.push(cGeo);
          const cr = new THREE.Mesh(cGeo, cryMat);
          cr.position.set(wx, tH + 0.22, wz);
          cr.rotation.y = rng() * Math.PI;
          group.add(cr);
        } else {
          const tGeo = new THREE.TorusGeometry(0.2, 0.04, 6, 12);
          geometries.push(tGeo);
          const tor = new THREE.Mesh(tGeo, briMat);
          tor.position.set(wx, tH + 0.22, wz);
          tor.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.5;
          group.add(tor);
        }
      }
    }
    // stone + non-F5 / dirt have no wall-top decor (plain walls are fine)
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
      const shelfW = cellSize * 0.78;
      const shelfH = wallHeight * 0.72;
      const shelfD = cellSize * 0.28;

      // Frame: two side panels + top/bottom rails
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
      materials.push(frameMat);
      const sideGeo = new THREE.BoxGeometry(cellSize * 0.045, shelfH, shelfD);
      geometries.push(sideGeo);
      for (const sx of [-shelfW / 2 + cellSize * 0.022, shelfW / 2 - cellSize * 0.022]) {
        const side = new THREE.Mesh(sideGeo, frameMat);
        side.position.set(ix + (isRotated ? 0 : sx), shelfH / 2, iz + (isRotated ? sx : 0));
        side.rotation.y = rotRad;
        side.castShadow = true;
        group.add(side);
      }
      const railGeo = new THREE.BoxGeometry(shelfW, cellSize * 0.04, shelfD);
      geometries.push(railGeo);
      for (const ry of [shelfH - cellSize * 0.02, cellSize * 0.02]) {
        const rail = new THREE.Mesh(railGeo, frameMat);
        rail.position.set(ix, ry, iz);
        rail.rotation.y = rotRad;
        group.add(rail);
      }

      // Two interior shelf boards
      const boardGeo = new THREE.BoxGeometry(shelfW - cellSize * 0.06, cellSize * 0.035, shelfD - 0.04);
      geometries.push(boardGeo);
      for (const boardY of [shelfH * 0.36, shelfH * 0.68]) {
        const board = new THREE.Mesh(boardGeo, frameMat);
        board.position.set(ix, boardY, iz);
        board.rotation.y = rotRad;
        group.add(board);
      }

      // Book rows on each of the three compartments
      const BOOK_COLORS = [
        0x8b1a1a, 0x1a4a8b, 0x2a6b22, 0x8b6a1a,
        0x5a1a6b, 0x2a4a3a, 0x7a2a1a, 0x1a3a6b,
        0x6b4422, 0x334422, 0x1a5555, 0x882244,
      ];
      const posHash = (item.x * 31 + item.z * 17) | 0;
      const compartmentYs = [shelfH * 0.18, shelfH * 0.51, shelfH * 0.83];
      const compartmentH = [shelfH * 0.3, shelfH * 0.28, shelfH * 0.28];

      for (let comp = 0; comp < 3; comp++) {
        const usableW = shelfW - cellSize * 0.1;
        let cursor = -usableW / 2;
        let bookIdx = 0;
        while (cursor < usableW / 2 - 0.05) {
          const bW = 0.065 + ((posHash ^ (comp * 7 + bookIdx * 13)) % 7) * 0.018;
          const bH = compartmentH[comp]! * (0.65 + ((posHash ^ (bookIdx * 23)) % 10) * 0.035);
          const bColor = BOOK_COLORS[Math.abs((posHash + bookIdx * 3 + comp * 5)) % BOOK_COLORS.length]!;
          const bGeo = new THREE.BoxGeometry(bW, bH, shelfD * 0.75);
          geometries.push(bGeo);
          const bMat = new THREE.MeshLambertMaterial({ color: bColor });
          materials.push(bMat);
          const book = new THREE.Mesh(bGeo, bMat);
          const localX = cursor + bW / 2;
          book.position.set(
            ix + (isRotated ? 0 : localX),
            compartmentYs[comp]! + bH / 2 - bH * 0.04,
            iz + (isRotated ? localX : 0),
          );
          book.rotation.y = rotRad;
          group.add(book);
          cursor += bW + 0.006;
          bookIdx++;
        }
      }

      // Back panel (dark backing)
      const backMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });
      materials.push(backMat);
      const backGeo = new THREE.BoxGeometry(shelfW - cellSize * 0.05, shelfH - cellSize * 0.05, cellSize * 0.04);
      geometries.push(backGeo);
      const back = new THREE.Mesh(backGeo, backMat);
      back.position.set(ix, shelfH / 2, iz + (isRotated ? 0 : shelfD / 2 - cellSize * 0.02));
      back.rotation.y = rotRad;
      group.add(back);

      // Physics collider (single box for the whole unit)
      bodies.push(
        physics.createStaticBox(
          new THREE.Vector3(ix, shelfH / 2, iz),
          new THREE.Vector3(
            isRotated ? cellSize * 0.14 : shelfW / 2,
            shelfH / 2,
            isRotated ? shelfW / 2 : cellSize * 0.14,
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

    } else if (item.type === 'potion_rack') {
      const frameMat2 = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
      const glowMat2  = new THREE.MeshBasicMaterial({ color: 0x66ffaa });
      materials.push(frameMat2, glowMat2);
      const rack = buildPotionRack(frameMat2, glowMat2);
      rack.position.set(ix, 0, iz);
      rack.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(rack);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.7, iz), new THREE.Vector3(0.5, 0.7, 0.2)));

    } else if (item.type === 'distillation_coil') {
      const copperMat = new THREE.MeshLambertMaterial({ color: 0xc07840 });
      const glassMat2 = new THREE.MeshLambertMaterial({ color: 0x88ccee, transparent: true, opacity: 0.6 });
      materials.push(copperMat, glassMat2);
      const coil = buildDistillationCoil(copperMat, glassMat2);
      coil.position.set(ix, 0, iz);
      coil.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(coil);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.5, iz), new THREE.Vector3(0.4, 0.5, 0.4)));

    } else if (item.type === 'fermenting_vat') {
      const vatMat  = new THREE.MeshLambertMaterial({ color: 0x5a3a28 });
      const glassMat3 = new THREE.MeshLambertMaterial({ color: 0x88ee88, transparent: true, opacity: 0.5 });
      materials.push(vatMat, glassMat3);
      const vat = buildFermentingVat(vatMat, glassMat3);
      vat.position.set(ix, 0, iz);
      vat.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(vat);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.5, iz), new THREE.Vector3(0.45, 0.5, 0.45)));

    } else if (item.type === 'herb_bundle') {
      const herbMat = new THREE.MeshLambertMaterial({ color: 0x557744 });
      materials.push(herbMat);
      const bundle = buildHerbBundle(herbMat);
      bundle.position.set(ix, 0, iz);
      bundle.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(bundle);

    } else if (item.type === 'anvil') {
      const metalMat4 = new THREE.MeshLambertMaterial({ color: 0x444455 });
      materials.push(metalMat4);
      const anvil = buildAnvil(metalMat4);
      anvil.position.set(ix, 0, iz);
      anvil.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(anvil);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.45, iz), new THREE.Vector3(0.35, 0.45, 0.25)));

    } else if (item.type === 'cooling_trough') {
      const troughMat = new THREE.MeshLambertMaterial({ color: 0x336688 });
      materials.push(troughMat);
      const trough = buildCoolingTrough(troughMat);
      trough.position.set(ix, 0, iz);
      trough.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(trough);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.3, iz), new THREE.Vector3(0.6, 0.3, 0.3)));

    } else if (item.type === 'bed') {
      const bedFrameMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
      const mattressMat = new THREE.MeshLambertMaterial({ color: 0xeeddcc });
      materials.push(bedFrameMat, mattressMat);
      const bed = buildBed(bedFrameMat, mattressMat);
      bed.position.set(ix, 0, iz);
      bed.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(bed);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.25, iz), new THREE.Vector3(0.55, 0.25, 1.0)));

    } else if (item.type === 'wardrobe') {
      const wardrobeMat = new THREE.MeshLambertMaterial({ color: 0x4a3020 });
      materials.push(wardrobeMat);
      const wardrobe = buildWardrobe(wardrobeMat);
      wardrobe.position.set(ix, 0, iz);
      wardrobe.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(wardrobe);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.9, iz), new THREE.Vector3(0.5, 0.9, 0.3)));

    } else if (item.type === 'writing_desk') {
      // Simple desk: a flat surface with two angled legs
      const deskMat = new THREE.MeshLambertMaterial({ color: 0x6b4422 });
      materials.push(deskMat);
      const topGeo = new THREE.BoxGeometry(1.2, 0.06, 0.65);
      geometries.push(topGeo);
      const top = new THREE.Mesh(topGeo, deskMat);
      top.position.set(ix, 0.76, iz);
      top.castShadow = true;
      group.add(top);
      for (const [lx, lz] of [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]] as [number, number][]) {
        const legGeo = new THREE.BoxGeometry(0.06, 0.76, 0.06);
        geometries.push(legGeo);
        const leg = new THREE.Mesh(legGeo, deskMat);
        leg.position.set(ix + lx, 0.38, iz + lz);
        group.add(leg);
      }
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.38, iz), new THREE.Vector3(0.6, 0.38, 0.325)));

    } else if (item.type === 'bunk') {
      const bunkMat   = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
      const fabricMat = new THREE.MeshLambertMaterial({ color: 0xddccaa });
      materials.push(bunkMat, fabricMat);
      const bunk = buildBunk(bunkMat, fabricMat);
      bunk.position.set(ix, 0, iz);
      bunk.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(bunk);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.9, iz), new THREE.Vector3(0.5, 0.9, 1.0)));

    } else if (item.type === 'mess_table') {
      const messMat = new THREE.MeshLambertMaterial({ color: 0x5a4020 });
      materials.push(messMat);
      const messTable = buildMessTable(messMat);
      messTable.position.set(ix, 0, iz);
      messTable.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(messTable);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.38, iz), new THREE.Vector3(0.7, 0.38, 0.4)));

    } else if (item.type === 'reading_table') {
      const readMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
      materials.push(readMat);
      const readTable = buildReadingTable(readMat);
      readTable.position.set(ix, 0, iz);
      readTable.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(readTable);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.38, iz), new THREE.Vector3(0.65, 0.38, 0.45)));

    } else if (item.type === 'globe') {
      const globeMat = new THREE.MeshLambertMaterial({ color: 0x335588 });
      materials.push(globeMat);
      const globe = buildGlobe(globeMat);
      globe.position.set(ix, 0, iz);
      globe.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(globe);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.6, iz), new THREE.Vector3(0.3, 0.6, 0.3)));

    } else if (item.type === 'map_table') {
      const mapMat = new THREE.MeshLambertMaterial({ color: 0x4a3a20 });
      materials.push(mapMat);
      const mapTable = buildMapTable(mapMat);
      mapTable.position.set(ix, 0, iz);
      mapTable.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(mapTable);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.42, iz), new THREE.Vector3(0.7, 0.42, 0.5)));

    } else if (item.type === 'weapon_stand') {
      const weapMat = new THREE.MeshLambertMaterial({ color: 0x444455 });
      materials.push(weapMat);
      const weapStand = buildWeaponStand(weapMat);
      weapStand.position.set(ix, 0, iz);
      weapStand.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(weapStand);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.7, iz), new THREE.Vector3(0.25, 0.7, 0.25)));

    } else if (item.type === 'plant_pot') {
      const potMat  = new THREE.MeshLambertMaterial({ color: 0x7a4a22 });
      materials.push(potMat);
      const pot = buildPlantPot(potMat);
      pot.position.set(ix, 0, iz);
      pot.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(pot);

    } else if (item.type === 'raised_planter') {
      const planterMat = new THREE.MeshLambertMaterial({ color: 0x5a3820 });
      materials.push(planterMat);
      const planter = buildRaisedPlanter(planterMat);
      planter.position.set(ix, 0, iz);
      planter.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(planter);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.45, iz), new THREE.Vector3(0.55, 0.45, 0.35)));

    } else if (item.type === 'containment_ring') {
      const containMat = new THREE.MeshLambertMaterial({ color: 0x334466, emissive: new THREE.Color(0x001133) });
      materials.push(containMat);
      const ring2 = buildContainmentRing(containMat);
      ring2.position.set(ix, 0, iz);
      group.add(ring2);

    } else if (item.type === 'astrolabe') {
      const astroMat = new THREE.MeshLambertMaterial({ color: 0xcc9922 });
      materials.push(astroMat);
      const astrolabe = buildAstrolabe(astroMat);
      astrolabe.position.set(ix, 0, iz);
      astrolabe.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(astrolabe);
      bodies.push(physics.createStaticBox(new THREE.Vector3(ix, 0.5, iz), new THREE.Vector3(0.3, 0.5, 0.3)));

    } else if (item.type === 'banner') {
      const poleMat2  = new THREE.MeshLambertMaterial({ color: 0x886633 });
      materials.push(poleMat2);
      const banner = buildBanner(poleMat2, '#8b1a1a', '#eecc66');
      banner.position.set(ix, 0, iz);
      banner.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(banner);

    } else if (item.type === 'rug') {
      const rug = buildRug('#8b3a2a', '#ccaa44');
      rug.position.set(ix, 0.005, iz);
      rug.rotation.y = THREE.MathUtils.degToRad(item.rotation ?? 0);
      group.add(rug);

    } else if (item.type === 'workbench_key') {
      const stoneMat2 = new THREE.MeshLambertMaterial({ color: 0x666677 });
      const keyMat    = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      materials.push(stoneMat2, keyMat);

      // Workbench counter: long stone surface with two legs
      const counterGeo = new THREE.BoxGeometry(1.9, 0.08, 0.85);
      geometries.push(counterGeo);
      const counter = new THREE.Mesh(counterGeo, stoneMat2);
      counter.position.set(ix, 0.88, iz);
      counter.castShadow = true;
      group.add(counter);

      const baseBlockGeo = new THREE.BoxGeometry(1.9, 0.88, 0.85);
      geometries.push(baseBlockGeo);
      const baseBlock = new THREE.Mesh(baseBlockGeo, stoneMat2);
      baseBlock.position.set(ix, 0.44, iz);
      baseBlock.castShadow = true;
      group.add(baseBlock);

      // Key shaft
      const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.42, 7);
      geometries.push(shaftGeo);
      const shaft = new THREE.Mesh(shaftGeo, keyMat);
      shaft.position.set(ix, 1.1, iz);
      shaft.rotation.z = Math.PI / 2;  // horizontal, laying flat
      group.add(shaft);

      // Key bow (ring at the grip end)
      const bowGeo = new THREE.TorusGeometry(0.115, 0.038, 7, 14);
      geometries.push(bowGeo);
      const bow = new THREE.Mesh(bowGeo, keyMat);
      bow.position.set(ix + 0.28, 1.1, iz);
      bow.rotation.y = Math.PI / 2;
      group.add(bow);

      // Two key teeth
      for (const [tx, ty] of [[-0.08, 0.06], [-0.04, 0.06]] as [number, number][]) {
        const toothGeo = new THREE.BoxGeometry(0.055, 0.075, 0.04);
        geometries.push(toothGeo);
        const tooth = new THREE.Mesh(toothGeo, keyMat);
        tooth.position.set(ix + tx, 1.1 - 0.055, iz + ty);
        group.add(tooth);
      }

      // Soft golden glow disc below the key (emissive halo effect)
      const haloDiskGeo = new THREE.CircleGeometry(0.28, 12);
      haloDiskGeo.rotateX(-Math.PI / 2);
      geometries.push(haloDiskGeo);
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.45 });
      materials.push(haloMat);
      const halo = new THREE.Mesh(haloDiskGeo, haloMat);
      halo.position.set(ix, 0.93, iz);
      group.add(halo);

      bodies.push(physics.createStaticBox(
        new THREE.Vector3(ix, 0.44, iz),
        new THREE.Vector3(0.95, 0.44, 0.425),
      ));

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
