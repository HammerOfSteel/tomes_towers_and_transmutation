# Asset Character Models — Implementation Plan

> Branch: `asset_characters`
>
> Mirrors the existing `assetMode` / `assetPacks` pattern in `WorldGenConfig` (environment tiles)
> but for characters, NPCs, and enemies.  Code-first procedural mode is **unchanged** — asset
> mode is strictly opt-in via a new Settings toggle.

---

## Design Principle

**Settings toggle — Character Mode: Code / Asset**

| Mode | Character Creation | Player | NPCs | Enemies |
|------|--------------------|--------|------|---------|
| Code (default) | DNA builder (current) | procedural CreatureRig | procedural | procedural SlimeEnemy etc. |
| Asset | Model browser | loaded GLB/FBX + AnimationMixer | GLB models per role | GLB models per enemy type |

When Asset mode is on the player also selects **which packs** are active — the same UX as
the environment asset packs row in Settings today.

---

## Complete Pack Catalogue

### Priority — Character Creation / Player

| Pack ID | Source zip | Models | Format | Animation |
|---------|-----------|--------|--------|-----------|
| `kaykit_adventurers` | soft_characters/KayKit_Adventurers_2.0_FREE.zip | Barbarian, Knight, Mage, Ranger, Rogue, Rogue_Hooded | **GLB** + FBX | Shared `Rig_Medium_General.glb` + `Rig_Medium_MovementBasic.glb` |
| `kaykit_skeletons` | soft_characters/KayKit_Skeletons_1.1_FREE.zip | Skeleton_Mage, Skeleton_Minion, Skeleton_Rogue, Skeleton_Warrior | **GLB** + FBX | Same shared rig files |
| `fox` | amazing_fit_characters/fox.zip | Fox | **GLB** + PBR textures | Embedded (inspect on load) |
| `slime` | amazing_fit_characters/Slime.zip | Slime | **GLB** + colour texture variants | Embedded |
| `animal_plushies` | amazing_fit_characters/Animal Plushies.zip | Bear, Bunny, Cat, Dog | **FBX only** — needs FBXLoader or Blender→GLB conversion | Embedded (TBD) |

### NPC Packs

| Pack ID | Models | Notes |
|---------|--------|-------|
| `villager_npc` | Blacksmith, Child, Hunter | FBX + shared texture |
| `fantasy_heroes` | Dwarf_Warrior, Elf_Archer, Hero, Knight, Necromancer, Paladin, Wizard | FBX |
| `royal_family` | King, Prince, Queen | FBX |
| `elf` | Elf, Fire_Elf, Ice_Elf | FBX |
| `samurai` | Female_Samurai, Samurai | FBX |

### Enemy Packs

| Pack ID | Models | Enemy Role |
|---------|--------|------------|
| `kaykit_skeletons` | Skeleton_Mage/Minion/Rogue/Warrior | skeleton |
| `skeletons_free` | Skeleton, Skeleton_Archer | skeleton (alt) |
| `goblin_pack` | Basic_Goblin, Goblin_Archer, Goblin_Warrior | goblin |
| `orc_pack` | Ash_Walker, Bone_Whittler, Ironbound_Marauder | orc |
| `bandits_free` | Poacher, Scavenger, Thug | bandit |
| `golem_free` | Earth_Golem, Iron_Golem, Rock_Golem | golem |
| `slime` | Slime (texture swaps: green/blue/orange) | slime |

---

## Phase 0 — Asset Extraction & Manifest Generation

**Goal**: Extract GLBs (priority) and FBXs (later phases) from zips into `public/assets/characters/`
and generate a typed TypeScript manifest that the game can import statically.

### Tasks

- [ ] Install `adm-zip` as a dev dependency (used by existing `gen-manifest.mjs` pattern)
  ```
  npm install --save-dev adm-zip
  ```

- [ ] Create `scripts/extract-char-assets.mjs`
  - Reads each zip listed in a config table inside the script
  - Extracts `.glb` and `.fbx` files + textures to `public/assets/characters/<packId>/`
  - Skips Unity/Unreal variant FBX sub-folders (`FBX_ Unity`, `FBX_Unreal`, `fbx(unity)`)
  - For KayKit packs: also copies `Animations/gltf/Rig_Medium/` → `public/assets/characters/animations/rig_medium/`
  - Idempotent — skip if output file already exists and source zip hasn't changed

- [ ] Create `scripts/gen-char-manifest.mjs`
  - Scans `public/assets/characters/**` for `.glb` / `.fbx` files
  - Emits `src/characters/charManifest.ts`:

    ```ts
    export type CharRole  = 'player' | 'npc' | 'enemy';
    export type CharFmt   = 'glb' | 'fbx';

    export interface CharModelDef {
      id:       string;       // "kaykit_adventurers/Knight"
      packId:   string;
      name:     string;       // "Knight"
      path:     string;       // "/assets/characters/kaykit_adventurers/Knight.glb"
      format:   CharFmt;
      roles:    CharRole[];
      animRig?: string;       // "/assets/characters/animations/rig_medium/Rig_Medium_General.glb"
      animRigB?: string;      // MovementBasic rig (walk/run)
      tags:     string[];     // e.g. ['warrior','humanoid','kaykit']
    }

    export interface CharPackDef {
      id:          string;
      name:        string;
      icon:        string;
      roles:       CharRole[];
      recommended: boolean;
      desc:        string;
    }

    export const CHAR_PACKS:  readonly CharPackDef[];
    export const CHAR_MODELS: readonly CharModelDef[];
    ```

- [ ] Add to `package.json`:
  ```json
  "extract:chars":    "node scripts/extract-char-assets.mjs",
  "gen:char-manifest":"node scripts/gen-char-manifest.mjs",
  "setup:chars":      "npm run extract:chars && npm run gen:char-manifest"
  ```

- [ ] Run `npm run setup:chars`, commit `public/assets/characters/` + `src/characters/charManifest.ts`

**Acceptance criteria**:
- `public/assets/characters/kaykit_adventurers/Knight.glb` exists and is <400 KB
- `public/assets/characters/animations/rig_medium/Rig_Medium_General.glb` exists
- `src/characters/charManifest.ts` has ≥ 20 models catalogued
- `tsc --noEmit` still passes

---

## Phase 1 — Loading Infrastructure

**Goal**: A caching async loader returning a Three.js scene + AnimationMixer for any model entry.
KayKit animation retargeting lives here — characters share a skeleton, animations are separate files.

### New file `src/characters/CharacterLoader.ts`

```ts
export interface LoadedChar {
  scene:  THREE.Group;
  mixer:  THREE.AnimationMixer | null;
  clips:  THREE.AnimationClip[];
  format: CharFmt;
}

export async function loadCharModel(def: CharModelDef): Promise<LoadedChar>
```

- GLB → `GLTFLoader` (already in project)
- FBX → `FBXLoader` from `three/addons/loaders/FBXLoader.js`
- LRU cache (max 20 entries) keyed by `def.path`
- For KayKit models (def.animRig set):
  1. Load character GLB (T-pose skinned mesh)
  2. Load `Rig_Medium_General.glb` + `Rig_Medium_MovementBasic.glb` (once, cached)
  3. Pass both to `AnimationRetargeter.retarget(charScene, animScene)` → merged clip array
  4. Create `AnimationMixer(charScene)` with those clips

### New file `src/characters/AnimationRetargeter.ts`

```ts
export function retargetKayKitClips(
  charScene: THREE.Group,
  animScene:  THREE.Group,
): THREE.AnimationClip[]
```

KayKit skeletons share bone names — clone each track in the animation clips, replace the
root path prefix with the matching bone in the char scene. Standard Three.js retargeting:
use `THREE.AnimationUtils.clone` then `track.name = track.name.replace(animRoot, charRoot)`.

### New file `src/characters/CharacterController.ts`

```ts
export type CharAnimState = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'die';

export class CharacterController {
  constructor(loaded: LoadedChar)
  setState(s: CharAnimState, crossFadeSec?: number): void
  update(dt: number): void
  get scene(): THREE.Group
}
```

- Crossfades between clips using `action.crossFadeTo`
- Falls back to simple bone oscillation if a clip is missing (e.g. FBX with no animation data)

### Modify `vite.config.ts`

- Ensure `assetsInclude: ['**/*.fbx']` so Vite doesn't try to transform FBX as JS
- Verify `three/addons` path resolves (may need alias)

**Acceptance**:
- Unit test: `loadCharModel` on KayKit Knight GLB returns scene with SkinnedMesh + ≥3 clips
- `CharacterController.setState('walk')` doesn't throw; `update(0.016)` advances mixer

---

## Phase 2 — Settings Extension + UI

**Goal**: Add `charMode` and `charPacks` to `WorldGenConfig`; expose in Settings modal
as a second asset-mode row below the existing environment assets row.

### Modify `src/world/WorldGenConfig.ts`

Add to `WorldGenConfig` interface:
```ts
/** 'code' = procedural DNA builder (default). 'asset' = GLB/FBX model packs. */
charMode:  'code' | 'asset';
/** Active character pack IDs when charMode is 'asset'. */
charPacks: string[];
```

Add `CHAR_PACK_DEFS` constant (same shape as `KENNEY_PACKS`):
```ts
export const CHAR_PACK_DEFS: readonly CharPackDef[] = [
  { id: 'kaykit_adventurers', name: 'KayKit Adventurers', icon: '⚔️',
    roles: ['player','npc'], recommended: true,  desc: 'Barbarian, Knight, Mage, Ranger, Rogue' },
  { id: 'kaykit_skeletons',   name: 'KayKit Skeletons',   icon: '💀',
    roles: ['player','enemy'], recommended: true,  desc: 'Mage, Minion, Rogue, Warrior skeleton variants' },
  { id: 'fox',                name: 'Fox',                 icon: '🦊',
    roles: ['player'], recommended: true,  desc: 'Fully rigged fox with PBR textures' },
  { id: 'slime',              name: 'Slime',               icon: '🟢',
    roles: ['player','enemy'], recommended: true,  desc: 'Slime with colour variants' },
  { id: 'animal_plushies',    name: 'Animal Plushies',     icon: '🧸',
    roles: ['player'], recommended: false, desc: 'Bear, Bunny, Cat, Dog — FBX' },
  { id: 'villager_npc',       name: 'Villager NPCs',       icon: '👨‍🌾',
    roles: ['npc'], recommended: true,  desc: 'Blacksmith, Child, Hunter' },
  { id: 'fantasy_heroes',     name: 'Fantasy Heroes',      icon: '🧙',
    roles: ['npc','player'], recommended: false, desc: 'Dwarf, Elf, Hero, Knight, Necromancer, Paladin, Wizard' },
  { id: 'royal_family',       name: 'Royal Family',        icon: '👑',
    roles: ['npc'], recommended: false, desc: 'King, Prince, Queen' },
  { id: 'elf',                name: 'Elves',               icon: '🌿',
    roles: ['npc','enemy'], recommended: false, desc: 'Elf, Fire Elf, Ice Elf' },
  { id: 'goblin_pack',        name: 'Goblin Pack',         icon: '👺',
    roles: ['enemy'], recommended: true,  desc: 'Basic Goblin, Archer, Warrior' },
  { id: 'orc_pack',           name: 'Orc Pack',            icon: '🪓',
    roles: ['enemy'], recommended: false, desc: 'Ash Walker, Bone Whittler, Ironbound Marauder' },
  { id: 'bandits_free',       name: 'Bandits',             icon: '🗡️',
    roles: ['enemy'], recommended: false, desc: 'Poacher, Scavenger, Thug' },
  { id: 'golem_free',         name: 'Golems',              icon: '🪨',
    roles: ['enemy'], recommended: false, desc: 'Earth, Iron, Rock Golem' },
  { id: 'skeletons_free',     name: 'Extra Skeletons',     icon: '☠️',
    roles: ['enemy'], recommended: false, desc: 'Skeleton, Skeleton Archer (alt style)' },
  { id: 'samurai',            name: 'Samurai',             icon: '🥷',
    roles: ['npc','player'], recommended: false, desc: 'Female Samurai, Samurai' },
];
```

Update `DEFAULT_WORLD_GEN_CONFIG`: `charMode: 'code'`, `charPacks: ['kaykit_adventurers','kaykit_skeletons','fox','slime','goblin_pack','villager_npc']`.

Update `loadWorldGenConfig` / `saveWorldGenConfig` to round-trip new fields.

### Modify `src/ui/MainMenu.ts`

In `_buildSettingsModal()` add a "Characters" section immediately after the existing
environment assets rows.  Follow the **exact same pattern**:

```
┌─ Characters ───────────────────────────────────────────────────────┐
│ Character Assets  [ Off / On toggle ]                              │
│ Off = procedural code-first DNA builder (default).                 │
│ On = GLB/FBX model packs.                                          │
│                                                                    │
│ ┌ Player  ────────────────────────────────────────────────────┐    │
│ │ [⚔️ KayKit Adventurers ✓]  [💀 KayKit Skeletons ✓]         │    │
│ │ [🦊 Fox ✓]  [🟢 Slime ✓]  [🧸 Animal Plushies]            │    │
│ └─────────────────────────────────────────────────────────────┘    │
│ ┌ NPCs  ──────────────────────────────────────────────────────┐    │
│ │ [👨‍🌾 Villager NPCs ✓]  [🧙 Fantasy Heroes]  [👑 Royal]     │    │
│ └─────────────────────────────────────────────────────────────┘    │
│ ┌ Enemies  ───────────────────────────────────────────────────┐    │
│ │ [👺 Goblins ✓]  [🪓 Orcs]  [🗡️ Bandits]  [🪨 Golems]      │    │
│ └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

Pack checkboxes are grouped by `roles[0]`.  Show/hide the pack rows when the toggle changes.

Wire `assetModeCb.change` to write `wg.charMode` and `assetPackCb.change` to update `wg.charPacks`.

**Acceptance**:
- Settings modal "Characters" section appears with toggle + pack checkboxes
- Toggle persists across page reload
- `tsc --noEmit` passes

---

## Phase 3 — Character Creation Browser

**Goal**: New Game screen switches to a model browser when charMode='asset'.

### New file `src/ui/AssetCharBrowser.ts`

```ts
export class AssetCharBrowser {
  constructor(container: HTMLElement, options: {
    charPacks: string[];
    onSelect:  (def: CharModelDef) => void;
  })
  dispose(): void
}
```

- Reads `CHAR_MODELS` filtered to `roles.includes('player')` + `packId in charPacks`
- Renders a grid of model cards:
  - Thumbnail: small three.js canvas (256×256) with `CharacterController` playing `idle`
  - Name, pack badge, role tags
  - Clicking highlights the card, calls `onSelect`
- "Confirm Selection" button emits the chosen `CharModelDef`

### Modify `src/ui/CharacterCreation.ts`

- On init: check `loadWorldGenConfig().charMode`
- **Asset mode**: hide `ctrlCol` (DNA pane); show `AssetCharBrowser` in its place.
  Name input and Boon section remain visible.
  On select: set `this._dna = { ...DEFAULT_PLAYER_DNA, _assetModel: def }` (store ref in dna or extend `CharacterConfig`).
- **Code mode**: existing behaviour, no change.

Extend `CharacterConfig` (or add a parallel field):
```ts
export interface CharacterConfig {
  name:       string;
  boon:       StartingBoon;
  slotId:     number;
  dna:        CreatureDNA;
  assetModel?: CharModelDef;   // set when charMode='asset'
}
```

### Modify `src/player/PlayerController.ts`

In `applyDNA(dna, config)`:
- If `config.assetModel` is set:
  1. `CharacterLoader.loadCharModel(config.assetModel)` (async — show loading spinner)
  2. Replace `this._creatureRig.root` with `loaded.scene`
  3. Create `this._assetCtrl = new CharacterController(loaded)`
- In `update(dt)`: if `_assetCtrl` → call `_assetCtrl.update(dt)`, translate WASD speed
  to `idle / walk / run` state transitions

**Acceptance**:
- New Game with charMode='asset' shows model browser
- Selecting Knight → in-game player is Knight.glb with idle anim playing
- Moving triggers walk/run animation crossfade

---

## Phase 4 — Dev Lab Integration

**Goal**: Creature Lab shows an "Asset Models" tab alongside the DNA builder.

### Modify `src/ui/DevSandbox.ts`

- Add mode toggle pill: **Procedural** / **Asset Models** (show/hide existing pane vs new browser)
- Asset Models tab: renders `AssetCharBrowser` with all roles, all active packs
- Spawning an asset model:
  - `CharacterLoader.loadCharModel(def)` → add scene to Three.js scene
  - Store `assetCtrl: CharacterController` in `_spawnedRigs` entry
  - Click-to-control + wander work as before; WASD drives `assetCtrl.setState`
- Type of `_spawnedRigs[n]`:
  ```ts
  walkCtrl:  ProceduralWalkController | ProceduralBipedWalkController | null;
  assetCtrl: CharacterController | null;  // one of these is non-null
  ```

**Acceptance**:
- Lab Asset tab shows all enabled packs
- Spawning Fox, clicking it → WASD moves fox with walk animation

---

## Phase 5 — Asset NPCs

**Goal**: Settlements spawn GLB-based NPC characters when charMode='asset'.

### New file `src/npc/AssetNPCSpawner.ts`

```ts
export type NpcRole = 'villager' | 'blacksmith' | 'guard' | 'child' | 'merchant' | 'noble';

export interface AssetNPCInstance {
  controller: CharacterController;
  root:       THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

export async function spawnAssetNPC(
  role: NpcRole,
  scene: THREE.Scene,
  pos:   THREE.Vector3,
  activePacks: string[],
): Promise<AssetNPCInstance>
```

Role → pack priority table:
- `villager` / `blacksmith` / `child` → `villager_npc`, fallback `fantasy_heroes`
- `guard`    → `kaykit_adventurers` (Knight/Barbarian), fallback `fantasy_heroes`
- `noble`    → `royal_family`
- `merchant` → `fantasy_heroes` (Hero), fallback `villager_npc`

Random selection within filtered models.  NPC gets idle→walk loop driven by simple wander.

### Modify settlement/village spawning

In `src/scene/OverworldScene.ts` (and `src/world/buildings/AssetBuildingAssembler.ts` where
NPC placement happens): check `loadWorldGenConfig().charMode === 'asset'`; if yes use
`AssetNPCSpawner` instead of procedural creatures.

**Acceptance**:
- Village with charMode='asset' shows Blacksmith.fbx / Hunter.fbx NPCs idling + wandering
- Fallback to code-first if `villager_npc` pack not active

---

## Phase 6 — Asset Enemies

**Goal**: Enemy encounters use GLB/FBX models with attack/die/hit animations.

Enemy type → pack mapping (picks random variant when multiple models exist):

| Enemy type | Primary pack | Fallback |
|------------|-------------|----------|
| `skeleton` | `kaykit_skeletons` (Warrior/Rogue/Mage/Minion) | `skeletons_free` |
| `goblin` | `goblin_pack` | — |
| `orc` | `orc_pack` | — |
| `bandit` | `bandits_free` | — |
| `golem` | `golem_free` | — |
| `slime` | `slime` (colour variant) | — |

### New file `src/enemy/AssetEnemyFactory.ts`

```ts
export async function createAssetEnemy(
  type:        EnemyType,
  scene:       THREE.Scene,
  pos:         THREE.Vector3,
  activePacks: string[],
): Promise<AssetEnemyInstance | null>   // null if no matching active pack
```

`AssetEnemyInstance` wraps `CharacterController`; existing combat AI (movement, HP, aggro)
wires to `setState('attack')`, `setState('hit')`, `setState('die')`.

### Modify `src/enemy/SlimeEnemy.ts`

- `SlimeEnemy.init(scene, charMode)`:
  - If `charMode === 'asset'` and `slime` pack active: swap geometry for `Slime.glb`
  - Retain all combat + AI logic; only visual mesh is replaced
  - `CharacterController` handles idle/bounce/die clips

**Acceptance**:
- Enemy room with charMode='asset' + goblin pack → Goblin_Warrior.fbx appears and attacks
- Slime enemy shows Slime.glb bouncing model with death anim on kill

---

## Phase 7 — FBX-only Pack Support

**Goal**: Animal Plushies, Villager NPC, and all `characters/` FBX packs load and animate.

### Context

Free releases of these packs include the T-pose rigged mesh only — no packaged
AnimationClips.  Two strategies (try in order per model):

1. **Retarget KayKit clips**: inspect bone names; if they share >80% with KayKit Rig_Medium
   skeleton, apply `AnimationRetargeter` to get walk/idle/attack clips "for free".
2. **Procedural overlay**: `CharacterController` detects zero clips; applies a lightweight
   per-bone oscillation overlay (head bob, arm swing, hip sway) using `THREE.Bone` direct
   rotation — same math as `CreatureAnimator._walkBiped` but applied to asset bones.

### Tasks

- [ ] For each FBX pack: run `CharacterLoader.loadCharModel` in browser, log bone name tree,
  compare to KayKit Rig_Medium bone list.  Document results in a comment in `charManifest.ts`.
- [ ] Implement bone-name comparison heuristic in `AnimationRetargeter.canRetarget(charScene, animScene): boolean`
- [ ] Implement procedural overlay fallback in `CharacterController` (activated when `clips.length === 0`)
- [ ] Optional (offline): `scripts/blender-fbx-to-glb.py` — Blender batch script that opens
  each FBX, applies scale, exports GLB to `public/assets/characters/<packId>/`.
  Run this manually; commit resulting GLBs alongside original FBX if size permits.

**Acceptance**:
- Dog, Cat, Bear, Bunny appear in character creation browser and walk in-game (even if just
  via procedural overlay)
- Villager Blacksmith, Hunter, Child appear in villages

---

## Phase 8 — Polish & Optimisation

- [ ] Loading spinner overlay during GLB/FBX load (reuse existing `mm-loading` overlay pattern)
- [ ] Preload player model before main scene renders (background `CharacterLoader.loadCharModel` during menu)
- [ ] Disable `castShadow` on NPC models >30 units from camera (update each frame in OverworldScene update loop)
- [ ] Skeleton instance sharing: `SkinnedMesh.skeleton.clone()` + shared geometry for
  multiple goblins of the same model variant (reduces GPU draw calls)
- [ ] Guard clause: if a `charPacks` entry is listed in config but the extracted files are missing,
  log a warning and fall back to code-first gracefully (never crash)
- [ ] Save/load: extend `CharacterConfig` save slot with `{ assetModelId?: string }` so the
  chosen GLB character persists across sessions

---

## Implementation Order & Dependencies

```
Phase 0 (extraction + manifest)
  └─▶ Phase 1 (loading infrastructure)
        ├─▶ Phase 2 (settings UI)
        │     └─▶ Phase 3 (character creation browser)
        │           └─▶ Phase 4 (dev lab)
        └─▶ Phase 5 (asset NPCs)       ← can be parallel with Phase 3/4
        └─▶ Phase 6 (asset enemies)    ← can be parallel with Phase 5
Phase 7 (FBX fallback)  — after Phase 1, can be done any time
Phase 8 (polish)        — after all previous phases
```

---

## Files Created / Modified

| File | Action | Phase |
|------|--------|-------|
| `scripts/extract-char-assets.mjs` | Create | 0 |
| `scripts/gen-char-manifest.mjs` | Create | 0 |
| `public/assets/characters/**` | Create (extracted) | 0 |
| `src/characters/charManifest.ts` | Create (generated) | 0 |
| `src/characters/CharacterLoader.ts` | Create | 1 |
| `src/characters/AnimationRetargeter.ts` | Create | 1 |
| `src/characters/CharacterController.ts` | Create | 1 |
| `src/world/WorldGenConfig.ts` | Modify | 2 |
| `src/ui/MainMenu.ts` | Modify | 2 |
| `src/ui/AssetCharBrowser.ts` | Create | 3 |
| `src/ui/CharacterCreation.ts` | Modify | 3 |
| `src/player/PlayerController.ts` | Modify | 3 |
| `src/ui/DevSandbox.ts` | Modify | 4 |
| `src/npc/AssetNPCSpawner.ts` | Create | 5 |
| `src/scene/OverworldScene.ts` | Modify | 5 |
| `src/enemy/AssetEnemyFactory.ts` | Create | 6 |
| `src/enemy/SlimeEnemy.ts` | Modify | 6 |
| `src/main.ts` | Modify | 4, 5, 6 |

---

## Quick Reference — KayKit Animation Clip Names

From `Rig_Medium_General.glb` (expected):
`Idle`, `Attack`, `Attack2`, `Jump`, `Hit`, `Die`, `Cheer`, `Sit`, `Dance`

From `Rig_Medium_MovementBasic.glb` (expected):
`Walk`, `Run`, `WalkBackwards`, `Crouch`, `CrouchWalk`

> Verify actual clip names at load time with `gltf.animations.map(c => c.name)` and update
> `CharacterController`'s clip-name lookup table accordingly.
