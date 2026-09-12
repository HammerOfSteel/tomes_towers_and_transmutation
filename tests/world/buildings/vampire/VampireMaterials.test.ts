import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STYLE_COLORS, type BuildingDNA } from '@/world/buildings/BuildingDNA';
import { buildVampirePalette } from '@/world/buildings/vampire/VampireMaterials';

function makeDna(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    v: 1, kind: 'building', name: 'test vampire', seed: 12345,
    buildingKind: 'house', size: 'small', floors: 1,
    style: 'vampiric', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['vampiric'], rotation: 0, faction: 'vampire',
    terrace: 'none', features: [],
    ...overrides,
  };
}

describe('buildVampirePalette', () => {
  it('returns every required material role', () => {
    const palette = buildVampirePalette(makeDna());
    for (const key of [
      'ashlar', 'limewash', 'blackBrick', 'darkTimber', 'roofTile',
      'iron', 'stoneTrim', 'amberGlass', 'bloodGlass', 'darkGlass',
    ] as const) {
      expect(palette[key]).toBeInstanceOf(THREE.Material);
    }
  });

  it('returns the SAME material reference across repeated reads within one call (no per-block cloning)', () => {
    const palette = buildVampirePalette(makeDna());
    const a = palette.ashlar;
    const b = palette.ashlar;
    expect(a).toBe(b);
  });

  it('produces distinct palettes for distinct calls so callers never mutate a shared global singleton by accident', () => {
    const paletteA = buildVampirePalette(makeDna({ seed: 1 }));
    const paletteB = buildVampirePalette(makeDna({ seed: 2 }));
    expect(paletteA.ashlar).not.toBe(paletteB.ashlar);
  });

  it('derives wall/roof/trim colors from the building DNA, not hardcoded constants', () => {
    const palette = buildVampirePalette(makeDna({ colors: { walls: '#334455', roof: '#112233', trim: '#556677', door: '#997766' } }));
    expect(palette.ashlar.color.getHexString()).toBe('334455');
    expect(palette.roofTile.color.getHexString()).toBe('112233');
  });

  it('gives amber and blood glazing variants a warm emissive glow (occupied, not derelict)', () => {
    const palette = buildVampirePalette(makeDna());
    expect(palette.amberGlass.emissiveIntensity).toBeGreaterThan(0);
    expect(palette.bloodGlass.emissiveIntensity).toBeGreaterThan(0);
    const amberEmissive = palette.amberGlass.emissive.getHexString();
    const bloodEmissive = palette.bloodGlass.emissive.getHexString();
    expect(amberEmissive).not.toBe('000000');
    expect(bloodEmissive).not.toBe('000000');
    expect(amberEmissive).not.toBe(bloodEmissive);
  });

  it('gives the plain dark glazing no emissive glow (shuttered/unlit variant)', () => {
    const palette = buildVampirePalette(makeDna());
    expect(palette.darkGlass.emissiveIntensity).toBe(0);
  });
});
