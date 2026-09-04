# Task 3 Report — True two-centred GothicArch

## What I implemented
- Added `src/world/buildings/kit/GothicArch.ts` exporting `buildGothicArchShape({ width, springHeight, archRatio })`.
- Implemented the shared-kit two-centred construction with real circular arcs via `THREE.Shape.absarc`, using `archRatio = R / S` as documented in the doctrine/research.
- Exported named defaults:
  - `GOTHIC_ARCH_ROMANESQUE_RATIO = 0.5`
  - `GOTHIC_ARCH_EQUILATERAL_RATIO = 1.0`
  - `GOTHIC_ARCH_LANCET_RATIO = 1.6`
- Updated `src/world/buildings/StoneTowerOpenings.ts` so `buildArchShape()` delegates to `buildGothicArchShape()` for pointed heads, preserves the exact rectangle path for `pointHeight === 0`, and keeps curved hole geometry by pushing the inner `Shape` directly into `outer.holes`.
- Added `tests/world/buildings/kit/GothicArch.test.ts` for curved-vs-straight detection, apex centering/finite coordinates, and increasing apex height with larger `archRatio`.
- Added a compatibility regression test in `tests/world/buildings/StoneTowerOpenings.test.ts` proving the old straight triangular point is gone while the old apex-position assertions still pass.

## archRatio-to-pointHeight conversion formula
For a full-span two-centred arch with clear span `S`, radius `R`, and rise `h`:

- `archRatio = R / S`
- `h = sqrt(R*S - S^2/4)`
- rearranged: `R = h^2 / S + S / 4`
- therefore `archRatio = R / S = h^2 / S^2 + 1/4`

I use that formula when the legacy pointed head is tall enough to be representable over the full opening width.

For the existing compatibility case `buildArchShape(1, 2, 0.6)`, a full-width true two-centred arch cannot keep the apex as the highest point at only `0.6` rise over a `2.0` span. To preserve the existing apex contract (`2.6`) while still replacing the straight triangle with true circular arcs, the adapter narrows the curved head to `curvedWidth = min(fullWidth, 2 * pointHeight)` and uses the Romanesque ratio `0.5` for that curved portion, leaving short springing-line shoulders on each side. That keeps the old caller-visible apex height while making the tip genuinely curved.

## TDD evidence
### RED
Command:
```bash
npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts
```
Output excerpt:
```text
FAIL  tests/world/buildings/kit/GothicArch.test.ts
Error: Failed to resolve import "../../../../src/world/buildings/kit/GothicArch"

FAIL  tests/world/buildings/StoneTowerOpenings.test.ts > buildArchShape > uses curved sides near the apex instead of the old straight triangular point
AssertionError: expected undefined to be defined
```

### GREEN
Command:
```bash
npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts
```
Output:
```text
✓ tests/world/buildings/kit/GothicArch.test.ts (2 tests)
✓ tests/world/buildings/StoneTowerOpenings.test.ts (7 tests)

Test Files  2 passed (2)
Tests       9 passed (9)
```

## Files changed
- `src/world/buildings/kit/GothicArch.ts`
- `src/world/buildings/StoneTowerOpenings.ts`
- `tests/world/buildings/kit/GothicArch.test.ts`
- `tests/world/buildings/StoneTowerOpenings.test.ts`

## Self-review findings
- Arc math lives in `GothicArch.ts`; `StoneTowerOpenings.ts` is now an adapter instead of re-implementing the geometry.
- The new tests distinguish curved sides from the old straight triangular point by measuring deviation from the spring-to-apex chord.
- Existing behavior contracts remain covered: apex remains near `(0, 2.6)` for `buildArchShape(1, 2, 0.6)`, and `pointHeight = 0` still produces a rectangle.
- Recessed frame/cavity geometry still validates as finite and deterministic under the existing `StoneTowerOpenings.test.ts` suite.
- I requested a focused review after implementation changes; the final rereview found no high-confidence issues.

## Concerns
- The shallow legacy compatibility path necessarily blends a narrower true circular head into short horizontal shoulders to preserve the old `pointHeight` apex contract. That passes the requested tests and review, but it is not a full-span Gothic head for very shallow rises.
- I did not do an in-scene visual pass, so tangent continuity at the shoulder-to-arc join is only test/review validated, not artistically validated.
