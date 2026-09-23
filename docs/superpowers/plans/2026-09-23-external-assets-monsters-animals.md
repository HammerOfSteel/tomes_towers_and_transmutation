# External Assets — Monsters & Animals (Sub-task 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared "External Assets" Settings toggle infrastructure, and wire the newly-imported Quaternius monster packs (`bestiary_dungeon_monsters`, `cute_animated_monsters`) and animal pack (`ultimate_animated_animals`) into the existing dungeon enemy-spawn and overworld ambient-wildlife systems, with instant fallback to today's unmodified procedural/existing-asset behavior whenever the category is off or no real asset is mapped for a specific kind.

**Architecture:** A new `ExternalAssetConfig` module (mirrors `WorldGenConfig.ts`'s load/save-with-defaults pattern) persists 6 per-category on/off flags to one structured `localStorage` key, surfaced in a new Dev-Mode-gated "External Assets" section of the Settings menu. Two small resolver modules — `QuatEnemyAdapter.ts` (monsters, feeding into `SceneManager._spawnWave()`) and an extension to `AmbientWildlife.ts` (animals) — each check the config, and either build from a real Quaternius asset or fall through unchanged to the existing procedural/CharacterLoader path. This is sub-task 1 of 5 in the "Wiring Real Assets Into Procedural Systems" spec (`docs/asset-integration/2026-09-23-wiring-design-spec.md`) — see that doc for full cross-system context; this plan only implements the Monsters + Animals slice plus the shared toggle infra every later sub-task will reuse.

**Tech Stack:** TypeScript, three.js (`GLTFLoader`/`SkeletonUtils` via the existing `QuaterniusAssetLoader.ts`), Vitest for unit tests, Playwright for smoke verification.

## Global Constraints

- All 6 category toggles default to `true` (real assets ON) the first time Dev Mode is enabled — per the approved spec §3.
- Every resolver must fall through to the existing, unmodified procedural/CharacterLoader path whenever its category toggle is off, AND whenever the toggle is on but no real-asset mapping exists for that specific enemyId/species — per spec §2's "Hard rule #2". Never throw or spawn nothing as a result of a missing mapping.
- No resolver may change placement, siting, count, spacing, or spawn timing — only which mesh/rig is used for an already-decided spawn. Per spec §2's "Hard rule".
- The `ttt_external_assets_v1` localStorage key holds a `Record<AssetCategory, boolean>` — one structured key, not per-category ad-hoc keys — per spec §3.
- New source files use the existing `@/` path alias (see `tsconfig.json`'s path mapping, already used throughout the codebase, e.g. `@/world/WorldGenConfig`).
- Do not modify `src/characters/charManifest.ts` or `src/assets/quaterniusManifest.ts` — both are auto-generated (see their own "DO NOT EDIT" headers); all new manifest data lives in new, hand-written files.

---

## File Structure

New files:
- `src/world/ExternalAssetConfig.ts` — the shared per-category toggle config (types, load/save, `isCategoryEnabled`). Used by every current and future resolver in this initiative.
- `tests/world/ExternalAssetConfig.test.ts` — unit tests for the config module.
- `src/enemy/QuatEnemyAdapter.ts` — `QUAT_ENEMY_MANIFEST` (new monster roster) + `loadEnemyRigFromQuatAsset()` + `resolveEnemyRig()` (the monster resolver, checked by `SceneManager` instead of calling `loadEnemyById()` directly).
- `tests/enemy/QuatEnemyAdapter.test.ts` — unit tests (mock `loadQuatAsset`, verify manifest validity + fallback behavior).

Modified files:
- `src/ui/MainMenu.ts` — new "External Assets" Settings section (Dev-Mode-gated), wired to `ExternalAssetConfig`.
- `src/levels/SceneManager.ts` — one call-site change (`loadEnemyById` → `resolveEnemyRig`) in `_spawnWave()`.
- `src/world/AmbientWildlife.ts` — `AmbientBiomeRule` gains an optional `realAsset` field; `AmbientSpawnPoint` carries it through; new biome rules added (tundra, snow, savanna, desert); `AmbientCreature` gains real-asset swap-in logic.
- `src/scene/OverworldScene.ts` — one call-site change (pass `sp.realAsset` into `new AmbientCreature(...)`).
- `tests/world/AmbientWildlife.test.ts` — new tests for the extended biome rules and the real-asset swap-in behavior.

---

## Task 1: `ExternalAssetConfig` — shared toggle config module

**Files:**
- Create: `src/world/ExternalAssetConfig.ts`
- Test: `tests/world/ExternalAssetConfig.test.ts`

**Interfaces:**
- Produces: `AssetCategory` (union type), `ExternalAssetConfig` (interface), `DEFAULT_EXTERNAL_ASSET_CONFIG`, `loadExternalAssetConfig(): ExternalAssetConfig`, `saveExternalAssetConfig(cfg: ExternalAssetConfig): void`, `isCategoryEnabled(cat: AssetCategory): boolean` — every later task in this plan (and every future sub-task's resolver) imports `isCategoryEnabled` from this file.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/world/ExternalAssetConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  type AssetCategory,
  DEFAULT_EXTERNAL_ASSET_CONFIG,
  loadExternalAssetConfig,
  saveExternalAssetConfig,
  isCategoryEnabled,
} from '@/world/ExternalAssetConfig';

const ALL_CATEGORIES: AssetCategory[] = [
  'nature-props', 'animals', 'monsters',
  'settlement-buildings', 'building-interiors', 'dungeons-towers',
];

beforeEach(() => {
  localStorage.clear();
});

describe('DEFAULT_EXTERNAL_ASSET_CONFIG', () => {
  it('has all 6 categories defaulting to true', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(DEFAULT_EXTERNAL_ASSET_CONFIG.enabled[cat]).toBe(true);
    }
  });
});

describe('loadExternalAssetConfig', () => {
  it('returns the defaults when localStorage is empty', () => {
    const cfg = loadExternalAssetConfig();
    expect(cfg).toEqual(DEFAULT_EXTERNAL_ASSET_CONFIG);
  });

  it('fills missing keys with defaults when localStorage has a partial config', () => {
    localStorage.setItem('ttt_external_assets_v1', JSON.stringify({ enabled: { monsters: false } }));
    const cfg = loadExternalAssetConfig();
    expect(cfg.enabled.monsters).toBe(false);
    expect(cfg.enabled.animals).toBe(true); // untouched key falls back to default
  });

  it('returns defaults when localStorage holds invalid JSON', () => {
    localStorage.setItem('ttt_external_assets_v1', '{not valid json');
    const cfg = loadExternalAssetConfig();
    expect(cfg).toEqual(DEFAULT_EXTERNAL_ASSET_CONFIG);
  });
});

describe('saveExternalAssetConfig', () => {
  it('persists a config that loadExternalAssetConfig can read back', () => {
    const cfg = { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false, animals: false } };
    saveExternalAssetConfig(cfg);
    const reloaded = loadExternalAssetConfig();
    expect(reloaded.enabled.monsters).toBe(false);
    expect(reloaded.enabled.animals).toBe(false);
    expect(reloaded.enabled.dungeonsTowers ?? reloaded.enabled['dungeons-towers']).toBe(true);
  });
});

describe('isCategoryEnabled', () => {
  it('reads the persisted value for a given category', () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false } });
    expect(isCategoryEnabled('monsters')).toBe(false);
    expect(isCategoryEnabled('animals')).toBe(true);
  });

  it('defaults to true when localStorage is empty', () => {
    expect(isCategoryEnabled('nature-props')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/ExternalAssetConfig.test.ts`
Expected: FAIL — `Cannot find module '@/world/ExternalAssetConfig'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/world/ExternalAssetConfig.ts
/**
 * ExternalAssetConfig — per-category on/off toggles for whether procedural
 * placement/construction systems hand off "what mesh to place" to a real,
 * imported Quaternius asset instead of their existing procedural builder.
 *
 * Mirrors WorldGenConfig.ts's load/save-with-defaults pattern: one
 * structured localStorage key holding the whole config, missing keys
 * filled from defaults on load. See
 * docs/asset-integration/2026-09-23-wiring-design-spec.md §3.
 *
 * All 6 categories default to `true` (real assets ON) — Dev Mode (which
 * gates the Settings UI for these toggles) exists so a developer can turn
 * individual categories OFF to isolate/compare/debug, not so real assets
 * start opt-in. Every resolver elsewhere in the codebase must still fall
 * through to its existing procedural/asset builder whenever a toggle here
 * is false, or when true but no real-asset mapping exists for a specific
 * kind (see spec §2's "Hard rule #2" — this file only stores the flags,
 * it does not enforce the fallback; each resolver enforces its own).
 */

export type AssetCategory =
  | 'nature-props'
  | 'animals'
  | 'monsters'
  | 'settlement-buildings'
  | 'building-interiors'
  | 'dungeons-towers';

export interface ExternalAssetConfig {
  enabled: Record<AssetCategory, boolean>;
}

export const DEFAULT_EXTERNAL_ASSET_CONFIG: Readonly<ExternalAssetConfig> = {
  enabled: {
    'nature-props':          true,
    'animals':               true,
    'monsters':              true,
    'settlement-buildings':  true,
    'building-interiors':    true,
    'dungeons-towers':       true,
  },
};

const LS_KEY = 'ttt_external_assets_v1';

/** Load config from localStorage, filling missing keys with defaults. */
export function loadExternalAssetConfig(): ExternalAssetConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled } };
    const parsed = JSON.parse(raw) as Partial<ExternalAssetConfig>;
    return {
      enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, ...(parsed.enabled ?? {}) },
    };
  } catch {
    return { enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled } };
  }
}

/** Persist config to localStorage. */
export function saveExternalAssetConfig(cfg: ExternalAssetConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

/** Convenience read for a single category — used by every resolver. */
export function isCategoryEnabled(cat: AssetCategory): boolean {
  return loadExternalAssetConfig().enabled[cat];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/ExternalAssetConfig.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/ExternalAssetConfig.ts tests/world/ExternalAssetConfig.test.ts
git commit -m "feat(assets): add ExternalAssetConfig shared per-category toggle store"
```

---

## Task 2: "External Assets" Settings menu section

**Files:**
- Modify: `src/ui/MainMenu.ts` (settings modal HTML around the existing `🎭 Characters` section, ~line 780-800; wiring code near the existing `charModeCb`/`charPacksRow` wiring, ~line 908-925)

**Interfaces:**
- Consumes: `loadExternalAssetConfig`, `saveExternalAssetConfig`, `type AssetCategory` from `@/world/ExternalAssetConfig` (Task 1).
- Produces: nothing new consumed by later tasks — this is a leaf UI task, verified visually/manually (this codebase has no existing unit tests for `MainMenu.ts`; consistent with how the sibling `🎭 Characters`/`World Generation` sections are verified).

- [ ] **Step 1: Add the import**

In `src/ui/MainMenu.ts`, add to the top import block (after the existing `WorldGenConfig` import):

```typescript
import {
  type AssetCategory,
  loadExternalAssetConfig,
  saveExternalAssetConfig,
} from '@/world/ExternalAssetConfig';
```

- [ ] **Step 2: Add the category display list**

Add this constant near the top of the file, after `const LS_CHARACTER_SPECIES = 'ttt_character_species';`:

```typescript
const EXTERNAL_ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[] = [
  { id: 'monsters',             label: 'Monsters' },
  { id: 'animals',              label: 'Animals' },
  { id: 'nature-props',         label: 'Nature Props' },
  { id: 'settlement-buildings', label: 'Settlement Buildings' },
  { id: 'building-interiors',   label: 'Building Interiors' },
  { id: 'dungeons-towers',      label: 'Dungeons / Towers' },
];
```

- [ ] **Step 3: Add the HTML section**

In `_buildSettingsModal()`, find where `wg` and `devOn` are read (near the top of the method, alongside `const wg = loadWorldGenConfig();`) and add:

```typescript
    const extCfg = loadExternalAssetConfig();
```

Then find the end of the `🎭 Characters` section's HTML block — the last line is:

```html
    `);
```

(right after the `mm-char-packs-row` closing `</div>`, before the `const footer = mkEl('div', 'mm-modal-footer');` line). Insert this new block just before that closing `` `); `` — i.e. append to the same template literal, right after the `mm-char-packs-row` div and before the template literal's closing backtick:

```html
      ${devOn ? `
      <div class="mm-setting-divider"></div>
      <div class="mm-setting-row mm-setting-row--section-hdr">
        <span class="mm-setting-section-title">🧩 External Assets (Dev)</span>
      </div>
      <div class="mm-setting-row">
        <label class="mm-setting-label">
          All Categories
          <span class="mm-setting-dev-hint">Master toggle — sets every category below at once</span>
        </label>
        <label class="mm-toggle">
          <input type="checkbox" id="mm-ext-assets-all" ${Object.values(extCfg.enabled).every(v => v) ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>
      ${EXTERNAL_ASSET_CATEGORIES.map(c => `
      <div class="mm-setting-row">
        <label class="mm-setting-label">${c.label}</label>
        <label class="mm-toggle">
          <input type="checkbox" class="mm-ext-assets-cb" data-cat="${c.id}" ${extCfg.enabled[c.id] ? 'checked' : ''}>
          <span class="mm-toggle-track"><span class="mm-toggle-thumb"></span></span>
        </label>
      </div>`).join('')}
      ` : ''}
```

- [ ] **Step 4: Wire the toggle behavior**

In `_buildSettingsModal()`, after the existing "Character mode + pack selection" wiring block (right after the `card.querySelectorAll<HTMLInputElement>('.mm-char-pack-cb')` block's closing `});`), add:

```typescript
    // ── External Assets (Dev-Mode-gated category toggles) ────────────────────
    const extAllCb = card.querySelector<HTMLInputElement>('#mm-ext-assets-all');
    const extCatCbs = card.querySelectorAll<HTMLInputElement>('.mm-ext-assets-cb');

    const saveExtCfg = (): void => {
      const enabled = { ...extCfg.enabled };
      extCatCbs.forEach(cb => {
        enabled[cb.dataset.cat as AssetCategory] = cb.checked;
      });
      extCfg.enabled = enabled;
      saveExternalAssetConfig(extCfg);
      if (extAllCb) extAllCb.checked = Object.values(enabled).every(v => v);
    };

    extCatCbs.forEach(cb => cb.addEventListener('change', saveExtCfg));

    extAllCb?.addEventListener('change', () => {
      extCatCbs.forEach(cb => { cb.checked = extAllCb.checked; });
      saveExtCfg();
    });
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `MainMenu.ts` or `ExternalAssetConfig.ts`

- [ ] **Step 6: Manual smoke check**

Run: `npm run dev` (or use the already-running dev server), open the game's main menu, enable Dev Mode in Settings, reopen Settings, confirm the new "🧩 External Assets (Dev)" section appears with 6 category toggles + an "All Categories" master toggle, all checked by default; toggle one off, close and reopen Settings, confirm it stayed off (persisted); toggle Dev Mode back off, confirm the whole section disappears.

- [ ] **Step 7: Commit**

```bash
git add src/ui/MainMenu.ts
git commit -m "feat(ui): add Dev-Mode-gated External Assets settings section"
```

---

## Task 3: `QuatEnemyAdapter` — monster manifest + real-asset enemy rig loader

**Files:**
- Create: `src/enemy/QuatEnemyAdapter.ts`
- Test: `tests/enemy/QuatEnemyAdapter.test.ts`

**Interfaces:**
- Consumes: `loadQuatAsset` from `@/assets/QuaterniusAssetLoader` (existing), `QUAT_MODELS` from `@/assets/quaterniusManifest` (existing), `isCategoryEnabled` from `@/world/ExternalAssetConfig` (Task 1), `EnemyRig`, `EnemyAnimState`, `loadEnemyById` from `@/enemy/EnemyLoader` (existing — unmodified), `CharModelDef` from `@/characters/charManifest` (existing, used only for the synthetic `def` field's type).
- Produces: `QuatEnemyManifestEntry` (interface), `QUAT_ENEMY_MANIFEST` (array), `getQuatEnemyManifestEntry(enemyId): QuatEnemyManifestEntry | undefined`, `resolveEnemyRig(enemyId: string, spawnPos: THREE.Vector3): Promise<EnemyRig>` — Task 4 (`SceneManager.ts`) calls `resolveEnemyRig` in place of `loadEnemyById`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/enemy/QuatEnemyAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { saveExternalAssetConfig, DEFAULT_EXTERNAL_ASSET_CONFIG } from '@/world/ExternalAssetConfig';

// Mock the real GLTF-loading layer so no network/filesystem is hit — mirrors
// src/assets/__tests__/QuaterniusAssetLoader.test.ts's approach, but mocks
// one level higher (loadQuatAsset itself) since this adapter doesn't care
// about format dispatch, only about what loadQuatAsset returns.
const mockScene = () => {
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return scene;
};

vi.mock('@/assets/QuaterniusAssetLoader', () => ({
  loadQuatAsset: vi.fn(async () => ({
    scene: mockScene(),
    mixer: null,
    clips: [],
    format: 'glb',
  })),
}));

vi.mock('@/enemy/EnemyLoader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/enemy/EnemyLoader')>();
  return {
    ...actual,
    loadEnemyById: vi.fn(async (_id: string, spawnPos: THREE.Vector3) => ({
      group: new THREE.Group(),
      mixer: null,
      allClips: [],
      clips: { idle: null, walk: null, run: null, attack: null, death: null, hurt: null },
      normScale: 1,
      def: { id: 'fallback/def', packId: 'fallback', name: 'Fallback', path: '', format: 'glb', roles: ['enemy'], tags: [], animated: false },
    })),
  };
});

import { QUAT_ENEMY_MANIFEST, getQuatEnemyManifestEntry, resolveEnemyRig } from '@/enemy/QuatEnemyAdapter';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';
import { loadEnemyById } from '@/enemy/EnemyLoader';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('QUAT_ENEMY_MANIFEST — structural validity', () => {
  it('has at least 5 entries', () => {
    expect(QUAT_ENEMY_MANIFEST.length).toBeGreaterThanOrEqual(5);
  });

  it('all enemyIds are unique', () => {
    const ids = QUAT_ENEMY_MANIFEST.map(e => e.enemyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all quatModelId values resolve to a real QUAT_MODELS entry', () => {
    const missing: string[] = [];
    for (const entry of QUAT_ENEMY_MANIFEST) {
      if (!QUAT_MODELS.some(m => m.id === entry.quatModelId)) missing.push(entry.quatModelId);
    }
    expect(missing, `Missing QUAT_MODELS refs:\n${missing.join('\n')}`).toHaveLength(0);
  });

  it('includes the pre-existing "imp" TODO enemyId from RoomEncounterDef', () => {
    expect(getQuatEnemyManifestEntry('imp')).toBeDefined();
    expect(getQuatEnemyManifestEntry('imp')!.quatModelId).toBe('monsters/bestiary_dungeon_monsters/Imp');
  });
});

describe('resolveEnemyRig', () => {
  const spawnPos = new THREE.Vector3(1, 0, 2);

  it('falls back to loadEnemyById when the monsters category is OFF', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: false } });
    await resolveEnemyRig('imp', spawnPos);
    expect(loadEnemyById).toHaveBeenCalledWith('imp', spawnPos);
    expect(loadQuatAsset).not.toHaveBeenCalled();
  });

  it('falls back to loadEnemyById when ON but no manifest mapping exists', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: true } });
    await resolveEnemyRig('__nonexistent_enemy__', spawnPos);
    expect(loadEnemyById).toHaveBeenCalledWith('__nonexistent_enemy__', spawnPos);
    expect(loadQuatAsset).not.toHaveBeenCalled();
  });

  it('uses the real asset when ON and a mapping exists', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, monsters: true } });
    const rig = await resolveEnemyRig('imp', spawnPos);
    expect(loadQuatAsset).toHaveBeenCalledTimes(1);
    expect(loadEnemyById).not.toHaveBeenCalled();
    expect(rig.group.position.x).toBeCloseTo(1);
    expect(rig.group.position.z).toBeCloseTo(2);
    expect(rig.def.id).toBe('monsters/bestiary_dungeon_monsters/Imp');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enemy/QuatEnemyAdapter.test.ts`
Expected: FAIL — `Cannot find module '@/enemy/QuatEnemyAdapter'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/enemy/QuatEnemyAdapter.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enemy/QuatEnemyAdapter.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/enemy/QuatEnemyAdapter.ts tests/enemy/QuatEnemyAdapter.test.ts
git commit -m "feat(enemy): add QuatEnemyAdapter monster resolver + new monster roster"
```

---

## Task 4: Wire `resolveEnemyRig` into `SceneManager._spawnWave()`

**Files:**
- Modify: `src/levels/SceneManager.ts` (around lines 837-853, the `loadEnemyById()` call inside `_spawnWave()`)
- Test: `tests/levels/enemyLoader.test.ts` (existing — must still pass unchanged)

**Interfaces:**
- Consumes: `resolveEnemyRig` from `@/enemy/QuatEnemyAdapter` (Task 3).

- [ ] **Step 1: Locate and inspect the current call site**

Run: `grep -n "loadEnemyById" src/levels/SceneManager.ts`
Expected output includes a line like:
```
837:        loadEnemyById(group.userData.enemyId, spawnPos).then((rig) => {
```

- [ ] **Step 2: Swap the import**

In `src/levels/SceneManager.ts`, find the existing import line (something like):
```typescript
import { loadEnemyById } from '@/enemy/EnemyLoader';
```
Replace it with:
```typescript
import { resolveEnemyRig } from '@/enemy/QuatEnemyAdapter';
```

If `loadEnemyById` is imported alongside other named imports from `@/enemy/EnemyLoader` on the same line, remove only `loadEnemyById` from that line and add the new import as a separate line, keeping the rest of that import statement unchanged.

- [ ] **Step 3: Swap the call**

Replace the call found in Step 1:
```typescript
loadEnemyById(group.userData.enemyId, spawnPos).then((rig) => {
```
with:
```typescript
resolveEnemyRig(group.userData.enemyId, spawnPos).then((rig) => {
```

Leave everything else in that `.then(...)` block (attaching the rig, hiding procedural placeholder meshes, etc.) completely unchanged — `resolveEnemyRig` resolves to the exact same `EnemyRig` shape `loadEnemyById` did.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 5: Run the existing enemy loader test suite to confirm no regression**

Run: `npx vitest run tests/levels/enemyLoader.test.ts`
Expected: PASS (all pre-existing tests, unchanged — this file doesn't test `SceneManager` directly, it's confirming `EnemyLoader`'s own exports are untouched)

- [ ] **Step 6: Commit**

```bash
git add src/levels/SceneManager.ts
git commit -m "feat(enemy): route SceneManager enemy spawns through the monster resolver"
```

---

## Task 5: Extend `AmbientBiomeRule` with an optional real-asset override

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (the `AmbientBiomeRule` interface and `AMBIENT_BIOME_RULES` table, lines ~65-80; `AmbientSpawnPoint`, lines ~105-110; `selectAmbientSpawnPoints()`'s push statement, ~line 140)
- Test: `tests/world/AmbientWildlife.test.ts` (existing file — add new tests)

**Interfaces:**
- Produces: `AmbientBiomeRule.realAsset?: { quatModelId: string; targetHeight: number }`, `AmbientSpawnPoint.realAsset?` (same shape) — Task 7 (`AmbientCreature`) consumes this.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/AmbientWildlife.test.ts` (new `describe` block, after the existing `AMBIENT_BIOME_RULES` block):

```typescript
import { QUAT_MODELS } from '@/assets/quaterniusManifest';

describe('AMBIENT_BIOME_RULES — real-asset overrides', () => {
  it('every realAsset.quatModelId resolves to a real QUAT_MODELS entry', () => {
    const missing: string[] = [];
    for (const [biome, rule] of Object.entries(AMBIENT_BIOME_RULES)) {
      if (rule?.realAsset && !QUAT_MODELS.some(m => m.id === rule.realAsset!.quatModelId)) {
        missing.push(`${biome}: ${rule.realAsset.quatModelId}`);
      }
    }
    expect(missing, `Missing QUAT_MODELS refs:\n${missing.join('\n')}`).toHaveLength(0);
  });

  it('adds new tundra/snow/savanna/desert biome rules', () => {
    expect(AMBIENT_BIOME_RULES.tundra).toBeDefined();
    expect(AMBIENT_BIOME_RULES.snow).toBeDefined();
    expect(AMBIENT_BIOME_RULES.savanna).toBeDefined();
    expect(AMBIENT_BIOME_RULES.desert).toBeDefined();
  });

  it('every biome rule still has a procedural species fallback (species is mandatory)', () => {
    for (const rule of Object.values(AMBIENT_BIOME_RULES)) {
      expect(['rabbit', 'goat']).toContain(rule!.species);
    }
  });
});

describe('selectAmbientSpawnPoints — carries realAsset through', () => {
  it('spawn points for a biome with a realAsset rule include it', () => {
    const wg = new WorldGrid(9, 9);
    // WorldGrid defaults every cell to 'grassland' per its own constructor —
    // AMBIENT_BIOME_RULES.grassland must have a realAsset after this task.
    const points = selectAmbientSpawnPoints(wg, 0, 0, 200, 12345);
    const withReal = points.filter(p => p.realAsset);
    expect(withReal.length).toBeGreaterThan(0);
    for (const p of withReal) {
      expect(p.realAsset!.quatModelId).toMatch(/^animals\//);
      expect(p.realAsset!.targetHeight).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `AMBIENT_BIOME_RULES.tundra` is `undefined`, `realAsset` is `undefined` on spawn points

- [ ] **Step 3: Extend the types and table**

In `src/world/AmbientWildlife.ts`, replace the `AmbientBiomeRule` interface and `AMBIENT_BIOME_RULES` constant:

```typescript
export interface AmbientRealAssetRef {
  /** QuatModelDef.id in quaterniusManifest.ts. */
  quatModelId:  string;
  /** World-unit height the loaded GLB is normalised to (mirrors EnemyLoader's TARGET_HEIGHT pattern). */
  targetHeight: number;
}

export interface AmbientBiomeRule {
  /** Procedural fallback — always required, used when the 'animals' External
   *  Assets category is off, or when realAsset is undefined for this biome. */
  species: AmbientSpecies;
  /** Relative spawn density vs. AMBIENT_BASE_SPACING's single Poisson-disk pass — see this
   *  plan's Global Constraints for the (spacing_base/spacing_desired)² derivation. */
  keepProbability: number;
  /** Real-asset override checked when the 'animals' category is enabled
   *  (see docs/asset-integration/2026-09-23-wiring-design-spec.md §4.1). */
  realAsset?: AmbientRealAssetRef;
}

export const AMBIENT_BIOME_RULES: Partial<Record<BiomeId, AmbientBiomeRule>> = {
  forest:    { species: 'rabbit', keepProbability: 1.0,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Fox',        targetHeight: 0.6 } },
  grassland: { species: 'rabbit', keepProbability: 1.0,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Deer',       targetHeight: 1.1 } },
  taiga:     { species: 'rabbit', keepProbability: 0.327,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Wolf',       targetHeight: 0.9 } },
  mountain:  { species: 'goat',   keepProbability: 0.529,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Stag',       targetHeight: 1.3 } },
  tundra:    { species: 'rabbit', keepProbability: 0.35,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Husky',      targetHeight: 0.7 } },
  snow:      { species: 'rabbit', keepProbability: 0.30,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Horse_White',targetHeight: 1.5 } },
  savanna:   { species: 'rabbit', keepProbability: 0.40,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Bull',       targetHeight: 1.4 } },
  desert:    { species: 'rabbit', keepProbability: 0.25,
               realAsset: { quatModelId: 'animals/ultimate_animated_animals/Donkey',     targetHeight: 1.2 } },
};
```

- [ ] **Step 4: Extend `AmbientSpawnPoint` and thread `realAsset` through selection**

Still in `src/world/AmbientWildlife.ts`, update `AmbientSpawnPoint`:

```typescript
export interface AmbientSpawnPoint {
  x: number;
  z: number;
  species: AmbientSpecies;
  realAsset?: AmbientRealAssetRef;
}
```

In `selectAmbientSpawnPoints()`, find:
```typescript
    points.push({ x, z, species: rule.species });
```
Replace with:
```typescript
    points.push({ x, z, species: rule.species, realAsset: rule.realAsset });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS (all existing + 4 new tests)

- [ ] **Step 6: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat(wildlife): add real-asset overrides to AMBIENT_BIOME_RULES"
```

---

## Task 6: `AmbientCreature` real-asset swap-in

**Files:**
- Modify: `src/world/AmbientWildlife.ts` (`AmbientCreature` class — constructor, new private fields, `update()`)
- Test: `tests/world/AmbientWildlife.test.ts` (existing — add new tests)

**Interfaces:**
- Consumes: `isCategoryEnabled` from `@/world/ExternalAssetConfig` (Task 1), `loadQuatAsset` from `@/assets/QuaterniusAssetLoader`, `QUAT_MODELS` from `@/assets/quaterniusManifest`, `AmbientRealAssetRef` (Task 5).
- Produces: `AmbientCreature`'s constructor signature changes from `(species, spawnPosition, seed)` to `(species, spawnPosition, seed, realAsset?)` — Task 7 (`OverworldScene.ts`) passes the 4th argument.

- [ ] **Step 1: Write the failing test**

Add to `tests/world/AmbientWildlife.test.ts`:

```typescript
vi.mock('@/assets/QuaterniusAssetLoader', () => ({
  loadQuatAsset: vi.fn(async () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene, mixer: null, clips: [], format: 'gltf' };
  }),
}));

import { saveExternalAssetConfig, DEFAULT_EXTERNAL_ASSET_CONFIG } from '@/world/ExternalAssetConfig';
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';

describe('AmbientCreature — real-asset swap-in', () => {
  const spawnPos = new THREE.Vector3(0, 0, 0);
  const realAsset = { quatModelId: 'animals/ultimate_animated_animals/Fox', targetHeight: 0.6 };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not attempt a real-asset load when the animals category is OFF', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, animals: false } });
    const creature = new AmbientCreature('rabbit', spawnPos, 1, realAsset);
    await Promise.resolve(); // flush any accidental microtask
    expect(loadQuatAsset).not.toHaveBeenCalled();
    creature.dispose();
  });

  it('does not attempt a real-asset load when no realAsset ref is provided', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, animals: true } });
    const creature = new AmbientCreature('rabbit', spawnPos, 1);
    await Promise.resolve();
    expect(loadQuatAsset).not.toHaveBeenCalled();
    creature.dispose();
  });

  it('loads the real asset and swaps it in when the category is ON and a ref is provided', async () => {
    saveExternalAssetConfig({ enabled: { ...DEFAULT_EXTERNAL_ASSET_CONFIG.enabled, animals: true } });
    const creature = new AmbientCreature('rabbit', spawnPos, 1, realAsset);
    // Real-asset load is async — wait for the microtask queue to drain.
    await new Promise(r => setTimeout(r, 0));
    expect(loadQuatAsset).toHaveBeenCalledTimes(1);
    creature.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: FAIL — `AmbientCreature` constructor doesn't accept a 4th argument / `loadQuatAsset` never called

- [ ] **Step 3: Implement the swap-in**

In `src/world/AmbientWildlife.ts`, add these imports at the top:

```typescript
import { loadQuatAsset } from '@/assets/QuaterniusAssetLoader';
import { QUAT_MODELS } from '@/assets/quaterniusManifest';
import { isCategoryEnabled } from '@/world/ExternalAssetConfig';
```

Update the `AmbientCreature` class: add two new private fields right after the existing `private _animTime = 0;`:

```typescript
  private _realMixer: THREE.AnimationMixer | null = null;
  private _usingRealAsset = false;
```

Update the constructor signature and body. Find:
```typescript
  constructor(species: AmbientSpecies, spawnPosition: THREE.Vector3, seed: number) {
```
Replace with:
```typescript
  constructor(
    species: AmbientSpecies,
    spawnPosition: THREE.Vector3,
    seed: number,
    realAsset?: AmbientRealAssetRef,
  ) {
```

At the very end of the constructor body (after the existing `this._behavior = { ... };` assignment, before the closing `}`), add:

```typescript

    if (realAsset && isCategoryEnabled('animals')) {
      this._loadRealAsset(realAsset);
    }
```

Add a new private method, right after the constructor (before `update(...)`):

```typescript
  /**
   * Fire-and-forget async swap-in: the procedural rig (built synchronously
   * above) remains visible and fully functional until this resolves, so the
   * creature is never invisible or broken while the GLB streams in — same
   * pattern as EnemyLoader's enemy-rig hand-off (see SceneManager._spawnWave()).
   */
  private async _loadRealAsset(ref: AmbientRealAssetRef): Promise<void> {
    const quatDef = QUAT_MODELS.find(m => m.id === ref.quatModelId);
    if (!quatDef) {
      console.warn(`[AmbientWildlife] real-asset ref "${ref.quatModelId}" not found in QUAT_MODELS`);
      return;
    }
    try {
      const loaded = await loadQuatAsset(quatDef);
      const box = new THREE.Box3().setFromObject(loaded.scene);
      const sz  = new THREE.Vector3();
      box.getSize(sz);
      const scale = sz.y > 0.01 ? ref.targetHeight / sz.y : 1;
      loaded.scene.scale.setScalar(scale);
      const centredBox = new THREE.Box3().setFromObject(loaded.scene);
      loaded.scene.position.y = -centredBox.min.y;

      this._rig.root.visible = false;
      this.root.add(loaded.scene);
      this._realMixer = loaded.mixer;
      if (loaded.mixer && loaded.clips.length > 0) {
        const idleClip = loaded.clips.find(c => /idle/i.test(c.name)) ?? loaded.clips[0];
        loaded.mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity).play();
      }
      this._usingRealAsset = true;
    } catch (err) {
      console.warn(`[AmbientWildlife] real-asset load failed for "${ref.quatModelId}" — keeping procedural rig:`, err);
    }
  }
```

Finally, in `update()`, find the existing animation-drive block near the end:
```typescript
    this._animTime += dt;
    animateCreature(this._rig, {
      state: this._behavior.state === 'idle' ? 'idle' : 'walk',
      time: this._animTime,
      velocity: speed,
    });
```
Replace with:
```typescript
    this._animTime += dt;
    if (this._usingRealAsset) {
      this._realMixer?.update(dt);
    } else {
      animateCreature(this._rig, {
        state: this._behavior.state === 'idle' ? 'idle' : 'walk',
        time: this._animTime,
        velocity: speed,
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/AmbientWildlife.test.ts`
Expected: PASS (all existing + new tests)

- [ ] **Step 5: Commit**

```bash
git add src/world/AmbientWildlife.ts tests/world/AmbientWildlife.test.ts
git commit -m "feat(wildlife): swap AmbientCreature to a real Quaternius asset when enabled"
```

---

## Task 7: Thread `realAsset` through `OverworldScene`'s spawn call site

**Files:**
- Modify: `src/scene/OverworldScene.ts` (~line 1459, the `new AmbientCreature(...)` call)

**Interfaces:**
- Consumes: `AmbientCreature`'s new 4th constructor parameter (Task 6), `AmbientSpawnPoint.realAsset` (Task 5).

- [ ] **Step 1: Update the call site**

In `src/scene/OverworldScene.ts`, find:
```typescript
      const creature = new AmbientCreature(
        sp.species, spawnPos,
        (this._seed ^ 0x1B7A_9E33) ^ Math.round(sp.x * 131) ^ Math.round(sp.z * 977),
      );
```
Replace with:
```typescript
      const creature = new AmbientCreature(
        sp.species, spawnPos,
        (this._seed ^ 0x1B7A_9E33) ^ Math.round(sp.x * 131) ^ Math.round(sp.z * 977),
        sp.realAsset,
      );
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/scene/OverworldScene.ts
git commit -m "feat(wildlife): pass real-asset ref from spawn points into AmbientCreature"
```

---

## Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npx vitest run`
Expected: all tests pass, including every test file touched/added in Tasks 1-7 (`ExternalAssetConfig.test.ts`, `QuatEnemyAdapter.test.ts`, `enemyLoader.test.ts`, `AmbientWildlife.test.ts`), plus no regressions elsewhere.

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Playwright smoke pass — monsters**

Start the dev server if not already running (`npm run dev`), then use a Playwright script (or the existing `test:e2e` harness) to:
1. Load the game, enable Dev Mode via Settings, open the "External Assets" section, confirm "Monsters" is checked.
2. Use the existing dev test hook (`window.__game`'s `spawnTestEnemy` per `main.ts:2073-2081`, or navigate to a dungeon floor 7 room that uses `f7_elite_spectral_knight`/an `imp`-bearing encounter pool, e.g. the pool referenced at `RoomEncounterDef.ts` lines 200/213/244/289) and confirm an Imp renders as the real Quaternius bestiary model (not the old procedural-enemy-creator fallback) with no console errors.
3. Toggle "Monsters" off in Settings, reload/re-enter the same encounter, confirm it falls back to the previous (pre-this-plan) procedural/charManifest visual with no console errors.

Expected: real asset renders correctly when ON, unchanged fallback renders when OFF, zero console errors either way.

- [ ] **Step 4: Playwright smoke pass — animals**

1. With "Animals" checked in Settings, load the overworld, walk into a grassland/forest/mountain/taiga chunk, confirm a real Deer/Fox/Stag/Wolf model appears (not just the procedural rabbit/goat) with animation playing, no console errors.
2. Toggle "Animals" off, reload, confirm only the original procedural rabbit/goat spawn, no console errors.

Expected: real assets render and animate correctly when ON; unchanged rabbit/goat-only behavior when OFF.

- [ ] **Step 5: Update the wiring design spec's status**

No spec content changes needed — Task 8's playtest gate below is the actual "done" signal per `research-driven-world-polish`'s required human playtest gate. Do not mark this sub-task complete in any doc until the user has playtested and approved it.

---

## Human Playtest Gate (required before Sub-task 2 starts)

Report to the user:
- What changed: new "External Assets" Settings section (Dev Mode → Settings → 🧩 External Assets), monsters (Imp + 20 new cute/bestiary monster types) and animals (Fox/Deer/Wolf/Stag/Husky/Horse White/Bull/Donkey added to biome spawn tables) now use real Quaternius assets when their category toggle is ON, with instant fallback to existing behavior when OFF.
- How to see it: enable Dev Mode in Settings, open the new External Assets section, toggle Monsters/Animals on and off while exploring the overworld and a dungeon floor with an `imp` encounter (e.g. floor 7's early rooms per `RoomEncounterDef.ts`).
- What to look for: correct textures/animations on the new monster/animal models (per the same rendering-bug categories found during step 2's playtest — shadows-only, static-pose-only, missing textures), correct fallback to the old behavior when a category is toggled off, no console errors.

**Do not start Sub-task 2 (Settlement Buildings + Building Interiors) until the user has playtested this and given explicit approval**, per `research-driven-world-polish`'s required gate. If feedback contradicts an assumption in this plan or the wiring design spec, revise the spec/research docs before writing Sub-task 2's plan — not just the code.
