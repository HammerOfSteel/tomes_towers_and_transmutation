/**
 * SpawnPalette.ts
 *
 * The spawn palette provides creative-mode items that aren't 3D model assets
 * but game entities: enemy spawners, NPC spawners, wave triggers, quest zones,
 * and interactable props.
 *
 * Used by CreativeAssetBrowser when the "Code" tab is active and
 * codeFirstAssets setting is enabled.
 *
 * Placing a spawn item creates a visible marker in the scene (a coloured
 * cylinder + label) and records it in the placement system's spawn list.
 * The spawn is saved as a SpawnMarker in the level JSON.
 */

export type SpawnItemCategory = 'enemy' | 'npc' | 'wave' | 'quest_zone' | 'interactable';

export interface SpawnItem {
  id:       string;
  label:    string;
  icon:     string;
  category: SpawnItemCategory;
  color:    number;      // THREE.js hex color for the marker
  defaults: Record<string, unknown>;
}

// ── Dummy Targets (Spell Lab / Combat Testing) ────────────────────────────────

export const SPAWN_DUMMY_TARGETS: SpawnItem[] = [
  { id: 'spawn_dummy_100',   label: 'Dummy (100 HP)',   icon: '🪆', category: 'enemy', color: 0x44aaff, defaults: { enemyId: 'dummy', tier: 1, count: 1, pattern: 'static', hp: 100 } },
  { id: 'spawn_dummy_1000',  label: 'Dummy (1000 HP)',  icon: '🪆', category: 'enemy', color: 0x44ffaa, defaults: { enemyId: 'dummy', tier: 2, count: 1, pattern: 'static', hp: 1000 } },
  { id: 'spawn_dummy_boss',  label: 'Dummy (∞ HP)',     icon: '🪆', category: 'enemy', color: 0xff8844, defaults: { enemyId: 'dummy', tier: 'boss', count: 1, pattern: 'static', hp: 99999 } },
];

// ── Enemy Spawns ──────────────────────────────────────────────────────────────

export const SPAWN_ENEMIES: SpawnItem[] = [
  { id: 'spawn_slime_t1',    label: 'Slime (T1)',      icon: '🟢', category: 'enemy', color: 0x44ee44, defaults: { enemyId: 'slime', tier: 1, count: 1, pattern: 'static' } },
  { id: 'spawn_slime_t2',    label: 'Slime (T2)',      icon: '🟡', category: 'enemy', color: 0xeeee44, defaults: { enemyId: 'slime', tier: 2, count: 1, pattern: 'static' } },
  { id: 'spawn_slime_t3',    label: 'Slime (T3)',      icon: '🔴', category: 'enemy', color: 0xee4444, defaults: { enemyId: 'slime', tier: 3, count: 1, pattern: 'static' } },
  { id: 'spawn_slime_boss',  label: 'Slime Boss',      icon: '💀', category: 'enemy', color: 0xaa00aa, defaults: { enemyId: 'slime', tier: 'boss', count: 1, pattern: 'static' } },
  { id: 'spawn_patrol_t1',   label: 'Patrol (T1)',     icon: '👁', category: 'enemy', color: 0x44aaee, defaults: { enemyId: 'slime', tier: 1, count: 1, pattern: 'patrol' } },
  { id: 'spawn_ambush_t2',   label: 'Ambush (T2)',     icon: '⚡', category: 'enemy', color: 0xff8800, defaults: { enemyId: 'slime', tier: 2, count: 2, pattern: 'ambush' } },
];

// ── NPC Spawns ────────────────────────────────────────────────────────────────

export const SPAWN_NPCS: SpawnItem[] = [
  { id: 'spawn_npc_merchant', label: 'Merchant',        icon: '🛒', category: 'npc', color: 0xffcc44, defaults: { npcName: 'Merchant', npcType: 'merchant', dialogueId: '' } },
  { id: 'spawn_npc_quest',    label: 'Quest Giver',     icon: '📜', category: 'npc', color: 0xffdd88, defaults: { npcName: 'Quest Giver', npcType: 'quest_giver', dialogueId: '' } },
  { id: 'spawn_npc_trainer',  label: 'Skill Trainer',   icon: '🎓', category: 'npc', color: 0x88ddff, defaults: { npcName: 'Trainer', npcType: 'trainer', dialogueId: '' } },
  { id: 'spawn_npc_guard',    label: 'Guard',           icon: '⚔️', category: 'npc', color: 0x8888cc, defaults: { npcName: 'Guard', npcType: 'guard', dialogueId: '' } },
  { id: 'spawn_npc_sage',     label: 'Sage / Lorekeeper',icon: '📚', category: 'npc', color: 0xcc88ff, defaults: { npcName: 'Sage', npcType: 'lorekeeper', dialogueId: '' } },
  { id: 'spawn_npc_custom',   label: 'Custom NPC…',    icon: '🧑', category: 'npc', color: 0xdddddd, defaults: { npcName: '', npcType: 'custom', dialogueId: '' } },
];

// ── Wave Spawners ─────────────────────────────────────────────────────────────

export const SPAWN_WAVES: SpawnItem[] = [
  { id: 'wave_small',   label: 'Small Wave (3)',  icon: '🌊', category: 'wave', color: 0x4488ff, defaults: { waveCount: 1, count: 3, enemyId: 'slime', tier: 1, pattern: 'wave' } },
  { id: 'wave_medium',  label: 'Medium Wave (6)', icon: '🌊', category: 'wave', color: 0x2266cc, defaults: { waveCount: 2, count: 6, enemyId: 'slime', tier: 2, pattern: 'wave' } },
  { id: 'wave_boss',    label: 'Boss Wave',       icon: '💀', category: 'wave', color: 0x880088, defaults: { waveCount: 1, count: 1, enemyId: 'slime', tier: 'boss', pattern: 'wave' } },
  { id: 'wave_endless', label: 'Endless Waves',   icon: '♾', category: 'wave', color: 0xff4400, defaults: { waveCount: 99, count: 3, enemyId: 'slime', tier: 1, pattern: 'wave' } },
];

// ── Quest Zones ───────────────────────────────────────────────────────────────

export const SPAWN_QUEST_ZONES: SpawnItem[] = [
  { id: 'zone_trigger',   label: 'Enter Zone Trigger', icon: '🔲', category: 'quest_zone', color: 0x00ffff, defaults: { type: 'reach', radius: 3 } },
  { id: 'zone_collect',   label: 'Collect Zone',       icon: '📦', category: 'quest_zone', color: 0xffcc00, defaults: { type: 'collect', radius: 2 } },
  { id: 'zone_protect',   label: 'Protect Zone',       icon: '🛡', category: 'quest_zone', color: 0x44ff88, defaults: { type: 'protect', radius: 4 } },
  { id: 'zone_survive',   label: 'Survive Zone',       icon: '⏱', category: 'quest_zone', color: 0xff8800, defaults: { type: 'survive', radius: 5, duration: 30 } },
];

// ── Interactables ─────────────────────────────────────────────────────────────

export const SPAWN_INTERACTABLES: SpawnItem[] = [
  { id: 'interact_bookshelf', label: 'Bookshelf',    icon: '📚', category: 'interactable', color: 0x8855aa, defaults: { type: 'bookshelf', content: '', spellUnlock: '' } },
  { id: 'interact_chest',     label: 'Chest',        icon: '📦', category: 'interactable', color: 0xddaa00, defaults: { type: 'chest', contents: [] } },
  { id: 'interact_lectern',   label: 'Lectern',      icon: '📖', category: 'interactable', color: 0x886644, defaults: { type: 'lectern', content: '' } },
  { id: 'interact_stall',     label: 'Market Stall', icon: '🛒', category: 'interactable', color: 0xffdd44, defaults: { type: 'stall', inventory: [] } },
  { id: 'interact_cauldron',  label: 'Cauldron',     icon: '🪄', category: 'interactable', color: 0x6644aa, defaults: { type: 'cauldron', content: '' } },
  { id: 'interact_portal',    label: 'Zone Portal',  icon: '🌀', category: 'interactable', color: 0x8800ff, defaults: { type: 'portal', targetSceneId: '' } },
];

// ── All items grouped ─────────────────────────────────────────────────────────

export const ALL_SPAWN_ITEMS: SpawnItem[] = [
  ...SPAWN_DUMMY_TARGETS,
  ...SPAWN_ENEMIES,
  ...SPAWN_NPCS,
  ...SPAWN_WAVES,
  ...SPAWN_QUEST_ZONES,
  ...SPAWN_INTERACTABLES,
];

export const SPAWN_CATEGORIES: Array<{ id: SpawnItemCategory; label: string; icon: string; items: SpawnItem[] }> = [
  { id: 'enemy',        label: 'Enemies & Dummies', icon: '⚔️', items: [...SPAWN_DUMMY_TARGETS, ...SPAWN_ENEMIES] },
  { id: 'npc',          label: 'NPCs',              icon: '🧑', items: SPAWN_NPCS },
  { id: 'wave',         label: 'Waves',             icon: '🌊', items: SPAWN_WAVES },
  { id: 'quest_zone',   label: 'Quest Zones',       icon: '🔲', items: SPAWN_QUEST_ZONES },
  { id: 'interactable', label: 'Interactables',     icon: '📦', items: SPAWN_INTERACTABLES },
];
