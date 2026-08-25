# Water Lab: See-Through Swimmable Water Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Water Lab's default water surface genuinely translucent (like OOT/SM64) so the player stays visible while swimming/diving in any camera mode, instead of the current opaque Water.js/Water2.js surfaces that hide the player entirely.

**Architecture:** Add a third `WaterVariantKind` (`'stylized'`) backed by the existing transparent custom shader (`createWaterMaterial()`), make it the Water Lab default, tune that shader's alpha/saturation for player-through-water readability, add a small submerged-only glow light on the player rig for extra legibility, and extend the Dev Sandbox's 2-way water A/B toggle to 3-way.

**Tech Stack:** TypeScript, three.js (custom `THREE.ShaderMaterial`, `THREE.PointLight`), Vitest (jsdom), existing `PlayerController`/`WaterLabScene`/`DevSandbox` classes.

## Global Constraints

- No new npm dependencies — reuse `three` (already a dependency) and existing project modules only.
- Match existing code style: doc-comment blocks above class/function declarations explaining *why*, not just *what* (see any file in `src/world/`, `src/player/PlayerController.ts` for the house style).
- `'reflective'` and `'flow-refractive'` variants must remain fully functional and selectable — this is purely additive, no removals.
- Every task must leave `npx tsc --noEmit -p tsconfig.json` at the established baseline of 136 pre-existing errors (no new ones) and `npx vitest run` at the established baseline of 2203/2211 passing (same 8 pre-existing unrelated failures: `talentSystem.test.ts` ×3, `enemyLoader.test.ts` ×3, `towerGenerator.test.ts` ×2).
- Dev server for live verification: `npm run dev -- --host 127.0.0.1 --port 5175` (start it if not already running; check with `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5175/` first — 200 means it's already up).

---

### Task 1: Add the `'stylized'` water variant

**Files:**
- Modify: `src/world/WaterVariants.ts` — widen `WaterVariantKind`
- Modify: `src/scene/WaterLabScene.ts:52` (`_waterVariant` field default), `:74-89` (`_buildWater()`), `:196-213` (`update()`'s uniform-tick branch)
- Test: `tests/scene/WaterLabScene.test.ts` (new file)

**Interfaces:**
- Consumes: `createWaterMaterial()` from `@/world/WaterMaterial` (existing, signature `(): THREE.ShaderMaterial`, unchanged in this task).
- Produces: `WaterVariantKind = 'stylized' | 'reflective' | 'flow-refractive'` (widened union — Task 4 consumes this exact type name). `WaterLabScene`'s default `_waterVariant` is now `'stylized'`.

- [ ] **Step 1: Widen the `WaterVariantKind` union**

In `src/world/WaterVariants.ts`, change:

```ts
export type WaterVariantKind = 'reflective' | 'flow-refractive';
```

to:

```ts
export type WaterVariantKind = 'stylized' | 'reflective' | 'flow-refractive';
```

No other change needed in this file — `'stylized'` doesn't need its own factory function here since it reuses `createWaterMaterial()` from a different module (`@/world/WaterMaterial`), applied directly to a plane in `WaterLabScene._buildWater()` (Step 3 below).

- [ ] **Step 2: Write the failing test for the new default + variant switching**

Create `tests/scene/WaterLabScene.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { ParticleSystem } from '@/rendering/ParticleSystem';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { WaterLabScene } from '@/scene/WaterLabScene';

describe('WaterLabScene water variant', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let particles: ParticleSystem;
  let lab: WaterLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    particles = new ParticleSystem(scene);
    lab = new WaterLabScene(scene, physics, player, particles);
  });

  it('defaults to the stylized (see-through) variant on enter()', () => {
    lab.enter();
    const waterMesh = scene.children.find(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && (c.material as THREE.ShaderMaterial).uniforms?.uTime !== undefined,
    );
    expect(waterMesh).toBeDefined();
    expect((waterMesh!.material as THREE.ShaderMaterial).transparent).toBe(true);
  });

  it('switches to reflective and flow-refractive variants without throwing', () => {
    expect(() => lab.setWaterVariant('reflective')).not.toThrow();
    expect(() => lab.setWaterVariant('flow-refractive')).not.toThrow();
    expect(() => lab.setWaterVariant('stylized')).not.toThrow();
    lab.exit();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/scene/WaterLabScene.test.ts`
Expected: FAIL — the first test fails because `_buildWater()` still defaults to `'reflective'` (no ShaderMaterial with a `uTime` uniform will be found; `createReflectiveWater`'s `Water` material uses a `time` uniform, not `uTime`).

- [ ] **Step 4: Implement — change the default variant and wire `'stylized'` into `_buildWater()`**

In `src/scene/WaterLabScene.ts`, add the import (near the top, alongside the existing `WaterVariants` import):

```ts
import { createWaterMaterial } from '@/world/WaterMaterial';
```

Change the field default:

```ts
private _waterVariant: WaterVariantKind = 'stylized';
```

Replace `_buildWater()`'s variant-selection logic:

```ts
private _buildWater(): void {
  if (this._waterObject) {
    this._scene.remove(this._waterObject);
    const obj = this._waterObject as unknown as { geometry: THREE.BufferGeometry; material: THREE.Material };
    obj.geometry.dispose();
    obj.material.dispose();
  }
  const poolHalfExtent = this._tiers[1]!.halfExtent;
  const size = poolHalfExtent * 2;
  if (this._waterVariant === 'stylized') {
    const geo = new THREE.PlaneGeometry(size, size);
    this._waterObject = new THREE.Mesh(geo, createWaterMaterial());
  } else {
    this._waterObject = this._waterVariant === 'reflective'
      ? createReflectiveWater(size)
      : createFlowRefractiveWater(size);
  }
  this._waterObject.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
  this._waterObject.rotation.x = -Math.PI / 2;
  this._scene.add(this._waterObject);
}
```

Update the doc-comment above the `setWaterVariant` default-mention (find the line referencing `'reflective' (Water.js) starts active` — none currently exists in this file's comments at the class/field level beyond what's shown; if you find one during implementation, update it to mention `'stylized'` as the default instead of `'reflective'`).

Update `update()`'s uniform-tick branch — currently:

```ts
if (this._waterObject && this._waterVariant === 'reflective') {
  (this._waterObject as Water).material.uniforms.time!.value += dt;
}
```

to also tick the stylized shader's `uTime` uniform:

```ts
if (this._waterObject && this._waterVariant === 'reflective') {
  (this._waterObject as Water).material.uniforms.time!.value += dt;
} else if (this._waterObject && this._waterVariant === 'stylized') {
  ((this._waterObject as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uTime!.value += dt;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/scene/WaterLabScene.test.ts`
Expected: PASS (both tests)

- [ ] **Step 6: Run the full targeted regression check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l` — expect `136` (unchanged baseline).
Run: `npx vitest run` — expect `2203 passed` (same baseline, same 8 pre-existing failures).

- [ ] **Step 7: Commit**

```bash
git add src/world/WaterVariants.ts src/scene/WaterLabScene.ts tests/scene/WaterLabScene.test.ts
git commit -m "feat(waterlab): add stylized see-through water variant as default

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Tune the stylized shader for underwater player visibility

**Files:**
- Modify: `src/world/WaterMaterial.ts:37-58` (fragment shader body)
- Test: `tests/world/WaterMaterial.test.ts` (extend existing file)

**Interfaces:**
- Consumes: nothing new — same `createWaterMaterial(): THREE.ShaderMaterial` signature, unchanged.
- Produces: nothing new for later tasks — this is a leaf visual-tuning task. The function signature and uniform name (`uTime`) that Task 1 already depends on are unchanged.

- [ ] **Step 1: Write the failing test for the lowered alpha**

In `tests/world/WaterMaterial.test.ts`, add a new test inside the existing `describe('createWaterMaterial', ...)` block:

```ts
  it('uses a fragment shader alpha low enough for underwater visibility (<= 0.55)', () => {
    const mat = createWaterMaterial();
    // The fragment shader writes gl_FragColor's alpha as a literal float
    // (e.g. "gl_FragColor = vec4(color, 0.45);"). Extract that literal and
    // assert it's been tuned down from the old opaque-ish 0.78.
    const match = mat.fragmentShader.match(/gl_FragColor\s*=\s*vec4\([^,]+,\s*([\d.]+)\s*\)/);
    expect(match).not.toBeNull();
    const alpha = parseFloat(match![1]!);
    expect(alpha).toBeLessThanOrEqual(0.55);
    expect(alpha).toBeGreaterThan(0); // still visible as water, not fully invisible
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/world/WaterMaterial.test.ts`
Expected: FAIL — current alpha literal is `0.78`, which is `> 0.55`.

- [ ] **Step 3: Implement — lower alpha and soften saturation in the fragment shader**

In `src/world/WaterMaterial.ts`, replace the fragment shader's color/alpha lines. Current:

```glsl
        vec3 deep    = vec3(0.075, 0.190, 0.360);
        vec3 shimmer = vec3(0.220, 0.440, 0.560);

        float shimmerPattern =
          sin(vWorldPosition.x * 0.6 + uTime * 1.6) *
          sin(vWorldPosition.z * 0.6 - uTime * 1.3);
        float t = smoothstep(-1.0, 1.0, shimmerPattern);
        vec3 color = mix(deep, shimmer, t * 0.5 + 0.15);

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0);
        color += vec3(0.35, 0.50, 0.60) * pow(rim, 3.0) * 0.20;

        gl_FragColor = vec4(color, 0.78);
```

Replace with (lower-saturation deep/shimmer tones, unchanged shimmer/fresnel math, alpha lowered to 0.45 so the player reads clearly through the surface):

```glsl
        vec3 deep    = vec3(0.100, 0.210, 0.340);
        vec3 shimmer = vec3(0.260, 0.430, 0.520);

        float shimmerPattern =
          sin(vWorldPosition.x * 0.6 + uTime * 1.6) *
          sin(vWorldPosition.z * 0.6 - uTime * 1.3);
        float t = smoothstep(-1.0, 1.0, shimmerPattern);
        vec3 color = mix(deep, shimmer, t * 0.5 + 0.15);

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0);
        color += vec3(0.35, 0.50, 0.60) * pow(rim, 3.0) * 0.20;

        gl_FragColor = vec4(color, 0.45);
```

Also update the file's top doc-comment (currently describes it as "Link's Awakening-remake-inspired look") to note the lowered alpha's purpose — append a sentence:

```
 * Alpha is intentionally low (0.45) so the player and basin floor read
 * clearly through the surface from any camera angle (OOT/SM64-style
 * see-through water), not just from directly above.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/world/WaterMaterial.test.ts`
Expected: PASS (all tests in the file, including the pre-existing two)

- [ ] **Step 5: Run the full targeted regression check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l` — expect `136`.
Run: `npx vitest run` — expect `2203 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/world/WaterMaterial.ts tests/world/WaterMaterial.test.ts
git commit -m "fix(water): lower stylized water alpha for underwater player visibility

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Submerged player glow light

**Files:**
- Modify: `src/player/PlayerController.ts:260-291` (`_submersionRoot`/`_submersionBaseY` fields and `setSubmersion()`)
- Test: `tests/player/PlayerControllerSubmersion.test.ts` (extend existing file)

**Interfaces:**
- Consumes: nothing new — reuses the existing rig-resolution logic already in `setSubmersion()` (`this._creatureRig?.root ?? this._charController?.scene ?? this._princessInstance?.root ?? null`).
- Produces: a new private field `_submergedGlow: THREE.PointLight | null` on `PlayerController`, accessible in tests via `(player as any)._submergedGlow`. No public API change — `setSubmersion(depthFraction: number): void` keeps its exact existing signature.

- [ ] **Step 1: Write the failing test for the glow light**

In `tests/player/PlayerControllerSubmersion.test.ts`, add a new test inside the existing `describe('PlayerController.setSubmersion', ...)` block:

```ts
  it('adds a submerged-only PointLight as a child of the active rig, fading in with depth', () => {
    player.setSubmersion(0);
    const rigRoot = (player as any)._creatureRig.root as THREE.Object3D;
    const glow = (player as any)._submergedGlow as THREE.PointLight;
    expect(glow).toBeInstanceOf(THREE.PointLight);
    expect(rigRoot.children).toContain(glow);
    expect(glow.intensity).toBe(0); // dry — no glow

    player.setSubmersion(1.0);
    expect(glow.intensity).toBeGreaterThan(0);

    player.setSubmersion(0); // reset for other tests
    expect(glow.intensity).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/player/PlayerControllerSubmersion.test.ts`
Expected: FAIL — `_submergedGlow` is `undefined`, not a `THREE.PointLight`.

- [ ] **Step 3: Implement — add and drive the glow light in `setSubmersion()`**

In `src/player/PlayerController.ts`, add the field declaration next to the existing submersion-tracking fields (near line 262-263):

```ts
  /** Small warm/white point light parented to the active visual rig,
   *  visible only while submerged (intensity driven by depthFraction in
   *  setSubmersion()). Keeps the player legible against dark/busy water
   *  in any camera angle, independent of the water shader's own alpha.
   *  Recreated whenever the active rig changes (old rig + its children,
   *  including any previous glow light, are removed/disposed by the
   *  relevant applyDNA/applyAssetModel/applyPrincess call). */
  private _submergedGlow: THREE.PointLight | null = null;

  /** Max intensity of `_submergedGlow` at full (1.0) depthFraction. */
  private static readonly SUBMERGED_GLOW_MAX_INTENSITY = 0.6;
```

Replace the body of `setSubmersion()` — current:

```ts
  setSubmersion(depthFraction: number): void {
    const active: THREE.Object3D | null =
      this._creatureRig?.root ?? this._charController?.scene ?? this._princessInstance?.root ?? null;
    if (!active) return;

    // Rig swapped since last call (or first call) — capture its resting Y.
    if (active !== this._submersionRoot) {
      this._submersionRoot = active;
      this._submersionBaseY = active.position.y;
    }

    active.position.y = this._submersionBaseY - depthFraction * PlayerController.SUBMERSION_MAX_OFFSET;
  }
```

with:

```ts
  setSubmersion(depthFraction: number): void {
    const active: THREE.Object3D | null =
      this._creatureRig?.root ?? this._charController?.scene ?? this._princessInstance?.root ?? null;
    if (!active) return;

    // Rig swapped since last call (or first call) — capture its resting Y
    // and (re)create the submerged glow light as a child of the new rig.
    if (active !== this._submersionRoot) {
      this._submersionRoot = active;
      this._submersionBaseY = active.position.y;
      this._submergedGlow = new THREE.PointLight(0xfff2e0, 0, 2.2, 2);
      active.add(this._submergedGlow);
    }

    active.position.y = this._submersionBaseY - depthFraction * PlayerController.SUBMERSION_MAX_OFFSET;
    if (this._submergedGlow) {
      this._submergedGlow.intensity =
        Math.max(0, Math.min(1, depthFraction)) * PlayerController.SUBMERGED_GLOW_MAX_INTENSITY;
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/player/PlayerControllerSubmersion.test.ts`
Expected: PASS (all tests in the file, including the pre-existing two)

- [ ] **Step 5: Run the full targeted regression check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l` — expect `136`.
Run: `npx vitest run` — expect `2203 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/player/PlayerController.ts tests/player/PlayerControllerSubmersion.test.ts
git commit -m "feat(player): add submerged-only glow light for underwater visibility

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: 3-way water variant selector in Dev Sandbox UI

**Files:**
- Modify: `src/ui/DevSandbox.ts:66-68` (`onSetWaterVariant` type), `:684-728` (A/B toggle → 3-way selector)
- Modify: `src/main.ts:1458` (`onSetWaterVariant` callback wiring — verify the type still matches; no logic change expected)
- Test: `tests/ui/DevSandbox.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `WaterVariantKind` type from `@/world/WaterVariants` (produced in Task 1: `'stylized' | 'reflective' | 'flow-refractive'`).
- Produces: `DevSandboxOptions.onSetWaterVariant: (kind: WaterVariantKind) => void` (widened from the old 2-value union). Three new/changed DOM buttons with `data-ds-action` attributes: `data-ds-action="water-variant-stylized"`, `data-ds-action="water-variant-reflective"`, `data-ds-action="water-variant-flow"` — later tasks/tests should query these exact attribute values, not button text.

- [ ] **Step 1: Write the failing test for the 3-way selector**

In `tests/ui/DevSandbox.test.ts`, add a new test (after the existing tests, inside the top-level `describe` block):

```ts
  it('offers a 3-way water variant selector defaulting to stylized', async () => {
    const onSetWaterVariant = vi.fn();
    const { DevSandbox } = await import('@/ui/DevSandbox');
    const sandbox = new DevSandbox({
      onGrantSpell: () => {},
      onSetActiveSpell: () => {},
      onSpawnEnemies: () => {},
      onKillAllEnemies: () => {},
      onGrantAllSpells: () => {},
      getProcGenStats: () => ({ text: '', roomIds: [] }),
      onEnterRoom: () => {},
      onReturnToArena: () => {},
      onEnterOverworld: () => {},
      onEnterWaterLab: () => {},
      onSetWaterVariant,
      onSpawnCreature: () => {},
      onSpawnNPC: () => {},
      onClose: () => {},
    }) as any;
    void sandbox;

    const stylizedBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-stylized"]')!;
    const reflectiveBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-reflective"]')!;
    const flowBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-flow"]')!;
    expect(stylizedBtn).toBeTruthy();
    expect(reflectiveBtn).toBeTruthy();
    expect(flowBtn).toBeTruthy();
    // Stylized starts active (matches WaterLabScene's new default), no
    // click needed to select it, but clicking the others should call
    // through with the right variant name.
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(true);

    reflectiveBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('reflective');
    expect(reflectiveBtn.classList.contains('ds-btn--accent')).toBe(true);
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(false);

    flowBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('flow-refractive');
    expect(flowBtn.classList.contains('ds-btn--accent')).toBe(true);

    stylizedBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('stylized');
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/DevSandbox.test.ts`
Expected: FAIL — `data-ds-action="water-variant-stylized"` doesn't exist yet (current buttons have no `data-ds-action` attribute at all for this toggle).

- [ ] **Step 3: Implement — widen the type and rebuild the toggle as 3-way**

In `src/ui/DevSandbox.ts`, change the options type (around line 66-68):

```ts
  /** Switch the Water Lab's water-surface visual ('stylized' = translucent
   *  custom shader, player visible underwater; 'reflective' = Water.js
   *  planar reflection; 'flow-refractive' = Water2.js flow-map refraction). */
  onSetWaterVariant: (kind: import('@/world/WaterVariants').WaterVariantKind) => void;
```

Replace the A/B toggle block (currently lines ~684-706, the `waterVariantReflectiveBtn`/`waterVariantFlowBtn` section) with a 3-way version:

```ts
    // Water Lab visual selector — 'stylized' (translucent custom shader)
    // starts active, matching WaterLabScene's default _waterVariant. Lets
    // 'reflective' (Water.js) and 'flow-refractive' (Water2.js) remain
    // selectable for comparison even though they hide the player underwater.
    const waterVariantStylizedBtn = document.createElement('button');
    waterVariantStylizedBtn.className = 'ds-btn ds-btn--accent';
    waterVariantStylizedBtn.textContent = '💧 Stylized';
    waterVariantStylizedBtn.style.marginTop = '4px';
    waterVariantStylizedBtn.dataset.dsAction = 'water-variant-stylized';

    const waterVariantReflectiveBtn = document.createElement('button');
    waterVariantReflectiveBtn.className = 'ds-btn';
    waterVariantReflectiveBtn.textContent = '🪞 Reflective';
    waterVariantReflectiveBtn.style.marginTop = '4px';
    waterVariantReflectiveBtn.dataset.dsAction = 'water-variant-reflective';

    const waterVariantFlowBtn = document.createElement('button');
    waterVariantFlowBtn.className = 'ds-btn';
    waterVariantFlowBtn.textContent = '🌊 Flow';
    waterVariantFlowBtn.style.marginTop = '4px';
    waterVariantFlowBtn.dataset.dsAction = 'water-variant-flow';

    const setActiveWaterVariantBtn = (kind: import('@/world/WaterVariants').WaterVariantKind) => {
      waterVariantStylizedBtn.classList.toggle('ds-btn--accent', kind === 'stylized');
      waterVariantReflectiveBtn.classList.toggle('ds-btn--accent', kind === 'reflective');
      waterVariantFlowBtn.classList.toggle('ds-btn--accent', kind === 'flow-refractive');
    };
    waterVariantStylizedBtn.onclick = () => {
      this._opts.onSetWaterVariant('stylized');
      setActiveWaterVariantBtn('stylized');
    };
    waterVariantReflectiveBtn.onclick = () => {
      this._opts.onSetWaterVariant('reflective');
      setActiveWaterVariantBtn('reflective');
    };
    waterVariantFlowBtn.onclick = () => {
      this._opts.onSetWaterVariant('flow-refractive');
      setActiveWaterVariantBtn('flow-refractive');
    };
```

Update the `genSec.append(...)` call (originally around line 728) to include the new button and keep the other two:

```ts
    genSec.append(genTitle, typeRow, seedRow, runBtn, overworldBtn, waterLabBtn, waterVariantStylizedBtn, waterVariantReflectiveBtn, waterVariantFlowBtn);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/DevSandbox.test.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Verify `main.ts`'s wiring still type-checks**

`src/main.ts:1458` currently reads:

```ts
      onSetWaterVariant: (kind) => waterLab?.setWaterVariant(kind),
```

This is a direct pass-through with an inferred parameter type from `DevSandboxOptions['onSetWaterVariant']`, so it should keep type-checking correctly against the widened `WaterVariantKind` without any edit — `WaterLabScene.setWaterVariant(kind: WaterVariantKind)` (from Task 1) already accepts all three values. No code change expected here; this step is a verification-only check.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -n "main.ts"` and confirm the only `main.ts` lines reported are the 6 pre-existing baseline ones (`CreativeModeContext`, `assetLoader`, `openQuestJournal`, `_sl`, `player`, `particles` — see Global Constraints baseline). If a new error appears on line 1458, add an explicit type annotation there:

```ts
      onSetWaterVariant: (kind: import('@/world/WaterVariants').WaterVariantKind) => waterLab?.setWaterVariant(kind),
```

- [ ] **Step 6: Run the full targeted regression check**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l` — expect `136`.
Run: `npx vitest run` — expect `2203 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DevSandbox.ts src/main.ts tests/ui/DevSandbox.test.ts
git commit -m "feat(dev-sandbox): extend water variant toggle to 3-way (stylized default)

Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Live verification in the browser

**Files:** none (verification only — no code changes in this task)

**Interfaces:**
- Consumes: the fully assembled feature from Tasks 1-4 (`WaterLabScene` defaulting to `'stylized'`, tuned `WaterMaterial.ts` alpha, `PlayerController`'s submerged glow, the 3-way Dev Sandbox selector).
- Produces: nothing for later tasks — this is the final acceptance gate for the whole plan.

- [ ] **Step 1: Ensure the dev server is running**

Run: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5175/`

If it prints `200`, the server's already up — skip to Step 2. Otherwise start it in the background:

Run (background, do not wait for it to exit): `npm run dev -- --host 127.0.0.1 --port 5175`

Wait ~5 seconds, then re-run the `curl` check above and confirm `200` before continuing.

- [ ] **Step 2: Boot straight into Water Lab via the query-param dev-room handoff**

Open (or navigate an already-open browser tab to): `http://127.0.0.1:5175/index.html?devroom=water-lab`

Wait ~2 seconds for the boot handoff to complete (it clears its own query param via `history.replaceState` once done — the URL settling back to `/index.html` with no query string is expected and confirms the handoff ran).

- [ ] **Step 3: Confirm the stylized variant is active and the player is visible underwater**

In the page's JS console (or via the `window.__game` debug API if driving this from an automated browser tool), run:

```js
window.__game.teleportPlayer(0, 2.0, 0);
await new Promise(r => setTimeout(r, 2500));
console.log('mode:', window.__game.getGameMode(), 'swimming:', window.__game.isPlayerSwimming(), 'pos:', window.__game.getPlayerPos());
```

Expected: `mode: 'waterlab'`, `swimming: true` or the player resting at a submerged Y (matching prior verified behavior), and the pool visibly translucent (not opaque/mirror-like) in the rendered frame — take a screenshot if using an automated browser tool and visually confirm the princess model is clearly visible through the water surface.

- [ ] **Step 4: Check both camera modes**

If the game exposes a camera-mode toggle (isometric vs. WoW-style), switch to each while the player is submerged and visually confirm (via screenshot or direct observation) that the player model remains clearly visible in both — this was the specific complaint driving this whole plan, so both modes must be checked, not just one.

- [ ] **Step 5: Spot-check the other two variants still work**

Open the Dev Sandbox panel, click "🪞 Reflective" — confirm the water surface visibly changes to the opaque mirror-style look (no regression — this is expected/intentional for that variant, not a bug). Click "🌊 Flow" — confirm it changes again to the flow-refractive look. Click "💧 Stylized" to return to the default before finishing.

- [ ] **Step 6: Final full regression run**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l` — expect `136`.
Run: `npx vitest run 2>&1 | tail -5` — expect `2203 passed` (8 pre-existing unrelated failures, same as documented in Global Constraints).

- [ ] **Step 7: Report results**

No commit in this task (verification-only). Summarize what was confirmed (or any deviations found) back to the user/plan tracker before considering the plan complete.
