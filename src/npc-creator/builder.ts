/**
 * builder.ts — PROC-B1b/c
 *
 * `buildNpc(dna)` → NpcInstance
 *
 * Called by BOTH:
 *   - The NPC Creator atelier (preview)
 *   - The game's NPCSpawner at settlement-load time
 *
 * Implementation: maps NpcDNA to a PrincessDNA and delegates to buildPrincess.
 * NPCs are commoners — same procedural rig, but role-appropriate appearance.
 */

import type { NpcDNA, NpcRole } from './types';
import type { PrincessDNA } from '@/princess-creator/types';
import type { BuiltEntity } from '@/procedural/builder/BaseBuilder';

// ── Public contract ───────────────────────────────────────────────────────────

export interface NpcInstance extends BuiltEntity<NpcDNA> {
  /** Trigger the speaking/gesturing animation. */
  speak():  void;
  /** Return to idle loop. */
  stopSpeaking(): void;
}

// ── Species → archetype PrincessDNA base ────────────────────────────────────

/**
 * Per-species base PrincessDNA that makes NPCs look like commoners.
 * No crowns, plain dress, sensible proportions.
 */
const SPECIES_BASE: Record<string, Partial<PrincessDNA>> = {
  human: {
    species: 'human', archetype: 'human',
    dress: { style: 'aline', flare: 0.9, length: 1, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
             tail: 'none', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
  },
  undead: {
    species: 'skeleton', archetype: 'skeleton',
    dress: { style: 'slim', flare: 0.8, length: 1.1, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
             tail: 'none', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
    face: { eyeStyle: 'void', eyeSize: 1.1, eyeSpacing: 1, eyeTilt: 0, blush: 0, mouth: 'none' },
  },
  vulperia: {
    species: 'foxling', archetype: 'fox',
    dress: { style: 'aline', flare: 1, length: 0.9, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'fox', earSize: 1.1,
             tail: 'fluffy', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
  },
  slime: {
    species: 'slime', archetype: 'slime',
    dress: { style: 'bell', flare: 1.1, length: 1, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
             tail: 'none', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
  },
  elf: {
    species: 'elf', archetype: 'human',
    dress: { style: 'slim', flare: 0.85, length: 1.1, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'long', earSize: 1.1,
             tail: 'none', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
  },
  celestial: {
    species: 'celestial', archetype: 'human',
    dress: { style: 'bell', flare: 1, length: 1, trim: true, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
             tail: 'none', tailSize: 1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
    traits: { snoutLength: 1, fluff: 1, wobble: 0.4, translucency: 0.6, coreGlow: 0.5, boneThickness: 0.9, eyeGlowIntensity: 1.2 },
  },
  draconic: {
    species: 'draconic', archetype: 'fox',
    dress: { style: 'aline', flare: 0.9, length: 0.9, trim: false, sash: false, puffSleeves: false },
    parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'horn_small', earSize: 1,
             tail: 'thin', tailSize: 1.1, back: 'none', backSize: 1,
             handL: 'none', handR: 'none', handSize: 1, glasses: false },
  },
};

// ── Role → hand item mapping ─────────────────────────────────────────────────

const ROLE_HAND_R: Record<NpcRole, import('@/princess-creator/types').HandItemId> = {
  merchant:    'none',
  elder:       'staff',
  quest_giver: 'none',
  scholar:     'tome',
  guard:       'none',
  innkeeper:   'none',
  mysterious:  'staff',
};

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a procedural NPC from a DNA blueprint.
 * Returns an NpcInstance; caller is responsible for adding `.root` to the scene.
 */
export async function buildNpc(dna: NpcDNA): Promise<NpcInstance> {
  const { buildPrincess } = await import('@/princess-creator/factory');
  const { sanitizeDna }   = await import('@/princess-creator/dna');

  const base = SPECIES_BASE[dna.species] ?? SPECIES_BASE['human'];

  // Build a PrincessDNA that makes this NPC look the part
  const pDna: PrincessDNA = {
    v: 2,
    name:      dna.name,
    seed:      dna.seed,
    species:   (base.species ?? 'human') as PrincessDNA['species'],
    archetype: (base.archetype ?? 'human') as PrincessDNA['archetype'],
    pclass:    'none',
    subtype:   '',
    aura: { style: 'none', intensity: 0 },
    body: {
      height:        dna.bodyPreset === 0 ? 0.9 : dna.bodyPreset === 2 ? 1.1 : 1,
      headSize:      1,
      chubbiness:    dna.bodyPreset === 2 ? 1.1 : 0.9,
      armLength:     1,
      legLength:     1,
      shoulderWidth: dna.bodyPreset === 2 ? 1.1 : 0.95,
      hipWidth:      1,
    },
    dress: { ...{ style: 'aline', flare: 1, length: 1, trim: false, sash: false, puffSleeves: false }, ...(base.dress ?? {}) } as PrincessDNA['dress'],
    face: {
      eyeStyle:   'round',
      eyeSize:    1,
      eyeSpacing: 1,
      eyeTilt:    0,
      blush:      dna.personality === 'friendly' || dna.personality === 'cheerful' ? 0.4 : 0.1,
      mouth:      dna.personality === 'cheerful' ? 'smile' : dna.personality === 'formal' ? 'none' : 'smile',
      ...((base.face ?? {}) as Partial<PrincessDNA['face']>),
    },
    hair: { style: 'bob', length: 1 },
    parts: {
      crown: 'none', crownTilt: 0, crownSize: 1,
      ears: 'none', earSize: 1,
      tail: 'none', tailSize: 1,
      back: 'none', backSize: 1,
      handL: 'none',
      handR: ROLE_HAND_R[dna.role],
      handSize: 1,
      glasses: false,
      ...((base.parts ?? {}) as Partial<PrincessDNA['parts']>),
    },
    colors: {
      primary:   dna.colors.primary,
      secondary: dna.colors.secondary,
      tertiary:  '#ffffff',
      skin:      dna.colors.skin,
      hair:      dna.colors.hair,
      eyes:      dna.colors.eyes,
      outline:   '#111111',
      aura:      '#ffffff',
    },
    traits: {
      snoutLength: 1, fluff: 1, wobble: 0.5, translucency: 0.5,
      coreGlow: 0.1, boneThickness: 1, eyeGlowIntensity: 0.8,
      ...((base.traits ?? {}) as Partial<PrincessDNA['traits']>),
    },
    motion: {
      energy:    dna.personality === 'cheerful' ? 0.8 : dna.personality === 'formal' ? 0.4 : 0.6,
      bounce:    dna.personality === 'cheerful' ? 0.7 : 0.4,
      idleStyle: dna.personality === 'eccentric' ? 'bob' : 'sway',
    },
  };

  const safeDna  = sanitizeDna(pDna);
  if (!safeDna) throw new Error(`[buildNpc] sanitizeDna failed for NPC "${dna.name}"`);

  const inst = buildPrincess(safeDna, { targetHeight: 1.55 });
  // Tag root so scene queries can identify NPCs
  inst.root.userData['npcRole']    = dna.role;
  inst.root.userData['npcSpecies'] = dna.species;
  inst.root.userData['npcName']    = dna.name;
  inst.root.userData['npcSeed']    = dna.seed;

  let _speaking = false;

  return {
    root:    inst.root,
    dna,
    update(t: number, dt: number) {
      inst.update(t, dt);
    },
    dispose() {
      inst.dispose();
    },
    speak() {
      if (!_speaking) {
        _speaking = true;
        inst.setState('read');       // "read" = thoughtful gesture loop
      }
    },
    stopSpeaking() {
      if (_speaking) {
        _speaking = false;
        inst.setState('idle');
      }
    },
  };
}

/** Synchronous convenience wrapper — logs a warning if import hasn't resolved yet. */
export function buildNpcSync(dna: NpcDNA): NpcInstance {
  // Build a placeholder immediately; replace async once factory loads
  const placeholder: NpcInstance = {
    root:         (() => { const { Group } = require('three') as typeof import('three'); return new Group(); })(),
    dna,
    update:       () => {},
    dispose:      () => {},
    speak:        () => {},
    stopSpeaking: () => {},
  };
  buildNpc(dna).then(inst => {
    // Swap geometry when ready
    placeholder.root.add(inst.root);
    placeholder.update       = (t, dt) => inst.update(t, dt);
    placeholder.dispose      = () => { inst.dispose(); };
    placeholder.speak        = () => inst.speak();
    placeholder.stopSpeaking = () => inst.stopSpeaking();
  }).catch(e => console.error('[buildNpcSync] async build failed:', e));
  return placeholder;
}
