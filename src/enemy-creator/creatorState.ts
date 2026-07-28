/**
 * creatorState.ts — Procedural Asset Designer / Enemy Designer
 * (asset-designer.md "Enemy Designer"; game-inventory.md 12b "Enemy Creator
 * first slice")
 *
 * Pure state-management layer for an enemy-mode surface inside
 * `creature-lab.html`. Mirrors `src/npc-creator/creatorState.ts`'s
 * architecture exactly: zero DOM/Three.js dependencies, fully unit-tested —
 * the actual UI just wires DOM events to these functions and calls
 * `buildEnemy(dna)` (existing PROC-B2 builder) for the live preview.
 *
 * Required first-slice output per game-inventory.md 12b:
 *   - tier / role / weapon controls  → setTier, setCombatRole, setMovement
 *   - preview metadata               → dna itself (scaledHp/scaledDmg helpers)
 *   - save to AssetLibrary           → toLibraryPayload
 */

import type { GameSpecies } from '@/procedural/ProceduralDNA';
import type {
  EnemyDNA, EnemyCombatRole, EnemyTierLevel, EnemyMovement, EnemyColors,
} from './types';
import { getDefaultEnemyDna } from './defaults/EnemyDefaults';

// ── Supported pickers (per EnemyDNA contract) ────────────────────────────────

export const ENEMY_CREATOR_SPECIES: readonly GameSpecies[] =
  ['human', 'undead', 'vulperia', 'slime', 'elf', 'celestial', 'draconic'];

export const ENEMY_CREATOR_ROLES: readonly EnemyCombatRole[] =
  ['melee', 'ranged', 'caster', 'support', 'tank', 'swarm'];

export const ENEMY_CREATOR_TIERS: readonly EnemyTierLevel[] = [1, 2, 3, 4];

export const ENEMY_CREATOR_MOVEMENTS: readonly EnemyMovement[] =
  ['patrol', 'charge', 'circle', 'ambush', 'swarm'];

// ── Creator state ─────────────────────────────────────────────────────────────

export interface EnemyCreatorState {
  dna: EnemyDNA;
}

/** Fresh creator state seeded from the default builder for (species, role, tier). */
export function createInitialEnemyState(
  species: GameSpecies = 'human',
  role: EnemyCombatRole = 'melee',
  tier: EnemyTierLevel = 1,
  seed: number = Date.now() >>> 0,
): EnemyCreatorState {
  return { dna: getDefaultEnemyDna(species, role, tier, seed) };
}

/** Switch species — keeps role/tier/seed, rebuilds default combat stats/colors for the new species. */
export function setSpecies(state: EnemyCreatorState, species: GameSpecies): EnemyCreatorState {
  const rebuilt = getDefaultEnemyDna(species, state.dna.combatRole, state.dna.tier, state.dna.seed, state.dna.isBoss);
  return { dna: { ...rebuilt, name: state.dna.name } };
}

/** Switch combat role — rebuilds movement/attackRange/aggroRange defaults for the new role. */
export function setCombatRole(state: EnemyCreatorState, role: EnemyCombatRole): EnemyCreatorState {
  const rebuilt = getDefaultEnemyDna(state.dna.species, role, state.dna.tier, state.dna.seed, state.dna.isBoss);
  return { dna: { ...rebuilt, name: state.dna.name, colors: state.dna.colors } };
}

/** Switch tier — rebuilds baseHp/baseDmg/palette for the new tier; keeps role/species/seed. */
export function setTier(state: EnemyCreatorState, tier: EnemyTierLevel): EnemyCreatorState {
  const rebuilt = getDefaultEnemyDna(state.dna.species, state.dna.combatRole, tier, state.dna.seed, state.dna.isBoss);
  return { dna: { ...rebuilt, name: state.dna.name } };
}

export function setMovement(state: EnemyCreatorState, movement: EnemyMovement): EnemyCreatorState {
  return { dna: { ...state.dna, movement } };
}

export function setIsBoss(state: EnemyCreatorState, isBoss: boolean): EnemyCreatorState {
  return { dna: { ...state.dna, isBoss } };
}

export function setColor(state: EnemyCreatorState, slot: keyof EnemyColors, hex: string): EnemyCreatorState {
  return { dna: { ...state.dna, colors: { ...state.dna.colors, [slot]: hex } } };
}

export function setName(state: EnemyCreatorState, name: string): EnemyCreatorState {
  return { dna: { ...state.dna, name } };
}

export function setAttackRange(state: EnemyCreatorState, attackRange: number): EnemyCreatorState {
  return { dna: { ...state.dna, attackRange } };
}

export function setAggroRange(state: EnemyCreatorState, aggroRange: number): EnemyCreatorState {
  return { dna: { ...state.dna, aggroRange } };
}

export function setBaseHp(state: EnemyCreatorState, baseHp: number): EnemyCreatorState {
  return { dna: { ...state.dna, baseHp } };
}

export function setBaseDmg(state: EnemyCreatorState, baseDmg: number): EnemyCreatorState {
  return { dna: { ...state.dna, baseDmg } };
}

// ── Asset Library bridge ──────────────────────────────────────────────────────

/**
 * Shape a LibraryEntry-ready payload for `AssetLibrary.add()`.
 * Mirrors `buildingCreatorState.ts`'s `toLibraryPayload` convention — caller
 * supplies `id`/`createdAt`/`thumbnail`, keeping this module free of an
 * AssetLibrary import for isolated testability.
 */
export function toLibraryPayload(state: EnemyCreatorState): {
  type: 'enemy';
  name: string;
  seed: number;
  tags: string[];
  data: EnemyDNA;
} {
  return {
    type: 'enemy',
    name: state.dna.name || `${state.dna.combatRole} ${state.dna.species}`,
    seed: state.dna.seed,
    tags: [
      `role:${state.dna.combatRole}`,
      `tier:${state.dna.tier}`,
      `species:${state.dna.species}`,
      ...(state.dna.isBoss ? ['boss'] : []),
    ],
    data: state.dna,
  };
}