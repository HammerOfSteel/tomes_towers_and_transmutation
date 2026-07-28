/**
 * DungeonEntranceBuilder.ts — 02-game-world-integration (DI-1)
 *
 * Procedural dungeon entrance prop builder. Builds a small `THREE.Group`
 * per entrance "variant" (simple primitive geometry, no textures/GLB —
 * same "flat-shaded procedural primitives" style as `BuildingBuilder.ts`),
 * tinted by the entrance's faction.
 *
 * Scope note on variants: the spec lists 4 variants — `tower_door
 * (existing)`, `dungeon_cave_mouth`, `ruin_arch`, `keep_gate`. `tower_door`
 * is explicitly "existing" — it's the game's current tower entrance, a
 * loaded GLB asset (`/assets/castle/tower-square-mid-door.glb`, see
 * `src/assetManifest.ts` and `OverworldScene.nearTowerEntrance()`), not a
 * procedural prop. This module intentionally covers only the 3 *new*
 * procedural variants; `entranceVariantForSiteFamily()` maps DI-2b's
 * `tower_floor` site family back to the existing tower door asset by
 * returning `null` (meaning "use the existing GLB path, not this builder").
 *
 * The interaction trigger zone (DI-1: "2 WU radius, `[E] Enter Dungeon`
 * prompt") is provided as a pure `isNearDungeonEntrance()` distance check —
 * same pattern as `OverworldScene.nearTowerEntrance()` and
 * `SettlementBoundary.ts`'s boundary check. Actually showing the `[E]`
 * prompt is a HUD concern, wired at the `OverworldScene.ts` integration
 * step alongside DI-3's scene transition.
 */

import * as THREE from 'three';
import type { SettlementFaction } from '@/overworld-studio';
import type { DungeonSiteFamily } from './DungeonSiteMetadata';

/** World-unit radius for the "[E] Enter Dungeon" interaction trigger. */
export const DUNGEON_ENTRANCE_TRIGGER_RADIUS = 2;

export type DungeonEntranceVariant = 'dungeon_cave_mouth' | 'ruin_arch' | 'keep_gate';

/**
 * DI-2b bridge: which procedural entrance variant best fits a given site
 * family. Returns `null` for `tower_floor` — that family keeps using the
 * existing tower-door GLB asset instead of a procedural prop (see module
 * header).
 */
export function entranceVariantForSiteFamily(siteFamily: DungeonSiteFamily): DungeonEntranceVariant | null {
  switch (siteFamily) {
    case 'tower_floor':      return null;
    case 'beast_lair':
    case 'mine_works':       return 'dungeon_cave_mouth';
    case 'library_ruin':
    case 'alchemy_vault':
    case 'observatory_ruin':
    case 'tomb_barrow':      return 'ruin_arch';
    case 'surface_threat':   return 'keep_gate';
  }
}

interface EntranceColors { stone: string; accent: string; dark: string; }

/** Simple 3-colour palette per entrance faction — stone body, accent trim, dark interior/opening. */
const FACTION_ENTRANCE_COLORS: Record<SettlementFaction, EntranceColors> = {
  human:    { stone: '#9a9088', accent: '#6a5a48', dark: '#100c08' },
  elven:    { stone: '#8fae80', accent: '#c8d8b0', dark: '#182010' },
  dwarven:  { stone: '#706860', accent: '#404040', dark: '#0a0808' },
  orcish:   { stone: '#5a5840', accent: '#3a3020', dark: '#0a0806' },
  vampire:  { stone: '#4a3850', accent: '#8a2020', dark: '#100810' },
  undead:   { stone: '#605850', accent: '#3a342c', dark: '#0c0c0c' },
  vulperia: { stone: '#a07850', accent: '#6a3810', dark: '#140c06' },
  slime:    { stone: '#508860', accent: '#22ff88', dark: '#082010' },
  fae:      { stone: '#a080b0', accent: '#f0d8f8', dark: '#180820' },
};

export interface BuiltDungeonEntrance {
  /** Three.js root group — add to scene with `scene.add(entrance.root)`. */
  root: THREE.Group;
  /** Release GPU resources. */
  dispose(): void;
}

function trackedMaterial(materials: THREE.Material[], material: THREE.Material): THREE.Material {
  materials.push(material);
  return material;
}

function trackedMesh(
  geometries: THREE.BufferGeometry[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
): THREE.Mesh {
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * DI-1 — build a procedural dungeon entrance prop for one of the 3 new
 * variants, tinted by faction. Deterministic aside from THREE.js object
 * allocation (no randomness — geometry is fixed per variant/faction).
 */
export function buildDungeonEntrance(
  faction: SettlementFaction,
  variant: DungeonEntranceVariant,
): BuiltDungeonEntrance {
  const colors = FACTION_ENTRANCE_COLORS[faction];
  const root = new THREE.Group();
  root.userData['dungeonEntranceVariant'] = variant;
  root.userData['dungeonEntranceFaction'] = faction;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const stoneMat = trackedMaterial(materials, new THREE.MeshStandardMaterial({ color: colors.stone, roughness: 0.9 }));
  const accentMat = trackedMaterial(materials, new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.7 }));
  const darkMat = trackedMaterial(materials, new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 1 }));

  if (variant === 'ruin_arch') {
    // Two weathered pillars + a cracked lintel, dark opening between them.
    const pillarGeo = () => new THREE.BoxGeometry(0.6, 3, 0.6);
    const left = trackedMesh(geometries, pillarGeo(), stoneMat);
    left.position.set(-1, 1.5, 0);
    const right = trackedMesh(geometries, pillarGeo(), stoneMat);
    right.position.set(1, 1.5, 0);
    const lintel = trackedMesh(geometries, new THREE.BoxGeometry(2.6, 0.5, 0.7), accentMat);
    lintel.position.set(0, 3.1, 0);
    const opening = trackedMesh(geometries, new THREE.PlaneGeometry(1.8, 2.8), darkMat);
    opening.position.set(0, 1.4, -0.3);
    root.add(left, right, lintel, opening);
  } else if (variant === 'keep_gate') {
    // Wider double-door gate with a crenellated top (merlons).
    const pillarGeo = () => new THREE.BoxGeometry(0.8, 3.6, 0.8);
    const left = trackedMesh(geometries, pillarGeo(), stoneMat);
    left.position.set(-1.6, 1.8, 0);
    const right = trackedMesh(geometries, pillarGeo(), stoneMat);
    right.position.set(1.6, 1.8, 0);
    const lintel = trackedMesh(geometries, new THREE.BoxGeometry(4, 0.6, 0.9), accentMat);
    lintel.position.set(0, 3.7, 0);
    for (const mx of [-1.8, -0.6, 0.6, 1.8]) {
      const merlon = trackedMesh(geometries, new THREE.BoxGeometry(0.5, 0.5, 0.9), stoneMat);
      merlon.position.set(mx, 4.25, 0);
      root.add(merlon);
    }
    const doors = trackedMesh(geometries, new THREE.PlaneGeometry(2.8, 3.2), darkMat);
    doors.position.set(0, 1.7, -0.4);
    root.add(left, right, lintel, doors);
  } else {
    // dungeon_cave_mouth — an irregular rocky rim (half-torus) around a dark opening.
    const rim = trackedMesh(
      geometries,
      new THREE.TorusGeometry(1.6, 0.5, 8, 12, Math.PI),
      stoneMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = Math.PI;
    rim.position.set(0, 1.6, 0);
    const boulder = trackedMesh(geometries, new THREE.IcosahedronGeometry(0.7, 0), accentMat);
    boulder.position.set(1.6, 0.5, 0.6);
    const opening = trackedMesh(geometries, new THREE.CircleGeometry(1.5, 16), darkMat);
    opening.position.set(0, 1.6, -0.2);
    root.add(rim, boulder, opening);
  }

  return {
    root,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** DI-1 — is a world-space (x, z) position within the entrance's interaction trigger radius? */
export function isNearDungeonEntrance(
  position: { x: number; z: number },
  entrancePosition: { x: number; z: number },
  radius: number = DUNGEON_ENTRANCE_TRIGGER_RADIUS,
): boolean {
  return Math.hypot(position.x - entrancePosition.x, position.z - entrancePosition.z) <= radius;
}
