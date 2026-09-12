import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SLIME_HUE_FAMILIES,
  SLIME_HUE_RING,
  rollSlimeHueFamily,
  rollElderHueBlend,
  createSlimeMaterialSet,
  MIMIC_FILLET_RADIUS_MIN,
  MIMIC_FILLET_RADIUS_MAX,
  MIMIC_RIDGE_SAG_MIN,
  MIMIC_RIDGE_SAG_MAX,
  GEL_LIP_HEIGHT,
  MEMBRANE_RIM_DEPTH,
  TENDRIL_RADIUS_MIN,
  TENDRIL_RADIUS_MAX,
  PUDDLE_TILE_THICKNESS,
} from '@/world/buildings/slime/SlimeMaterials';

const EXPECTED_FAMILIES = {
  mint_green: { light: '#aaffcc', dark: '#66ffaa', weight: 0.30 },
  azure_blue: { light: '#7ec8ff', dark: '#3d9dff', weight: 0.20 },
  bubblegum_pink: { light: '#ff9ee8', dark: '#ff5cc8', weight: 0.20 },
  violet_purple: { light: '#c79bff', dark: '#9a5bff', weight: 0.15 },
  cyan_teal: { light: '#7ffff0', dark: '#2be8d4', weight: 0.15 },
} as const;

type HueFamilyId = keyof typeof EXPECTED_FAMILIES;

const HUE_FAMILY_IDS = Object.keys(EXPECTED_FAMILIES) as HueFamilyId[];

function hslLightness(color: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return hsl.l;
}

function areAdjacentFamilies(a: HueFamilyId, b: HueFamilyId): boolean {
  const firstIndex = SLIME_HUE_RING.indexOf(a);
  const secondIndex = SLIME_HUE_RING.indexOf(b);
  if (firstIndex === -1 || secondIndex === -1) return false;
  const diff = Math.abs(firstIndex - secondIndex);
  return diff === 1 || diff === SLIME_HUE_RING.length - 1;
}

describe('SlimeMaterials', () => {
  it('exports the exact five named hue families and weights summing to one', () => {
    expect(SLIME_HUE_FAMILIES).toEqual(EXPECTED_FAMILIES);
    expect(Object.keys(SLIME_HUE_FAMILIES)).toHaveLength(5);

    const totalWeight = Object.values(SLIME_HUE_FAMILIES).reduce((sum, family) => sum + family.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });

  it('rollSlimeHueFamily is deterministic and stays within the declared weight tolerance over a large seed sample', () => {
    const sampleSeeds = [0, 1, 2, 7, 19, 42, 99, 0xC0FFEE];
    for (const seed of sampleSeeds) {
      expect(rollSlimeHueFamily(seed)).toBe(rollSlimeHueFamily(seed));
      expect(HUE_FAMILY_IDS).toContain(rollSlimeHueFamily(seed) as HueFamilyId);
    }

    const counts = new Map<HueFamilyId, number>(HUE_FAMILY_IDS.map(id => [id, 0]));
    const sampleSize = 5000;
    // 5000 deterministic samples keep ordinary binomial wobble comfortably below
    // ±3 percentage points for all declared weights, so wider drift here points to
    // a weighting bug rather than harmless sample noise.
    const tolerance = 0.03;

    for (let seed = 0; seed < sampleSize; seed++) {
      const family = rollSlimeHueFamily(seed) as HueFamilyId;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }

    for (const familyId of HUE_FAMILY_IDS) {
      const observed = (counts.get(familyId) ?? 0) / sampleSize;
      expect(observed).toBeCloseTo(EXPECTED_FAMILIES[familyId].weight, 1);
      expect(Math.abs(observed - EXPECTED_FAMILIES[familyId].weight)).toBeLessThanOrEqual(tolerance);
    }
  });

  it('rollElderHueBlend returns two deterministic adjacent families from the declared ring', () => {
    expect(SLIME_HUE_RING).toHaveLength(5);
    expect(new Set(SLIME_HUE_RING).size).toBe(5);
    expect([...SLIME_HUE_RING].sort()).toEqual([...HUE_FAMILY_IDS].sort());

    for (let seed = 0; seed < 128; seed++) {
      const blend = rollElderHueBlend(seed);
      expect(blend).toEqual(rollElderHueBlend(seed));

      const [first, second] = blend;
      expect(HUE_FAMILY_IDS).toContain(first as HueFamilyId);
      expect(HUE_FAMILY_IDS).toContain(second as HueFamilyId);
      expect(first).not.toBe(second);
      expect(areAdjacentFamilies(first as HueFamilyId, second as HueFamilyId)).toBe(true);
    }
  });

  it('creates named reusable material slots with gelDark computed from about 35% of the light tone luminance', () => {
    const set = createSlimeMaterialSet('mint_green');

    expect(set.gel).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.gelDark).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.gelGlow).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.hardenedGel).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.wetStain).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.containedGel).toBeInstanceOf(THREE.MeshStandardMaterial);

    expect(set.gel.transparent).toBe(false);
    expect(set.gelDark.transparent).toBe(false);
    expect(set.hardenedGel.transparent).toBe(false);
    expect(set.wetStain.transparent).toBe(false);
    expect(set.gelGlow.transparent).toBe(true);
    expect(set.containedGel.transparent).toBe(true);
    expect(set.gelGlow.emissive.getHex()).not.toBe(0x000000);
    expect(set.containedGel.emissive.getHex()).not.toBe(0x000000);

    const lightness = hslLightness(set.gel.color);
    const darkLightness = hslLightness(set.gelDark.color);
    expect(darkLightness).toBeCloseTo(lightness * 0.35, 3);
    expect(set.gelDark.color.getHexString()).not.toBe(new THREE.Color(EXPECTED_FAMILIES.mint_green.dark).getHexString());

    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), set.gel);
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), set.gel);
    expect(meshA.material).toBe(meshB.material);
    expect(meshA.material).toBe(set.gel);
  });

  it('supports adjacent elder hue blends when creating a material set', () => {
    const set = createSlimeMaterialSet(['azure_blue', 'violet_purple']);

    expect(set.gel).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(set.gelGlow).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(hslLightness(set.gel.color)).toBeGreaterThan(0.2);
    expect(set.containedGel.transparent).toBe(true);
  });

  it('exports the mimic-rounding constants and positive accretion sizing constants', () => {
    expect(MIMIC_FILLET_RADIUS_MIN).toBeCloseTo(0.06, 6);
    expect(MIMIC_FILLET_RADIUS_MAX).toBeCloseTo(0.10, 6);
    expect(MIMIC_RIDGE_SAG_MIN).toBeCloseTo(0.05, 6);
    expect(MIMIC_RIDGE_SAG_MAX).toBeCloseTo(0.12, 6);

    expect(GEL_LIP_HEIGHT).toBeGreaterThan(0);
    expect(MEMBRANE_RIM_DEPTH).toBeGreaterThan(0);
    expect(TENDRIL_RADIUS_MIN).toBeGreaterThan(0);
    expect(TENDRIL_RADIUS_MAX).toBeGreaterThan(TENDRIL_RADIUS_MIN);
    expect(PUDDLE_TILE_THICKNESS).toBeGreaterThan(0);
    expect(PUDDLE_TILE_THICKNESS).toBeLessThan(0.1);
  });
});
