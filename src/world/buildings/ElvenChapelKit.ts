/**
 * ElvenChapelKit.ts — the elven chapel/shrine, built on the same real
 * block-course + carved-opening construction technique as the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-04-elven-chapel-rebuild-design.md), replacing the old
 * standing-tree-stones `buildElvenChapel()` -- the last elven building
 * kind not yet on this technique.
 *
 * A rectangular nave (the chapel's fixed 4x8 "long nave" footprint --
 * see BuildingDNA.ts's `KIND_FOOTPRINT.chapel` -- doesn't fit the tower
 * kit's single-radius octagon, so this reuses `buildWallSurfaceBlocks()`'s
 * existing `facesOverride` mechanism with a real 4-face rectangle
 * (`rectangleFaces()`), plus `buildFloorCap()`/`buildQuoins()`'s new
 * `pointsOverride` parameter for the same rectangle's 4 real corners --
 * zero changes needed to `buildWallSurfaceBlocks()` itself), topped with
 * a new `buildGableRoofCap()` (none of the kit's existing radial roof-
 * caps can fit a rectangle). A small octagonal apse (altar niche) and a
 * bellcote and forecourt are added in later tasks, all using existing,
 * unmodified tower-kit machinery.
 */

import * as THREE from 'three';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture, ashlarTexture } from './FactionBlockTextures';
import { slateTexture } from './TextureFactory';
import { rectanglePoints, rectangleFaces } from './StoneTowerShape';
import { buildWallSurfaceBlocks } from './StoneTowerWallSurface';
import { buildFloorCap } from './StoneTowerFloorCap';
import { buildQuoins } from './StoneTowerQuoins';
import { buildEntrance, pickEntranceStyle } from './StoneTowerEntrance';
import type { StoneTowerPalette } from './StoneTowerKit';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/**
 * Builds the nave: a real rectangular wall (per-course blocks via
 * `buildWallSurfaceBlocks()`'s `facesOverride`), quoins at its 4 real
 * corners, a solid floor cap, and a carved entrance centered on the
 * front (+Z) gable wall -- which sits at exactly `z = halfD` with NO
 * rotation needed, since `rectangleFaces()`'s face index 3 (normalAngle
 * 0) has its own midpoint at `(0, halfD)`, matching `buildEntrance()`'s
 * own baked-in local-Z=radius convention exactly.
 */
function _buildNave(dna: BuildingDNA, halfW: number, halfD: number, naveHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const naveSeed = dna.seed ^ 0x4E415645; // 'NAVE' in ASCII hex

  const navePoints = rectanglePoints(halfW, halfD);
  const naveFaces = rectangleFaces(halfW, halfD);

  const walls = buildWallSurfaceBlocks(0, naveHeight, naveSeed, palette.stone, { facesOverride: naveFaces });
  g.add(walls);

  const quoins = buildQuoins(halfW, naveHeight, undefined, palette.stone, navePoints);
  quoins.name = 'elven-chapel-nave-quoins';
  g.add(quoins);

  const floorCap = buildFloorCap(0, palette.stone, undefined, navePoints);
  floorCap.position.y = naveHeight;
  g.add(floorCap);

  // Entrance: front (+Z) gable wall, face index 3 (normalAngle 0).
  const entranceStyle = pickEntranceStyle(dna.seed);
  const entrance = buildEntrance(entranceStyle, halfD, dna.seed, palette);
  g.add(entrance);

  return g;
}

/**
 * Public entry point: builds a complete elven chapel/shrine for the
 * given `BuildingDNA` (dispatched from FactionBuildingVariants.ts's
 * elven `chapel` override). Footprint is always the fixed 4x8 "long
 * nave" (`KIND_FOOTPRINT.chapel`), floor count is always 1 (the only
 * reachable path, the `church` ward, sets `WARD_TO_FLOORS.church = 1`).
 */
export function buildElvenChapelShrine(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const halfW = fp.w / 2;
  const halfD = fp.d / 2;
  const naveHeight = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.4;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));
  return g;
}
