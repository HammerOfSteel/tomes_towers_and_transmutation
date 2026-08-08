# Water Lab: See-Through Swimmable Water

**Date:** 2026-08-08
**Status:** Approved for planning

## Problem

Water Lab lets the player swim and dive, but the player becomes invisible the
moment they're underwater — in both isometric and WoW camera modes. This
breaks the intended Zelda: OOT / Super Mario 64-style feel, where the player
model stays clearly visible beneath the water surface at all times.

## Root Cause

Water Lab's two selectable water-surface visuals — `createReflectiveWater()`
(three.js's official `Water.js` example object) and `createFlowRefractiveWater()`
(`Water2.js`) — are both **opaque, mirror-style surfaces**. They render a
planar reflection/refraction and a baked-in `waterColor` tint, but neither
renders anything beneath the surface. This isn't a transparency/tuning bug —
it's architecturally impossible for the player to be visible through either
of these materials.

By contrast, `src/world/WaterMaterial.ts` (`createWaterMaterial()`) is an
existing, unrelated custom shader already used for the overworld's water
tiles: a simple alpha-blended (`transparent: true`, alpha ≈ 0.78), procedural
color/fresnel plane with no reflection pass. This is much closer to how
OOT/SM64 actually render water — a cheap translucent tinted surface — but
Water Lab never uses it; it only offers the two opaque variants.

## Design

### 1. New default water variant: `'stylized'`

Extend `WaterVariantKind` (`src/world/WaterVariants.ts` is the natural home,
or keep the type where it's currently declared) from:

```ts
export type WaterVariantKind = 'reflective' | 'flow-refractive';
```

to:

```ts
export type WaterVariantKind = 'stylized' | 'reflective' | 'flow-refractive';
```

`'stylized'` is backed by the existing `createWaterMaterial()` (imported from
`@/world/WaterMaterial`), applied to a plane the same way the other two
variants are (same size/position/rotation logic in
`WaterLabScene._buildWater()`).

`WaterLabScene`'s default `_waterVariant` changes from `'reflective'` to
`'stylized'`. The other two variants remain fully intact and selectable —
this is additive, not a removal.

### 2. Shader tuning (`src/world/WaterMaterial.ts`)

Adjust the fragment shader so the player reads clearly through the surface
at typical basin depths (0.3–5.0 WU below surface, per `WaterLab.ts` tiers):

- Lower the base alpha from `0.78` to roughly `0.45` (exact value tuned
  live during implementation, not hard-locked in the spec).
- Reduce the deep/shimmer color saturation slightly so the tint doesn't
  wash out the character silhouette.
- Keep the existing fresnel rim highlight (`pow(rim, 3.0) * 0.20` term) —
  it's the "there's a surface here" cue and doesn't meaningfully obstruct
  visibility since it's edge-weighted, not uniform.

This change affects the overworld's water tiles too (they share the same
factory function) — expected and desired, since the same visibility problem
would apply there once overworld swimming is exercised. No separate
overworld-specific path is introduced.

### 3. Submerged player highlight

Independent of the water shader, add a small warm/white `THREE.PointLight`
parented to the player's active visual rig root (the same rig resolution
`setSubmersion()` already does: `_creatureRig?.root ?? _charController?.scene
?? _princessInstance?.root`), to keep the character legible against dark or
busy water backgrounds regardless of camera angle or the tuned shader's
exact alpha.

- Created lazily, once, alongside the rig (or on first submersion) —
  not recreated every frame.
- Intensity driven by the existing `depthFraction` passed into
  `setSubmersion(depthFraction)` and/or `isSwimming` — off at `depthFraction
  ≈ 0` (dry), ramping to a subtle fixed intensity once genuinely submerged.
  Exact curve/intensity tuned live, not hard-locked here.
- Small effective radius — meant to brighten the character and their
  immediate surroundings, not to light up the whole basin.
- Cleaned up in `PlayerController`'s existing rig-swap/dispose paths so it
  doesn't leak when the rig changes (e.g. princess swap) or the controller
  is torn down.

### 4. UI: 3-way water variant selector

`src/ui/DevSandbox.ts`'s existing 2-button A/B toggle
(`waterVariantReflectiveBtn` / `waterVariantFlowBtn`) becomes a 3-way
selector, adding a third button for `'stylized'` (active by default, matching
the new `WaterLabScene` default). `onSetWaterVariant`'s type signature in
`main.ts` and `DevSandbox.ts` widens from `'reflective' | 'flow-refractive'`
to the full `WaterVariantKind` union.

### 5. Verification

- `npx tsc --noEmit` — no new errors vs. the established baseline.
- `npx vitest run` — no regressions vs. the established baseline
  (2203/2211 passing, 8 known pre-existing unrelated failures).
- Live browser verification (via the existing dev-room boot handoff): dive
  underwater in Water Lab, confirm the player model is clearly visible in
  both isometric and WoW camera modes, with the `'stylized'` variant active
  by default. Spot-check the `'reflective'`/`'flow-refractive'` variants
  still work (opaque-surface look unchanged, just no longer the default).

## Out of Scope

- Depth-texture-based real underwater rendering (per-pixel scene-depth-aware
  tinting/fog) — explicitly deferred; the simple tuned transparent shader is
  the agreed-upon approach for now.
- Any change to swim/dive physics, movement, or the tier-collider geometry
  (already fixed in a prior session).
- Any change to the Overworld/Water Lab dev-room boot handoff (already fixed
  in a prior session).
