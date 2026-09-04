# Task 4 + Task 5 Report

## Summary
Implemented a shared `src/world/buildings/kit/OpeningParts.ts` module with:
- `buildWindowOpening()` for the five-piece window contract
- `buildDoorOpening()` for door-specific threshold + planked leaf + strap hardware

Refactored:
- `src/world/buildings/StoneTowerWindows.ts`
- `src/world/buildings/StoneTowerEntrance.ts`

## Task 4 — Five-piece window OpeningParts
### Implemented
- Added named window children: `recess`, `surround`, `sill`, `division`, `glazing`
- Reused existing arch-shape machinery via `buildArchShape()` from `StoneTowerOpenings.ts`
- Added chamfered sill geometry using `trimExtrudeSettings()` and `finishArchitecturalGeometry()`
- Added a simple underside drip lip under the sill nose
- Added real internal division bars:
  - vertical mullion for `pointed_arch`
  - cross mullion for `cross_mullion`
  - cross division for `oculus`
- Set glazing back to the `GLAZING` ladder depth and kept it opaque / non-transparent
- Refactored all three tower window types to consume `buildWindowOpening()`
- Preserved moonstone accent on `pointed_arch`

### Design decisions
- **Recess semantic depth:** used `REVEAL` for the cavity anchor because the doctrine calls out jamb/head/sill-top reveal depth; the carved opening cavity logically belongs to that deeper rung.
- **Oculus adaptation:** implemented a dedicated `round` opening variant instead of faking roundness with a tall arch, preserving the five-piece rule while keeping the oculus genuinely circular.
- **Sill drip-lip:** used a beveled sill extrusion plus a small underside lip mesh rather than a more elaborate profile; enough to read as a drip edge without overbuilding.

### TDD evidence
#### RED
- Added `tests/world/buildings/kit/OpeningParts.test.ts`
- Ran:
  - `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerWindows.test.ts`
- Observed expected failure:
  - import failure for missing `@/world/buildings/kit/OpeningParts`

#### GREEN
- Implemented `OpeningParts.ts` and refactored `StoneTowerWindows.ts`
- Re-ran:
  - `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerWindows.test.ts`
- Result:
  - `2 passed (2)` files
  - `12 passed (12)` tests

### Commit
- `b253579` — `Task 4: five-piece window OpeningParts`

## Task 5 — Door leaves, thresholds, planks, straps
### Implemented
- Extended `OpeningParts.ts` with `buildDoorOpening()`
- Added named door children: `recess`, `surround`, `threshold`, `door-leaf`
- Built the threshold as a sill-variant
- Built the door leaf from 5–7 separate vertical plank meshes with small gaps
- Added 3–5 thin horizontal strap-bar meshes across the planks
- Positioned the door leaf at the `GLAZING` rung as the door equivalent of the set-back closing plane
- Refactored `StoneTowerEntrance.ts` `_buildArch()` to use `buildDoorOpening()`
- Preserved moonstone accent and left flanking pillars untouched

### Design decisions
- **Door-leaf depth-ladder role:** treated the leaf as the door analogue of glazing because it is the set-back closure plane occupying the same visual/depth role within the opening.
- **Planked construction:** used separate meshes for each plank so tests can prove it is not a single flat slab.
- **Iron straps:** used thin transverse bars named `strap-*` so count and placement are structurally testable.
- **Post-review containment fix:** after code review, shortened the planked leaf to stay below the spring line so rectangular planks do not protrude into the narrowing pointed-arch head.

### TDD evidence
#### RED
- Extended `OpeningParts.test.ts` for `buildDoorOpening()`
- Ran:
  - `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`
- Observed expected failure:
  - `buildDoorOpening is not a function`
- Added an additional failing regression test after review for door-leaf containment below the spring line
- Observed expected failure:
  - `expected 1.8411680229988097 to be less than or equal to 1.550001`

#### GREEN
- Implemented `buildDoorOpening()` and entrance refactor
- Fixed the reviewed protrusion by clamping the planked leaf to the straight jamb height
- Re-ran:
  - `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`
  - `npx vitest run tests/world/buildings/kit/OpeningParts.test.ts tests/world/buildings/StoneTowerWindows.test.ts tests/world/buildings/StoneTowerEntrance.test.ts`
- Result:
  - final combined run: `3 passed (3)` files, `20 passed (20)` tests

## Files changed
- `src/world/buildings/kit/OpeningParts.ts` (new)
- `src/world/buildings/StoneTowerWindows.ts`
- `src/world/buildings/StoneTowerEntrance.ts`
- `tests/world/buildings/kit/OpeningParts.test.ts` (new)

## Self-review findings
- All required named pieces exist for windows and doors.
- No arch-shape logic was duplicated; opening shapes reuse shared shape builders from existing opening code.
- No palette materials were cloned for per-piece variation; shared materials are reused from passed inputs, with only local purpose-specific materials created at existing call sites where prior code already instantiated them.
- Existing window and entrance test contracts remain green, including the critical stone/dark-material depth checks.
- Added explicit regression coverage for door-leaf overreach into the pointed arch head.

## Concerns
- Strap bars currently reuse the passed stone material rather than a darker iron material. This keeps the no-new-palette / no-cloning discipline simple and does not break tests, but may be worth revisiting if a shared iron material is introduced later.
- Threshold currently reuses the sill construction pattern, including the subtle underside lip; visually acceptable, but a future art pass may want a flatter threshold profile.
