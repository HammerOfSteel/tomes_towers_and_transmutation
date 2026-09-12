# Task 12 Report — Buttress kit module

## What I implemented
- Added `src/world/buildings/kit/Buttress.ts`.
- Added `tests/world/buildings/kit/Buttress.test.ts`.
- Implemented `buildButtress(options, material)` as a stepped pier builder for ruin/civic facades with:
  - separately named buttress stages,
  - sloped weathered set-off caps between stages,
  - optional `flat`, `gablet`, and `pinnacle` top caps,
  - seeded `brokenTopHeight` ruin truncation with jagged break geometry.

## Final API surface
- `export type ButtressCapStyle = 'flat' | 'gablet' | 'pinnacle'`
- `export interface ButtressOptions`
  - `height: number`
  - `width?: number`
  - `stages?: number`
  - `depth?: number`
  - `cap?: ButtressCapStyle`
  - `brokenTopHeight?: number`
  - `seed?: number`
- `export function buildButtress(options: ButtressOptions, material: THREE.Material): THREE.Group`

## Naming and metadata scheme
- Root group: `buttress` with `userData.role = 'buttress'`.
- Intact stages: `buttress-stage-0`, `buttress-stage-1`, ... with `userData.role = 'buttress-stage'`.
- Stage transitions: `weathered-cap-0`, `weathered-cap-1`, ... with `userData.role = 'weathered-cap'`.
- Designed caps:
  - `flat-cap`
  - `gablet-cap`
  - `pinnacle-cap`
- Broken truncation mesh: `<source-segment-name>-broken` with `userData.role = 'broken-top'` and `userData.originalRole` preserving whether the cut replaced a stage or a weathered cap.

## Key design decisions

### Weathered-cap geometry approach
- I did not fake the set-offs with flat boxes.
- Each transition is a real sloped solid built by lofting from the lower stage footprint to the narrower upper-stage footprint with `createSolidBetweenProfiles()`.
- That produces a chamfered/weathered top surface whose bounding box sits exactly between the lower stage top and the next stage bottom.

### Stage tapering
- Default projection depth comes from `depthFor('BUTTRESS')`.
- Successive stage footprints are derived by interpolating from the base footprint toward a smaller target footprint, so width and depth both decrease monotonically even for unusually narrow/shallow custom inputs.

### Gablet vs pinnacle distinction
- `gablet` wraps `buildGableRoof()` from `RoofMassing.ts`, then re-centers and rescales the returned roof assembly so its measured footprint tracks the topmost buttress stage proportionally.
- `pinnacle` is a separate cap group with a small beveled base plus a tapered spire built from `createSolidBetweenProfiles()`, ending in a much tighter apex footprint than the gablet ridge.

### Broken-top jaggedness technique
- Ruin truncation uses `mulberry32` seeded randomness.
- The break is chosen by `resolveBrokenTopPlacement()` so exact segment-boundary cuts still replace the top visible segment with a broken mesh instead of leaving a flat intact top.
- Jaggedness comes from:
  - per-corner footprint insets on the broken top outline, and
  - per-corner negative Y offsets on the top profile,
  creating a measurable non-flat silhouette rather than a clean horizontal cut.

## TDD evidence
### RED
Command:
```bash
npx vitest run tests/world/buildings/kit/Buttress.test.ts
```
Initial output excerpt:
```text
FAIL  tests/world/buildings/kit/Buttress.test.ts
Error: Failed to resolve import "../../../../src/world/buildings/kit/Buttress"
```
This confirmed the new test failed before implementation because the module did not exist.

### GREEN
Command:
```bash
npx vitest run tests/world/buildings/kit/Buttress.test.ts
```
Final summary:
```text
Test Files  1 passed (1)
     Tests  7 passed (7)
```

## Test coverage summary
- `buildButtress({ height: 4 })` returns a finite `THREE.Group` with measured overall height and intact stage/cap geometry.
- Base/mid/top stage meshes are asserted by returned names.
- Weathered caps are asserted by real bounding-box placement and non-trivial dimensions.
- Stage footprints are asserted from actual geometry and must shrink at each transition.
- `gablet` proportional sizing is checked across two different buttress footprints.
- `pinnacle` is distinguished numerically from `gablet` by its tighter top silhouette.
- `brokenTopHeight` is checked for capped total height, designed-cap suppression, jagged top-vertex variation, and exact-boundary truncation behavior.
- Depth defaults/overrides are checked numerically against `depthFor('BUTTRESS')` and an explicit custom depth.

## Verification
### Targeted command
```bash
npx vitest run tests/world/buildings/kit/Buttress.test.ts
```
Result:
```text
✓ tests/world/buildings/kit/Buttress.test.ts (7 tests)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

### TypeScript check
```bash
npx tsc --noEmit 2>&1 | grep -i buttress || true
```
Result: no output, so no new Buttress-specific TypeScript errors were introduced.

### Broader kit regression
```bash
npx vitest run tests/world/buildings/kit/
```
Result:
```text
Test Files  11 passed (11)
     Tests  68 passed (68)
```

## Review follow-up
- A review pass caught two real edge-case bugs after the first green run:
  - small width/depth inputs could flare outward because of absolute taper floors,
  - exact segment-boundary `brokenTopHeight` cuts could leave a flat intact top.
- I fixed both and added regression coverage before final verification.
- A follow-up review also prompted explicit `-broken` mesh naming for ruined top segments to avoid ambiguity with intact stage names.

## Files changed
- `src/world/buildings/kit/Buttress.ts`
- `tests/world/buildings/kit/Buttress.test.ts`
- `.superpowers/sdd/task-12-report.md`
