/**
 * NpcDefaults.ts — PROC-B1g
 *
 * 6 default NPC blueprints, one per game species.
 * Used by NPCSpawner when no custom blueprint exists for a role/location.
 *
 * `getDefaultNpcForRole(species, role, seed)` builds a deterministic NpcDNA
 * without requiring a gallery lookup.
 */

import type { NpcDNA, NpcRole, NpcPersonality } from '../types';
import { ROLE_HAT, ROLE_TOOL, ROLE_BADGE } from '../types';
import { mulberry32 } from '@/core/prng';

// ── Per-species color palettes ────────────────────────────────────────────────

const SPECIES_COLORS: Record<string, NpcDNA['colors']> = {
  human: {
    primary:   '#5b6e9a',
    secondary: '#3d4f7c',
    skin:      '#f5c5a3',
    hair:      '#4a3728',
    eyes:      '#5b7c9a',
  },
  undead: {
    primary:   '#2a2a3e',
    secondary: '#0d4a4a',
    skin:      '#c8c8c8',
    hair:      '#1a1a2e',
    eyes:      '#00ffcc',
  },
  vulperia: {
    primary:   '#8b5e3c',
    secondary: '#c48a52',
    skin:      '#f5c5a3',
    hair:      '#92400e',
    eyes:      '#b45309',
  },
  slime: {
    primary:   '#22c55e',
    secondary: '#16a34a',
    skin:      '#bbf7d0',
    hair:      '#22c55e',
    eyes:      '#16a34a',
  },
  elf: {
    primary:   '#3d6b4f',
    secondary: '#2d5a3f',
    skin:      '#e8d5c4',
    hair:      '#c8b560',
    eyes:      '#52b788',
  },
  celestial: {
    primary:   '#6b4aae',
    secondary: '#9b7de0',
    skin:      '#fde8d8',
    hair:      '#f0e0c0',
    eyes:      '#c084fc',
  },
  draconic: {
    primary:   '#7a2020',
    secondary: '#c84040',
    skin:      '#d4a574',
    hair:      '#450a0a',
    eyes:      '#dc2626',
  },
};

// ── Role → personality bias ───────────────────────────────────────────────────

const ROLE_PERSONALITY: Record<NpcRole, NpcPersonality[]> = {
  merchant:    ['friendly', 'cheerful', 'formal'],
  elder:       ['formal', 'friendly', 'wary'],
  quest_giver: ['friendly', 'wary', 'eccentric'],
  scholar:     ['eccentric', 'formal', 'wary'],
  guard:       ['formal', 'wary', 'formal'],
  innkeeper:   ['cheerful', 'friendly', 'eccentric'],
  mysterious:  ['wary', 'eccentric', 'wary'],
};

// ── Main factory ──────────────────────────────────────────────────────────────

/**
 * Build a default NpcDNA for a given species + role.
 * `locationSeed` makes the result deterministic for a specific location.
 */
export function getDefaultNpcDna(
  species: NpcDNA['species'],
  role:    NpcRole,
  seed:    number,
): NpcDNA {
  const r = mulberry32(seed ^ 0xABC1_2345);

  const personalities = ROLE_PERSONALITY[role];
  const personality   = personalities[Math.floor(r() * personalities.length)];
  const colors        = SPECIES_COLORS[species] ?? SPECIES_COLORS['human'];
  const bodyPreset    = ([0, 1, 1, 1, 2][Math.floor(r() * 5)] ?? 1) as 0 | 1 | 2;

  return {
    v:             1,
    kind:          'npc',
    name:          '',            // filled in by NPCSpawner via npcName()
    seed,
    species,
    role,
    personality,
    bodyPreset,
    colors,
    hat:           ROLE_HAT[role],
    tool:          ROLE_TOOL[role],
    badge:         ROLE_BADGE[role],
    dialogue_seed: (seed * 0x9E37_79B9) >>> 0,
  };
}

// ── 6 named defaults (one per species, role = merchant) ───────────────────────

export const NPC_DEFAULTS: readonly NpcDNA[] = [
  getDefaultNpcDna('human',     'merchant',    0x00BEEF01),
  getDefaultNpcDna('undead',    'scholar',     0x00DEAD11),
  getDefaultNpcDna('vulperia',  'guard',       0x00F0A111),
  getDefaultNpcDna('slime',     'innkeeper',   0x005A11E1),
  getDefaultNpcDna('elf',       'quest_giver', 0x00E1F111),
  getDefaultNpcDna('celestial', 'elder',       0x00CE1111),
  getDefaultNpcDna('draconic',  'mysterious',  0x00D8A111),
];
