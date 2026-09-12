# Task 9 Fix Report — ShingleSurface review findings

## Summary
Updated `src/world/buildings/kit/ShingleSurface.ts` and `tests/world/buildings/kit/ShingleSurface.test.ts` to address all four review findings.

## Fix 1 — triangle contract
- Replaced the misleading absolute "~4000 triangles per panel" expectation with an explicit **triangle density contract** documented in code near `SHINGLE_TILE_TRIANGLE_BUDGET`.
- Chosen design: **per-tile / per-course budgeting**, not a fixed per-panel ceiling.
- Reasoning: this builder is intended for roof panels of varying world sizes, so a single absolute panel ceiling does not scale honestly; predictable tile-density budgets do.
- Implemented documented per-tile caps by silhouette:
  - rectangular: 12 triangles/tile
  - diamond: 16 triangles/tile
  - fishscale: 48 triangles/tile
- Updated tests to assert the density budget across multiple panel sizes/silhouettes, including the reviewer repro sizes `5 x 3.5 fishscale` and `4.2 x 4 fishscale`.

## Fix 2 — width honor / staggered edges
- Added `buildCourseTileSlots()` so staggered rows generate **trimmed edge tiles** instead of letting half-offset full tiles overhang past the nominal panel width.
- This keeps the shingle field inside `[-width/2, width/2]` while preserving stagger visually.
- Design choice: **clip/shorten edge tiles**, not bounded overhang.
- Reasoning: real verge-edge shingles are commonly cut to fit, and this also matches the codebase’s `StoneTowerWallSurface` stagger convention more closely than letting geometry spill past the requested span.
- Regression coverage now includes the reviewer repro case `width=4.2, slopeLength=3.5, courseHeight=0.35, tilesPerCourse=8` and an additional wider case.
- Post-fix reviewer-case tile span: `minX=-2.0895`, `maxX=2.0895`, total span `4.1790` (inside requested `4.2`).

## Fix 3 — kick-angle geometry verification
- Strengthened the kick test so it measures **actual vertex geometry**, not just `userData.kickDegrees`.
- Added a helper that reads merged course vertices, compares average butt-edge Z vs top-edge Z, and derives the effective kick angle from positions.
- Verified both:
  - default kick ≈ `3°`
  - clamped high input (`12`) produces actual geometry ≈ `5°`

## Fix 4 — full silhouette distinctness
- Extended the silhouette regression test to require **full pairwise distinctness**:
  - rectangular vs diamond
  - diamond vs fishscale
  - rectangular vs fishscale
- The test now compares pairwise geometry signatures rather than relying on a partial set/count check.

## RED / GREEN evidence
### RED
Command:
```bash
npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts
```
Observed failing regression output before the builder fix:
```text
× alternates stagger so odd courses are horizontally offset from even courses
  expected [...] to have a length of 7 but got 6
× clips staggered edge tiles so tile coverage stays within the requested width
  expected -2.2102499961853024 to be greater than or equal to -2.1000010000000002
```
This confirmed the new width/stagger regression checks were catching the old behavior.

### GREEN
Command:
```bash
npx vitest run tests/world/buildings/kit/ShingleSurface.test.ts
```
Output:
```text
✓ tests/world/buildings/kit/ShingleSurface.test.ts (10 tests)
Test Files  1 passed (1)
Tests  10 passed (10)
```

## TypeScript status
Command:
```bash
npx tsc --noEmit
```
- Result: repository still has many **pre-existing baseline** TypeScript errors outside this task.
- Verification for this task: `npx tsc --noEmit 2>&1 | grep 'ShingleSurface' || true` produced no output, so there are **no new type errors in the changed ShingleSurface source/test files**.

## Files changed
- `src/world/buildings/kit/ShingleSurface.ts`
- `tests/world/buildings/kit/ShingleSurface.test.ts`
- `.superpowers/sdd/task-9-fix-report.md`
