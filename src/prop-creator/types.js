/**
 * types.ts — PROC-B3a
 * PropDNA: data model for a procedural prop/furniture/dungeon-dressing item.
 */
// ── Material → base color ─────────────────────────────────────────────────────
export const MATERIAL_COLORS = {
    stone: { base: '#6a6460', detail: '#3a3430' },
    wood: { base: '#8b6040', detail: '#4a2820' },
    bone: { base: '#d8d0b8', detail: '#a89878' },
    crystal: { base: '#80c0e8', detail: '#4080c0', glow: '#40a0ff' },
    iron: { base: '#5a5860', detail: '#2a2830' },
    clay: { base: '#a07850', detail: '#6a4830' },
};
// ── Prop kind → default material ─────────────────────────────────────────────
export const KIND_DEFAULT_MATERIAL = {
    chest: 'wood',
    bookshelf: 'wood',
    table: 'wood',
    chair: 'wood',
    cauldron: 'iron',
    lantern: 'iron',
    pillar: 'stone',
    rug: 'clay', // soft/textile-ish
    door: 'wood',
    statue: 'stone',
    barrel: 'wood',
    crate: 'wood',
};
// ── Prop kind → solid flag ────────────────────────────────────────────────────
export const KIND_SOLID = {
    chest: true,
    bookshelf: true,
    table: true,
    chair: true,
    cauldron: true,
    lantern: false,
    pillar: true,
    rug: false,
    door: true,
    statue: true,
    barrel: true,
    crate: true,
};
