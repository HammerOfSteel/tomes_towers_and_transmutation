// ── Princess Creator: DNA types ──────────────────────────────────────────────
//
//  Pure data — no three.js imports here. The DNA is the single source of truth
//  for a princess. See docs/princess-creator/DNA_SCHEMA.md.
export const ARCHETYPES = ['human', 'fox', 'slime', 'skeleton', 'lamia'];
export const SPECIES_IDS = [
    'human', 'elf', 'high_elf', 'pixie', 'fae', 'undead', 'celestial',
    'draconic', 'gnome', 'goblin', 'foxling', 'ignis', 'specter',
    'naiad', 'moonborn', 'verdant', 'lamia', 'orc', 'troll',
    'slime', 'skeleton',
];
export const CLASS_IDS = ['none', 'scholar', 'mage', 'warrior'];
export const AURA_STYLES = ['none', 'motes', 'cold', 'warm', 'ember', 'bubbles'];
export const DRESS_STYLES = ['bell', 'aline', 'hex', 'layered', 'slim'];
export const EYE_STYLES = ['sparkle', 'round', 'lash', 'sleepy', 'star', 'glow', 'void', 'button', 'slit'];
export const MOUTH_STYLES = [
    'smile', 'open', 'cat', 'pout', 'fang', 'teeth', 'tusks', 'none',
];
export const HAIR_STYLES = [
    'none', 'bob', 'pigtails', 'twintails', 'bun', 'long', 'braided', 'ponytail', 'wild', 'afro',
];
export const CROWN_IDS = [
    'none', 'classic', 'tiara', 'crooked', 'flower', 'halo', 'crescent', 'wreath',
];
export const EAR_IDS = [
    'none', 'fox', 'cat', 'round', 'long', 'horn_small', 'horn_curved', 'fin',
];
export const TAIL_IDS = ['none', 'fluffy', 'thin', 'bone', 'wisp'];
export const BACK_IDS = [
    'none', 'bow', 'cape', 'wings', 'wings_butterfly', 'wings_feather',
    'wings_leaf', 'grimoire',
];
export const HAND_ITEM_IDS = ['none', 'wand', 'staff', 'fan', 'tome'];
export const IDLE_STYLES = ['sway', 'bob', 'float', 'rattle'];
export const RANGES = {
    aura: {
        intensity: { min: 0, max: 1 },
    },
    body: {
        height: { min: 0.5, max: 1.35 }, // pixie 0.55 … high elf 1.2
        headSize: { min: 0.75, max: 1.65 },
        chubbiness: { min: 0.6, max: 1.8 },
        armLength: { min: 0.7, max: 1.3 },
        legLength: { min: 0.7, max: 1.3 },
        shoulderWidth: { min: 0.75, max: 1.3 },
        hipWidth: { min: 0.75, max: 1.4 },
    },
    dress: {
        flare: { min: 0.6, max: 1.6 },
        length: { min: 0.7, max: 1.3 },
    },
    face: {
        eyeSize: { min: 0.7, max: 1.5 },
        eyeSpacing: { min: 0.75, max: 1.3 },
        eyeTilt: { min: -0.3, max: 0.3 },
        blush: { min: 0, max: 1 },
    },
    hair: {
        length: { min: 0.6, max: 1.5 },
    },
    parts: {
        crownTilt: { min: -0.35, max: 0.35 },
        crownSize: { min: 0.6, max: 1.6 },
        earSize: { min: 0.6, max: 1.8 },
        tailSize: { min: 0.6, max: 1.6 },
        backSize: { min: 0.6, max: 1.6 },
        handSize: { min: 0.6, max: 1.6 },
    },
    traits: {
        snoutLength: { min: 0.5, max: 1.6 },
        fluff: { min: 0.5, max: 2.0 },
        wobble: { min: 0, max: 1 },
        translucency: { min: 0.2, max: 0.9 },
        coreGlow: { min: 0, max: 1 },
        boneThickness: { min: 0.6, max: 1.6 },
        eyeGlowIntensity: { min: 0, max: 1.5 },
    },
    motion: {
        energy: { min: 0, max: 1 },
        bounce: { min: 0, max: 1 },
    },
};
