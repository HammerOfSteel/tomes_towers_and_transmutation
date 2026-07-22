# Creature Creator (CC Phases)
> Expanding `creature-lab.html` + `CreatureBuilder.ts` with sub-races, clothing, body morphing, randomiser, face system.
> Full design in `docs/CREATURE_CREATOR_PLAN.md`.

## Status: 🔲 Not started (CreatureBuilder exists, expansion phases pending)

## Dependencies
- Requires: `CreatureDNA.ts`, `CreatureBuilder.ts` (exist ✅)
- Requires: `CharacterCreation.ts` UI (exists ✅)
- Feeds: PROC-B5 `buildCreature()` runtime API

---

## CC-1 — Sub-Race System
- [ ] Add `SubRace` type to `CreatureDNA.ts` (human_warrior/human_mage/elf_scholar/etc.)
- [ ] `subRace` field on `CreatureDNA` (backwards-compatible)
- [ ] `SUBRACE_DEFAULTS` map — each subrace overrides proportion ranges
- [ ] `dnaForSubRace(subRace, baseDna)` function
- [ ] Sub-race selector row in CharacterCreation UI
- [ ] Per-subrace ear shapes in `_headgeo`
- [ ] Unit tests: round-trip through `dnaToBase64`/`base64ToDna`

## CC-2 — Clothing vs Body Props Separation
- [ ] Add `outfit: { top, legs, over }` section to `CreatureDNA`
- [ ] `PropId` split: body props vs outfit items
- [ ] `CreatureBuilder._outfit()` renders top/legs/over
- [ ] CharacterCreation UI: split Props into "Body" and "Outfit" rows
- [ ] Default outfit: `{ top: 'none', legs: 'none', over: 'none' }`

## CC-3 — Richer Body Morphing
- [ ] Torso: `shoulderWidth` / `hipWidth` drive capsule radii
- [ ] Neck: `neckThickness` drives capsule radius
- [ ] Head: `snoutLength > 0.2` adds forward face capsule
- [ ] Tail: `tailCurve` bends each segment's parent rotation
- [ ] Wings: `wingMembrane` scales ShapeGeometry control points
- [ ] Limbs: `limbCurve` adds elbow/knee rotation
- [ ] CharacterCreation: "Advanced Morphing" expandable section

## CC-4 — Procedural Randomiser
- [ ] `🎲 Lucky Roll` button — full random DNA from seed
- [ ] `↺` re-roll icons per section (Colors, Face, Props)
- [ ] Seed display (read-only, shareable)
- [ ] `Mutate` button — calls `mutateDNA` with low variance for subtle variations
- [ ] "Similar" feature: shows 4 variants of current DNA at low mutation

## CC-5 — Expanded Face & Expression System
- [ ] Eyebrow shapes (4 variants per species)
- [ ] Mouth states: neutral/smile/frown/open/pout
- [ ] Eye variants: round/narrow/wide/closed/glowing
- [ ] Expression preview: idle/happy/angry/scared thumbnails
- [ ] `expression` field on `CreatureDNA`

## CC-6 — Export & Share
- [ ] Share code system for creature DNA (`C2.` prefix, matching `P2.` for princess)
- [ ] "Copy Share Code" button
- [ ] URL import: `creature-lab.html#code=C2.xxx`
- [ ] Save to gallery (creature library, similar to princess library)

## Notes
- CC-1 is prerequisite for all other phases (defines subrace as the foundation)
- All phases are additive — existing DNA remains valid (backwards-compatible)
- This work is separate from princess creator — different DNA schema, different builder
