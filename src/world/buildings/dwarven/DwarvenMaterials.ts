import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { graniteTexture, ashlarTexture } from '../FactionBlockTextures';
import { slateTexture } from '../TextureFactory';

/**
 * DwarvenMaterials.ts — shared dwarven material palette (doctrine "stone
 * first, wood second, metal third"). `buildDwarvenPalette(dna)` is called
 * ONCE per building; every sub-builder receives and reuses these exact
 * material references for every block/course/prop it emits, so a single
 * building never clones a per-block material — matching the pattern
 * already established by `StoneTowerKit.ts`'s `StoneTowerPalette`.
 */
export interface DwarvenPalette {
  /** Warm main wall stone (granite ashlar coursing). */
  granite: THREE.MeshStandardMaterial;
  /** Darker stone for plinths, forge surrounds, and shaded reveals. */
  basalt: THREE.MeshStandardMaterial;
  /** Straps, bands, grilles, bolt plates. */
  iron: THREE.MeshStandardMaterial;
  /** Soot/heat-darkened stone near forge mouths and flues. */
  soot: THREE.MeshStandardMaterial;
  /** Planked doors, shutters, utility sheds, bellows housings. */
  wood: THREE.MeshStandardMaterial;
  /** Set-back window/door glazing — always behind a real recess. */
  darkGlass: THREE.MeshStandardMaterial;
  /** Glowing forge throat / ember plane. */
  forgeEmissive: THREE.MeshStandardMaterial;
  /** Stone/slate roof tile courses. */
  roofTile: THREE.MeshStandardMaterial;
  /** Hex metal plate roof variant (blacksmith/workshop). */
  roofMetal: THREE.MeshStandardMaterial;
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(1 - amount);
  return `#${color.getHexString()}`;
}

export function buildDwarvenPalette(dna: BuildingDNA): DwarvenPalette {
  const wallsColor = dna.colors.walls;
  const roofColor = dna.colors.roof;
  const trimColor = dna.colors.trim;

  return {
    granite: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: graniteTexture(2, 2),
      roughness: 0.92,
      metalness: 0.02,
    }),
    basalt: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.42),
      map: ashlarTexture(2, 2),
      roughness: 0.95,
      metalness: 0.02,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: darken(trimColor, 0.1),
      roughness: 0.42,
      metalness: 0.78,
    }),
    soot: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.72),
      roughness: 0.95,
      metalness: 0.05,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: '#4a3826',
      roughness: 0.85,
      metalness: 0,
    }),
    darkGlass: new THREE.MeshStandardMaterial({
      color: '#12140f',
      roughness: 0.35,
      metalness: 0.2,
    }),
    forgeEmissive: new THREE.MeshStandardMaterial({
      color: '#3a1a08',
      emissive: '#ff5a1e',
      emissiveIntensity: 1.6,
      roughness: 0.6,
      metalness: 0.1,
    }),
    roofTile: new THREE.MeshStandardMaterial({
      color: roofColor,
      map: slateTexture(3, 3),
      roughness: 0.9,
      metalness: 0.02,
    }),
    roofMetal: new THREE.MeshStandardMaterial({
      color: darken(trimColor, -0.4),
      roughness: 0.55,
      metalness: 0.6,
    }),
  };
}
