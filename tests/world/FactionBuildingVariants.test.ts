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

/**
 * Like findBiggestMesh, but restricted to CylinderGeometry meshes. Some
 * faction builders (e.g. undead's floating orb, an IcosahedronGeometry)
 * include non-indexed geometries whose raw vertex-array length is inflated
 * well past any indexed cylinder/cone mesh's — this avoids accidentally
 * grabbing a fixed, seed-independent decorative shape when the intent is
 * to inspect the noise-perturbed tapered body.
 */
function findBiggestCylinderMesh(g: THREE.Group): THREE.Mesh {
  let biggest: THREE.Mesh | null = null;
  let biggestCount = 0;
  g.traverse(o => {
    if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') {
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

// ── Vulperia deep-quality pass (settlement visual fidelity, "not just a
// blob with a roof thing" follow-up) ────────────────────────────────────────
// Regression guards for the noise-perturbed organic mound and the
// timber-stave round door/window kit added to replace the original plain
// half-sphere + flat torus-ring approach.
describe('Vulperia — organic mound geometry (not a plain sphere blob)', () => {
  it('produces only finite (non-NaN/non-infinite) vertices after noise-based silhouette displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.vulperia![kind]!(makeDna(kind, 'vulperia', 123)));
    }
  });

  it('perturbs the main mound off a perfect sphere radius (organic bank, not a smooth dome)', () => {
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 7));
    const mound = findBiggestMesh(g);
    const pos = mound.geometry.getAttribute('position') as THREE.BufferAttribute;
    const radii: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      radii.push(Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    // A perfectly spherical (undisplaced) hemisphere has every vertex at the
    // exact same distance from the origin. Noise displacement should spread
    // that distance out into a real range.
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.01);
  });

  it('produces a different mound silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    const gB = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    const sumRadii = (g: THREE.Group): number => {
      const pos = findBiggestMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      return sum;
    };
    expect(sumRadii(gA)).toBe(sumRadii(gA2)); // deterministic for the same seed
    expect(sumRadii(gA)).not.toBe(sumRadii(gB)); // varies across seeds
  });
});

// ── Orcish deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the palisade-wall + rough-cone-roof rework that
// replaced the original single tapered-cylinder "tent" standing in for a
// whole hut.
describe('Orcish — palisade wall + rough hide roof (not one tapered cylinder)', () => {
  it('produces only finite vertices for the noise-perturbed roof after displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.orcish![kind]!(makeDna(kind, 'orcish', 55)));
    }
  });

  it('builds the villa (Warlord Hall) from many individually-solid log pieces, not one primitive', () => {
    const g = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    // The palisade wall alone contributes 16 individual log cylinders, plus
    // the roof cone, crossed poles, door posts/lintel, doorway and totems --
    // a real multi-part assembly rather than a single tapered-cylinder "hut".
    expect(countMeshes(g)).toBeGreaterThanOrEqual(16 + 8);
  });

  it('perturbs the rough-cone roof off a perfect cone radius (ragged hide flaps, not a tidy cone)', () => {
    const g = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    const roof = findBiggestMesh(g);
    const pos = roof.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    // A perfect cone has a small, fixed set of ring radii (one per height
    // segment); noise perturbation should spread this out into many distinct
    // values.
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('produces a different roof silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    const gB = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    const sumXZ = (g: THREE.Group): number => {
      const pos = findBiggestMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getZ(i));
      return sum;
    };
    expect(sumXZ(gA)).toBe(sumXZ(gA2));
    expect(sumXZ(gA)).not.toBe(sumXZ(gB));
  });
});

// ── Undead deep-quality pass (settlement visual fidelity follow-up) ────────
// Regression guards for the tiered weathered-stone spire + carved
// gothic-arch doorway rework that replaced the original single
// tapered-cylinder "spire" standing in for a whole crypt tower.
describe('Undead — tiered weathered spire + stone arch doorway (not one tapered cylinder)', () => {
  it('produces only finite vertices for the noise-perturbed tiers after displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.undead_common![kind]!(makeDna(kind, 'undead_common', 42)));
    }
  });

  it('builds the villa (Lich Tower) from three distinct stone tiers plus arch/crown/orb/rubble, not one primitive', () => {
    const g = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 3));
    // 3 tiers + 6 crenellations + 1 orb + 3 arrow slits + (7 voussoirs + 2
    // jambs + 1 void panel for the arch) + 2 ribs + 3 rubble chunks.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(3 + 6 + 1 + 3 + 10 + 2 + 3);
  });

  it('perturbs a tower tier off a perfect cylinder radius (crumbling ancient stone, not smooth taper)', () => {
    const g = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 3));
    const tier = findBiggestCylinderMesh(g);
    const pos = tier.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    // A perfect cylinder/cone tier has a small, fixed set of ring radii;
    // noise perturbation should spread this out into many distinct values.
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('produces a different tower silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    const gB = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    const sumXZ = (g: THREE.Group): number => {
      const pos = findBiggestCylinderMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getZ(i));
      return sum;
    };
    expect(sumXZ(gA)).toBe(sumXZ(gA2));
    expect(sumXZ(gA)).not.toBe(sumXZ(gB));
  });
});
