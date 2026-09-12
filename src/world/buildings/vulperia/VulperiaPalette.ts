import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { earthTexture, hideTexture } from '../FactionBlockTextures';
import { renderTexture, stoneTexture } from '../TextureFactory';

/**
 * VulperiaPalette.ts — shared vulperia material palette (design spec
 * `2026-09-04-vulperia-buildings-design.md`: fox-folk warren architecture,
 * warm/watchful/clever — coursed low stone plinths, warm cob/render
 * walls, timber framing, and thick sod/turf roofs). `buildVulperiaPalette(dna)`
 * is called ONCE per building; every sub-builder receives and reuses
 * these exact material references (never cloned per-instance), matching
 * `UndeadNecropolisPalette.ts`/`DwarvenMaterials.ts`'s convention so
 * `mergeGroupMeshesByMaterial()` can bucket a whole building's walls/
 * trim/glazing down to a small handful of draw calls.
 *
 * The design spec explicitly warns that warm wall/trim/door colors alone
 * "collapse into a blob" — this palette keeps a genuinely dark facade
 * accent (`darkTimber`) and a cool deep-green glazing/door accent
 * (`greenAccent`) distinct from the dominant ochre/brown warmth so every
 * building keeps real value contrast, not just hue variation.
 */
export interface VulperiaPalette {
  /** Low coursed stone plinth/quoins at every ground contact. */
  stone: THREE.MeshStandardMaterial;
  /** Warm cob/lime-render wall infill. */
  cob: THREE.MeshStandardMaterial;
  /** Exposed oak timber framing (posts, lintels, mullions). */
  timber: THREE.MeshStandardMaterial;
  /** Dark weathered timber accent — shutters, doors, verge boards. */
  darkTimber: THREE.MeshStandardMaterial;
  /** Warm amber lantern-lit glazing — the "watchful" motif. */
  glazing: THREE.MeshStandardMaterial;
  /** Cool deep-green accent — doors/shutter paint, kept visually distinct
   * from the dominant warm ochre so buildings don't collapse into a
   * single-hue blob (design spec's explicit warning). */
  greenAccent: THREE.MeshStandardMaterial;
  /** Bronze/brass fittings — door pulls, lantern cages, hinges. */
  bronze: THREE.MeshStandardMaterial;
  /** Packed earth/berm skirt at ground contact. */
  earth: THREE.MeshStandardMaterial;
  /** Turf roof: exposed rafter/board-end timber. */
  turfTimber: THREE.MeshStandardMaterial;
  /** Turf roof: board deck planking. */
  turfDeck: THREE.MeshStandardMaterial;
  /** Turf roof: dark verge/turf-stop trim. */
  turfStop: THREE.MeshStandardMaterial;
  /** Turf roof: exposed soil at cut turf edges. */
  turfSoil: THREE.MeshStandardMaterial;
  /** Turf roof: main grass-top surface. */
  turfGrass: THREE.MeshStandardMaterial;
  /** Turf roof: secondary grass tone for tuft/wildflower accents. */
  turfGrassAccent: THREE.MeshStandardMaterial;
  /** Woven-hide/felted awning cloth (Night Market stalls). */
  awning: THREE.MeshStandardMaterial;
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

export function buildVulperiaPalette(dna: BuildingDNA): VulperiaPalette {
  const wallsColor = dna.colors.walls ?? '#d4a060';
  const roofColor = dna.colors.roof ?? '#8a5020';
  const trimColor = dna.colors.trim ?? '#c88030';
  const doorColor = dna.colors.door ?? '#6a3810';

  return {
    stone: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.42),
      map: stoneTexture(2, 2),
      roughness: 0.9,
      metalness: 0.02,
    }),
    cob: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: renderTexture(2, 2),
      roughness: 0.86,
      metalness: 0,
    }),
    timber: new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.8,
      metalness: 0,
    }),
    darkTimber: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.15),
      roughness: 0.82,
      metalness: 0,
    }),
    glazing: new THREE.MeshStandardMaterial({
      color: '#2a1a08',
      emissive: '#f0b050',
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.05,
    }),
    greenAccent: new THREE.MeshStandardMaterial({
      color: '#2f5233',
      roughness: 0.7,
      metalness: 0,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: '#8a6a3a',
      roughness: 0.5,
      metalness: 0.55,
    }),
    earth: new THREE.MeshStandardMaterial({
      color: '#4a3520',
      map: earthTexture(2, 2),
      roughness: 0.95,
      metalness: 0,
    }),
    turfTimber: new THREE.MeshStandardMaterial({
      color: darken(trimColor, 0.35),
      roughness: 0.85,
      metalness: 0,
    }),
    turfDeck: new THREE.MeshStandardMaterial({
      color: darken(trimColor, 0.2),
      roughness: 0.82,
      metalness: 0,
    }),
    turfStop: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.2),
      roughness: 0.85,
      metalness: 0,
    }),
    turfSoil: new THREE.MeshStandardMaterial({
      color: '#3a2a18',
      map: earthTexture(1, 1),
      roughness: 0.96,
      metalness: 0,
    }),
    turfGrass: new THREE.MeshStandardMaterial({
      color: roofColor === '#8a5020' ? '#3d6b35' : lighten(roofColor, 0.1),
      roughness: 0.92,
      metalness: 0,
    }),
    turfGrassAccent: new THREE.MeshStandardMaterial({
      color: '#5a8a48',
      roughness: 0.9,
      metalness: 0,
    }),
    awning: new THREE.MeshStandardMaterial({
      color: trimColor,
      map: hideTexture(2, 1),
      roughness: 0.75,
      metalness: 0,
    }),
  };
}

/** Picks one of `options` using cumulative weights (need not sum to 1). */
export function pickVulperiaWeighted<T>(rand: () => number, options: Array<[T, number]>): T {
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
 * `DwarvenBuildingKit.ts`/`UndeadNecropolisPalette.ts`'s `tagSeed()` convention). */
export function tagVulperiaSeed(seed: number, tag: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h ^ (tag.charCodeAt(i) << ((i % 4) * 8))) >>> 0;
  }
  return h >>> 0;
}
