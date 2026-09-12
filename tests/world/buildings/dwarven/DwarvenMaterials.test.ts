import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getFootprint, STYLE_COLORS, type BuildingDNA } from '@/world/buildings/BuildingDNA';
import { buildDwarvenPalette } from '@/world/buildings/dwarven/DwarvenMaterials';

function makeDna(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: 'test dwarven', seed: 12345,
    buildingKind: 'house', size: 'small', floors: 1,
    style: 'dwarven', condition: 'pristine',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['dwarven'], rotation: 0, faction: 'dwarven',
    terrace: 'none', features: [],
    ...overrides,
  };
}

describe('buildDwarvenPalette', () => {
  it('returns every required material role', () => {
    const palette = buildDwarvenPalette(makeDna());
    for (const key of ['granite', 'basalt', 'iron', 'soot', 'wood', 'darkGlass', 'forgeEmissive', 'roofTile', 'roofMetal'] as const) {
      expect(palette[key]).toBeInstanceOf(THREE.Material);
    }
  });

  it('returns the SAME material reference across repeated reads within one call (no per-block cloning)', () => {
    const palette = buildDwarvenPalette(makeDna());
    const a = palette.granite;
    const b = palette.granite;
    expect(a).toBe(b);
  });

  it('produces distinct palettes for distinct calls so callers never mutate a shared global singleton by accident', () => {
    const paletteA = buildDwarvenPalette(makeDna({ seed: 1 }));
    const paletteB = buildDwarvenPalette(makeDna({ seed: 2 }));
    expect(paletteA.granite).not.toBe(paletteB.granite);
  });

  it('is sanity-compatible with getFootprint() for every canonical kind (no crash across all kinds)', () => {
    const kinds = ['house', 'terraced', 'villa', 'inn', 'shop', 'blacksmith', 'chapel', 'watchtower'] as const;
    for (const kind of kinds) {
      const dna = makeDna({ buildingKind: kind });
      expect(() => buildDwarvenPalette(dna)).not.toThrow();
      expect(getFootprint(kind, dna.size)).toBeTruthy();
    }
  });
});
