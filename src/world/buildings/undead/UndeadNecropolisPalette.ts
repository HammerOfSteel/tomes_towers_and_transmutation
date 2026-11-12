import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { ashStoneTexture, ashlarTexture } from '../FactionBlockTextures';
import { slateTexture } from '../TextureFactory';

/**
 * UndeadNecropolisPalette.ts — shared undead material palette (design spec
 * `2026-09-04-undead-buildings-design.md` §2: funerary-classical, ashen
 * stone, maintained decay rather than beautiful ruin or gothic horror).
 * `buildUndeadPalette(dna)` is called ONCE per building; every sub-builder
 * receives and reuses these exact material references (never cloned
 * per-instance), matching `VampireMaterials.ts`/`DwarvenMaterials.ts`'s
 * convention so `mergeGroupMeshesByMaterial()` can bucket a whole
 * building's walls/trim/glazing down to a small handful of draw calls.
 */
export interface UndeadPalette {
  /** Main wall stone: ashen grey ashlar coursing. */
  stone: THREE.MeshStandardMaterial;
  /** Mismatched spolia/repair-patch stone -- a visibly different tone
   * dropped into an otherwise uniform course, per the design spec's
   * "mismatched replacement-stone patch" callouts. */
  spolia: THREE.MeshStandardMaterial;
  /** Dark recess/reveal stone -- the shadowed cavity behind every opening. */
  darkStone: THREE.MeshStandardMaterial;
  /** Wrought iron: grille bars, rails, straps, gate leaves, lantern cages. */
  iron: THREE.MeshStandardMaterial;
  /** Aged timber: repair doors, shoring props, gallows brackets. */
  timber: THREE.MeshStandardMaterial;
  /** Slate/stone-slab roofing. */
  roofSlate: THREE.MeshStandardMaterial;
  /** Sealed/dark glazing behind grille bars -- undead's closed apertures
   * read as sealed tomb slabs, not lit occupied glass. */
  sealedGlazing: THREE.MeshStandardMaterial;
  /** Warm lantern-pane glow -- a minority accent among cold stone. */
  lanternGlow: THREE.MeshStandardMaterial;
  /** Pale bronze/verdigris for plaques, medallions, and cast fittings. */
  bronze: THREE.MeshStandardMaterial;
  /** Bone-pale stone for skull bosses/carved reliefs -- used sparingly. */
  bonePale: THREE.MeshStandardMaterial;
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

export function buildUndeadPalette(dna: BuildingDNA): UndeadPalette {
  const wallsColor = dna.colors.walls ?? '#5a5048';
  const roofColor = dna.colors.roof ?? '#383028';
  const trimColor = dna.colors.trim ?? '#2a2020';
  const doorColor = dna.colors.door ?? '#1a1a18';

  return {
    stone: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: ashStoneTexture(2, 2),
      roughness: 0.92,
      metalness: 0.02,
    }),
    spolia: new THREE.MeshStandardMaterial({
      color: lighten(wallsColor, 0.12),
      map: ashlarTexture(2, 2),
      roughness: 0.88,
      metalness: 0.02,
    }),
    darkStone: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.55),
      roughness: 0.95,
      metalness: 0,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: darken(trimColor, 0.1),
      roughness: 0.45,
      metalness: 0.72,
    }),
    timber: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.1),
      roughness: 0.85,
      metalness: 0,
    }),
    roofSlate: new THREE.MeshStandardMaterial({
      color: roofColor,
      map: slateTexture(3, 3),
      roughness: 0.88,
      metalness: 0.04,
    }),
    sealedGlazing: new THREE.MeshStandardMaterial({
      color: '#0a0a08',
      roughness: 0.5,
      metalness: 0.1,
      emissiveIntensity: 0,
    }),
    lanternGlow: new THREE.MeshStandardMaterial({
      color: '#3a2a10',
      emissive: '#e8b04a',
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.05,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: '#5a6a52',
      roughness: 0.55,
      metalness: 0.55,
    }),
    bonePale: new THREE.MeshStandardMaterial({
      color: '#c8bfa8',
      roughness: 0.7,
      metalness: 0,
    }),
  };
}

/** Picks one of `options` using cumulative weights (need not sum to 1) --
 * generalized for shared use across all undead builder files. */
export function pickUndeadWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
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
 * `DwarvenBuildingKit.ts`'s `tagSeed()` convention). */
export function tagUndeadSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}
