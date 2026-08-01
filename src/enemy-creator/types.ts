/**
 * types.ts — PROC-B2a
 * EnemyDNA: data model for a procedural enemy.
 * Extends ProceduralDNA (kind = 'enemy').
 */

import type { ProceduralDNA, GameSpecies } from '@/procedural/ProceduralDNA';

export type EnemyCombatRole = 'melee' | 'ranged' | 'caster' | 'support' | 'tank' | 'swarm';
export type EnemyTierLevel  = 1 | 2 | 3 | 4;   // 4 = boss
export type EnemyMovement   = 'patrol' | 'charge' | 'circle' | 'ambush' | 'swarm';

export interface EnemyColors {
  body:    string;   // main body hex
  accent:  string;   // eye glow / weapon
  outline: string;
}

export interface EnemyDNA extends ProceduralDNA {
  readonly kind: 'enemy';
  species:     GameSpecies;
  combatRole:  EnemyCombatRole;
  tier:        EnemyTierLevel;
  colors:      EnemyColors;
  movement:    EnemyMovement;
  /** Attack range in world units. */
  attackRange: number;
  /** Aggro detection radius. */
  aggroRange:  number;
  /** Base HP (before tier scaling). */
  baseHp:      number;
  /** Base damage per hit. */
  baseDmg:     number;
  /** Whether this is a boss variant. */
  isBoss:      boolean;
}

// ── Tier scaling helpers ──────────────────────────────────────────────────────

export const TIER_HP_MULT:  Record<EnemyTierLevel, number> = { 1: 1, 2: 2.5, 3: 5, 4: 20 };
export const TIER_DMG_MULT: Record<EnemyTierLevel, number> = { 1: 1, 2: 1.5, 3: 2.5, 4: 6 };
export const TIER_SCALE:    Record<EnemyTierLevel, number> = { 1: 0.9, 2: 1.0, 3: 1.15, 4: 1.5 };

export function scaledHp(dna:  EnemyDNA): number { return Math.round(dna.baseHp  * TIER_HP_MULT[dna.tier]); }
export function scaledDmg(dna: EnemyDNA): number { return Math.round(dna.baseDmg * TIER_DMG_MULT[dna.tier]); }
