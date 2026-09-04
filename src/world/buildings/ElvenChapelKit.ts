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
import { rectanglePoints, rectangleFaces, facePointAt, octagonFaces, type OctagonFace } from './StoneTowerShape';
import { buildWallSurfaceBlocks } from './StoneTowerWallSurface';
import { buildFloorCap } from './StoneTowerFloorCap';
import { buildQuoins } from './StoneTowerQuoins';
import { buildEntrance, pickEntranceStyle } from './StoneTowerEntrance';
import { pickWindowStyle, buildWindow } from './StoneTowerWindows';
import { buildGableRoofCap } from './StoneTowerGableRoof';
import { buildLivingRoofCap } from './StoneTowerRoofCap';
import { buildRecessedArchOpening, type RecessedArchOptions } from './StoneTowerOpenings';
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

/** How far the apse's own center sits behind the nave's back gable wall
 * (as a multiple of the apse's own radius) -- a modest overlap so the
 * apse visibly docks flush against the nave's flat wall (the real-world
 * round-tower-church precedent: this seam is the historically-attested
 * detail, not a flaw to hide -- see design doc's research summary). */
const APSE_DOCK_FRAC = 0.55;

/**
 * Builds the apse: a small octagonal altar niche, using the kit's
 * EXISTING, completely unmodified radial machinery (a regular octagon
 * via `octagonFaces()`, `buildFloorCap()`, `buildQuoins()`, all called
 * with no `pointsOverride` since the apse genuinely IS a regular
 * octagon). Open toward the nave (+Z direction): faces 0 and 7 (the two
 * faces nearest normalAngle=0, i.e. facing +Z) are omitted from the
 * wall's own `facesOverride`, so the altar niche is visible from inside
 * the nave rather than a sealed room -- the same "omit some faces"
 * technique already proven on the market stall's own partial back wall.
 * Always topped with a living-canopy roof cap (never the tower's own
 * classic/pagoda/living random dispatch) -- a deliberate identity
 * choice: the altar always sits beneath a living canopy, echoing the
 * tree-integration motif already established elsewhere in this kit, and
 * visually distinguishing the sacred apse from the nave's own new plain
 * gable roof.
 */
function _buildApse(dna: BuildingDNA, halfD: number, palette: StoneTowerPalette): THREE.Group {
  const apseSeed = dna.seed ^ 0x41505345; // 'APSE' in ASCII hex
  const apseRadius = halfD * 0.45;
  const apseHeight = FLOOR_HEIGHT * 0.9;

  const g = new THREE.Group();
  g.name = 'elven-chapel-apse';

  const allFaces = octagonFaces(apseRadius);
  const openFaces = allFaces.filter((_, i) => i !== 0 && i !== 7);
  const walls = buildWallSurfaceBlocks(0, apseHeight, apseSeed, palette.stone, { facesOverride: openFaces });
  g.add(walls);

  const quoins = buildQuoins(apseRadius, apseHeight, undefined, palette.stone);
  g.add(quoins);

  const floorCap = buildFloorCap(apseRadius, palette.stone);
  floorCap.position.y = apseHeight;
  g.add(floorCap);

  const roof = buildLivingRoofCap(apseSeed ^ 0x1DEA, apseRadius, { leaf: palette.leaf, bark: palette.bark });
  roof.position.y = apseHeight;
  g.add(roof);

  // Relocated sacred crystal (unchanged material identity from the old
  // buildElvenChapel()'s own emissive octahedron) -- on-axis at the
  // apse's own focal point, on a small pedestal.
  const pedestalMat = mat('#7a8a70', { roughness: 0.95 });
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(apseRadius * 0.18, apseRadius * 0.22, apseHeight * 0.3, 8), pedestalMat);
  pedestal.position.y = apseHeight * 0.15;
  pedestal.castShadow = pedestal.receiveShadow = true;
  g.add(pedestal);

  const crystalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a0ffe0'), emissive: new THREE.Color('#60ffc0'), emissiveIntensity: 1.0, roughness: 0.15, transparent: true, opacity: 0.9 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(apseRadius * 0.2, 0), crystalMat);
  crystal.name = 'elven-chapel-sacred-crystal';
  crystal.position.y = apseHeight * 0.45;
  g.add(crystal);

  // Dock the whole apse behind the nave's own back gable wall (which
  // sits at world z = -halfD -- see rectangleFaces()'s face index 1).
  g.position.z = -halfD - apseRadius * (1 - APSE_DOCK_FRAC);

  return g;
}

/**
 * Builds the bellcote: a small pierced wall-slab centered above the
 * entrance gable, with 1-2 small recessed-arch bell openings (reusing
 * `buildRecessedArchOpening()`'s shared carved-cavity technique at a
 * small scale -- the SAME technique as every other opening in the kit,
 * not a new one), each containing a small bell (a simple truncated-cone
 * silhouette via CylinderGeometry with different top/bottom radii).
 * Favored over a second full tower-kit instance per the design doc's
 * real-world small-parish-church precedent (a bell-gable is cheaper and
 * more proportionate to a fixed small 4x8 footprint than a full second
 * tower).
 */
function _buildBellcote(dna: BuildingDNA, halfW: number, halfD: number, naveHeight: number, ridgeHeight: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  g.name = 'elven-chapel-bellcote';
  const rand = mulberry32(dna.seed ^ 0x42454C4C); // 'BELL' in ASCII hex
  const bellCount: 1 | 2 = rand() < 0.5 ? 1 : 2;

  const slabW = halfW * (bellCount === 2 ? 1.1 : 0.7);
  const slabH = ridgeHeight * 0.7;
  const slabThickness = 0.15;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, slabH, slabThickness), palette.stone);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);

  const openingOpts: RecessedArchOptions = {
    width: slabW * (bellCount === 2 ? 0.32 : 0.4),
    straightHeight: slabH * 0.4,
    pointHeight: slabH * 0.2,
    recessDepth: slabThickness * 0.6,
    frameWidth: slabW * 0.03,
    frameProud: slabThickness * 0.2,
  };
  const bellMat = mat('#8a8478', { roughness: 0.6, metalness: 0.3 });
  const bellXOffsets = bellCount === 2 ? [-slabW * 0.22, slabW * 0.22] : [0];
  for (const bx of bellXOffsets) {
    const opening = buildRecessedArchOpening(openingOpts, slabThickness / 2, mat('#1a1612'), palette.stone);
    opening.position.x = bx;
    g.add(opening);

    const bell = new THREE.Mesh(new THREE.CylinderGeometry(openingOpts.width * 0.14, openingOpts.width * 0.28, openingOpts.straightHeight * 0.5, 8), bellMat);
    bell.name = 'elven-chapel-bell';
    bell.position.set(bx, slabH * 0.15, slabThickness * 0.1);
    bell.castShadow = true;
    g.add(bell);
  }

  // Positioned above the nave, standing proud in FRONT of the entrance
  // gable's own face (which sits at world z = halfD, matching the gable
  // roof's own end-triangle plane -- Z must be > halfD, not < halfD, or
  // the bellcote sits hidden INSIDE the wall/roof volume, occluded from
  // outside view; a real placement bug caught only via live Playwright
  // verification, matching this session's established pattern for
  // exactly this class of bug).
  g.position.set(0, naveHeight + ridgeHeight * 0.55, halfD + slabThickness * 3);
  return g;
}

/**
 * Builds the forecourt: the old `buildElvenChapel()`'s 6 standing
 * tree-stone monoliths, RELOCATED (not deleted) outdoors as a small
 * "sacred grove" approach avenue flanking the path to the entrance --
 * preserving the current shrine's identity as context around the new
 * real building, per the design doc's research (standing stones as an
 * outdoor/approach feature, not the building's own wall material).
 */
function _buildForecourt(dna: BuildingDNA, halfD: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'elven-chapel-forecourt';
  const rand = mulberry32(dna.seed ^ 0x464F5245); // 'FORE' in ASCII hex
  const stoneMat = mat('#7a8a70', { roughness: 0.95 });
  const stoneCount = 6;
  for (let i = 0; i < stoneCount; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const rowIndex = Math.floor(i / 2);
    const sh = 0.8 + rand() * 0.4;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, sh, 6), stoneMat);
    stone.position.set(side * (0.9 + rand() * 0.3), sh / 2, halfD + 0.6 + rowIndex * 0.9);
    stone.rotation.y = rand() * Math.PI * 2;
    stone.castShadow = true;
    g.add(stone);
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

  g.add(_buildApse(dna, halfD, palette));
  g.add(_buildBellcote(dna, halfW, halfD, naveHeight, ridgeHeight, palette));
  g.add(_buildForecourt(dna, halfD));

  return g;
}
