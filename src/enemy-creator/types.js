/**
 * types.ts — PROC-B2a
 * EnemyDNA: data model for a procedural enemy.
 * Extends ProceduralDNA (kind = 'enemy').
 */
// ── Tier scaling helpers ──────────────────────────────────────────────────────
export const TIER_HP_MULT = { 1: 1, 2: 2.5, 3: 5, 4: 20 };
export const TIER_DMG_MULT = { 1: 1, 2: 1.5, 3: 2.5, 4: 6 };
export const TIER_SCALE = { 1: 0.9, 2: 1.0, 3: 1.15, 4: 1.5 };
export function scaledHp(dna) { return Math.round(dna.baseHp * TIER_HP_MULT[dna.tier]); }
export function scaledDmg(dna) { return Math.round(dna.baseDmg * TIER_DMG_MULT[dna.tier]); }
