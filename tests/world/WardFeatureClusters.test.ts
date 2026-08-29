import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildParkFeature } from '@/world/props/WardFeatureClusters';
import type { Faction } from '@/world/buildings/BuildingDNA';

// The 9 factions reachable from mapStudioFactionToRuntimeFaction() in
// BuildingTypeMap.ts (see overworld-studio.ts's FACTION_WARD_NAMES for the
// authoritative per-faction park-ward names this module implements).
const RUNTIME_FACTIONS: Faction[] = [
  'human_town', 'human_rural', 'human_noble',
  'elven', 'dwarven', 'orcish', 'vampire', 'undead_common', 'vulperia', 'slime', 'fae',
];

function countMeshes(group: THREE.Group): number {
  let n = 0;
  group.traverse(obj => { if ((obj as THREE.Mesh).isMesh) n++; });
  return n;
}

describe('buildParkFeature', () => {
  it('returns a non-empty group for every reachable faction', () => {
    for (const faction of RUNTIME_FACTIONS) {
      const group = buildParkFeature(faction, 0xABCDEF);
      expect(countMeshes(group)).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same faction/seed', () => {
    const a = buildParkFeature('elven', 42);
    const b = buildParkFeature('elven', 42);
    expect(countMeshes(a)).toBe(countMeshes(b));
    // Positions should match exactly since the RNG sequence is identical.
    const posA: number[] = [];
    const posB: number[] = [];
    a.traverse(o => { if ((o as THREE.Mesh).isMesh) posA.push(o.position.x, o.position.y, o.position.z); });
    b.traverse(o => { if ((o as THREE.Mesh).isMesh) posB.push(o.position.x, o.position.y, o.position.z); });
    expect(posA).toEqual(posB);
  });

  it('produces geometrically distinct clusters per faction (not palette-swapped copies)', () => {
    // Different factions must not produce the same mesh count/arrangement —
    // this is the core requirement: Slime Pool vs. Sacred Grove vs. Graveyard
    // must be different *kinds of places*, not the same shapes recolored.
    const counts = new Map<Faction, number>();
    for (const faction of ['elven', 'slime', 'undead_common', 'vulperia', 'dwarven', 'orcish', 'vampire', 'fae'] as Faction[]) {
      counts.set(faction, countMeshes(buildParkFeature(faction, 1)));
    }
    const values = Array.from(counts.values());
    const distinctCounts = new Set(values);
    // Not a strict proof of visual distinctness, but if every faction produced
    // an identical mesh count it would strongly suggest a shared/palette-only
    // implementation slipped back in.
    expect(distinctCounts.size).toBeGreaterThan(1);
  });

  it('falls back to the human Village Green for an unmapped faction', () => {
    const fallback = buildParkFeature('draconic', 7);
    const human = buildParkFeature('human_town', 7);
    expect(countMeshes(fallback)).toBe(countMeshes(human));
  });
});
