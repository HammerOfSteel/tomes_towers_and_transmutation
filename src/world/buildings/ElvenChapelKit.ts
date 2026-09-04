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
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture, ashlarTexture } from './FactionBlockTextures';
import { slateTexture } from './TextureFactory';
import { rectanglePoints, rectangleFaces, facePointAt, type OctagonFace } from './StoneTowerShape';
import { buildWallSurfaceBlocks } from './StoneTowerWallSurface';
import { buildFloorCap } from './StoneTowerFloorCap';
import { buildQuoins } from './StoneTowerQuoins';
import { buildEntrance, pickEntranceStyle } from './StoneTowerEntrance';
import { pickWindowStyle, buildWindow } from './StoneTowerWindows';
import { buildGableRoofCap } from './StoneTowerGableRoof';
import type { StoneTowerPalette } from './StoneTowerKit';

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/**
 * Rotates + positions `obj` (a window/entrance group whose own geometry
 * is always built flush at local Z = radius, per
 * StoneTowerOpenings.ts's shared convention) onto `face` at fractional
 * position `t` along the face's own a->b segment (t=0.5 = the face's
 * own centered default). The CALLER must have already built `obj` with
 * its own baked-in radius equal to the exact perpendicular distance from
 * the nave's own center to `face`'s own midpoint (verified by direct
 * computation: rotating `obj`'s own baked-in local (0,0,radius)
 * reference point by `face.normalAngle` then lands it EXACTLY on that
 * midpoint) -- for the rectangle nave's own side walls, that's `halfW`
 * (StoneTowerShape.ts's `rectangleFaces()` docs). Given that invariant
 * holds, this function itself only needs the rotation + the along-face
 * delta from the midpoint, not the radius value itself.
 */
function _placeOnFace(obj: THREE.Object3D, face: OctagonFace, t: number): void {
  obj.rotation.y = face.normalAngle;
  const midX = (face.a[0] + face.b[0]) / 2;
  const midZ = (face.a[1] + face.b[1]) / 2;
  const [targetX, targetZ] = facePointAt(face, t);
  obj.position.x += targetX - midX;
  obj.position.z += targetZ - midZ;
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

  // 4 lancet windows, 2 per long side wall (faces 0 and 2 -- the +X/-X
  // walls) -- real single-cell parish naves read as an evenly-spaced
  // lancet rhythm along both long walls (see design doc's research
  // summary), not clustered on one side.
  const windowRand = mulberry32(dna.seed ^ 0x57494E44); // 'WIND'-ish tag, matching StoneTowerWindows.ts's own convention
  for (const face of [naveFaces[0]!, naveFaces[2]!]) {
    for (const t of [0.3, 0.7]) {
      const style = pickWindowStyle(dna.seed ^ Math.floor(windowRand() * 0xFFFF));
      const win = buildWindow({ type: 'pointed_arch', size: style.size }, halfW, naveHeight, palette);
      win.name = 'elven-chapel-window';
      _placeOnFace(win, face, t);
      g.add(win);
    }
  }

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
  const ridgeHeight = naveHeight * 0.55;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, halfW), Math.max(1, naveHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  const g = new THREE.Group();
  g.add(_buildNave(dna, halfW, halfD, naveHeight, palette));

  const roof = buildGableRoofCap(halfW, halfD, ridgeHeight, palette.shingle);
  roof.position.y = naveHeight;
  g.add(roof);

  return g;
}
