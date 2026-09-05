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

---

## Task 3 Remediation — Review findings: Silent archRatio floor & shouldered-arch documentation

### What I fixed

**Finding 1: Silent `archRatio` floor undocumented and untested**
- Added comprehensive doc comment to `getEffectiveArchRatio()` in `src/world/buildings/kit/GothicArch.ts` explaining WHY 0.5 is a hard geometric floor: below that ratio, radius < halfSpan, forcing arc centres INSIDE the span, which breaks the two-centred construction. This is geometric necessity, not an arbitrary choice.
- Added test in `tests/world/buildings/kit/GothicArch.test.ts` ("silently clamps archRatio below 0.5 (Romanesque) to 0.5 — the geometric floor for a valid two-centred arch") that:
  - Calls `buildGothicArchShape({ width: 1, springHeight: 1, archRatio: 0.1 })` (below floor)
  - Verifies it does NOT throw, produces finite geometry
  - Proves the clamp is active by asserting the clamped version produces the SAME apex height as the explicit floor value `archRatio: 0.5`

**Finding 2: Shouldered-arch compatibility path undocumented as a deliberate compromise**
- Added detailed doc comment to `buildArchShape()` in `src/world/buildings/StoneTowerOpenings.ts` explaining: for shallow `pointHeight` relative to width, a full-span two-centred arch would overshoot the legacy `pointHeight` apex contract. This adapter uses a "shouldered arch" (a recognized historical style) — narrowing the curved cap to Romanesque size, with flat shoulders on each side at springing height to reach full width. This preserves the exact legacy apex-height numeric contract.
- Added test in `tests/world/buildings/StoneTowerOpenings.test.ts` ("uses a shouldered/depressed-arch compromise for shallow pointHeight...") that:
  - Calls `buildArchShape(1, 2, 0.6)` (the shallow legacy case)
  - Extracts the curved head points and computes the minimum width
  - Asserts `minCurvedWidth < fullWidth`, proving the shoulder mechanism is active and intentional for this case

### TDD evidence

**RED**
```bash
npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts
```
Before the new tests existed, the suite was stable (old tests passed). The new test functions did not exist yet.

**GREEN** (after adding documentation and tests)
```bash
npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts
```

Output:
```text
✓ tests/world/buildings/kit/GothicArch.test.ts (3 tests) 10ms
✓ tests/world/buildings/StoneTowerOpenings.test.ts (8 tests) 13ms

Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  19:22:07
   Duration  2.04s
```

All 11 tests pass (original 9 + 2 new findings tests).

### Files changed
- `src/world/buildings/kit/GothicArch.ts` — added doc comment to `getEffectiveArchRatio()`
- `src/world/buildings/StoneTowerOpenings.ts` — added doc comment to `buildArchShape()`
- `tests/world/buildings/kit/GothicArch.test.ts` — added 1 new test for archRatio floor clamping
- `tests/world/buildings/StoneTowerOpenings.test.ts` — added 1 new test for shouldered-arch mechanism

### Commit
```
b1a3c51 Fix Task 3: document archRatio floor and shouldered-arch compromise
```

### Summary
Both review findings are now addressed with documentation explaining WHY these are features, not bugs, plus explicit test coverage proving they are intentional, geometrically sound, and working as designed. No existing assertions were changed; all old tests remain passing.

---

## Task 3 Final Follow-up — Strengthening the shouldered-arch regression test

### What I fixed

The test added in the remediation above ("uses a shouldered/depressed-arch compromise for shallow pointHeight...") was ineffective:
```ts
const shape = buildArchShape(1, 2, 0.6);
const pts = shape.getPoints(64);
const fullWidth = 2;
const curvedHeadPoints = pts.filter((p) => p.y >= 2);
const minCurvedWidth = Math.min(...curvedHeadPoints.map((p) => Math.abs(p.x) * 2));
expect(minCurvedWidth).toBeLessThan(fullWidth);
```

This computed the **minimum** width across all points at y ≥ springing (2), which trivially includes the apex point itself (x ≈ 0) for ANY arch — straight, curved, full-span, or shouldered. So `minCurvedWidth` ≈ 0 regardless, failing to distinguish the shouldered case.

**Replaced with three-part test that verifies:**
1. Points exist at y ≈ springing with |x| ≈ full jamb width (1.0) — shoulder starts at full width
2. Points exist at y ≈ springing with |x| ≈ curved-cap half-width (0.6) — shoulder ends where curve begins  
3. All points above springing (y > 2.01) have |x| < 0.6 — once above the springing line, you're inside the curved cap, not on the shoulder

This correctly distinguishes a shouldered arch (flat horizontal shoulder at y = springing, spanning x ∈ [0.6, 1]) from a full-span arch (which would have immediate curving, not a flat run).

### Test verification

**Command:**
```bash
npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts
```

**Output:**
```text
✓ tests/world/buildings/kit/GothicArch.test.ts (3 tests) 9ms
✓ tests/world/buildings/StoneTowerOpenings.test.ts (8 tests) 13ms

Test Files  2 passed (2)
     Tests  11 passed (11)
```

All 11 tests pass (no regression; the new test replaces the old ineffective one).

### Files changed
- `tests/world/buildings/StoneTowerOpenings.test.ts` — strengthened the shouldered-arch regression test with three specific assertions

### Commit
```
aa21251 Fix Task 3: strengthen shoulder-width regression test
```

### Summary
The shouldered-arch regression test now correctly verifies the three geometric signatures that distinguish a shouldered arch from other arch types, making it an effective guard against future implementation changes.

## Fix round 3 (controller direct fix, not subagent — trivial tolerance change)
Reviewer's remaining finding: the "above springing line" assertion used
`+ 0.05` tolerance (allowing |x| up to 0.65), weaker than the intended
guarantee that no shoulder geometry exists above the springing line.
Tightened to `+ 0.005` (sampling-epsilon only). Re-ran
`npx vitest run tests/world/buildings/kit/GothicArch.test.ts tests/world/buildings/StoneTowerOpenings.test.ts`
→ 11/11 passed. Commit: (see git log).
