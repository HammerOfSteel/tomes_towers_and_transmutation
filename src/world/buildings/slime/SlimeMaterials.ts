import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

export interface SlimeHueFamilyDefinition {
  light: string;
  dark: string;
  weight: number;
}

export const SLIME_HUE_FAMILIES = {
  mint_green: { light: '#aaffcc', dark: '#66ffaa', weight: 0.30 },
  azure_blue: { light: '#7ec8ff', dark: '#3d9dff', weight: 0.20 },
  bubblegum_pink: { light: '#ff9ee8', dark: '#ff5cc8', weight: 0.20 },
  violet_purple: { light: '#c79bff', dark: '#9a5bff', weight: 0.15 },
  cyan_teal: { light: '#7ffff0', dark: '#2be8d4', weight: 0.15 },
} as const satisfies Record<string, SlimeHueFamilyDefinition>;

export type SlimeHueFamilyId = keyof typeof SLIME_HUE_FAMILIES;

// Ordered by hue around the available neon gamut; the warm-spectrum gap is absent,
// so the ring closes from bubblegum pink back to mint green as a stylised palette step.
export const SLIME_HUE_RING: readonly SlimeHueFamilyId[] = [
  'mint_green',
  'cyan_teal',
  'azure_blue',
  'violet_purple',
  'bubblegum_pink',
] as const;

export interface SlimeMaterialSet {
  gel: THREE.MeshStandardMaterial;
  gelDark: THREE.MeshStandardMaterial;
  gelGlow: THREE.MeshStandardMaterial;
  hardenedGel: THREE.MeshStandardMaterial;
  wetStain: THREE.MeshStandardMaterial;
  containedGel: THREE.MeshStandardMaterial;
  hueFamilies: readonly SlimeHueFamilyId[];
}

export type SlimeHueSelection = SlimeHueFamilyId | readonly [SlimeHueFamilyId, SlimeHueFamilyId];

// Readable lip thickness for sill/string-course accretions at the shared 3.2 WU storey scale.
export const GEL_LIP_HEIGHT = 0.08;
// Membrane sheets need a real proud frame depth so they read as rimmed inserts, not flat planes.
export const MEMBRANE_RIM_DEPTH = 0.04;
// Thin tendrils stay below opening-scale trim while remaining visible at isometric distance.
export const TENDRIL_RADIUS_MIN = 0.04;
// Heavy tendril bridges cap out below anchor-pad massing so they never become pipe-like trunks.
export const TENDRIL_RADIUS_MAX = 0.09;
// Ground-contact puddle tiles stay within the spec's shallow 0.02–0.05 WU hover band.
export const PUDDLE_TILE_THICKNESS = 0.035;

export const MIMIC_FILLET_RADIUS_MIN = 0.06;
export const MIMIC_FILLET_RADIUS_MAX = 0.10;
export const MIMIC_RIDGE_SAG_MIN = 0.05;
export const MIMIC_RIDGE_SAG_MAX = 0.12;

const HUE_FAMILY_IDS = Object.keys(SLIME_HUE_FAMILIES) as SlimeHueFamilyId[];
const ELDER_BLEND_SALT = 0x51_1d_e2;

function blendColors(left: THREE.ColorRepresentation, right: THREE.ColorRepresentation, t: number): THREE.Color {
  return new THREE.Color(left).lerp(new THREE.Color(right), t);
}

function scaleLightness(color: THREE.ColorRepresentation, factor: number): THREE.Color {
  const scaled = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  scaled.getHSL(hsl);
  scaled.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l * factor, 0, 1));
  return scaled;
}

function assertHueFamilyId(id: string): asserts id is SlimeHueFamilyId {
  if (!(id in SLIME_HUE_FAMILIES)) {
    throw new Error(`Unknown slime hue family "${id}"`);
  }
}

function assertAdjacentBlend(families: readonly [SlimeHueFamilyId, SlimeHueFamilyId]): void {
  const [first, second] = families;
  const firstIndex = SLIME_HUE_RING.indexOf(first);
  const secondIndex = SLIME_HUE_RING.indexOf(second);
  const diff = Math.abs(firstIndex - secondIndex);
  const adjacent = diff === 1 || diff === SLIME_HUE_RING.length - 1;
  if (!adjacent || first === second) {
    throw new Error(`Elder hue blends must use adjacent families, got "${first}" + "${second}"`);
  }
}

function resolveFamilies(selection: SlimeHueSelection): readonly [SlimeHueFamilyId, SlimeHueFamilyId?] {
  if (Array.isArray(selection)) {
    const [first, second] = selection;
    assertHueFamilyId(first);
    assertHueFamilyId(second);
    assertAdjacentBlend([first, second]);
    return [first, second];
  }

  if (typeof selection === 'string') {
    assertHueFamilyId(selection);
    return [selection];
  }

  throw new Error('Invalid slime hue selection');
}

function buildLightColor(families: readonly [SlimeHueFamilyId, SlimeHueFamilyId?]): THREE.Color {
  const [primary, secondary] = families;
  if (!secondary) return new THREE.Color(SLIME_HUE_FAMILIES[primary].light);
  return blendColors(
    SLIME_HUE_FAMILIES[primary].light,
    SLIME_HUE_FAMILIES[secondary].light,
    0.5,
  );
}

function buildAccentColor(families: readonly [SlimeHueFamilyId, SlimeHueFamilyId?]): THREE.Color {
  const [primary, secondary] = families;
  if (!secondary) return new THREE.Color(SLIME_HUE_FAMILIES[primary].dark);
  return blendColors(
    SLIME_HUE_FAMILIES[primary].light,
    SLIME_HUE_FAMILIES[secondary].dark,
    0.58,
  );
}

export function rollSlimeHueFamily(seed: number): SlimeHueFamilyId {
  const rand = mulberry32(seed >>> 0);
  const roll = rand();
  let cumulative = 0;

  for (const familyId of HUE_FAMILY_IDS) {
    cumulative += SLIME_HUE_FAMILIES[familyId].weight;
    if (roll <= cumulative) return familyId;
  }

  return HUE_FAMILY_IDS[HUE_FAMILY_IDS.length - 1]!;
}

export function rollElderHueBlend(seed: number): [SlimeHueFamilyId, SlimeHueFamilyId] {
  const primary = rollSlimeHueFamily(seed);
  const rand = mulberry32(((seed >>> 0) ^ ELDER_BLEND_SALT) >>> 0);
  const direction = rand() < 0.5 ? -1 : 1;
  const primaryIndex = SLIME_HUE_RING.indexOf(primary);
  const secondary = SLIME_HUE_RING[
    (primaryIndex + direction + SLIME_HUE_RING.length) % SLIME_HUE_RING.length
  ]!;
  return [primary, secondary];
}

export function createSlimeMaterialSet(selection: SlimeHueSelection): SlimeMaterialSet {
  const families = resolveFamilies(selection);
  const lightColor = buildLightColor(families);
  const accentColor = buildAccentColor(families);
  const gelDarkColor = scaleLightness(lightColor, 0.35);
  const hardenedColor = blendColors(gelDarkColor, accentColor, 0.28);
  const stainColor = scaleLightness(gelDarkColor, 0.78);

  const gel = new THREE.MeshStandardMaterial({
    color: lightColor,
    roughness: 0.28,
    metalness: 0.02,
  });
  const gelDark = new THREE.MeshStandardMaterial({
    color: gelDarkColor,
    roughness: 0.52,
    metalness: 0.01,
  });
  const gelGlow = new THREE.MeshStandardMaterial({
    color: lightColor.clone(),
    roughness: 0.16,
    metalness: 0,
    transparent: true,
    opacity: 0.74,
    emissive: accentColor.clone(),
    emissiveIntensity: 0.95,
  });
  const hardenedGel = new THREE.MeshStandardMaterial({
    color: hardenedColor,
    roughness: 0.7,
    metalness: 0.03,
  });
  const wetStain = new THREE.MeshStandardMaterial({
    color: stainColor,
    roughness: 0.88,
    metalness: 0,
  });
  // Contained volumes and gel lenses are the only other slot that stays translucent:
  // they represent framed vats/membranes rather than the hard outer accretion plates.
  const containedGel = new THREE.MeshStandardMaterial({
    color: blendColors(lightColor, accentColor, 0.35),
    roughness: 0.18,
    metalness: 0,
    transparent: true,
    opacity: 0.64,
    emissive: accentColor.clone(),
    emissiveIntensity: 0.72,
    side: THREE.DoubleSide,
  });

  return {
    gel,
    gelDark,
    gelGlow,
    hardenedGel,
    wetStain,
    containedGel,
    hueFamilies: families.filter((family): family is SlimeHueFamilyId => !!family),
  };
}
