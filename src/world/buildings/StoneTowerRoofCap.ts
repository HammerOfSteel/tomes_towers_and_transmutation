/**
 * StoneTowerRoofCap.ts — the three roof-cap archetypes for the elven
 * stone-tower kit (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md /
 * 2026-09-03-elven-stone-tower-features-design.md): a classic conical
 * shingle roof (with a flared eave, stepped shingle-course relief, and
 * corner finials -- matching the reference tabletop-kit image's actual
 * roof detail, not a single smooth cone), a living-canopy cap where
 * the stone shaft transitions into actual foliage, and a genuinely
 * distinct "pagoda" archetype (two stacked tiers with a real waisted
 * neck between them) -- three structurally different top ASSEMBLIES,
 * not just parametric variations of one shape.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { createBlockGrid, setBlock, meshBlockGrid, BLOCK_UNIT } from './BlockKit';

/**
 * Classic conical shingle roof cap: a flared eave skirt (oversailing
 * the wall below, matching real tower-roof construction), 3 stepped
 * shingle-course bands (each band-to-band seam reads as a visible
 * shingle course line, rather than one perfectly smooth cone), 8
 * corner finials at the eave's outer octagon vertices, and an apex
 * finial ball at the very top -- matching the reference image's actual
 * roof relief (scalloped eave, corner spires, a finial point) instead
 * of a single plain `ConeGeometry`.
 */
export function buildClassicRoofCap(radius: number, coneHeight: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();

  const eaveInnerR = radius * 1.15;
  const eaveOuterR = radius * 1.4;
  const eaveH = coneHeight * 0.12;
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(eaveInnerR, eaveOuterR, eaveH, 8), material);
  eave.position.y = eaveH / 2;
  eave.castShadow = eave.receiveShadow = true;
  g.add(eave);

  const bandCount = 3;
  const bodyHeight = coneHeight - eaveH;
  let y = eaveH;
  for (let b = 0; b < bandCount; b++) {
    const bandH = bodyHeight / bandCount;
    const t0 = b / bandCount, t1 = (b + 1) / bandCount;
    // Overall taper from the eave's inner radius down toward a
    // near-point apex, eased across all bands.
    const targetBottomR = eaveInnerR * (1 - t0) + 0.02 * t0;
    const targetTopR = eaveInnerR * (1 - t1) + 0.02 * t1;
    // A slight outward step at each band's own base (beyond the plain
    // taper) so consecutive bands don't align into one smooth surface
    // -- a visible shingle-course seam at every band boundary.
    const stepBottomR = b === 0 ? targetBottomR : targetBottomR * 1.05;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(targetTopR, stepBottomR, bandH, 8), material);
    seg.position.y = y + bandH / 2;
    seg.castShadow = seg.receiveShadow = true;
    g.add(seg);
    y += bandH;
  }

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const finialH = radius * 0.22;
    const finial = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.035, finialH, 4), material);
    finial.position.set(Math.sin(ang) * eaveOuterR * 0.94, eaveH + finialH / 2, Math.cos(ang) * eaveOuterR * 0.94);
    finial.castShadow = true;
    g.add(finial);
  }

  const apexBall = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.05, 6, 5), material);
  apexBall.position.y = coneHeight + radius * 0.05;
  apexBall.castShadow = true;
  g.add(apexBall);

  return g;
}

/** Materials for the living-canopy roof cap. */
export interface LivingCapPalette {
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * Living-canopy roof cap: the stone shaft transitions into an actual
 * foliage crown -- the clearest "hybrid stone + living tree" moment in
 * the kit. Deliberately a small, dedicated BlockKit grid (NOT a call
 * into the existing buildElvenTrunkGrid(), which is coupled to being an
 * entire trunk-to-canopy shape and isn't designed to be composed as a
 * cap sitting on a separate stone shaft) -- 3 tiers: a narrow bark
 * "neck" matching the shaft below, a wide central bulge, and a leaf
 * taper to a near-point at the top. Deliberately simple (a single
 * circular-cross-section bulge per tier, no satellite lobes/branches)
 * to avoid the "muddy brown blob" failure mode documented elsewhere in
 * this codebase's elven trunk code -- this is a small cap, not a whole
 * tree, so it doesn't need that system's full complexity.
 */
export function buildLivingRoofCap(seed: number, radius: number, palette: LivingCapPalette): THREE.Group {
  const grid = createBlockGrid();
  const rand = mulberry32(seed);
  const bw = Math.max(3, Math.round((radius * 2.4) / BLOCK_UNIT));
  const bd = bw;
  const bh = Math.max(3, Math.round((radius * 2.0) / BLOCK_UNIT));
  const cx = (bw - 1) / 2, cz = (bd - 1) / 2;
  const maxR = Math.max(cx, cz);

  function tierRadiusFrac(level: number): number {
    const t = level / Math.max(1, bh - 1);
    if (t < 0.3) return 0.5 + (t / 0.3) * 0.5;        // 0.5 -> 1.0 (flare out from the neck)
    if (t < 0.7) return 1.0;                          // full bulge
    return 1.0 - ((t - 0.7) / 0.3) * 0.85;             // 1.0 -> 0.15 (taper to near-point)
  }

  for (let by = 0; by < bh; by++) {
    const tierR = maxR * tierRadiusFrac(by);
    const isNeck = by < bh * 0.15;
    for (let bx = 0; bx < bw; bx++) {
      for (let bz = 0; bz < bd; bz++) {
        const d = Math.hypot(bx - cx, bz - cz);
        if (d <= tierR + (rand() - 0.5) * 0.4) {
          setBlock(grid, bx, by, bz, isNeck ? 'bark' : 'leaf');
        }
      }
    }
  }

  const mesh = meshBlockGrid(grid, { bark: palette.bark, leaf: palette.leaf });
  mesh.position.x -= cx * BLOCK_UNIT;
  mesh.position.z -= cz * BLOCK_UNIT;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/** Materials for whichever roof-cap variant buildTowerRoofCap() picks. */
export interface RoofCapPalette {
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
}

/**
 * "Pagoda" roof-cap archetype: a truncated lower eave-and-body section
 * (deliberately no point of its own -- see below) topped by a genuine
 * waisted neck, then a full smaller upper tier (`buildClassicRoofCap`,
 * WITH its own pointed apex) -- a structurally distinct top ASSEMBLY
 * from the single-cone classic/living caps, matching the reference
 * tabletop-kit image's stacked-roof tower variant.
 *
 * The lower tier deliberately does NOT reuse `buildClassicRoofCap`
 * (which was the first version's approach): giving the lower tier its
 * OWN full taper-to-a-point competed visually with the upper tier's
 * own point, so the two tiers' near-touching apexes blurred into one
 * ambiguous cone silhouette at normal viewing distance, even though
 * the underlying geometry was genuinely two separate assemblies (see
 * design spec's follow-up note on this exact failure mode). Truncating
 * the lower tier's body well before a point -- so the ONLY apex in the
 * whole roof is the upper tier's -- gives a clean, unambiguous
 * wide -> narrow (neck) -> wide (upper eave) -> point silhouette that
 * reads as a genuine two-tier pagoda at a glance, not just under
 * close inspection.
 */
export function buildPagodaRoofCap(radius: number, coneHeight: number, palette: RoofCapPalette): THREE.Group {
  const g = new THREE.Group();

  const lowerHeight = coneHeight * 0.42;
  const upperRadius = radius * 0.55;
  const upperHeight = coneHeight * 0.58;
  const neckHeight = coneHeight * 0.12;

  const eaveInnerR = radius * 1.15;
  const eaveOuterR = radius * 1.4;
  const eaveH = lowerHeight * 0.22;
  const eave = new THREE.Mesh(new THREE.CylinderGeometry(eaveInnerR, eaveOuterR, eaveH, 8), palette.shingle);
  eave.position.y = eaveH / 2;
  eave.castShadow = eave.receiveShadow = true;
  g.add(eave);

  // Truncated body: tapers from the eave's inner radius down to just
  // wider than the neck below it -- NOT to a point (that's the upper
  // tier's job).
  const bodyTopR = upperRadius * 1.1;
  const bodyH = lowerHeight - eaveH;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyTopR, eaveInnerR, bodyH, 8), palette.shingle);
  body.position.y = eaveH + bodyH / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const finialH = radius * 0.18;
    const finial = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.03, finialH, 4), palette.shingle);
    finial.position.set(Math.sin(ang) * eaveOuterR * 0.94, eaveH + finialH / 2, Math.cos(ang) * eaveOuterR * 0.94);
    finial.castShadow = true;
    g.add(finial);
  }

  const neckBottomR = bodyTopR * 0.85;
  const neckTopR = upperRadius * 0.85;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckTopR, neckBottomR, neckHeight, 8), palette.bark);
  neck.name = 'elven-pagoda-neck';
  neck.position.y = lowerHeight + neckHeight / 2;
  neck.castShadow = neck.receiveShadow = true;
  g.add(neck);

  const upperTier = buildClassicRoofCap(upperRadius, upperHeight, palette.shingle);
  upperTier.position.y = lowerHeight + neckHeight;
  g.add(upperTier);

  return g;
}

export type RoofArchetype = 'classic' | 'living' | 'pagoda';

export type RoofArchetypeWeights = [RoofArchetype, number][];

/** Existing tower weights, now named/exported so other callers (the
 * residential family) can pass their own table while this stays the
 * default: classic 40% (given strong presence as the newest, most
 * structurally distinct archetype), pagoda 35%, living 25% (a rarer,
 * distinctive hybrid-tree variant). */
export const TOWER_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['classic', 0.4], ['pagoda', 0.35], ['living', 0.25],
];

/** Residential (elven house/villa/terraced/inn/blacksmith) weights:
 * `living` stays the plurality choice (preserves the "living tree home"
 * identity as the most common outcome) while giving genuine variety via
 * the SAME already-approved classic/pagoda tower roof archetypes,
 * directly answering user feedback that every treehouse roof looked
 * identical. */
export const RESIDENTIAL_ROOF_ARCHETYPE_WEIGHTS: RoofArchetypeWeights = [
  ['living', 0.45], ['classic', 0.30], ['pagoda', 0.25],
];

/** Deterministic seeded weighted choice among the 3 roof archetypes,
 * using `weights` (default: the tower's own table). */
export function pickRoofArchetype(seed: number, weights: RoofArchetypeWeights = TOWER_ROOF_ARCHETYPE_WEIGHTS): RoofArchetype {
  const rand = mulberry32(seed);
  const roll = rand();
  let acc = 0;
  for (const [archetype, weight] of weights) {
    acc += weight;
    if (roll < acc) return archetype;
  }
  return weights[weights.length - 1]![0];
}

/**
 * Picks a roof-cap archetype (classic conical shingle, living canopy,
 * or pagoda) from `seed` via `pickRoofArchetype(seed, weights)` and
 * builds it. `weights` defaults to the tower's own table.
 */
export function buildTowerRoofCap(seed: number, radius: number, coneHeight: number, palette: RoofCapPalette, weights: RoofArchetypeWeights = TOWER_ROOF_ARCHETYPE_WEIGHTS): THREE.Group {
  const archetype = pickRoofArchetype(seed, weights);
  switch (archetype) {
    case 'living': return buildLivingRoofCap(seed ^ 0x1DEA, radius, { leaf: palette.leaf, bark: palette.bark });
    case 'pagoda': return buildPagodaRoofCap(radius, coneHeight, palette);
    case 'classic': return buildClassicRoofCap(radius, coneHeight, palette.shingle);
  }
}
