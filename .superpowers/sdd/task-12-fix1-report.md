# Task 12 Fix 1 Report — Buttress review fixes

## Finding 1 — gablet cap thickness
- Changed `buildGabletCap()` in `src/world/buildings/kit/Buttress.ts` to stop reusing `buildGableRoof()`.
- The buttress now builds its own local extruded gable prism with `THREE.Shape` + `THREE.ExtrudeGeometry`, finished with the same `trimExtrudeSettings()` / `finishArchitecturalGeometry()` conventions already used elsewhere in the kit.
- `RoofMassing.ts` was left untouched.

### Measured thickness before / after
Repro command:
```bash
npx tsx -e "import * as THREE from 'three'; import { buildButtress } from './src/world/buildings/kit/Buttress.ts'; const buttress = buildButtress({ height: 4, cap: 'gablet' }, new THREE.MeshStandardMaterial()); const rows = []; buttress.updateMatrixWorld(true); buttress.traverse((child) => { if (child instanceof THREE.Mesh && /gable-end/.test(child.name)) { const box = new THREE.Box3().setFromObject(child); const size = box.getSize(new THREE.Vector3()); rows.push({ name: child.name, size: [size.x, size.y, size.z] }); } }); console.log(JSON.stringify(rows, null, 2));"
```
Before:
- `gable-end-front`: `[0.3421846630, 0.1548174375, 0]`
- `gable-end-back`: `[0.3421846630, 0.1548174375, 0]`

Post-fix command:
```bash
npx tsx -e "import * as THREE from 'three'; import { buildButtress } from './src/world/buildings/kit/Buttress.ts'; const buttress = buildButtress({ height: 4, cap: 'gablet' }, new THREE.MeshStandardMaterial()); const rows = []; buttress.updateMatrixWorld(true); buttress.traverse((child) => { if (child instanceof THREE.Mesh && child.parent?.name === 'gablet-cap') { const box = new THREE.Box3().setFromObject(child); const size = box.getSize(new THREE.Vector3()); rows.push({ name: child.name, size: [size.x, size.y, size.z] }); } }); console.log(JSON.stringify(rows, null, 2));"
```
After:
- `gablet-roof`: `[0.4535999894, 0.1814399958, 0.1931999922]`
- The dedicated regression test now reports no child mesh with any axis extent `<= 0.001`.

## Finding 2 — weathered-cap taper proof
- Strengthened `tests/world/buildings/kit/Buttress.test.ts` so the weathered-cap test now samples real world-space vertices in horizontal bands near each cap's bottom and top.
- The test asserts each cap's top-band X/Z spread is measurably smaller than its bottom-band spread (`< 98%`), which proves real tapering geometry instead of only checking the outer bounding box.

### RED / GREEN proof
Temporary RED mutation:
- Replaced `buildWeatheredCapMesh()` with a naive rectangular prism of the same outer bounds.
- Command:
```bash
npx vitest run tests/world/buildings/kit/Buttress.test.ts -t "builds a finite three-stage buttress with weathered set-offs and a predictable overall height"
```
- Result: failed as intended.
- Failure excerpt:
```text
AssertionError: expected 0.6000000238418579 to be less than 0.5880000233650208
```
That is the new taper assertion rejecting a flat-sided box that still satisfies the old bounding-box checks.

Restored GREEN run:
- Restored the real lofted weathered-cap geometry.
- Re-ran the same targeted command.
- Result: `1 passed | 7 skipped`.

## Requested verification summaries
### `npx vitest run tests/world/buildings/kit/Buttress.test.ts`
- Result: `Test Files  1 passed (1)` / `Tests  8 passed (8)`.

### `npx vitest run tests/world/buildings/kit/`
- Result: `Test Files  11 passed (11)` / `Tests  69 passed (69)`.
- This is the prior `68/68` green baseline plus the new buttress regression test.

### `npx tsc --noEmit 2>&1 | grep -i buttress`
- Result: no output (`[no buttress-related TypeScript output]`).
