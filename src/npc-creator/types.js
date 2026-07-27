/**
 * types.ts — PROC-B1a
 *
 * NpcDNA: the data model for a procedural NPC.
 * Extends ProceduralDNA (kind = 'npc').
 *
 * Designed to drive `buildNpc(dna)` — no Three.js in here.
 */
// ── Role → default hat / tool ─────────────────────────────────────────────────
export const ROLE_HAT = {
    merchant: 'wide_brim',
    elder: 'crown_simple',
    quest_giver: 'hood',
    scholar: 'wide_brim',
    guard: 'soldier_helm',
    innkeeper: 'none',
    mysterious: 'blindfold',
};
export const ROLE_TOOL = {
    merchant: 'coin_pouch',
    elder: 'staff',
    quest_giver: 'scroll',
    scholar: 'book',
    guard: 'sword',
    innkeeper: 'lantern',
    mysterious: 'staff',
};
export const ROLE_BADGE = {
    merchant: 'merchant_guild',
    elder: 'none',
    quest_giver: 'quest_seal',
    scholar: 'scholars_pin',
    guard: 'town_guard',
    innkeeper: 'none',
    mysterious: 'none',
};
