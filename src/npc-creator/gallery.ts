/**
 * gallery.ts — PROC-B1f
 *
 * localStorage-backed gallery for NPC blueprints.
 * Mirrors the princess-creator gallery API so tooling works the same way.
 *
 * Named NPC overrides: specific location IDs can be locked to a blueprint.
 * E.g. `NAMED_NPCS['settlement-123/innkeeper'] = customDna`.
 */

import type { NpcDNA } from './types';
import { encodeShareCode, decodeShareCode } from '@/procedural/ProceduralDNA';

// ── Gallery entry ─────────────────────────────────────────────────────────────

export interface NpcGalleryEntry {
  /** Unique entry ID (UUID-ish). */
  id:    string;
  name:  string;
  /** Encoded share code (starts with `N2.`). */
  code:  string;
  /** Base64 data-URL thumbnail (may be empty). */
  thumb: string;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const GALLERY_KEY = 'ttt.npcCreator.gallery.v1';
const NAMED_KEY   = 'ttt.npcCreator.named.v1';

// ── Gallery helpers ───────────────────────────────────────────────────────────

export function loadNpcGallery(): NpcGalleryEntry[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? (JSON.parse(raw) as NpcGalleryEntry[]) : [];
  } catch { return []; }
}

export function saveNpcGallery(entries: NpcGalleryEntry[]): void {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(entries));
}

export function addToNpcGallery(entry: Omit<NpcGalleryEntry, 'id'>): NpcGalleryEntry {
  const full: NpcGalleryEntry = { ...entry, id: `npc-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  const entries = loadNpcGallery();
  entries.push(full);
  saveNpcGallery(entries);
  return full;
}

export function removeFromNpcGallery(id: string): NpcGalleryEntry[] {
  const entries = loadNpcGallery().filter(e => e.id !== id);
  saveNpcGallery(entries);
  return entries;
}

export function npcDnaToShareCode(dna: NpcDNA): string {
  return encodeShareCode(dna);
}

export function shareCodeToNpcDna(code: string): NpcDNA | null {
  const dna = decodeShareCode(code);
  if (!dna || dna.kind !== 'npc') return null;
  return dna as NpcDNA;
}

// ── Named NPC overrides ───────────────────────────────────────────────────────

/**
 * Named NPC overrides: `locationId` → `NpcDNA`.
 * `locationId` format: `<settlementId>/<role>` or any unique string.
 * When NPCSpawner encounters this locationId, it uses the override DNA
 * instead of generating a procedural one.
 */
export function loadNamedNpcs(): Record<string, NpcDNA> {
  try {
    const raw = localStorage.getItem(NAMED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, NpcDNA>) : {};
  } catch { return {}; }
}

export function setNamedNpc(locationId: string, dna: NpcDNA): void {
  const named = loadNamedNpcs();
  named[locationId] = dna;
  localStorage.setItem(NAMED_KEY, JSON.stringify(named));
}

export function clearNamedNpc(locationId: string): void {
  const named = loadNamedNpcs();
  delete named[locationId];
  localStorage.setItem(NAMED_KEY, JSON.stringify(named));
}

/** Resolve the NpcDNA for a location, falling back to null if no override. */
export function resolveNamedNpc(locationId: string): NpcDNA | null {
  return loadNamedNpcs()[locationId] ?? null;
}
