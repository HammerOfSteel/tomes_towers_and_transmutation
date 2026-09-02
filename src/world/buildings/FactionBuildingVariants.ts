/**
 * FactionBuildingVariants.ts — Phase 2b of the settlement visual fidelity plan
 * (docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md §4.0b).
 *
 * Phase 2a gave non-building ward features (park) genuine per-faction
 * geometry. This does the same for *buildings* — the ward-defining
 * structures (patriciate/church/market) that today all share the exact
 * same `BuildingKind` mesh (villa/chapel/shop) recolored per faction via
 * `FACTION_PRESETS`. A vulperia "Fox Den" should not be a villa painted
 * orange; it should not look like a walled building at all.
 *
 * `buildBuilding()` (BuildingBuilder.ts) checks `FACTION_BUILDING_VARIANTS`
 * first, keyed by (dna.faction, dna.buildingKind); when present it replaces
 * the generic kind builder + style-overlay entirely. Falls back to the
 * existing shared-shape system for any (faction, kind) pair not covered
 * here — this is intentionally incremental, not a full 9-faction x 11-ward
 * rewrite in one pass (see plan doc Phase 2b/2c scoping).
 *
 * Covers the three highest-visibility "signature" ward kinds — patriciate
 * (villa), church (chapel), market (shop) — for 8 of the 9 settlement
 * factions (all but human, whose thatched/timber/tudor rural/town/noble
 * split already reads as a normal fantasy village and wasn't part of the
 * complaint): vulperia (earthen burrow/den, no flat walls), slime
 * (translucent gelatinous blob, no walls at all), undead (bone/crypt
 * ossuary spires), elven (living-tree trunks + leaf canopies), dwarven
 * (squat carved-stone blocks + iron-banded vault doors), orcish (crude
 * lashed-hide huts + bone/skull totems), vampire (gothic spires + ribbed
 * buttresses + stained-glass motifs), fae (glowing mushroom caps + petal
 * ornaments). Remaining follow-up: extend to human sub-factions and to
 * the 8 ward kinds beyond patriciate/church/market (see plan doc Phase
 * 2b/2c scoping) for the generic prop shape library.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { BuildingDNA, BuildingKind, Faction } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';
import { meshBlockGrid, getMaterialKey, BLOCK_UNIT } from './BlockKit';
import { earthTexture, graniteTexture, barkTexture, hideTexture, ashStoneTexture, obsidianTexture, toadstoolTexture } from './FactionBlockTextures';
import { buildVulperiaDenMoundGrid, type DenMoundOptions, buildDwarvenHallGrid, dwarvenRoofTopY, dwarvenTopTierExtents, type DwarvenHallOptions, buildElvenTrunkGrid, elvenNeckY, elvenWaistRadius, type ElvenTrunkOptions, buildVampireSpireGrid, vampireSpireTopY, vampireSpireDeckRadius, type VampireSpireOptions, buildFaeStalkGrid, faeCapTopY, faeCapRimRadius, type FaeStalkOptions, buildOrcishHutGrid, orcishWallTopY, type OrcishHutOptions, buildUndeadTierGrid, undeadRoofTopY, type UndeadTierOptions } from './FactionBlockProfiles';
import { buildElvenStoneTower } from './StoneTowerKit';

// ── Shared helpers (mirrors WardFeatureClusters.ts's conventions) ────────────

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

function addMesh(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// (Legacy `addDoorway()` disc/box doorway-opening stand-in removed once the
// last remaining callers — fae and orcish — migrated to block-kit carved
// doorway openings; every race now either carves its doorway directly into
// the block grid or, where still primitive-based, uses its own inline
// doorway geometry.)

// (Legacy per-mesh-deformation "organic mound" primitive removed in Phase 2e
// §2e.3 — replaced by the grounded BlockKit heightfield mound,
// `addBlockDenMound()`/`buildVulperiaDenMoundGrid()`, below.)

/**
 * A ring of small chunky timber-stave blocks (BoxGeometry), each genuinely
 * 3D. Unlike `TorusGeometry` or an extruded annulus, no single piece is a
 * thin/hollow shape, so the ring can never degenerate into a hollow-loop
 * "hook" silhouette when a building's cardinal rotation (0/90/180/270) turns
 * it away from face-on to the fixed isometric camera — worst case (viewed
 * dead edge-on) it just reads as a scattered cluster of wood blocks, which
 * still looks like intentional timber framing rather than a rendering
 * artifact.
 */
function addTimberRingSegments(
  g: THREE.Group,
  cx: number, cy: number, cz: number,
  radius: number, material: THREE.Material,
  count: number, segSize: number, segDepth: number,
): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(segSize, segSize, segDepth), material);
    seg.position.set(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, cz);
    seg.rotation.z = ang;
    seg.castShadow = true;
    g.add(seg);
  }
}

/**
 * A round, timber-framed door dug into an earthen bank (Bag-End style): a
 * ring of chunky timber staves standing in for the frame, a recessed shadow
 * disc, a round door panel with vertical plank strips (boxes — real volume,
 * robust from any angle), a brass handle, and a stone step/apron leading up
 * to it. Faces +Z (the building's canonical front).
 */
function addRoundDoor(g: THREE.Group, cx: number, doorY: number, cz: number, frameColor: string, doorColor: string, radius = 0.55): void {
  const frameMat = mat(frameColor, { roughness: 0.85 });
  const doorMat = mat(doorColor, { roughness: 0.7 });
  const shadowMat = mat('#120c08', { roughness: 1 });

  // Recess shadow — a flat disc degrades safely to a thin line (not a
  // distracting artifact) when viewed edge-on, unlike a hollow ring.
  addMesh(g, new THREE.CircleGeometry(radius * 0.85, 16), shadowMat, cx, doorY, cz - 0.04);

  // Round timber-stave frame.
  addTimberRingSegments(g, cx, doorY, cz, radius * 0.92, frameMat, 10, radius * 0.34, radius * 0.3);

  // The door itself + vertical plank strips (boxes, real volume, robust).
  addMesh(g, new THREE.CircleGeometry(radius * 0.72, 16), doorMat, cx, doorY, cz + 0.02);
  for (const [i, plankH] of [[-1, 1.0], [0, 1.3], [1, 1.0]] as const) {
    addMesh(g, new THREE.BoxGeometry(radius * 0.16, radius * plankH, 0.035), frameMat, cx + i * radius * 0.36, doorY, cz + 0.04);
  }

  // Brass handle.
  const handleMat = mat('#c9a24a', { metalness: 0.6, roughness: 0.35 });
  addMesh(g, new THREE.SphereGeometry(radius * 0.1, 8, 8), handleMat, cx + radius * 0.4, doorY, cz + 0.08);

  // Stone step/apron.
  const stepMat = mat('#8a8578', { roughness: 0.95 });
  addMesh(g, new THREE.CylinderGeometry(radius * 1.1, radius * 1.15, 0.08, 12), stepMat, cx, 0.04, cz + radius * 0.8);
}

/** A small round port-hole window: a timber-stave ring + inset glass disc, facing +Z. */
function addRoundWindow(g: THREE.Group, cx: number, cy: number, cz: number, frameColor: string, lit: boolean, radius = 0.22): void {
  const frameMat = mat(frameColor, { roughness: 0.85 });
  addTimberRingSegments(g, cx, cy, cz, radius * 0.95, frameMat, 8, radius * 0.36, radius * 0.28);
  addMesh(g, new THREE.CircleGeometry(radius * 0.65, 12), glassLikeMat(lit), cx, cy, cz + 0.02);
}

function glassLikeMat(lit: boolean): THREE.MeshStandardMaterial {
  return lit
    ? mat('#f0c878', { emissive: new THREE.Color('#f0c060'), emissiveIntensity: 0.7, roughness: 0.4 })
    : mat('#2a3038', { roughness: 0.3, metalness: 0.1 });
}

/** A stubby stone chimney stack with a small wisp of smoke. */
function addChimneyStack(g: THREE.Group, cx: number, apexY: number, cz: number, dna: BuildingDNA): void {
  const stoneMat = mat(dna.colors.trim, { roughness: 0.95 });
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8), stoneMat, cx, apexY + 0.28, cz);
  addMesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8), stoneMat, cx, apexY + 0.55, cz);
  const smokeMat = mat('#e8e4dc', { transparent: true, opacity: 0.35, roughness: 1 });
  addMesh(g, new THREE.SphereGeometry(0.18, 8, 6), smokeMat, cx + 0.05, apexY + 0.85, cz);
}

/** A scatter of grass-tuft blades and the odd wildflower over the mound's crown. */
function addGrassTufts(g: THREE.Group, seed: number, apexY: number, capRadius: number, count: number): void {
  const r = mulberry32(seed);
  const grassMat = mat('#6a8a3a', { roughness: 0.9 });
  const flowerMat = mat('#e8d868', { emissive: new THREE.Color('#e8d868'), emissiveIntensity: 0.15, roughness: 0.6 });
  for (let i = 0; i < count; i++) {
    const ang = r() * Math.PI * 2;
    const rad = r() * capRadius;
    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    const bladeH = 0.18 + r() * 0.16;
    addMesh(g, new THREE.ConeGeometry(0.045, bladeH, 5), grassMat, x, apexY + bladeH / 2 - 0.05, z, r() * Math.PI);
    if (r() < 0.3) {
      addMesh(g, new THREE.SphereGeometry(0.035, 6, 5), flowerMat, x + 0.05, apexY, z);
    }
  }
}

/** A small wood-plank garden fence flanking the path, either side of `cz`. */
function addGardenFence(g: THREE.Group, cz: number, halfSpan: number, dna: BuildingDNA): void {
  const postMat = mat(dna.colors.trim, { roughness: 0.9 });
  for (const side of [-1, 1]) {
    const px = side * halfSpan;
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.045, 0.45, 6), postMat, px, 0.22, cz);
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.045, 0.45, 6), postMat, px, 0.22, cz + 0.35);
    addMesh(g, new THREE.BoxGeometry(0.4, 0.05, 0.05), postMat, px, 0.32, cz + 0.17, Math.PI / 2);
  }
}

/** A wooden planter barrel with a small bush/sprig — cosy dooryard clutter. */
function addPlanterBarrel(g: THREE.Group, x: number, z: number): void {
  const woodMat = mat('#6a4a28', { roughness: 0.9 });
  addMesh(g, new THREE.CylinderGeometry(0.18, 0.2, 0.4, 10), woodMat, x, 0.2, z);
  const plantMat = mat('#4a7a30', { roughness: 0.9 });
  addMesh(g, new THREE.ConeGeometry(0.16, 0.35, 6), plantMat, x, 0.55, z);
  addMesh(g, new THREE.SphereGeometry(0.14, 8, 6), plantMat, x, 0.42, z);
}

// ── Vulperia — earthen burrow/den architecture ───────────────────────────────
// Fox Den (patriciate), Den Mother's Hall (church), Night Market (market):
// dug-in earthen mounds, hobbit-hole-style — a grounded BlockKit heightfield
// hill (Phase 2e §2e.3; small grid-aligned earth/grass blocks with
// marching-squares-style corner rounding at the silhouette, NOT a deformed
// sphere primitive), a real round timber door dug into a carved facade
// notch with a proud frame, handle and stone step, port-hole windows either
// side, a chimney stack, a grassy/wildflower crown, and dooryard clutter
// (fence, planter, crates).

/**
 * Build+mesh+center a vulperia den mound from the BlockKit heightfield
 * profile (`buildVulperiaDenMoundGrid`) — the Phase 2e replacement for the
 * old `addOrganicMound()` deformed-sphere body. Returns a group already
 * positioned so (0,0,0) is the footprint centre at ground level, matching
 * the coordinate convention the rest of this file's prop placement
 * (facade, door, windows, chimney, grass) assumes.
 */
function addBlockDenMound(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  earthColor: string, grassColor: string, facadeColor: string,
  opts: DenMoundOptions = {},
): void {
  const grid = buildVulperiaDenMoundGrid(seed, w, d, h, opts);
  const palette = {
    earth:  mat(earthColor, { roughness: 0.98, map: earthTexture() }),
    grass:  mat(grassColor, { roughness: 0.9 }),
    facade: mat(facadeColor, { roughness: 0.92 }),
  };
  const mesh = meshBlockGrid(grid, palette);
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function vulperiaMound(dna: BuildingDNA, w: number, d: number, h: number, opts: { chimney?: boolean; garden?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE41);
  // Hardcoded, saturated accent colours rather than the faction palette's
  // own trim/door tones: vulperia's palette (walls #d4a060, trim #c88030,
  // door #6a3810) is all one warm-brown hue family with almost no value/hue
  // contrast between "wall", "trim" and "door" — which is exactly why the
  // first attempt at this mound read as a uniform blob with no legible
  // features: nothing on it actually contrasted against anything else.
  const grassGreen = '#3d6b35';
  const facadeColor = '#4a3520';
  const doorGreen = '#2f5233';

  // Main earthen bank — a grounded BlockKit heightfield hill built from
  // small earth/grass blocks with a carved facade/doorway notch (Phase 2e
  // §2e.3), replacing the old deformed-sphere-plus-noise body. Silhouette
  // irregularity now comes from per-column height variation + the shared
  // engine's marching-squares-style corner rounding, not mesh deformation.
  addBlockDenMound(g, dna.seed ^ 0x5011_DE40, w, d, h, dna.colors.walls, grassGreen, facadeColor, {
    facade: true, jitter: 0.24,
  });
  const facadeMat = mat(facadeColor, { roughness: 0.92 });
  const facadeW = w * 0.42; // matches buildVulperiaDenMoundGrid's default facadeWidthFrac
  const facadeH = h * 0.62;

  // Round timber-framed door, sized to dominate the facade (a large,
  // obviously-primary feature, not a token detail lost against the hill),
  // painted a colour that actually contrasts against the warm earth tones.
  const doorR = facadeH * 0.4;
  const doorY = doorR * 1.05;
  addRoundDoor(g, 0, doorY, d / 2 + 0.07, facadeColor, doorGreen, doorR);

  // Round port-hole windows flanking the door, also enlarged.
  const lit = (dna.seed & 1) === 0;
  for (const wx of [-facadeW * 0.32, facadeW * 0.32]) {
    addRoundWindow(g, wx, facadeH * 0.78, d / 2 + 0.07, facadeColor, lit, doorR * 0.42);
  }

  // Timber lintel beam over the door.
  addMesh(g, new THREE.BoxGeometry(doorR * 2.4, 0.12, 0.18), facadeMat, 0, doorY + doorR * 1.2, d / 2 + 0.06);

  // Fox-tail banner on a pole beside the entrance.
  const poleMat = mat('#5a4020', { roughness: 0.85 });
  addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, h * 0.9, 6), poleMat, w / 2 + 0.15, h * 0.45, d / 2 - 0.3);
  const bannerMat = mat(doorGreen, { roughness: 0.7, side: THREE.DoubleSide });
  addMesh(g, new THREE.ConeGeometry(0.14, 0.5, 6), bannerMat, w / 2 + 0.15, h * 0.75, d / 2 - 0.3);

  // Grass tufts + wildflowers scattered over the (now visibly green) crown.
  addGrassTufts(g, dna.seed ^ 0x5011_DE44, h * 0.88, Math.min(w, d) * 0.3, 9);

  if (opts.chimney !== false) {
    addChimneyStack(g, -w * 0.2, h * 0.92, -d * 0.05, dna);
  }
  if (opts.garden) {
    addPlanterBarrel(g, -Math.min(w, d) * 0.45, d / 2 + 0.15);
    addGardenFence(g, d / 2 + 0.2, Math.min(w, d) * 0.55, dna);
  }

  // Tinker-scrap: small crate clutter typical of a den market/hall.
  const crateMat = mat('#8a6840', { roughness: 0.9 });
  for (let i = 0; i < 2; i++) {
    const cx = (r() - 0.5) * w * 0.6;
    const cz = -d / 2 + 0.3 + r() * 0.4;
    addMesh(g, new THREE.BoxGeometry(0.35, 0.35, 0.35), crateMat, cx, 0.18, cz, r() * 0.6);
  }

  return g;
}

function buildVulperiaVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.85;
  const g = vulperiaMound(dna, fp.w, fp.d, h, { chimney: true, garden: true });
  // Fox Den (seat of the settlement's leader): a second, smaller den mound
  // overlapping the main bank so the pair reads as one dug-in burrow complex.
  const r = mulberry32(dna.seed ^ 0x5011_DE42);
  const sideSize = Math.min(fp.w, fp.d) * 0.56;
  const sideCx = fp.w / 2 + sideSize * 0.3, sideCz = -fp.d * 0.15 + r() * 0.2;
  const sideGroup = new THREE.Group();
  addBlockDenMound(sideGroup, dna.seed ^ 0x5011_DE45, sideSize, sideSize, sideSize * 0.42, dna.colors.walls, '#3d6b35', '#4a3520');
  sideGroup.position.set(sideCx, 0, sideCz);
  g.add(sideGroup);
  return g;
}

function buildVulperiaChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.9;
  const g = vulperiaMound(dna, fp.w, fp.d * 0.6, h, { chimney: false, garden: false });
  // Den Mother's Hall: flanking smaller burrow-pups either side of the main mound.
  const pupSize = Math.min(fp.w, fp.d) * 0.36;
  let pupSeed = 0x5011_DE46;
  for (const px of [-fp.w * 0.42, fp.w * 0.42]) {
    const pupGroup = new THREE.Group();
    addBlockDenMound(pupGroup, dna.seed ^ pupSeed, pupSize, pupSize, pupSize * 0.4, dna.colors.walls, '#3d6b35', '#4a3520');
    pupGroup.position.set(px, 0, fp.d * 0.15);
    g.add(pupGroup);
    pupSeed += 1;
  }
  return g;
}

function buildVulperiaShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.55;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE43);
  // Night Market den-mouth stall: low earthen mound base with a pole-and-
  // canvas market awning over the counter (not a pointy witch-hat "roof"
  // stuck on top of the mound -- the mound's own grassy crown already
  // reads as its roof, and a separate peaked cap floating above/behind it
  // just looked disconnected and wrong).
  const baseGroup = new THREE.Group();
  addBlockDenMound(baseGroup, dna.seed ^ 0x5011_DE47, Math.max(fp.w, fp.d), Math.max(fp.w, fp.d), h, dna.colors.walls, '#3d6b35', '#4a3520');
  baseGroup.position.set(0, 0, -fp.d * 0.15);
  g.add(baseGroup);
  // Counter/table + hanging pelts + string lanterns.
  const woodMat = mat('#6a4a28', { roughness: 0.9 });
  const counterZ = fp.d * 0.35;
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.7, 0.4, 0.4), woodMat, 0, 0.2, counterZ);
  // Awning: two corner poles planted at the counter's front edge, and a
  // single flat, gently-tilted canvas panel resting across their tops --
  // a real pole-supported stall canopy over the counter, not a shape
  // floating disconnected from anything.
  const poleH = h * 0.95;
  const awningHalfW = fp.w * 0.42;
  for (const px of [-awningHalfW, awningHalfW]) {
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, poleH, 6), woodMat, px, poleH / 2, counterZ + 0.25);
  }
  const canvasMat = mat(dna.colors.roof, { roughness: 0.75, side: THREE.DoubleSide });
  const canopy = addMesh(g, new THREE.BoxGeometry(awningHalfW * 2 + 0.3, 0.06, fp.d * 0.4), canvasMat, 0, poleH, counterZ - fp.d * 0.05);
  canopy.rotation.x = -0.12; // slight forward tilt so it reads as taut cloth, not a flat slab
  const peltMat = mat('#a88060', { roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.BoxGeometry(0.2, 0.5, 0.05), peltMat, -fp.w * 0.3 + i * fp.w * 0.3, h * 0.7, fp.d * 0.3 + 0.1);
  }
  const lanternMat = mat('#f0c060', { emissive: new THREE.Color('#f0c060'), emissiveIntensity: 0.6, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.SphereGeometry(0.08 + r() * 0.02, 6, 6), lanternMat, -fp.w * 0.35 + i * fp.w * 0.35, h + 0.4, fp.d * 0.1);
  }
  return g;
}

// ── Slime — translucent gelatinous blob architecture ─────────────────────────
// Elder Blob (patriciate), Pulse Pool (church), Goo Stall (market):
// no walls at all — glossy translucent domes with a glowing inner core and
// bubble motes, matching the Slime Pool park feature's material language.

function slimeBlobMaterial(color: string, opacity = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), transparent: true, opacity,
    roughness: 0.15, metalness: 0.05, side: THREE.DoubleSide,
  });
}

function buildSlimeBlobBase(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x51117E00);
  const blobMat = slimeBlobMaterial(dna.colors.walls, 0.5);
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(dna.colors.trim), emissive: new THREE.Color(dna.colors.trim),
    emissiveIntensity: 0.9, roughness: 0.3, transparent: true, opacity: 0.85,
  });

  // Main gelatinous dome (irregular via slightly randomized scale).
  const dome = addMesh(g, new THREE.SphereGeometry(Math.max(w, d) / 2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), blobMat, 0, 0, 0);
  dome.scale.set(1 + (r() - 0.5) * 0.1, h / (Math.max(w, d) / 2), 1 + (r() - 0.5) * 0.1);

  // Glowing inner core, visible through the translucent membrane.
  addMesh(g, new THREE.SphereGeometry(Math.max(w, d) * 0.18, 10, 8), coreMat, 0, h * 0.4, 0);

  // Small satellite ooze bubbles around the base.
  const bubbleMat = slimeBlobMaterial(dna.colors.door, 0.6);
  const nBubbles = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nBubbles; i++) {
    const ang = (i / nBubbles) * Math.PI * 2 + r() * 0.4;
    const rad = Math.max(w, d) * 0.5 + 0.2 + r() * 0.3;
    const bs = 0.15 + r() * 0.2;
    addMesh(g, new THREE.SphereGeometry(bs, 8, 6), bubbleMat, Math.cos(ang) * rad, bs * 0.7, Math.sin(ang) * rad);
  }
  return g;
}

function buildSlimeVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  return buildSlimeBlobBase(dna, fp.w, fp.d, FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.95);
}

function buildSlimeChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = buildSlimeBlobBase(dna, fp.w, fp.d * 0.7, FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.05);
  // Pulse Pool: drip strands hanging from the dome apex (thin tapered cylinders).
  const r = mulberry32(dna.seed ^ 0x51117E01);
  const dripMat = slimeBlobMaterial(dna.colors.trim, 0.65);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.05;
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const rad = Math.min(fp.w, fp.d) * 0.25;
    const len = 0.3 + r() * 0.3;
    addMesh(g, new THREE.CylinderGeometry(0.03, 0.06, len, 5), dripMat, Math.cos(ang) * rad, h - len / 2, Math.sin(ang) * rad);
  }
  return g;
}

function buildSlimeShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.5;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x51117E02);
  // Goo Stall: small blob mound with a bulging "counter" lump out front.
  const blobMat = slimeBlobMaterial(dna.colors.walls, 0.55);
  addMesh(g, new THREE.SphereGeometry(Math.max(fp.w, fp.d) / 2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), blobMat, 0, 0, -fp.d * 0.1)
    .scale.set(1, h / (Math.max(fp.w, fp.d) / 2), 1);
  addMesh(g, new THREE.SphereGeometry(fp.w * 0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), blobMat, 0, 0, fp.d * 0.35)
    .scale.set(1.3, 0.5, 1);
  // Jar props for sale.
  const jarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8e8d0'), transparent: true, opacity: 0.7, roughness: 0.2 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8), jarMat, -fp.w * 0.3 + i * fp.w * 0.3, 0.35, fp.d * 0.35 + r() * 0.1);
  }
  return g;
}

// ── Undead — bone/crypt ossuary architecture ─────────────────────────────────
// Lich Tower (patriciate), Bone Shrine (church), Wraith Bazaar (market):
// gaunt stone spires, rib-cage bone arches, skull motifs — a "haunted crypt"
// rather than a house. Phase 2e (undead): a genuine `buildUndeadTierGrid()`
// occupancy grid — this is the rollout's deliberate *decay/erosion* case,
// reusing dwarven's exact stepped-tower tier-inset layout (the same
// centuries-old masonry technique, left to crumble) rather than a different
// silhouette family — replacing the old `addWeatheredTier()` (3 separate
// noise-perturbed `CylinderGeometry` tiers) and `addStoneArchDoorway()`
// (bolted-on voussoir boxes). Sparse block-omission decay, a broken/jagged
// crenellation, and bioluminescent rune-glow accents are now baked directly
// into the block grid instead of applied as separate crumbling props.

/**
 * Builds + meshes + centers a `buildUndeadTierGrid()` decayed ossuary
 * spire into `g` at the origin (same centering convention as
 * `addBlockVampireSpire()`/`addBlockDwarvenHall()`). The weathered
 * `'ashstone'` body is left softly chamfered (centuries-worn stone should
 * read rounded and eroded, not crisp), while the load-bearing `'ossuary'`
 * bone/reliquary corners and the carved `'facade'` doorway jambs are
 * chamfer-suppressed for a hard "still standing proud amid the decay"
 * contrast — the same soft-body/hard-corner split dwarven established,
 * reused here since undead is explicitly dwarven's decayed reflection.
 */
function addBlockUndeadSpire(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  wallColor: string, doorColor: string,
  opts: UndeadTierOptions = {},
): void {
  const grid = buildUndeadTierGrid(seed, w, d, h, opts);
  const palette = {
    ashstone: mat(wallColor, { roughness: 0.98, map: ashStoneTexture() }),
    ossuary:  mat('#d8d0b8', { roughness: 0.9 }),
    facade:   mat(doorColor, { roughness: 0.9 }),
    runeglow: new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1050'), emissive: new THREE.Color('#8020c0'), emissiveIntensity: 0.9, roughness: 0.4 }),
  };
  const mesh = meshBlockGrid(grid, palette, {
    suppressChamfer: (bx, by, bz) => {
      const k = getMaterialKey(grid, bx, by, bz);
      return k === 'ossuary' || k === 'facade';
    },
  });
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function buildUndeadVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B011);
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.6; // gaunt and tall
  // Lich Tower: a narrower-than-lot decayed ossuary spire (gaunt, not
  // filling the whole footprint) with 4 stepped tiers so the decay/crumble
  // reads clearly across several distinct courses.
  const w = fp.w * 0.72, d = fp.d * 0.72;
  addBlockUndeadSpire(g, dna.seed ^ 0xDEAD_1010, w, d, h, dna.colors.walls, dna.colors.trim, {
    tiers: 4, facade: true, decayFrac: 0.18, crownJitterBlocks: 3, runeglowCount: 6,
  });
  // Floating dark orb near the top (lich's power source) -- kept from the
  // old design, now floating above the genuinely broken/crumbled crown
  // rather than a separate bolted-on crenellation ring.
  const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1050'), emissive: new THREE.Color('#8020c0'), emissiveIntensity: 0.8, roughness: 0.3 });
  addMesh(g, new THREE.IcosahedronGeometry(0.28, 1), orbMat, 0, undeadRoofTopY(h) + 0.35, 0);
  // Narrow arrow-slit windows -- naturally thin/flat geometry ill-suited to
  // block-kit's cubic cells, kept as a small bolted-on prop.
  const slitMat = mat('#0a0a10', { roughness: 0.9 });
  for (let fl = 0; fl < 3; fl++) {
    addMesh(g, new THREE.BoxGeometry(0.1, 0.5, 0.05), slitMat, 0, h * (0.25 + fl * 0.2), d * 0.36 + 0.02);
  }
  // Fallen rubble blocks scattered at the base (decay storytelling) --
  // small debris chunks knocked loose from the crumbling tower above.
  const rubbleMat = mat(dna.colors.walls, { roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const ang = r() * Math.PI * 2;
    const rad = Math.max(w, d) * 0.55 + r() * 0.4;
    addMesh(g, new THREE.BoxGeometry(0.2 + r() * 0.15, 0.15 + r() * 0.1, 0.2 + r() * 0.15), rubbleMat, Math.cos(ang) * rad, 0.1, Math.sin(ang) * rad, r() * Math.PI);
  }
  return g;
}

function buildUndeadChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B012);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.15; // squat mausoleum, not a tall spire
  const boneMat = mat('#d8d0b8', { roughness: 0.92 });
  // Bone Shrine: a small decayed ossuary mausoleum (block-kit, same
  // technique as the villa's tower at a much squatter scale) at the rear
  // of a graveyard scene -- headstones and a low bone-post fence ring it,
  // per the "headstone/fence" props called for by this phase's plan.
  const shrine = new THREE.Group();
  addBlockUndeadSpire(shrine, dna.seed ^ 0xDEAD_1020, fp.w * 0.42, fp.d * 0.4, h, dna.colors.walls, dna.colors.trim, {
    tiers: 2, facade: true, decayFrac: 0.14, crownJitterBlocks: 2, runeglowCount: 3,
  });
  shrine.position.set(0, 0, -fp.d * 0.28);
  g.add(shrine);
  // Ribcage-arch entrance in front of the shrine: paired tapered "rib"
  // struts curving inward -- naturally thin curved geometry, kept as a
  // bolted-on prop rather than block-carved.
  const nRibs = 5;
  for (let i = 0; i < nRibs; i++) {
    const t = i / (nRibs - 1);
    const zOff = fp.d * 0.05;
    for (const side of [-1, 1]) {
      const rib = addMesh(g, new THREE.CylinderGeometry(0.05, 0.1, h * 0.65, 5), boneMat,
        side * (fp.w * 0.4 - t * fp.w * 0.12), h * 0.32, zOff);
      rib.rotation.z = side * (0.15 + t * 0.25);
    }
  }
  // Bone altar slab in front of the ribcage arch.
  const altarMat = mat(dna.colors.walls, { roughness: 0.95 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.4, 0.4, fp.d * 0.22), altarMat, 0, 0.2, fp.d * 0.2);
  // Headstones scattered across the graveyard plot in front of the shrine.
  const stoneMat = mat('#8a8878', { roughness: 0.95 });
  const headstonePositions: [number, number][] = [
    [-fp.w * 0.4, fp.d * 0.32], [fp.w * 0.38, fp.d * 0.3], [-fp.w * 0.22, fp.d * 0.42],
    [fp.w * 0.2, fp.d * 0.44], [-fp.w * 0.4, fp.d * 0.5], [fp.w * 0.4, fp.d * 0.48],
  ];
  for (const [hx, hz] of headstonePositions) {
    const lean = (r() - 0.5) * 0.3;
    const stone = addMesh(g, new THREE.BoxGeometry(0.18, 0.28 + r() * 0.12, 0.06), stoneMat, hx + (r() - 0.5) * 0.15, 0.16, hz + (r() - 0.5) * 0.15);
    stone.rotation.z = lean;
    stone.rotation.y = r() * 0.3;
  }
  // Low bone-post fence ringing the graveyard plot.
  const fenceMat = mat('#c8c0a8', { roughness: 0.9 });
  const fenceHalfW = fp.w * 0.55, fenceHalfD = fp.d * 0.62, fenceZOffset = fp.d * 0.15;
  const fencePosts: [number, number][] = [];
  const postsPerSide = 5;
  for (let i = 0; i <= postsPerSide; i++) {
    const t = i / postsPerSide;
    fencePosts.push([-fenceHalfW + t * fenceHalfW * 2, fenceZOffset - fenceHalfD]);
    fencePosts.push([-fenceHalfW + t * fenceHalfW * 2, fenceZOffset + fenceHalfD]);
  }
  for (let i = 0; i <= postsPerSide; i++) {
    const t = i / postsPerSide;
    fencePosts.push([-fenceHalfW, fenceZOffset - fenceHalfD + t * fenceHalfD * 2]);
    fencePosts.push([fenceHalfW, fenceZOffset - fenceHalfD + t * fenceHalfD * 2]);
  }
  for (const [fx, fz] of fencePosts) {
    addMesh(g, new THREE.CylinderGeometry(0.03, 0.035, 0.42, 5), fenceMat, fx, 0.21, fz);
  }
  // Candle sconces (small glowing orange dots) along the sides.
  const candleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0a040'), emissive: new THREE.Color('#f0a040'), emissiveIntensity: 0.7 });
  for (let i = 0; i < 4; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05, 6, 6), candleMat, (r() - 0.5) * fp.w * 0.6, 0.55 + r() * 0.2, fp.d * 0.05 + (r() - 0.5) * fp.d * 0.2);
  }
  return g;
}

function buildUndeadShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B013);
  const boneMat = mat('#d8d0b8', { roughness: 0.92 });
  const h = FLOOR_HEIGHT * 0.6;
  // Wraith Bazaar: the stall huddles against a low, single-tier decayed
  // wall stub (a fragment of some older ruin the bazaar has been built
  // into), tying it to the same block-kit decay language as the villa and
  // chapel even at this small scale.
  const wallStub = new THREE.Group();
  addBlockUndeadSpire(wallStub, dna.seed ^ 0xDEAD_1030, fp.w * 0.9, fp.d * 0.22, h * 1.4, dna.colors.walls, dna.colors.trim, {
    tiers: 1, decayFrac: 0.22, crownJitterBlocks: 3, runeglowCount: 2,
  });
  wallStub.position.set(0, 0, -fp.d * 0.42);
  g.add(wallStub);
  // Bone-strut stall frame with a tattered cloth canopy.
  for (const [sx, sz] of [[-fp.w / 2, -fp.d / 2], [fp.w / 2, -fp.d / 2], [-fp.w / 2, fp.d / 2], [fp.w / 2, fp.d / 2]] as [number, number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.08, h, 6), boneMat, sx, h / 2, sz);
  }
  const clothMat = mat(dna.colors.trim, { roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  addMesh(g, new THREE.BoxGeometry(fp.w + 0.1, 0.06, fp.d + 0.1), clothMat, 0, h, 0);
  // Skull lanterns hanging from the corners.
  const lanternMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a0e090'), emissive: new THREE.Color('#60c050'), emissiveIntensity: 0.7, roughness: 0.6 });
  for (const [sx, sz] of [[-fp.w / 2, -fp.d / 2], [fp.w / 2, fp.d / 2]] as [number, number][]) {
    addMesh(g, new THREE.SphereGeometry(0.1 + r() * 0.03, 7, 6), lanternMat, sx, h - 0.15, sz);
  }
  // Counter with tattered goods -- a warm rotten-wood brown, deliberately
  // a different hue family from the cool stone-grey walls (#5a5048) so it
  // reads as a distinct material, not the same stone darkened.
  const woodMat = mat('#3a2818', { roughness: 0.9 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.6, 0.4, 0.35), woodMat, 0, 0.2, fp.d * 0.3);
  return g;
}

// ── Elven — living-tree architecture ──────────────────────────────────────────
// Elder's Hall (patriciate), Ancient Shrine (church), Moonlit Exchange (market):
// organic curved trunk silhouettes grown from real block occupancy, leaf-canopy
// crowns, and moonstone/firefly accents — a village grown from trees, not built
// with lumber. Phase 2e (§2e.5): the trunk+canopy body is now a genuine BlockKit
// grid (`buildElvenTrunkGrid()` — the heightfield technique run "inside-out": a
// per-*level* radius that narrows to a waist then flares into a canopy), not a
// noise-crumbled cylinder topped with a cluster of overlapping foliage spheres
// (see plan doc §2e.5 for why the old sphere-cluster canopy read as "a muddy
// brown blob with dangling root tendrils").

/**
 * Builds + meshes + centers a `buildElvenTrunkGrid()` living-tree trunk into
 * `g` at the origin (same centering convention as `addBlockDwarvenHall()`).
 * No corner is chamfer-suppressed — unlike dwarven's deliberately-hard
 * buttresses, elven architecture wants every edge softened into an organic
 * silhouette.
 */
function addBlockElvenTrunk(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  barkColor: string, leafColor: string, facadeColor: string,
  opts: ElvenTrunkOptions = {},
): void {
  const grid = buildElvenTrunkGrid(seed, w, d, h, opts);
  const palette = {
    bark:      mat(barkColor, { roughness: 0.9, map: barkTexture() }),
    leaf:      mat(leafColor, { roughness: 0.75 }),
    facade:    mat(facadeColor, { roughness: 0.8 }),
    moonstone: mat('#d8e8f0', { roughness: 0.5, metalness: 0.05 }),
    glow:      new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.9, roughness: 0.5 }),
  };
  const mesh = meshBlockGrid(grid, palette);
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

/**
 * A ring platform/balcony built from small radial plank blocks — the same
 * "many small solid pieces read correctly from every angle" principle as
 * vulperia's timber-stave door ring, replacing a single smooth
 * `TorusGeometry` (which, being a thin continuous ring, degenerates to a
 * hairline edge-on and doesn't read as "built" at all).
 */
function addPlankRing(g: THREE.Group, seed: number, y: number, radius: number, material: THREE.Material, count = 14): void {
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const rad = radius * (0.96 + r() * 0.06);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(radius * (Math.PI * 2 / count) * 1.15, 0.06, radius * 0.22), material);
    plank.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    plank.rotation.y = -ang + Math.PI / 2;
    plank.castShadow = true;
    plank.receiveShadow = true;
    g.add(plank);
  }
}

/**
 * Diagonal wooden support brackets bracing a plank ring against the trunk
 * surface just below it — without these the ring reads as a disc floating
 * in mid-air next to the trunk (a "flying saucer collar" illusion),
 * regardless of how correctly its radius/height are otherwise sized.
 * A handful of angled braces running from the trunk surface up/out to the
 * ring's underside visually "grounds" it as an attached platform.
 */
function addRingBraces(g: THREE.Group, seed: number, y: number, trunkRadius: number, ringRadius: number, material: THREE.Material, count = 6): void {
  const r = mulberry32(seed);
  const braceLen = Math.hypot(ringRadius - trunkRadius, ringRadius * 0.3);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.3;
    const innerR = trunkRadius * 0.92;
    const midX = Math.cos(ang) * (innerR + ringRadius) * 0.5;
    const midZ = Math.sin(ang) * (innerR + ringRadius) * 0.5;
    const brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen, 0.05, 0.05), material);
    brace.position.set(midX, y - ringRadius * 0.18, midZ);
    brace.rotation.y = -ang + Math.PI / 2;
    brace.rotation.z = Math.atan2(ringRadius * 0.3, ringRadius - trunkRadius);
    brace.castShadow = true;
    g.add(brace);
  }
}

function buildElvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.5; // tall, reaching into canopy
  const g = new THREE.Group();
  addBlockElvenTrunk(g, dna.seed ^ 0xE1F3_0010, fp.w, fp.d, h, dna.colors.walls, dna.colors.roof, dna.colors.trim, {
    facade: true,
  });
  // Elder's Hall: a block-built plank ring/balcony girdling the trunk's
  // actual neck (where the taper stops and the canopy begins), sized to
  // just overhang the trunk's real constructed waist radius there (not an
  // arbitrary fraction of the whole footprint) plus a handful of angled
  // support braces bridging ring-to-trunk, so it reads as a platform built
  // onto the tree rather than a disc floating beside it.
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  const neckY = elvenNeckY(h);
  const trunkRadiusAtNeck = elvenWaistRadius(fp.w, fp.d);
  const ringRadius = trunkRadiusAtNeck * 1.25;
  addPlankRing(g, dna.seed ^ 0xE1F3_0013, neckY, ringRadius, woodMat, 14);
  addRingBraces(g, dna.seed ^ 0xE1F3_0015, neckY, trunkRadiusAtNeck, ringRadius, woodMat, 6);
  return g;
}

function buildElvenChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xE1F3_0002);
  // Ancient Shrine: a ring of standing tree-stones around a central glowing
  // crystal — already genuine discrete standing monoliths (not a deformed
  // blob primitive), kept as-is from Phase 2b/2d.
  const stoneMat = mat('#7a8a70', { roughness: 0.95 });
  const nStones = 6;
  for (let i = 0; i < nStones; i++) {
    const ang = (i / nStones) * Math.PI * 2;
    const rad = Math.min(fp.w, fp.d) * 0.42;
    const sh = 0.8 + r() * 0.4;
    addMesh(g, new THREE.CylinderGeometry(0.14, 0.18, sh, 6), stoneMat, Math.cos(ang) * rad, sh / 2, Math.sin(ang) * rad, ang);
  }
  const crystalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#a0ffe0'), emissive: new THREE.Color('#60ffc0'), emissiveIntensity: 1.0, roughness: 0.15, transparent: true, opacity: 0.9 });
  addMesh(g, new THREE.OctahedronGeometry(0.3, 0), crystalMat, 0, 1.0, 0);
  return g;
}

function buildElvenShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 1.1; // a small sapling, not a full trunk
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xE1F3_0003);
  // Moonlit Exchange: a raised wooden trading platform beneath a small
  // block-built sapling (a miniature version of the same trunk+canopy grid,
  // not a separate sphere-cluster technique) — reusing the villa's own
  // shape profile at a smaller scale is the same "small, consistent
  // vocabulary" principle the block-kit engine is built on.
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.14, 0.35, 8), woodMat, 0, 0.175, 0);
  addMesh(g, new THREE.BoxGeometry(fp.w, 0.1, fp.d), woodMat, 0, 0.35, 0);
  addBlockElvenTrunk(g, dna.seed ^ 0xE1F3_0014, fp.w * 0.55, fp.d * 0.55, h, dna.colors.walls, dna.colors.roof, dna.colors.trim, {
    canopyStartFrac: 0.35, waistFrac: 0.6, canopyFlareFrac: 1.2,
  });
  g.children[g.children.length - 1]!.position.y += 0.4; // sit atop the trading platform
  // Hanging glow-motes typical of a moonlit night market.
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.8 });
  for (let i = 0; i < 4; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05 + r() * 0.02, 6, 6), glowMat, (r() - 0.5) * fp.w, 0.5, (r() - 0.5) * fp.d);
  }
  return g;
}

// ── Dwarven — carved-stone mountain architecture ──────────────────────────────
// Guild Hall (patriciate), Stone Temple (church), Trade Vault (market):
// squat, heavy, precise stepped-tier stone blockwork with un-chamfered
// monumental buttress corners and iron-banded vault doors — built to
// endure, not to charm. Phase 2e (§2e.4): the tiered tower body is now a
// genuine BlockKit stepped-tier grid (`buildDwarvenHallGrid()`), not a
// stack of smooth inset boxes — the deliberate *contrast case* proving the
// block-kit engine generalises beyond vulperia's organic mound to crisp,
// monumental masonry (see plan doc §2e.4).

/**
 * A vault-door wheel mechanism: a hub + radiating spoke boxes (never a
 * flat torus/ring — spokes are boxes crossing through the hub, so the
 * shape stays legible from any camera angle instead of degenerating to a
 * hairline edge-on).
 */
function addVaultWheel(g: THREE.Group, cx: number, cy: number, cz: number, radius: number, material: THREE.Material): void {
  const hub = addMesh(g, new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, radius * 0.18, 10), material, cx, cy, cz);
  hub.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, radius * 0.16, radius * 0.14), material);
    spoke.position.set(cx, cy, cz);
    spoke.rotation.z = ang;
    spoke.castShadow = true;
    g.add(spoke);
  }
}

/**
 * Builds + meshes + centers a `buildDwarvenHallGrid()` stepped-tier tower
 * into `g` at the origin (same centering convention as `addBlockDenMound()`).
 * Corner "buttress" columns are exempted from edge-chamfering via
 * `suppressChamfer` — dwarven monumental masonry should read as
 * *deliberately* hard-edged at its load-bearing corners, in contrast to
 * vulperia's uniformly-softened organic hill.
 */
function addBlockDwarvenHall(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  stoneColor: string, buttressColor: string, facadeColor: string,
  opts: DwarvenHallOptions = {},
): void {
  const grid = buildDwarvenHallGrid(seed, w, d, h, opts);
  const palette = {
    stone:    mat(stoneColor, { roughness: 0.92, map: graniteTexture() }),
    buttress: mat(buttressColor, { roughness: 0.6, metalness: 0.25 }),
    facade:   mat(facadeColor, { roughness: 0.85, metalness: 0.15 }),
  };
  const mesh = meshBlockGrid(grid, palette, {
    suppressChamfer: (bx, by, bz) => getMaterialKey(grid, bx, by, bz) === 'buttress',
  });
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function dwarvenBlock(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const trimMat = mat(dna.colors.trim, { roughness: 0.7, metalness: 0.3 });
  // Deliberately darker/desaturated iron-grey buttress colour (distinct from
  // the warm stone body) so the un-chamfered corners actually read as a
  // contrasting structural material, not just "the same stone with sharp
  // edges" — the same colour-contrast lesson vulperia's v2 fix established.
  const buttressColor = '#4a4a48';
  const facadeColor = dna.colors.trim;

  addBlockDwarvenHall(g, dna.seed ^ 0xD4A4_0010, w, d, h, dna.colors.walls, buttressColor, facadeColor, {
    tiers: 3, facade: true,
  });

  // Iron-banded vault-style door with a wheel mechanism, sitting in the
  // block grid's carved facade notch.
  const doorMat = mat(dna.colors.door, { roughness: 0.6, metalness: 0.4 });
  const doorH = h * 0.5;
  addMesh(g, new THREE.BoxGeometry(w * 0.28, doorH, 0.1), doorMat, 0, doorH / 2, d / 2 + 0.02);
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.BoxGeometry(w * 0.28, 0.04, 0.11), trimMat, 0, doorH * (0.2 + i * 0.28), d / 2 + 0.03);
  }
  addVaultWheel(g, 0, doorH * 0.5, d / 2 + 0.07, Math.min(w, d) * 0.14, trimMat);
  return g;
}

function buildDwarvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.75;
  const g = dwarvenBlock(dna, fp.w, fp.d, h);
  // Guild Hall: a raised banner-crest above the entrance and a low
  // chimney-forge stack. Positioned off the tower's *actual* block-
  // quantized height (not the raw continuous `h`), and clamped within the
  // topmost tier's real (post-inset) footprint — the tiers step inward as
  // they rise, so placing a roofline prop using the *base* footprint's
  // width/depth can land it beyond the actual (narrower) top tier's edge,
  // floating with nothing built underneath it.
  const roofH = dwarvenRoofTopY(h);
  const topExtents = dwarvenTopTierExtents(fp.w, fp.d, h, { tiers: 3 });
  const bannerMat = mat(dna.colors.trim, { roughness: 0.7, side: THREE.DoubleSide });
  addMesh(g, new THREE.BoxGeometry(0.5, 0.7, 0.04), bannerMat, 0, roofH + 0.35, Math.min(fp.d / 2 - 0.2, topExtents.halfD));
  const chimneyMat = mat('#3a3a38', { roughness: 0.9 });
  addMesh(g, new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8), chimneyMat, Math.min(fp.w * 0.35, topExtents.halfW), roofH + 0.3, -Math.min(fp.d * 0.3, topExtents.halfD));
  return g;
}

function buildDwarvenChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.8;
  const g = dwarvenBlock(dna, fp.w * 0.9, fp.d, h);
  // Stone Temple: flanking column pillars either side of the entrance + a
  // brazier. Sized off the tower's actual constructed roof height (not
  // `h * 1.1`, which — since `h` is itself already close to the tower's
  // full height — produced free-standing columns *taller than the temple
  // they were meant to flank*. A believable classical flanking pillar
  // rises to a bit under the roofline, not past it.
  const roofH = dwarvenRoofTopY(h);
  const columnH = roofH * 0.7;
  const columnMat = mat('#8a8478', { roughness: 0.9 });
  for (const cx of [-fp.w * 0.38, fp.w * 0.38]) {
    addMesh(g, new THREE.CylinderGeometry(0.15, 0.18, columnH, 8), columnMat, cx, columnH / 2, fp.d * 0.42);
  }
  const brazierMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2818'), emissive: new THREE.Color('#e07020'), emissiveIntensity: 0.7, roughness: 0.6 });
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.1, 0.3, 8), brazierMat, 0, 0.15, fp.d / 2 + 0.4);
  return g;
}

function buildDwarvenShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.9;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xD4A4_0003);
  // Trade Vault: a single-tier block hall (no stepped tiers — a squat
  // strongroom front, not a full guild tower) with the same vault-door
  // wheel mechanism, anvil and ore-crate clutter. The hall is built
  // shallower than the nominal footprint (`d`, not `fp.d`) — every prop
  // below is positioned relative to `d` too, not `fp.d`, so the door,
  // wheel, anvil and crates land against the vault's *actual* front wall
  // instead of floating past it into open air.
  const d = fp.d * 0.6;
  addBlockDwarvenHall(g, dna.seed ^ 0xD4A4_0011, fp.w, d, h, dna.colors.walls, '#4a4a48', dna.colors.trim, {
    tiers: 1, facade: true,
  });
  const doorMat = mat('#6a6858', { roughness: 0.5, metalness: 0.5 });
  // A vault door sized as a believable doorway (~1/4 of the wall width),
  // not the ~44%-of-width oversized disc the old `fp.w * 0.22` radius
  // produced on smaller shop footprints.
  const doorRadius = Math.min(fp.w * 0.13, d * 0.4);
  addMesh(g, new THREE.CylinderGeometry(doorRadius, doorRadius, 0.08, 16), doorMat, 0, h * 0.42, d / 2 + 0.05)
    .rotation.x = Math.PI / 2;
  addVaultWheel(g, 0, h * 0.42, d / 2 + 0.1, doorRadius * 0.65, mat(dna.colors.trim, { roughness: 0.6, metalness: 0.5 }));
  const anvilMat = mat('#2a2a28', { roughness: 0.6, metalness: 0.5 });
  addMesh(g, new THREE.BoxGeometry(0.3, 0.25, 0.15), anvilMat, fp.w * 0.35, 0.13, d / 2 + 0.2);
  const crateMat = mat('#7a6040', { roughness: 0.9 });
  for (let i = 0; i < 2; i++) {
    addMesh(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), crateMat, -fp.w * 0.35 + i * 0.15, 0.15, d / 2 + 0.35, r() * 0.5);
  }
  return g;
}

// ── Orcish — lashed/asymmetric block-kit hut architecture ─────────────────────
// Warlord Hall (patriciate), War Shrine (church), Loot Pile (market):
// Phase 2e (orcish): a genuine `buildOrcishHutGrid()` occupancy grid — an
// asymmetric, lashed-together hut body in mismatched "patch" materials
// topped with a jagged, single-pitch lean-to roof — replacing the old
// `addPalisadeWall()` (a ring of bolted-on log cylinders) + separate
// `addRoughConeRoof()` (a single noise-perturbed cone). Small bolted-on
// accents (bone/spike totems, skull-and-tusk trophy, bonfire, loot
// crates/blade) remain acceptable per the established "small props are
// fine, only large primitive-built main structures are not" precedent.

/**
 * Builds + meshes + centers a `buildOrcishHutGrid()` hut into `g` at the
 * origin (same centering convention as `addBlockFaeStalk()`). The
 * mismatched wall "patch" materials (rough-hewn scavenged planks/hide/
 * bone) and the crude door frame are chamfer-suppressed for a hard-edged,
 * hand-hacked-carpentry read; the roof patches stay softly chamfered
 * (draped hide/thatch reads better rounded than sharp), the same
 * body-vs-accent contrast convention as dwarven's buttress/vampire's iron.
 */
function addBlockOrcishHut(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  wallColor: string, trimColor: string, roofColor: string, doorColor: string,
  opts: OrcishHutOptions = {},
): void {
  const grid = buildOrcishHutGrid(seed, w, d, h, opts);
  const palette = {
    patchA: mat(wallColor, { roughness: 0.92, map: hideTexture() }),
    patchB: mat(trimColor, { roughness: 0.92, map: hideTexture() }),
    patchC: mat('#c8ba94', { roughness: 0.88, map: hideTexture() }), // hardcoded pale bone/scrap patch (checked distinct from wallColor/trimColor: shifted lighter/greyer than the warm tan trim so it reads as a genuinely mismatched scavenged patch, not just a shade of the same brown)
    roofpatchA: mat(roofColor, { roughness: 0.85, map: hideTexture() }),
    roofpatchB: mat('#5a4a30', { roughness: 0.88, map: hideTexture() }), // hardcoded weathered-thatch/hide contrast patch
    facade: mat(doorColor, { roughness: 0.8 }),
  };
  const mesh = meshBlockGrid(grid, palette, {
    suppressChamfer: (bx, by, bz) => {
      const k = getMaterialKey(grid, bx, by, bz);
      return k === 'patchA' || k === 'patchB' || k === 'patchC' || k === 'facade';
    },
  });
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function buildOrcishVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.1;
  const g = new THREE.Group();
  addBlockOrcishHut(g, dna.seed ^ 0x0AC1_0010, fp.w, fp.d, h, dna.colors.walls, dna.colors.trim, dna.colors.roof, dna.colors.door, {
    facade: true,
  });
  // Warlord Hall: a mounted skull-and-tusk trophy above the entrance.
  const skullMat = mat('#e8dcc0', { roughness: 0.8 });
  const wallTopY = orcishWallTopY(h);
  addMesh(g, new THREE.SphereGeometry(0.2, 8, 6), skullMat, 0, wallTopY * 0.95, fp.d / 2 - 0.1);
  const tuskMat = mat('#f0e8d0', { roughness: 0.6 });
  for (const tx of [-0.12, 0.12]) {
    const tusk = addMesh(g, new THREE.ConeGeometry(0.04, 0.35, 5), tuskMat, tx, wallTopY * 0.85, fp.d / 2 - 0.05);
    tusk.rotation.z = tx > 0 ? -0.6 : 0.6;
  }
  return g;
}

function buildOrcishChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x0AC1_0002);
  // War Shrine: a central bonfire pit ringed by bone/weapon totem poles.
  const poleMat = mat('#3a2c1a', { roughness: 0.9 });
  const nPoles = 5;
  for (let i = 0; i < nPoles; i++) {
    const ang = (i / nPoles) * Math.PI * 2;
    const rad = Math.min(fp.w, fp.d) * 0.4;
    const ph = 1.2 + r() * 0.6;
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.08, ph, 6), poleMat, Math.cos(ang) * rad, ph / 2, Math.sin(ang) * rad);
    const skullMat = mat('#e0d4b8', { roughness: 0.8 });
    addMesh(g, new THREE.SphereGeometry(0.12, 6, 6), skullMat, Math.cos(ang) * rad, ph + 0.1, Math.sin(ang) * rad);
  }
  const fireMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1808'), emissive: new THREE.Color('#ff5010'), emissiveIntensity: 1.1, roughness: 0.6 });
  addMesh(g, new THREE.ConeGeometry(0.3, 0.5, 6), fireMat, 0, 0.25, 0);
  return g;
}

function buildOrcishShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.6;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x0AC1_0003);
  // Loot Pile: a small block-built lean-to hut over a heap of plundered
  // crates/weapons — no facade (an open-fronted stall), reusing the same
  // jagged patchwork silhouette at a reduced scale.
  addBlockOrcishHut(g, dna.seed ^ 0x0AC1_0013, fp.w * 0.7, fp.d * 0.7, h, dna.colors.walls, dna.colors.trim, dna.colors.roof, dna.colors.door, {
    wallHeightFrac: 0.3,
  });
  const crateMat = mat('#6a5030', { roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const cx = (r() - 0.5) * fp.w * 0.6;
    const cz = (r() - 0.5) * fp.d * 0.6;
    addMesh(g, new THREE.BoxGeometry(0.28, 0.2 + r() * 0.2, 0.28), crateMat, cx, 0.15, cz, r() * 0.6);
  }
  // Crossed scavenged weapons jutting from the pile.
  const bladeMat = mat('#909090', { roughness: 0.4, metalness: 0.6 });
  const blade = addMesh(g, new THREE.ConeGeometry(0.03, 0.6, 4), bladeMat, fp.w * 0.2, 0.4, fp.d * 0.2);
  blade.rotation.z = 0.5;
  return g;
}

// ── Vampire — tapering gothic-spire block-kit architecture ────────────────────
// Count's Tower (patriciate), Blood Chapel (church), Blood Market (market):
// Phase 2e (vampire): a genuine `buildVampireSpireGrid()` occupancy grid —
// a gaunt, monotonically-tapering obsidian spire ending in a real
// block-built crenellated iron parapet and a carved pointed-arch doorway —
// replacing the old boxy `gothicBase()` (a flat slab + bolted-on cone roof +
// bolted-on stepped-slab "buttresses", the same primitive-cone-roof pattern
// already rejected for vulperia/dwarven/elven). Small bolted-on accents
// (gargoyles, rose window, blood orb, candelabra) remain acceptable per the
// established "small props are fine, only large primitive-built main
// structures are not" precedent.

/**
 * A gothic rose window: stone tracery mullions — 8 radial spoke blocks
 * plus an outer ring of chunky stone segments (reusing the same
 * "many small solid pieces, never a flat torus" principle as vulperia's
 * timber-stave ring) — framing a dark stained-glass disc, instead of a
 * flat colour disc standing in for an entire rose window.
 */
function addRoseWindow(g: THREE.Group, cx: number, cy: number, cz: number, radius: number, stoneMat: THREE.Material, glassMat: THREE.Material): void {
  addMesh(g, new THREE.CircleGeometry(radius * 0.85, 16), glassMat, cx, cy, cz);
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.8, radius * 0.1, 0.06), stoneMat);
    spoke.position.set(cx, cy, cz + 0.02);
    spoke.rotation.z = ang;
    g.add(spoke);
  }
  addTimberRingSegments(g, cx, cy, cz + 0.01, radius * 0.95, stoneMat, 10, radius * 0.22, 0.08);
}

/**
 * Builds + meshes + centers a `buildVampireSpireGrid()` gothic spire into
 * `g` at the origin (same centering convention as `addBlockElvenTrunk()`).
 * The 'iron' crenellations and 'facade' door jambs are chamfer-suppressed —
 * a battlement merlon or a carved door-post reads as *cut, precise*
 * stonework, in deliberate contrast to the softly-chamfered 'obsidian' body
 * that keeps the tapering silhouette from looking aliased/blocky.
 */
function addBlockVampireSpire(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  wallColor: string, doorColor: string,
  opts: VampireSpireOptions = {},
): void {
  const grid = buildVampireSpireGrid(seed, w, d, h, opts);
  const palette = {
    obsidian:  mat(wallColor, { roughness: 0.55, metalness: 0.1, map: obsidianTexture() }),
    iron:      mat('#3a3a42', { roughness: 0.45, metalness: 0.55 }),
    facade:    mat(doorColor, { roughness: 0.6 }),
    bloodglow: new THREE.MeshStandardMaterial({ color: new THREE.Color('#c81030'), emissive: new THREE.Color('#e02840'), emissiveIntensity: 0.85, roughness: 0.35 }),
  };
  const mesh = meshBlockGrid(grid, palette, {
    suppressChamfer: (bx, by, bz) => {
      const k = getMaterialKey(grid, bx, by, bz);
      return k === 'iron' || k === 'facade';
    },
  });
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function buildVampireVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.7; // tall, gaunt
  const g = new THREE.Group();
  addBlockVampireSpire(g, dna.seed ^ 0xB100D_0010, fp.w, fp.d, h, dna.colors.walls, dna.colors.door, {
    facade: true,
  });
  // Count's Tower: a smaller companion turret (the same spire profile at a
  // reduced scale, mirroring vulperia's Fox Den / elven's satellite-lobe
  // pattern) plus bat-gargoyle silhouettes and a balcony sitting flush
  // against the main spire's real constructed parapet-deck radius.
  const turretH = h * 0.62;
  const turret = new THREE.Group();
  addBlockVampireSpire(turret, dna.seed ^ 0xB100D_0011, fp.w * 0.5, fp.d * 0.5, turretH, dna.colors.walls, dna.colors.door, {
    waistFrac: 0.4,
  });
  turret.position.set(fp.w * 0.48, 0, fp.d * 0.3);
  g.add(turret);
  const gargoyleMat = mat('#2a2020', { roughness: 0.6 });
  const deckR = vampireSpireDeckRadius(fp.w, fp.d);
  for (const ang of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const gargoyle = addMesh(g, new THREE.ConeGeometry(0.13, 0.28, 4), gargoyleMat, Math.cos(ang) * deckR * 0.95, vampireSpireTopY(h) - h * 0.12, Math.sin(ang) * deckR * 0.95);
    gargoyle.rotation.x = Math.PI;
  }
  const balconyMat = mat(dna.colors.trim, { roughness: 0.6, metalness: 0.2 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.5, 0.08, 0.28), balconyMat, 0, h * 0.5, fp.d * 0.4);
  return g;
}

function buildVampireChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.3; // shorter & wider than the villa's tower
  const g = new THREE.Group();
  addBlockVampireSpire(g, dna.seed ^ 0xB100D_0002, fp.w * 1.15, fp.d * 1.0, h, dna.colors.walls, dna.colors.door, {
    facade: true, parapetStartFrac: 0.7, waistFrac: 0.45,
  });
  // Blood Chapel: twin flanking spirelets (miniature spires, reusing the
  // same shape profile at a much smaller scale) + a dark red stained-glass
  // rose window with real stone tracery + a hovering blood-red orb.
  for (const sx of [-fp.w * 0.5, fp.w * 0.5]) {
    const spirelet = new THREE.Group();
    addBlockVampireSpire(spirelet, dna.seed ^ 0xB100D_0003 ^ (sx > 0 ? 1 : 2), fp.w * 0.3, fp.d * 0.3, h * 0.5, dna.colors.walls, dna.colors.door, {
      waistFrac: 0.3,
    });
    spirelet.position.set(sx, 0, 0);
    g.add(spirelet);
  }
  const trimMat = mat(dna.colors.trim, { roughness: 0.5, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a1020'), emissive: new THREE.Color('#a01830'), emissiveIntensity: 0.5, roughness: 0.3 });
  addRoseWindow(g, 0, h * 0.62, fp.d * 0.5 + 0.02, fp.w * 0.16, trimMat, glassMat);
  const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a0510'), emissive: new THREE.Color('#c81030'), emissiveIntensity: 0.9, roughness: 0.3 });
  addMesh(g, new THREE.SphereGeometry(0.15, 10, 8), orbMat, 0, h * 0.55, fp.d * 0.55);
  return g;
}

function buildVampireShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.6;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xB100D_0004);
  // Blood Market: a dark iron-framed stall — the same pole-and-canvas
  // canopy technique used to fix vulperia's shop (a flat, slightly-tilted
  // panel resting on real support poles), replacing the old floating
  // `ConeGeometry` awning that shared the same disconnected-roof bug class.
  const ironMat = mat('#1a1818', { roughness: 0.5, metalness: 0.4 });
  const poleH = h * 0.95;
  const awningHalfW = fp.w * 0.42;
  const counterZ = fp.d * 0.3;
  for (const sx of [-awningHalfW, awningHalfW]) {
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.05, poleH, 6), ironMat, sx, poleH / 2, counterZ);
  }
  const woodMat = mat('#241818', { roughness: 0.85 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.75, 0.35, 0.32), woodMat, 0, 0.175, counterZ);
  const canopyMat = mat('#5a0818', { roughness: 0.6, side: THREE.DoubleSide });
  const canopy = addMesh(g, new THREE.BoxGeometry(awningHalfW * 2 + 0.25, 0.06, fp.d * 0.42), canopyMat, 0, poleH, counterZ);
  canopy.rotation.x = -0.1;
  const candelabraMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b01828'), emissive: new THREE.Color('#e02840'), emissiveIntensity: 0.8 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05 + r() * 0.02, 6, 6), candelabraMat, -fp.w * 0.25 + i * fp.w * 0.25, poleH * 0.7, counterZ);
  }
  return g;
}

// ── Fae — whimsical mushroom/flower block-kit architecture ────────────────────
// Fae Court (patriciate), Faerie Ring (church), Twilight Market (market):
// Phase 2e (fae): a genuine `buildFaeStalkGrid()` occupancy grid — a mildly
// gnarled toadstool stalk that flares into a real block-built, noise-
// scalloped mushroom cap with a domed crown and a carved circular "portal"
// doorway — replacing the old primitive `addScallopedCap()` (a deformed
// half-sphere) + separate cylinder stalk. Small bolted-on accents (gill
// ribs, petals, firefly motes) remain acceptable per the established
// "small props are fine, only large primitive-built main structures are
// not" precedent.

/**
 * Real underside gill ribs radiating from a mushroom cap's center — thin
 * flat fins fanning out beneath the rim, the classic toadstool detail
 * that's otherwise completely absent from a smooth dome cap. Kept as a
 * small bolted-on prop (like vampire's rose window) rather than encoded
 * into block occupancy, since radiating fins are naturally thin/flat
 * geometry that block-kit's cubic cells can't represent cleanly.
 */
function addMushroomGills(g: THREE.Group, capY: number, gillSpan: number, material: THREE.Material, count = 14): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const gill = new THREE.Mesh(new THREE.BoxGeometry(gillSpan * 2, 0.015, gillSpan * 0.19), material);
    gill.position.set(0, capY, 0);
    gill.rotation.y = ang;
    g.add(gill);
  }
}

/**
 * Builds + meshes + centers a `buildFaeStalkGrid()` toadstool into `g` at
 * the origin (same centering convention as `addBlockVampireSpire()`). No
 * materials are chamfer-suppressed here — unlike vampire's hard-edged
 * iron/dwarven's buttress corners, fae's whimsical theme calls for
 * everything (stalk, cap, portal frame) reading soft and organic, mirroring
 * elven's "everything gently chamfered" choice.
 */
function addBlockFaeStalk(
  g: THREE.Group,
  seed: number, w: number, d: number, h: number,
  stalkColor: string, capColor: string, doorColor: string,
  opts: FaeStalkOptions = {},
): void {
  const grid = buildFaeStalkGrid(seed, w, d, h, opts);
  const palette = {
    stalk:  mat(stalkColor, { roughness: 0.6, map: toadstoolTexture() }),
    cap:    mat(capColor, { roughness: 0.5, map: toadstoolTexture() }),
    facade: mat(doorColor, { roughness: 0.55 }),
    spore:  new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8ffb0'), emissive: new THREE.Color('#a0ff70'), emissiveIntensity: 0.85, roughness: 0.35 }),
  };
  const mesh = meshBlockGrid(grid, palette, {});
  const bw = Math.max(3, Math.round(w / BLOCK_UNIT));
  const bd = Math.max(3, Math.round(d / BLOCK_UNIT));
  mesh.position.x -= ((bw - 1) / 2) * BLOCK_UNIT;
  mesh.position.z -= ((bd - 1) / 2) * BLOCK_UNIT;
  g.add(mesh);
}

function buildFaeVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.1;
  const g = new THREE.Group();
  addBlockFaeStalk(g, dna.seed ^ 0xFA_E00010, fp.w, fp.d, h, dna.colors.walls, dna.colors.roof, dna.colors.door, {
    facade: true,
  });
  // Real underside gill ribs — the classic toadstool detail, entirely
  // absent from a smooth dome cap.
  addMushroomGills(g, faeCapTopY(h) - h * 0.08, faeCapRimRadius(fp.w, fp.d) * 0.8, mat(dna.colors.trim, { roughness: 0.7 }), 14);
  // Fae Court: a ring of smaller block-built toadstools clustered around
  // the main one (mirroring vampire's companion-turret pattern) — each a
  // reduced-scale instance of the same grid, not a separate primitive.
  const r = mulberry32(dna.seed ^ 0xFA_E00002);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + r() * 0.4;
    const rad = fp.w * 0.62;
    const satellite = new THREE.Group();
    addBlockFaeStalk(satellite, dna.seed ^ 0xFA_E00020 ^ i, fp.w * 0.32, fp.d * 0.32, h * 0.4, dna.colors.walls, dna.colors.trim, dna.colors.door, {
      capFlareFrac: 1.8,
    });
    satellite.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    g.add(satellite);
  }
  // Firefly motes drifting near the cap edge.
  const fireflyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff4a0'), emissive: new THREE.Color('#ffe060'), emissiveIntensity: 1.0 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    addMesh(g, new THREE.SphereGeometry(0.04, 6, 6), fireflyMat, Math.cos(ang) * fp.w * 0.5, faeCapTopY(h) * 0.9, Math.sin(ang) * fp.d * 0.5);
  }
  return g;
}

function buildFaeChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xFA_E00003);
  // Faerie Ring: a literal ring of small block-built glowing toadstools
  // around a mossy, glowing center — no single "main building" the way
  // the villa/shop have one, matching the old design's intent but now with
  // genuine block-built caps instead of deformed half-spheres.
  const nRing = 7;
  for (let i = 0; i < nRing; i++) {
    const ang = (i / nRing) * Math.PI * 2;
    const rad = Math.min(fp.w, fp.d) * 0.48;
    const sh = FLOOR_HEIGHT * (0.35 + r() * 0.2);
    const toadstool = new THREE.Group();
    addBlockFaeStalk(toadstool, dna.seed ^ 0xFA_E00030 ^ i, 1.0, 1.0, sh, dna.colors.walls, dna.colors.trim, dna.colors.door, {
      capFlareFrac: 1.6, waistFrac: 0.85,
    });
    toadstool.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    g.add(toadstool);
  }
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0ffc0'), emissive: new THREE.Color('#a0ff80'), emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.8 });
  addMesh(g, new THREE.TorusGeometry(Math.min(fp.w, fp.d) * 0.32, 0.03, 6, 20), glowMat, 0, 0.03, 0)
    .rotation.x = Math.PI / 2;
  return g;
}

function buildFaeShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.75;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xFA_E00004);
  // Twilight Market: a small block-built mushroom stall + petal decorations
  // + fireflies.
  addBlockFaeStalk(g, dna.seed ^ 0xFA_E00014, fp.w * 0.6, fp.d * 0.6, h, dna.colors.walls, dna.colors.roof, dna.colors.door, {
    capFlareFrac: 1.7,
  });
  addMushroomGills(g, faeCapTopY(h) - h * 0.06, faeCapRimRadius(fp.w * 0.6, fp.d * 0.6) * 0.85, mat(dna.colors.trim, { roughness: 0.7 }), 10);
  const petalMat = mat(dna.colors.trim, { roughness: 0.6, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const petal = addMesh(g, new THREE.CircleGeometry(0.12, 6), petalMat, Math.cos(ang) * fp.w * 0.4, 0.05, Math.sin(ang) * fp.d * 0.4);
    petal.rotation.x = -Math.PI / 2;
  }
  const fireflyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff4a0'), emissive: new THREE.Color('#ffe060'), emissiveIntensity: 1.0 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.SphereGeometry(0.04, 6, 6), fireflyMat, (r() - 0.5) * fp.w, h * 0.7 + r() * 0.3, (r() - 0.5) * fp.d);
  }
  return g;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const FACTION_BUILDING_VARIANTS: Partial<Record<Faction, Partial<Record<BuildingKind, (dna: BuildingDNA) => THREE.Group>>>> = {
  vulperia: {
    villa:    buildVulperiaVilla,
    chapel:   buildVulperiaChapel,
    shop:     buildVulperiaShop,
    // See elven's `house`/`terraced` comment above for why these two
    // extra WARD_TO_KIND-driven kinds matter — same fix applied here.
    house:    buildVulperiaVilla,
    terraced: buildVulperiaVilla,
    // Phase 2b increment 3: `inn` (inn ward) and `blacksmith` (smithy
    // ward) are the two remaining WARD_TO_KIND-driven kinds that had no
    // faction override at all (fell through to the generic default
    // builder even here). Reusing the villa builder is safe — it derives
    // its footprint dynamically from getFootprint(dna.buildingKind,
    // dna.size), so it scales correctly to inn's larger lot and
    // blacksmith's medium lot rather than assuming villa's fixed size.
    inn:        buildVulperiaVilla,
    blacksmith: buildVulperiaVilla,
  },
  slime: {
    villa:  buildSlimeVilla,
    chapel: buildSlimeChapel,
    shop:   buildSlimeShop,
    // Phase 2b increment 3: house/terraced/inn/blacksmith previously had
    // no slime override at all — every ordinary house, row house, inn,
    // and smithy in a slime settlement fell through to the generic
    // default builder, so most of the settlement had no slime identity.
    // buildSlimeVilla is footprint-dynamic (getFootprint(dna.
    // buildingKind, dna.size)), so reuse is safe across all four kinds.
    house:      buildSlimeVilla,
    terraced:   buildSlimeVilla,
    inn:        buildSlimeVilla,
    blacksmith: buildSlimeVilla,
  },
  undead_common: {
    villa:  buildUndeadVilla,
    chapel: buildUndeadChapel,
    shop:   buildUndeadShop,
    // Phase 2b increment 3: same gap as slime above.
    house:      buildUndeadVilla,
    terraced:   buildUndeadVilla,
    inn:        buildUndeadVilla,
    blacksmith: buildUndeadVilla,
  },
  elven: {
    villa:    buildElvenVilla,
    chapel:   buildElvenChapel,
    shop:     buildElvenShop,
    // `house` (gateward/farm wards) and `terraced` (slum ward) are real
    // BuildingKinds produced by WARD_TO_KIND (src/buildingToDungeonPlan.ts)
    // — every settlement's farm/gateward/slum buildings use them, so
    // without an override here they fell through to the generic default
    // builder and only got elven's STYLE_COLORS palette (pale sage walls/
    // roof tint), not elven geometry. Reusing buildElvenVilla is safe:
    // it derives its footprint from `dna.buildingKind`/`dna.size`
    // dynamically (via getFootprint()), so it scales correctly to these
    // smaller kinds rather than assuming villa's fixed 7x5.
    house:    buildElvenVilla,
    terraced: buildElvenVilla,
    // Phase 2b increment 3: inn/blacksmith had no elven override either.
    inn:        buildElvenVilla,
    blacksmith: buildElvenVilla,
    // Phase 6 POC (docs/superpowers/specs/
    // 2026-09-02-elven-stone-tower-kit-design.md): watchtower/tower had
    // NO elven override at all (fell through to the generic square
    // box-stacked builder, purely a safety choice for this POC -- no
    // existing elven look to risk regressing). The new octagon-
    // cross-section stone-tower kit (hybrid stone + living-tree
    // architecture, "brick-by-brick" real geometry per the user's
    // explicit preference) lands here first, before any other elven
    // kind, as the proof-of-concept for the same technique applied
    // race-by-race in future rounds.
    watchtower: buildElvenStoneTower,
    tower:      buildElvenStoneTower,
  },
  dwarven: {
    villa:    buildDwarvenVilla,
    chapel:   buildDwarvenChapel,
    shop:     buildDwarvenShop,
    // See elven's `house`/`terraced` comment above for why these two
    // extra WARD_TO_KIND-driven kinds matter — same fix applied here.
    house:    buildDwarvenVilla,
    terraced: buildDwarvenVilla,
    // Phase 2b increment 3: inn/blacksmith had no dwarven override either.
    inn:        buildDwarvenVilla,
    blacksmith: buildDwarvenVilla,
  },
  orcish: {
    villa:  buildOrcishVilla,
    chapel: buildOrcishChapel,
    shop:   buildOrcishShop,
    // Phase 2b increment 3: same gap as slime/undead above.
    house:      buildOrcishVilla,
    terraced:   buildOrcishVilla,
    inn:        buildOrcishVilla,
    blacksmith: buildOrcishVilla,
  },
  vampire: {
    villa:  buildVampireVilla,
    chapel: buildVampireChapel,
    shop:   buildVampireShop,
    // Phase 2b increment 3: same gap as slime/undead above.
    house:      buildVampireVilla,
    terraced:   buildVampireVilla,
    inn:        buildVampireVilla,
    blacksmith: buildVampireVilla,
  },
  fae: {
    villa:  buildFaeVilla,
    chapel: buildFaeChapel,
    shop:   buildFaeShop,
    // Phase 2b increment 3: same gap as slime/undead above.
    house:      buildFaeVilla,
    terraced:   buildFaeVilla,
    inn:        buildFaeVilla,
    blacksmith: buildFaeVilla,
  },
};

/** Look up a bespoke faction-building variant builder, if one exists. */
export function getFactionBuildingVariant(faction: Faction | undefined, kind: BuildingKind): ((dna: BuildingDNA) => THREE.Group) | null {
  if (!faction) return null;
  return FACTION_BUILDING_VARIANTS[faction]?.[kind] ?? null;
}
