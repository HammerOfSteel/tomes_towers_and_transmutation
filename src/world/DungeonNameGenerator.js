/**
 * DungeonNameGenerator — seeded procedural names for overworld dungeon entrances.
 *
 * Pattern: [optional "The "] [adjective] [noun] [suffix]
 * Example: "The Sunken Cavern", "Mirefall Crypt", "Ashwick Ruins", "The Deep Mine"
 *
 * Tables sized so unique combinations exceed 1 000+.
 */
import { mulberry32 } from '@/core/prng';
// ── Word tables ────────────────────────────────────────────────────────────────
const ADJECTIVES = [
    'Sunken', 'Forgotten', 'Ancient', 'Cursed', 'Hollow', 'Shattered',
    'Mossy', 'Crumbled', 'Shrouded', 'Drowned', 'Ashen', 'Blighted',
    'Grim', 'Iron', 'Stone', 'Deep', 'Dark', 'Lost', 'Broken', 'Silent',
    'Pale', 'Bitter', 'Dread', 'Bone', 'Pale', 'Murky', 'Foul', 'Mire',
];
const NOUNS = [
    'Hall', 'Keep', 'Hold', 'Vault', 'Pit', 'Den', 'Reach', 'Maw', 'Rift',
    'Depths', 'Warren', 'Hollow', 'Barrow', 'Passage', 'Breach', 'Descent',
    'Chamber', 'Recess', 'Crevice', 'Abyss', 'Grotto', 'Mound',
];
// Suffixes per dungeon type
const SUFFIXES = {
    cave: ['Cavern', 'Cave', 'Grotto', 'Hollow'],
    crypt: ['Crypt', 'Tomb', 'Ossuary', 'Burial'],
    ruins: ['Ruins', 'Remnants', 'Ruin', 'Remains'],
    mine: ['Mine', 'Shaft', 'Dig', 'Delve'],
    library_ruin: ['Archive', 'Athenaeum', 'Scriptorium', 'Stacks'],
    lair: ['Lair', 'Nest', 'Den', 'Roost'],
};
// Occasionally prefix "The " for variety
const PREFIXES = ['The ', '', '', '', 'The ', ''];
// ── Generator ─────────────────────────────────────────────────────────────────
/** Generate a unique-feeling dungeon name from a 32-bit seed and dungeon type. */
export function generateDungeonName(seed, type) {
    const rand = mulberry32(seed ^ 0xBAD_D0_06);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const prefix = pick(PREFIXES);
    const adj = pick(ADJECTIVES);
    const noun = pick(NOUNS);
    const suffix = pick(SUFFIXES[type]);
    // 50 % chance: "The Sunken Hall Cavern" vs "Sunken Cavern"
    if (rand() < 0.5) {
        return `${prefix}${adj} ${suffix}`;
    }
    return `${prefix}${adj} ${noun} ${suffix}`;
}
