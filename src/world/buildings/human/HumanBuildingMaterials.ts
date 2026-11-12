import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { renderTexture, brickTexture, stoneTexture, slateTexture, thatchTexture } from '../TextureFactory';
import { barkTexture } from '../FactionBlockTextures';

/**
 * HumanBuildingMaterials.ts — shared human material palette (doctrine
 * "warm, mixed, and lived-in" per docs/superpowers/specs/2026-09-04-human-
 * buildings-design.md's palette rule). `buildHumanPalette(dna)` is called
 * ONCE per building; every sub-builder (TimberFrame, HumanJetty, roof
 * surfaces, openings, props) receives and reuses these exact material
 * references, so a single building never clones a per-piece material —
 * matching every prior race's own `<Race>Materials.ts` convention.
 *
 * Roof materials (clayTile/slate/thatch) intentionally use fixed,
 * mutually-distinct hex bases rather than `dna.colors.roof` -- a human
 * kind builder picks between three genuinely different roofing
 * TECHNIQUES per building (clay tile / slate / thatch), each with its
 * own real-world color identity; deriving all three from one DNA roof
 * color would make roof-type variety invisible.
 */
export interface HumanPalette {
  /** Main lime-render plaster infill. */
  plaster: THREE.MeshStandardMaterial;
  /** A second, slightly lighter/darker plaster tone for infill variety
   * across bays (never a material clone -- a genuinely separate,
   * pre-built reference). */
  plasterAlt: THREE.MeshStandardMaterial;
  /** A visibly different, less-weathered patch plaster for the
   * `repairPanel` TimberFrame pattern (mismatched-repair storytelling). */
  plasterRepair: THREE.MeshStandardMaterial;
  /** Oak structural timber: posts, rails, braces, studs, jetty beams. */
  oakTimber: THREE.MeshStandardMaterial;
  /** Darker, more weathered timber for shutters/doors/props. */
  darkTimber: THREE.MeshStandardMaterial;
  /** Weathered ground-floor masonry (stone plinths, chapel/watchtower walls). */
  weatheredStone: THREE.MeshStandardMaterial;
  /** Brick nogging infill variant. */
  brick: THREE.MeshStandardMaterial;
  /** Clay roof tile courses. */
  clayTile: THREE.MeshStandardMaterial;
  /** Slate roof tile courses. */
  slate: THREE.MeshStandardMaterial;
  /** Thatch roof-surface bundles. */
  thatch: THREE.MeshStandardMaterial;
  /** Iron straps, hinges, nails, weathervanes, chimney bands. */
  iron: THREE.MeshStandardMaterial;
  /** Set-back window/door glazing — always behind a real recess. */
  glazing: THREE.MeshStandardMaterial;
  /** Warm interior lamp-lit glazing variant (inn/shop windows at dusk). */
  litGlazing: THREE.MeshStandardMaterial;
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

export function buildHumanPalette(dna: BuildingDNA): HumanPalette {
  const wallsColor = dna.colors.walls;
  const doorColor = dna.colors.door;

  return {
    plaster: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: renderTexture(2, 2),
      roughness: 0.88,
      metalness: 0.01,
    }),
    plasterAlt: new THREE.MeshStandardMaterial({
      color: lighten(wallsColor, 0.12),
      map: renderTexture(2, 2),
      roughness: 0.86,
      metalness: 0.01,
    }),
    plasterRepair: new THREE.MeshStandardMaterial({
      color: lighten(wallsColor, 0.28),
      map: renderTexture(2, 2),
      roughness: 0.8,
      metalness: 0.01,
    }),
    oakTimber: new THREE.MeshStandardMaterial({
      color: '#4a2818',
      map: barkTexture(1.4, 1.4),
      roughness: 0.85,
      metalness: 0,
    }),
    darkTimber: new THREE.MeshStandardMaterial({
      color: darken(doorColor || '#4a2818', 0.15),
      roughness: 0.82,
      metalness: 0,
    }),
    weatheredStone: new THREE.MeshStandardMaterial({
      color: '#7b7468',
      map: stoneTexture(2, 2),
      roughness: 0.94,
      metalness: 0.02,
    }),
    brick: new THREE.MeshStandardMaterial({
      color: '#a05838',
      map: brickTexture(2, 2),
      roughness: 0.9,
      metalness: 0.01,
    }),
    clayTile: new THREE.MeshStandardMaterial({
      color: '#a84f2a',
      map: slateTexture(3, 3),
      roughness: 0.85,
      metalness: 0.02,
    }),
    slate: new THREE.MeshStandardMaterial({
      color: '#34383d',
      map: slateTexture(3, 3),
      roughness: 0.75,
      metalness: 0.05,
    }),
    thatch: new THREE.MeshStandardMaterial({
      color: '#8b7040',
      map: thatchTexture(2, 2),
      roughness: 0.98,
      metalness: 0,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: '#2a2520',
      roughness: 0.45,
      metalness: 0.75,
    }),
    glazing: new THREE.MeshStandardMaterial({
      color: '#141c1a',
      roughness: 0.3,
      metalness: 0.2,
    }),
    litGlazing: new THREE.MeshStandardMaterial({
      color: '#3a2c14',
      emissive: '#e8b25a',
      emissiveIntensity: 0.9,
      roughness: 0.35,
      metalness: 0.1,
    }),
  };
}
