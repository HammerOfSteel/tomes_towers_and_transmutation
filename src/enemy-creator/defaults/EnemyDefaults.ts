/**
 * EnemyDefaults.ts — PROC-B2f
 * Default enemy blueprints per floor tier + species.
 * Used by EnemyLoader when no custom blueprint exists.
 */

import type { EnemyDNA, EnemyCombatRole, EnemyMovement } from '../types';
import { mulberry32 } from '@/core/prng';

// ── Tier → visual palette ─────────────────────────────────────────────────────

const TIER_PALETTES: Record<number, EnemyDNA['colors'][]> = {
  1: [
    { body: '#4a4a6a', accent: '#8080c0', outline: '#111111' },  // dim purple
    { body: '#4a6a4a', accent: '#60c060', outline: '#111111' },  // dim green
    { body: '#6a4a4a', accent: '#c06060', outline: '#111111' },  // dim red
  ],
  2: [
    { body: '#2a2a8a', accent: '#4040ff', outline: '#000022' },  // electric blue
    { body: '#8a2a2a', accent: '#ff4040', outline: '#220000' },  // fiery red
    { body: '#2a6a2a', accent: '#40dd40', outline: '#002200' },  // poison green
  ],
  3: [
    { body: '#1a0a2e', accent: '#c040ff', outline: '#000000' },  // void purple
    { body: '#2e0a0a', accent: '#ff6000', outline: '#000000' },  // infernal orange
    { body: '#0a1a2e', accent: '#00c8ff', outline: '#000000' },  // abyssal blue
  ],
  4: [  // boss
    { body: '#0a0a0a', accent: '#ff2020', outline: '#000000' },  // obsidian + crimson
  ],
};

// ── Role → movement style ─────────────────────────────────────────────────────

const ROLE_MOVEMENT: Record<EnemyCombatRole, EnemyMovement> = {
  melee:   'charge',
  ranged:  'circle',
  caster:  'ambush',
  support: 'patrol',
  tank:    'charge',
  swarm:   'swarm',
};

// ── Floor → recommended tier ──────────────────────────────────────────────────

export function tierForFloor(floor: number): 1 | 2 | 3 {
  if (floor <= 1) return 1;
  if (floor <= 5) return 2;
  return 3;
}

// ── Main factory ──────────────────────────────────────────────────────────────

export function getDefaultEnemyDna(
  species:    EnemyDNA['species'],
  role:       EnemyCombatRole,
  tier:       EnemyDNA['tier'],
  seed:       number,
  isBoss = false,
): EnemyDNA {
  const r        = mulberry32(seed ^ 0xE4E41234);
  const palettes = TIER_PALETTES[tier] ?? TIER_PALETTES[1];
  const colors   = palettes[Math.floor(r() * palettes.length)];
  const movement = ROLE_MOVEMENT[role];

  const baseHpByTier:  Record<number, number> = { 1: 20, 2: 45, 3: 90, 4: 300 };
  const baseDmgByTier: Record<number, number> = { 1: 4,  2: 8,  3: 16, 4: 40  };
  const aggroByRole:   Record<EnemyCombatRole, number> = {
    melee: 8, ranged: 14, caster: 12, support: 10, tank: 6, swarm: 7,
  };

  return {
    v:           1,
    kind:        'enemy',
    name:        isBoss ? `Boss ${species}` : `${role} ${species}`,
    seed,
    species,
    combatRole:  role,
    tier,
    colors:      colors ?? TIER_PALETTES[1][0],
    movement,
    attackRange: role === 'ranged' ? 12 : role === 'caster' ? 10 : 2.5,
    aggroRange:  aggroByRole[role] ?? 8,
    baseHp:      isBoss ? baseHpByTier[4] : (baseHpByTier[tier] ?? 20),
    baseDmg:     isBoss ? baseDmgByTier[4] : (baseDmgByTier[tier] ?? 4),
    isBoss,
  };
}

// ── Floor encounter table ─────────────────────────────────────────────────────

/** Generate a set of enemy DNAs for a specific dungeon floor. */
export function getEnemiesForFloor(
  floor: number,
  count: number,
  seed:  number,
): EnemyDNA[] {
  const tier    = tierForFloor(floor);
  const r       = mulberry32(seed ^ 0xF100_DEAD);
  const roles:  EnemyCombatRole[] = ['melee', 'melee', 'ranged', 'caster', 'tank', 'swarm'];
  const species: EnemyDNA['species'][] = ['undead', 'undead', 'human', 'elf', 'draconic', 'slime'];

  return Array.from({ length: count }, (_, i) => {
    const enemySeed = (seed ^ (i * 0x9E37_79B9)) >>> 0;
    const sp   = species[Math.floor(r() * species.length)];
    const role = roles[Math.floor(r() * roles.length)];
    return getDefaultEnemyDna(sp, role, tier, enemySeed);
  });
}

// ── 7 named boss defaults (one per species, tier 4) ───────────────────────────

export const BOSS_DEFAULTS: readonly EnemyDNA[] = [
  getDefaultEnemyDna('human',     'caster',  4, 0x00B0551, true),
  getDefaultEnemyDna('undead',    'tank',    4, 0x00DEAD42, true),
  getDefaultEnemyDna('vulperia',  'melee',   4, 0x00F0A123, true),
  getDefaultEnemyDna('slime',     'swarm',   4, 0x005A11E2, true),
  getDefaultEnemyDna('elf',       'ranged',  4, 0x00E1F112, true),
  getDefaultEnemyDna('celestial', 'support', 4, 0x00CE1112, true),
  getDefaultEnemyDna('draconic',  'melee',   4, 0x00D8A112, true),
];
