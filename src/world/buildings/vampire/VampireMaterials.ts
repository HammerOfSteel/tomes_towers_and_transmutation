import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { ashlarTexture } from '../FactionBlockTextures';
import { renderTexture, brickTexture, slateTexture } from '../TextureFactory';

/**
 * VampireMaterials.ts — shared vampire material palette (design spec
 * "Material palette and construction": charcoal-blue/grey ashlar, pale cold
 * limewash, dark timber framing, or blackened brick walls; deep red/plum-
 * black slate roofs with visible courses; wrought iron; warm occupied
 * window glow). `buildVampirePalette(dna)` is called ONCE per building;
 * every sub-builder receives and reuses these exact material references
 * (never cloned per-instance), matching `DwarvenMaterials.ts`'s
 * `buildDwarvenPalette()`/`OrcishMaterials.ts`'s `buildOrcishPalette()`
 * convention so `mergeGroupMeshesByMaterial()` can bucket a whole
 * building's walls/trim/glazing down to a small handful of draw calls.
 */
export interface VampirePalette {
  /** Main wall stone: charcoal-blue/grey ashlar coursing. */
  ashlar: THREE.MeshStandardMaterial;
  /** Alternate wall finish: pale, cold rendered limewash. */
  limewash: THREE.MeshStandardMaterial;
  /** Alternate wall finish: blackened brick. */
  blackBrick: THREE.MeshStandardMaterial;
  /** Dark timber framing: shutters, doors, oriel mullions. */
  darkTimber: THREE.MeshStandardMaterial;
  /** Deep red/plum-black slate roof tile courses. */
  roofTile: THREE.MeshStandardMaterial;
  /** Wrought iron: railings, balconies, hinges, finials, gates. */
  iron: THREE.MeshStandardMaterial;
  /** Pale stone quoins/surrounds/sills/string courses -- contrast trim. */
  stoneTrim: THREE.MeshStandardMaterial;
  /** Warm amber-lit glazing -- an occupied, maintained household. */
  amberGlass: THREE.MeshStandardMaterial;
  /** Deep blood-red glow glazing variant (chapel/villa accent). */
  bloodGlass: THREE.MeshStandardMaterial;
  /** Plain unlit dark glazing behind closed shutters -- no emissive. */
  darkGlass: THREE.MeshStandardMaterial;
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

export function buildVampirePalette(dna: BuildingDNA): VampirePalette {
  const wallsColor = dna.colors.walls ?? '#2a2030';
  const roofColor = dna.colors.roof ?? '#1a1020';
  const trimColor = dna.colors.trim ?? '#4a3050';
  const doorColor = dna.colors.door ?? '#8a2020';

  return {
    ashlar: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: ashlarTexture(2, 2),
      roughness: 0.88,
      metalness: 0.03,
    }),
    limewash: new THREE.MeshStandardMaterial({
      color: lighten(wallsColor, 0.55),
      map: renderTexture(2, 2),
      roughness: 0.78,
      metalness: 0.01,
    }),
    blackBrick: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.3),
      map: brickTexture(2, 2),
      roughness: 0.85,
      metalness: 0.02,
    }),
    darkTimber: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.55),
      roughness: 0.82,
      metalness: 0,
    }),
    roofTile: new THREE.MeshStandardMaterial({
      color: roofColor,
      map: slateTexture(3, 3),
      roughness: 0.85,
      metalness: 0.05,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: darken(trimColor, 0.15),
      roughness: 0.4,
      metalness: 0.75,
    }),
    stoneTrim: new THREE.MeshStandardMaterial({
      color: lighten(trimColor, 0.3),
      roughness: 0.75,
      metalness: 0.03,
    }),
    amberGlass: new THREE.MeshStandardMaterial({
      color: '#2a1a08',
      emissive: '#e8a030',
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.1,
    }),
    bloodGlass: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.5),
      emissive: doorColor,
      emissiveIntensity: 0.9,
      roughness: 0.28,
      metalness: 0.1,
    }),
    darkGlass: new THREE.MeshStandardMaterial({
      color: '#0c0a10',
      roughness: 0.35,
      metalness: 0.15,
      emissiveIntensity: 0,
    }),
  };
}
