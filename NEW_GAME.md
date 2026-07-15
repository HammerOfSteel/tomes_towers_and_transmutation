# NEW_GAME: Narrative Character Creation Sequence

**Feature:** Replace the classical character selector with a first-person campfire scene where the Wizard interrogates you. Your answers determine who you are.

**Design goal:** The player never sees a UI panel labelled "Choose Your Character". They experience a story scene. The character emerges from the conversation. The scene occupies ~90% of the screen at all times; dialogue chrome is minimal and cinematic.

---

## Lore Premise

You are a princess — though not a particularly fancy one — captured by an old wizard who insists on filing his Tower Census paperwork. A campfire in the dark woods. An absent-minded captor with a clipboard. And you, answering his increasingly absurd questions because, well, you have absolutely nothing better to do.

---

## Character Roster

All player characters come from the **KayKit Adventure 2.0** pack (`kaykit_adventurers` and `kaykit_skeletons`) plus the **Slime** pack. The choice of character is determined entirely by conversation outcome — the player never picks a model from a list.

| ID | Model path | Species branch | Background hook |
|----|-----------|---------------|----------------|
| `rogue` | `kaykit_adventurers/Rogue` | Human → A | Barbarian father — will smash towers |
| `rogue_hooded` | `kaykit_adventurers/Rogue_Hooded` | Human → B | Knight boyfriend — will find you |
| `mage` | `kaykit_adventurers/Mage` | Human → C | Ranger uncle — always out of range of trouble |
| `skeleton_mage` | `kaykit_skeletons/Skeleton_Mage` | Undead → A | Botched dungeon dive + ancient lich |
| `skeleton_rogue` | `kaykit_skeletons/Skeleton_Rogue` | Undead → B | Simp undead boyfriend, eternal devotion |
| `slime` | `slime/Slime` | Slime → | Hivemind adjacent, existential dread |
| `fox_rogue` | `kaykit_adventurers/Rogue` + fox swap (TBD) | Vulperia → | Lone wolf, extremely unhappy about this |

> **Note on Fox Rogue:** No Vulperia model exists in the manifest yet. For NG-1 scope, use `kaykit_adventurers/Rogue` as a placeholder and mark this as a Phase NG-5 asset task. The fox model from the `fox` pack may be usable with a rig swap, or a new asset is needed.

---

## The Three Wizards

Three wizard models, one randomly chosen per new game. Each is a Meshy.ai biped with two GLBs:

| Zip | Folder stem | Character |
|-----|-------------|-----------|
| `old_toad_wizard.zip` | `Meshy_AI_Dungeon_Toad_Mage_biped` | Toad/Frog sorcerer |
| `old_wizard_elf.zip` | `Meshy_AI_Elder_Wanderer_Mage_biped` | Elderly elf wanderer |
| `old_wizard_lizard.zip` | `Meshy_AI_Lizard_Sorcerer_biped` | Lizard sorcerer |

Each zip contains:
- `*_Character_output.glb` — rigged T-pose mesh (load this for geometry + skeleton)
- `*_Meshy_AI_Meshy_Merged_Animations.glb` — all animation clips merged in

Animation clips needed: **Walk**, **Idle** (exact names TBD — verify after extraction in NG-0).

The selection is seeded by `Math.random()` before the dungeon seed is set, so a different wizard can appear on replays.

---

## Full Dialogue Script

### PHASE 1 — The Taxonomic Assessment *(determines species)*

> **The Wizard** *(squinting at clipboard):*  
> "Ah! You're awake. Excellent. I'd love to get right back to my transmutations, but the Tower Census requires I log all incoming guests. My notes got completely ruined by a spilled potion of frog-breath, so you'll have to remind me... what exactly *are* you? My eyesight isn't what it used to be."

| # | Your response | → Branch |
|---|--------------|---------|
| A | *"I'm a human, you senile old bat. Open this door."* | `human` |
| B | *(Rattle your bones aggressively)* *"Do I look like I have any skin left?"* | `undead` |
| C | *(Hiss, baring fangs)* *"Touch my tail and you lose a finger. I work alone."* | `vulperia` |
| D | *(Squelch indignantly)* *"We… are… squishy… we are legion…"* | `slime` |

---

### PHASE 2 — The Backstory Deposition *(determines class; locks character model)*

#### Branch: `human`

> **The Wizard:**  
> "Human? Ah, yes. The fleshy, complain-y ones. Well, I need to know who I should expect to come banging on my tower door. Who is going to be mildly *inconvenienced* by your disappearance?"

| # | Your response | Locks | Wizard remark |
|---|--------------|-------|---------------|
| 1 | *"My dad. He's massive, furious, and doesn't know what an 'inside voice' is. He is going to smash this tower to rubble."* | **Rogue** | *"Mmm. Reinforce front gate."* *(scribbles frantically)* |
| 2 | *"My boyfriend. He's a knight in shining armor. The glare is why I wear this hood. But he will find me."* | **Rogue Hooded** | *"Ugh, paladins. So preachy."* *(shudders)* |
| 3 | *"My uncle. He's a ranger. He spent my whole life trying to teach me to stay 'out of range' of trouble. Guess I failed that lesson."* | **Mage** | *"A fellow academic of the ranged arts! How charming."* *(brightens noticeably)* |

#### Branch: `undead`

> **The Wizard:**  
> "Undead! Oh, marvelous. No feeding required. Cuts down on the grocery budget *immensely*. How did you end up so… calcified?"

| # | Your response | Locks | Wizard remark |
|---|--------------|-------|---------------|
| 1 | *"An ancient lich, a botched dungeon dive, and a warrior party leader who insisted we 'push ahead just one more room'."* | **Skeleton Mage** | *"Classic middle-management error."* *(chuckles)* |
| 2 | *"Tragic romance. Even after death, my undead minion boyfriend wouldn't leave me alone. We got separated when you dragged me here."* | **Skeleton Rogue** | *"Ah. Young, eternal, co-dependent love."* *(sighs wistfully)* |

#### Branch: `vulperia`

> **The Wizard:**  
> "A Vulperia! Fascinating. So mysterious. So brooding. So much *shedding* on my stone floors."

*No further choice. Locks immediately.*

| Locks | Wizard remark |
|-------|---------------|
| **Fox Rogue** | *"Lone wolf type, I presume? Though you did get captured, so…"* *(trails off, wisely)* |

> *Player crosses arms. Wizard wisely stops talking.*

#### Branch: `slime`

> **The Wizard:**  
> "A slime! Oh, lovely. I had another one of you earlier, just a different color. Do you all share a hivemind, or…?"

*No further choice. Locks immediately.*

| Locks | Wizard remark |
|-------|---------------|
| **Slime** | *"Splendid. I'll just… not ask any follow-up questions then."* |

> *You jiggle in a way that suggests profound existential dread. Or possibly hunger.*

---

### PHASE 3 — The Bureaucracy of Base Stats *(2 questions, +2 stat each)*

Once locked in, the Wizard taps his quill.

> **The Wizard:**  
> "Right, that's the demographics sorted. Just a few more questions for my files. Totally standard procedure, I assure you."

#### Stat Question 1: The Pickle Jar

> **The Wizard:**  
> "Tell me — if you encounter a stubborn jar of pickled newt eyes, how do you open it?"

| # | Response | Stat bonus |
|---|---------|-----------|
| 1 | *Smash it with the nearest heavy object.* | `+2 Strength` |
| 2 | *Carefully pry the seal with a dagger or sharp claw.* | `+2 Agility` |
| 3 | *Read the enchanted label to reverse the vacuum seal.* | `+2 Intelligence` |
| 4 | *Stare at it until it gives up. Or just swallow the whole jar.* | `+2 Constitution` |

#### Stat Question 2: The Tower Gruel

> **The Wizard:**  
> "I'm going to have my constructs deliver standard tower gruel for dinner. Your immediate reaction?"

| # | Response | Stat bonus |
|---|---------|-----------|
| 1 | *Throw it directly into your stupid face.* | `+2 Attack Power` |
| 2 | *Wait until you leave, then pick the lock and raid your pantry for the good cheese.* | `+2 Stealth / Crit Chance` |
| 3 | *Use the latent magical residue in the cell to transmute it into passable stew.* | `+2 Magic Power` |
| 4 | *Complain loudly about the texture, but eat it anyway because revenge requires calories.* | `+2 Max HP` |

#### Wizard's Farewell

> **The Wizard:**  
> "Splendid! Well, you have fun in here. Don't touch the books on that shelf — they're highly volatile. I'll be upstairs if you need me, which you won't, because the door is locked. Toodles!"

*He packs up his clipboard, stands, and walks back into the dark.*

*You look at the dusty shelf of arcane textbooks.*

*The game begins.*

---

## Scene Design

### Setting
A forest clearing at night. A central campfire. You are seated on a log, low to the ground — the camera represents your first-person perspective from sitting height (~1.1 m). You never see yourself. The wizard stands on the opposite side of the fire.

```
          [trees]  [trees]  [trees]
        [trees]                  [trees]
      [trees]     campfire       [trees]
                 🔥
        [log]  [you→]   [←wizard]
        [trees]                  [trees]
          [trees]  [trees]  [trees]
```

### Camera
- **Type:** `PerspectiveCamera`, FOV 65°
- **Position:** (0, 1.1, 1.8) — seated, looking across the fire
- **Lookpoint:** (0, 1.35, -1.0) — approximately the wizard's face
- **Subtle breathe:** sine-wave oscillation ±0.004 on Y, ±0.002 on X (period ~4 s each, slightly offset)
- **Choice nod:** on selection, a brief downward dip (-0.012 Y over 0.15 s then back) to simulate a nod
- No orbit controls; camera is fixed during this sequence

### Campfire
- Geometry: inverted cone of `MeshBasicMaterial` emissive orange/yellow, gently animated UV scroll
- `PointLight` at fire center: color `#ff8833`, intensity 2.5, distance 12, decay 2
- Flicker: `PointLight.intensity` is driven by `0.5 + 0.5 * (simplex noise on time * 2.0)` (seeded) → range [1.8, 3.2]
- Particle system: 40 `Points` rising from fire base, fading out at height 1.0

### Forest
- 24 tree silhouettes arranged in two staggered rings (radius 7 and 10)
- Each tree: cylinder trunk (`#1a0f0a`) + cone canopy (`#0d1a0d`), slight random height variation
- All trees unlit (dark silhouettes against night sky) — `MeshBasicMaterial`

### Night Sky
- Scene background: `Color(0x04060e)` (near black, deep blue)
- Star field: 800 `Points` in a sphere radius 40, `PointsMaterial` size 0.06, color `#aabbff`

### Wizard Enter Sequence
1. Wizard loaded off-screen at position (0.6, 0, -9) — behind the fire, in the dark
2. Walk animation plays; wizard moves forward at ~1.6 units/second
3. Over 3.8 seconds wizard reaches resting position (0.6, 0, -2.2) — across the fire from camera
4. Walk → Idle crossfade (0.3 s)
5. Wizard faces (0, 0, 1.8) — approximately the camera position
6. Brief pause (0.6 s) before first dialogue line appears

### Firelight on Wizard
The wizard geometry should respond to the flickering fire. Achieved by:
- Directional light from fire position: `DirectionalLight(0xff8833, 0.8)` pointing from (0,1,0) toward wizard
- This light's intensity is also jittered with the same simplex seed as the PointLight

---

## UI Design

The dialogue overlay occupies only the **bottom 22%** of the screen. The scene is always visible.

### Wizard Speech Bubble
```
┌──────────────────────────────────────────────┐
│ — The Wizard                                 │
│                                              │
│ "Ah! You're awake. Excellent. I'd love to    │
│  get right back to my transmutations, but…" │
└──────────────────────────────────────────────┘
```
- Background: `rgba(6, 8, 18, 0.82)` with `backdrop-filter: blur(4px)`
- Width: min(680 px, 80vw), centered
- Typewriter effect: one character every 28 ms (can be skipped by clicking/space)
- Attribution line `— The Wizard` shown above text in muted italic, fades in first

### Choice Cards
After typewriter completes, 2–4 choice cards slide up from below (staggered, 80ms between each):
```
┌──────────────────────────┐ ┌──────────────────────────┐
│ [1] "I'm a human, you   │ │ [2] *(Rattle bones       │
│     senile old bat."    │ │     aggressively)*        │
└──────────────────────────┘ └──────────────────────────┘
┌──────────────────────────┐ ┌──────────────────────────┐
│ [3] *(Hiss, baring      │ │ [4] *(Squelch             │
│     fangs)*              │ │     indignantly)*         │
└──────────────────────────┘ └──────────────────────────┘
```
- 2 cards per row on wide screens, 1 per row on narrow
- Background: `rgba(12, 15, 30, 0.75)`, border: `1px solid rgba(120,100,200,0.3)`
- Hover: border brightens to `rgba(180,150,255,0.6)`
- Active (selected): fills `rgba(80,60,160,0.5)`, scale 0.97 briefly
- Keyboard: press **1–4** to select

### Lock-in Feedback
When a species/class is determined (Phase 1 or 2):
- The chosen card shimmers with a brief purple pulse
- Wizard turns head slightly — achieved by playing 1 frame of a "look" pose (lerp to look-at target)
- Wizard's remark text appears in the speech bubble before Phase 3 begins

### Phase 3 (stat questions)
Same UI but choice cards are slightly wider (one-liner responses fit on a single row):
```
┌──────────────────────────────────┐ ┌──────────────────────────────────┐
│ [1] Smash it.                   │ │ [2] Pick at the seal carefully.  │
└──────────────────────────────────┘ └──────────────────────────────────┘
```
Each answered card shows `+2 ✦ Strength` (etc.) in small text after selection.

### Fade Transitions
- Fade in from black: 1.2 s at scene start
- Choice → next dialogue: no fade, just speech bubble updates
- Final farewell → game start: fade to black over 2 s, then `startGame()` called

---

## Implementation Phases

---

### Phase NG-0: Wizard Asset Extraction

**Goal:** Extract and serve wizard GLBs; verify animation clips load.

**Tasks:**
- [ ] Create extraction script `scripts/extract-wizards.mjs`:
  - Reads each of the 3 zips from `assets/characters/`
  - Extracts to `public/assets/characters/wizards/<wizard_id>/` (Vite-served)
  - Output paths:
    - `wizards/toad/mesh.glb`
    - `wizards/toad/anims.glb`
    - `wizards/elf/mesh.glb`
    - `wizards/elf/anims.glb`
    - `wizards/lizard/mesh.glb`
    - `wizards/lizard/anims.glb`
  - Run once, idempotent (skip if already extracted)
- [ ] Add `npm run extract-wizards` script to `package.json`
- [ ] Create `src/characters/wizardManifest.ts`:
  ```ts
  export const WIZARD_DEFS = [
    { id: 'toad',   meshPath: '/assets/characters/wizards/toad/mesh.glb',   animPath: '/assets/characters/wizards/toad/anims.glb'   },
    { id: 'elf',    meshPath: '/assets/characters/wizards/elf/mesh.glb',    animPath: '/assets/characters/wizards/elf/anims.glb'    },
    { id: 'lizard', meshPath: '/assets/characters/wizards/lizard/mesh.glb', animPath: '/assets/characters/wizards/lizard/anims.glb' },
  ] as const;
  export type WizardId = typeof WIZARD_DEFS[number]['id'];
  ```
- [ ] Create `src/characters/WizardLoader.ts`:
  - Loads mesh GLB + anims GLB
  - Returns `{ group: THREE.Group, mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[] }`
  - Uses same SkeletonUtils retarget pattern as CharacterLoader (anims GLB → mesh skeleton)
  - Caches by wizardId (same wizard won't reload on repeat new game)
- [ ] Write a `scripts/inspect-wizard-clips.mjs` dev utility to print clip names for all 3 wizards (headless Node + GLTFLoader via import map or three/examples/jsm)
- [ ] Document actual clip names in `wizardManifest.ts` once verified

**Acceptance:**  
`WizardLoader.load('elf')` returns a group with a running AnimationMixer with at least 1 clip. Verified in browser console.

---

### Phase NG-1: Campfire Scene (`NewGameScene.ts`)

**Goal:** A standalone Three.js scene that can be mounted and unmounted cleanly.

**File:** `src/scene/NewGameScene.ts`

**Interface:**
```ts
class NewGameScene {
  readonly renderer: THREE.WebGLRenderer;  // receives the main shared renderer
  mount(container: HTMLElement): void;     // appends canvas, starts RAF loop
  unmount(): void;                         // removes canvas, stops RAF, disposes
  loadWizard(wizardId: WizardId): Promise<void>;  // loads + parks wizard off-screen
  runEnterSequence(): Promise<void>;       // wizard walks to fire, returns when idle
  runExitSequence(): Promise<void>;        // wizard walks back into dark
  onFrame?: (dt: number) => void;         // hook for dialogue system to drive camera nod etc.
}
```

**Scene construction tasks:**
- [ ] Night sky: `scene.background = new THREE.Color(0x04060e)` + 800-point star field
- [ ] Ground plane: `PlaneGeometry(30, 30)` rotated, `MeshLambertMaterial(#1a0f07)`, receives shadow
- [ ] Ambient light: `AmbientLight(0x1a1520, 0.15)` — near dark, slight purple tint
- [ ] Campfire:
  - Flame: inverted cone + `ShaderMaterial` (animated UV noise → orange/yellow palette)
  - `PointLight(0xff8833, 2.5, 12, 2)` at fire position, flickered via `simplex(time * 2.8) * 0.8 + 2.1`
  - Particle emitter: 40 points, upward velocity + random XZ drift, fade by Y
  - Log ring: 4 box geometries arranged in square around fire
- [ ] Forest silhouettes: 24 trees in two rings, `MeshBasicMaterial` dark colors
- [ ] Camera setup: PerspectiveCamera FOV 65, positioned at (0, 1.1, 1.8), lookAt (0, 1.35, -0.8)
- [ ] Camera breathe: two sine oscillators on Y and X, ±0.004 and ±0.002, periods 4.1 s and 5.7 s
- [ ] Camera nod method `triggerNod()`: tween Y by -0.014 over 0.12 s then back (choice feedback)
- [ ] Wizard walk-in: lerp position from (-9) to (-2.2) on Z, drive Walk clip, crossfade to Idle on arrival
- [ ] Fire directional light aimed at wizard position (tracks wizard during walk-in)
- [ ] RAF loop: calls `onFrame(dt)`, updates mixer, updates fire flicker, updates star points (slow rotate)
- [ ] Dispose: `renderer.dispose()` is NOT called (renderer is shared with main game); only scene-specific objects disposed

**Tests (Vitest, `tests/unit/NewGameScene.test.ts`):**
- Scene constructs without throwing
- `loadWizard` resolves (mock GLTFLoader returning stub)
- `runEnterSequence` resolves after > 3 s simulated elapsed time

---

### Phase NG-2: Dialogue Overlay (`DialogueOverlay.ts`)

**Goal:** Minimal, cinematic HTML overlay for typewriter speech and choice cards.

**File:** `src/ui/DialogueOverlay.ts`

**Interface:**
```ts
class DialogueOverlay {
  mount(container: HTMLElement): void;
  unmount(): void;
  speak(text: string, speaker?: string): Promise<void>;   // typewriter → resolves when done (or skipped)
  choose(choices: string[]): Promise<number>;              // shows cards, resolves with 0-based index
  showStatGain(label: string): void;                      // briefly shows "+2 ✦ Strength" etc.
  fadeIn(duration?: number): Promise<void>;
  fadeOut(duration?: number): Promise<void>;
  clear(): void;
}
```

**Implementation tasks:**
- [ ] HTML structure (all JS-created, no external HTML file changes):
  ```
  .overlay (position:fixed, full screen, pointer-events:none)
    .dialogue-panel (bottom 22%, centered, translucent)
      .speaker-name  — attribution line
      .dialogue-text — typewriter target
    .choices-row (above panel, flex-wrap, pointer-events:auto)
      .choice-card × N
    .stat-toast (top-right corner, brief flash)
  ```
- [ ] Typewriter: `setInterval` at 28ms, appends one character, HTML-escaped; resolves on completion
- [ ] Skip: `click` or `space` keydown flushes remaining text immediately and resolves
- [ ] Choice cards: slide-up via CSS `transform: translateY(+20px) → 0` + `opacity 0→1`, staggered 80ms
- [ ] Keyboard 1–4: selects corresponding card
- [ ] Lock-in pulse: chosen card gets class `ccv2-choice--selected`, CSS `@keyframes` purple shimmer
- [ ] Stat toast: `+2 ✦ Strength` positioned top-right, fades out after 1.4 s
- [ ] Full-screen fade: overlay `.fade-black` div transitions opacity 0→1 or 1→0
- [ ] Responsive: 2 columns on viewport width ≥ 768px, 1 column below

**Tests (`tests/unit/DialogueOverlay.test.ts`, using jsdom):**
- `speak(text)` resolves after `text.length * 28 ms` simulated with `vi.useFakeTimers`
- `speak(text)` resolves immediately when skip is triggered
- `choose(['a','b'])` resolves with index `1` when second card is clicked
- Keyboard `'2'` keydown resolves `choose` with index `1`

---

### Phase NG-3: Decision Tree (`CharacterDecisionTree.ts`)

**Goal:** Pure data + logic; no DOM, no Three.js. Drives the conversation to a `ConversationResult`.

**File:** `src/scene/CharacterDecisionTree.ts`

**Types:**
```ts
interface DialogueNode {
  speaker: 'wizard' | 'narrator';
  text: string;
  choices?: DialogueChoice[];
  wizardRemark?: string;   // line spoken after a locking choice
}

interface DialogueChoice {
  text: string;
  effect: ChoiceEffect;
}

type ChoiceEffect =
  | { type: 'branch'; species: Species; next: DialogueNode }
  | { type: 'lock';   characterId: CharacterId; remark?: string; next: DialogueNode }
  | { type: 'stat';   stat: StatBonus }
  | { type: 'end' };

type Species = 'human' | 'undead' | 'vulperia' | 'slime';
type CharacterId = 'rogue' | 'rogue_hooded' | 'mage' | 'skeleton_mage' | 'skeleton_rogue' | 'slime' | 'fox_rogue';
type StatBonus  = 'strength' | 'agility' | 'intelligence' | 'constitution'
                | 'attack_power' | 'stealth' | 'magic_power' | 'max_hp';

interface ConversationResult {
  characterId: CharacterId;
  statBonuses:  StatBonus[];   // exactly 2 entries
}
```

**`CharacterDecisionTree` class:**
- Holds the full dialogue script as a static tree (all nodes defined in this file — see full script above)
- `async run(overlay: DialogueOverlay): Promise<ConversationResult>`:
  - Walks the tree, calling `overlay.speak()` and `overlay.choose()` at each node
  - On `type: 'lock'` effect: calls `overlay.speak(remark, 'wizard')` then continues
  - Accumulates `statBonuses[]` from stat choices
  - Returns result when reaching `type: 'end'`
- All dialogue text is verbatim from the script section above
- Phase 1 always runs; Phase 2 runs branched by species; Phase 3 always runs (2 questions)

**Tests (`tests/unit/CharacterDecisionTree.test.ts`):**
- Mock `DialogueOverlay` that auto-selects given indices
- `run(overlay, choices=[0,0,0,0])` → `{ characterId: 'rogue', statBonuses: ['strength', 'attack_power'] }`
- `run(overlay, choices=[1,1,2,3])` → `{ characterId: 'skeleton_rogue', statBonuses: ['intelligence', 'max_hp'] }`
- `run(overlay, choices=[2,3])` → `{ characterId: 'fox_rogue', statBonuses: ['constitution', 'magic_power'] }` (vulperia has no phase 2 choice)
- `run(overlay, choices=[3,2])` → `{ characterId: 'slime', statBonuses: ['intelligence', 'magic_power'] }` (slime has no phase 2 choice)
- All 7 character IDs are reachable from distinct choice paths

---

### Phase NG-4: Orchestration (`NewGameFlow.ts`)

**Goal:** Coordinate scene + overlay + decision tree into a single `play()` call that returns `CharacterConfig`.

**File:** `src/scene/NewGameFlow.ts`

**Interface:**
```ts
class NewGameFlow {
  constructor(renderer: THREE.WebGLRenderer);
  play(container: HTMLElement, slotId: number): Promise<CharacterConfig>;
  dispose(): void;
}
```

**`play()` sequence:**
1. Pick wizard: `WIZARD_DEFS[Math.floor(Math.random() * 3)]`
2. Create `NewGameScene(renderer)`, mount to `container`
3. Create `DialogueOverlay`, mount to `container`
4. `overlay.fadeIn(1200)` — scene fades in over 1.2 s
5. `scene.loadWizard(wizardId)` (preloads in background while fade completes)
6. Await 0.6 s pause
7. `scene.runEnterSequence()` — wizard walks to fire (~4 s)
8. Await 0.5 s pause
9. `result = await tree.run(overlay)`
10. `overlay.fadeOut(400)` — subtle dim before wizard leaves
11. `scene.runExitSequence()` — wizard walks into darkness (~3 s)
12. `overlay.speak(farewell, 'wizard')` during exit
13. `overlay.fadeOut(2000)` — long fade to black
14. Build and return `CharacterConfig`:
    ```ts
    {
      name:       CHAR_LORE[result.characterId].defaultName,
      boon:       deriveDefaultBoon(result),
      slotId,
      dna:        DEFAULT_DNA,
      assetModel: CHAR_MANIFEST_MAP[result.characterId],
      statBonuses: result.statBonuses,
    }
    ```
15. `scene.unmount()`, `overlay.unmount()`

**Integration into `main.ts`:**
- New Game button path:
  ```ts
  // Old:
  mainMenu.hide(); charCreation.show(slotId);
  // New:
  mainMenu.hide();
  const flow = new NewGameFlow(renderer);
  flow.play(document.body, slotId).then(cfg => {
    flow.dispose();
    startGame(undefined, cfg);
  });
  ```
- `CharacterCreationV2` remains wired for the Dev Panel / sandbox use

**`CharacterConfig` extension:**  
Add `statBonuses?: StatBonus[]` to the existing interface in `CharacterCreation.ts`. Apply in `startGame()`:
```ts
for (const bonus of cfg.statBonuses ?? []) {
  progression.boostStat(STAT_BONUS_MAP[bonus].stat, STAT_BONUS_MAP[bonus].amount);
}
```

Mapping:

| `StatBonus` | `progression.boostStat` call |
|-------------|------------------------------|
| `strength` | `boostStat('strength', 2)` |
| `agility` | `boostStat('swiftness', 2)` |
| `intelligence` | `boostStat('intellect', 2)` |
| `constitution` | `boostStat('vitality', 2)` |
| `attack_power` | `boostStat('strength', 3)` (maps to atk scaling) |
| `stealth` | `boostStat('swiftness', 3)` (maps to crit) |
| `magic_power` | `boostStat('intellect', 3)` |
| `max_hp` | `boostStat('vitality', 3)` |

> Exact `progression.boostStat` key names to be verified against `src/progression/` during NG-4 implementation.

**Tests (`tests/e2e/new-game-flow.test.ts`, Playwright):**
- `window.__game.triggerNewGameFlow(slotId)` exposes flow for testing
- Scene canvas appears and is non-zero dimensions
- After simulated auto-choose (`window.__game.autoChooseNewGame([0,0,0,0])`), `startGame` is called with `assetModel.id === 'kaykit_adventurers/Rogue'`
- Stat bonuses in `CharacterConfig.statBonuses` match the choices

---

### Phase NG-5: Asset & Placeholder Resolution

**Goal:** Ensure all 7 character paths have a real model.

**Tasks:**
- [ ] Verify `kaykit_adventurers/Rogue`, `Rogue_Hooded`, `Mage` load and animate in NewGameScene
- [ ] Verify `kaykit_skeletons/Skeleton_Mage`, `Skeleton_Rogue` load and animate
- [ ] Verify `slime/Slime` loads (no bipedal anims; idle jiggle is sufficient)
- [ ] Fox Rogue decision: 
  - Option A: Use `kaykit_adventurers/Rogue` as placeholder with a debug note
  - Option B: If the `fox` pack model (`src/characters/charManifest.ts` pack id `fox`) is compatible with KayKit rig, wire it up
  - Option C: Flag as future asset request in `ASSETS_TODO.md`
- [ ] Add `CHAR_MANIFEST_MAP` lookup object to `CharacterDecisionTree.ts` or a separate `charOutcomeMap.ts`:
  ```ts
  export const CHAR_MANIFEST_MAP: Record<CharacterId, string> = {
    rogue:          'kaykit_adventurers/Rogue',
    rogue_hooded:   'kaykit_adventurers/Rogue_Hooded',
    mage:           'kaykit_adventurers/Mage',
    skeleton_mage:  'kaykit_skeletons/Skeleton_Mage',
    skeleton_rogue: 'kaykit_skeletons/Skeleton_Rogue',
    slime:          'slime/Slime',
    fox_rogue:      'kaykit_adventurers/Rogue', // placeholder
  };
  ```

---

### Phase NG-6: Polish

**Goal:** Make the scene feel cinematic and the dialogue feel like a real character.

**Tasks:**
- [ ] **Wizard personality:** Slight head turn during Phase 2 (lerp `lookAt` target based on species locked)
  - Human: wizard turns slightly right (looks at you properly)
  - Undead: wizard takes half a step back (subtle animation)
  - Vulperia: wizard wisely goes very still
  - Slime: wizard tilts head
- [ ] **Fire reaction:** On each choice selection, fire flicker intensity spikes briefly (+0.8, decays over 0.6 s)
- [ ] **Wizard name accent:** Each of the 3 wizards has a slightly different speech pattern prefix (cosmetic only):
  - Toad: *"Hrrm."* pause before speaking
  - Elf: *"Ah,"* before important lines
  - Lizard: *(clears throat)* before speaking
- [ ] **Stat toast animation:** When stat gained, brief sparkle at bottom of screen
- [ ] **Ambience:** Web Audio API campfire crackle (band-pass filtered noise, no audio files — complies with Architecture.md's "No Asset" rule):
  ```ts
  // AudioContext → createOscillator (very low, ~3 Hz) → 
  //   createBiquadFilter (bandpass, 300-1200 Hz) → 
  //   AudioBufferSourceNode (random noise buffer) → GainNode → destination
  ```
- [ ] **Character silhouette reveal (optional):** As Phase 2 locks in, a brief subtle silhouette of the chosen character appears as a shadow behind the wizard, then fades. Purely atmospheric — player may not consciously notice it.

---

### Phase NG-7: Final Integration & Regression

**Goal:** Ship cleanly, no regressions in existing game paths.

**Tasks:**
- [ ] Run full Vitest suite (`npx vitest run`) — all 464 tests passing
- [ ] Run existing Playwright suite (`npx playwright test`) — all char-creation tests still pass (CharacterCreationV2 still exists)
- [ ] Run new Playwright suite (`npx playwright test tests/e2e/new-game-flow.test.ts`)
- [ ] Manual playthrough: all 7 character paths, verify correct model appears in game
- [ ] Manual playthrough: all 4 stat combinations per question, verify progression stats reflect correctly
- [ ] Verify Dev Panel / Sandbox still accessible (CharacterCreationV2 not broken)
- [ ] Verify Load Game slot path bypasses `NewGameFlow` (it should, as only the "New Game" button triggers it)
- [ ] Update `ARCHITECTURE.md`: document `NewGameScene` under scene management, `DialogueOverlay` under UI
- [ ] Update `TODO.md`: mark Phase NG complete

---

## File Map

```
src/
  characters/
    wizardManifest.ts          ← NEW: wizard GLB paths + IDs
    WizardLoader.ts            ← NEW: loads mesh + anims, returns group/mixer/clips
    charOutcomeMap.ts          ← NEW: CharacterId → manifest model ID
  scene/
    NewGameScene.ts            ← NEW: Three.js campfire scene
    CharacterDecisionTree.ts   ← NEW: dialogue script + branching logic
    NewGameFlow.ts             ← NEW: orchestrator, returns CharacterConfig
  ui/
    DialogueOverlay.ts         ← NEW: typewriter + choice cards
    CharacterCreation.ts       ← EDIT: add statBonuses?: StatBonus[] to CharacterConfig
  main.ts                      ← EDIT: wire New Game button to NewGameFlow
scripts/
  extract-wizards.mjs          ← NEW: unzips wizard assets to public/
public/
  assets/characters/wizards/   ← NEW: extracted GLBs (git-ignored, generated by script)
tests/
  unit/
    NewGameScene.test.ts       ← NEW
    DialogueOverlay.test.ts    ← NEW
    CharacterDecisionTree.test.ts ← NEW
  e2e/
    new-game-flow.test.ts      ← NEW
```

---

## Open Questions

1. **Exact wizard clip names:** Run `scripts/inspect-wizard-clips.mjs` after extraction in NG-0. Update `wizardManifest.ts` with verified names before NG-1.
2. **`progression.boostStat` key names:** Confirm exact stat key strings in `src/progression/` before implementing stat bonus mapping in NG-4.
3. **Fox Rogue model:** Decision needed during NG-5 — placeholder vs fox pack vs new asset.
4. **Slime idle animation:** Slime GLB may or may not have an idle clip. Fallback: keep it static, it still reads as existential dread.
5. **Player name input:** The current `CharacterConfig` has a `name` field. In the dialogue flow the player never types a name. Use the character's default lore name (e.g. "Rogue", "Mage") and allow rename in HUD later — or add a brief "And your name?" text input after Phase 3 before the farewell. Decide during NG-4.
