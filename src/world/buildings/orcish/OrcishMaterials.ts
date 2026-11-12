import * as THREE from 'three';
import type { BuildingDNA } from '../BuildingDNA';
import { barkTexture, hideTexture } from '../FactionBlockTextures';
import { cobblestoneTexture } from '../TextureFactory';

/**
 * OrcishMaterials.ts — shared orcish material palette (design spec:
 * "lashed timber, stretched hide, red awnings, trophy bones, patched
 * salvage, and crude but purposeful metalwork"). `buildOrcishPalette(dna)`
 * is called ONCE per building; every sub-builder receives and reuses
 * these exact material references (never cloned per-instance), matching
 * `DwarvenMaterials.ts`'s `buildDwarvenPalette()` convention so
 * `mergeGroupMeshesByMaterial()` can bucket a whole building's logs/
 * hide-bays/lashings down to a small handful of draw calls.
 */
export interface OrcishPalette {
  /** Lashed-log wall / post / rib timber (earth brown `#6a5838`). */
  timber: THREE.MeshStandardMaterial;
  /** Stretched-hide roof/wall skin (dark hide `#3a2818`). */
  hide: THREE.MeshStandardMaterial;
  /** Lashing bands, post caps, ochre trim (`#8a6840`). */
  trim: THREE.MeshStandardMaterial;
  /** Set-back door/glazing plane (very dark, doctrine `-0.20`). */
  darkGlazing: THREE.MeshStandardMaterial;
  /** Bone/tusk finials, trophy skulls (`#d8c9a0`). */
  bone: THREE.MeshStandardMaterial;
  /** Dull rivet iron: straps, bindings, forge chimney plates (`#5a5650`). */
  iron: THREE.MeshStandardMaterial;
  /** Faction-signal red cloth: awnings, banners (`#9b1515`). */
  redCloth: THREE.MeshStandardMaterial;
  /** Rough stone: plinths, forge pads, hearth walls. */
  stone: THREE.MeshStandardMaterial;
  /** Glowing forge throat / ember plane. */
  forgeEmissive: THREE.MeshStandardMaterial;
  /** Mismatched scavenged-patch timber (lighter/greyer than `timber`), used
   * for the "mixed salvage logs"/"logs+shield salvage" wall-palette axis. */
  patch: THREE.MeshStandardMaterial;
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(1 - amount);
  return `#${color.getHexString()}`;
}

export function buildOrcishPalette(dna: BuildingDNA): OrcishPalette {
  const wallsColor = dna.colors.walls ?? '#6a5838';
  const roofColor = dna.colors.roof ?? '#3a2818';
  const trimColor = dna.colors.trim ?? '#8a6840';
  const doorColor = dna.colors.door ?? '#2a1810';

  return {
    timber: new THREE.MeshStandardMaterial({
      color: wallsColor,
      map: barkTexture(1.5, 1.5),
      roughness: 0.92,
      metalness: 0.02,
    }),
    hide: new THREE.MeshStandardMaterial({
      color: roofColor,
      map: hideTexture(1.5, 1.5),
      roughness: 0.88,
      metalness: 0.01,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.82,
      metalness: 0.05,
    }),
    darkGlazing: new THREE.MeshStandardMaterial({
      color: darken(doorColor, 0.35),
      roughness: 0.6,
      metalness: 0.1,
    }),
    bone: new THREE.MeshStandardMaterial({
      color: '#d8c9a0',
      roughness: 0.7,
      metalness: 0.03,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: '#5a5650',
      roughness: 0.55,
      metalness: 0.65,
    }),
    redCloth: new THREE.MeshStandardMaterial({
      color: '#9b1515',
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: darken(wallsColor, 0.35),
      map: cobblestoneTexture(2, 2),
      roughness: 0.95,
      metalness: 0.02,
    }),
    forgeEmissive: new THREE.MeshStandardMaterial({
      color: '#3a1a08',
      emissive: '#ff5a1e',
      emissiveIntensity: 1.6,
      roughness: 0.6,
      metalness: 0.1,
    }),
    patch: new THREE.MeshStandardMaterial({
      color: darken(trimColor, -0.12), // lighter/greyer than trim -- reads as a mismatched scavenged patch
      map: barkTexture(1.2, 1.2),
      roughness: 0.9,
      metalness: 0.02,
    }),
  };
}
