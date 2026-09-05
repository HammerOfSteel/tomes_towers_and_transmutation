# Task 11 Fix Report — Tracery review findings

## Fix 1 — Connected rose-window stone frame
- Reworked rose-window layout generation into a shared `createRoseWindowLayout()` helper that computes ring bands, spoke belts, and explicit overlap metrics.
- Increased angular coverage so ring sectors and spoke connectors physically meet with a small overlap margin at every junction:
  - ring segment coverage: `0.72 * step`
  - spoke junction coverage: `0.34 * step`
  - overlap margin: `0.06 * step`
- Re-shaped spokes into a waisted hexagonal connector: wide enough at the inner/outer junctions to abut ring sectors, narrower at mid-span so the negative space still reads as Gothic lancet openings.
- Kept openings deliberate by cutting annular-sector piercings into ring segments with `shape.holes` instead of relying on accidental gaps between solids.
- Exported test-only layout/shape helpers via `__traceryTestUtils` so tests can inspect the exact production geometry.

### Fix 1 design judgment
I kept the existing top-level `ring-N` / `spoke-N` composition because it matches the kit’s naming conventions and broken-emission behavior, but made the *stone frame itself* contiguous by overlapping the parts at shared radii/angles. The hole shapes remain genuine piercings inside those solids.

### Fix 1 RED/GREEN evidence
**RED (old disconnected angular coverage reintroduced temporarily):**
```bash
python3 - <<'PY'
from pathlib import Path
path = Path('src/world/buildings/kit/Tracery.ts')
text = path.read_text()
text = text.replace('const ROSE_RING_SEGMENT_COVERAGE = 0.72;', 'const ROSE_RING_SEGMENT_COVERAGE = 0.58;')
text = text.replace('const ROSE_SPOKE_JUNCTION_COVERAGE = 0.34;', 'const ROSE_SPOKE_JUNCTION_COVERAGE = 0.22;')
path.write_text(text)
PY
npx vitest run tests/world/buildings/kit/Tracery.test.ts -t "rose window whose ring piercings are explicit holes and whose spoke/ring joints overlap"
```
Failed with:
```text
AssertionError: expected -0.15707963267948966 to be greater than 0
```
This is the overlap metric going negative again.

**GREEN (restored new implementation):**
```bash
npx vitest run tests/world/buildings/kit/Tracery.test.ts -t "rose window whose ring piercings are explicit holes and whose spoke/ring joints overlap"
```
Passed.

**Geometry sanity diagnostics:**
```text
lobes=6  overlapAngle=0.062832  firstRingArcOverlap=0.019243
lobes=8  overlapAngle=0.047124  firstRingArcOverlap=0.014432
lobes=12 overlapAngle=0.031416  firstRingArcOverlap=0.009622
```
These confirm positive shared-arc contact for the common lobe counts the reviewer called out.

## Fix 2 — Tests now prove real holes exist
- Removed the weak solid-disc volume heuristics entirely.
- Chose direct topology assertions (option **a**) because they are the strongest proof and inspect the exact production `THREE.Shape` objects.
- Added test coverage for:
  - trefoil `shape.holes.length === 4`
  - quatrefoil `shape.holes.length === 5`
  - every rose ring-segment shape has `holes.length > 0`
- Because the helpers construct the same shapes used in production, a holeless implementation now fails immediately even if overall volume still looked plausibly “light”.

### Fix 2 design judgment
I preferred direct `shape.holes` assertions over a like-for-like volume control because topology is the actual requirement. Volume comparisons can be fooled; the presence of populated hole paths cannot.

### Fix 2 RED/GREEN evidence
**RED (temporarily disabled `shape.holes.push(...)` calls):**
```bash
python3 - <<'PY'
from pathlib import Path
path = Path('src/world/buildings/kit/Tracery.ts')
text = path.read_text()
text = text.replace('shape.holes.push(', 'void (')
path.write_text(text)
PY
npx vitest run tests/world/buildings/kit/Tracery.test.ts -t "explicit pierced-hole topology|explicit holes"
```
Failed with:
```text
expected [] to have a length of 4 but got 0
expected [] to have a length of 5 but got 0
expected 0 to be greater than 0
```

**GREEN (restored new implementation):** the same tests pass in the final run below.

## Fix 3 — Broken-emission test proves omission/replacement
- Read the `VoussoirArch.test.ts` precedent and mirrored its omission check pattern.
- Added `intactTraceryPartNames()` to compare intact `ring-*` / `spoke-*` mesh names against the broken build.
- The test now asserts:
  - intact build has no broken fragments,
  - broken build has broken fragments,
  - intact-part names in the broken build are a strict subset of the intact build,
  - at least one intact part is missing,
  - each broken ring fragment corresponds to a missing `ring-*-segment-*`,
  - each broken spoke fragment corresponds to all omitted `spoke-*-connector-*` meshes for that spoke.

### Fix 3 RED/GREEN evidence
**RED (temporarily removed the `continue` statements so broken fragments were added on top of intact parts):**
```bash
python3 - <<'PY'
from pathlib import Path
path = Path('src/world/buildings/kit/Tracery.ts')
text = path.read_text()
text = text.replace('        continue;\n      }\n\n      ringGroup.add(createTraceryMesh(', '      }\n\n      ringGroup.add(createTraceryMesh(', 1)
text = text.replace('        continue;\n      }\n\n      spokeGroup.add(createTraceryMesh(', '      }\n\n      spokeGroup.add(createTraceryMesh(', 1)
path.write_text(text)
PY
npx vitest run tests/world/buildings/kit/Tracery.test.ts -t "emits optional broken tracery fragments while the default build stays intact"
```
Failed with:
```text
AssertionError: expected 0 to be greater than 0
```
That is `missingNames.length`, proving the regression is now caught.

**GREEN (restored new implementation):** the final targeted run passes.

## Final verification
### Vitest
```bash
npx vitest run tests/world/buildings/kit/Tracery.test.ts
```
Result:
```text
✓ tests/world/buildings/kit/Tracery.test.ts (6 tests)
Tests 6 passed (6)
```

### TypeScript
```bash
npx tsc --noEmit --pretty false
```
Result: repo-wide baseline still has many unrelated existing errors outside this task.

Changed-file check:
```bash
npx tsc --noEmit --pretty false 2>&1 | grep -E "src/world/buildings/kit/Tracery\\.ts|tests/world/buildings/kit/Tracery\\.test\\.ts" || true
```
Result: no matches, so no new type errors were introduced in the changed files.
