/**
 * QuatEnemyAdapter — resolves an encounter `enemyId` to a real, imported
 * Quaternius monster model when the "monsters" External Assets category is
 * enabled and a mapping exists; otherwise falls through unchanged to the
 * existing `loadEnemyById()` chain (charManifest → CharacterLoader →
 * procedural-rig fallback).
 *
 * This is the "monster resolver" from
 * docs/asset-integration/2026-09-23-wiring-design-spec.md §4.1. It sits in
 * front of EnemyLoader.loadEnemyById() — SceneManager._spawnWave() calls
 * `resolveEnemyRig()` instead, with zero other changes to spawn placement,
 * count, or timing logic.
 *
 * Fills the pre-existing `imp` TODO placeholder already referenced in
 * RoomEncounterDef.ts (see that file's `// TODO: Quaternius Monster Pack`
 * comments) using the newly-imported bestiary_dungeon_monsters pack.
 */

import * as THREE                 from 'three';
import { loadQuatAsset }          from '@/assets/QuaterniusAssetLoader';
import { QUAT_MODELS }            from '@/assets/quaterniusManifest';
import { isCategoryEnabled }      from '@/world/ExternalAssetConfig';
import { loadEnemyById, type EnemyRig, type EnemyAnimState } from '@/enemy/EnemyLoader';
import type { CharModelDef }      from '@/characters/charManifest';

/** All loaded real-asset enemies are normalised to this height, matching EnemyLoader's TARGET_HEIGHT. */
const TARGET_HEIGHT = 2.0;

export type QuatEnemyTier    = 1 | 2 | 3 | 'boss';
export type QuatEnemySpecies = 'undead' | 'beast' | 'elemental' | 'fae' | 'humanoid' | 'construct';

export interface QuatEnemyManifestEntry {
  /** Matches QuatModelDef.id in quaterniusManifest.ts. */
  quatModelId: string;
  /** Stable short name used in RoomEncounterDef.enemyId. */
  enemyId:     string;
  displayName: string;
  tier:        QuatEnemyTier;
  species:     QuatEnemySpecies;
}

/**
 * New monster roster from the Quaternius asset-integration initiative.
 * Add entries here as more monster packs are wired in future sub-tasks.
 */
export const QUAT_ENEMY_MANIFEST: readonly QuatEnemyManifestEntry[] = [
  // ── Bestiary — Dungeon Monsters (fills the pre-existing "imp" TODO) ──────
  { quatModelId: 'monsters/bestiary_dungeon_monsters/Imp',    enemyId: 'imp',           displayName: 'Imp',           tier: 1,       species: 'fae' },
  { quatModelId: 'monsters/bestiary_dungeon_monsters/Puglin', enemyId: 'puglin',        displayName: 'Puglin',        tier: 1,       species: 'humanoid' },

  // ── Cute Animated Monsters ────────────────────────────────────────────────
  { quatModelId: 'monsters/cute_animated_monsters/Alien',       enemyId: 'cute_alien',        displayName: 'Alien',         tier: 1, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/Alien_Tall',  enemyId: 'cute_alien_tall',   displayName: 'Tall Alien',    tier: 1, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/Bat',         enemyId: 'cute_bat',          displayName: 'Cute Bat',      tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Bee',         enemyId: 'cute_bee',          displayName: 'Bee',           tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Cactus',      enemyId: 'cute_cactus',       displayName: 'Cactus',        tier: 1, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/Chicken',     enemyId: 'cute_chicken',      displayName: 'Chicken',       tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Crab',        enemyId: 'cute_crab',         displayName: 'Crab',          tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Cthulhu',     enemyId: 'cute_cthulhu',      displayName: 'Cthulhu',       tier: 2, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/Cyclops',     enemyId: 'cute_cyclops',      displayName: 'Cyclops',       tier: 2, species: 'humanoid' },
  { quatModelId: 'monsters/cute_animated_monsters/Deer',        enemyId: 'cute_hostile_deer', displayName: 'Feral Deer',    tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Demon',       enemyId: 'cute_demon',        displayName: 'Demon',         tier: 2, species: 'fae' },
  { quatModelId: 'monsters/cute_animated_monsters/Ghost',       enemyId: 'cute_ghost',        displayName: 'Ghost',         tier: 1, species: 'undead' },
  { quatModelId: 'monsters/cute_animated_monsters/GreenDemon',  enemyId: 'cute_green_demon',  displayName: 'Green Demon',   tier: 2, species: 'fae' },
  { quatModelId: 'monsters/cute_animated_monsters/Mushroom',    enemyId: 'cute_mushroom',     displayName: 'Mushroom',      tier: 1, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/Panda',       enemyId: 'cute_panda',        displayName: 'Panda',         tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Penguin',     enemyId: 'cute_penguin',      displayName: 'Penguin',       tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Pig',         enemyId: 'cute_pig',          displayName: 'Pig',           tier: 1, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Skull',       enemyId: 'cute_skull',        displayName: 'Skull',         tier: 1, species: 'undead' },
  { quatModelId: 'monsters/cute_animated_monsters/Tree',        enemyId: 'cute_treant',       displayName: 'Treant',        tier: 1, species: 'elemental' },
  { quatModelId: 'monsters/cute_animated_monsters/YellowDragon',enemyId: 'cute_yellow_dragon',displayName: 'Yellow Dragon', tier: 2, species: 'beast' },
  { quatModelId: 'monsters/cute_animated_monsters/Yeti',        enemyId: 'cute_yeti',         displayName: 'Yeti',         tier: 2, species: 'humanoid' },
];

/** Look up a QuatEnemyManifestEntry by the short enemyId used in RoomEncounterDef. */
export function getQuatEnemyManifestEntry(enemyId: string): QuatEnemyManifestEntry | undefined {
  return QUAT_ENEMY_MANIFEST.find(e => e.enemyId === enemyId);
}

const CLIP_PATTERNS: Record<keyof EnemyAnimState, RegExp> = {
  idle:   /idle/i,
  walk:   /walk/i,
  run:    /run/i,
  attack: /attack|slash|swing|strike|bite|shoot|cast/i,
  death:  /death|die|dead|dying/i,
  hurt:   /hurt|hit|damage|pain|react/i,
};

function _resolveClips(clips: THREE.AnimationClip[], mixer: THREE.AnimationMixer): EnemyAnimState {
  const result: EnemyAnimState = { idle: null, walk: null, run: null, attack: null, death: null, hurt: null };
  for (const key of Object.keys(CLIP_PATTERNS) as (keyof EnemyAnimState)[]) {
    const clip = clips.find(c => CLIP_PATTERNS[key].test(c.name));
    if (clip) result[key] = mixer.clipAction(clip);
  }
  return result;
}

/**
 * Load a QUAT_ENEMY_MANIFEST entry as an EnemyRig — same normalisation
 * (height, ground-centring, idle autoplay) as EnemyLoader.loadEnemyModel(),
 * so callers can treat the result identically regardless of source.
 */
export async function loadEnemyRigFromQuatAsset(
  entry:    QuatEnemyManifestEntry,
  spawnPos: THREE.Vector3,
): Promise<EnemyRig> {
  const quatDef = QUAT_MODELS.find(m => m.id === entry.quatModelId);
  if (!quatDef) throw new Error(`QuatEnemyAdapter: "${entry.quatModelId}" not found in QUAT_MODELS`);

  const loaded = await loadQuatAsset(quatDef);
  const group  = loaded.scene;

  const box = new THREE.Box3().setFromObject(group);
  const sz  = new THREE.Vector3();
  box.getSize(sz);
  const rawH      = sz.y;
  const normScale = rawH > 0.01 ? TARGET_HEIGHT / rawH : 1;
  group.scale.setScalar(normScale);

  const centredBox = new THREE.Box3().setFromObject(group);
  group.position.set(spawnPos.x, spawnPos.y - centredBox.min.y, spawnPos.z);

  const mixer    = loaded.mixer;
  const allClips = loaded.clips;
  const clips    = mixer ? _resolveClips(allClips, mixer) : {
    idle: null, walk: null, run: null, attack: null, death: null, hurt: null,
  };
  clips.idle?.setLoop(THREE.LoopRepeat, Infinity).play();

  // Synthetic CharModelDef — only carries enough shape for EnemyRig.def's
  // type contract and debug/serialisation use; never fed back into
  // CHAR_MODELS or charManifest lookups.
  const def: CharModelDef = {
    id: quatDef.id, packId: quatDef.packId, name: quatDef.name, path: quatDef.path,
    format: quatDef.format === 'fbx' ? 'fbx' : 'glb',
    roles: ['enemy'], tags: [], animated: quatDef.animated,
  };

  return { group, mixer: mixer ?? null, allClips, clips, normScale, def };
}

/**
 * The monster resolver: checked by SceneManager._spawnWave() in place of a
 * direct loadEnemyById() call. Falls through to loadEnemyById() (existing,
 * unmodified) whenever the "monsters" category is off, or on but no
 * QUAT_ENEMY_MANIFEST entry matches — see spec §2's Hard rule #2.
 */
export async function resolveEnemyRig(enemyId: string, spawnPos: THREE.Vector3): Promise<EnemyRig> {
  if (isCategoryEnabled('monsters')) {
    const entry = getQuatEnemyManifestEntry(enemyId);
    if (entry) return loadEnemyRigFromQuatAsset(entry, spawnPos);
  }
  return loadEnemyById(enemyId, spawnPos);
}
