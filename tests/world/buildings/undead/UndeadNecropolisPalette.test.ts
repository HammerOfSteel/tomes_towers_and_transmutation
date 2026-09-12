import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildUndeadPalette, pickUndeadWeighted, tagUndeadSeed } from '@/world/buildings/undead/UndeadNecropolisPalette';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDna(overrides: Partial<BuildingDNA> = {}): BuildingDNA {
  return {
    seed: 12345,
    faction: 'undead_common',
    buildingKind: 'house',
    size: 'small',
    style: 'stone',
    condition: 'ruined',
    floors: 1,
    colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' },
    ...overrides,
  } as BuildingDNA;
}

describe('buildUndeadPalette', () => {
  it('builds every named material role exactly once (never cloned per call)', () => {
    const palette = buildUndeadPalette(makeDna());
    const roles: Array<keyof typeof palette> = [
      'stone', 'spolia', 'darkStone', 'iron', 'timber', 'roofSlate', 'sealedGlazing', 'lanternGlow', 'bronze', 'bonePale',
    ];
    for (const role of roles) {
      expect(palette[role]).toBeInstanceOf(THREE.Material);
    }
    // Distinct material identities so mergeGroupMeshesByMaterial can bucket correctly.
    const identities = new Set(roles.map((r) => palette[r]));
    expect(identities.size).toBe(roles.length);
  });

  it('lanternGlow is the only material with meaningful emissive intensity by default', () => {
    const palette = buildUndeadPalette(makeDna());
    expect(palette.lanternGlow.emissiveIntensity).toBeGreaterThan(0.5);
    expect(palette.sealedGlazing.emissiveIntensity).toBe(0);
  });

  it('spolia is a visibly different tone from the base stone (mismatched patch)', () => {
    const palette = buildUndeadPalette(makeDna());
    expect(palette.spolia.color.getHexString()).not.toBe(palette.stone.color.getHexString());
  });

  it('derives colors from dna.colors so different DNA yields different materials', () => {
    const a = buildUndeadPalette(makeDna({ colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' } }));
    const b = buildUndeadPalette(makeDna({ colors: { walls: '#302010', roof: '#100804', trim: '#181008', door: '#080604' } }));
    expect(a.stone.color.getHexString()).not.toBe(b.stone.color.getHexString());
  });
});

describe('pickUndeadWeighted', () => {
  it('respects cumulative weighting deterministically', () => {
    const options: Array<[string, number]> = [['a', 50], ['b', 30], ['c', 20]];
    expect(pickUndeadWeighted(() => 0.01, options)).toBe('a');
    expect(pickUndeadWeighted(() => 0.99, options)).toBe('c');
  });
});

describe('tagUndeadSeed', () => {
  it('is deterministic and differs by tag', () => {
    const a = tagUndeadSeed(42, 'DOOR');
    const b = tagUndeadSeed(42, 'ROOF');
    const aAgain = tagUndeadSeed(42, 'DOOR');
    expect(a).toBe(aAgain);
    expect(a).not.toBe(b);
  });
});
