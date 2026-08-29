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

describe('FACTION_BUILDING_VARIANTS registry', () => {
  const covered: Array<[Faction, BuildingKind]> = [
    ['vulperia', 'villa'], ['vulperia', 'chapel'], ['vulperia', 'shop'],
    ['slime', 'villa'], ['slime', 'chapel'], ['slime', 'shop'],
    ['undead_common', 'villa'], ['undead_common', 'chapel'], ['undead_common', 'shop'],
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
    expect(getFactionBuildingVariant('elven', 'villa')).toBeNull();
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

  it('produces geometrically distinct mesh counts across the three covered factions for the same kind', () => {
    const counts = new Set(
      (['vulperia', 'slime', 'undead_common'] as Faction[]).map(f =>
        countMeshes(FACTION_BUILDING_VARIANTS[f]!.villa!(makeDna('villa', f, 7))),
      ),
    );
    // Not a strict requirement that all three differ, but they should not
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
