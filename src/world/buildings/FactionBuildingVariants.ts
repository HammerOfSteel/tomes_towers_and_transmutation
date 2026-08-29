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
 * This pass covers the three highest-visibility "signature" ward kinds —
 * patriciate (villa), church (chapel), market (shop) — for the three most
 * geometrically-extreme factions called out by the user: vulperia (earthen
 * burrow/den, no flat walls), slime (translucent gelatinous blob, no walls
 * at all), undead (bone/crypt ossuary architecture). Other factions keep
 * using the shared-shape + style-overlay system (already gives elven,
 * dwarven, vampiric, gothic, nordic, fae, orcish, nomadic *some* geometric
 * distinction — see BuildingBuilder.ts's applyStyleOverlay()) until a
 * follow-up pass extends bespoke variants to them too.
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
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

// ── Vulperia — earthen burrow/den architecture ───────────────────────────────
// Fox Den (patriciate), Den Mother's Hall (church), Night Market (market):
// dug-in earthen mounds with round doorways, no flat walls, timber props,
// tinker-scrap decoration, fur/pelt drapes, string lanterns.

function vulperiaMound(dna: BuildingDNA, w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE41);
  const earthMat = mat(dna.colors.walls, { roughness: 0.98 });
  const thatchMat = mat(dna.colors.roof, { roughness: 0.95 });

  // Main mound: squashed sphere sunk halfway into the ground.
  const mound = addMesh(g, new THREE.SphereGeometry(Math.max(w, d) / 2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), earthMat, 0, 0, 0);
  mound.scale.set(1, h / (Math.max(w, d) / 2) * 0.9, 1);

  // Grass/thatch cap tuft.
  addMesh(g, new THREE.ConeGeometry(Math.max(w, d) * 0.22, 0.5, 8), thatchMat, 0, h + 0.1, 0);

  // Round doorway.
  addDoorway(g, Math.min(w, d) * 0.42, h * 0.55, d / 2 - 0.05, dna.colors.door);

  // Timber support beams flanking the door (den entrance frame).
  const beamMat = mat(dna.colors.trim, { roughness: 0.9 });
  for (const bx of [-Math.min(w, d) * 0.3, Math.min(w, d) * 0.3]) {
    addMesh(g, new THREE.CylinderGeometry(0.08, 0.1, h * 0.6, 6), beamMat, bx, h * 0.3, d / 2 - 0.05);
  }

  // Fox-tail banner on a pole beside the entrance.
  const poleMat = mat('#5a4020', { roughness: 0.85 });
  const pole = addMesh(g, new THREE.CylinderGeometry(0.05, 0.05, h * 0.9, 6), poleMat, w / 2 + 0.15, h * 0.45, d / 2 - 0.3);
  const bannerMat = mat(dna.colors.trim, { roughness: 0.7, side: THREE.DoubleSide });
  addMesh(g, new THREE.ConeGeometry(0.14, 0.5, 6), bannerMat, w / 2 + 0.15, h * 0.75, d / 2 - 0.3);
  void pole;

  // Tinker-scrap: small crate + barrel clutter typical of a den market/hall.
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
  const g = vulperiaMound(dna, fp.w, fp.d, h);
  // Fox Den (seat of the settlement's leader): a second, smaller side mound.
  const r = mulberry32(dna.seed ^ 0x5011_DE42);
  const sideMat = mat(dna.colors.walls, { roughness: 0.98 });
  const sideR = Math.min(fp.w, fp.d) * 0.28;
  addMesh(g, new THREE.SphereGeometry(sideR, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), sideMat, fp.w / 2 + sideR * 0.5, 0, -fp.d * 0.2 + r() * 0.2)
    .scale.set(1, 0.8, 1);
  return g;
}

function buildVulperiaChapel(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * Math.max(1, dna.floors) * 0.9;
  const g = vulperiaMound(dna, fp.w, fp.d * 0.6, h);
  // Den Mother's Hall: flanking smaller burrow-pups either side of the main mound.
  const pupMat = mat(dna.colors.walls, { roughness: 0.98 });
  const pupR = Math.min(fp.w, fp.d) * 0.18;
  for (const px of [-fp.w * 0.42, fp.w * 0.42]) {
    addMesh(g, new THREE.SphereGeometry(pupR, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), pupMat, px, 0, fp.d * 0.15)
      .scale.set(1, 0.7, 1);
  }
  return g;
}

function buildVulperiaShop(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const h = FLOOR_HEIGHT * 0.55;
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0x5011_DE43);
  // Night Market den-mouth stall: low mound base with a canvas awning.
  const earthMat = mat(dna.colors.walls, { roughness: 0.98 });
  addMesh(g, new THREE.SphereGeometry(Math.max(fp.w, fp.d) / 2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), earthMat, 0, 0, -fp.d * 0.15)
    .scale.set(1, h / (Math.max(fp.w, fp.d) / 2), 1);
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

function buildUndeadVilla(dna: BuildingDNA): THREE.Group {
  const fp = getFootprint(dna.buildingKind, dna.size);
  const g = new THREE.Group();
  const r = mulberry32(dna.seed ^ 0xDEAD_B011);
  const stoneMat = mat(dna.colors.walls, { roughness: 0.98 });
  const w = Math.min(fp.w, fp.d) * 0.7;
  const h = FLOOR_HEIGHT * Math.max(2, dna.floors) * 1.6; // gaunt and tall

  // Tapered spire body (narrower at top — cylinder w/ shrinking radius via cone approximation).
  addMesh(g, new THREE.CylinderGeometry(w * 0.32, w * 0.5, h, 8), stoneMat, 0, h / 2, 0);
  // Jagged broken-crenellation crown.
  const crownMat = mat(dna.colors.trim, { roughness: 0.95 });
  const nCren = 6;
  for (let i = 0; i < nCren; i++) {
    const ang = (i / nCren) * Math.PI * 2;
    const rad = w * 0.3;
    const ch = 0.3 + r() * 0.4;
    addMesh(g, new THREE.BoxGeometry(0.18, ch, 0.18), crownMat, Math.cos(ang) * rad, h + ch / 2, Math.sin(ang) * rad);
  }
  // Floating dark orb near the top (lich's power source).
  const orbMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1050'), emissive: new THREE.Color('#8020c0'), emissiveIntensity: 0.8, roughness: 0.3 });
  addMesh(g, new THREE.IcosahedronGeometry(0.28, 1), orbMat, 0, h * 0.85, 0);
  // Narrow arrow-slit windows.
  const slitMat = mat('#0a0a10', { roughness: 0.9 });
  for (let fl = 0; fl < 3; fl++) {
    addMesh(g, new THREE.BoxGeometry(0.1, 0.5, 0.05), slitMat, 0, h * (0.25 + fl * 0.2), w * 0.32 + 0.02);
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
};

/** Look up a bespoke faction-building variant builder, if one exists. */
export function getFactionBuildingVariant(faction: Faction | undefined, kind: BuildingKind): ((dna: BuildingDNA) => THREE.Group) | null {
  if (!faction) return null;
  return FACTION_BUILDING_VARIANTS[faction]?.[kind] ?? null;
}
