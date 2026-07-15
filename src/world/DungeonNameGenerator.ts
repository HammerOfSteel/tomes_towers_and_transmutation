/**
 * DungeonNameGenerator — seeded procedural names for overworld dungeon entrances.
 *
 * Pattern: [optional "The "] [adjective] [noun] [suffix]
 * Example: "The Sunken Cavern", "Mirefall Crypt", "Ashwick Ruins", "The Deep Mine"
 *
 * Tables sized so unique combinations exceed 1 000+.
 */

import type { DungeonType } from './DungeonType';
import { mulberry32 } from '@/core/prng';

// ── Word tables ────────────────────────────────────────────────────────────────

const ADJECTIVES = [
  'Sunken', 'Forgotten', 'Ancient', 'Cursed', 'Hollow', 'Shattered',
  'Mossy', 'Crumbled', 'Shrouded', 'Drowned', 'Ashen', 'Blighted',
  'Grim', 'Iron', 'Stone', 'Deep', 'Dark', 'Lost', 'Broken', 'Silent',
  'Pale', 'Bitter', 'Dread', 'Bone', 'Pale', 'Murky', 'Foul', 'Mire',
] as const;

const NOUNS = [
  'Hall', 'Keep', 'Hold', 'Vault', 'Pit', 'Den', 'Reach', 'Maw', 'Rift',
  'Depths', 'Warren', 'Hollow', 'Barrow', 'Passage', 'Breach', 'Descent',
  'Chamber', 'Recess', 'Crevice', 'Abyss', 'Grotto', 'Mound',
] as const;

// Suffixes per dungeon type
const SUFFIXES: Readonly<Record<DungeonType, readonly string[]>> = {
  cave:         ['Cavern', 'Cave', 'Grotto', 'Hollow'],
  crypt:        ['Crypt', 'Tomb', 'Ossuary', 'Burial'],
  ruins:        ['Ruins', 'Remnants', 'Ruin', 'Remains'],
  mine:         ['Mine', 'Shaft', 'Dig', 'Delve'],
  library_ruin: ['Archive', 'Athenaeum', 'Scriptorium', 'Stacks'],
  lair:         ['Lair', 'Nest', 'Den', 'Roost'],
};

// Occasionally prefix "The " for variety
const PREFIXES = ['The ', '', '', '', 'The ', ''] as const;

// ── Generator ─────────────────────────────────────────────────────────────────

/** Generate a unique-feeling dungeon name from a 32-bit seed and dungeon type. */
export function generateDungeonName(seed: number, type: DungeonType): string {
  const rand    = mulberry32(seed ^ 0xBAD_D0_06);
  const pick    = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const prefix  = pick(PREFIXES);
  const adj     = pick(ADJECTIVES);
  const noun    = pick(NOUNS);
  const suffix  = pick(SUFFIXES[type]);

  // 50 % chance: "The Sunken Hall Cavern" vs "Sunken Cavern"
  if (rand() < 0.5) {
    return `${prefix}${adj} ${suffix}`;
  }
  return `${prefix}${adj} ${noun} ${suffix}`;
}
