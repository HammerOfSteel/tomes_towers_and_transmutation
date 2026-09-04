# Slime Buildings — Implementation Plan

**Status:** Approved (2026-09-04) — user selected the mimic-culture direction. Ready to execute.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Approved direction:** Alternative A — inhabited-ruin / occupied-shell, reframed as **mimic culture** (see spec §2.4): slime colonies observe and reproduce another race's building shell, lightly `Ruinate`-damaged rather than truly decayed, then apply the slime accretion kit in a **rotating neon hue** (mint-green, azure-blue, bubblegum-pink, violet-purple, cyan-teal — not one fixed green) plus a **rounded gel-mimic silhouette** (larger fillet radius on mimicked hard edges, asymmetric ridge/eave sag, mandatory drip points even when undamaged).

**Goal:** Replace slime’s current blob-based building variants with a full 8-kind mimic-culture kit that reads as slime through discrete, depth-laddered, rounded, neon-hued accretion modules layered onto a mimicked host shell — never smooth gelatinous massing.

**Architecture:** Build slime buildings as host shell → light `Ruinate` → slime accretion overlay (neon hue + rounding pass). Reuse the shared modular building kit heavily because slime is ninth in the rollout; only slime-specific accretion/material/composition code should be new unless a required Part 4 module is still missing.

**Tech Stack:** TypeScript, Three.js, Vitest, existing building kit modules, Settlement Lab Playwright verification. No new runtime dependency is expected.

**Estimated task count:** 21 tasks total — Tasks 1–3 are `[SHARED KIT]` prerequisite/completion tasks that may be deduped if already built by earlier races; Tasks 4–14 are 11 slime race-specific implementation tasks; Tasks 15–21 are the required final integration/verification/documentation/commit tasks. (Task 0, the art-direction approval gate, is resolved and removed from the active list; its history is kept below for the record.)

**Known baseline to state during verification:** `npx tsc --noEmit` has **144 pre-existing errors**; `npx vitest run` has **~13 pre-existing failures / 3272 passing**. Only new failures beyond those baselines are regressions.

---

## Dependencies / ordering

1. `[SHARED KIT]` tasks come before slime-specific tasks.
2. Slime-specific tasks build materials, accretion modules, host-shell selection, then individual kind builders.
3. Final tasks must remain in this exact order: wire into `FACTION_BUILDING_VARIANTS`; generalise Settlement Lab showcase so all 8 slime kinds render; delete superseded builders; full regression; live Playwright screenshot; update TODO docs; commit.

---

### Task 0 (resolved): Art-direction approval gate

**Goal:** Prevent accidental implementation of an unapproved slime architecture direction.

**Resolution (2026-09-04):** User approved the mimic-culture direction (Alternative A + neon hue rotation + rounded silhouette). See spec §2.4. No further gating needed before Task 1.

---

### Task 1: [SHARED KIT] Verify/complete shared modular-building prerequisites

**Goal:** Ensure every Part 4 module required by slime exists and exposes the interfaces this plan consumes.

**Files:**
- Create or modify as needed: `src/world/buildings/kit/DepthLadder.ts`
- Create or modify as needed: `src/world/buildings/kit/OpeningParts.ts`
- Create or modify as needed: `src/world/buildings/kit/FacadeGrammar.ts`
- Create or modify as needed: `src/world/buildings/kit/ModuleSocket.ts`
- Create or modify as needed: `src/world/buildings/kit/StringCourse.ts`
- Test: `tests/world/buildings/kit/SlimeSharedKitPrerequisites.test.ts`

**Failing test to write first:**
- `tests/world/buildings/kit/SlimeSharedKitPrerequisites.test.ts`
- Assert these exports exist and can be called/imported: `DEPTH_LADDER`, `assertDepthLadderCompliance`, `buildCompleteWindowOpening`, `buildCompleteDoorOpening`, `splitFacade`, `repeatBays`, `createSocket`, `findSockets`, `buildStringCourse`.
- Assert opening helpers emit or describe all five required pieces: recess, proud surround, sill/threshold, internal division, set-back glazing/door face.

**Implementation outline:**
- If modules already exist from prior race work, add only compatibility exports/adapters required by the test.
- If missing, implement minimal shared modules per doctrine Part 4; keep them race-agnostic.
- Do not place slime colours or slime-specific names in shared kit files.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/SlimeSharedKitPrerequisites.test.ts`

---

### Task 2: [SHARED KIT] `Ruinate` exposes attachment sockets

**Goal:** Let slime overlay modules attach to structurally meaningful ruin edges instead of arbitrary positions.

**Files:**
- Create or modify: `src/world/buildings/kit/Ruinate.ts`
- Test: `tests/world/buildings/kit/Ruinate.test.ts`

**Failing test to write first:**
- Add tests asserting `ruinateShell(shell, opts)` returns a result with:
  - non-empty `group` / geometry;
  - same-material rubble derived from removed wall/roof material;
  - `sockets` tagged at least `breach-edge`, `eave`, `rafter`, `plinth`, and `opening-edge` when those source features exist;
  - protected corners/buttresses remain intact under a high damage seed.

**Implementation outline:**
- Extend `Ruinate` result type with `sockets: ModuleSocket[]`.
- Tag sockets deterministically from damaged facade/roof/opening data.
- Preserve existing callers by defaulting socket collection to an empty array when no metadata is supplied.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/Ruinate.test.ts`

---

### Task 3: [SHARED KIT] Shell descriptors for host-building reuse

**Goal:** Provide a race-agnostic descriptor that lets slime consume already-built shells without importing every prior race builder ad hoc.

**Files:**
- Create or modify: `src/world/buildings/kit/HostShell.ts`
- Test: `tests/world/buildings/kit/HostShell.test.ts`

**Failing test to write first:**
- Assert `createHostShellDescriptor(kind, faction, dna)` returns:
  - a `THREE.Group` or lazy builder reference;
  - footprint data;
  - opening descriptors;
  - socket descriptors;
  - protected regions for `Ruinate`.
- Assert every canonical slime kind can request a descriptor without throwing when using a generic fallback shell.

**Implementation outline:**
- Add a small shared adapter layer around existing builders / shell blueprints.
- Avoid circular imports with `FactionBuildingVariants.ts`; prefer shell blueprints or factory callbacks injected by the race-specific slime kit.
- If previous race work already has an equivalent shell descriptor, add a compatibility adapter instead of a duplicate module.

**Verification command:**
- `npx vitest run tests/world/buildings/kit/HostShell.test.ts`

---

### Task 4: Slime material palette and constants

**Goal:** Replace the single fixed green palette with a rotating neon hue system while forbidding large smooth blob massing.

**Files:**
- Create: `src/world/buildings/slime/SlimeMaterials.ts`
- Test: `tests/world/buildings/slime/SlimeMaterials.test.ts`

**Failing test to write first:**
- Assert exported `SLIME_HUE_FAMILIES` contains exactly five named families with light/dark hex pairs: `mint_green` (`#aaffcc`/`#66ffaa`), `azure_blue` (`#7ec8ff`/`#3d9dff`), `bubblegum_pink` (`#ff9ee8`/`#ff5cc8`), `violet_purple` (`#c79bff`/`#9a5bff`), `cyan_teal` (`#7ffff0`/`#2be8d4`), with weights `0.30/0.20/0.20/0.15/0.15` summing to 1.
- Assert `rollSlimeHueFamily(seed)` is deterministic for a given seed and returns one of the five family ids, respecting the declared weights over a large sample.
- Assert `rollElderHueBlend(seed)` (for `villa`/`chapel`/`watchtower`) returns two *adjacent* families per a defined adjacency map, never two arbitrary families and never a hue outside the five.
- Assert `createSlimeMaterialSet(hueFamily)` returns named material slots: `gel`, `gelDark`, `gelGlow`, `hardenedGel`, `wetStain`, `containedGel`, with `gelDark` computed at ~35% luminance of `gel` for that family (not the old fixed `#186030`).
- Assert material slots are reusable object identities within one set and do not clone per placed detail by default.

**Implementation outline:**
- Use `THREE.MeshStandardMaterial` for gel/hardened material slots.
- Use transparent/emissive settings only for membrane/lens/contained pieces.
- Export size/depth constants for accretion modules: lip height, membrane rim depth, tendril radius bounds, puddle tile thickness.
- Export rounding constants for Task 6: `MIMIC_FILLET_RADIUS_MIN = 0.06`, `MIMIC_FILLET_RADIUS_MAX = 0.10`, `MIMIC_RIDGE_SAG_MIN = 0.05`, `MIMIC_RIDGE_SAG_MAX = 0.12`.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeMaterials.test.ts`

---

### Task 5: Slime accretion primitives

**Goal:** Build the discrete slime overlay kit: lips, membranes, tendrils, drips, lenses, puddle skirts, and contained vats.

**Files:**
- Create: `src/world/buildings/slime/SlimeAccretionKit.ts`
- Test: `tests/world/buildings/slime/SlimeAccretionKit.test.ts`

**Failing test to write first:**
- Assert each builder returns non-empty finite geometry:
  - `buildGelLipCourse()`
  - `buildMembraneSheet()`
  - `buildTendrilBridge()`
  - `buildFacetedDripRun()`
  - `buildGelLensInfill()`
  - `buildPuddleSkirtTiles()`
  - `buildContainedGelVat()`
- Assert generated meshes are named/tagged with their module type.
- Assert no builder emits a large unframed sphere/dome as its primary geometry.
- Assert membrane/lens modules include hard rim/rib geometry, not only a flat plane.

**Implementation outline:**
- Use faceted extrusions, low-sided prisms, tapered tube/rib geometry, and framed planes.
- Place pieces relative to sockets supplied by Tasks 2–3.
- Keep all modules deterministic from seed and socket id.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeAccretionKit.test.ts`

---

### Task 6: Slime host-shell selection weights (mimicry source)

**Goal:** Encode the approved mimic-culture direction as deterministic host-shell ("mimicry source") weights per building kind.

**Files:**
- Create: `src/world/buildings/slime/SlimeHostShells.ts`
- Test: `tests/world/buildings/slime/SlimeHostShells.test.ts`

**Failing test to write first:**
- Assert all 8 canonical kinds have host-shell weight tables.
- Assert each weight table sums to `1.0 ± 0.001`.
- Assert `pickSlimeHostShell(kind, seed)` is deterministic and returns a `{ shellId, sourceLabel }` pair, where `sourceLabel` names the mimicked race/shell family (e.g. `"elven small-shell"`) for use in generated metadata/comments per spec §2.4 rule 12.
- Assert `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower` do not all collapse to the same host shell id.

**Implementation outline:**
- Encode weights from `spec.md` Section 4.
- Bias grassland/forest-compatible shells (human rural, elven, generic stone) but allow occasional reclaimed prior-race shell; a settlement may freely mix mimicry sources across its buildings (spec §8 "remaining open items").
- Return shell descriptor ids/callbacks plus the source label, not full built groups, so later tasks can compose lazily.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeHostShells.test.ts`

---

### Task 7: Opening overlay compliance helpers

**Goal:** Ensure slime-filled openings still satisfy the five-piece opening minimum.

**Files:**
- Create: `src/world/buildings/slime/SlimeOpeningOverlay.ts`
- Test: `tests/world/buildings/slime/SlimeOpeningOverlay.test.ts`

**Failing test to write first:**
- Build a sample door and window overlay.
- Assert the host opening includes recess, proud surround, sill/threshold, internal division, and set-back gel/glazing plane.
- Assert gel lens plane sits at the `-0.20` depth-ladder offset and does not replace the frame/sill/mullion.
- Assert partial clogging never covers more than the configured maximum facade/opening ratio.

**Implementation outline:**
- Compose `OpeningParts.ts` output with `buildGelLensInfill()` and small lip/drip modules.
- Add depth metadata to generated groups for tests.
- Keep helper race-specific; do not change shared opening behaviour unless a shared bug is found.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeOpeningOverlay.test.ts`

---

### Task 8: Slime occupation composer

**Goal:** Implement host shell → light ruin → slime overlay composition shared by all slime kinds, applying the neon hue rotation and rounded gel-mimic silhouette from spec §2.4.

**Files:**
- Create: `src/world/buildings/slime/SlimeOccupiedShell.ts`
- Test: `tests/world/buildings/slime/SlimeOccupiedShell.test.ts`

**Failing test to write first:**
- Assert `buildSlimeOccupiedShell(dna, blueprint)` returns a non-empty `THREE.Group`.
- Assert same seed/kind yields deterministic child names/counts.
- Assert output contains host shell, light-ruinate result, and at least three slime overlay module classes.
- Assert `ruinateShell()` is invoked at roughly half the damage intensity used for a true abandoned ruin (spec §2.4-A), not full decay.
- Assert the composed group carries one rolled hue family from `SLIME_HUE_FAMILIES` (via `rollSlimeHueFamily`/`rollElderHueBlend` for `villa`/`chapel`/`watchtower`) and every accretion module drawn from that same family — no mixed-family output within one building.
- Assert mimicked hard edges (wall corners, frame corners, coping, roof ridge caps) are filleted at `MIMIC_FILLET_RADIUS_MIN`–`MIMIC_FILLET_RADIUS_MAX`, strictly larger than the host kit's own chamfer, while the underlying block-course wall geometry keeps its sharp courses (spec §2.4-B.2).
- Assert one ridge or eave edge is offset downward by `MIMIC_RIDGE_SAG_MIN`–`MIMIC_RIDGE_SAG_MAX` relative to its mirrored counterpart, and that at least 1 and at most 3 drip points are present, regardless of the ruin-damage roll (i.e. even a lightly-damaged building still gets its mandatory drip points).
- Assert a generated bounding box remains finite and roughly matches the requested footprint plus allowed overlay skirt.

**Implementation outline:**
- Accept a `SlimeKindBlueprint` containing footprint, floors, opening schedule, ruin intensity, module weights, and prop weights.
- Use `pickSlimeHostShell()` then `ruinateShell()` at reduced intensity then attach accretion modules to sockets, all built from the one rolled `createSlimeMaterialSet(hueFamily)`.
- Apply the `Bevels` module with the mimic radius constants to mimicked hard-edge sockets; apply the ridge/eave sag as a deterministic per-seed vertex offset on the roof module only, not the wall.
- Add a fallback socket strategy for host shells that lack rich metadata.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeOccupiedShell.test.ts`

---

### Task 9: House and terraced builders

**Goal:** Implement the two residential low-status slime building kinds without sharing identical output.

**Files:**
- Create or modify: `src/world/buildings/slime/SlimeBuildingKit.ts`
- Test: `tests/world/buildings/slime/SlimeResidential.test.ts`

**Failing test to write first:**
- Assert `buildSlimeHouse(makeDna('house'))` and `buildSlimeTerraced(makeDna('terraced'))` build non-empty finite groups.
- Assert their footprints/bounding boxes differ in width/depth per `getFootprint()`.
- Assert house has one primary door and cottage-scale windows; terraced has two storeys and row/party-wall markers.
- Assert both contain puddle-skirt tiles and at least one opening overlay.

**Implementation outline:**
- Add `SlimeKindBlueprint` entries for `house` and `terraced` from spec Sections 4.1–4.2.
- Route both through `buildSlimeOccupiedShell()`.
- Keep builder exports named and individually testable.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeResidential.test.ts`

---

### Task 10: Shop and inn builders

**Goal:** Implement commercial/social slime buildings with readable counters, signs, vats, and channels.

**Files:**
- Modify: `src/world/buildings/slime/SlimeBuildingKit.ts`
- Test: `tests/world/buildings/slime/SlimeCommerce.test.ts`

**Failing test to write first:**
- Assert `buildSlimeShop()` has an open framed counter bay, goods props, and membrane/roof frame.
- Assert `buildSlimeInn()` has broad frontage, sign bracket, upper windows, and at least one contained vat/channel prop.
- Assert neither builder uses a pure dome/blob as main massing.

**Implementation outline:**
- Add `shop` and `inn` blueprints.
- Use `buildContainedGelVat()` and `buildMembraneSheet()` as secondary props.
- Ensure sign/counter geometry uses frames, rods, straps, and thickness.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeCommerce.test.ts`

---

### Task 11: Blacksmith builder

**Goal:** Implement `Slime Forge` as a hardening/secretion workshop with a strong vent silhouette.

**Files:**
- Modify: `src/world/buildings/slime/SlimeBuildingKit.ts`
- Test: `tests/world/buildings/slime/SlimeBlacksmith.test.ts`

**Failing test to write first:**
- Assert `buildSlimeBlacksmith()` includes a broad framed work arch, vent/chimney silhouette, acid/mineral channel lips, and hardened secretion plate props.
- Assert side vents have grille/mullion divisions.
- Assert the front remains recognisable from a bounding box and child-name inspection.

**Implementation outline:**
- Add `blacksmith` blueprint from spec Section 4.6.
- Reuse host forge shell where available; otherwise use generic masonry shell descriptor.
- Add hardening-table/vat/channel prop modules.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeBlacksmith.test.ts`

---

### Task 12: Villa and chapel builders

**Goal:** Implement high-status civic/sacred slime buildings as occupied manor and Pulse Pool chapel ruin.

**Files:**
- Modify: `src/world/buildings/slime/SlimeBuildingKit.ts`
- Test: `tests/world/buildings/slime/SlimeCivicSacred.test.ts`

**Failing test to write first:**
- Assert `buildSlimeVilla()` has 3-storey/high-status massing, central elder-chamber motif, and multiple retained openings.
- Assert `buildSlimeChapel()` has a long `4 × 8 WU` nave footprint, at least 4 lancet/side windows, front entrance, and pulse-pool focal module.
- Assert both use `Ruinate` sockets and slime overlay modules, not the legacy blob base.

**Implementation outline:**
- Add `villa` and `chapel` blueprints from spec Sections 4.3 and 4.7.
- Use `Tracery`/`OpeningParts` for chapel oculus/rose/lancets where available.
- Preserve visible axis for chapel and asymmetrical damage.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeCivicSacred.test.ts`

---

### Task 13: Watchtower builder

**Goal:** Give slime its first bespoke watchtower, suitable for Settlement Lab showcase despite natural spawn gap.

**Files:**
- Modify: `src/world/buildings/slime/SlimeBuildingKit.ts`
- Test: `tests/world/buildings/slime/SlimeWatchtower.test.ts`

**Failing test to write first:**
- Assert `buildSlimeWatchtower()` builds a tall narrow structure using `getFootprint('watchtower', size)`.
- Assert height is at least 3× width and contains alternating arrow-slit/opening markers.
- Assert top treatment is broken parapet/partial roof/open beacon frame, not a smooth dome.
- Assert spiral/vertical slime growth appears on only one dominant side.

**Implementation outline:**
- Add `watchtower` blueprint from spec Section 4.8.
- Use host tower shell and `Ruinate` with protected vertical edges.
- Add top beacon/core behind a complete frame.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeWatchtower.test.ts`

---

### Task 14: Slime quality-bar aggregate tests

**Goal:** Guard against regression to blobs, featureless primitives, or identical kind output.

**Files:**
- Test: `tests/world/buildings/slime/SlimeQualityBar.test.ts`
- Modify as needed: `src/world/buildings/slime/*`

**Failing test to write first:**
- For all 8 builders, assert:
  - non-empty finite geometry;
  - kind-specific child/module names;
  - at least one plinth/ground-contact module;
  - at least one asymmetry marker/dominant growth side;
  - no top-level child named/typed as legacy blob base;
  - mesh count or module signature does not collapse all 8 kinds to one identical output.

**Implementation outline:**
- Add exported `SLIME_BUILDING_BUILDERS` map for test iteration if helpful.
- Add metadata in `userData` or child names for module classification.
- Fix any builder that fails aggregate quality expectations.

**Verification command:**
- `npx vitest run tests/world/buildings/slime/SlimeQualityBar.test.ts`

---

### Task 15: Wire into `FACTION_BUILDING_VARIANTS`

**Goal:** Route runtime faction `slime` to all 8 new builders.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`

**Failing test to write first:**
- Extend registry coverage to include slime `house`, `terraced`, `villa`, `inn`, `shop`, `blacksmith`, `chapel`, and `watchtower`.
- Assert `mapStudioFactionToRuntimeFaction('slime')` still resolves to runtime `slime` in the relevant existing test file if such coverage does not already exist.
- Assert `getFactionBuildingVariant('slime', 'watchtower')` is no longer `null`.

**Implementation outline:**
- Import new builders from `src/world/buildings/slime/SlimeBuildingKit.ts`.
- Replace slime registry entries with one explicit entry per canonical kind.
- Do not delete old blob functions in this task; deletion is Task 17.

**Verification command:**
- `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/slime/SlimeQualityBar.test.ts`

---

### Task 16: Generalise Settlement Lab showcase so all 8 slime kinds render

**Goal:** Make the Settlement tab’s “Play in 3D” acceptance gate show all 8 slime kinds together.

**Files:**
- Modify: `src/scene/SettlementLabScene.ts`
- Add or modify test: `tests/scene/SettlementLabScene.test.ts` or nearest existing Settlement Lab test file

**Failing test to write first:**
- Assert slime’s `POC_KIND_OVERRIDE_BY_FACTION` callback assigns/forces a deterministic spread containing all 8 kinds across a sufficiently large generated settlement preview.
- Assert elven’s existing callback behaviour remains intact.
- Assert watchtower appears at least once because it is not naturally reachable through `WARD_TO_KIND`.

**Implementation outline:**
- Generalise the existing callback-form override into a helper such as `makeAllKindsShowcaseOverride(kinds: BuildingKind[])`.
- Add slime entry cycling or mapping planned buildings to all canonical kinds.
- Preserve normal ward mapping for other factions unless explicitly overridden.

**Verification command:**
- `npx vitest run tests/scene/SettlementLabScene.test.ts`
- If no such test harness exists, add the smallest pure helper test for the extracted showcase function.

---

### Task 17: Delete superseded blob builders as dead code

**Goal:** Remove the old slime blob architecture path so it cannot reappear in screenshots.

**Files:**
- Modify: `src/world/buildings/FactionBuildingVariants.ts`
- Modify: `tests/world/FactionBuildingVariants.test.ts`

**Failing test to write first:**
- Add a source/registry guard asserting legacy names are absent from the public slime variant path: `buildSlimeBlobBase`, old `buildSlimeVilla` implementation, old `buildSlimeChapel` implementation, old `buildSlimeShop` implementation.
- Prefer behaviour-level assertions; source-string assertions are acceptable only for this cleanup gate if no better dead-code test exists.

**Implementation outline:**
- Remove old blob helper functions and unused imports/material helpers that only supported them.
- Keep new builder names if they intentionally reuse `buildSlimeVilla` etc.; ensure they now import from `SlimeBuildingKit.ts` and are not the legacy inline functions.
- Run TypeScript locally after targeted tests to catch unused imports.

**Verification command:**
- `npx vitest run tests/world/FactionBuildingVariants.test.ts tests/world/buildings/slime/SlimeQualityBar.test.ts`

---

### Task 18: Full regression

**Goal:** Confirm the slime building work introduces no new test/type regressions beyond known baselines.

**Files:** none expected unless fixing regressions.

**Failing test to write first:** None — this is a verification task.

**Implementation outline:**
- Run the full suite and compare against baseline.
- Run the type checker and compare against baseline.
- Fix only regressions caused by slime/shared-kit work.

**Verification commands:**
- `npx vitest run`
  - Expected: same pre-existing failure set/count as baseline (~13 failures / 3272 passing), plus new slime tests passing.
- `npx tsc --noEmit`
  - Expected: 144 pre-existing errors; no new error category caused by changed files.

---

### Task 19: Live Playwright verification with screenshot

**Goal:** Visually verify the slime Settlement Lab output satisfies the user’s acceptance gate.

**Files:**
- Optional uncommitted helper under project test/scratch location if needed; remove before commit.
- Screenshots should be saved under an existing project screenshots/artifacts convention, not a temporary system directory.

**Failing test to write first:**
- Add or run a Playwright check that opens Settlement Lab with `sl_faction=slime`, an isolated port, and verifies no console/page errors.
- The visual assertion is human/agent inspection of the screenshot.

**Implementation outline:**
- Start Vite from this worktree on an unused port, not the stale server on 5173.
- Navigate to Settlement Lab with slime faction and a seed/size likely to show enough buildings.
- Capture screenshots showing all 8 kinds together or enough labeled close-ups to prove each kind rendered.
- Inspect for: no blob-building massing, complete openings, depth-ladder shadowing, visible slime accretion, asymmetry, ground contact.
- Stop the dev server and remove throwaway scripts/artifacts that are not intended to be committed.

**Verification command:**
- `npx playwright test <targeted settlement-lab check>` if a committed check exists.
- Otherwise document manual Playwright command, screenshot path, seed, port, and visual pass/fail notes in the implementation report.

---

### Task 20: Update TODO docs

**Goal:** Record the approved slime architecture direction and implementation status in roadmap docs.

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

**Failing test to write first:**
- Documentation check before edit: search the TODO files for the new slime completion entry and confirm it is absent.

**Implementation outline:**
- Add a Phase 6 slime entry noting:
  - no reference art existed at spec time;
  - user-approved direction;
  - occupied-shell/ruin/accretion method;
  - all 8 canonical kinds built;
  - Settlement Lab all-kinds showcase verified;
  - full regression results and known baseline comparison.
- Mirror concise status in `TODO/TODO_OVERVIEW.md`.

**Verification command:**
- `grep -n "Slime" TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md`

---

### Task 21: Commit

**Goal:** Persist the verified implementation with an auditable commit message.

**Files:** all changed source, tests, and TODO docs from Tasks 1–20.

**Failing test to write first:** None — commit task only after verification passes.

**Implementation outline:**
- Review changed files.
- Commit only relevant source/tests/docs.
- Include the required co-author trailer.

**Verification command:**
- Use repository status/diff review before committing.
- Commit message should include:

```text
feat: add slime occupied-shell building kit

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
