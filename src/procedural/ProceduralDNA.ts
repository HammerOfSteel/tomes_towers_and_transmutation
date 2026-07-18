/**
 * ProceduralDNA.ts — PROC-A2
 *
 * Shared base DNA interface for all procedural entity types.
 * Every concrete DNA type (NpcDNA, EnemyDNA, PropDNA, BuildingDNA, PrincessDNA)
 * extends this base.
 *
 * Share-code prefixes:
 *   P2. = princess   N2. = NPC   E2. = enemy   R2. = prop   B2. = building
 */

// ── Entity kinds ──────────────────────────────────────────────────────────────

export type EntityKind = 'princess' | 'npc' | 'enemy' | 'prop' | 'building';

/** Share-code prefix per entity kind. */
export const SHARE_CODE_PREFIX: Record<EntityKind, string> = {
  princess: 'P2.',
  npc:      'N2.',
  enemy:    'E2.',
  prop:     'R2.',   // "R" for Room prop to avoid collision with "P" (princess)
  building: 'B2.',
};

// ── Base DNA ──────────────────────────────────────────────────────────────────

/**
 * Base DNA shared by every procedural entity.
 * Concrete DNAs extend this and add their own fields.
 */
export interface ProceduralDNA {
  /** Schema version — increment when the shape changes incompatibly. */
  v:    number;
  /** Entity kind — used by the registry to route to the correct builder. */
  kind: EntityKind;
  /** Display name (player-visible). */
  name: string;
  /**
   * Deterministic RNG seed.  Two DNAs with the same `seed` + `kind` produce
   * identical visual output from `buildXxx(dna)`.
   */
  seed: number;
}

// ── Species type shared across all entity kinds ───────────────────────────────

export type GameSpecies =
  | 'human' | 'undead' | 'vulperia' | 'slime'
  | 'elf' | 'celestial' | 'draconic';

// ── Share-code helpers ────────────────────────────────────────────────────────

/**
 * Encode any ProceduralDNA to a compact URL-safe share string.
 * Format:  `<PREFIX><base64url(JSON)>`
 */
export function encodeShareCode(dna: ProceduralDNA): string {
  const prefix = SHARE_CODE_PREFIX[dna.kind];
  const json   = JSON.stringify(dna);
  const b64    = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}${b64}`;
}

/**
 * Decode a share string back to a ProceduralDNA, or return null if invalid.
 * Works for any entity kind — the caller casts to the specific type.
 */
export function decodeShareCode(code: string): ProceduralDNA | null {
  try {
    const prefixes = Object.values(SHARE_CODE_PREFIX);
    const matched  = prefixes.find(p => code.startsWith(p));
    if (!matched) return null;

    const b64  = code.slice(matched.length).replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    const dna  = JSON.parse(json) as ProceduralDNA;
    if (!dna.kind || !dna.v) return null;
    return dna;
  } catch {
    return null;
  }
}

/** Detect entity kind from a share code prefix without full decode. */
export function kindFromShareCode(code: string): EntityKind | null {
  for (const [kind, prefix] of Object.entries(SHARE_CODE_PREFIX) as [EntityKind, string][]) {
    if (code.startsWith(prefix)) return kind;
  }
  return null;
}
