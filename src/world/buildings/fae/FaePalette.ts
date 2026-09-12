import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { barkTexture, toadstoolTexture, earthTexture } from '../FactionBlockTextures';
import { stoneTexture } from '../TextureFactory';

/**
 * FaePalette.ts — shared fae material palette
 * (docs/superpowers/specs/2026-09-04-fae-buildings-design.md: storybook
 * stump/fungal cottages -- bark-strip stump walls, glowing petal-pink/
 * purple caps and trim, oversized warmly-glowing openings, mossy
 * root-flare grounding). `buildFaePalette(dna)` is called ONCE per
 * building; every sub-builder reuses these exact material references
 * (never cloned per-instance), matching `VulperiaPalette.ts`'s convention
 * so `mergeGroupMeshesByMaterial()` can bucket a whole building's parts
 * down to a small handful of draw calls.
 *
 * The design spec's default fae DNA colors (`STYLE_COLORS.fae`) are a
 * pastel pink/purple accent set -- gorgeous for caps/trim/petals, but
 * wrong for the actual stump walls (which read as bark, not lavender
 * plastic, in every fae reference image). This palette therefore keeps
 * the wall/bark material on a fixed warm neutral bark hue (lightly tinted
 * by `dna.colors.walls` for per-building variety) and reserves the vivid
 * pink/purple/teal DNA accents for the cap, trim, and petal materials
 * where the reference art actually puts them -- while still keeping a
 * genuinely dark/desaturated grounding tone and a bright warm glow
 * distinct from the pastel hues, so buildings don't collapse into one
 * candy-colored blob (the same warning `VulperiaPalette.ts` calls out).
 */
export interface FaePalette {
  /** Bark-strip stump/trunk wall material. */
  bark: THREE.MeshStandardMaterial;
  /** Darker bark accent for waist bands/root toes/window reveals. */
  darkBark: THREE.MeshStandardMaterial;
  /** Mushroom-cap / curled-shingle-roof tile material. */
  cap: THREE.MeshStandardMaterial;
  /** Cap rim / scalloped drip-edge accent, a shade darker than `cap`. */
  capRim: THREE.MeshStandardMaterial;
  /** Underside gill fins -- pale, faintly luminous. */
  gill: THREE.MeshStandardMaterial;
  /** Petal/trim accent -- window surrounds, petal-shop awnings, flower boxes. */
  petal: THREE.MeshStandardMaterial;
  /** Door leaf / shutter accent. */
  door: THREE.MeshStandardMaterial;
  /** Warm glowing window/door glazing -- the oversized "inhabited" glow. */
  glow: THREE.MeshStandardMaterial;
  /** Root-toe / grounding timber. */
  root: THREE.MeshStandardMaterial;
  /** Moss pad ground-contact accent. */
  moss: THREE.MeshStandardMaterial;
  /** Embedded stones in the root-flare skirt. */
  stone: THREE.MeshStandardMaterial;
  /** Bronze/brass fittings -- lantern cages, hinges, door pulls. */
  bronze: THREE.MeshStandardMaterial;
  /** Vine/tendril foliage accent. */
  vine: THREE.MeshStandardMaterial;
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(1 - amount);
  return `#${color.getHexString()}`;
}

function lighten(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.lerp(new THREE.Color('#ffffff'), amount);
  return `#${color.getHexString()}`;
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = new THREE.Color(hexA);
  const b = new THREE.Color(hexB);
  return `#${a.lerp(b, t).getHexString()}`;
}

export function buildFaePalette(dna: BuildingDNA): FaePalette {
  const wallsAccent = dna.colors.walls ?? '#c8a8d0';
  const roofColor = dna.colors.roof ?? '#a080b0';
  const trimColor = dna.colors.trim ?? '#f0d8f8';
  const doorColor = dna.colors.door ?? '#9060a8';

  // Bark stays a warm neutral brown-tan; the DNA "walls" accent is only
  // lightly mixed in (15%) so seeds still visibly vary without ever
  // producing lavender bark.
  const barkBase = mix('#7a5a3a', wallsAccent, 0.15);

  return {
    bark: new THREE.MeshStandardMaterial({
      color: barkBase,
      map: barkTexture(2, 2),
      roughness: 0.88,
      metalness: 0,
    }),
    darkBark: new THREE.MeshStandardMaterial({
      color: darken(barkBase, 0.32),
      map: barkTexture(1, 1),
      roughness: 0.9,
      metalness: 0,
    }),
    cap: new THREE.MeshStandardMaterial({
      color: roofColor,
      map: toadstoolTexture(2, 2),
      roughness: 0.55,
      metalness: 0,
    }),
    capRim: new THREE.MeshStandardMaterial({
      color: darken(roofColor, 0.28),
      map: toadstoolTexture(1, 1),
      roughness: 0.6,
      metalness: 0,
    }),
    gill: new THREE.MeshStandardMaterial({
      color: lighten(roofColor, 0.55),
      roughness: 0.5,
      metalness: 0,
    }),
    petal: new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    door: new THREE.MeshStandardMaterial({
      color: doorColor,
      roughness: 0.7,
      metalness: 0,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: '#3a2408',
      emissive: '#ffcf6e',
      emissiveIntensity: 1.1,
      roughness: 0.3,
      metalness: 0.05,
    }),
    root: new THREE.MeshStandardMaterial({
      color: darken(barkBase, 0.2),
      map: barkTexture(1, 1),
      roughness: 0.9,
      metalness: 0,
    }),
    moss: new THREE.MeshStandardMaterial({
      color: '#4d7a3a',
      map: earthTexture(1, 1),
      roughness: 0.95,
      metalness: 0,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: '#8a8a86',
      map: stoneTexture(1, 1),
      roughness: 0.85,
      metalness: 0.02,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: '#8a6a3a',
      roughness: 0.5,
      metalness: 0.55,
    }),
    vine: new THREE.MeshStandardMaterial({
      color: '#3f6b32',
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  };
}

/** Picks one of `options` using cumulative weights (need not sum to 1). */
export function pickFaeWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1]![0];
}

/** Mixes a short ASCII tag into a seed so every sub-feature gets its own
 * independent, deterministic RNG stream from one building seed (matches
 * `VulperiaPalette.ts`'s `tagVulperiaSeed()` convention). */
export function tagFaeSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}
