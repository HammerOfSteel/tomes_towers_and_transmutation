/**
 * StoneTowerKit.ts — top-level orchestrator for the elven stone-tower
 * kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): stacks a base/plinth,
 * N wall rings, and a roof cap into a complete tower, all driven from
 * `dna.seed`. Wired in as elven's `watchtower`/`tower` building-kind
 * override (both currently unstyled, so purely additive).
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { barkTexture, ashlarTexture } from './FactionBlockTextures';
import { slateTexture } from './TextureFactory';
import { WALL_STRATEGY, buildWallSurface } from './StoneTowerWallSurface';
import { buildTowerRoofCap } from './StoneTowerRoofCap';
import { pickSilhouetteProfile, buildFloorTransforms, buildFloorVertexScales } from './StoneTowerSilhouette';
import { pickWindowStyle, buildWindow } from './StoneTowerWindows';
import { pickEntranceStyle, buildEntrance } from './StoneTowerEntrance';
import { shouldHaveBalcony, buildBalcony } from './StoneTowerBalcony';
import { buildQuoins } from './StoneTowerQuoins';

/** Local material helper -- mirrors FactionBuildingVariants.ts's own
 * `mat()` (not imported directly to avoid a circular import, since that
 * file will import buildElvenStoneTower from this one). */
function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/** Shared materials passed through every piece of one tower. */
export interface StoneTowerPalette {
  stone: THREE.Material;
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
  moonstone: THREE.Material;
}

/**
 * Base/plinth ring: wider than the shaft above it (a "battered," flared
 * base, matching real tower construction for stability), plus rock
 * outcropping and tree-root tendrils blended in -- the base is where
 * the "complement, don't replace" hybrid stone+living-tree direction
 * reads most clearly at ground level.
 */
export function buildTowerBase(radius: number, plinthHeight: number, seed: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);
  const plinthRadius = radius * 1.2;

  const plinth = buildWallSurface(WALL_STRATEGY, plinthRadius, plinthHeight, seed ^ 0xB453, palette.stone);
  g.add(plinth);

  const rootCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < rootCount; i++) {
    const ang = (i / rootCount) * Math.PI * 2 + rand() * 0.4;
    const len = radius * (0.5 + rand() * 0.4);
    const rx = Math.sin(ang) * radius * 0.9;
    const rz = Math.cos(ang) * radius * 0.9;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.12 + rand() * 0.06, len, 5), palette.bark);
    root.position.set(rx, len * 0.4, rz);
    root.rotation.x = Math.PI / 2 - 0.5;
    root.rotation.y = ang;
    root.castShadow = true;
    g.add(root);
  }

  for (let i = 0; i < 3; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = radius * (1.0 + rand() * 0.3);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rand() * 0.2, 0), palette.stone);
    rock.position.set(Math.sin(ang) * rr, 0.15, Math.cos(ang) * rr);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }

  const entranceStyle = pickEntranceStyle(seed);
  const entrance = buildEntrance(entranceStyle, plinthRadius, seed, palette);
  g.add(entrance);

  const quoins = buildQuoins(plinthRadius, plinthHeight, undefined, palette.stone);
  quoins.name = 'elven-stone-tower-quoins';
  g.add(quoins);

  return g;
}

/** Weighted prop catalog for a wall ring's decoration slot (docs/
 * superpowers/specs/2026-09-03-elven-stone-tower-features-design.md):
 * extends the original vine-or-nothing choice into 4 outcomes so a
 * tower's rings show more than one kind of accent. Weights: none 35%,
 * vine 35% (together matching the original ~50%-ish vine frequency
 * closely enough), moss_patch 15%, banner 15%. */
export type WallProp = 'none' | 'vine' | 'moss_patch' | 'banner';
const WALL_PROP_WEIGHTS: [WallProp, number][] = [
  ['none', 0.35], ['vine', 0.35], ['moss_patch', 0.15], ['banner', 0.15],
];

/** Deterministic seeded weighted choice among the wall-prop catalog. */
export function pickWallProp(seed: number): WallProp {
  const rand = mulberry32((seed ^ 0x50524F50) >>> 0); // 'PROP'-ish tag
  const roll = rand();
  let acc = 0;
  for (const [prop, weight] of WALL_PROP_WEIGHTS) {
    acc += weight;
    if (roll < acc) return prop;
  }
  return WALL_PROP_WEIGHTS[WALL_PROP_WEIGHTS.length - 1]![0];
}

/** Existing vine + 3 leaves accent, unchanged from before this
 * feature pass. */
function _buildVineProp(radius: number, ringHeight: number, rand: () => number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const vineAng = rand() * Math.PI * 2;
  const vineLen = ringHeight * (0.4 + rand() * 0.4);
  const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, vineLen, 5), palette.bark);
  vine.position.set(Math.sin(vineAng) * radius * 1.01, vineLen / 2, Math.cos(vineAng) * radius * 1.01);
  vine.rotation.y = vineAng;
  vine.castShadow = true;
  g.add(vine);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08 + rand() * 0.04, 6, 5), palette.leaf);
    leaf.position.set(
      Math.sin(vineAng) * radius * 1.05,
      vineLen * (0.3 + i * 0.3),
      Math.cos(vineAng) * radius * 1.05,
    );
    g.add(leaf);
  }
  return g;
}

/** Best-effort extraction of a material's color -- palette materials
 * are always `MeshStandardMaterial` in practice (see `mat()` above),
 * but the shared `StoneTowerPalette` interface types them as the base
 * `THREE.Material` so callers can substitute test doubles; this keeps
 * every color-reading call site consistent instead of scattering
 * one-off `instanceof` checks. */
function _materialColor(material: THREE.Material, fallback: string): THREE.Color {
  return material instanceof THREE.MeshStandardMaterial ? material.color : new THREE.Color(fallback);
}

/** Weathering/staining accent: 2-3 flat, slightly-protruding
 * semi-transparent decals low on the ring, reusing palette.leaf at
 * reduced opacity -- the one deliberate per-instance material clone
 * in this kit, justified since a decal needs its own opacity/
 * transparency and sits outside the merged wall-surface group
 * anyway. */
function _buildMossPatchProp(radius: number, ringHeight: number, rand: () => number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const baseColor = _materialColor(palette.leaf, '#3d6b35');
  const patchCount = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < patchCount; i++) {
    const ang = rand() * Math.PI * 2;
    const patchMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95, transparent: true, opacity: 0.5 + rand() * 0.2 });
    const size = radius * (0.18 + rand() * 0.12);
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (0.7 + rand() * 0.5)), patchMat);
    patch.position.set(Math.sin(ang) * radius * 1.005, ringHeight * (0.05 + rand() * 0.2), Math.cos(ang) * radius * 1.005);
    patch.rotation.y = ang;
    g.add(patch);
  }
  return g;
}

/** A thin hanging cloth banner on a small horizontal rod, hung near
 * the top of the ring on a different angular position than the
 * window slot so they don't overlap. */
function _buildBannerProp(radius: number, ringHeight: number, rand: () => number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  // Offset well away from the window's fixed z=radius*0.99 slot (angle 0)
  // so the banner never overlaps it.
  const ang = Math.PI + (rand() - 0.5) * 1.2;
  const bannerW = radius * (0.22 + rand() * 0.08);
  const bannerH = ringHeight * (0.35 + rand() * 0.2);
  const rodLen = bannerW * 1.3;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, rodLen, 5), palette.stone);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(Math.sin(ang) * radius * 1.02, ringHeight * 0.75, Math.cos(ang) * radius * 1.02);
  rod.rotation.y = ang;
  g.add(rod);
  const bannerMat = new THREE.MeshStandardMaterial({ color: _materialColor(palette.moonstone, '#d8e8f0'), roughness: 0.8, side: THREE.DoubleSide });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bannerW, bannerH), bannerMat);
  banner.position.set(Math.sin(ang) * radius * 1.02, ringHeight * 0.75 - bannerH / 2, Math.cos(ang) * radius * 1.02);
  banner.rotation.y = ang;
  g.add(banner);
  return g;
}

/**
 * One floor's wall ring: the shaft surface (whichever strategy is
 * active) plus an optional pointed-arch window insert (with a small
 * moonstone accent at its point, matching elven's existing palette
 * conventions) and a seed-driven wall-prop accent (vine/moss patch/
 * banner/none, see `pickWallProp()`) -- kept sparse so the stone
 * still reads as the primary material, not overwhelmed by decoration.
 *
 * `vertexScales`/`offsetX`/`offsetZ`/`rotationOffset` (all optional,
 * from StoneTowerSilhouette.ts's per-floor jitter/drift/profile math)
 * let a floor's ring be perturbed away from a perfectly centered,
 * unjittered regular octagon -- `vertexScales` reaches the wall
 * surface itself (see buildWallSurface()'s doc comment), while
 * `offsetX`/`offsetZ`/`rotationOffset` are applied to the RETURNED
 * GROUP's own position/rotation, so the window/prop decoration above
 * (already positioned relative to this group's local origin) moves
 * and rotates along with the wall for free. Omitted, all four
 * reproduce the exact prior (centered, unjittered) behaviour.
 */
export function buildTowerWallRing(
  radius: number, ringHeight: number, seed: number, palette: StoneTowerPalette, hasWindow: boolean,
  vertexScales?: number[], offsetX = 0, offsetZ = 0, rotationOffset = 0,
): THREE.Group {
  const g = new THREE.Group();
  const wall = buildWallSurface(WALL_STRATEGY, radius, ringHeight, seed, palette.stone, vertexScales);
  g.add(wall);

  const quoins = buildQuoins(radius, ringHeight, vertexScales, palette.stone);
  quoins.name = 'elven-stone-tower-quoins';
  g.add(quoins);

  const rand = mulberry32(seed ^ 0x714D0);

  if (hasWindow) {
    const style = pickWindowStyle(seed);
    g.add(buildWindow(style, radius, ringHeight, palette));
  }

  const prop = pickWallProp(seed);
  if (prop === 'vine') {
    g.add(_buildVineProp(radius, ringHeight, rand, palette));
  } else if (prop === 'moss_patch') {
    g.add(_buildMossPatchProp(radius, ringHeight, rand, palette));
  } else if (prop === 'banner') {
    g.add(_buildBannerProp(radius, ringHeight, rand, palette));
  }

  g.position.x = offsetX;
  g.position.z = offsetZ;
  g.rotation.y = rotationOffset;

  return g;
}


/**
 * Shared core for any tower-kit-family building: stacks a base, N wall
 * rings (via `buildTowerWallRing()`), and a caller-supplied roof cap.
 * Extracted from `buildElvenStoneTower()`'s original body so a second
 * building family (see `ElvenTreehouseKit.ts`'s `buildElvenTreehouseHome`)
 * can reuse the exact same real-block-course construction technique
 * without duplicating it -- `buildElvenStoneTower()` below is now a thin
 * wrapper around this, with its existing 30 tests passing unchanged as
 * proof this extraction is behavior-preserving, not a rewrite.
 *
 * `rand` is the CALLER's own `mulberry32(dna.seed ^ 0xE15E70)` instance,
 * passed through (not re-seeded here) so a caller that already consumed
 * one draw from it (e.g. `buildElvenStoneTower` rolling its own random
 * floor count) continues the exact same stream for this core's
 * per-floor `hasWindow` rolls, matching the original single-stream
 * behavior exactly.
 */
export function buildTowerKitCore(
  dna: BuildingDNA,
  radius: number,
  floors: number,
  coneHeight: number,
  palette: StoneTowerPalette,
  buildRoof: (seed: number, radius: number, coneHeight: number, palette: StoneTowerPalette) => THREE.Group,
  rand: () => number,
): THREE.Group {
  const ringHeight = FLOOR_HEIGHT * 0.9;
  const plinthHeight = 0.6;

  const profile = pickSilhouetteProfile(dna.seed);
  const transforms = buildFloorTransforms(profile, dna.seed, floors);
  const floorVertexScales = buildFloorVertexScales(dna.seed, floors);

  const g = new THREE.Group();
  const base = buildTowerBase(radius, plinthHeight, dna.seed ^ 0xB453E, palette);
  g.add(base);

  let y = plinthHeight;
  let lastCombinedRadius = radius;
  let lastOffsetX = 0, lastOffsetZ = 0;
  let balconyY = plinthHeight, balconyRadius = radius, balconyOffsetX = 0, balconyOffsetZ = 0;
  for (let fl = 0; fl < floors; fl++) {
    const hasWindow = fl > 0 && rand() < 0.7;
    const microTaper = 1 - fl * 0.015; // pre-existing very slight per-floor taper
    const transform = transforms[fl]!;
    const combinedRadius = radius * transform.radiusScale * microTaper;
    const offsetX = transform.offsetX * radius;
    const offsetZ = transform.offsetZ * radius;
    const ring = buildTowerWallRing(
      combinedRadius, ringHeight, dna.seed ^ (0x9E1E ^ fl), palette, hasWindow,
      floorVertexScales[fl], offsetX, offsetZ, transform.rotationOffset,
    );
    ring.position.y = y;
    g.add(ring);
    y += ringHeight;
    lastCombinedRadius = combinedRadius;
    lastOffsetX = offsetX;
    lastOffsetZ = offsetZ;
    // Balcony (see StoneTowerBalcony.ts) attaches at the boundary right
    // below the top floor -- i.e. right after the second-to-last floor's
    // ring -- so the roof cap still reads as sitting on a normal top
    // floor, with the balcony as a distinct projecting band below it.
    if (fl === floors - 2) {
      balconyY = y;
      balconyRadius = combinedRadius;
      balconyOffsetX = offsetX;
      balconyOffsetZ = offsetZ;
    }
  }

  // Roof cap follows the LAST floor's actual combined radius/offset (not
  // the original base radius) so it sits flush against wherever the top
  // floor really ended up, rather than floating relative to a stale
  // base-radius/base-position assumption.
  const roof = buildRoof(dna.seed ^ 0x800F, lastCombinedRadius, coneHeight, palette);
  roof.position.set(lastOffsetX, y, lastOffsetZ);
  g.add(roof);

  // Balcony is appended LAST (after base + every floor ring + roof) so
  // its presence never shifts the floor-ring indexing other code/tests
  // rely on (g.children[1] is always floor 0's ring, regardless).
  if (shouldHaveBalcony(dna.seed)) {
    const balcony = buildBalcony(dna.seed, balconyRadius, palette);
    balcony.name = 'elven-stone-tower-balcony';
    balcony.position.set(balconyOffsetX, balconyY, balconyOffsetZ);
    g.add(balcony);
  }

  return g;
}

/**
 * Public entry point: builds a complete elven stone tower for the given
 * `BuildingDNA` (dispatched from FactionBuildingVariants.ts's elven
 * `watchtower`/`tower` override). Derives its footprint the same way
 * every other builder in this codebase does (getFootprint(dna.
 * buildingKind, dna.size)), so it automatically scales to both kinds'
 * very different footprint scales (watchtower: fixed 2x2; tower:
 * 3x3-7x5 by size).
 *
 * Floor count (3-6) is picked from the seed rather than strictly
 * following `dna.floors` -- towers are a fixed-tall archetype, the same
 * precedent the generic buildWatchtower() already sets with its own
 * `Math.max(4, dna.floors)` override.
 *
 * Shape variety (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-variety-design.md): one of 4 named
 * silhouette profiles is picked once per tower by seed
 * (pickSilhouetteProfile), giving each floor a `radiusScale`/
 * `offsetX`/`offsetZ`/`rotationOffset` curve on top of per-floor,
 * per-vertex octagon jitter (buildFloorVertexScales) -- so no two
 * towers (and no two floors of the same tower) share an identical
 * outline, and different seeds can produce genuinely different
 * *kinds* of tower (tapering/tiered/leaning/waisted), not just a
 * uniformly-scaled repeat of one shape.
 */
export function buildElvenStoneTower(dna: BuildingDNA): THREE.Group {
  const { w, d } = getFootprint(dna.buildingKind, dna.size);
  const radius = Math.max(1, Math.min(w, d) / 2);
  const rand = mulberry32(dna.seed ^ 0xE15E70);
  const floors = 3 + Math.floor(rand() * 4); // 3-6
  const ringHeight = FLOOR_HEIGHT * 0.9;
  // A roof cap at the original radius*2.2 was only ~15% of a typical
  // tower's total height -- too small for the classic/living/pagoda
  // archetypal differences (StoneTowerRoofCap.ts) to read clearly at
  // normal viewing distance, even though each is a genuinely distinct
  // assembly up close. Bumped up to give the roof real visual weight,
  // closer to the reference kit's much more roof-dominant proportions.
  const coneHeight = radius * 3.5;

  const palette: StoneTowerPalette = {
    stone:     mat(dna.colors.walls, { roughness: 0.85, map: ashlarTexture(Math.max(1, radius / 1.5), Math.max(1, ringHeight / 1.5)) }),
    shingle:   mat(dna.colors.roof, { roughness: 0.75, map: slateTexture(Math.max(1, radius), Math.max(1, coneHeight / 1.5)) }),
    leaf:      mat(dna.colors.trim, { roughness: 0.75 }),
    bark:      mat('#4a3520', { roughness: 0.9, map: barkTexture() }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
  };

  return buildTowerKitCore(dna, radius, floors, coneHeight, palette, buildTowerRoofCap, rand);
}
