/**
 * gallery.ts — PROC-B1f
 *
 * localStorage-backed gallery for NPC blueprints.
 * Mirrors the princess-creator gallery API so tooling works the same way.
 *
 * Named NPC overrides: specific location IDs can be locked to a blueprint.
 * E.g. `NAMED_NPCS['settlement-123/innkeeper'] = customDna`.
 */
import { encodeShareCode, decodeShareCode } from '@/procedural/ProceduralDNA';
// ── Storage keys ──────────────────────────────────────────────────────────────
const GALLERY_KEY = 'ttt.npcCreator.gallery.v1';
const NAMED_KEY = 'ttt.npcCreator.named.v1';
// ── Gallery helpers ───────────────────────────────────────────────────────────
export function loadNpcGallery() {
    try {
        const raw = localStorage.getItem(GALLERY_KEY);
        return raw ? JSON.parse(raw) : [];
    }
    catch {
        return [];
    }
}
export function saveNpcGallery(entries) {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(entries));
}
export function addToNpcGallery(entry) {
    const full = { ...entry, id: `npc-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    const entries = loadNpcGallery();
    entries.push(full);
    saveNpcGallery(entries);
    return full;
}
export function removeFromNpcGallery(id) {
    const entries = loadNpcGallery().filter(e => e.id !== id);
    saveNpcGallery(entries);
    return entries;
}
export function npcDnaToShareCode(dna) {
    return encodeShareCode(dna);
}
export function shareCodeToNpcDna(code) {
    const dna = decodeShareCode(code);
    if (!dna || dna.kind !== 'npc')
        return null;
    return dna;
}
// ── Named NPC overrides ───────────────────────────────────────────────────────
/**
 * Named NPC overrides: `locationId` → `NpcDNA`.
 * `locationId` format: `<settlementId>/<role>` or any unique string.
 * When NPCSpawner encounters this locationId, it uses the override DNA
 * instead of generating a procedural one.
 */
export function loadNamedNpcs() {
    try {
        const raw = localStorage.getItem(NAMED_KEY);
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
export function setNamedNpc(locationId, dna) {
    const named = loadNamedNpcs();
    named[locationId] = dna;
    localStorage.setItem(NAMED_KEY, JSON.stringify(named));
}
export function clearNamedNpc(locationId) {
    const named = loadNamedNpcs();
    delete named[locationId];
    localStorage.setItem(NAMED_KEY, JSON.stringify(named));
}
/** Resolve the NpcDNA for a location, falling back to null if no override. */
export function resolveNamedNpc(locationId) {
    return loadNamedNpcs()[locationId] ?? null;
}
