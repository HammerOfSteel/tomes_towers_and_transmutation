/**
 * NPCDnaGenerator — generates CreatureDNA for world NPCs.
 *
 * DNA is deterministically seeded from the NPC's grid position + settlement
 * seed, so the same NPC always looks the same across sessions.  Role affects
 * allowed outfits, face types, and prop choices.
 */
import { mulberry32 } from '@/core/prng';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
const ROLE_PROFILES = {
    merchant: { outfit: { top: 'tunic', legs: 'trousers', over: 'cloak' }, faceTypes: ['cute', 'cherubic', 'gaunt'], props: ['crown'], globalMul: 0.72 },
    guard: { outfit: { top: 'armor_chest', legs: 'trousers', over: 'none' }, faceTypes: ['angry', 'gaunt', 'skull'], props: ['armor_light'], globalMul: 0.78 },
    citizen: { outfit: { top: 'tunic', legs: 'trousers', over: 'none' }, faceTypes: ['cute', 'cherubic', 'gaunt', 'angry'], props: [], globalMul: 0.70 },
    scholar: { outfit: { top: 'robe_top', legs: 'robe_skirt', over: 'robe_full' }, faceTypes: ['gaunt', 'ancient', 'cute'], props: ['aura'], globalMul: 0.70 },
    innkeeper: { outfit: { top: 'tunic', legs: 'skirt', over: 'none' }, faceTypes: ['cute', 'cherubic', 'angry'], props: ['hair_long'], globalMul: 0.72 },
    blacksmith: { outfit: { top: 'armor_chest', legs: 'trousers', over: 'none' }, faceTypes: ['angry', 'gaunt', 'cherubic'], props: ['mane'], globalMul: 0.76 },
};
const SUBRACES = [
    'human', 'human', 'human', 'elf', 'goblin', 'orc', 'gnome', 'fae',
];
// ── DNA generation ────────────────────────────────────────────────────────────
export function npcDna(col, row, settlementSeed, role) {
    const seed = mulberry32((col * 73856093) ^ (row * 19349663) ^ settlementSeed)();
    const rand = mulberry32(seed | 1);
    const profile = ROLE_PROFILES[role];
    // Biped-only NPCs for now
    const subRace = SUBRACES[Math.floor(rand() * SUBRACES.length)];
    // Primary hue — seeded per NPC for variety within a settlement
    const hue = Math.floor(rand() * 360);
    const sat = 40 + Math.floor(rand() * 40);
    const lit = 50 + Math.floor(rand() * 20);
    const primary = hslToHex(hue, sat, lit);
    const secondary = hslToHex((hue + 40) % 360, sat - 10, lit + 10);
    const faceTypes = profile.faceTypes;
    const faceType = faceTypes[Math.floor(rand() * faceTypes.length)];
    const props = [...profile.props];
    // Small chance of a bonus prop
    if (rand() < 0.15) {
        const bonus = ['hair_short', 'hair_long', 'horns_small', 'tail_stub'][Math.floor(rand() * 4)];
        if (bonus)
            props.push(bonus);
    }
    const base = DEFAULT_PLAYER_DNA;
    return {
        ...base,
        archetype: 'biped',
        subRace,
        colors: {
            ...base.colors,
            primary,
            secondary,
        },
        proportions: {
            ...base.proportions,
            global: profile.globalMul * (0.92 + rand() * 0.16),
        },
        face: {
            ...base.face,
            type: faceType,
            eyeColor: hslToHex((hue + 180) % 360, 60, 65),
        },
        outfit: { ...profile.outfit },
        props,
    };
}
// ── NPC name generation ────────────────────────────────────────────────────────
const FIRST_NAMES = [
    'Aldric', 'Mira', 'Tor', 'Sylva', 'Bram', 'Ilya', 'Oswin', 'Fenn',
    'Runa', 'Corvus', 'Lira', 'Dag', 'Pell', 'Ysa', 'Grel', 'Wren',
    'Ashton', 'Mael', 'Sola', 'Bright', 'Dusk', 'Cinder', 'Thorn', 'Vale',
];
const LAST_NAMES = [
    'of the Mill', 'the Wanderer', 'Coldbrook', 'Ironfoot', 'Dawnmantle',
    'Ashwick', 'the Merchant', 'Greymoss', 'Fernholt', 'Stonebridge',
];
export function npcName(seed) {
    const rand = mulberry32(seed);
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const last = rand() < 0.45 ? ` ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}` : '';
    return first + last;
}
// ── Util ──────────────────────────────────────────────────────────────────────
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * c);
    };
    return (f(0) << 16) | (f(8) << 8) | f(4);
}
