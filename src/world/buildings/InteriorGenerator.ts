/**
 * InteriorGenerator.ts — PROC-C3
 *
 * Generates a THREE.js interior scene from a BuildingDNA.
 *
 * Architecture ported from bloom/src/ui/interior/ (voxel → THREE.js):
 *   HousePlan (tile grid) → RoomBlueprint (wall tiles + purpose) →
 *   StyleProfile (colours/materials) → Occupancy → furnishRoom() →
 *   buildProp(dna) → THREE.Group
 *
 * One tile = 1 world unit. Room height = FLOOR_HEIGHT.
 * Called by SceneManager when the player enters a building door.
 */

import * as THREE from 'three';
import type { BuildingDNA } from './BuildingDNA';
import { FLOOR_HEIGHT, STYLE_COLORS } from './BuildingDNA';
import { buildProp } from '@/prop-creator/builder';
import type { PropKind, PropMaterial, PropTheme } from '@/prop-creator/types';
import { MATERIAL_COLORS } from '@/prop-creator/types';
import { stoneTexture, brickTexture, renderTexture } from './TextureFactory';
import { mulberry32 } from '@/core/prng';

// ── Tile constants ────────────────────────────────────────────────────────────

const TILE_FLOOR   = 0;
const TILE_WALL    = 1;
const TILE_DOOR    = 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export type Facing = 'N' | 'E' | 'S' | 'W';
export type RoomPurpose = 'living' | 'kitchen' | 'bedroom' | 'hall' | 'bar' | 'storage' | 'workshop' | 'chapel_nave';

export interface RoomDef {
  x: number; z: number;
  w: number; d: number;
  purpose: RoomPurpose;
  centerX: number; centerZ: number;
}

export interface WallTile { tx: number; tz: number; face: Facing; }

export interface RoomBlueprint extends RoomDef {
  wallTiles: WallTile[];
  focus?: { tx: number; tz: number };
}

export interface HousePlan {
  w: number; d: number;
  grid: Uint8Array;
  rooms: RoomDef[];
}

/** Material palette ported from bloom's StyleProfile, mapped to our styles. */
export interface StyleProfile {
  floor:    string;  // hex
  floorAlt: string;
  wall:     string;
  wallDark: string;
  wood:     string;
  woodDark: string;
  woodLight:string;
  textileA: string;
  textileB: string;
  metal:    string;
  density:  number;  // 0–1
  wear:     number;  // 0–1
  warmth:   number;  // 0–1
}

export interface InteriorScene {
  group:      THREE.Group;
  lights:     THREE.PointLight[];
  /** Door back-trigger position (root-local space). */
  exitPos?:   THREE.Vector3;
  /** Stair-up trigger position (root-local). Only present if floorIndex < totalFloors-1. */
  stairUpPos?:  THREE.Vector3;
  /** Stair-down trigger position (root-local). Only present if floorIndex > 0. */
  stairDownPos?: THREE.Vector3;
  /** Occluder meshes (walls + ceiling) — pass to OcclusionManager to fade when between camera and player. */
  occluderMeshes: THREE.Mesh[];
  /** Plan tile dimensions — use for physics box sizing. */
  planW:      number;
  planD:      number;
  /** Centre of the floor in root-local XZ space (useful for physics box placement). */
  floorCenter: THREE.Vector3;
  /** Which floor this scene represents (0-based). */
  floorIndex:  number;
  /** Total floors this building has. */
  totalFloors: number;
}

// ── Style profiles per building style ────────────────────────────────────────

const STYLE_PROFILES: Record<string, StyleProfile> = {
  thatched: { floor:'#8b6040',floorAlt:'#7a5030',wall:'#d8c8a0',wallDark:'#b0a080',wood:'#7a5030',woodDark:'#5a3820',woodLight:'#9a7050',textileA:'#a84030',textileB:'#4a5a86',metal:'#404348',density:0.7,wear:0.4,warmth:0.8 },
  timber:   { floor:'#8a6038',floorAlt:'#6a4828',wall:'#e8e0c8',wallDark:'#c0b8a0',wood:'#6a4828',woodDark:'#4a2818',woodLight:'#8a6848',textileA:'#7a3a4a',textileB:'#c0674a',metal:'#404348',density:0.65,wear:0.35,warmth:0.75 },
  stone:    { floor:'#7a7870',floorAlt:'#686660',wall:'#9a9090',wallDark:'#706868',wood:'#6a5040',woodDark:'#4a3828',woodLight:'#8a7060',textileA:'#4a6070',textileB:'#a06840',metal:'#3a3840',density:0.5,wear:0.5,warmth:0.5 },
  arcane:   { floor:'#382860',floorAlt:'#281848',wall:'#4a3870',wallDark:'#2a1850',wood:'#3a2850',woodDark:'#2a1840',woodLight:'#5a4870',textileA:'#8060c0',textileB:'#c080ff',metal:'#504880',density:0.8,wear:0.3,warmth:0.6 },
  gothic:   { floor:'#404040',floorAlt:'#303030',wall:'#585858',wallDark:'#383838',wood:'#2a2a2a',woodDark:'#1a1a1a',woodLight:'#3a3a3a',textileA:'#800020',textileB:'#2a2050',metal:'#303038',density:0.6,wear:0.6,warmth:0.3 },
  vampiric: { floor:'#1a1020',floorAlt:'#100818',wall:'#2a2030',wallDark:'#1a1020',wood:'#1a1820',woodDark:'#0a0810',woodLight:'#2a2030',textileA:'#8a1030',textileB:'#4a2860',metal:'#201828',density:0.8,wear:0.4,warmth:0.2 },
  nordic:   { floor:'#6a5038',floorAlt:'#5a4028',wall:'#7a6a50',wallDark:'#5a4a38',wood:'#5a3818',woodDark:'#3a2008',woodLight:'#7a5030',textileA:'#8a3828',textileB:'#3a5080',metal:'#404848',density:0.5,wear:0.6,warmth:0.7 },
};

function styleForDna(dna: BuildingDNA): StyleProfile {
  return STYLE_PROFILES[dna.style] ?? STYLE_PROFILES['stone']!;
}

// ── Room plan generation ──────────────────────────────────────────────────────

/**
 * Generate a tile floor plan for a building based on its kind + footprint.
 * Ported from bloom's roomLayout approach: outer ring = walls, inner = rooms.
 */
export function generatePlan(dna: BuildingDNA): HousePlan {
  const fp    = getBuildingFootprint(dna);
  const w     = fp.w;
  const d     = fp.d;
  const grid  = new Uint8Array(w * d).fill(TILE_WALL);
  const rooms: RoomDef[] = [];

  function setFloor(x: number, z: number): void {
    if (x >= 0 && z >= 0 && x < w && z < d) grid[x + w * z] = TILE_FLOOR;
  }
  function fillRoom(rx: number, rz: number, rw: number, rd: number, purpose: RoomPurpose): void {
    for (let z = rz; z < rz + rd; z++)
      for (let x = rx; x < rx + rw; x++)
        setFloor(x, z);
    rooms.push({ x: rx, z: rz, w: rw, d: rd, purpose,
                 centerX: rx + Math.floor(rw / 2), centerZ: rz + Math.floor(rd / 2) });
  }
  function setDoor(x: number, z: number): void {
    if (x >= 0 && z >= 0 && x < w && z < d) grid[x + w * z] = TILE_DOOR;
  }

  const kw = w - 2;  // inner width (exclude perimeter walls)
  const kd = d - 2;

  switch (dna.buildingKind) {
    case 'house': case 'cottage': case 'terraced': {
      // living room (front), kitchen (back-left), bedroom (back-right)
      const ld = Math.ceil(kd * 0.55);
      fillRoom(1, 1, kw, ld, 'living');
      const bw = Math.floor(kw / 2);
      const backD = kd - ld - 1;
      if (backD > 1) {
        fillRoom(1,        1 + ld + 1, bw,       backD, 'kitchen');
        fillRoom(1 + bw + 1, 1 + ld + 1, kw - bw - 1, backD, 'bedroom');
        // 2-tile wide passage: living → kitchen + bedroom
        const px = 1 + Math.floor(kw / 2) - 1;
        setFloor(px,     1 + ld);
        setFloor(px + 1, 1 + ld);
        // Connect kitchen ↔ bedroom through shared wall
        const connZ = 1 + ld + 1 + Math.floor(backD / 2);
        setFloor(1 + bw, connZ);
      }
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'villa': {
      const hw = Math.floor(kw / 2);
      const hd = Math.floor(kd * 0.5);
      fillRoom(1,      1,      hw,       hd, 'living');
      fillRoom(2 + hw, 1,      kw - hw,  hd, 'living');
      fillRoom(1,      2 + hd, hw,       kd - hd - 1, 'bedroom');
      fillRoom(2 + hw, 2 + hd, kw - hw,  kd - hd - 1, 'kitchen');
      // Passages: top 2 rooms linked, both rows connected
      setFloor(1 + hw, 1 + Math.floor(hd / 2));
      setFloor(1 + hw, 1 + hd);
      setFloor(1 + hw, 2 + hd + Math.floor((kd - hd - 1) / 2));
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'inn': case 'tavern': {
      const barW = Math.min(3, Math.floor(kw * 0.35));
      const frontD = Math.floor(kd * 0.6);
      fillRoom(1,            1, kw - barW - 1, frontD, 'living');
      fillRoom(kw - barW + 1, 1, barW,          frontD, 'bar');
      // Connect bar ↔ common room
      setFloor(kw - barW, 1 + Math.floor(frontD / 2));
      const sleepD = kd - frontD - 1;
      if (sleepD > 2) {
        const hw2 = Math.floor(kw / 2);
        fillRoom(1,      2 + frontD, hw2,        sleepD, 'bedroom');
        fillRoom(2 + hw2, 2 + frontD, kw - hw2 - 1, sleepD, 'bedroom');
        // 2-tile passage: common → bedrooms
        const px2 = 1 + Math.floor(kw / 2) - 1;
        setFloor(px2,     1 + frontD);
        setFloor(px2 + 1, 1 + frontD);
        // Bedroom ↔ bedroom passage
        setFloor(1 + hw2, 2 + frontD + Math.floor(sleepD / 2));
      }
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'shop': {
      const shopD = Math.floor(kd * 0.6);
      fillRoom(1, 1, kw, shopD, 'living');
      fillRoom(1, 2 + shopD, kw, kd - shopD - 1, 'storage');
      setFloor(Math.floor(w / 2) - 1, 1 + shopD);
      setFloor(Math.floor(w / 2),     1 + shopD);
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'blacksmith': {
      fillRoom(1, 1, kw, kd, 'workshop');
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'apothecary': {
      const apoD = Math.floor(kd * 0.55);
      fillRoom(1, 1, kw, apoD, 'living');
      fillRoom(1, 2 + apoD, kw, kd - apoD - 1, 'storage');
      setFloor(Math.floor(w / 2) - 1, 1 + apoD);
      setFloor(Math.floor(w / 2),     1 + apoD);
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    case 'chapel': {
      fillRoom(1, 1, kw, kd, 'chapel_nave');
      setDoor(Math.floor(w / 2) - 1, d - 1);
      setDoor(Math.floor(w / 2),     d - 1);
      break;
    }
    case 'guild': {
      const hallD = Math.floor(kd * 0.6);
      fillRoom(1, 1, kw, hallD, 'hall');
      fillRoom(1, 2 + hallD, Math.floor(kw / 2), kd - hallD - 1, 'storage');
      fillRoom(2 + Math.floor(kw / 2), 2 + hallD, kw - Math.floor(kw / 2) - 1, kd - hallD - 1, 'bedroom');
      setFloor(Math.floor(kw / 2) - 1, 1 + hallD);
      setFloor(Math.floor(kw / 2),     1 + hallD);
      setFloor(1 + Math.floor(kw / 2), 2 + hallD + Math.floor((kd - hallD - 1) / 2));
      setDoor(Math.floor(w / 2), d - 1);
      break;
    }
    default: {
      fillRoom(1, 1, kw, kd, 'hall');
      setDoor(Math.floor(w / 2) - 1, d - 1);
      setDoor(Math.floor(w / 2),     d - 1);
      break;
    }
  }

  return { w, d, grid, rooms };
}

function getBuildingFootprint(dna: BuildingDNA): { w: number; d: number } {
  // Use the same footprint logic as BuildingBuilder
  const BASE: Record<string, { w: number; d: number }> = {
    tiny: { w: 6, d: 6 }, small: { w: 9, d: 7 }, medium: { w: 11, d: 9 }, large: { w: 15, d: 12 },
  };
  const KIND_OVERRIDE: Partial<Record<string, { w: number; d: number }>> = {
    terraced: { w: 7, d: 9 }, cottage: { w: 11, d: 9 }, villa: { w: 14, d: 11 },
    tavern: { w: 14, d: 11 }, apothecary: { w: 7, d: 8 }, chapel: { w: 9, d: 16 },
  };
  return KIND_OVERRIDE[dna.buildingKind] ?? BASE[dna.size] ?? BASE['medium']!;
}

// ── Blueprint derivation (ported from bloom/blueprint.ts) ─────────────────────

export function deriveBlueprints(plan: HousePlan): RoomBlueprint[] {
  const isWall = (x: number, z: number): boolean => {
    if (x < 0 || z < 0 || x >= plan.w || z >= plan.d) return true;
    return plan.grid[x + plan.w * z] !== TILE_FLOOR;
  };
  const isFloor = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < plan.w && z < plan.d && plan.grid[x + plan.w * z] === TILE_FLOOR;

  return plan.rooms.map(r => {
    const wallTiles: WallTile[] = [];
    for (let tz = r.z; tz < r.z + r.d; tz++) {
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        if (!isFloor(tx, tz)) continue;
        if      (isWall(tx, tz - 1)) wallTiles.push({ tx, tz, face: 'S' });
        else if (isWall(tx, tz + 1)) wallTiles.push({ tx, tz, face: 'N' });
        else if (isWall(tx - 1, tz)) wallTiles.push({ tx, tz, face: 'E' });
        else if (isWall(tx + 1, tz)) wallTiles.push({ tx, tz, face: 'W' });
      }
    }
    return { ...r, wallTiles };
  });
}

// ── Occupancy (ported from bloom/furnish.ts) ──────────────────────────────────

export class Occupancy {
  private readonly blocked: Uint8Array;
  constructor(readonly plan: HousePlan) {
    const n   = plan.w * plan.d;
    this.blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++)
      if (plan.grid[i] !== TILE_FLOOR) this.blocked[i] = 1;
    // Reserve door adjacents
    for (let z = 0; z < plan.d; z++) {
      for (let x = 0; x < plan.w; x++) {
        if (plan.grid[x + plan.w * z] !== TILE_DOOR) continue;
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < plan.w && nz < plan.d)
            this.blocked[nx + plan.w * nz] = 1;
        }
      }
    }
  }
  placeable(tx: number, tz: number): boolean {
    if (tx < 0 || tz < 0 || tx >= this.plan.w || tz >= this.plan.d) return false;
    return this.blocked[tx + this.plan.w * tz] === 0;
  }
  fill(tx: number, tz: number, w = 1, d = 1): void {
    for (let z = tz; z < tz + d; z++)
      for (let x = tx; x < tx + w; x++)
        if (x >= 0 && z >= 0 && x < this.plan.w && z < this.plan.d)
          this.blocked[x + this.plan.w * z] = 1;
  }
}

// ── Prop placement helpers ────────────────────────────────────────────────────

const DIR: Record<Facing, [number, number]> = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] };

function placeAt(
  g: THREE.Group,
  occ: Occupancy,
  tx: number, tz: number,
  kind: PropKind, mat: PropMaterial,
  theme: PropTheme,
  seed: number,
  rotation = 0,
): boolean {
  if (!occ.placeable(tx, tz)) return false;
  const dna = {
    v:1, kind:'prop' as const, name:`${mat} ${kind}`, seed,
    propKind: kind, material: mat, theme, condition:'weathered' as const,
    size: 1, colors: MATERIAL_COLORS[mat] ?? MATERIAL_COLORS['wood']!,
    interactive: kind === 'chest' || kind === 'door',
    glow: kind === 'lantern' || kind === 'cauldron',
    glowIntensity: 0.8,
  };
  const built = buildProp(dna);
  built.root.position.set(tx + 0.5, 0, tz + 0.5);
  built.root.rotation.y = rotation;
  g.add(built.root);
  occ.fill(tx, tz);
  return true;
}

function anchorToWall(
  g: THREE.Group, occ: Occupancy, room: RoomBlueprint,
  kind: PropKind, mat: PropMaterial, theme: PropTheme, seed: number,
): boolean {
  const r   = mulberry32(seed);
  const walls = [...room.wallTiles].sort(() => r() - 0.5);
  for (const wt of walls) {
    const [dx, dz] = DIR[wt.face];
    const rot = wt.face === 'N' ? 0 : wt.face === 'S' ? Math.PI
              : wt.face === 'E' ? -Math.PI/2 : Math.PI/2;
    if (!occ.placeable(wt.tx, wt.tz)) continue;
    // Confirm clearance in facing direction
    const fx = wt.tx + dx, fz = wt.tz + dz;
    if (occ.placeable(fx, fz)) {
      placeAt(g, occ, wt.tx, wt.tz, kind, mat, theme, seed, rot);
      return true;
    }
  }
  return false;
}

function scatter(
  g: THREE.Group, occ: Occupancy, room: RoomBlueprint,
  kinds: PropKind[], count: number, mat: PropMaterial, theme: PropTheme, seed: number,
): void {
  const r = mulberry32(seed ^ 0x5C470001);
  let placed = 0;
  // Scatter within the safe interior of the room (1 tile inset from room edges)
  const sx = room.x + 1, sz = room.z + 1;
  const sw = Math.max(1, room.w - 2), sd = Math.max(1, room.d - 2);
  for (let attempt = 0; attempt < count * 12 && placed < count; attempt++) {
    const tx = sx + Math.floor(r() * sw);
    const tz = sz + Math.floor(r() * sd);
    const k  = kinds[Math.floor(r() * kinds.length)]!;
    if (placeAt(g, occ, tx, tz, k, mat, theme, seed ^ attempt, r() * Math.PI * 2)) placed++;
  }
}

// ── Floor surface ─────────────────────────────────────────────────────────────

function layFloorSurface(g: THREE.Group, plan: HousePlan, style: StyleProfile): void {
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.floor),
    roughness: 0.88,
    map: renderTexture(Math.max(1, plan.w / 3), Math.max(1, plan.d / 3)),
  });
  // One plane per floor tile
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let z = 0; z < plan.d; z++) {
    for (let x = 0; x < plan.w; x++) {
      const t = plan.grid[x + plan.w * z]!;
      if (t !== TILE_FLOOR && t !== TILE_DOOR) continue;
      const mesh = new THREE.Mesh(geo, floorMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x + 0.5, 0.01, z + 0.5);
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }
}

// ── Wall surfaces ─────────────────────────────────────────────────────────────

function buildWallSurfaces(g: THREE.Group, plan: HousePlan, style: StyleProfile, h: number): void {
  const wallMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(style.wall),
    roughness: 0.92,
    map: stoneTexture(Math.max(1, plan.w / 2.5), Math.max(1, h / 2.5)),
  });
  const trimMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.woodDark) });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x90b8d0, transparent: true, opacity: 0.45 });

  const isWall = (x: number, z: number): boolean =>
    x < 0 || z < 0 || x >= plan.w || z >= plan.d || plan.grid[x + plan.w * z] === TILE_WALL;
  const isPassable = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < plan.w && z < plan.d && plan.grid[x + plan.w * z] !== TILE_WALL;
  const isDoor = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < plan.w && z < plan.d && plan.grid[x + plan.w * z] === TILE_DOOR;
  // Is a tile on the building exterior (neighbours the boundary wall)?
  const isExterior = (x: number, z: number): boolean => x <= 1 || z <= 1 || x >= plan.w - 2 || z >= plan.d - 2;

  // Track which wall faces get windows to avoid duplicate placement
  const windowSet = new Set<string>();

  for (let z = 0; z < plan.d; z++) {
    for (let x = 0; x < plan.w; x++) {
      if (!isPassable(x, z)) continue;

      const faces = [
        { cond: isWall(x, z - 1), geo: new THREE.BoxGeometry(1, h, 0.15), pos: new THREE.Vector3(x + 0.5, h / 2, z + 0.075), isN: true, isDoorFace: isDoor(x, z - 1) },
        { cond: isWall(x, z + 1), geo: new THREE.BoxGeometry(1, h, 0.15), pos: new THREE.Vector3(x + 0.5, h / 2, z + 1 - 0.075), isN: false, isDoorFace: isDoor(x, z + 1) },
        { cond: isWall(x - 1, z), geo: new THREE.BoxGeometry(0.15, h, 1), pos: new THREE.Vector3(x + 0.075, h / 2, z + 0.5),     isN: false, isDoorFace: isDoor(x - 1, z) },
        { cond: isWall(x + 1, z), geo: new THREE.BoxGeometry(0.15, h, 1), pos: new THREE.Vector3(x + 1 - 0.075, h / 2, z + 0.5), isN: false, isDoorFace: isDoor(x + 1, z) },
      ] as const;

      for (const face of faces) {
        if (!face.cond) continue;
        const m = new THREE.Mesh(face.geo, wallMat.clone());
        m.position.copy(face.pos); m.castShadow = m.receiveShadow = true;
        m.userData.isOccluder = true; m.userData._origOpacity = 1;
        g.add(m);
      }

      // ── Door arches at TILE_DOOR adjacencies ──────────────────────────────
      // Detect door to the north (z-1) or south (z+1) of this floor tile
      for (const [dx, dz, isNS] of [[0,-1,true],[0,1,true],[1,0,false],[-1,0,false]] as [number,number,boolean][]) {
        const nx = x + dx, nz = z + dz;
        if (!isDoor(nx, nz)) continue;
        const archKey = `${nx},${nz}`;
        if (windowSet.has('arch:' + archKey)) continue;
        windowSet.add('arch:' + archKey);

        // Trim posts either side of door gap
        const postH = h * 0.82, postW = 0.12;
        if (isNS) {
          // Door runs along X axis — posts at left and right ends of the tile gap
          const pz = nz + 0.5;
          for (const px2 of [nx, nx + 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), trimMat);
            post.position.set(px2, postH / 2, pz); g.add(post);
          }
          // Lintel above
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(1 + postW, postW, postW * 1.5), trimMat);
          lintel.position.set(nx + 0.5, postH, pz); g.add(lintel);
        } else {
          // Door runs along Z axis
          const px2 = nx + 0.5;
          for (const pz2 of [nz, nz + 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(postW, postH, postW), trimMat);
            post.position.set(px2, postH / 2, pz2); g.add(post);
          }
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(postW * 1.5, postW, 1 + postW), trimMat);
          lintel.position.set(px2, postH, nz + 0.5); g.add(lintel);
        }
      }

      // ── Windows on exterior walls ──────────────────────────────────────────
      if (!isExterior(x, z)) continue;
      for (const [dx, dz, isNS] of [[0,-1,true],[0,1,true],[1,0,false],[-1,0,false]] as [number,number,boolean][]) {
        const nx = x + dx, nz = z + dz;
        // Exterior wall: neighbor is out-of-bounds OR is on the perimeter wall
        if (!isWall(nx, nz)) continue;
        if (isDoor(nx, nz)) continue;
        // Place window once per wall tile face, every 3+ tiles
        const wKey = `win:${isNS ? `${x}_${z}_ns` : `${x}_${z}_ew`}`;
        if (windowSet.has(wKey)) continue;
        // Check the neighboring floor tiles to avoid windows in 1-tile rooms
        const neighborFloor = isNS
          ? isPassable(x - 1, z) && isPassable(x + 1, z)
          : isPassable(x, z - 1) && isPassable(x, z + 1);
        if (!neighborFloor) continue;
        windowSet.add(wKey);

        const wH = h * 0.38, wBot = h * 0.32;
        const wOff = 0.07;

        if (isNS) {
          const wz = dz < 0 ? z + wOff : z + 1 - wOff;
          // Glass
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.55, wH, 0.04), glassMat);
          glass.position.set(x + 0.5, wBot + wH / 2, wz); g.add(glass);
          // Frame
          for (const [fw, fh, fx2, fz2] of [
            [0.59, 0.05, x + 0.5, wz],       // top rail
            [0.59, 0.05, x + 0.5, wz],       // bot rail (same pos, offset y below)
            [0.05, wH + 0.05, x + 0.22, wz], // left post
            [0.05, wH + 0.05, x + 0.78, wz], // right post
          ] as [number,number,number,number][]) {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.06), trimMat);
            fr.position.set(fx2, fh === 0.05 ? (fz2 === wz ? wBot + wH + 0.02 : wBot - 0.02) : wBot + wH / 2, fz2);
            g.add(fr);
          }
        } else {
          const wx = dx < 0 ? x + wOff : x + 1 - wOff;
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.04, wH, 0.55), glassMat);
          glass.position.set(wx, wBot + wH / 2, z + 0.5); g.add(glass);
          for (const [fw, fh, fx2, fz2] of [
            [0.06, 0.05, wx, z + 0.5],
            [0.06, wH + 0.05, wx, z + 0.22],
            [0.06, wH + 0.05, wx, z + 0.78],
          ] as [number,number,number,number][]) {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(0.06, fh, fw), trimMat);
            fr.position.set(fx2, fh === 0.05 ? wBot + wH + 0.02 : wBot + wH / 2, fz2); g.add(fr);
          }
        }
      }
    }
  }
}

// ── Ceiling ───────────────────────────────────────────────────────────────────

function buildCeiling(g: THREE.Group, plan: HousePlan, style: StyleProfile, h: number): void {
  const ceilMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.wallDark), side: THREE.BackSide });
  const ceil    = new THREE.Mesh(new THREE.PlaneGeometry(plan.w, plan.d), ceilMat);
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.set(plan.w / 2, h - 0.05, plan.d / 2);
  ceil.userData.isOccluder = true; ceil.userData._origOpacity = 1;
  g.add(ceil);

  // Timber beam runners (visual only)
  const beamMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.woodDark) });
  const beamSpacing = Math.max(2, Math.floor(plan.w / 3));
  for (let bx = beamSpacing; bx < plan.w; bx += beamSpacing) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, plan.d), beamMat);
    beam.position.set(bx, h - 0.14, plan.d / 2);
    beam.userData.isOccluder = true; beam.userData._origOpacity = 1;
    g.add(beam);
  }
}

// ── Furnishing rule engine ────────────────────────────────────────────────────

function furnishRoom(
  g: THREE.Group, occ: Occupancy, room: RoomBlueprint,
  style: StyleProfile, theme: PropTheme, seed: number,
): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  const r = mulberry32(seed ^ 0xF0A10001);
  const mat = theme === 'alchemy' ? 'iron' : theme === 'dungeon' ? 'stone' : 'wood';

  switch (room.purpose) {
    case 'living': {
      anchorToWall(g, occ, room, 'bookshelf', 'wood', theme, seed ^ 1);
      anchorToWall(g, occ, room, 'table',     'wood', theme, seed ^ 2);
      scatter(g, occ, room, ['chair', 'chair', 'barrel'], Math.round(1 + style.density * 3), 'wood', theme, seed ^ 3);
      scatter(g, occ, room, ['rug'], 1, 'clay', theme, seed ^ 4);
      // Lantern
      const lx = room.centerX + 0.5, lz = room.centerZ + 0.5;
      const light = new THREE.PointLight(new THREE.Color('#ffcf8a'), 0.9, 6);
      light.position.set(lx, FLOOR_HEIGHT * 0.75, lz);
      g.add(light); lights.push(light);
      anchorToWall(g, occ, room, 'lantern', 'iron', theme, seed ^ 5);
      break;
    }
    case 'kitchen': {
      anchorToWall(g, occ, room, 'cauldron', 'iron', theme, seed ^ 1);
      anchorToWall(g, occ, room, 'table',    'wood', theme, seed ^ 2);
      scatter(g, occ, room, ['barrel', 'crate'], Math.round(2 + style.density * 2), mat, theme, seed ^ 3);
      anchorToWall(g, occ, room, 'lantern', 'iron', theme, seed ^ 4);
      const cl = new THREE.PointLight(new THREE.Color('#ffb060'), 1.1, 5);
      cl.position.set(room.centerX + 0.5, FLOOR_HEIGHT * 0.7, room.centerZ + 0.5);
      g.add(cl); lights.push(cl);
      break;
    }
    case 'bedroom': {
      anchorToWall(g, occ, room, 'chest',  'wood', theme, seed ^ 1);
      anchorToWall(g, occ, room, 'table',  'wood', theme, seed ^ 2);
      scatter(g, occ, room, ['chair'], 1, 'wood', theme, seed ^ 3);
      scatter(g, occ, room, ['rug'], 1, 'clay', theme, seed ^ 4);
      if (r() > 0.4) {
        const bl = new THREE.PointLight(new THREE.Color('#ffcf8a'), 0.6, 4);
        bl.position.set(room.centerX + 0.5, FLOOR_HEIGHT * 0.5, room.centerZ + 0.5);
        g.add(bl); lights.push(bl);
      }
      break;
    }
    case 'bar': {
      anchorToWall(g, occ, room, 'table', 'wood', theme, seed ^ 1);
      scatter(g, occ, room, ['barrel', 'crate', 'barrel'], 3, mat, theme, seed ^ 2);
      const brl = new THREE.PointLight(new THREE.Color('#ff9030'), 1.2, 5);
      brl.position.set(room.centerX + 0.5, FLOOR_HEIGHT * 0.8, room.centerZ + 0.5);
      g.add(brl); lights.push(brl);
      break;
    }
    case 'storage': {
      scatter(g, occ, room, ['barrel', 'crate', 'chest', 'barrel'], Math.round(3 + style.density * 3), mat, theme, seed ^ 1);
      break;
    }
    case 'workshop': {
      anchorToWall(g, occ, room, 'cauldron', 'iron', theme, seed ^ 1);
      anchorToWall(g, occ, room, 'table',    'wood', theme, seed ^ 2);
      scatter(g, occ, room, ['crate', 'barrel'], 3, mat, theme, seed ^ 3);
      const wl = new THREE.PointLight(new THREE.Color('#ff7020'), 1.4, 7);
      wl.position.set(room.centerX + 0.5, FLOOR_HEIGHT * 0.6, room.centerZ + 0.5);
      g.add(wl); lights.push(wl);
      break;
    }
    case 'chapel_nave': {
      anchorToWall(g, occ, room, 'statue',  'stone', theme, seed ^ 1);
      anchorToWall(g, occ, room, 'pillar',  'stone', theme, seed ^ 2);
      anchorToWall(g, occ, room, 'pillar',  'stone', theme, seed ^ 3);
      scatter(g, occ, room, ['chair', 'chair'], Math.round(3 + style.density * 4), 'wood', theme, seed ^ 4);
      const cl = new THREE.PointLight(new THREE.Color('#c0b0ff'), 0.8, 10);
      cl.position.set(room.centerX + 0.5, FLOOR_HEIGHT * 0.85, room.centerZ + 0.5);
      g.add(cl); lights.push(cl);
      break;
    }
    default: {
      anchorToWall(g, occ, room, 'chest',  mat, theme, seed ^ 1);
      scatter(g, occ, room, ['barrel', 'crate'], Math.round(1 + style.density * 2), mat, theme, seed ^ 2);
      break;
    }
  }
  return lights;
}

// ── Staircase geometry ────────────────────────────────────────────────────────

/**
 * Builds a staircase mesh (6 steps) at plan-tile position (tx, tz).
 * Steps rise from y=0 to y=FLOOR_HEIGHT over a 2-tile horizontal run.
 * Returns the trigger position in plan space (top step, eye level).
 */
function buildStaircase(
  g: THREE.Group,
  tx: number, tz: number,
  style: StyleProfile,
  goUp: boolean,     // true = stair rises toward +Z; false = descends toward +Z
): THREE.Vector3 {
  const mat   = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.wood) });
  const tread = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.woodLight) });
  const STEPS = 7;
  const stepH = FLOOR_HEIGHT / STEPS;
  const stepD = 1.8 / STEPS;          // total depth = 1.8 tiles

  for (let i = 0; i < STEPS; i++) {
    // Riser
    const rGeo = new THREE.BoxGeometry(0.85, stepH, 0.04);
    const rMesh = new THREE.Mesh(rGeo, mat);
    const dz = goUp ? (i + 0.5) * stepD : -(i + 0.5) * stepD;
    rMesh.position.set(tx + 0.5, i * stepH + stepH * 0.5, tz + dz);
    g.add(rMesh);

    // Tread
    const tGeo = new THREE.BoxGeometry(0.85, 0.04, stepD);
    const tMesh = new THREE.Mesh(tGeo, tread);
    tMesh.position.set(tx + 0.5, (i + 1) * stepH, tz + dz + (goUp ? stepD * 0.5 : -stepD * 0.5));
    g.add(tMesh);
  }

  // Newel posts
  const postMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.woodDark) });
  const postGeo = new THREE.BoxGeometry(0.07, FLOOR_HEIGHT, 0.07);
  for (const side of [-0.45, 0.45]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(tx + 0.5 + side, FLOOR_HEIGHT * 0.5, tz + (goUp ? 0.9 : -0.9));
    g.add(post);
  }

  // Small glowing marker at the trigger zone
  const markerGeo = new THREE.SphereGeometry(0.12, 6, 4);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  const trigZ  = tz + (goUp ? 1.6 : -1.6);
  marker.position.set(tx + 0.5, FLOOR_HEIGHT - 0.3, trigZ);
  g.add(marker);

  // Trigger is at the top tread, at eye height so the player can reach it
  return new THREE.Vector3(tx + 0.5, 0, trigZ);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generate a complete interior THREE.js scene for ONE floor of a building.
 * @param dna       Building DNA (kind, style, floors, seed, …)
 * @param floorIndex  0-based floor index.  Uses `dna.seed ^ floorIndex` for variety.
 *
 * Architecture: an outer `root` group (positioned by main.ts) contains an inner
 * `content` group that applies XZ centering so entrance aligns with Z=0.
 * All trigger positions (exitPos, stairUpPos, stairDownPos) are in **root-local**
 * space — i.e. world = root.position + triggerPos.
 */
export function generateInterior(dna: BuildingDNA, floorIndex = 0): InteriorScene {
  const root    = new THREE.Group();   // caller positions this; never moved internally
  const g       = new THREE.Group();   // content with centering offset
  root.add(g);

  const totalFloors = Math.max(1, dna.floors ?? 1);
  const floorSeed   = dna.seed ^ (floorIndex * 0x6B8B_4567);

  const plan   = generatePlan({ ...dna, seed: floorSeed });
  const style  = styleForDna(dna);
  const rooms  = deriveBlueprints(plan);
  const occ    = new Occupancy(plan);
  const h      = FLOOR_HEIGHT;
  const theme  = themeForKind(dna.buildingKind);
  const allLights: THREE.PointLight[] = [];

  // Ambient fill light
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  g.add(ambient);

  // Floor / walls / ceiling
  layFloorSurface(g, plan, style);
  buildWallSurfaces(g, plan, style, h);
  buildCeiling(g, plan, style, h);

  // Furnish each room
  for (let ri = 0; ri < rooms.length; ri++) {
    const room   = rooms[ri]!;
    const lights = furnishRoom(g, occ, room, style, theme, floorSeed ^ (ri * 0x9E37_79B9));
    for (const l of lights) { g.add(l); allLights.push(l); }
  }

  // ── Centering offset ────────────────────────────────────────────────────────
  const cx = -(plan.w / 2);
  const cz = -(plan.d - 0.5);
  g.position.set(cx, 0, cz);

  // ── Exit door position (root-local) ─────────────────────────────────────────
  let exitPos: THREE.Vector3 | undefined;
  for (let x = 0; x < plan.w; x++) {
    if (plan.grid[x + plan.w * (plan.d - 1)] === TILE_DOOR) {
      // plan-space → root-local: add g.position
      exitPos = new THREE.Vector3(x + 0.5 + cx, 0, plan.d - 0.5 + cz);
      break;
    }
  }

  // ── Staircase (root-local trigger positions) ─────────────────────────────────
  // Place stairs in the back-right corner of the first room, away from the door.
  const stairPX = plan.w - 2;   // plan-space X (near right wall)
  const stairPZ = 2;             // plan-space Z (near far wall)
  let stairUpPos:   THREE.Vector3 | undefined;
  let stairDownPos: THREE.Vector3 | undefined;

  if (totalFloors > 1) {
    if (floorIndex < totalFloors - 1) {
      // Can go up — stairs rise toward lower Z (back of building)
      const planTrig = buildStaircase(g, stairPX, stairPZ, style, false);
      stairUpPos = new THREE.Vector3(planTrig.x + cx, planTrig.y, planTrig.z + cz);
    }
    if (floorIndex > 0) {
      // Can go down — stairs descend toward higher Z (front of building)
      const pz2     = plan.d - 3;    // mirror position for down-stair
      const planTrig2 = buildStaircase(g, stairPX, pz2, style, true);
      stairDownPos = new THREE.Vector3(planTrig2.x + cx, planTrig2.y, planTrig2.z + cz);
    }
  }

  // Open hole in ceiling above stair (punch a gap by removing ceiling tile area)
  // (kept simple — ceiling mesh already generated above; visual gap is implied)

  console.log(`[InteriorGenerator] ${dna.buildingKind}/${dna.style} floor ${floorIndex}/${totalFloors} — ${plan.w}×${plan.d} tiles, ${rooms.length} rooms, ${allLights.length} lights`);

  return {
    group: root, lights: allLights, exitPos, stairUpPos, stairDownPos,
    floorIndex, totalFloors,
    planW: plan.w, planD: plan.d,
    floorCenter: new THREE.Vector3(plan.w / 2 + cx, 0, plan.d / 2 + cz),
    occluderMeshes: (() => {
      const out: THREE.Mesh[] = [];
      root.traverse(obj => { if ((obj as THREE.Mesh).isMesh && obj.userData.isOccluder) out.push(obj as THREE.Mesh); });
      return out;
    })(),
  };
}

function themeForKind(kind: string): PropTheme {
  switch (kind) {
    case 'blacksmith': case 'apothecary': return 'alchemy';
    case 'chapel': return 'dungeon';
    case 'inn': case 'tavern': case 'shop': return 'residential';
    default: return 'residential';
  }
}
