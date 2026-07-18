/**
 * EnemyLoader — loads character GLB models as positioned, animated enemy
 * stand-ins that can be driven by the FSM system in enemy AI.
 *
 * Phase B1 — bridges the CharacterLoader pipeline (which handles KayKit rig
 * retargeting, Meshy AI anims.glb, etc.) to the enemy spawning used by
 * SceneManager and RoomEncounterDef.
 *
 * Architecture:
 *   1. Each enemy type is identified by its CharModelDef.id
 *      (e.g. "kaykit_skeletons/Skeleton_Warrior", "meshy_dark_fay/mesh").
 *   2. `loadEnemyModel(def)` resolves the model via CharacterLoader,
 *      normalises it to a 2-WU height, and returns an `EnemyRig` containing:
 *        – a `THREE.Group` ready to be added to the scene
 *        – an `AnimationMixer` pre-wired to that group
 *        – typed clip handles for the standard enemy state machine:
 *          idle, walk, attack, death, hurt
 *   3. Clip names are normalised via a fuzzy-match so any animation pack
 *      works: "Idle_A", "idle", "IDLE", "Armature|Idle" all map to → idle.
 *   4. Clips that are not found on a model are `null` — callers must guard
 *      before calling `action.play()`.
 *
 * Usage (inside SceneManager or an EnemyEntity):
 *   const rig = await loadEnemyModel(def, spawnPos);
 *   scene.add(rig.group);
 *   rig.clips.idle?.play();
 *
 * Performance notes:
 *   – CharacterLoader caches the underlying GLB; only the first load hits
 *     the network.  Subsequent `loadEnemyModel` calls for the same model are
 *     fast (clone + new mixer).
 *   – Dispose via `disposeEnemyRig(rig)` when the enemy dies and the group
 *     is removed from the scene.
 */

import * as THREE                         from 'three';
import { loadCharModel, getCharModelBounds } from '@/characters/CharacterLoader';
import type { CharModelDef }              from '@/characters/charManifest';
import type { EnemyDNA }                  from '@/enemy-creator/types';
import { CHAR_MODELS }                    from '@/characters/charManifest';

// ── EnemyAnimState ────────────────────────────────────────────────────────────

/**
 * The standard animation state set every enemy FSM drives.
 * Each field is an `AnimationAction` or null (model lacks the clip).
 */
export interface EnemyAnimState {
  idle:    THREE.AnimationAction | null;
  walk:    THREE.AnimationAction | null;
  run:     THREE.AnimationAction | null;
  attack:  THREE.AnimationAction | null;
  death:   THREE.AnimationAction | null;
  hurt:    THREE.AnimationAction | null;
}

// ── EnemyRig ─────────────────────────────────────────────────────────────────

/**
 * Fully initialised enemy visual: group in scene, mixer, and named clip
 * handles.  Position the group; call `mixer.update(dt)` each frame.
 */
export interface EnemyRig {
  /** Root scene group — add to the Three.js scene, position as desired. */
  group:      THREE.Group;
  /** Wired to `group`. Call `mixer.update(dt)` in the game loop. */
  mixer:      THREE.AnimationMixer | null;
  /** All animation clips found on the model. */
  allClips:   THREE.AnimationClip[];
  /** Typed standard state machine clips (null = clip not found on model). */
  clips:      EnemyAnimState;
  /** Scale applied to normalise the model to TARGET_HEIGHT world units. */
  normScale:  number;
  /** The CharModelDef that produced this rig (for debug and serialisation). */
  def:        CharModelDef;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** All loaded enemies are normalised to this height in world units. */
const TARGET_HEIGHT = 2.0;

// ── Fuzzy clip-name → standard state mapping ─────────────────────────────────

type AnimStateKey = keyof EnemyAnimState;

const CLIP_PATTERNS: Record<AnimStateKey, RegExp> = {
  idle:   /idle/i,
  walk:   /walk/i,
  run:    /run/i,
  attack: /attack|slash|swing|strike|bite|shoot|cast/i,
  death:  /death|die|dead|dying/i,
  hurt:   /hurt|hit|damage|pain|react/i,
};

/**
 * Match a list of AnimationClips against the standard state names and
 * return the best-match action for each state (or null if not found).
 */
function resolveClips(
  clips:  THREE.AnimationClip[],
  mixer:  THREE.AnimationMixer,
): EnemyAnimState {
  const result: EnemyAnimState = {
    idle: null, walk: null, run: null,
    attack: null, death: null, hurt: null,
  };

  for (const key of Object.keys(CLIP_PATTERNS) as AnimStateKey[]) {
    const pattern = CLIP_PATTERNS[key];
    const clip    = clips.find(c => pattern.test(c.name));
    if (clip) result[key] = mixer.clipAction(clip);
  }

  return result;
}

// ── EnemyLoader ───────────────────────────────────────────────────────────────

/**
 * Load a character model as an enemy rig.
 *
 * @param def        CharModelDef from charManifest (must have roles 'enemy').
 * @param spawnPos   World position to place the group at.
 * @returns          Resolved EnemyRig ready to be added to the scene.
 */
export async function loadEnemyModel(
  def:      CharModelDef,
  spawnPos: THREE.Vector3,
): Promise<EnemyRig> {
  const loaded = await loadCharModel(def);
  const group  = loaded.scene;

  // ── Scale to TARGET_HEIGHT ─────────────────────────────────────────────
  const boundsBox = await getCharModelBounds(def);
  const sz        = new THREE.Vector3();
  boundsBox.getSize(sz);
  const rawH      = sz.y;
  const normScale = rawH > 0.01 ? TARGET_HEIGHT / rawH : 1;
  group.scale.setScalar(normScale);

  // ── Centre on ground (Y=0 at feet) ────────────────────────────────────
  const centredBox = new THREE.Box3().setFromObject(group);
  group.position.set(
    spawnPos.x,
    spawnPos.y - centredBox.min.y,
    spawnPos.z,
  );

  // ── Wire AnimationMixer & resolve clips ────────────────────────────────
  const mixer    = loaded.mixer;
  const allClips = loaded.clips;
  const clips    = mixer ? resolveClips(allClips, mixer) : {
    idle: null, walk: null, run: null, attack: null, death: null, hurt: null,
  };

  // Auto-play idle if available (model looks alive on first spawn).
  clips.idle?.setLoop(THREE.LoopRepeat, Infinity).play();

  return { group, mixer: mixer ?? null, allClips, clips, normScale, def };
}

/**
 * Look up a CharModelDef by its id string and load it as an enemy rig.
 * Throws if the id is not found in charManifest.
 *
 * @param modelId  e.g. "kaykit_skeletons/Skeleton_Warrior"
 * @param spawnPos World position for the group.
 */
export async function loadEnemyById(
  modelId:  string,
  spawnPos: THREE.Vector3,
): Promise<EnemyRig> {
  const def = CHAR_MODELS.find(m => m.id === modelId);
  if (!def) {
    // PROC-B2g: unknown model IDs get a procedural enemy-creator rig
    console.log(`[EnemyLoader] "${modelId}" not in charManifest — using procedural enemy builder`);
    return buildProceduralEnemyRig(modelId, spawnPos);
  }
  return loadEnemyModel(def, spawnPos);
}

/**
 * PROC-B2g: Build a procedural enemy rig via the enemy-creator system.
 * Seeds appearance from modelId for deterministic results.
 */
async function buildProceduralEnemyRig(modelId: string, spawnPos: THREE.Vector3): Promise<EnemyRig> {
  // Derive a seed from the modelId string
  let seed = 0;
  for (let i = 0; i < modelId.length; i++) seed = (seed * 31 + modelId.charCodeAt(i)) >>> 0;

  const { getDefaultEnemyDna, tierForFloor } = await import('@/enemy-creator/defaults/EnemyDefaults');
  const { buildEnemy } = await import('@/enemy-creator/builder');

  // Infer species/role from known id patterns; fall back to sensible defaults
  const species  = modelId.includes('fox')    ? 'vulperia'
                 : modelId.includes('skeleton') || modelId.includes('zombie') ? 'undead'
                 : modelId.includes('slime')  ? 'slime'
                 : 'human';
  const role     = modelId.includes('mage')   ? 'caster'
                 : modelId.includes('rogue')  ? 'ranged'
                 : 'melee';
  const tier     = tierForFloor(0);   // default tier 1; caller can override

  const dna    = getDefaultEnemyDna(species as EnemyDNA['species'], role, tier, seed);
  const result = await buildEnemy(dna);
  result.rig.group.position.copy(spawnPos);
  return result.rig;
}

// ── Disposal ──────────────────────────────────────────────────────────────────

/**
 * Stop the mixer and release the animation actions.
 * The caller is responsible for removing `rig.group` from the scene and
 * disposing geometry/materials if no longer needed.
 */
export function disposeEnemyRig(rig: EnemyRig): void {
  rig.mixer?.stopAllAction();
  rig.mixer?.uncacheRoot(rig.group);
}

// ── ENEMY_MANIFEST ────────────────────────────────────────────────────────────

/**
 * Tier and species metadata for each enemy model.
 * Enemy IDs match `charManifest` model IDs.
 * Used by `RoomEncounterDef` for difficulty validation and AI selection.
 */
export type EnemyTier    = 1 | 2 | 3 | 'boss';
export type EnemySpecies = 'undead' | 'beast' | 'elemental' | 'fae' | 'humanoid' | 'construct';

export interface EnemyManifestEntry {
  /** Matches CharModelDef.id in charManifest.ts */
  id:       string;
  /** Stable short name used in RoomEncounterDef.enemyId */
  enemyId:  string;
  displayName: string;
  tier:     EnemyTier;
  species:  EnemySpecies;
}

/**
 * Canonical enemy manifest — maps short encounter IDs (used in
 * `RoomEncounterDef`) to full CharModelDef IDs and metadata.
 *
 * Add entries here as new enemy packs are integrated.
 */
export const ENEMY_MANIFEST: readonly EnemyManifestEntry[] = [
  // ── Tier 1 — Skeleton (KayKit) ──────────────────────────────────────────
  {
    id:          'kaykit_skeletons/Skeleton_Warrior',
    enemyId:     'skeleton_warrior',
    displayName: 'Skeleton Warrior',
    tier:        1,
    species:     'undead',
  },
  {
    id:          'kaykit_skeletons/Skeleton_Mage',
    enemyId:     'skeleton_mage',
    displayName: 'Skeleton Mage',
    tier:        1,
    species:     'undead',
  },
  {
    id:          'kaykit_skeletons/Skeleton_Rogue',
    enemyId:     'skeleton_rogue',
    displayName: 'Skeleton Rogue',
    tier:        1,
    species:     'undead',
  },
  {
    id:          'kaykit_skeletons/Skeleton_Minion',
    enemyId:     'skeleton_minion',
    displayName: 'Skeleton Minion',
    tier:        1,
    species:     'undead',
  },

  // ── Tier 1 — Quaternius Monster Pack ────────────────────────────────────
  {
    id:          'monster_pack_animated/skeleton',
    enemyId:     'skeleton_archer',
    displayName: 'Skeleton Archer',
    tier:        1,
    species:     'undead',
  },
  {
    id:          'monster_pack_animated/bat',
    enemyId:     'bat_swarm',
    displayName: 'Bat',
    tier:        1,
    species:     'beast',
  },
  {
    id:          'monster_pack_animated/slime',
    enemyId:     'slime_cube',
    displayName: 'Slime Cube',
    tier:        1,
    species:     'elemental',
  },

  // ── Tier 1 — Easy Animated (Quaternius 2019) ─────────────────────────────
  {
    id:          'easy_animated/spider',
    enemyId:     'giant_spider',
    displayName: 'Giant Spider',
    tier:        1,
    species:     'beast',
  },
  {
    id:          'easy_animated/wasp',
    enemyId:     'wasp',
    displayName: 'Wasp',
    tier:        1,
    species:     'beast',
  },
  {
    id:          'easy_animated/frog',
    enemyId:     'bog_frog',
    displayName: 'Bog Frog',
    tier:        1,
    species:     'beast',
  },
  {
    id:          'easy_animated/rat',
    enemyId:     'giant_rat',
    displayName: 'Giant Rat',
    tier:        1,
    species:     'beast',
  },
  {
    id:          'easy_animated/snake',
    enemyId:     'serpent',
    displayName: 'Serpent',
    tier:        1,
    species:     'beast',
  },

  // ── Tier 1 — Goblin Pack ─────────────────────────────────────────────────
  {
    id:          'goblin_pack/Basic_Goblin',
    enemyId:     'goblin_scout',
    displayName: 'Goblin Scout',
    tier:        1,
    species:     'humanoid',
  },
  {
    id:          'goblin_pack/Goblin_Archer',
    enemyId:     'goblin_archer',
    displayName: 'Goblin Archer',
    tier:        1,
    species:     'humanoid',
  },
  {
    id:          'goblin_pack/Goblin_Warrior',
    enemyId:     'goblin_warrior',
    displayName: 'Goblin Warrior',
    tier:        1,
    species:     'humanoid',
  },

  // ── Tier 2 — Quaternius Monster Pack ────────────────────────────────────
  {
    id:          'monster_pack_animated/dragon',
    enemyId:     'dragon_whelp',
    displayName: 'Dragon Whelp',
    tier:        'boss',
    species:     'beast',
  },

  // ── Tier 2 — Orc Pack ────────────────────────────────────────────────────
  {
    id:          'orc_pack/Ash_Walker',
    enemyId:     'ash_walker',
    displayName: 'Ash Walker',
    tier:        2,
    species:     'humanoid',
  },
  {
    id:          'orc_pack/Bone_Whittler',
    enemyId:     'bone_whittler',
    displayName: 'Bone Whittler',
    tier:        2,
    species:     'humanoid',
  },
  {
    id:          'orc_pack/Ironbound_Marauder',
    enemyId:     'ironbound_marauder',
    displayName: 'Ironbound Marauder',
    tier:        2,
    species:     'humanoid',
  },

  // ── Tier 2 — Golem Pack ──────────────────────────────────────────────────
  {
    id:          'golem_free/Earth_Golem',
    enemyId:     'golem_stone',
    displayName: 'Stone Golem',
    tier:        2,
    species:     'construct',
  },
  {
    id:          'golem_free/Iron_Golem',
    enemyId:     'golem_iron',
    displayName: 'Iron Golem',
    tier:        2,
    species:     'construct',
  },
  {
    id:          'golem_free/Rock_Golem',
    enemyId:     'golem_rock',
    displayName: 'Rock Golem',
    tier:        2,
    species:     'construct',
  },

  // ── Tier 2 — Skeletons Free (alternative art) ────────────────────────────
  {
    id:          'skeletons_free/Skeleton',
    enemyId:     'skeleton_alt',
    displayName: 'Skeleton (Alt)',
    tier:        1,
    species:     'undead',
  },
  {
    id:          'skeletons_free/Skeleton_Archer',
    enemyId:     'skeleton_archer_alt',
    displayName: 'Skeleton Archer (Alt)',
    tier:        1,
    species:     'undead',
  },

  // ── Tier 2/3 — Meshy AI Custom Enemies ───────────────────────────────────
  {
    id:          'meshy_dark_fay/meshy_dark_fay',
    enemyId:     'dark_fay',
    displayName: 'Dark Fay',
    tier:        2,
    species:     'fae',
  },
  {
    id:          'meshy_mutated_pig_man/meshy_mutated_pig_man',
    enemyId:     'pig_man_brute',
    displayName: 'Pig-Man Brute',
    tier:        2,
    species:     'humanoid',
  },
  {
    id:          'meshy_vampire_fay/meshy_vampire_fay',
    enemyId:     'vampire_fay',
    displayName: 'Vampire Fay',
    tier:        3,
    species:     'fae',
  },

  // ── Tier 3 / Boss — Bandits ──────────────────────────────────────────────
  {
    id:          'bandits_free/Thug',
    enemyId:     'bandit',
    displayName: 'Bandit',
    tier:        1,
    species:     'humanoid',
  },
  {
    id:          'bandits_free/Poacher',
    enemyId:     'poacher',
    displayName: 'Poacher',
    tier:        1,
    species:     'humanoid',
  },
  {
    id:          'bandits_free/Scavenger',
    enemyId:     'scavenger',
    displayName: 'Scavenger',
    tier:        1,
    species:     'humanoid',
  },
];

/**
 * Look up an `EnemyManifestEntry` by the short `enemyId` used in
 * `RoomEncounterDef.enemyId`.
 */
export function getEnemyManifestEntry(enemyId: string): EnemyManifestEntry | undefined {
  return ENEMY_MANIFEST.find(e => e.enemyId === enemyId);
}

/**
 * Look up the `CharModelDef` for a given short `enemyId`.
 * Returns undefined if the entry or model is not found.
 */
export function getEnemyModelDef(enemyId: string): CharModelDef | undefined {
  const entry = getEnemyManifestEntry(enemyId);
  if (!entry) return undefined;
  return CHAR_MODELS.find(m => m.id === entry.id);
}
