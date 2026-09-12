import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
import { buildHumanPalette } from '@/world/buildings/human/HumanBuildingMaterials';

describe('buildHumanPalette', () => {
  it('builds a full palette of distinct, non-cloned materials', () => {
    const dna = factionBuildingDna('house', 'human_town', 1);
    const palette = buildHumanPalette(dna);

    const materials = Object.values(palette);
    expect(materials.length).toBeGreaterThanOrEqual(13);
    for (const material of materials) {
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    // Every material reference must be genuinely distinct (never a clone
    // of another palette entry) -- material-identity bucketing is how
    // mergeGroupMeshesByMaterial() batches draw calls.
    const unique = new Set(materials);
    expect(unique.size).toBe(materials.length);
  });

  it('gives the three roof materials (clay tile / slate / thatch) visibly different colors', () => {
    const dna = factionBuildingDna('house', 'human_town', 1);
    const palette = buildHumanPalette(dna);
    const colors = [palette.clayTile.color.getHexString(), palette.slate.color.getHexString(), palette.thatch.color.getHexString()];
    expect(new Set(colors).size).toBe(3);
  });

  it('is deterministic given the same DNA', () => {
    const dna = factionBuildingDna('house', 'human_town', 1);
    const a = buildHumanPalette(dna);
    const b = buildHumanPalette(dna);
    expect(a.plaster.color.getHexString()).toBe(b.plaster.color.getHexString());
    expect(a.oakTimber.color.getHexString()).toBe(b.oakTimber.color.getHexString());
  });
});
