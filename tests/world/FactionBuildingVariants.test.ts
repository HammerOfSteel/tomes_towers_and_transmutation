/**
 * FactionBuildingVariants.test.ts — Phase 2b of the settlement visual
 * fidelity plan. Verifies faction-specific building variants build without
 * error, are dispatched correctly by buildBuilding(), and are geometrically
 * distinct from both each other and the generic shared-shape fallback.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBuilding } from '@/world/buildings/BuildingBuilder';
import { FACTION_BUILDING_VARIANTS, getFactionBuildingVariant } from '@/world/buildings/FactionBuildingVariants';
import type { BuildingDNA, BuildingKind, Faction } from '@/world/buildings/BuildingDNA';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import { buildVulperiaDenMoundGrid, buildDwarvenHallGrid, buildElvenTrunkGrid, buildVampireSpireGrid, buildFaeStalkGrid, buildOrcishHutGrid, buildUndeadTierGrid, planDwarvenTiers } from '@/world/buildings/FactionBlockProfiles';
import { BLOCK_UNIT, hasBlock, getMaterialKey } from '@/world/buildings/BlockKit';
import { buildElvenChapelShrine } from '@/world/buildings/ElvenChapelKit';

function makeDna(kind: BuildingKind, faction: Faction | undefined, seed = 99): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed,
    buildingKind: kind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['thatched'], rotation: 0,
    terrace: 'none', features: [], faction,
  };
}

function countMeshes(g: THREE.Group): number {
  let n = 0;
  g.traverse(o => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

function findBiggestMesh(g: THREE.Group): THREE.Mesh {
  let biggest: THREE.Mesh | null = null;
  let biggestCount = 0;
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      const count = (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      if (count > biggestCount) { biggestCount = count; biggest = o; }
    }
  });
  expect(biggest).not.toBeNull();
  return biggest!;
}

function expectAllVerticesFinite(g: THREE.Group): void {
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      const attr = o.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.array.length; i++) {
        expect(Number.isFinite(attr.array[i])).toBe(true);
      }
    }
  });
}

describe('FACTION_BUILDING_VARIANTS registry', () => {
  const covered: Array<[Faction, BuildingKind]> = [
    ['vulperia', 'villa'], ['vulperia', 'chapel'], ['vulperia', 'shop'],
    ['slime', 'villa'], ['slime', 'chapel'], ['slime', 'shop'],
    ['undead_common', 'villa'], ['undead_common', 'chapel'], ['undead_common', 'shop'],
    ['elven', 'villa'], ['elven', 'chapel'], ['elven', 'shop'],
    ['dwarven', 'villa'], ['dwarven', 'chapel'], ['dwarven', 'shop'],
    ['orcish', 'villa'], ['orcish', 'chapel'], ['orcish', 'shop'],
    ['vampire', 'villa'], ['vampire', 'chapel'], ['vampire', 'shop'],
    ['fae', 'villa'], ['fae', 'chapel'], ['fae', 'shop'],
  ];

  for (const [faction, kind] of covered) {
    it(`${faction}/${kind} builds a non-empty group without throwing`, () => {
      const builder = getFactionBuildingVariant(faction, kind);
      expect(builder).not.toBeNull();
      const g = builder!(makeDna(kind, faction));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
    });
  }

  it('returns null for an uncovered (faction, kind) pair', () => {
    expect(getFactionBuildingVariant('human_town', 'villa')).toBeNull();
    expect(getFactionBuildingVariant('vulperia', 'watchtower')).toBeNull();
  });

  it('returns null when faction is undefined', () => {
    expect(getFactionBuildingVariant(undefined, 'villa')).toBeNull();
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const a = FACTION_BUILDING_VARIANTS.slime!.villa!(makeDna('villa', 'slime', 42));
    const b = FACTION_BUILDING_VARIANTS.slime!.villa!(makeDna('villa', 'slime', 42));
    expect(countMeshes(a)).toBe(countMeshes(b));
  });

  it('produces geometrically distinct mesh counts across all covered factions for the same kind', () => {
    const counts = new Set(
      (['vulperia', 'slime', 'undead_common', 'elven', 'dwarven', 'orcish', 'vampire', 'fae'] as Faction[]).map(f =>
        countMeshes(FACTION_BUILDING_VARIANTS[f]!.villa!(makeDna('villa', f, 7))),
      ),
    );
    // Not a strict requirement that all eight differ, but they should not
    // all collapse to one identical count (which would suggest they're
    // secretly sharing the same builder).
    expect(counts.size).toBeGreaterThan(1);
  });
});

// Phase 2b increment 3 (settlement visual fidelity plan): the 3 signature
// ward kinds (villa/chapel/shop) only cover a small slice of a real
// settlement. WARD_TO_KIND (buildingToDungeonPlan.ts) also produces
// 'house' (gateward/farm wards), 'terraced' (slum ward), 'inn', and
// 'blacksmith' — kinds that appear in every settlement and, before this
// phase, fell through to the generic shared-shape builder for 5 of the 8
// reworked factions (only vulperia/elven/dwarven had house/terraced
// coverage; none had inn/blacksmith), meaning the *bulk* of buildings in
// a vulperia/slime/undead/orcish/vampire/fae/dwarven/elven settlement
// still had no race-identity geometry at all. Each faction's villa
// builder derives its footprint dynamically from `getFootprint(dna.
// buildingKind, dna.size)` (verified case by case before reuse), so
// reusing it for these additional kinds is safe and consistent with the
// existing house/terraced precedent already set for vulperia/elven/
// dwarven.
describe('FACTION_BUILDING_VARIANTS — extended ward-kind coverage (house/terraced/inn/blacksmith)', () => {
  const factions: Faction[] = ['vulperia', 'slime', 'undead_common', 'elven', 'dwarven', 'orcish', 'vampire', 'fae'];
  const kinds: BuildingKind[] = ['house', 'terraced', 'inn', 'blacksmith'];

  for (const faction of factions) {
    for (const kind of kinds) {
      it(`${faction}/${kind} has a bespoke variant that builds a non-empty group without throwing`, () => {
        const builder = getFactionBuildingVariant(faction, kind);
        expect(builder).not.toBeNull();
        const g = builder!(makeDna(kind, faction));
        expect(g).toBeInstanceOf(THREE.Group);
        expect(countMeshes(g)).toBeGreaterThan(0);
        expectAllVerticesFinite(g);
      });
    }
  }

  it('scales footprint correctly for the narrow terraced kind vs. the wide villa kind', () => {
    // terraced (3x4) is narrower than villa (7x5) per KIND_FOOTPRINT —
    // confirm the reused builder actually respects dna.buildingKind
    // rather than silently always building at villa's footprint.
    for (const faction of factions) {
      const villaBox = new THREE.Box3().setFromObject(FACTION_BUILDING_VARIANTS[faction]!.villa!(makeDna('villa', faction, 3)));
      const terracedBox = new THREE.Box3().setFromObject(FACTION_BUILDING_VARIANTS[faction]!.terraced!(makeDna('terraced', faction, 3)));
      const villaSize = villaBox.getSize(new THREE.Vector3());
      const terracedSize = terracedBox.getSize(new THREE.Vector3());
      expect(terracedSize.x).toBeLessThan(villaSize.x);
    }
  });
});

describe('buildBuilding() dispatch — faction variant precedence', () => {
  it('uses the faction variant builder when one exists for (faction, kind)', () => {
    const withVariant = buildBuilding(makeDna('villa', 'slime', 5));
    const withoutVariant = buildBuilding(makeDna('villa', 'elven', 5));
    // Same seed/kind, different faction -> different builder path -> should
    // not produce an identical mesh count (elven falls back to the shared
    // villa shape + style overlay; slime uses the bespoke blob builder).
    expect(countMeshes(withVariant.exteriorGroup)).not.toBe(countMeshes(withoutVariant.exteriorGroup));
  });

  it('falls back to the shared shape + style overlay when faction has no variant for this kind', () => {
    // vulperia has no 'watchtower' variant -> falls back to buildWatchtower().
    const inst = buildBuilding(makeDna('watchtower', 'vulperia', 5));
    expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(countMeshes(inst.exteriorGroup)).toBeGreaterThan(0);
  });

  it('falls back to the shared shape + style overlay when faction is undefined (back-compat)', () => {
    const inst = buildBuilding(makeDna('villa', undefined, 5));
    expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(countMeshes(inst.exteriorGroup)).toBeGreaterThan(0);
  });
});

// Task 15 (docs/superpowers/plans/2026-09-04-slime-buildings.md): slime is
// the first faction with a bespoke builder for ALL 8 canonical BuildingKit
// kinds (house/terraced/shop/inn/blacksmith/villa/chapel/watchtower), built
// via src/world/buildings/slime/SlimeBuildingKit.ts's real gel-block/
// pseudopod construction technique rather than the old raw Sphere/Cylinder
// "blob" primitives. Previously house/terraced/inn/blacksmith/watchtower
// either had no slime override (fell through to generic) or reused
// buildSlimeVilla's blob shape; watchtower had no slime override at all.
describe('FACTION_BUILDING_VARIANTS — slime full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('slime', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the slime watchtower kit builder', () => {
    expect(getFactionBuildingVariant('slime', 'tower')).not.toBeNull();
  });

  for (const kind of kinds) {
    it(`slime/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('slime', kind)!(makeDna(kind, 'slime', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('slime', kind)!(makeDna(kind, 'slime', 11))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('no longer routes any of the 8 kinds through the legacy blob group names', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('slime', kind)!(makeDna(kind, 'slime', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.toLowerCase().includes('blob'))).toBe(false);
    }
  });
});

// ── Vulperia deep-quality pass (settlement visual fidelity follow-up) ──────
// Phase 2e §2e.3: regression guards for the grounded BlockKit heightfield
// den mound (small earth/grass/facade blocks with marching-squares-style
// corner rounding) that replaced the earlier noise-perturbed deformed-
// sphere ("organic mound") body, plus the timber-stave round door/window
// kit (unchanged/reused across both mound implementations).
describe('Vulperia — BlockKit heightfield den mound (not a deformed sphere blob)', () => {
  it('produces only finite (non-NaN/non-infinite) vertices for the block mound + props', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.vulperia![kind]!(makeDna(kind, 'vulperia', 123)));
    }
  });

  it('builds the mound from many discrete block meshes (a Lego-style assembly, not one smooth primitive)', () => {
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 7));
    // No large SphereGeometry mound body anywhere (the old deformed-
    // hemisphere body is gone) -- small decorative spheres (door handle,
    // chimney smoke puff, flower/plant heads) are fine and expected.
    let hasLargeSphere = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') {
        const params = (o.geometry as THREE.SphereGeometry).parameters;
        if (params.radius > 0.5) hasLargeSphere = true;
      }
    });
    expect(hasLargeSphere).toBe(false);
    // A block mound's merged geometry has far more vertices than a single
    // low-poly primitive would, reflecting many individually-culled block
    // faces assembled together.
    const mound = findBiggestMesh(g);
    const pos = mound.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('produces a different mound silhouette per seed (deterministic but seed-varied)', () => {
    const countBlockVerts = (g: THREE.Group): number => {
      let total = 0;
      g.traverse(o => {
        if (o instanceof THREE.Mesh) total += (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      });
      return total;
    };
    const gA = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    const gB = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    expect(countBlockVerts(gA)).toBe(countBlockVerts(gA2)); // deterministic for the same seed
    expect(countBlockVerts(gA)).not.toBe(countBlockVerts(gB)); // varies across seeds
  });

  // ── v2 fix, still honoured by the block mound: a real flat facade so the
  // door sits on a genuinely "built" surface, not a bare curved bank. The
  // block system achieves this via a carved notch framed by dedicated
  // `'facade'`-material post/lintel blocks rather than a separate bolted-on
  // BoxGeometry panel.
  it('gives the mound a dedicated facade-material block group (a genuinely built surface around the door), distinct from the earth/grass body', () => {
    const dna = makeDna('villa', 'vulperia', 5);
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(dna);
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    // Earth (dna.colors.walls), grass (#3d6b35) and facade (#4a3520) block
    // materials should all be present as distinct merged meshes.
    expect(materialColors.has(new THREE.Color(dna.colors.walls).getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color('#3d6b35').getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color('#4a3520').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block mound at the front (a genuine hole, not just an applied surface)', () => {
    // The block occupancy grid itself (which the mound mesh is built from)
    // must have an actual notch carved into the front face so the round
    // door prop sits in a real recess rather than floating in front of a
    // solid bank.
    const grid = buildVulperiaDenMoundGrid(5, 6, 5, 3, { facade: true });
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('gives the door a colour that genuinely contrasts against the wall colour (not a same-hue near-match)', () => {
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 5));
    const wallColor = new THREE.Color('#d4a060'); // vulperia's FACTION_PRESETS wall colour
    const colorDistance = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    let maxDoorDistance = 0;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CircleGeometry' && o.material instanceof THREE.MeshStandardMaterial) {
        const dist = colorDistance(o.material.color, wallColor);
        if (dist > maxDoorDistance) maxDoorDistance = dist;
      }
    });
    // A same-hue near-match (the original #6a3810 door vs #d4a060 wall) is
    // only ~0.5 apart in this RGB colour-distance metric; a genuinely
    // contrasting accent colour should be well clear of that.
    expect(maxDoorDistance).toBeGreaterThan(0.6);
  });
});

// ── Orcish deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the block-kit lashed-hut rework that replaced a
// bolted-on log-palisade ring plus a separate noise-perturbed cone roof.
describe('Orcish — BlockKit lashed hut with jagged patchwork roofline (not palisade logs + a cone)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.orcish![kind]!(makeDna(kind, 'orcish', 55)));
    }
  });

  it('builds the villa (Warlord Hall) main hut as one merged, dense block-kit mesh (not 16 palisade log cylinders + a lone cone roof), plus skull/tusk trophy accents', () => {
    const g = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    let sawCone = false;
    g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'ConeGeometry') sawCone = true; });
    // greedy-meshed block-kit output is a single merged BufferGeometry with a
    // dense vertex count reflecting the underlying block construction, not a
    // pile of separate log-cylinder/cone primitives; the tusk trophies are
    // the only ConeGeometry expected on the villa.
    const stalk = findBiggestMesh(g);
    const pos = stalk.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
    expect(sawCone).toBe(true); // the tusk trophy cones, not a roof cone
  });

  it('produces an asymmetric footprint and a jagged (non-uniform) roofline from the live grid', () => {
    const grid = buildOrcishHutGrid(9, 6, 6, 4, {});
    const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bh = Math.max(6, Math.round(4 / BLOCK_UNIT));
    function colTop(bx: number, bz: number): number {
      let top = -1;
      for (let by = 0; by < bh; by++) if (hasBlock(grid, bx, by, bz)) top = by;
      return top;
    }
    const cx = Math.round(bw / 2);
    const heights = new Set<number>();
    for (let bz = 1; bz < bd - 1; bz++) heights.add(colTop(cx, bz));
    expect(heights.size).toBeGreaterThanOrEqual(2);
  });

  it('assigns wall columns mismatched "patch" materials, not a single uniform material', () => {
    const grid = buildOrcishHutGrid(9, 10, 10, 4, {});
    const patchMaterials = new Set<string>();
    for (const matKey of grid.cells.values()) {
      if (matKey.startsWith('patch')) patchMaterials.add(matKey);
    }
    expect(patchMaterials.size).toBeGreaterThanOrEqual(2);
  });

  it('retains the praised skull-and-tusk trophy, bonfire/totem-pole, and loot-crate/blade accent props', () => {
    const villa = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    let sawSkull = false;
    villa.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawSkull = true; });
    expect(sawSkull).toBe(true);
    const chapel = FACTION_BUILDING_VARIANTS.orcish!.chapel!(makeDna('chapel', 'orcish', 9));
    let sawTotemPole = false;
    chapel.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') sawTotemPole = true; });
    expect(sawTotemPole).toBe(true);
    const shop = FACTION_BUILDING_VARIANTS.orcish!.shop!(makeDna('shop', 'orcish', 9));
    let sawCrate = false;
    shop.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') sawCrate = true; });
    expect(sawCrate).toBe(true);
  });

  it('produces a different hut silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    const gB = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    expect(countMeshes(gA)).toBe(countMeshes(gA2));
    const posA = findBiggestMesh(gA).geometry.getAttribute('position') as THREE.BufferAttribute;
    const posB = findBiggestMesh(gB).geometry.getAttribute('position') as THREE.BufferAttribute;
    let sumA = 0, sumB = 0;
    for (let i = 0; i < posA.count; i++) sumA += posA.getY(i);
    for (let i = 0; i < posB.count; i++) sumB += posB.getY(i);
    expect(sumA).not.toBe(sumB);
  });
});

// ── Undead deep-quality pass (settlement visual fidelity follow-up) ────────
// Regression guards for the block-kit decayed ossuary spire + baked-in
// sparse decay/broken crenellation/pointed-arch doorway rework that
// replaced the original three noise-perturbed `CylinderGeometry` tiers +
// bolted-on voussoir arch.
describe('Undead — BlockKit decayed ossuary spire with sparse decay + broken crenellation (not tapered cylinder tiers)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.undead_common![kind]!(makeDna(kind, 'undead_common', 42)));
    }
  });

  it('builds the villa (Lich Tower) main spire as one merged, dense block-kit mesh (not 3 tapered cylinder tiers), plus orb/rubble accents', () => {
    const g = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 3));
    let sawCylinderTier = false;
    g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') sawCylinderTier = true; });
    // greedy-meshed block-kit output is a single merged BufferGeometry with a
    // dense vertex count reflecting the underlying block construction, not a
    // stack of separate tapered-cylinder tiers.
    const spire = findBiggestMesh(g);
    const pos = spire.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
    expect(sawCylinderTier).toBe(false); // no cylinder tiers remain on the villa
    let sawOrb = false;
    g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'IcosahedronGeometry') sawOrb = true; });
    expect(sawOrb).toBe(true);
  });

  it('produces sparse block-omission decay holes in the live grid (scattered erosion pockmarks, not smooth walls)', () => {
    const grid = buildUndeadTierGrid(3, 8, 8, 8, { decayFrac: 0.4 });
    let sawHole = false;
    const bw = Math.max(3, Math.round(8 / BLOCK_UNIT));
    const bh = Math.max(3, Math.round(8 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(8 / BLOCK_UNIT));
    for (let bx = 1; bx < bw - 1 && !sawHole; bx++) {
      for (let by = 1; by < bh - 1 && !sawHole; by++) {
        for (let bz = 1; bz < bd - 1 && !sawHole; bz++) {
          if (!hasBlock(grid, bx, by, bz) && (hasBlock(grid, bx, by - 1, bz) || hasBlock(grid, bx, by + 1, bz))) sawHole = true;
        }
      }
    }
    expect(sawHole).toBe(true);
  });

  it('produces a broken/jagged crenellation crown baked into the topmost tier (not a uniform flat top)', () => {
    // Sample every non-corner perimeter column across all 4 edges of the
    // topmost (inset) tier -- the tier the crumbled-crenellation pass
    // actually touches -- trying a few seeds since a small footprint's
    // topmost tier is narrow and a single seed's jitter rolls can
    // coincidentally collide (mirrors the equivalent FactionBlockProfiles
    // test's seed-loop + all-4-edges sampling).
    const bh = Math.max(3, Math.round(6 / BLOCK_UNIT));
    function colTop(grid: ReturnType<typeof buildUndeadTierGrid>, bx: number, bz: number): number {
      let top = -1;
      for (let by = 0; by < bh; by++) if (hasBlock(grid, bx, by, bz)) top = by;
      return top;
    }
    const plan = planDwarvenTiers(8, 8, 6, { tiers: 2, insetStep: 2 });
    let sawVariance = false;
    for (let trySeed = 1; trySeed < 20 && !sawVariance; trySeed++) {
      const grid = buildUndeadTierGrid(trySeed, 8, 8, 6, { tiers: 2, crownJitterBlocks: 3 });
      const tops = new Set<number>();
      for (let bx = plan.topXMin + 1; bx < plan.topXMax - 1; bx++) {
        tops.add(colTop(grid, bx, plan.topZMin));
        tops.add(colTop(grid, bx, plan.topZMax - 1));
      }
      for (let bz = plan.topZMin + 1; bz < plan.topZMax - 1; bz++) {
        tops.add(colTop(grid, plan.topXMin, bz));
        tops.add(colTop(grid, plan.topXMax - 1, bz));
      }
      if (tops.size >= 2) sawVariance = true;
    }
    expect(sawVariance).toBe(true);
  });

  it('assigns load-bearing corners a distinct "ossuary" material, not the same "ashstone" as the body', () => {
    const grid = buildUndeadTierGrid(3, 8, 8, 6, {});
    const bw = Math.max(3, Math.round(8 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(8 / BLOCK_UNIT));
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('ossuary');
    expect(getMaterialKey(grid, bw - 1, 0, bd - 1)).toBe('ossuary');
  });

  it('retains the praised headstone/fence graveyard props on the chapel and skull-lantern/wall-stub props on the shop', () => {
    const chapel = FACTION_BUILDING_VARIANTS.undead_common!.chapel!(makeDna('chapel', 'undead_common', 9));
    let sawHeadstone = false;
    chapel.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') sawHeadstone = true; });
    expect(sawHeadstone).toBe(true);
    let sawFencePost = false;
    chapel.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') sawFencePost = true; });
    expect(sawFencePost).toBe(true);
    const shop = FACTION_BUILDING_VARIANTS.undead_common!.shop!(makeDna('shop', 'undead_common', 9));
    let sawLantern = false;
    shop.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawLantern = true; });
    expect(sawLantern).toBe(true);
  });

  it('produces a different spire silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    const gB = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    expect(countMeshes(gA)).toBe(countMeshes(gA2));
    const posA = findBiggestMesh(gA).geometry.getAttribute('position') as THREE.BufferAttribute;
    const posB = findBiggestMesh(gB).geometry.getAttribute('position') as THREE.BufferAttribute;
    let sumA = 0, sumB = 0;
    for (let i = 0; i < posA.count; i++) sumA += posA.getY(i);
    for (let i = 0; i < posB.count; i++) sumB += posB.getY(i);
    expect(sumA).not.toBe(sumB);
  });
});

// ── Dwarven deep-quality pass (settlement visual fidelity follow-up) ───────
// Phase 2e §2e.4: regression guards for the stepped-tier BlockKit hall
// (`buildDwarvenHallGrid()`) that replaced the earlier smooth-coursed-box
// stacking — the deliberate *contrast case* proving the block-kit engine
// generalises to crisp, monumental masonry with intentionally
// un-chamfered "buttress" corners, not just vulperia's organic mound.
describe('Dwarven — stepped-tier BlockKit hall with hard-edged buttress corners (not smooth coursed boxes)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.dwarven![kind]!(makeDna(kind, 'dwarven', 8)));
    }
  });

  it('builds the tower from many discrete block meshes (a Lego-style assembly, not one smooth box)', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const totalBox = new THREE.Box3().setFromObject(g);
    const totalHeight = totalBox.max.y - totalBox.min.y;
    let anyBoxSpansMostOfHeight = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        const meshHeight = (bb.max.y - bb.min.y) * o.scale.y;
        if (meshHeight > totalHeight * 0.6) anyBoxSpansMostOfHeight = true;
      }
    });
    // The old version had a full-height coursed-box stack; the block hall's
    // merged mesh is many small unit blocks, so no single box primitive
    // should span most of the building's height.
    expect(anyBoxSpansMostOfHeight).toBe(false);
    const mound = findBiggestMesh(g);
    const pos = mound.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('produces a different tower silhouette per seed (deterministic but seed-varied, via weathering chips)', () => {
    const countBlockVerts = (g: THREE.Group): number => {
      let total = 0;
      g.traverse(o => {
        if (o instanceof THREE.Mesh) total += (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      });
      return total;
    };
    const gA = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 1));
    const gB = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 1));
    expect(countBlockVerts(gA)).toBe(countBlockVerts(gA2)); // deterministic for the same seed
    expect(countBlockVerts(gA)).not.toBe(countBlockVerts(gB)); // varies across seeds
  });

  it('gives the tower a genuine stepped-tier profile: a real inset step from the base grid', () => {
    const grid = buildDwarvenHallGrid(3, 8, 6, 4.5, { tiers: 3 });
    const bh = Math.round(4.5 / BLOCK_UNIT);
    // Base-tier corner is occupied near the ground...
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    // ...but the same column has stepped inward by the top tier.
    expect(hasBlock(grid, 0, bh - 1, 0)).toBe(false);
  });

  it('marks corner columns with a distinct un-chamfered "buttress" material, not plain stone', () => {
    const grid = buildDwarvenHallGrid(3, 8, 6, 4.5, { tiers: 3 });
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('buttress');
  });

  it('gives the tower a genuinely distinct buttress material colour, not the same stone hue with sharp edges', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    // The iron-grey buttress colour (#4a4a48) must appear as its own
    // merged material group, distinct from the warm stone body colour.
    expect(materialColors.has(new THREE.Color('#4a4a48').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block hall at the front (a genuine hole, not just an applied surface)', () => {
    const grid = buildDwarvenHallGrid(5, 8, 6, 4.5, { tiers: 3, facade: true });
    const bw = Math.round(8 / BLOCK_UNIT);
    const bd = Math.round(6 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('retains the praised iron-banded vault door + wheel mechanism', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    let hubCount = 0;
    let spokeCount = 0;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') hubCount++;
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        const p = (o.geometry as THREE.BoxGeometry).parameters;
        // Spokes are long, thin, flat boxes distinguishable from block-kit
        // unit cubes by their aspect ratio.
        if (p.width > p.height * 3 && p.height > 0) spokeCount++;
      }
    });
    expect(hubCount).toBeGreaterThan(0);
    expect(spokeCount).toBeGreaterThanOrEqual(6);
  });

  it('is deterministic for the same seed', () => {
    const gA = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const gB = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });
});

// ── Elven deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the gnarled-bark trunk + leaf-cluster canopy
// rework that replaced a perfectly smooth tapered cylinder trunk and a
// single smooth dome standing in for an entire tree canopy.
describe('Elven — chapel rebuilt on the tower-kit\'s real block-course technique (2026-09-04 rebuild)', () => {
  it('elven.chapel is wired to buildElvenChapelShrine, not the old standing-tree-stones builder', () => {
    expect(FACTION_BUILDING_VARIANTS.elven!.chapel).toBe(buildElvenChapelShrine);
  });

  it('produces only finite (non-NaN/non-infinite) vertices for chapel', () => {
    expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.elven!.chapel!(makeDna('chapel', 'elven', 21)));
  });

  it('builds real per-course block walls -- the wall\'s own merged mesh has far more vertices than a plain box (mergeGroupMeshesByMaterial() merges many per-course blocks into one BufferGeometry, so a raw BoxGeometry-type count would undercount)', () => {
    const g = FACTION_BUILDING_VARIANTS.elven!.chapel!(makeDna('chapel', 'elven', 21));
    let maxVertCount = 0;
    g.traverse((o) => { if (o instanceof THREE.Mesh) maxVertCount = Math.max(maxVertCount, o.geometry.attributes.position.count); });
    expect(maxVertCount).toBeGreaterThan(500);
  });

  it('carves a real arched doorway gap in the trunk grid at the front (a genuine hole, not just an applied surface) -- buildElvenTrunkGrid itself is no longer wired into any live elven builder (shop moved to buildElvenMarketStall, chapel moved to buildElvenChapelShrine) but remains a tested, reusable primitive for future kinds', () => {
    const grid = buildElvenTrunkGrid(5, 6, 5, 5, { facade: true });
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });
});

// ── Vampire deep-quality pass (settlement visual fidelity follow-up) ───────
// Regression guards for the stepped gothic buttress + rose-window tracery
// rework that replaced flat slab buttresses and a flat-disc "rose window".
describe('Vampire — BlockKit tapering gothic spire with crenellated iron parapet (not flat slabs/cones)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.vampire![kind]!(makeDna(kind, 'vampire', 12)));
    }
  });

  it("builds the villa (Count's Tower) from many discrete block meshes (a Lego-style assembly, not one flat slab + cone roof), plus companion turret and gargoyle/balcony accents", () => {
    const g = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const totalBox = new THREE.Box3().setFromObject(g);
    const totalHeight = totalBox.max.y - totalBox.min.y;
    let anyBoxSpansMostOfHeight = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        const meshHeight = (bb.max.y - bb.min.y) * o.scale.y;
        if (meshHeight > totalHeight * 0.6) anyBoxSpansMostOfHeight = true;
      }
    });
    // The old version had a full-height flat wall slab; the block spire's
    // merged mesh is many small unit blocks, so no single box primitive
    // should span most of the building's height.
    expect(anyBoxSpansMostOfHeight).toBe(false);
    const spire = findBiggestMesh(g);
    const pos = spire.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('does not flare back out into a canopy: unlike elven, the spire narrows monotonically up to the flat parapet deck', () => {
    const grid = buildVampireSpireGrid(3, 6, 6, 10, {});
    const bh = Math.max(8, Math.round(10 / BLOCK_UNIT));
    function rowSpan(by: number): number {
      const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
      const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
      const cz = Math.round((bd - 1) / 2);
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    expect(rowSpan(bh - 2)).toBeLessThanOrEqual(rowSpan(Math.round(bh * 0.4)));
  });

  it('marks the crenellations with a distinct un-chamfered "iron" material, not plain obsidian', () => {
    const grid = buildVampireSpireGrid(3, 6, 6, 10, {});
    let sawIron = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'iron') { sawIron = true; break; }
    }
    expect(sawIron).toBe(true);
  });

  it('gives the tower a genuinely distinct iron material colour, not the same obsidian hue with sharp edges', () => {
    const g = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    expect(materialColors.has(new THREE.Color('#3a3a42').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block spire at the front (a genuine hole, not just an applied surface)', () => {
    const grid = buildVampireSpireGrid(5, 6, 6, 10, { facade: true });
    const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('retains the praised rose window + blood-orb + candelabra small accent props', () => {
    const chapel = FACTION_BUILDING_VARIANTS.vampire!.chapel!(makeDna('chapel', 'vampire', 5));
    let sawCircle = false, sawSphere = false;
    chapel.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CircleGeometry') sawCircle = true;
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawSphere = true;
    });
    expect(sawCircle).toBe(true); // rose window glass disc
    expect(sawSphere).toBe(true); // blood orb
  });

  it('is deterministic for the same seed', () => {
    const gA = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const gB = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });
});

// ── Fae deep-quality pass (settlement visual fidelity follow-up) ───────────
// Regression guards for the block-kit toadstool rework that replaced a
// primitive cylinder stem and a deformed half-sphere dome standing in for
// an entire mushroom.
describe('Fae — BlockKit toadstool stalk with scalloped flared cap (not a cylinder + deformed sphere)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.fae![kind]!(makeDna(kind, 'fae', 33)));
    }
  });

  it('builds the villa (Fae Court) from many discrete block meshes (a Lego-style assembly, not a cylinder + a sphere), plus satellite toadstools and firefly accents', () => {
    const g = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 5));
    let sawCylinder = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') sawCylinder = true;
    });
    // The old version's main stalk was a CylinderGeometry stem; the block
    // toadstool's merged mesh is many small unit blocks, so no cylinder
    // primitive should remain (small SphereGeometry firefly motes are
    // still fine — those were never the "stem" being replaced).
    expect(sawCylinder).toBe(false);
    const stalk = findBiggestMesh(g);
    const pos = stalk.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('flares the cap out well beyond the stalk width, then domes back in at the crown (a real mushroom silhouette, not a uniform column)', () => {
    const grid = buildFaeStalkGrid(3, 6, 6, 8, {});
    const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bh = Math.max(8, Math.round(8 / BLOCK_UNIT));
    function rowSpan(by: number): number {
      const cz = Math.round((bd - 1) / 2);
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    // Mirrors the grid's own `t = by / (bh - 1)` normalization (not
    // `by / bh`) so these sample points land at the intended phase
    // boundaries instead of one row short of them.
    const stalkSpan = rowSpan(Math.round(0.2 * (bh - 1)));
    const peakSpan = rowSpan(Math.round(0.86 * (bh - 1)));
    const topSpan = rowSpan(bh - 1);
    expect(peakSpan).toBeGreaterThan(stalkSpan);
    expect(topSpan).toBeLessThan(peakSpan);
  });

  it('marks the cap with a distinct "spore" bioluminescent accent material, not plain cap colour', () => {
    const grid = buildFaeStalkGrid(3, 6, 6, 8, {});
    let sawSpore = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'spore') { sawSpore = true; break; }
    }
    expect(sawSpore).toBe(true);
  });

  it('carves a real circular portal-sized gap in the block stalk at the front (a genuine hole floating above the ground, not a ground-level arch)', () => {
    const grid = buildFaeStalkGrid(5, 6, 6, 8, { facade: true });
    const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const cx = Math.round(bw / 2);
    // Ground level must stay solid (unlike vampire's/elven's ground-level
    // arches) — the portal floats above it.
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(true);
    let sawCarvedGap = false;
    for (let by = 1; by < bd + 4; by++) {
      if (!hasBlock(grid, cx, by, bd - 1)) { sawCarvedGap = true; break; }
    }
    expect(sawCarvedGap).toBe(true);
  });

  it('retains the praised gill-fin, petal, and firefly small accent props', () => {
    const villa = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 5));
    let sawGillBox = false, sawFirefly = false;
    villa.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') sawGillBox = true;
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawFirefly = true;
    });
    expect(sawGillBox).toBe(true); // gill fins
    expect(sawFirefly).toBe(true); // firefly motes
    const shop = FACTION_BUILDING_VARIANTS.fae!.shop!(makeDna('shop', 'fae', 5));
    let sawPetal = false;
    shop.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'CircleGeometry') sawPetal = true; });
    expect(sawPetal).toBe(true); // petal decorations
  });

  it('is deterministic for the same seed and varies with a different seed', () => {
    const gA = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 1));
    const gB = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 1));
    const gC = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 2));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
    const posA = findBiggestMesh(gA).geometry.getAttribute('position') as THREE.BufferAttribute;
    const posC = findBiggestMesh(gC).geometry.getAttribute('position') as THREE.BufferAttribute;
    let sumA = 0, sumC = 0;
    for (let i = 0; i < posA.count; i++) sumA += posA.getY(i);
    for (let i = 0; i < posC.count; i++) sumC += posC.getY(i);
    expect(sumA).not.toBe(sumC);
  });
});

describe('elven watchtower/tower -- stone-tower kit POC', () => {
  it('elven watchtower resolves to a distinct builder from the generic default', () => {
    const inst = buildBuilding(makeDna('watchtower', 'elven', 5));
    // Generic buildWatchtower() has a fixed square footprint; the elven
    // stone tower is built from an octagon cross-section -- a reliable,
    // cheap way to prove a *different* builder actually ran without
    // depending on exact vertex counts.
    let elvenHasCylinderOrCone = false;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        elvenHasCylinderOrCone = true;
      }
    });
    expect(elvenHasCylinderOrCone).toBe(true);
  });

  it('the generic (no-faction) watchtower does NOT use a cylinder/cone shaft (proves elven genuinely differs from the fallback)', () => {
    const generic = buildBuilding(makeDna('watchtower', undefined, 5));
    let genericHasCylinderOrCone = false;
    generic.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        genericHasCylinderOrCone = true;
      }
    });
    expect(genericHasCylinderOrCone).toBe(false);
  });

  it('elven tower kind also resolves to the stone-tower builder', () => {
    const inst = buildBuilding(makeDna('tower', 'elven', 3));
    expect(inst.exteriorGroup.children.length).toBeGreaterThan(0);
    let hasCylinderOrCone = false;
    inst.exteriorGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.geometry instanceof THREE.CylinderGeometry || o.geometry instanceof THREE.ConeGeometry)) {
        hasCylinderOrCone = true;
      }
    });
    expect(hasCylinderOrCone).toBe(true);
  });

  it('other elven kinds are untouched (still resolve to their own builders, not accidentally reassigned to the tower)', () => {
    // Villa now legitimately shares construction TECHNIQUE with the tower
    // (buildElvenTreehouseHome reuses buildTowerKitCore, see
    // docs/superpowers/specs/2026-09-03-elven-treehouse-tower-kit-rebuild.md),
    // so a geometry-shape heuristic (e.g. "no Cylinder/Cone anywhere") is no
    // longer a valid discriminator -- both legitimately use them now. The
    // real regression this guards against is watchtower/tower's OWN
    // builder accidentally also being wired to villa; check function
    // identity directly instead.
    expect(FACTION_BUILDING_VARIANTS.elven!.villa).not.toBe(FACTION_BUILDING_VARIANTS.elven!.watchtower);
    expect(FACTION_BUILDING_VARIANTS.elven!.villa).not.toBe(FACTION_BUILDING_VARIANTS.elven!.tower);
  });
});
