# Lattice Deform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 2D bilinear cage/lattice deformation as a standalone, pure, engine-agnostic utility, per `docs/superpowers/specs/2026-09-02-lattice-deform-design.md`. No live prop-system integration — infrastructure only, mirroring Phases 3/4's own scope.

**Architecture:** One new file, `src/world/LatticeDeform.ts`, exporting `bilinearDeform(fx, fz, quad)` (single-point deform) and `deformModule(vertices, quad)` (batch). `quad` is a `{nw, ne, se, sw}` set of 4 target world-space corner points, matching this roadmap's established `[NW, NE, SE, SW]` corner-order convention.

**Tech Stack:** TypeScript, Vitest. No dependencies.

## Global Constraints

- Full design spec: `docs/superpowers/specs/2026-09-02-lattice-deform-design.md` — read it first.
- Pure functions only — no THREE.js, no prop/settlement dependency.
- `fx`/`fz` are fractions of a module's own axis-aligned bounding box, conventionally in `[0, 1]` but the math itself doesn't clamp or validate range (extrapolation beyond `[0,1]` is a valid, if unusual, use — not rejected).
- Run `npx vitest run tests/world/LatticeDeform.test.ts` after the test-writing step, and the full `npx vitest run` + `npx tsc --noEmit` at the end — confirm no new failures/errors beyond the mission baseline (146 tsc errors; ~13 pre-existing/flaky vitest failures).
- Commit messages: write to a temp file and `git commit -F <tempfile>`, then delete it. Every commit ends with:
  ```
  Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
  ```

---

### Task 1: `LatticeDeform.ts` — bilinear cage deformation

**Files:**
- Create: `src/world/LatticeDeform.ts`
- Test: `tests/world/LatticeDeform.test.ts`

**Interfaces:**
- Produces: `LatticePoint2D { x: number; z: number }`; `LatticeQuad { nw: LatticePoint2D; ne: LatticePoint2D; se: LatticePoint2D; sw: LatticePoint2D }`; `bilinearDeform(fx: number, fz: number, quad: LatticeQuad): LatticePoint2D`; `LatticeModuleVertex { fx: number; fz: number }`; `deformModule(vertices: readonly LatticeModuleVertex[], quad: LatticeQuad): LatticePoint2D[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/world/LatticeDeform.test.ts`:

```ts
// tests/world/LatticeDeform.test.ts
import { describe, it, expect } from 'vitest';
import { bilinearDeform, deformModule, type LatticeQuad } from '@/world/LatticeDeform';
import { buildRelaxedMeshGrid } from '@/world/RelaxedMeshGrid';

const UNIT_SQUARE: LatticeQuad = {
  nw: { x: 0, z: 0 }, ne: { x: 1, z: 0 }, se: { x: 1, z: 1 }, sw: { x: 0, z: 1 },
};

// A deliberately irregular (but simple, convex, non-degenerate) quad.
const IRREGULAR: LatticeQuad = {
  nw: { x: -1, z: -0.8 }, ne: { x: 2.2, z: -1.1 }, se: { x: 1.9, z: 2.3 }, sw: { x: -0.7, z: 2.0 },
};

describe('bilinearDeform', () => {
  it('deforms the 4 exact AABB corners to the target quad\'s own 4 corners', () => {
    const checkCorner = (got: { x: number; z: number }, expected: { x: number; z: number }) => {
      expect(got.x).toBeCloseTo(expected.x, 10);
      expect(got.z).toBeCloseTo(expected.z, 10);
    };
    checkCorner(bilinearDeform(0, 0, IRREGULAR), IRREGULAR.nw);
    checkCorner(bilinearDeform(1, 0, IRREGULAR), IRREGULAR.ne);
    checkCorner(bilinearDeform(1, 1, IRREGULAR), IRREGULAR.se);
    checkCorner(bilinearDeform(0, 1, IRREGULAR), IRREGULAR.sw);
  });

  it('deforms the center (0.5, 0.5) to the average of the 4 target corners', () => {
    const center = bilinearDeform(0.5, 0.5, IRREGULAR);
    const expectedX = (IRREGULAR.nw.x + IRREGULAR.ne.x + IRREGULAR.se.x + IRREGULAR.sw.x) / 4;
    const expectedZ = (IRREGULAR.nw.z + IRREGULAR.ne.z + IRREGULAR.se.z + IRREGULAR.sw.z) / 4;
    expect(center.x).toBeCloseTo(expectedX, 10);
    expect(center.z).toBeCloseTo(expectedZ, 10);
  });

  it('reproduces the input (fx, fz) exactly when the target quad is the unit square (identity case)', () => {
    for (const [fx, fz] of [[0, 0], [1, 0], [0.25, 0.75], [0.6, 0.1], [1, 1]] as const) {
      const p = bilinearDeform(fx, fz, UNIT_SQUARE);
      expect(p.x).toBeCloseTo(fx, 10);
      expect(p.z).toBeCloseTo(fz, 10);
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = bilinearDeform(0.3, 0.7, IRREGULAR);
    const b = bilinearDeform(0.3, 0.7, IRREGULAR);
    expect(a).toEqual(b);
  });

  it('never produces a NaN or infinite coordinate for a non-degenerate quad', () => {
    for (const [fx, fz] of [[0, 0], [0.5, 0.5], [1, 1], [0.1, 0.9], [-0.2, 1.3]] as const) {
      const p = bilinearDeform(fx, fz, IRREGULAR);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
});

describe('deformModule', () => {
  it('deforms every vertex of a module in one call, matching individual bilinearDeform results', () => {
    const vertices = [{ fx: 0, fz: 0 }, { fx: 1, fz: 0 }, { fx: 0.5, fz: 0.5 }, { fx: 1, fz: 1 }];
    const result = deformModule(vertices, IRREGULAR);
    expect(result).toHaveLength(4);
    for (let i = 0; i < vertices.length; i++) {
      expect(result[i]).toEqual(bilinearDeform(vertices[i]!.fx, vertices[i]!.fz, IRREGULAR));
    }
  });

  it('never produces NaN when deforming into a real quad sourced from RelaxedMeshGrid output (Phase 3 reuse)', () => {
    const { points, quads } = buildRelaxedMeshGrid(4, 4, 7);
    const firstQuad = quads[0]!;
    const quad: LatticeQuad = {
      nw: points[firstQuad[0]!]!, ne: points[firstQuad[1]!]!,
      se: points[firstQuad[2]!]!, sw: points[firstQuad[3]!]!,
    };
    const vertices = [{ fx: 0, fz: 0 }, { fx: 1, fz: 0 }, { fx: 1, fz: 1 }, { fx: 0, fz: 1 }, { fx: 0.5, fz: 0.5 }];
    const result = deformModule(vertices, quad);
    for (const p of result) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/world/LatticeDeform.test.ts`
Expected: FAIL — `Cannot find module '@/world/LatticeDeform'`.

- [ ] **Step 3: Write the implementation**

Create `src/world/LatticeDeform.ts`:

```ts
// ── LatticeDeform — bilinear cage/lattice deformation ────────────────────────
//
//  Phase 5 of the "organic world tiles" roadmap
//  (TODO/organic_world_tiles_todo.md): the "store every vertex as a
//  fraction of the module's own bounding box, then rebuild from a target
//  cell's own corner positions" technique -- lets a hand-authored module
//  (a fence segment, a building footprint, ...) fit an irregular
//  quadrilateral cell instead of only uniform-scaling. Scoped to 2D
//  (bilinear, 4-corner footprint) deformation -- see design spec for why
//  3D/trilinear whole-module deformation is a documented future extension,
//  not attempted here. Deliberately standalone and pure (no THREE.js/prop
//  dependency) -- see
//  docs/superpowers/specs/2026-09-02-lattice-deform-design.md for why this
//  ships as infrastructure only, with no live prop-system integration yet.

export interface LatticePoint2D {
  x: number;
  z: number;
}

/** A target quadrilateral's own 4 corners, in this roadmap's established
 *  [NW, NE, SE, SW] winding (matches DualGridCaseTable.ts, ShorelineCornerField.ts). */
export interface LatticeQuad {
  nw: LatticePoint2D;
  ne: LatticePoint2D;
  se: LatticePoint2D;
  sw: LatticePoint2D;
}

/**
 * Bilinearly interpolates a point at fractional position (fx, fz) -- fx=0
 * is the quad's own west (NW/SW) side, fx=1 is its east (NE/SE) side; fz=0
 * is its north (NW/NE) side, fz=1 is its south (SE/SW) side -- within
 * `quad`. `fx`/`fz` are conventionally in [0, 1] (a module's own
 * AABB-relative vertex position) but are not clamped -- extrapolating
 * slightly outside that range is a valid, if unusual, use.
 */
export function bilinearDeform(fx: number, fz: number, quad: LatticeQuad): LatticePoint2D {
  const topX = quad.nw.x + (quad.ne.x - quad.nw.x) * fx;
  const topZ = quad.nw.z + (quad.ne.z - quad.nw.z) * fx;
  const botX = quad.sw.x + (quad.se.x - quad.sw.x) * fx;
  const botZ = quad.sw.z + (quad.se.z - quad.sw.z) * fx;
  return {
    x: topX + (botX - topX) * fz,
    z: topZ + (botZ - topZ) * fz,
  };
}

/** One vertex of a hand-authored module, expressed as a fraction of the
 *  module's own axis-aligned bounding box (see bilinearDeform's doc). */
export interface LatticeModuleVertex {
  fx: number;
  fz: number;
}

/**
 * Deforms every vertex of a module (each given as an AABB-fraction) into
 * `quad`'s own irregular footprint, in one call.
 */
export function deformModule(vertices: readonly LatticeModuleVertex[], quad: LatticeQuad): LatticePoint2D[] {
  return vertices.map(v => bilinearDeform(v.fx, v.fz, quad));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/world/LatticeDeform.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full regression suite + tsc**

Run: `npx vitest run`
Expected: same pre-existing/flaky failure set as the mission baseline, zero new failures.

Run: `npx tsc --noEmit 2>&1 | wc -l`
Expected: `146` (unchanged from baseline).

- [ ] **Step 6: Commit**

```bash
git add src/world/LatticeDeform.ts tests/world/LatticeDeform.test.ts
cat > /tmp/commit_msg.txt << 'EOF'
feat: implement LatticeDeform bilinear cage deformation

Phase 5 of the organic world tiles roadmap. Standalone, pure 2D bilinear
cage/lattice deformation: bilinearDeform() maps a module vertex's own
AABB-fraction position into an arbitrary target quad's irregular
footprint; deformModule() batches this over a whole module. Verified to
exactly reproduce a target quad's own 4 corners, its bilinear center,
and the identity case (unit-square target); also verified against a real
quad sourced from Phase 3's RelaxedMeshGrid output (no NaN/infinite
coordinates). No live prop-system integration -- infrastructure only,
mirroring Phases 3/4's own scope, per the design spec.

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
```

---

### Task 2: Update roadmap docs, push

**Files:**
- Modify: `TODO/organic_world_tiles_todo.md`
- Modify: `TODO/TODO_OVERVIEW.md`

- [ ] **Step 1: Update Phase 5's checklist and status**

In `TODO/organic_world_tiles_todo.md`, change the Phase 5 heading to
`## Phase 5 — Props/assets: lattice-fit modular scatter ✅ Deformation utility shipped 2026-09-02 (standalone only — live prop integration deferred, see below)`.
Check off 5.1 (design spec, noting it proceeded despite Phase 3's live
integration still being deferred, since the utility itself doesn't need
it) and 5.2 (the utility itself, `LatticeDeform.ts`). Leave 5.3 unchecked
with a note that it's deferred (no live target to pilot against yet).

Update the top status line to reflect all 5 phases now having shipped at
least their standalone/infrastructure scope, with the specific
deferrals/deferred-integration items called out.

- [ ] **Step 2: Mirror the status change in `TODO/TODO_OVERVIEW.md`'s G16 entry**

- [ ] **Step 3: Commit and push**

```bash
git add TODO/organic_world_tiles_todo.md TODO/TODO_OVERVIEW.md
cat > /tmp/commit_msg.txt << 'EOF'
docs: mark Phase 5 lattice-deform utility shipped (live integration deferred)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
EOF
git commit -F /tmp/commit_msg.txt
rm /tmp/commit_msg.txt
git push
```

---

## Summary

After this plan: all 5 phases of the organic world tiles roadmap have
shipped at least their core, well-justified, low-risk scope. `LatticeDeform.ts`
completes the roadmap's own suggested "shares code with Phase 3.3" reuse
story (both would consume the same bilinear interpolation utility, whenever
either is eventually wired into a live system). Every phase's remaining
live-integration/kit-of-parts/pilot work is clearly documented as
deliberately deferred, with the reasoning recorded in each phase's own
design spec, not silently dropped.
