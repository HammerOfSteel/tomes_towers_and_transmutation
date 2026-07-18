# PRINCESS_CREATOR_TODO — Master Phased Roadmap

> Legend: `[x]` done · `[~]` partial · `[ ]` todo.
> "✔ Accept:" lines are the acceptance checks that close a phase.
---

## Status at a glance — end of day 2026-07-18

**All tool phases (0–9) complete.** 21 species · 5 body synthesizers · full
Spore-style direct manipulation · DNA v2 share codes (`P2.`) + DNA-in-PNG
portraits · 24-clip animation system with per-species tuning + versioned
`princess-animations.anim.json` export · `PrincessFactory` game façade ·
**186 unit tests**, tsc/eslint clean, Playwright visual-QA scripts
(`scripts/princess-screenshots.mjs`, `scripts/princess-anim-verify.mjs`).

| Phase | Status | Phase | Status |
|---|---|---|---|
| 0 Research & spec | ✅ | 5 Animation & test drive | ✅ core |
| 1 Foundation (DNA/store/stage) | ✅ | 6 Creator UX polish | ✅ core |
| 2 Body synthesizers | ✅ | 7 Direct manipulation & exports | ✅ |
| 3 Parts system | ✅ core | 8 Species/classes/subtypes (21) | ✅ |
| 4 Color & palettes | ✅ core | 9 Animation system & anim export | ✅ |

**Next up: Phase 10 — game-side integration** (bottom of this file). The
`[~]` marks inside phases 3–6 are optional polish, folded into task 10.8.

**Branch state:** all work lives on `feature/princess-creator` (draft PR #1).
The PR's base branch `feature/asset-level-editor` has since been merged into
`main` — when it's time to land this, retarget the PR base to `main` (no
merge through the editor branch needed).

---

## Phase 0 — Research & Specification ✅

- [x] **R1. Primary-source Spore research**
  - [x] R1.1 Chris Hecker liner notes (metaball skin, spheres-only, bone weights from ball ownership, Moore & Warren tessellation)
  - [x] R1.2 SIGGRAPH '08 motion retargeting paper (generalize/specialize, spine splines, anti-buckling, Test Drive)
  - [x] R1.3 Gingold "Magic Crayons" GDC philosophy (constraints > breadth, design grammar)
  - [x] R1.4 Official tutorial UX grammar (spine wheel-scale, morph handles, symmetry, undo, name dice)
  - [x] R1.5 Rempton Games breakdown (rigblocks, 3-layer paint)
- [x] **R2. Community & tech survey** (see RESEARCH_SUPPLEMENT.md)
  - [x] R2.1 User's reference video (VOID three.js creator) — video-only inspiration, no public source
  - [x] R2.2 Open-source Spore-likes (Pudgy Pals spline+metaball trick, daniellochner Unity creator, 3D Paint metaball sculptor)
  - [x] R2.3 THREE.MarchingCubes API/perf/export (`generateGeometry()`, maxPolyCount sizing, res bands 28–40 live / 50–70 bake)
  - [x] R2.4 GLTFExporter gotchas (transmission ext, binary guard, CanvasTexture-not-DataTexture, userData pivot tags)
  - [x] R2.5 Chibi proportion numbers (2.5 heads, eyes low + 20–30% face, arms ≤ legs)
  - [x] R2.6 Kawaii palette bands + punk-royal reference reconciliation
  - [x] R2.7 Creator UX patterns (preset-first, curated randomize, archetype-aware controls)
- [x] **R3. POC autopsy** — extract geometry recipes from all four Gemini POCs (documented in RESEARCH.md §3)
- [x] **R4. Docs suite** — README, RESEARCH(+SUPPLEMENT), ARCHITECTURE, DNA_SCHEMA, PARTS_CATALOG, UX_SPEC, INTEGRATION, this TODO
- ✔ Accept: a new contributor can implement any module from docs alone. ✅

## Phase 1 — Foundation: DNA, Store, Stage, Shell ✅

- [x] **F1. Scaffold**: `princess-creator.html` entry + vite input + `src/princess-creator/` module tree (standalone rule enforced)
- [x] **F2. Types** (`types.ts`): PrincessDNA v1 + enums + BuildResult/Rig/Sockets contracts
- [x] **F3. RNG** (`rng.ts`): mulberry32 + int/float/pick/chance/shuffle + string hash
- [x] **F4. DNA core** (`dna.ts`): per-archetype defaults · clone · clamp/validate · migrate · share codes (`P1.` + base64url)
- [x] **F5. Store** (`store.ts`): path-set API, rAF-coalesced notify, colors-only fast path detection, undo/redo (cap 100), drag-aware history
- [x] **F6. Stage** (`scene.ts`): renderer (ACES, sRGB, PCFSoft), pedestal + gold ring, key/rim/fill lights, fog, dust sparkles, orbit controls (clamped), auto-framing, `snapshot()`
- [x] **F7. Name generator** (`names.ts`): seeded syllable names + 🎲
- [x] **F8. Unit tests**: DNA round-trip, defaults validity, clamp, migration, deterministic randomize (see `__tests__/dna.test.ts`)
- ✔ Accept: `npm run dev` → page loads, pedestal renders, tests green. ✅

## Phase 2 — Body Synthesizers (4 archetypes) ✅

- [x] **B1. Shared chibi scaffold** (`synth/shared.ts`): rig group tree (root/torso/neck/head + shoulder/elbow/hip/knee pairs), 9 sockets, pivot-at-joint limb helpers, dress builders (bell/aline/hex/layered/slim), proportion math from `dna.body` (2.5-head grammar)
- [x] **B2. Human** (`synth/human.ts`): smooth sphere head, capsule limbs, puff sleeves, bell dress + ruffle + sash + shoes; POC parity+
- [x] **B3. Fox** (`synth/fox.ts`): flat-shaded icosa head, snout+nose, hex dress + frill, cylinder limbs, boots; signature sliders (snoutLength, fluff)
- [x] **B4. Skeleton** (`synth/skeleton.ts`): shaft+knob bones, flattened-jaw skull, socket boxes + glow pupils + eye point-lights, teeth row, A-line gown + trim + sash
- [x] **B5. Slime** (`synth/slime.ts`): MarchingCubes body (res 40 live), per-frame re-blob from rig joints, transmission material, tracked eye/face anchor, twin-tail hair as metaballs, inner core glow, floor puddle blend
- [x] **B6. Face module** (`face.ts`): eye styles (sparkle/round/lash/sleepy/star/glow/void/button), mouths (smile/open/cat/pout/fang/teeth), blush, blink hook
- [x] **B7. Materials** (`materials.ts`): MaterialKit per archetype (flat vs smooth vs jelly vs bone), `apply(colors)` retint, dispose discipline
- [x] **B8. Synth smoke tests** (`__tests__/synth.test.ts`): all archetypes build, rig+sockets complete, dispose runs, slime update() headless-safe
- ✔ Accept: all four princesses render from DNA and survive slider extremes without visual breakage. ✅ (visual QA continues in Phase 6)

## Phase 3 — Parts System ✅ core / [~] breadth

- [x] **P1. Registry + attach pipeline** (`parts.ts`): PartDef/PartCtx, socket attach, mirroring (author-left, auto-right), morph application, kit-slot materials
- [x] **P2. Starter parts**: crowns ×5 (classic/tiara/crooked/flower/halo), ears ×4 (fox/cat/round/long), tails ×4 (fluffy/thin/bone/wisp), back ×3 (bow/cape/wings), hand items ×4 (wand/staff/fan/tome), hair ×5 (bob/pigtails/twintails/bun/long)
- [x] **P3. Per-archetype adaptation**: kit-driven retint + slime sink-in + slime tail/hair→metaball reroute + fox tail default etc.
- [ ] **P4. Backlog parts** (PARTS_CATALOG §6): choker, witch hat, glasses, gloves, flower-in-hair, harness overlay (Midnight Punk), held slime-pet
  - [ ] P4.1 author geometry · P4.2 allow-matrix · P4.3 randomizer pools · P4.4 visual QA matrix
- ✔ Accept (core): every part renders on every allowed archetype, mirrored pairs symmetric, palette retint touches parts with zero part code. ✅

## Phase 4 — Color & Palette System ✅ core / [~] patterns

- [x] **C1. 8-slot color model** (primary/secondary/accent/skin/hair/eyes/metal/glow) wired through MaterialKit
- [x] **C2. Curated palettes** (`palettes.ts`): per archetype ≥4 sets incl. **Midnight Punk** (canonical human), rose&gold, autumn fox, sunset kitsune, mint slime, bubblegum, bone&violet, moonlit — one-click apply
- [x] **C3. Swatch pickers** for all 8 slots (native color inputs, live retint, history on release)
- [ ] **C4. Pattern layer** (Spore's "coat"): canvas-texture stripes/spots/gradient for dress + fox fur; slime excluded (transmission)
  - [ ] C4.1 `CanvasSkin`-style generator (borrow proven approach from `src/creatures/CanvasSkin.ts`) · C4.2 DNA fields (`pattern`, `patternColor`, `patternScale`) + migration v2 · C4.3 UI chips · C4.4 GLB export check (CanvasTexture path)
- [ ] **C5. Palette editor**: save custom palette to gallery storage
- ✔ Accept (core): palette click restyles everything incl. parts + glow lights in <1 frame. ✅

## Phase 5 — Life: Animation & Test Drive ✅ core / [~] extras

- [x] **A1. Animator** (`animate.ts`): idle (breath, sway/bob/float/rattle styles, head look-around, shy hand clasp) + walk cycle (bob, hip/knee/arm swing, POC-parity) on the shared rig contract
- [x] **A2. Secondary motion hooks** (per synth `update()`): tail swish, cape ripple, pigtail bounce, ear flicks, jelly re-blob wobble, skeleton micro-rattle
- [x] **A3. Blink system** (face hook, 2.5–5s seeded)
- [x] **A4. Emotes**: wave / twirl / dance / cast with envelopes + auto-return; cast fires stage sparkle burst
- [ ] **A5. Extra emotes**: curtsy (very princess), tantrum, spellbook-read idle
- [ ] **A6. Cursor-glance** micro-delight (princess occasionally looks toward pointer)
- [ ] **A7. `prefers-reduced-motion`** support (freeze sparkles, tone down bounce)
- ✔ Accept (core): switching archetypes mid-emote never errors; all 4 feel alive when idle. ✅

## Phase 6 — Creator UX Polish ✅ core / [~] backlog

- [x] **U1. Full panel UI** per UX_SPEC (tabs, custom sliders w/ dbl-click reset, chips, swatches, palette cards, archetype dock, emote bar, top bar)
- [x] **U2. Randomize/Mutate** (curated pools, weighted signatures, palette-aware) + name dice
- [x] **U3. Undo/redo** (buttons + Ctrl+Z/Ctrl+Shift+Z), drag-aware
- [x] **U4. Share code** field: live code, copy, import w/ shake-on-invalid
- [x] **U5. Gallery** (localStorage, thumbnails via stage snapshot, load/delete/save)
- [x] **U6. Keyboard map** (undo/redo, space=random emote, W walk, R camera, 1–4 archetype, Ctrl+S save)
- [ ] **U7. Onboarding shimmer**: first-visit 3-step coachmarks (archetype dock → tabs → randomize)
- [ ] **U8. Toasts** for copy/import/save feedback (currently minimal inline feedback)
- [ ] **U9. Mobile/touch pass** (panels collapse to sheets; pinch zoom)
- [ ] **U10. Sound pass** (tiny UI chimes, mute toggle)
- [ ] **U11. e2e tests** (playwright): load, tab switch, randomize changes DNA, import code renders, export buttons produce blobs
- ✔ Accept (core): a first-time user makes a princess they like in <2 min without docs. (validate with team)

## Phase 7 — Spore-Grade Direct Manipulation & Export Depth ✅ (game-side wiring pending)

- [x] **D1. Hover/select layer**: raycast hover glow (material-swap pulse, kit untouched) + cursor tooltip w/ affordance hints; hover re-acquired across per-notch rebuilds (world matrices refreshed pre-raycast)
- [x] **D2. Wheel-scale hovered part/region** (crown/ears/tail/back/hands/hair + head/eyes/dress/arms/legs/body dials), Alt+wheel = tilt (crown, eyes); gesture-coalesced undo
- [x] **D3. Drag parts**: tear-off with red tint (any part → 'none'), hand items drag between hands (screen-space snap ghost + marker), Esc cancels; ears stay a mirrored pair
- [x] **D4. Pull-to-sculpt**: vertical drag on head/dress/body/arms/legs/eyes pulls that region's dial (the "grab and inflate" feel); one undo entry per gesture; Esc restores — verified headSize 1→1.49 by drag, single undo → 1
- [x] **D5. Paint-drop**: drag any palette-card dot onto the princess → retints exactly one slot (dress→primary, body/head/limbs→skin, hair→hair, crown/hands→metal, back→accent, eyes→eyes); cosmetic fast-path, no rebuild
- [x] **D6. DNA-in-PNG** (the Spore homage): exported portraits carry the share code in an opaque 8-row LSB strip (premultiply-safe); drop a portrait — or a .princess.json (v1 files migrate) — anywhere on the page to load her. In-page round-trip verified. `userData.pivotRole` GLB tags shipped earlier. *(High-res slime bake for GLB still open below.)*
- [x] **D7a. `factory.ts`** — `buildPrincess(dnaOrCode, { targetHeight, animate })` façade, zero DOM imports, per-species tested incl. 1.6-unit game scaling
- [ ] **D7b. Game-side wiring**: campfire "create your princess" behind a dev flag — needs a decision with the game code owners (NewGameFlow), see INTEGRATION.md path A
- [x] **D8. Leak guard**: dispose-balance soak test — every geometry reachable in a build is disposed with it, asserted across all 12 species
- [ ] **D6b. High-res slime bake** (res 64 one-shot for GLB export)
- ✔ Accept: grab / scroll / pull / tear / paint / portrait-drop — all verified end-to-end via Playwright with zero console errors. ✅

## Phase 8 — Species, Classes & Subtypes (Character Design doc) ✅ Wave 1

- [x] **S1. SPECIES.md** — design-doc distillation + per-species visual contract + Wave 2 backlog
- [x] **S2. DNA v2**: species/pclass/subtype/aura fields, traits rename, P1→P2 migration (tested)
- [x] **S3. SPECIES_DEFS registry** — 12 species: synth mapping, proportion presets + lockBody randomizer pins, signature defaults, skin/hair tone pools, 40 curated palettes, weighted pools
- [x] **S4. Classes**: Free/Scholar/Mage/Warrior preset patches, dock chips, randomizer roll
- [x] **S5. New parts**: butterfly + feather wings, horns ×2, orbiting grimoire, glasses; hair braided/ponytail/wild/afro; slit + star eye upgrades
- [x] **S6. Kitsune subtypes**: 1/3/9 fanned tails with independent sway, dock chips
- [x] **S7. Aura module**: motes / cold / warm, palette-tracking lights
- [x] **S8. Species dock UI** (12 chips + class row + contextual subtype row), height-aware camera framing, keyboard 1–9
- [x] **S9. Tests**: 91 green (12-species round-trips, v1 migration, 200-seed validity ×12, build smoke ×12, tagging)
- [x] **S10. Wave 2 species** — SHIPPED 2a: 🌿 fae, 🔥 ignis, 👻 specter. SHIPPED 2b: 🌊 naiad (wet clearcoat+iridescence kit, temple fins, pearls, bubbles), 🌙 moonborn (crescent/full/eclipse moon subtypes, silver limb arcs, lit-from-within hair), 🌺 verdant (living wreath, blooms in hair, vine bands). Also fixed: material kits now rebuild on ANY species change so species tech never leaks between same-synth species. FINAL: 🐍 lamia (fifth body synth — nested serpent chain diving from the hip into a forward ground coil, spine ridges, gold tail rings, self-leveling rest height, tail-length/coil-girth signature dials), 💪 orc + 🧌 troll (broad/huge locked presets, tusks mouth, war/stone palettes). THE 21-SPECIES ROSTER FROM THE CHARACTER DESIGN DOC IS COMPLETE — see SPECIES.md §2
- [ ] **S11. Outfit vocabulary expansions** (corset, ballgown, veil, mantle…) + boon accessory sets
- ✔ Accept (Wave 1): all 12 species land canonical-looking from their dock chip, survive 🎲, and pass silhouette review. ✅

---

## Phase 9 — Animation System: Game Move Set, Tuning & Export ✅

Goal: every species ships the full game move set, tunable in-tool, exportable.

- [x] 9.1 Clip library (`anim/clips.ts`) — 24 keyframed clips on the shared
      10-joint rig contract: idle, idle_alt, walk, run, attack_1/2,
      cast_spell_1/2, get_hit_1/2, block_1/2, jump_begin/idle/land, die_1/2,
      victory, curtsy, stunned, read, wave, twirl, dance. Gameplay events
      (hit, cast_release, step, liftoff, land, parry). Sparse keys → dense
      bake; bare keys = full-neutral anchors.
- [x] 9.2 Species flavor — lamia Slither/coil jumps, slime Melt, skeleton
      Collapse, speed scalars (troll 0.78 … pixie 1.15); resolution
      base → species → energy → tweaks.
- [x] 9.3 Playback (`anim/player.ts`, `animate.ts`) — crossfading ClipPlayer
      with loop-aware event firing; Animator state machine (setState/play,
      holdLast deaths freeze, overlays + blink suppressed while held);
      legacy API (setWalking/playEmote) preserved.
- [x] 9.4 Tuning + save/load (`anim/tweaks.ts`) — per-species per-clip
      speed/amp in localStorage; Animations panel (state chips, grouped
      one-shots, tune sliders); `.anim.json` drop-import restores sessions.
- [x] 9.5 Export — `princess-animations.anim.json` v1: rig contract + all 21
      species fully resolved + tweaks (~0.9 MB). Spec: ANIMATIONS.md.
- [x] 9.6 Factory API — `p.setState/play/onEvent/clips`, `{ tweaks }` option.
- [x] 9.7 QA — 27 anim tests (186 total); Playwright pose verification
      (`scripts/princess-anim-verify.mjs`, freeze-frame capture technique).

## Phase 10 — Game-Side Integration (NEXT — not started)

Goal: princesses leave the Atelier and enter the game world.

- [ ] 10.1 Spawn path — `buildPrincess(shareCode, { targetHeight: 1.6 })` in
      the game scene; named NPCs as committed `.princess.json` files
      (`assets/princesses/…`) — the Spore "tiny recipe" payoff.
- [ ] 10.2 Controller wiring — movement drives `setState` (idle/walk/run;
      jump_begin → jump_idle → jump_land from the jump arc).
- [ ] 10.3 Combat wiring — attacks/casts via `play()`, damage windows from
      `onEvent('hit' | 'cast_release')`; get_hit/block reactions; deaths
      hold their final frame (holdLast).
- [ ] 10.4 Stats hook — pure `statsForDna(dna)` in game code (creator stays
      cosmetic); species/parts → small Spore-style modifiers.
- [ ] 10.5 Portrait pipeline — exporter PNGs (DNA embedded) as dialogue-UI
      portraits.
- [ ] 10.6 Audio pass — map anim events (step/hit/cast_release/liftoff/land/
      parry) to SFX; optional per-species voice blips.
- [ ] 10.7 More species combat flavor — lamia tail-whip attack_2, slime
      bounce-slam, specter phase-dodge get_hit, ignis flame-burst cast
      (same override mechanism as slither/melt).
- [ ] 10.8 Creator polish backlog — remaining `[~]` items from phases 3–6
      (pattern/paint coat layer, more parts, e2e suite, sound in-tool).
- ✔ Accept: a princess made in the Atelier walks, fights, and falls in the
      actual game with correct event timing.

## Standing rules (all phases)

- DNA is the only state; every feature lands with schema + migration + test.
- No game-runtime imports; `factory.ts` is the only integration surface.
- Every part/palette addition passes the all-archetypes × slider-extremes QA.
- Dispose discipline: no geometry leaks on rebuild (soak test in D8 guards).
- Docs updated in the same PR as the code they describe.
