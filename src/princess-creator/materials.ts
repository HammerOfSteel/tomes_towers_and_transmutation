// ── MaterialKit: shared, retintable materials per archetype ─────────────────
//
//  Parts and synths NEVER create raw materials — they take kit slots, which is
//  what makes one-click palette swaps restyle everything (incl. parts) with
//  zero rebuild. kit.apply(dna) retints in place.

import * as THREE from 'three';
import type { Archetype, PrincessDNA } from './types';

export interface MaterialKit {
  archetype: Archetype;
  /** flat-shaded low-poly look (fox / skeleton) vs smooth toon (human). */
  flat: boolean;
  primary: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  hair: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  eyes: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  dark: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  blush: THREE.MeshStandardMaterial;
  apply(dna: PrincessDNA): void;
  dispose(): void;
}

function std(color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, ...opts });
}

function jelly(color: string, translucency: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.12,
    metalness: 0.05,
    transmission: translucency,
    thickness: 2.0,
    ior: 1.4,
    envMapIntensity: 1.6,
  });
}

export function createMaterialKit(dna: PrincessDNA): MaterialKit {
  const a = dna.archetype;
  const c = dna.colors;
  const flat = a === 'fox' || a === 'skeleton';

  let primary: MaterialKit['primary'];
  let skin: MaterialKit['skin'];
  let hairMat: MaterialKit['hair'];

  if (a === 'slime') {
    primary = jelly(c.primary, dna.species.translucency);
    skin = jelly(c.skin, dna.species.translucency);
    hairMat = jelly(c.hair, Math.min(0.85, dna.species.translucency + 0.1));
  } else {
    primary = std(c.primary, { roughness: flat ? 0.75 : 0.8, flatShading: flat });
    skin = std(c.skin, { roughness: flat ? 0.9 : 0.45, flatShading: flat });
    // DoubleSide: hair shells (bob curtain, long-hair panels) are open surfaces.
    hairMat = std(c.hair, { roughness: 0.7, flatShading: flat, side: THREE.DoubleSide });
  }

  const kit: MaterialKit = {
    archetype: a,
    flat,
    primary,
    secondary: std(c.secondary, { roughness: 0.8, flatShading: flat }),
    accent: std(c.accent, { roughness: 0.6, flatShading: flat }),
    skin,
    hair: hairMat,
    eyes: std(c.eyes, { roughness: 0.25 }),
    metal: std(c.metal, { roughness: 0.3, metalness: 0.85, flatShading: flat }),
    glow: new THREE.MeshBasicMaterial({ color: c.glow }),
    dark: std('#22222a', { roughness: 0.95, flatShading: flat }),
    white: std('#ffffff', { roughness: 0.35 }),
    blush: std('#ff7799', { transparent: true, opacity: 0.5, roughness: 0.9 }),

    apply(next: PrincessDNA): void {
      const n = next.colors;
      kit.primary.color.set(n.primary);
      kit.secondary.color.set(n.secondary);
      kit.accent.color.set(n.accent);
      kit.skin.color.set(n.skin);
      kit.hair.color.set(n.hair);
      kit.eyes.color.set(n.eyes);
      kit.metal.color.set(n.metal);
      kit.glow.color.set(n.glow);
      // Blush follows accent hue family, softened toward pink.
      kit.blush.color.set(n.accent).lerp(new THREE.Color('#ff7799'), 0.55);
      if (a === 'slime') {
        const t = next.species.translucency;
        (kit.primary as THREE.MeshPhysicalMaterial).transmission = t;
        (kit.skin as THREE.MeshPhysicalMaterial).transmission = t;
        (kit.hair as THREE.MeshPhysicalMaterial).transmission = Math.min(0.85, t + 0.1);
      }
    },

    dispose(): void {
      for (const m of [
        kit.primary, kit.secondary, kit.accent, kit.skin, kit.hair,
        kit.eyes, kit.metal, kit.glow, kit.dark, kit.white, kit.blush,
      ]) m.dispose();
    },
  };
  return kit;
}
