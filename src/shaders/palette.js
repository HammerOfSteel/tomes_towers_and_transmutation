/** Canonical color palette for all in-code materials and shaders.
 *  Import this wherever a color is needed — never hardcode hex values. */
export const PALETTE = {
    // ── Environment ────────────────────────────────────────────────────────────
    STONE_DARK: 0x2a2a3a,
    STONE_MID: 0x3d3d52,
    WOOD_BROWN: 0x4a3728,
    TORCH_WARM: 0xff8833,
    // ── Player ─────────────────────────────────────────────────────────────────
    PLAYER_BODY: 0x8899aa,
    PLAYER_GLOW: 0x44ddff,
    // ── Magic (HDR-range values — fed to UnrealBloomPass) ─────────────────────
    SPELL_BOLT: 0x88ccff,
    SPELL_FIRE: 0xff6600,
    SPELL_WARD: 0xaaffdd,
    SPELL_CHAIN: 0xffff44,
    SPELL_GRAVITY: 0x660099,
    SPELL_NOVA: 0xffffff,
    // ── UI ─────────────────────────────────────────────────────────────────────
    HP_BAR: 0xff4444,
    MP_BAR: 0x4488ff,
    RECRUIT_AURA: 0x33ffaa,
};
