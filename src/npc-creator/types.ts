/**
 * types.ts — PROC-B1a
 *
 * NpcDNA: the data model for a procedural NPC.
 * Extends ProceduralDNA (kind = 'npc').
 *
 * Designed to drive `buildNpc(dna)` — no Three.js in here.
 */

import type { ProceduralDNA, GameSpecies } from '@/procedural/ProceduralDNA';

// ── Role & personality ────────────────────────────────────────────────────────

export type NpcRole =
  | 'merchant'
  | 'elder'
  | 'quest_giver'
  | 'scholar'
  | 'guard'
  | 'innkeeper'
  | 'mysterious';

export type NpcPersonality =
  | 'friendly'
  | 'wary'
  | 'eccentric'
  | 'formal'
  | 'cheerful';

// ── Accessory slots ───────────────────────────────────────────────────────────

export type NpcHatId =
  | 'none'
  | 'hood'          // traveller's hood
  | 'wide_brim'     // merchant / scholar
  | 'soldier_helm'  // guard
  | 'crown_simple'  // elder / village head
  | 'blindfold';    // mysterious

export type NpcToolId =
  | 'none'
  | 'staff'
  | 'lantern'
  | 'scroll'
  | 'coin_pouch'
  | 'sword'
  | 'shield'
  | 'book';

export type NpcBadgeId =
  | 'none'
  | 'merchant_guild'
  | 'town_guard'
  | 'scholars_pin'
  | 'quest_seal';

// ── Color scheme ──────────────────────────────────────────────────────────────

export interface NpcColors {
  /** Main clothing colour (hex string). */
  primary:   string;
  secondary: string;
  /** Skin tone (hex string). */
  skin:      string;
  /** Hair / equivalent (hex string). */
  hair:      string;
  /** Eye colour (hex string). */
  eyes:      string;
}

// ── Core DNA ──────────────────────────────────────────────────────────────────

export interface NpcDNA extends ProceduralDNA {
  readonly kind: 'npc';
  /** Game-world species drives body shape archetype. */
  species:     GameSpecies;
  role:        NpcRole;
  personality: NpcPersonality;
  /** Controls body proportions: 0 = petite, 1 = average, 2 = imposing. */
  bodyPreset:  0 | 1 | 2;
  colors:      NpcColors;
  hat:         NpcHatId;
  tool:        NpcToolId;
  badge:       NpcBadgeId;
  /**
   * Seeded value that drives dialogue line selection from templates.
   * Changing this changes what the NPC says without affecting appearance.
   */
  dialogue_seed: number;
}

// ── Role → default hat / tool ─────────────────────────────────────────────────

export const ROLE_HAT: Record<NpcRole, NpcHatId> = {
  merchant:    'wide_brim',
  elder:       'crown_simple',
  quest_giver: 'hood',
  scholar:     'wide_brim',
  guard:       'soldier_helm',
  innkeeper:   'none',
  mysterious:  'blindfold',
};

export const ROLE_TOOL: Record<NpcRole, NpcToolId> = {
  merchant:    'coin_pouch',
  elder:       'staff',
  quest_giver: 'scroll',
  scholar:     'book',
  guard:       'sword',
  innkeeper:   'lantern',
  mysterious:  'staff',
};

export const ROLE_BADGE: Record<NpcRole, NpcBadgeId> = {
  merchant:    'merchant_guild',
  elder:       'none',
  quest_giver: 'quest_seal',
  scholar:     'scholars_pin',
  guard:       'town_guard',
  innkeeper:   'none',
  mysterious:  'none',
};
