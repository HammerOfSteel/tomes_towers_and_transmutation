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
import { createNoise2D } from '@/core/SimplexNoise';
import type { BuildingDNA, BuildingKind, Faction } from './BuildingDNA';
import { getFootprint, FLOOR_HEIGHT } from './BuildingDNA';

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

/** Dark inset disc/box standing in for a doorway opening (interior is generated separately). */
function addDoorway(g: THREE.Group, w: number, h: number, z: number, doorColor: string): void {
  const dm = mat(doorColor, { roughness: 0.9 });
  addMesh(g, new THREE.CylinderGeometry(w / 2, w / 2, h, 10, 1, false, 0, Math.PI), dm, 0, h / 2, z, Math.PI / 2)
    .scale.set(1, 1, 0.35);
}

// ── Organic-mound / round-door prop kit ──────────────────────────────────────
// Shared by any faction whose architecture is a dug-in earthen bank rather
// than a walled structure (currently vulperia). A plain half-sphere reads as
// "a blob with a roof thing", not a den — noise-perturbing the silhouette and
// layering real props (round door+frame+handle, port-hole windows, chimney,
// grass cap, garden clutter) is what actually sells "hobbit-hole" / "fox den".

/**
 * A hemispherical earthen mound whose silhouette is perturbed by angular
 * simplex noise (fades to 0 at the grounded base and at the crown so it
 * stays grounded and smoothly rounded, with lumpy irregularity in between),
 * instead of a perfectly spherical dome. Non-uniformly scaled to fit a
 * `w x d` footprint at height `h`. Added directly to `g` at local (cx, cz).
 */
function addOrganicMound(
  g: THREE.Group,
  seed: number,
  w: number, d: number, h: number,
  material: THREE.Material,
  cx = 0, cz = 0,
  jitter = 0.16,
): THREE.Mesh {
  const maxR = Math.max(w, d) / 2;
  const geo = new THREE.SphereGeometry(maxR, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const noise2D = createNoise2D(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const heightRatio = THREE.MathUtils.clamp(v.y / maxR, 0, 1);
    const angle = Math.atan2(v.z, v.x);
    const n = noise2D(Math.cos(angle) * 1.6, Math.sin(angle) * 1.6) * 0.6
            + noise2D(Math.cos(angle) * 3.7 + 41, Math.sin(angle) * 3.7 + 41) * 0.4;
    // 0 at the grounded base and at the very crown, peaks mid-height — keeps
    // the mound flush with the ground and smoothly rounded on top while
    // still reading as an irregular, hand-dug bank in the middle.
    const envelope = Math.sin(heightRatio * Math.PI);
    const radialScale = 1 + n * jitter * envelope;
    v.x *= radialScale;
    v.z *= radialScale;
    v.y *= 1 + n * 0.05 * envelope;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.set(w / (2 * maxR), h / maxR, d / (2 * maxR));
  mesh.position.set(cx, 0, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

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
function addRoundDoor(g: THREE.Group, cx: number, doorY: number, cz: number, dna: BuildingDNA, radius = 0.55): void {
  const frameMat = mat(dna.colors.trim, { roughness: 0.85 });
  const doorMat = mat(dna.colors.door, { roughness: 0.7 });
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
function addRoundWindow(g: THREE.Group, cx: number, cy: number, cz: number, dna: BuildingDNA, lit: boolean, radius = 0.22): void {
  const frameMat = mat(dna.colors.trim, { roughness: 0.85 });
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
// dug-in earthen mounds, hobbit-hole-style — noise-lumped banks (not perfect
// spheres), a real round timber door dug into the front with a proud frame,
// handle and stone step, port-hole windows either side, a chimney stack,
// a grassy/wildflower crown, and dooryard clutter (fence, planter, crates).

function vulperiaMound(dna: BuildingDNA, w: number, d: number, h: number, opts: { chimney?: boolean; garden?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE41);
  const earthMat = mat(dna.colors.walls, { roughness: 0.98 });

  addOrganicMound(g, dna.seed ^ 0x5011_DE40, w, d, h, earthMat);

  // Round timber-framed door dug into the front of the bank.
  const doorR = Math.min(w, d) * 0.24;
  const doorY = doorR * 1.05;
  addRoundDoor(g, 0, doorY, d / 2 - 0.08, dna, doorR);

  // Small round port-hole windows flanking the door.
  const lit = (dna.seed & 1) === 0;
  for (const wx of [-w * 0.3, w * 0.3]) {
    addRoundWindow(g, wx, h * 0.6, d / 2 - 0.1, dna, lit, Math.min(w, d) * 0.1);
  }

  // Timber lintel beam over the door.
  const beamMat = mat(dna.colors.trim, { roughness: 0.9 });
  addMesh(g, new THREE.BoxGeometry(doorR * 2.3, 0.1, 0.16), beamMat, 0, doorY + doorR * 1.15, d / 2 - 0.02);

  // Fox-tail banner on a pole beside the entrance.
  const poleMat = mat('#5a4020', { roughness: 0.85 });
  addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, h * 0.9, 6), poleMat, w / 2 + 0.15, h * 0.45, d / 2 - 0.3);
  const bannerMat = mat(dna.colors.trim, { roughness: 0.7, side: THREE.DoubleSide });
  addMesh(g, new THREE.ConeGeometry(0.14, 0.5, 6), bannerMat, w / 2 + 0.15, h * 0.75, d / 2 - 0.3);

  // Grass cap + wildflowers over the mound crown.
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
  const sideMat = mat(dna.colors.walls, { roughness: 0.98 });
  const sideSize = Math.min(fp.w, fp.d) * 0.56;
  const sideCx = fp.w / 2 + sideSize * 0.3, sideCz = -fp.d * 0.15 + r() * 0.2;
  addOrganicMound(g, dna.seed ^ 0x5011_DE45, sideSize, sideSize, sideSize * 0.42, sideMat, sideCx, sideCz, 0.14);
  return g;
}

function buildVulperiaChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.9;
  const g = vulperiaMound(dna, fp.w, fp.d * 0.6, h, { chimney: false, garden: false });
  // Den Mother's Hall: flanking smaller burrow-pups either side of the main mound.
  const pupMat = mat(dna.colors.walls, { roughness: 0.98 });
  const pupSize = Math.min(fp.w, fp.d) * 0.36;
  let pupSeed = 0x5011_DE46;
  for (const px of [-fp.w * 0.42, fp.w * 0.42]) {
    addOrganicMound(g, dna.seed ^ pupSeed, pupSize, pupSize, pupSize * 0.4, pupMat, px, fp.d * 0.15, 0.14);
    pupSeed += 1;
  }
  return g;
}

function buildVulperiaShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.55;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE43);
  // Night Market den-mouth stall: low earthen mound base with a canvas awning.
  const earthMat = mat(dna.colors.walls, { roughness: 0.98 });
  addOrganicMound(g, dna.seed ^ 0x5011_DE47, Math.max(fp.w, fp.d), Math.max(fp.w, fp.d), h, earthMat, 0, -fp.d * 0.15, 0.14);
  const awningMat = mat(dna.colors.roof, { roughness: 0.8, side: THREE.DoubleSide });
  addMesh(g, new THREE.ConeGeometry(fp.w * 0.55, 0.6, 4), awningMat, 0, h + 0.05, fp.d * 0.25, Math.PI / 4);
  // Counter/table + hanging pelts + string lanterns.
  const woodMat = mat('#6a4a28', { roughness: 0.9 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.7, 0.4, 0.4), woodMat, 0, 0.2, fp.d * 0.35);
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
// rather than a house.

/**
 * A single tapered stone tier with a noise-crumbled surface (weathered,
 * ancient masonry) instead of a perfectly smooth cone/cylinder taper.
 * Stacking a few of these with shrinking radii reads as a real tiered
 * tower built from distinct stone courses, not one smooth primitive.
 */
function addWeatheredTier(g: THREE.Group, seed: number, baseY: number, radiusBottom: number, radiusTop: number, tierH: number, material: THREE.Material, jitter = 0.07): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, tierH, 10, 3);
  const noise2D = createNoise2D(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const angle = Math.atan2(v.z, v.x);
    const heightRatio = THREE.MathUtils.clamp((v.y + tierH / 2) / tierH, 0, 1);
    const n = noise2D(Math.cos(angle) * 2.5, Math.sin(angle) * 2.5 + heightRatio * 3);
    const radialScale = 1 + n * jitter;
    v.x *= radialScale;
    v.z *= radialScale;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, baseY + tierH / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * A carved gothic archway built from small voussoir-like stone blocks
 * (never a flat torus/ring — this is only a half-circle arch, but the
 * same "many small solid pieces" principle keeps it robust from any
 * angle), with straight door jambs and a dark recessed doorway panel.
 * A proper carved crypt entrance instead of a flat doorway disc.
 */
function addStoneArchDoorway(g: THREE.Group, cx: number, cz: number, doorW: number, doorH: number, material: THREE.Material): void {
  const archR = doorW / 2;
  const voussoirs = 7;
  for (let i = 0; i <= voussoirs; i++) {
    const ang = (i / voussoirs) * Math.PI; // 0 (right springer) .. PI (left springer)
    const seg = new THREE.Mesh(new THREE.BoxGeometry(archR * 0.32, archR * 0.34, archR * 0.3), material);
    seg.position.set(cx + Math.cos(ang) * archR, doorH + Math.sin(ang) * archR, cz);
    seg.rotation.z = ang;
    seg.castShadow = true;
    g.add(seg);
  }
  // Straight door jambs below the springline.
  for (const side of [-1, 1]) {
    addMesh(g, new THREE.BoxGeometry(archR * 0.3, doorH, archR * 0.3), material, cx + side * archR, doorH / 2, cz);
  }
  // Dark recessed doorway opening.
  const voidMat = mat('#0a0a0c', { roughness: 1 });
  addMesh(g, new THREE.BoxGeometry(doorW * 0.72, doorH * 0.96, 0.08), voidMat, cx, doorH * 0.5, cz + 0.03);
}

function buildUndeadVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B011);
  const stoneMat = mat(dna.colors.walls, { roughness: 0.98 });
  const w = Math.min(fp.w, fp.d) * 0.7;
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.6; // gaunt and tall

  // Weathered stone spire built from three genuinely distinct tapering
  // tiers (a real tiered tower of stone courses), not one smooth primitive.
  const tier1H = h * 0.42, tier2H = h * 0.34, tier3H = h * 0.24;
  let y = 0;
  addWeatheredTier(g, dna.seed ^ 0xDEAD_1001, y, w * 0.5, w * 0.42, tier1H, stoneMat); y += tier1H;
  addWeatheredTier(g, dna.seed ^ 0xDEAD_1002, y, w * 0.42, w * 0.36, tier2H, stoneMat); y += tier2H;
  addWeatheredTier(g, dna.seed ^ 0xDEAD_1003, y, w * 0.36, w * 0.3, tier3H, stoneMat); y += tier3H;

  // Jagged broken-crenellation crown.
  const crownMat = mat(dna.colors.trim, { roughness: 0.95 });
  const nCren = 6;
  for (let i = 0; i < nCren; i++) {
    const ang = (i / nCren) * Math.PI * 2;
    const rad = w * 0.28;
    const ch = 0.3 + r() * 0.4;
    addMesh(g, new THREE.BoxGeometry(0.18, ch, 0.18), crownMat, Math.cos(ang) * rad, h + ch / 2, Math.sin(ang) * rad);
  }
  // Floating dark orb near the top (lich's power source).
  const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1050'), emissive: new THREE.Color('#8020c0'), emissiveIntensity: 0.8, roughness: 0.3 });
  addMesh(g, new THREE.IcosahedronGeometry(0.28, 1), orbMat, 0, h * 0.85, 0);
  // Narrow arrow-slit windows.
  const slitMat = mat('#0a0a10', { roughness: 0.9 });
  for (let fl = 0; fl < 3; fl++) {
    addMesh(g, new THREE.BoxGeometry(0.1, 0.5, 0.05), slitMat, 0, h * (0.25 + fl * 0.2), w * 0.36 + 0.02);
  }
  // Gothic arch doorway carved from stone voussoirs, flanked by bone ribs.
  const doorW = w * 0.5, doorH = h * 0.18;
  addStoneArchDoorway(g, 0, w * 0.5 - 0.02, doorW, doorH, mat(dna.colors.trim, { roughness: 0.95 }));
  const ribMat = mat('#d8d0b8', { roughness: 0.92 });
  for (const side of [-1, 1]) {
    const rib = addMesh(g, new THREE.CylinderGeometry(0.04, 0.07, doorH * 1.3, 5), ribMat, side * doorW * 0.4, doorH * 0.6, w * 0.5 + 0.05);
    rib.rotation.z = side * 0.18;
  }
  // Fallen rubble blocks scattered at the base (decay storytelling).
  const rubbleMat = mat(dna.colors.walls, { roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const ang = r() * Math.PI * 2;
    const rad = w * 0.6 + r() * 0.4;
    addMesh(g, new THREE.BoxGeometry(0.2 + r() * 0.15, 0.15 + r() * 0.1, 0.2 + r() * 0.15), rubbleMat, Math.cos(ang) * rad, 0.1, Math.sin(ang) * rad, r() * Math.PI);
  }
  return g;
}

function buildUndeadChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B012);
  const boneMat = mat('#d8d0b8', { roughness: 0.92 });
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.1;

  // Ribcage-arch entrance: paired tapered "rib" struts curving inward.
  const nRibs = 5;
  for (let i = 0; i < nRibs; i++) {
    const t = i / (nRibs - 1);
    const zOff = fp.d / 2 - 0.3;
    for (const side of [-1, 1]) {
      const rib = addMesh(g, new THREE.CylinderGeometry(0.05, 0.1, h * 0.9, 5), boneMat,
        side * (fp.w * 0.45 - t * fp.w * 0.15), h * 0.45, zOff);
      rib.rotation.z = side * (0.15 + t * 0.25);
    }
  }
  // Bone altar slab at the rear.
  const altarMat = mat(dna.colors.walls, { roughness: 0.95 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.5, 0.5, fp.d * 0.3), altarMat, 0, 0.25, -fp.d * 0.3);
  // Skulls-on-posts flanking the altar.
  const skullMat = mat('#e8e0c8', { roughness: 0.85 });
  for (const sx of [-fp.w * 0.32, fp.w * 0.32]) {
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), mat('#3a3028'), sx, 0.45, -fp.d * 0.25);
    addMesh(g, new THREE.SphereGeometry(0.16, 8, 6), skullMat, sx, 0.95, -fp.d * 0.25);
  }
  // Candle sconces (small glowing orange dots) along the sides.
  const candleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0a040'), emissive: new THREE.Color('#f0a040'), emissiveIntensity: 0.7 });
  for (let i = 0; i < 4; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05, 6, 6), candleMat, (r() - 0.5) * fp.w * 0.8, 0.7 + r() * 0.3, (r() - 0.5) * fp.d * 0.5);
  }
  return g;
}

function buildUndeadShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B013);
  const boneMat = mat('#d8d0b8', { roughness: 0.92 });
  const h = FLOOR_HEIGHT * 0.6;
  // Wraith Bazaar: a bone-strut stall frame with a tattered cloth canopy.
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
  // Counter with tattered goods.
  const woodMat = mat('#4a4038', { roughness: 0.9 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.6, 0.4, 0.35), woodMat, 0, 0.2, fp.d * 0.3);
  return g;
}

// ── Elven — living-tree architecture ──────────────────────────────────────────
// Elder's Hall (patriciate), Ancient Shrine (church), Moonlit Exchange (market):
// organic curved trunk silhouettes, woven-vine walls, leaf-canopy roofs, elevated
// platforms — a village grown from trees, not built with lumber.

/**
 * A canopy built from a cluster of overlapping foliage blobs around a
 * larger central crown blob — real individual leaf clusters, not one
 * smooth dome standing in for an entire tree canopy.
 */
function addLeafCanopyCluster(g: THREE.Group, seed: number, apexY: number, canopyR: number, material: THREE.Material, blobCount = 6): void {
  const r = mulberry32(seed);
  addMesh(g, new THREE.SphereGeometry(canopyR * 0.55, 10, 8), material, 0, apexY + canopyR * 0.3, 0);
  for (let i = 0; i < blobCount; i++) {
    const ang = (i / blobCount) * Math.PI * 2 + r() * 0.3;
    const rad = canopyR * (0.35 + r() * 0.25);
    const blobR = canopyR * (0.45 + r() * 0.25);
    addMesh(g, new THREE.SphereGeometry(blobR, 10, 8), material, Math.cos(ang) * rad, apexY + blobR * (0.15 + r() * 0.2), Math.sin(ang) * rad);
  }
}

function elvenTrunk(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xE1F3_0001);
  const barkMat = mat(dna.colors.walls, { roughness: 0.9 });
  const canopyMat = mat(dna.colors.roof, { roughness: 0.75 });

  // Gnarled living trunk — a noise-crumbled bark surface (reusing the same
  // technique as undead's weathered stone tiers), not a perfectly smooth
  // tapered cylinder.
  addWeatheredTier(g, dna.seed ^ 0xE1F3_0010, 0, Math.min(w, d) * 0.42, Math.min(w, d) * 0.32, h, barkMat, 0.13);

  // Root buttresses flaring out at the base.
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + r() * 0.3;
    const rad = Math.min(w, d) * 0.4;
    const root = addMesh(g, new THREE.CylinderGeometry(0.06, 0.14, 0.5, 6), barkMat, Math.cos(ang) * rad, 0.25, Math.sin(ang) * rad);
    root.rotation.z = Math.cos(ang) * 0.4;
    root.rotation.x = Math.sin(ang) * 0.4;
  }

  // Leafy canopy built from a cluster of foliage blobs, not one smooth dome.
  addLeafCanopyCluster(g, dna.seed ^ 0xE1F3_0011, h, Math.max(w, d) * 0.6, canopyMat, 6);

  // Round doorway carved into the trunk, framed by a natural root archway
  // (curved root-like segments arcing overhead — the same "many small
  // solid pieces, never one flat primitive" principle as the other
  // factions' round-prop/archway kits, but organic rather than blocky).
  addDoorway(g, Math.min(w, d) * 0.4, h * 0.5, d / 2 - 0.05, dna.colors.door);
  const archR = Math.min(w, d) * 0.28;
  const archSegs = 5;
  for (let i = 0; i <= archSegs; i++) {
    const ang = (i / archSegs) * Math.PI;
    const seg = addMesh(g, new THREE.CylinderGeometry(0.045, 0.07, archR * 0.55, 5), barkMat,
      Math.cos(ang) * archR, h * 0.5 + Math.sin(ang) * archR, d / 2 + 0.02);
    seg.rotation.z = ang;
  }

  // Hanging vine tendrils drooping from the canopy.
  const vineMat = mat('#4a7a3a', { roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const ang = r() * Math.PI * 2;
    const rad = Math.max(w, d) * 0.3;
    const len = 0.4 + r() * 0.5;
    addMesh(g, new THREE.CylinderGeometry(0.02, 0.03, len, 5), vineMat, Math.cos(ang) * rad, h - len / 2 + 0.1, Math.sin(ang) * rad);
  }

  // Glowing moonlit lantern-vines hanging from the canopy.
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.7, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    addMesh(g, new THREE.SphereGeometry(0.06, 6, 6), glowMat, Math.cos(ang) * w * 0.4, h * 0.85, Math.sin(ang) * d * 0.4);
  }
  return g;
}

function buildElvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.3; // tall, reaching into canopy
  const g = elvenTrunk(dna, fp.w, fp.d, h);
  // Elder's Hall: a spiral wooden platform/balcony ringing the upper trunk.
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  const platform = addMesh(g, new THREE.TorusGeometry(Math.min(fp.w, fp.d) * 0.45, 0.08, 6, 16), woodMat, 0, h * 0.6, 0);
  platform.rotation.x = Math.PI / 2;
  return g;
}

function buildElvenChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xE1F3_0002);
  // Ancient Shrine: a ring of standing tree-stones around a central glowing crystal.
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
  const h = FLOOR_HEIGHT * 0.6;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xE1F3_0003);
  // Moonlit Exchange: a raised wooden platform stall beneath a small tree.
  const woodMat = mat(dna.colors.trim, { roughness: 0.85 });
  addMesh(g, new THREE.CylinderGeometry(0.1, 0.14, h, 8), woodMat, 0, h / 2, 0);
  addMesh(g, new THREE.BoxGeometry(fp.w, 0.12, fp.d), woodMat, 0, h, 0);
  const leafMat = mat(dna.colors.roof, { roughness: 0.75 });
  addLeafCanopyCluster(g, dna.seed ^ 0xE1F3_0012, h + 0.3, fp.w * 0.42, leafMat, 4);
  // Hanging glow-motes typical of a moonlit night market.
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c0f0ff'), emissive: new THREE.Color('#80e0ff'), emissiveIntensity: 0.8 });
  for (let i = 0; i < 4; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05 + r() * 0.02, 6, 6), glowMat, (r() - 0.5) * fp.w, h + 0.1, (r() - 0.5) * fp.d);
  }
  return g;
}

// ── Dwarven — carved-stone mountain architecture ──────────────────────────────
// Guild Hall (patriciate), Stone Temple (church), Trade Vault (market):
// squat, heavy, blocky stone construction with carved geometric bands, thick
// pillars, and iron-banded vault doors — built to endure, not to charm.

/**
 * A stack of horizontal stone "courses" (slabs), each progressively
 * inset very slightly going up — real coursed dwarven masonry (built to
 * look carved from a mountain, tapering subtly like a ziggurat) with a
 * visible seam between every course, and a heavy corniced cap slab
 * finishing the roofline. Replaces a single smooth box standing in for
 * an entire wall+roof.
 */
function addStoneCourses(g: THREE.Group, w: number, d: number, h: number, material: THREE.Material, courses = 4, cz = 0): void {
  const courseH = h / courses;
  for (let i = 0; i < courses; i++) {
    const inset = i * 0.025;
    addMesh(g, new THREE.BoxGeometry(w - inset * 2, courseH * 0.92, d - inset * 2), material, 0, courseH * i + courseH / 2, cz);
  }
  // Heavy corniced cap, overhanging slightly past the top course — a real
  // roofline rather than an abrupt flat-topped box.
  addMesh(g, new THREE.BoxGeometry(w * 1.1, h * 0.055, d * 1.1), material, 0, h + h * 0.028, cz);
}

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

function dwarvenBlock(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = mat(dna.colors.walls, { roughness: 0.92 });
  const trimMat = mat(dna.colors.trim, { roughness: 0.7, metalness: 0.3 });

  // Coursed stone walls with a heavy corniced roofline — built to look
  // carved from the mountain, not a single smooth box.
  addStoneCourses(g, w, d, h, stoneMat, 4);

  // Carved geometric trim band around the midline.
  addMesh(g, new THREE.BoxGeometry(w + 0.06, 0.18, d + 0.06), trimMat, 0, h * 0.5, 0);
  // Heavy corner pillars with base/capital rings.
  for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]] as [number, number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.16, 0.2, h, 8), stoneMat, px, h / 2, pz);
    addMesh(g, new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), trimMat, px, 0.05, pz);
    addMesh(g, new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), trimMat, px, h - 0.05, pz);
  }
  // Iron-banded vault-style door with a wheel mechanism.
  const doorMat = mat(dna.colors.door, { roughness: 0.6, metalness: 0.4 });
  addMesh(g, new THREE.BoxGeometry(w * 0.32, h * 0.5, 0.1), doorMat, 0, h * 0.28, d / 2 + 0.02);
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.BoxGeometry(w * 0.32, 0.04, 0.11), trimMat, 0, h * (0.15 + i * 0.15), d / 2 + 0.03);
  }
  addVaultWheel(g, 0, h * 0.28, d / 2 + 0.07, Math.min(w, d) * 0.14, trimMat);
  return g;
}

function buildDwarvenVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.75;
  const g = dwarvenBlock(dna, fp.w, fp.d, h);
  // Guild Hall: a raised banner-crest above the entrance and a low chimney-forge stack.
  const bannerMat = mat(dna.colors.trim, { roughness: 0.7, side: THREE.DoubleSide });
  addMesh(g, new THREE.BoxGeometry(0.5, 0.7, 0.04), bannerMat, 0, h + 0.35, fp.d / 2 - 0.2);
  const chimneyMat = mat('#3a3a38', { roughness: 0.9 });
  addMesh(g, new THREE.CylinderGeometry(0.18, 0.22, 0.6, 8), chimneyMat, fp.w * 0.35, h + 0.3, -fp.d * 0.3);
  return g;
}

function buildDwarvenChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.8;
  const g = dwarvenBlock(dna, fp.w * 0.9, fp.d, h);
  // Stone Temple: flanking column pillars either side of the entrance + a brazier.
  const columnMat = mat('#8a8478', { roughness: 0.9 });
  for (const cx of [-fp.w * 0.38, fp.w * 0.38]) {
    addMesh(g, new THREE.CylinderGeometry(0.15, 0.18, h * 1.1, 8), columnMat, cx, h * 0.55, fp.d * 0.42);
  }
  const brazierMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a2818'), emissive: new THREE.Color('#e07020'), emissiveIntensity: 0.7, roughness: 0.6 });
  addMesh(g, new THREE.CylinderGeometry(0.16, 0.1, 0.3, 8), brazierMat, 0, 0.15, fp.d / 2 + 0.4);
  return g;
}

function buildDwarvenShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.6;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xD4A4_0003);
  // Trade Vault: coursed stone front wall with a vault-door wheel mechanism,
  // anvil and ore-crate clutter.
  const stoneMat = mat(dna.colors.walls, { roughness: 0.92 });
  addStoneCourses(g, fp.w, fp.d * 0.6, h, stoneMat, 3, -fp.d * 0.1);
  const doorMat = mat('#6a6858', { roughness: 0.5, metalness: 0.5 });
  addMesh(g, new THREE.CylinderGeometry(fp.w * 0.3, fp.w * 0.3, 0.08, 16), doorMat, 0, h * 0.5, fp.d * 0.2 + 0.05)
    .rotation.x = Math.PI / 2;
  addVaultWheel(g, 0, h * 0.5, fp.d * 0.2 + 0.1, fp.w * 0.16, mat(dna.colors.trim, { roughness: 0.6, metalness: 0.5 }));
  const anvilMat = mat('#2a2a28', { roughness: 0.6, metalness: 0.5 });
  addMesh(g, new THREE.BoxGeometry(0.3, 0.25, 0.15), anvilMat, fp.w * 0.35, 0.13, fp.d * 0.35);
  const crateMat = mat('#7a6040', { roughness: 0.9 });
  for (let i = 0; i < 2; i++) {
    addMesh(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), crateMat, -fp.w * 0.35 + i * 0.15, 0.15, fp.d * 0.4, r() * 0.5);
  }
  return g;
}

// ── Orcish — crude wood/bone/hide tribal architecture ─────────────────────────
// Warlord Hall (patriciate), War Shrine (church), Loot Pile (market):
// lashed-hide longhouses, bone/spike totems, crude scavenged construction.

/**
 * A ring of upright log "stakes" with per-log height/radius jitter — a
 * crude palisade wall, read as a genuinely separate layer from whatever
 * roof sits on top of it. Same "many small solid pieces, never one smooth
 * primitive standing in for a whole feature" principle as the vulperia
 * timber-stave ring: a wall built from real individual logs, not a single
 * tapered cylinder pretending to be a whole hut.
 */
function addPalisadeWall(g: THREE.Group, seed: number, radius: number, wallH: number, material: THREE.Material, count = 16): void {
  const r = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.05;
    const logRad = radius * (0.94 + r() * 0.12);
    const logH = wallH * (0.85 + r() * 0.3);
    const logThickness = radius * 0.1 * (0.8 + r() * 0.4);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(logThickness, logThickness * 1.1, logH, 6), material);
    log.position.set(Math.cos(ang) * logRad, logH / 2, Math.sin(ang) * logRad);
    log.castShadow = true;
    log.receiveShadow = true;
    g.add(log);
  }
}

/**
 * A steep conical hide/thatch roof whose base rim is perturbed by angular
 * simplex noise for a ragged, hand-made silhouette (uneven hide-flap
 * lengths, drooping unevenly), fading out toward the apex which stays
 * tidy — instead of a perfect geometric cone.
 */
function addRoughConeRoof(g: THREE.Group, seed: number, baseY: number, radius: number, roofH: number, material: THREE.Material, jitter = 0.16): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, roofH, 12, 4);
  const noise2D = createNoise2D(seed);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const heightRatio = THREE.MathUtils.clamp((v.y + roofH / 2) / roofH, 0, 1); // 0 at base, 1 at apex
    const angle = Math.atan2(v.z, v.x);
    const n = noise2D(Math.cos(angle) * 2.2, Math.sin(angle) * 2.2);
    const envelope = 1 - heightRatio; // ragged at the base, tidy at the apex
    v.x *= 1 + n * jitter * envelope;
    v.z *= 1 + n * jitter * envelope;
    v.y -= n * jitter * envelope * roofH * 0.25; // uneven flap droop
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(0, baseY + roofH / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function orcishHut(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x0AC1_0001);
  const hideMat = mat(dna.colors.walls, { roughness: 0.92 });
  const woodMat = mat('#4a3a28', { roughness: 0.9 });
  const logMat = mat(dna.colors.trim, { roughness: 0.95 });

  // Wall and roof are two genuinely distinct construction layers (a real
  // log palisade under a separate hide roof), not one tapered cylinder
  // standing in for a whole hut.
  const wallR  = Math.max(w, d) * 0.42;
  const wallH  = h * 0.42;
  const roofBaseY = wallH * 0.9;
  const roofH  = h - roofBaseY;
  addPalisadeWall(g, dna.seed ^ 0x0AC1_0010, wallR, wallH, logMat, 16);
  addRoughConeRoof(g, dna.seed ^ 0x0AC1_0011, roofBaseY, wallR * 1.2, roofH, hideMat);

  // Crossed timber support poles jutting past the roofline (crude, asymmetric).
  for (const ang of [0.4, -0.4, 2.2, -2.2]) {
    const pole = addMesh(g, new THREE.CylinderGeometry(0.05, 0.07, h * 1.15, 5), woodMat, Math.cos(ang) * w * 0.32, h * 0.55, Math.sin(ang) * d * 0.32);
    pole.rotation.z = Math.cos(ang) * 0.25;
  }

  // Crude log door posts + lintel flanking a hide-flap doorway.
  const doorW = Math.min(w, d) * 0.42;
  for (const px of [-doorW * 0.55, doorW * 0.55]) {
    addMesh(g, new THREE.CylinderGeometry(0.07, 0.08, wallH * 0.95, 6), woodMat, px, wallH * 0.48, d / 2 - 0.02);
  }
  addMesh(g, new THREE.BoxGeometry(doorW * 1.3, 0.12, 0.16), woodMat, 0, wallH * 0.92, d / 2 - 0.02);
  addDoorway(g, doorW, wallH * 0.8, d / 2 - 0.05, dna.colors.door);

  // Bone/spike totem clutter around the base.
  const boneMat = mat('#d8d0b8', { roughness: 0.85 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 1.0;
    const rad = wallR + 0.25;
    addMesh(g, new THREE.ConeGeometry(0.04, 0.5 + r() * 0.3, 5), boneMat, Math.cos(ang) * rad, 0.3, Math.sin(ang) * rad);
  }
  return g;
}

function buildOrcishVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.9;
  const g = orcishHut(dna, fp.w, fp.d, h);
  // Warlord Hall: a mounted skull-and-tusk trophy above the entrance.
  const skullMat = mat('#e8dcc0', { roughness: 0.8 });
  addMesh(g, new THREE.SphereGeometry(0.2, 8, 6), skullMat, 0, h * 0.85, fp.d / 2 - 0.1);
  const tuskMat = mat('#f0e8d0', { roughness: 0.6 });
  for (const tx of [-0.12, 0.12]) {
    const tusk = addMesh(g, new THREE.ConeGeometry(0.04, 0.35, 5), tuskMat, tx, h * 0.78, fp.d / 2 - 0.05);
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
  const h = FLOOR_HEIGHT * 0.5;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x0AC1_0003);
  // Loot Pile: a crude tarp-over-poles stall over a heap of plundered crates/weapons.
  const poleMat = mat('#3a2c1a', { roughness: 0.9 });
  for (const [sx, sz] of [[-fp.w / 2, -fp.d / 2], [fp.w / 2, -fp.d / 2], [-fp.w / 2, fp.d / 2], [fp.w / 2, fp.d / 2]] as [number, number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.08, h, 6), poleMat, sx, h / 2, sz);
  }
  const tarpMat = mat(dna.colors.roof, { roughness: 0.9, side: THREE.DoubleSide });
  addMesh(g, new THREE.BoxGeometry(fp.w + 0.1, 0.06, fp.d + 0.1), tarpMat, 0, h, 0);
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

// ── Vampire — gothic castle architecture ──────────────────────────────────────
// Count's Tower (patriciate), Blood Chapel (church), Blood Market (market):
// tall pointed gothic spires, ribbed buttresses, dark stained-glass motifs.

function gothicBase(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = mat(dna.colors.walls, { roughness: 0.7 });
  const trimMat = mat(dna.colors.trim, { roughness: 0.5, metalness: 0.15 });

  addMesh(g, new THREE.BoxGeometry(w * 0.8, h, d * 0.8), stoneMat, 0, h / 2, 0);
  // Ribbed buttresses along each side.
  for (const bx of [-w * 0.42, w * 0.42]) {
    addMesh(g, new THREE.BoxGeometry(0.14, h * 0.95, d * 0.5), trimMat, bx, h * 0.5, 0);
  }
  // Pointed gothic spire roof.
  addMesh(g, new THREE.ConeGeometry(w * 0.5, h * 0.55, 4), trimMat, 0, h + h * 0.27, 0, Math.PI / 4);
  // Dark red stained-glass window motif (rose window disc).
  const glassMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a1020'), emissive: new THREE.Color('#a01830'), emissiveIntensity: 0.5, roughness: 0.3 });
  addMesh(g, new THREE.CircleGeometry(w * 0.18, 12), glassMat, 0, h * 0.7, d * 0.4 + 0.02);
  // Doorway.
  addDoorway(g, w * 0.3, h * 0.4, d * 0.4 - 0.02, dna.colors.door);
  return g;
}

function buildVampireVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.5; // tall, gaunt
  const g = gothicBase(dna, fp.w, fp.d, h);
  // Count's Tower: bat-gargoyle silhouettes on the upper corners + a balcony.
  const gargoyleMat = mat('#2a2020', { roughness: 0.6 });
  for (const gx of [-fp.w * 0.4, fp.w * 0.4]) {
    const gargoyle = addMesh(g, new THREE.ConeGeometry(0.14, 0.3, 4), gargoyleMat, gx, h * 0.9, fp.d * 0.35);
    gargoyle.rotation.x = Math.PI;
  }
  const balconyMat = mat(dna.colors.trim, { roughness: 0.6, metalness: 0.2 });
  addMesh(g, new THREE.BoxGeometry(fp.w * 0.6, 0.08, 0.3), balconyMat, 0, h * 0.55, fp.d * 0.44);
  return g;
}

function buildVampireChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 1.2;
  const g = gothicBase(dna, fp.w, fp.d * 0.85, h);
  // Blood Chapel: twin flanking spirelets + a hovering blood-red orb.
  const trimMat = mat(dna.colors.trim, { roughness: 0.5, metalness: 0.15 });
  for (const sx of [-fp.w * 0.36, fp.w * 0.36]) {
    addMesh(g, new THREE.ConeGeometry(0.18, h * 0.35, 4), trimMat, sx, h + h * 0.15, 0, Math.PI / 4);
  }
  const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a0510'), emissive: new THREE.Color('#c81030'), emissiveIntensity: 0.9, roughness: 0.3 });
  addMesh(g, new THREE.SphereGeometry(0.16, 10, 8), orbMat, 0, h * 0.6, fp.d * 0.44);
  return g;
}

function buildVampireShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.6;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xB100D_0003);
  // Blood Market: a dark iron-framed stall with a blood-red canopy and candelabra.
  const ironMat = mat('#1a1818', { roughness: 0.5, metalness: 0.4 });
  for (const [sx, sz] of [[-fp.w / 2, -fp.d / 2], [fp.w / 2, -fp.d / 2], [-fp.w / 2, fp.d / 2], [fp.w / 2, fp.d / 2]] as [number, number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.05, 0.06, h, 6), ironMat, sx, h / 2, sz);
  }
  const canopyMat = mat('#5a0818', { roughness: 0.6, side: THREE.DoubleSide });
  addMesh(g, new THREE.ConeGeometry(Math.max(fp.w, fp.d) * 0.6, 0.4, 4), canopyMat, 0, h + 0.2, 0, Math.PI / 4);
  const candelabraMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b01828'), emissive: new THREE.Color('#e02840'), emissiveIntensity: 0.8 });
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.SphereGeometry(0.05 + r() * 0.02, 6, 6), candelabraMat, -fp.w * 0.3 + i * fp.w * 0.3, h * 0.6, fp.d * 0.3);
  }
  return g;
}

// ── Fae — whimsical mushroom/flower architecture ──────────────────────────────
// Fae Court (patriciate), Faerie Ring (church), Twilight Market (market):
// oversized glowing-spotted mushroom caps, curling toadstool stems, petals,
// firefly motes — nothing built from stone or timber.

function faeMushroom(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xFA_E00001);
  const stemMat = mat(dna.colors.walls, { roughness: 0.6 });
  const capMat = mat(dna.colors.roof, { roughness: 0.55 });
  const spotMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(dna.colors.trim), emissive: new THREE.Color(dna.colors.trim), emissiveIntensity: 0.6, roughness: 0.4 });

  // Curved, gently tapered toadstool stem.
  addMesh(g, new THREE.CylinderGeometry(Math.min(w, d) * 0.22, Math.min(w, d) * 0.3, h, 10), stemMat, 0, h / 2, 0);
  // Broad mushroom-cap "roof".
  const cap = addMesh(g, new THREE.SphereGeometry(Math.max(w, d) * 0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, 0, h, 0);
  cap.scale.set(1, 0.5, 1);
  // Glowing spots dotting the cap.
  for (let i = 0; i < 5; i++) {
    const ang = r() * Math.PI * 2;
    const rad = r() * Math.max(w, d) * 0.4;
    addMesh(g, new THREE.CircleGeometry(0.06, 8), spotMat, Math.cos(ang) * rad, h + 0.02, Math.sin(ang) * rad)
      .rotation.x = -Math.PI / 2;
  }
  // Round whimsical doorway.
  addDoorway(g, Math.min(w, d) * 0.4, h * 0.5, d / 2 - 0.05, dna.colors.door);
  // Firefly motes drifting near the cap edge.
  const fireflyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff4a0'), emissive: new THREE.Color('#ffe060'), emissiveIntensity: 1.0 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    addMesh(g, new THREE.SphereGeometry(0.04, 6, 6), fireflyMat, Math.cos(ang) * w * 0.5, h * 0.9, Math.sin(ang) * d * 0.5);
  }
  return g;
}

function buildFaeVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.9;
  const g = faeMushroom(dna, fp.w, fp.d, h);
  // Fae Court: a ring of smaller toadstools clustered around the main one.
  const r = mulberry32(dna.seed ^ 0xFA_E00002);
  const smallStemMat = mat(dna.colors.walls, { roughness: 0.6 });
  const smallCapMat = mat(dna.colors.trim, { roughness: 0.55 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + r() * 0.4;
    const rad = fp.w * 0.55;
    const sh = h * 0.35;
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.08, sh, 8), smallStemMat, Math.cos(ang) * rad, sh / 2, Math.sin(ang) * rad);
    addMesh(g, new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), smallCapMat, Math.cos(ang) * rad, sh, Math.sin(ang) * rad)
      .scale.set(1, 0.5, 1);
  }
  return g;
}

function buildFaeChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xFA_E00003);
  // Faerie Ring: a literal ring of glowing toadstools around a mossy center.
  const stemMat = mat(dna.colors.walls, { roughness: 0.6 });
  const capMat = mat(dna.colors.trim, { roughness: 0.5 });
  const nRing = 7;
  for (let i = 0; i < nRing; i++) {
    const ang = (i / nRing) * Math.PI * 2;
    const rad = Math.min(fp.w, fp.d) * 0.42;
    const sh = 0.3 + r() * 0.25;
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.06, sh, 6), stemMat, Math.cos(ang) * rad, sh / 2, Math.sin(ang) * rad);
    addMesh(g, new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, Math.cos(ang) * rad, sh, Math.sin(ang) * rad)
      .scale.set(1, 0.5, 1);
  }
  const glowMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0ffc0'), emissive: new THREE.Color('#a0ff80'), emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.8 });
  addMesh(g, new THREE.TorusGeometry(Math.min(fp.w, fp.d) * 0.3, 0.03, 6, 20), glowMat, 0, 0.03, 0)
    .rotation.x = Math.PI / 2;
  return g;
}

function buildFaeShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.5;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xFA_E00004);
  // Twilight Market: small mushroom stall + petal decorations + fireflies.
  const stemMat = mat(dna.colors.walls, { roughness: 0.6 });
  const capMat = mat(dna.colors.roof, { roughness: 0.5 });
  addMesh(g, new THREE.CylinderGeometry(0.12, 0.16, h, 8), stemMat, 0, h / 2, 0);
  addMesh(g, new THREE.SphereGeometry(fp.w * 0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, 0, h, 0)
    .scale.set(1, 0.45, 1);
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
    villa:  buildVulperiaVilla,
    chapel: buildVulperiaChapel,
    shop:   buildVulperiaShop,
  },
  slime: {
    villa:  buildSlimeVilla,
    chapel: buildSlimeChapel,
    shop:   buildSlimeShop,
  },
  undead_common: {
    villa:  buildUndeadVilla,
    chapel: buildUndeadChapel,
    shop:   buildUndeadShop,
  },
  elven: {
    villa:  buildElvenVilla,
    chapel: buildElvenChapel,
    shop:   buildElvenShop,
  },
  dwarven: {
    villa:  buildDwarvenVilla,
    chapel: buildDwarvenChapel,
    shop:   buildDwarvenShop,
  },
  orcish: {
    villa:  buildOrcishVilla,
    chapel: buildOrcishChapel,
    shop:   buildOrcishShop,
  },
  vampire: {
    villa:  buildVampireVilla,
    chapel: buildVampireChapel,
    shop:   buildVampireShop,
  },
  fae: {
    villa:  buildFaeVilla,
    chapel: buildFaeChapel,
    shop:   buildFaeShop,
  },
};

/** Look up a bespoke faction-building variant builder, if one exists. */
export function getFactionBuildingVariant(faction: Faction | undefined, kind: BuildingKind): ((dna: BuildingDNA) => THREE.Group) | null {
  if (!faction) return null;
  return FACTION_BUILDING_VARIANTS[faction]?.[kind] ?? null;
}
