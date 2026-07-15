/**
 * wizardManifest.ts — definitions for the three randomly-chosen captor wizards.
 *
 * Clip names confirmed by inspection of GLB JSON chunks:
 *   - Idle: "Idle_4" / "Idle_7" / "Idle_11"  (all start with "Idle")
 *   - Walk: "Walking"
 */

export interface WizardDef {
  readonly id:       string;
  readonly meshPath: string;   // T-pose mesh (Character_output)
  readonly animPath: string;   // merged animations GLB (self-contained)
  /** Clip names — verified at extraction time. */
  readonly clipWalk: string;
  readonly clipIdle: string;   // varies per wizard
}

export const WIZARD_DEFS: readonly WizardDef[] = [
  {
    id:       'toad',
    meshPath: '/assets/characters/wizards/toad/mesh.glb',
    animPath: '/assets/characters/wizards/toad/anims.glb',
    clipWalk: 'Walking',
    clipIdle: 'Idle_7',
  },
  {
    id:       'elf',
    meshPath: '/assets/characters/wizards/elf/mesh.glb',
    animPath: '/assets/characters/wizards/elf/anims.glb',
    clipWalk: 'Walking',
    clipIdle: 'Idle_4',
  },
  {
    id:       'lizard',
    meshPath: '/assets/characters/wizards/lizard/mesh.glb',
    animPath: '/assets/characters/wizards/lizard/anims.glb',
    clipWalk: 'Walking',
    clipIdle: 'Idle_11',
  },
] as const;

export type WizardId = typeof WIZARD_DEFS[number]['id'];

/** Pick a random wizard definition using Math.random(). */
export function randomWizardDef(): WizardDef {
  return WIZARD_DEFS[Math.floor(Math.random() * WIZARD_DEFS.length)];
}
