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
/** Share-code prefix per entity kind. */
export const SHARE_CODE_PREFIX = {
    princess: 'P2.',
    npc: 'N2.',
    enemy: 'E2.',
    prop: 'R2.', // "R" for Room prop to avoid collision with "P" (princess)
    building: 'B2.',
};
// ── Share-code helpers ────────────────────────────────────────────────────────
/**
 * Encode any ProceduralDNA to a compact URL-safe share string.
 * Format:  `<PREFIX><base64url(JSON)>`
 */
export function encodeShareCode(dna) {
    const prefix = SHARE_CODE_PREFIX[dna.kind];
    const json = JSON.stringify(dna);
    const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${prefix}${b64}`;
}
/**
 * Decode a share string back to a ProceduralDNA, or return null if invalid.
 * Works for any entity kind — the caller casts to the specific type.
 */
export function decodeShareCode(code) {
    try {
        const prefixes = Object.values(SHARE_CODE_PREFIX);
        const matched = prefixes.find(p => code.startsWith(p));
        if (!matched)
            return null;
        const b64 = code.slice(matched.length).replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(b64);
        const dna = JSON.parse(json);
        if (!dna.kind || !dna.v)
            return null;
        return dna;
    }
    catch {
        return null;
    }
}
/** Detect entity kind from a share code prefix without full decode. */
export function kindFromShareCode(code) {
    for (const [kind, prefix] of Object.entries(SHARE_CODE_PREFIX)) {
        if (code.startsWith(prefix))
            return kind;
    }
    return null;
}
