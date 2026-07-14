# Creature Creator 2.0 — Improvement Plan

> Inspired by Spore's creature creator: part categories with morph handles,
> procedural paint layers, randomiser with weighted coherence, and a Test Drive mode.
> Our additional pillars: fantasy sub-races, archetype-aware prop filtering, and a
> design philosophy that zero defaults are enforced — any body can wear anything.

---

## What Spore Got Right (Research Notes)

From the Spore Creature Creator (2008) and the SporeWiki:

- **Malleable body with a spine** — the torso is a continuous mesh sculpted via handles
  rather than a fixed box. This gives organic variety from a single "body" type.
- **Parts have per-instance morphs** — each placed part has resize handles for scale,
  aspect ratio, and rotation. Same part looks very different between creatures.
- **7 part categories** — Mouths, Sensory Organs, Limbs, Hands, Feet, Weapons, Details.
  228 total functional parts + many cosmetic detail parts.
- **Paint mode with 3 overlay layers** — Base skin + Coat pattern + Detail accent.
  Patterns (stripes, spots, scales) are procedurally applied over the base colour.
- **Stats emerge from parts** — bite/charge/sneak/dance etc. are aggregated from
  placed parts. Cosmetic choices have gameplay meaning.
- **Test Drive** — live animation preview in a small arena before confirming.
- **Symmetry is the default, asymmetry is opt-in** — halves the build effort for
  most creatures while allowing weird one-off shapes.

**Our constraints vs Spore:**
- We do not have 3D part placement drag-and-drop (would need major Three.js scene
  editing UI). We have **procedural builder** + **slider morphs** instead.
- All geometry must remain procedural Three.js primitives.
- No textures loaded from disk — canvas textures only.
- The character IS the playable princess/hero — their in-game rig is this same DNA.

---

## Current State Gaps

| Gap | Impact |
|-----|--------|
| Robe is default for biped — looks like "everyone is a wizard in a dress" | ✅ Fixed (CC-2) — outfit system with trousers/skirt/shorts/loincloth/robe_skirt |
| No sub-races for biped (elf, goblin, orc, pixie, undead…) | ✅ Fixed (CC-1) — 12 species with ear geometry, head scale, colors |
| Props not filtered by archetype — wings on an amoeba, legs on a serpent | ⏳ CC-6 — allowlists defined, UI filtering in progress |
| Randomiser absent — no quick way to discover wild combos | ✅ Fixed (CC-4) — 🎲 Lucky Roll + ~ Mutate buttons, mulberry32-seeded |
| Only 4 body sliders (global scale, head, limb length/width) | ✅ Fixed (CC-3) — +6 sliders: shoulders, hips, belly, neck thickness, Torso H, Leg L |
| No hair props | ✅ Fixed (CC-3 ext.) — hair_short, hair_long, hair_bun props (sphere cap + optional flow/bun) |
| Biped lower body too tall / not adjustable | ✅ Fixed — hip joints raised to 0.70×ty; pelvis 0.42×ty; legLength prop + slider |
| Amoeba face plane hidden inside blob | ✅ Fixed — face z-offset = 0.52×headSize×torso[2]+0.04 (just outside blob surface) |
| Serpent was a vertical cobra stack, not a snake | ✅ Fixed — full redesign as flat snake; head raised, body/tail horizontal along ground |
| Wings on biped attached at foot level | ✅ Fixed — wg.position.y raised from 0.3 → 1.32 (shoulder/upper back) |
| No skin pattern/texture layer | ⏳ CC-7 |
| Face types not differentiated per sub-race | ✅ Fixed (CC-5) — 14 face types; EyeShape, BrowStyle, SkinPattern DNA fields; archetype allowlists; CC-5 UI chips pending |
| No outfit/clothing concept — robe IS the body appearance | ✅ Fixed (CC-2) — outfit.top / outfit.legs / outfit.over slots |
| Overlay bug: pressing Begin does not hide character creation screen | ✅ Fixed — charCreation.hide() added to main.ts onStart callback |

---

## Implementation Phases

### Phase CC-1 — Foundation & Sub-Race System

**Goal:** Biped archetypes become a species selector, not just a body shape.
Every species has geometry-level differences (ear shapes, proportions, skin
tones, default face types). Remove the hardcoded robe-as-default.

#### Research checkpoint before implementation
- [ ] **Research:** Browse [Fantasy Race Design compendium on TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/OurElvesAreDifferent) and [Fantasy race visual conventions Wikipedia](https://en.wikipedia.org/wiki/Fantasy_tropes_and_conventions) — note visual silhouettes that distinguish races at small scale (isometric game size).
- [ ] **Research:** Look at how Caves of Qud, Dwarf Fortress, and Wildermyth handle procedural fantasy race visual variety in code (blog posts / postmortems).

#### Tasks
- [ ] Add `SubRace` type to `CreatureDNA.ts`:
  ```
  'human' | 'elf' | 'high_elf' | 'goblin' | 'orc' | 'troll' |
  'pixie' | 'undead' | 'draconic' | 'celestial' | 'fae' | 'gnome' | 'none'
  ```
  `SubRace` is only meaningful when `archetype === 'biped'`. Other archetypes
  use `'none'`.
- [ ] Add `subRace: SubRace` field to `CreatureDNA`. Keep backwards-compatible
  via `base64ToDna` migration (default `'none'` when absent).
- [ ] Build `SUBRACE_DEFAULTS` map: each subrace overrides proportion ranges,
  default skin colour ranges, ear shape flag, head geometry, and default face type.
  Examples:
  - `elf` → tall (`limbLength: 1.15`), narrow torso, pointed ears (mesh addition to
    head), pale/cool skin palette, face: `cute`, no default props.
  - `goblin` → short (`global: 0.78`), big round head (`headSize: 1.3`), wide eyes,
    warm grey-green skin, fangs mouth.
  - `orc` → broad torso, under-jaw tusks (lower cone props), thick limbs, heavy brow.
  - `undead` → skull face type default, desaturated + grey skin, aura prop default.
  - `draconic` → scales pattern layer, slit-eye default, small horn_small default.
  - `celestial` → pale gold skin, aura default, crown optional, compound eye option.
  - `fae` → pixie-small (`global: 0.65`), large head, big eyes, wings_bat-style but
    butterfly variant.
  - `pixie` → very small (`global: 0.5`), huge eyes, pointed ears, delicate limbs.
- [ ] `dnaForSubRace(subRace, baseDna): CreatureDNA` — applies subrace overrides on
  top of existing archetype defaults.
- [ ] Remove `robe` from `DEFAULT_PLAYER_DNA.props`. Default becomes `[]`.
- [ ] Add `SubRaceSelector` row in `CharacterCreation` below the Archetype chips.
  Only visible when `archetype === 'biped'`. Shows species name + small icon.
  Clicking calls `dnaForSubRace(id, dna)` and rebuilds preview.
- [ ] `_headgeo` in `CreatureBuilder` gains ear shapes per subrace:
  - Pointed ears: two flat `ConeGeometry` on sides of head sphere
  - Round ears: `TorusGeometry` half-rings
  - No ears: nothing (amoeba/avian)
- [ ] Unit tests: `dnaForSubRace` round-trips through `dnaToBase64`/`base64ToDna`.

---

### Phase CC-2 — Clothing vs Body Props Separation

**Goal:** Separate wearable items (outfit layer) from physical body features (body
layer). A goblin can wear armour, a draconic can go naked, an elf can wear a
warrior kit — the game never forces a costume based on archetype or subrace.

#### Research checkpoint
- [ ] **Research:** How does The Sims 4 separate body/face customisation from
  clothing in its CAS system? Look for dev talks or teardown articles. Key question:
  do they use layered mesh swaps or material/UV region swaps?
- [ ] **Research:** Study how Baldur's Gate 3 handles visual gear layering at
  character creation — armour as a mesh swap over body, or as a separate render pass?

#### Tasks
- [ ] Add `outfit` section to `CreatureDNA`:
  ```typescript
  outfit: {
    top:  OutfitTopId;    // 'none' | 'tunic' | 'robe_top' | 'armor_chest' | 'cloak' | 'wrapped_bandages'
    legs: OutfitLegsId;   // 'none' | 'trousers' | 'robe_skirt' | 'armor_legs' | 'loincloth'
    over: OutfitOverId;   // 'none' | 'cloak' | 'cape' | 'robe_full' | 'robes_formal'
  }
  ```
- [ ] `PropId` split: existing props move to `BodyPropId` (horns, crown, tail, wings,
  aura, scales). New `OutfitId` types handle clothing.
- [ ] `CreatureBuilder` `_outfit()` function renders `top`/`legs`/`over` as
  `CylinderGeometry`/`BoxGeometry` clothing meshes separate from body geometry.
  `robe_full` = current robe prop geometry but placed via outfit not body prop.
- [ ] `CharacterCreation` UI: split current Props section into two rows:
  - **Body Features** — physical (horns, tail, wings, scales, aura, tusks from subrace)
  - **Outfit** — wearable (dropdown or chip row per slot: Top / Legs / Over)
- [ ] Default outfit for all: `{ top: 'none', legs: 'none', over: 'none' }`.
  Starter outfit presets added (not forced):
  - `preset_mage`: `{ over: 'robe_full', top: 'none', legs: 'none' }`
  - `preset_warrior`: `{ top: 'armor_chest', legs: 'armor_legs', over: 'none' }`
  - `preset_rogue`: `{ top: 'tunic', legs: 'trousers', over: 'cloak' }`

---

### Phase CC-3 — Richer Body Morphing

**Goal:** From 4 sliders to 12+, covering organic silhouette variety within a single
archetype. Every creature should look distinct at 50% zoom (isometric play distance).

#### Research checkpoint
- [ ] **Research:** GDC talk "The Procedural Approach in Spore" (2005/2006 Maxis) —
  search GDC Vault for Will Wright + creature editor + morph. Focus on how morph
  handles work at the data level.
- [ ] **Research:** Three.js `MorphTargetInfluences` vs rebuilding geometry from scratch
  on each slider change. Benchmark which is faster for our complexity level.
  See: https://threejs.org/docs/#api/en/objects/Mesh.morphTargetInfluences
- [ ] **Research:** Procedural mesh deformation for character creators in WebGL —
  search for "procedural character creator three.js" on GitHub and CodePen.

#### Tasks

**DNA Schema additions (proportions block):**
```typescript
proportions: {
  // existing
  global, torso, headSize, limbLength, limbWidth, neckLength, tailLength, wingSpan, segmentCount,
  // new
  shoulderWidth:  number;  // 0.5–2.0  biped/quad torso X spread
  hipWidth:       number;  // 0.5–2.0  biped lower body width
  bellySize:      number;  // 0.0–1.5  torso Z bulge (extra sphere overlay)
  earSize:        number;  // 0.0–2.0  scales ear cones
  tailCurve:      number;  // 0.0–1.0  bend amount of chained tail segments
  neckThickness:  number;  // 0.5–1.8  neck cylinder radius multiplier
  snoutLength:    number;  // 0.0–1.0  forward protrusion on head (quad/serpent)
  wingMembrane:   number;  // 0.5–2.0  bat/avian wing area multiplier
  limbCurve:      number;  // -1.0–1.0 arm/leg elbow-outward rotation bias
  bodyRatio:      number;  // 0.5–2.0  torso height:width ratio independent of global
}
```

**Builder changes:**
- [ ] Biped torso: use `shoulderWidth` for top radius, `hipWidth` for bottom radius
  of main body cylinder. If `bellySize > 0.3`, add overlapping `SphereGeometry` at
  mid-torso for a rounder belly silhouette.
- [ ] Neck: `neckThickness` drives capsule radius.
- [ ] Head: `snoutLength > 0.2` adds a forward-facing box/capsule on the face group
  (muzzle). Scaled by `snoutLength`. Appears for quad/serpent by default (subrace can
  enable for draconic biped).
- [ ] Tail segments: `tailCurve` bends each segment's parent rotation to create a
  curling tail (quadratic bezier approximated by rotating each link by `curve * 0.15`).
- [ ] Avian wings: `wingMembrane` multiplies the ShapeGeometry control points outward.
- [ ] Bat wings: same — `wingMembrane` scales the shape.
- [ ] Limbs: `limbCurve` adds a rotation to the elbow/knee group so limbs have a
  bowed or angled look even at rest.
- [ ] CharacterCreation UI: fold new sliders under an expandable "Advanced Morphing"
  section so the UI doesn't overwhelm by default. Section is collapsed initially.

---

### Phase CC-4 — Procedural Randomiser

**Goal:** One-click "Lucky Roll" generates a visually coherent creature respecting
archetype rules. Per-section re-roll buttons for targeted randomisation. DNA
mutation for "nearby" variants.

#### Research checkpoint
- [ ] **Research:** "Weighted random character generator" — look at how No Man's Sky
  and Wildermyth handle procedural visual generation to guarantee coherent (non-ugly)
  outputs. Search for "No Man's Sky creature generation algorithm" and similar GDC
  talks.
- [ ] **Research:** Color harmony theory for procedural palettes — look at
  https://www.colorhexa.com/ colour wheel logic and the HSL triadic/analogous
  combination rules used in game character design tools.
- [ ] **Research:** mulberry32-seeded weighted random tables — review the existing
  PRNG in this codebase (`src/core/mulberry32.ts`) for use in the randomiser so that
  a given seed always produces the same creature.

#### Tasks

**`src/creatures/CreatureRandomiser.ts`** — new file:

```typescript
export function randomDNA(seed: number, archetype?: Archetype): CreatureDNA;
export function mutateDNA(dna: CreatureDNA, strength: number, seed: number): CreatureDNA;
export function randomPalette(seed: number): { primary: number; secondary: number; emissive: number; emissiveIntensity: number };
```

Implementation rules for `randomDNA`:
1. Pick archetype from weighted table if not supplied (biped 30%, quad 25%, avian 20%,
   serpent 15%, amoeba 10%).
2. Pick subrace from archetype's allowed subraces (biped only, weighted).
3. Generate a harmonious colour palette using HSL:
   - Random hue H (0–360) as primary.
   - Secondary = H + 30–60° (analogous) or H + 150–180° (complementary). 50/50.
   - Emissive = brighter, more saturated version of one of the above.
4. Proportion sliders: sample from per-archetype distribution tables (min/max/mode
   defined per slider per archetype — so a serpent always gets high `segmentCount`,
   an avian always gets high `wingSpan`, etc.).
5. Face type + mouth type: sample from archetype-allowed lists with weights.
6. Props: pick 0–3 from archetype-allowed prop pool, weighted by subrace.
7. Outfit: pick a preset or `none` with equal probability.

**`mutateDNA(dna, strength, seed)`**:
- Varies each numeric proportion by `±strength * rangeMax * rand`.
- Has 20% chance to swap one prop in/out.
- Has 10% chance to shift hue ±15°.
- Does NOT change archetype or subrace.

**UI additions:**
- [ ] Add `🎲 Lucky Roll` button in CharacterCreation header (next to archetype chips).
  Calls `randomDNA(Date.now())` and `setDNA(result)` then `_syncControls()`.
- [ ] Add small `↺` re-roll icon buttons next to each section title (Colors, Face,
  Proportions, Props). Each calls the relevant sub-randomiser for just that section.
- [ ] Add "Seed" read-only display showing the seed used (so players can share seeds).
- [ ] Add "Mutate" button near the preview (small `~` glyph): calls `mutateDNA` with
  `strength = 0.2` using `Date.now()` — gives "nearby relatives" feel.

---

### Phase CC-5 — Expanded Face & Expression System

**Goal:** 14 total face types, each archetype has an allowed subset. Eye shapes,
brow styles, and cheek marks are separately configurable. Skin pattern overlays
(stripes, spots, scales, gradient) are a new DNA field.

#### Research checkpoint
- [ ] **Research:** Pixel art face generation techniques — look at
  https://github.com/yurkth/sprator (Spore-inspired sprite generator) and
  https://github.com/nicktindall/cyclon.p2p (unrelated but contains procedural
  face work). Search GitHub for "procedural face canvas 2d".
- [ ] **Research:** Canvas 2D API techniques for drawing scales, stripe patterns,
  and spot patterns procedurally. Search MDN and CodePen for "canvas procedural texture".

#### Tasks

**New face types added to `FaceType`:**
```
| New type      | Description                                              |
|---------------|----------------------------------------------------------|
| cherubic      | Chubby cheeks, large round eyes, button nose             |
| gaunt         | Sunken eyes, sharp cheekbones, hollow cheeks             |
| cat           | Slit pupils, pointed ears (different from ear prop),     |
|               | small nose, whisker lines                                |
| lizard        | No visible nose, slit pupils, scale texture              |
| bird          | Beak always shown, tiny pupil dots                       |
| insect        | Multi-facet compound eyes fill most of face              |
| demon         | Inverted triangle eyes, heavy brow ridge, goat slit      |
| ancient       | Many small eyes arranged in arc, no mouth                |
```

**`CanvasFace.ts` additions:**
- [x] Implement 8 new face drawers (`cherubic`, `gaunt`, `cat`, `lizard`, `bird`, `insect`, `demon`, `ancient`).
- [x] Add `eyeShape`, `skinPattern`, `markColor`, `browStyle` to `FaceSpec`.
- [x] `_drawSkinPattern()` and `_drawBrows()` overlay helpers.
- [x] `_star()` helper for star-shaped pupils.

**DNA additions:**
- [x] `EyeShape`, `SkinPattern`, `BrowStyle` union types in `CreatureDNA.ts`.
- [x] `FaceType` expanded to 14 entries.
- [x] `face.eyeShape`, `face.skinPattern`, `face.markColor`, `face.browStyle` fields in `CreatureDNA` interface.
- [x] Backwards-compat migration in `base64ToDna`.

**UI (⏳ in progress):**
- [ ] Show all 14 face type chips (currently only 6 in CharacterCreation).
- [ ] EyeShape chip row.
- [ ] BrowStyle chip row.
- [ ] SkinPattern chip row + markColor picker.
- [ ] Filter face chips by archetype (`ARCHETYPE_FACE_ALLOW`).

**Archetype ↔ Face type allowlists** (enforced by the randomiser and UI chip filter):
```
biped(human/elf)  → cute, gaunt, cherubic, angry, skull, cat, demon
biped(goblin)     → angry, skull, gaunt, cat
biped(orc)        → angry, demon, skull, gaunt
biped(undead)     → skull, gaunt, ancient
biped(draconic)   → lizard, demon, angry
biped(celestial)  → cute, cherubic, ancient
avian             → bird, cute, cyclops
quadruped         → cat, lizard, angry, blank
amoeba            → cyclops, compound, insect, blank, ancient
serpent           → lizard, angry, demon, cat
```

**UI:** Face type chips are filtered to the allowed set for current archetype+subrace.
If current face type is not in the allowed set after switching archetype, pick first
allowed type automatically.

---

### Phase CC-6 — Archetype-Aware Prop Filtering + New Props

**Goal:** Props displayed in the UI are filtered to what makes physical sense for the
archetype. New props expand the vocabulary significantly.

#### Research checkpoint
- [ ] **Research:** Look at how Heroes of Might and Magic, Pillars of Eternity, and
  Path of Exile handle cosmetic item design across wildly different body types (wing
  positions, tail overlaps, helm on large vs small heads). Search for "creature
  accessory design non-humanoid games".

#### New props to implement:

| PropId           | Visual description                                  | Archetypes |
|------------------|-----------------------------------------------------|------------|
| `antlers`        | Two branching Y-cone trees on head                 | biped, quad |
| `fin_dorsal`     | Single flat triangle from torso top                | amoeba, serpent, avian |
| `mane`           | Ring of elongated box/capsule around neck          | biped, quad |
| `feather_crest`  | Fan of thin planes on head top                     | avian, biped |
| `tusk_lower`     | Two small cone prongs on jaw (separate from fangs) | biped, quad |
| `scale_ridges`   | Row of small spike fins along torso spine          | serpent, quad, avian |
| `tentacles`      | 4–6 thin worm-like chains hanging from torso base  | amoeba, serpent |
| `carapace`       | BoxGeometry armour shell over torso back           | amoeba, quad, serpent |
| `lantern`        | Small glowing sphere hanging from tail/arm tip     | amoeba, avian, biped |
| `ghost_trail`    | Fading BackSide planes trailing below torso        | amoeba, undead biped |

**Prop allowlists** (per archetype — props not in list are hidden in UI):
```
biped     → horns_small, horns_large, tail_stub, tail_long, wings_bat, crown,
            armor_light, aura, antlers, mane, feather_crest, tusk_lower, lantern, ghost_trail,
            hair_short, hair_long, hair_bun
quadruped → horns_small, horns_large, tail_stub, tail_long, armor_light, aura,
            antlers, mane, tusk_lower, scale_ridges, carapace
amoeba    → aura, fin_dorsal, tentacles, carapace, lantern, ghost_trail
avian     → wings_bat, crown, tail_stub, tail_long, feather_crest, fin_dorsal, lantern, scale_ridges
serpent   → tail_long, horns_small, crown, aura, fin_dorsal, scale_ridges, tentacles, carapace
```

**Implementation status:**
- [ ] New PropId types added to `CreatureDNA.ts` (antlers, fin_dorsal, mane, feather_crest, tusk_lower, scale_ridges, tentacles, carapace, lantern, ghost_trail)
- [ ] New props implemented in `CreatureBuilder._props()`
- [ ] `ARCHETYPE_PROP_ALLOW` exported from `CreatureDNA.ts`
- [ ] `ARCHETYPE_FACE_ALLOW` exported from `CreatureDNA.ts`
- [ ] UI filters prop chips and face chips by archetype

**UI:** Props section becomes a two-column grid, only showing archetype-allowed props.
Props outside the allowlist for the current archetype are hidden (not greyed — hidden,
to avoid visual clutter).

---

### Phase CC-7 — Skin Pattern & Colour Depth

**Goal:** Two-channel body colouring: a base colour painted per body region +
a pattern overlay channel. Analogous to Spore's Base/Coat/Detail layers.

#### Research checkpoint
- [ ] **Research:** How does Spore's paint mode work at the data level — does it store
  a UV-space painted texture, or procedural parameters? Look at Spore creature file
  format reversals on GitHub / ModTheGame forums.
- [ ] **Research:** Canvas procedural noise patterns for scales, cracks, veins, fur
  stippling — search "canvas 2d procedural texture pattern" and MDN CanvasRenderingContext2D.

#### Tasks
- [x] `CreatureDNA.colors` new fields: `pattern: SkinPattern`, `patternColor`, `patternScale`, `patternOpacity`
- [x] Backwards-compat migration in `base64ToDna`
- [x] `CreatureBuilder`: `_bodyMat(dna)` helper applies `makeSkinTexture` to primary-colour body meshes
- [x] New `src/creatures/CanvasSkin.ts` — `makeSkinTexture()` with 6 pattern types + LCG-seeded cracks/fur
- [x] UI: Body pattern chip row in Palette section; pattern color picker shown when pattern ≠ 'none'

---

### Phase CC-8 — Preview & UI Polish

**Goal:** The preview is the star. Multiple camera angles, animation cycle selector,
and a "Test Drive" mini-mode that runs the full AnimationState loop.

#### Research checkpoint
- [ ] **Research:** Spore's Test Drive mode UX — what exactly could you do there?
  Look for screenshots or video walkthroughs of Spore creature creator Test Drive.
- [ ] **Research:** Character creator UX patterns — look at breakdowns of Elden Ring,
  Black Desert Online, and Saints Row character creators for principles on camera
  control, live preview refresh, and control grouping.

#### Tasks
- [x] **Camera presets bar** below preview: Full / Face / Side buttons with 0.1 lerp per frame.
- [x] **Animation preview toggle**: Idle / Walk / Run / Hit chips.
- [x] **Share / Load DNA**: Import text field + ⬇ Load button; error highlight on bad input.
- [ ] **Test Drive mini-mode**: fullscreen arena preview (deferred — needs arena setup).
- [ ] **Preset gallery row**: 6 curated thumbnails (deferred — needs offline rendering).

---

### Phase CC-9 — Gameplay Integration of Creator Choices

**Goal:** Visual choices have mild stat implications, deepening identity investment.
The player's creature DNA shapes how NPCs react (dialogue / flavor text).

#### Tasks
- [ ] **Derived stat modifiers from DNA** — computed in a new
  `src/creatures/CreatureStats.ts`:
  - Wings (`wings_bat` or avian archetype): `+0.8 glide_duration` stat
  - Fangs or tusks: `+5% melee damage`
  - Aura: `+10% spell range`
  - Armor prop: `+8% physical resistance`
  - Robe/mage outfit: `+8% spell damage`
  - Serpent archetype: `+15% slither speed` (replaces walk anim)
  These are flavor-level tweaks, not hard power differences.
- [ ] `CharacterConfig.derivedStats` — computed from DNA at creation time, stored in
  save data alongside DNA.
- [ ] NPC dialog tag `{creature_type}` — resolves to `subrace ?? archetype` for use in
  greeting/flavor text. "A goblin mage! Unusual..." vs "A draconic warrior. Impressive."
- [ ] Enemy reaction system: enemy archetypes have preferred targets — slimes avoid
  celestials, shadow enemies prioritise undead, etc.

---

## Implementation Order

```
CC-1 (Sub-races)        ← Do first — foundational DNA schema change
CC-2 (Clothing system)  ← Do second — removes robe coupling
CC-4 (Randomiser)       ← Do third — unlocks rapid testing of all above
CC-3 (Body morphing)    ← Do fourth — benefits from randomiser for discovery
CC-5 (Face expansion)   ← Can be done in parallel with CC-3
CC-6 (Prop filtering)   ← Depends on CC-1 (archetype allowlists need subraces)
CC-7 (Skin patterns)    ← Independent — do whenever time allows
CC-8 (Preview polish)   ← Can be done incrementally as other phases land
CC-9 (Gameplay hooks)   ← Last — depends on all visual systems being stable
```

---

## Bug Fix Already Applied

- **Overlay not closing on Begin/Continue** — `charCreation.hide()` added to the
  `onStart` callback in `src/main.ts`. The overlay was never being dismissed because
  only `mainMenu.hide()` was called. Fixed in commit after `212a3cd`.

---

## Design Principles (Do Not Violate)

1. **No default costume** — biped humanoids start with `outfit: { top:'none', legs:'none', over:'none' }`. The robe is an opt-in choice, never a forced default.
2. **Any shape can wear anything** — outfit rendering adapts to archetype proportions (a robe on a serpent is a ruff/collar, not a skirt).
3. **Archetype is a body plan, not a personality** — the face, outfit, and name define the character. A goblin can wear celestial robes. An orc can wear a crown.
4. **Randomiser must produce coherent results** — use weighted tables not pure random. A creature should never look visually broken from a Lucky Roll.
5. **Performance budget** — character creation preview runs in its own `WebGLRenderer`. Total polygon count for preview creature must stay under 4,000 triangles. Skin pattern textures max 128×128.
6. **DNA serialises cleanly** — all new DNA fields get default values. `base64ToDna` adds missing fields with defaults so old saves load correctly.
