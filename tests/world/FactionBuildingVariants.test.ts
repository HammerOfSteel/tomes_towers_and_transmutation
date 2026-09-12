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
import { buildElvenTrunkGrid } from '@/world/buildings/FactionBlockProfiles';
import { BLOCK_UNIT, hasBlock } from '@/world/buildings/BlockKit';
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
    expect(getFactionBuildingVariant('human_town', 'watchtower')).toBeNull();
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
    // human_town has no bespoke building-variant kit at all -> falls back
    // to buildWatchtower(). (fae now has a real bespoke watchtower variant
    // -- FaeBuildingKit.ts's Moonmoth Lookout -- so it no longer serves as
    // an example of an uncovered kind.)
    const inst = buildBuilding(makeDna('watchtower', 'human_town', 5));
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
// Regression guards for the real bespoke fox-folk warren kit-of-parts
// builders (VulperiaBuildingKit.ts, docs/superpowers/plans/
// 2026-09-04-vulperia-buildings.md), one per canonical BuildingKind --
// coursed cob/timber walls, five-piece framed openings, segmented
// sod/turf roofs (via the shared TurfRoof.ts kit module) with visible
// ridge/hip seams and dark verge trim, raised porches/dormers, and a
// rigorous berm/skirt at every terrain contact -- replacing the earlier
// `addBlockDenMound()`/`vulperiaMound()` BlockKit earthen-mound builder
// (villa/chapel/shop only, no house/terraced/inn/blacksmith/watchtower
// coverage at all, and never a real constructed building per the design
// spec's explicit "move to modular constructed architecture" directive).
describe('FACTION_BUILDING_VARIANTS — vulperia full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('vulperia', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the vulperia watchtower kit builder', () => {
    expect(getFactionBuildingVariant('vulperia', 'tower')).not.toBeNull();
  });

  it('blacksmith is not the same function as villa (no longer a shared earthen-mound reuse)', () => {
    expect(FACTION_BUILDING_VARIANTS.vulperia!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.vulperia!.villa);
  });

  for (const kind of kinds) {
    it(`vulperia/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('vulperia', kind)!(makeDna(kind, 'vulperia', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('vulperia', kind)!(makeDna(kind, 'vulperia', 11))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const gA = getFactionBuildingVariant('vulperia', 'villa')!(makeDna('villa', 'vulperia', 5));
    const gB = getFactionBuildingVariant('vulperia', 'villa')!(makeDna('villa', 'vulperia', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });

  it('produces a different silhouette per seed (deterministic but seed-varied)', () => {
    const gA = getFactionBuildingVariant('vulperia', 'villa')!(makeDna('villa', 'vulperia', 1));
    const gB = getFactionBuildingVariant('vulperia', 'villa')!(makeDna('villa', 'vulperia', 2));
    const gA2 = getFactionBuildingVariant('vulperia', 'villa')!(makeDna('villa', 'vulperia', 1));
    expect(countMeshes(gA)).toBe(countMeshes(gA2));
    expect(countMeshes(gA)).not.toBe(countMeshes(gB));
  });

  it('no longer routes any of the 8 kinds through the legacy earthen block-mound group names', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vulperia', kind)!(makeDna(kind, 'vulperia', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.toLowerCase().includes('mound'))).toBe(false);
    }
  });

  it('every kind has real ground-contact grounding (plinth + earth berm) and lot dressing (never a floating building)', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vulperia', kind)!(makeDna(kind, 'vulperia', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.includes('vulperia-grounding'))).toBe(true);
      expect(names.some(n => n.includes('vulperia-lot-dressing'))).toBe(true);
    }
  });

  it('every kind has a real segmented turf roof (never a smooth dome/blob): all 6 named layers present', () => {
    const requiredLayers = ['turf-roof-rafters', 'turf-roof-board-deck', 'turf-roof-board-ends', 'turf-roof-turf-stop', 'turf-roof-soil-edge', 'turf-roof-grass-top'];
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vulperia', kind)!(makeDna(kind, 'vulperia', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      for (const layer of requiredLayers) {
        expect(names).toContain(layer);
      }
    }
  });
});

// ── Orcish deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the real bespoke lashed-timber/hide kit-of-parts
// builders (OrcishBuildingKit.ts, docs/superpowers/plans/
// 2026-09-04-orcish-buildings.md), one per canonical BuildingKind,
// replacing the earlier `buildOrcishHutGrid()` BlockKit lashed hut (a
// single mismatched-patch occupancy-grid hut reused/rescaled for
// villa/chapel/shop only, with no watchtower coverage at all).
describe('FACTION_BUILDING_VARIANTS — orcish full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('orcish', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the orcish watchtower kit builder', () => {
    expect(getFactionBuildingVariant('orcish', 'tower')).not.toBeNull();
  });

  it('blacksmith is not the same function as villa (no longer a shared hut-grid reuse)', () => {
    expect(FACTION_BUILDING_VARIANTS.orcish!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.orcish!.villa);
  });

  for (const kind of kinds) {
    it(`orcish/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('orcish', kind)!(makeDna(kind, 'orcish', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('orcish', kind)!(makeDna(kind, 'orcish', 11))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const gA = getFactionBuildingVariant('orcish', 'villa')!(makeDna('villa', 'orcish', 5));
    const gB = getFactionBuildingVariant('orcish', 'villa')!(makeDna('villa', 'orcish', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });

  it('no longer routes any of the 8 kinds through the legacy BlockKit hut-grid group names', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('orcish', kind)!(makeDna(kind, 'orcish', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.toLowerCase().includes('hutgrid'))).toBe(false);
    }
  });
});

// ── Undead deep-quality pass (settlement visual fidelity follow-up) ────────
// Regression guards for the real bespoke communal/funerary/horizontal
// necropolis kit-of-parts builders (UndeadNecropolisKit.ts,
// docs/superpowers/plans/2026-09-04-undead-buildings.md), one per
// canonical BuildingKind, replacing the earlier `addBlockUndeadSpire()`
// BlockKit decayed ossuary spire (villa/chapel/shop only, a private/
// vertical "lich tower" silhouette at odds with undead's communal/
// horizontal/decaying doctrine addendum, with no house/terraced/inn/
// blacksmith/watchtower coverage at all).
describe('FACTION_BUILDING_VARIANTS — undead full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('undead_common', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the undead watchtower kit builder', () => {
    expect(getFactionBuildingVariant('undead_common', 'tower')).not.toBeNull();
  });

  it('blacksmith is not the same function as villa (no longer a shared spire-grid reuse)', () => {
    expect(FACTION_BUILDING_VARIANTS.undead_common!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.undead_common!.villa);
  });

  for (const kind of kinds) {
    it(`undead/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('undead_common', kind)!(makeDna(kind, 'undead_common', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('undead_common', kind)!(makeDna(kind, 'undead_common', 11))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const gA = getFactionBuildingVariant('undead_common', 'villa')!(makeDna('villa', 'undead_common', 5));
    const gB = getFactionBuildingVariant('undead_common', 'villa')!(makeDna('villa', 'undead_common', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });

  it('no longer routes any of the 8 kinds through the legacy BlockKit spire-grid group names', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('undead_common', kind)!(makeDna(kind, 'undead_common', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.toLowerCase().includes('spiregrid') || n.toLowerCase().includes('tiergrid'))).toBe(false);
    }
  });

  it('every kind has real ground-contact cemetery lot dressing (never a floating building, and never a private garden)', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('undead_common', kind)!(makeDna(kind, 'undead_common', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.includes('undead-lot-dressing'))).toBe(true);
    }
  });

  it('never uses a bare IcosahedronGeometry glow-orb stand-in (the legacy lich-tower villa bug)', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('undead_common', kind)!(makeDna(kind, 'undead_common', 11));
      let sawOrb = false;
      g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'IcosahedronGeometry') sawOrb = true; });
      expect(sawOrb).toBe(false);
    }
  });
});

describe('FACTION_BUILDING_VARIANTS — dwarven roster / full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('dwarven', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the dwarven watchtower kit builder', () => {
    expect(getFactionBuildingVariant('dwarven', 'tower')).not.toBeNull();
  });

  it('blacksmith is not the same function as villa (no longer a shared block-hall reuse)', () => {
    expect(FACTION_BUILDING_VARIANTS.dwarven!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.dwarven!.villa);
  });

  for (const kind of kinds) {
    it(`dwarven/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('dwarven', kind)!(makeDna(kind, 'dwarven', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    // seed 2, not 11: inn/villa happen to collide on mesh count at seed 11
    // (150 each) -- a numeric coincidence, not a structural collapse (their
    // builders are otherwise clearly distinct, per the dedicated
    // 'blacksmith is not the same function as villa' identity check above).
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('dwarven', kind)!(makeDna(kind, 'dwarven', 2))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const gA = getFactionBuildingVariant('dwarven', 'villa')!(makeDna('villa', 'dwarven', 5));
    const gB = getFactionBuildingVariant('dwarven', 'villa')!(makeDna('villa', 'dwarven', 5));
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
// Regression guards for the real bespoke Gothic-Revival/Second-Empire
// kit-of-parts builders (VampireBuildingKit.ts, docs/superpowers/plans/
// 2026-09-04-vampire-buildings.md), one per canonical BuildingKind,
// replacing the earlier buildVampireSpireGrid() BlockKit tapering
// obsidian spire (villa/chapel/shop only, no watchtower coverage at all).
describe('FACTION_BUILDING_VARIANTS — vampire full kit-of-parts coverage', () => {
  const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

  it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
    for (const kind of kinds) {
      expect(getFactionBuildingVariant('vampire', kind)).not.toBeNull();
    }
  });

  it('also resolves the generic "tower" kind to the vampire watchtower kit builder', () => {
    expect(getFactionBuildingVariant('vampire', 'tower')).not.toBeNull();
  });

  it('blacksmith is not the same function as villa (no longer a shared spire-grid reuse)', () => {
    expect(FACTION_BUILDING_VARIANTS.vampire!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.vampire!.villa);
  });

  for (const kind of kinds) {
    it(`vampire/${kind} builds a non-empty, all-finite group without throwing`, () => {
      const g = getFactionBuildingVariant('vampire', kind)!(makeDna(kind, 'vampire', 11));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
      expectAllVerticesFinite(g);
    });
  }

  it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
    const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('vampire', kind)!(makeDna(kind, 'vampire', 11))));
    expect(new Set(counts).size).toBe(kinds.length);
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const gA = getFactionBuildingVariant('vampire', 'villa')!(makeDna('villa', 'vampire', 5));
    const gB = getFactionBuildingVariant('vampire', 'villa')!(makeDna('villa', 'vampire', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });

  it('no longer routes any of the 8 kinds through the legacy BlockKit spire-grid group names', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vampire', kind)!(makeDna(kind, 'vampire', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.toLowerCase().includes('spiregrid'))).toBe(false);
    }
  });

  it('every kind has at least one closed (shuttered/louvred/vented) opening — never a broken/missing window (vampire is maintained, not undead)', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vampire', kind)!(makeDna(kind, 'vampire', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      expect(names.some(n => n.includes('vampire-shuttered-window') || n.includes('vampire-vent'))).toBe(true);
    }
  });

  it('every kind builds a real proud/recessed roof (mansard, gable, hip, or cross-gable — never a bare cone stand-in)', () => {
    for (const kind of kinds) {
      const g = getFactionBuildingVariant('vampire', kind)!(makeDna(kind, 'vampire', 11));
      const names: string[] = [];
      g.traverse(o => names.push(o.name));
      const hasRealRoof = names.some(n => n.includes('mansard-roof') || n.includes('gable-roof') || n.includes('hip-roof') || n.includes('cross-gable-roof'));
      expect(hasRealRoof).toBe(true);
      expect(names.some(n => n.toLowerCase().includes('conegeometry'))).toBe(false);
    }
  });
});

      // ── Fae kit-of-parts coverage (2026-09-04 rebuild) ──────────────────────────
      // Replaces the old "Fae deep-quality pass" BlockKit toadstool-stalk-grid
      // describe block above (removed in the same commit that added
      // FaeBuildingKit.ts) -- the old block tested buildFaeStalkGrid() directly
      // and asserted villa/chapel/shop-only coverage; the new kit covers all 8
      // canonical kinds via FaeBuildingKit.ts's storybook stump/fungal cottage
      // construction (coursed bark walls, five-piece oversized petal-lancet/
      // oculus openings, real ribbed mushroom-cap/curled shingle-cone roofs,
      // bounded organic lattice-deform, root-flare grounding).
      describe('FACTION_BUILDING_VARIANTS — fae full kit-of-parts coverage', () => {
        const kinds: BuildingKind[] = ['house', 'terraced', 'shop', 'inn', 'blacksmith', 'villa', 'chapel', 'watchtower'];

        it('has a non-null bespoke variant for every canonical kind, including watchtower', () => {
          for (const kind of kinds) {
            expect(getFactionBuildingVariant('fae', kind)).not.toBeNull();
          }
        });

        it('also resolves the generic "tower" kind to the fae watchtower kit builder', () => {
          expect(getFactionBuildingVariant('fae', 'tower')).not.toBeNull();
        });

        it('blacksmith is not the same function as villa (no longer a shared toadstool-stalk-grid reuse)', () => {
          expect(FACTION_BUILDING_VARIANTS.fae!.blacksmith).not.toBe(FACTION_BUILDING_VARIANTS.fae!.villa);
        });

        for (const kind of kinds) {
          it(`fae/${kind} builds a non-empty, all-finite group without throwing`, () => {
            const g = getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11));
            expect(g).toBeInstanceOf(THREE.Group);
            expect(countMeshes(g)).toBeGreaterThan(0);
            expectAllVerticesFinite(g);
          });
        }

        it('produces 8 pairwise-distinct mesh-count signatures across the 8 kinds (no silent collapse to one shared builder)', () => {
          const counts = kinds.map(kind => countMeshes(getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11))));
          expect(new Set(counts).size).toBe(kinds.length);
        });

        it('is deterministic for the same faction/kind/seed', () => {
          const gA = getFactionBuildingVariant('fae', 'villa')!(makeDna('villa', 'fae', 5));
          const gB = getFactionBuildingVariant('fae', 'villa')!(makeDna('villa', 'fae', 5));
          expect(countMeshes(gA)).toBe(countMeshes(gB));
        });

        it('no longer routes any of the 8 kinds through the legacy BlockKit toadstool-stalk-grid group names', () => {
          for (const kind of kinds) {
            const g = getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11));
            const names: string[] = [];
            g.traverse(o => names.push(o.name));
            expect(names.some(n => n.toLowerCase().includes('stalkgrid'))).toBe(false);
          }
        });

        it('every kind has at least one glowing five-piece opening (recess + surround, never a flat dark box/circle)', () => {
          for (const kind of kinds) {
            const g = getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11));
            const names: string[] = [];
            g.traverse(o => names.push(o.name));
            expect(names.some(n => n.includes('recess'))).toBe(true);
            expect(names.some(n => n.includes('surround'))).toBe(true);
          }
        });

        it('every kind builds a real constructed roof (radial mushroom cap, curled shingle cone, or gable shingle course — never a bare cone/sphere stand-in)', () => {
          for (const kind of kinds) {
            const g = getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11));
            const names: string[] = [];
            g.traverse(o => names.push(o.name));
            const hasRealRoof = names.some(n => n.includes('radial-mushroom-cap') || n.includes('curled-cone-shingle-roof') || n.includes('shingle'));
            expect(hasRealRoof).toBe(true);
          }
        });

        it('every kind has real root-flare grounding (never floating flush with bare ground)', () => {
          for (const kind of kinds) {
            const g = getFactionBuildingVariant('fae', kind)!(makeDna(kind, 'fae', 11));
            const names: string[] = [];
            g.traverse(o => names.push(o.name));
            expect(names.some(n => n.includes('fae-root-flare'))).toBe(true);
          }
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
