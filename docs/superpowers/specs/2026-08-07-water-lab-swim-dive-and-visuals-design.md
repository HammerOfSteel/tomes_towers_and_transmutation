# Water Lab: Swim/Dive Physics & Visual Water (Phase 2A) — Design

**Date:** 2026-08-07
**Status:** Approved

## Problem

The Water Lab dev room (added in a prior phase) lets a player wade and do a
basic buoyant surface-swim, but the water doesn't feel or look like the
target references (Super Mario 64 / Super Mario Galaxy / The Legend of
Zelda: Link's Awakening remake):

- There is no diving — the player floats at a fixed depth below the
  surface and can never descend further.
- The basin is too shallow (deepest tier is only 1.2 world units below the
  surface) to give diving any room even once it exists.
- Entering/leaving water has no splash feedback.
- The water surface itself is a flat custom procedural shader with no
  reflection, refraction, or real wave normal detail.
- There is no visual or environmental change (screen tint, fog) when the
  player is submerged.

## Goals

- Real dive mechanics: hold the jump key to sink, release to float back up,
  with no oxygen/breath limit (free diving, matching the SM64/Zelda feel).
- A deepened basin with genuine room to swim and dive around in.
- Splash VFX when entering/exiting water at speed, using the existing
  particle system.
- Two selectable, higher-fidelity water-surface visuals — three.js's
  `Water` (planar reflection) and `Water2` (flow-map refraction) — with a
  live in-Lab toggle so both can be compared directly.
- An underwater screen effect (color tint + thicker fog) driven by the
  player's dive depth.

## Non-Goals (this phase)

- Porting any of this to the real Overworld's river/lake tiles — that is
  Phase 2B, a separate future spec/plan.
- Oxygen/breath meter or drowning mechanics.
- Underwater combat, items, or creatures.
- Changing the fixed isometric/orbit camera into a first-person or
  underwater-following camera — the underwater effect is triggered by the
  player's own depth, not the camera's position, since the camera routinely
  stays above the water surface in both isometric and WoW modes.
- Reworking `WaterMaterial.ts`, the plain procedural shader `OverworldScene`
  uses — it is untouched in this phase and keeps serving the real world map
  until Phase 2B.

## Architecture Overview

All changes are additive to the existing swim system:

- `PlayerController` already tracks `_swimming` (bool) and eases
  `velocity.y` toward a fixed float depth below the water surface each
  frame it's told `setSwimming(true, waterSurfaceY)`. Diving is added as a
  second branch of that same per-frame gravity-override logic — no new
  state enum. "Diving" is a derived condition (swimming + depth beyond a
  threshold), exposed via a new getter for the underwater effect to read.
- `WaterLabScene` continues to be the sole owner of depth computation
  (`WATER_LAB_SURFACE_Y - playerY`) and continues to drive
  `setSubmersion`/`setSwimming` each frame, exactly as it does today — it
  additionally now detects surface-crossing transitions (for splash VFX)
  and owns the two selectable water-surface meshes.
- The underwater screen effect lives in `main.ts` (composer/fog is
  app-level, not Water-Lab-specific), driven each frame by
  `player.underwaterDepthFraction`, so it requires no changes when this
  system later ports to the Overworld.

## Swim & Dive Mechanics

**File:** `src/player/PlayerController.ts`

New constants alongside the existing swim constants:

```ts
const DIVE_TARGET_DEPTH = 3.0;   // WU below surface the player eases toward while diving
const DIVE_VERTICAL_EASE = 4;    // per-second lerp factor toward the dive target (slower than surfacing)
```

In the existing swim gravity-override branch (`if (this._swimming) { ... }`),
branch further on `input.jump`:

```ts
if (this._swimming) {
  const targetY = input.jump
    ? this._swimSurfaceY - DIVE_TARGET_DEPTH   // holding jump: ease down toward dive depth
    : this._swimSurfaceY - SWIM_FLOAT_DEPTH;   // released: ease up toward surface float depth
  const ease = input.jump ? DIVE_VERTICAL_EASE : SWIM_VERTICAL_EASE;
  const yDelta = targetY - this._pos.y;
  this.velocity.y = lerp(this.velocity.y, yDelta * ease, ease * dt);
}
```

The existing jump-input-consumes-jump-buffer code (`if (this.jumpBufferTimer
> 0 && canJump && !this._swimming)`) already excludes swim mode, so holding
jump while swimming never triggers an on-land jump — it's free to reuse for
diving.

Horizontal movement keeps using the existing `SWIM_SPEED` cap whether the
player is diving or surface-swimming (per the approved decision — one
global underwater speed, no separate dive speed).

**New getter**, alongside the existing `isSwimming` getter:

```ts
/** 0 when swimming at/near the surface, ramping to 1 as the player dives
 *  toward DIVE_TARGET_DEPTH. Used by the underwater screen effect; 0 when
 *  not swimming at all. */
get underwaterDepthFraction(): number {
  if (!this._swimming) return 0;
  const depth = this._swimSurfaceY - this._pos.y;
  return Math.max(0, Math.min(1, depth / DIVE_TARGET_DEPTH));
}
```

No changes to `setSwimming()`'s or `setSubmersion()`'s signatures — both
remain exactly as `WaterLabScene` (and later `OverworldScene`) already call
them.

## Basin Deepening

**File:** `src/levels/WaterLab.ts`

Add a 4th tier, nested inside the existing `deep` tier, giving real vertical
room to dive:

```ts
export interface WaterLabTier {
  name: 'bank' | 'shallow' | 'deep' | 'abyss';
  // ...unchanged fields
}

export function buildWaterLabTiers(): WaterLabTier[] {
  return [
    { name: 'bank',    y: 0,     halfExtent: 11, centerX: 0, centerZ: 0 },
    { name: 'shallow', y: -0.3,  halfExtent: 7,  centerX: 0, centerZ: 0 },
    { name: 'deep',    y: -1.2,  halfExtent: 4,  centerX: 0, centerZ: 0 },
    { name: 'abyss',   y: -5.0,  halfExtent: 2,  centerX: 0, centerZ: 0 },
  ];
}
```

`WaterLabScene`'s tier-mesh/tier-collider loop already iterates
`this._tiers` generically — it needs only a new `TIER_COLORS['abyss']`
entry (`WaterLabScene.ts`'s existing `TIER_COLORS` record). The water
surface mesh's footprint (based on the `shallow` tier's `halfExtent`)
already fully covers all nested deeper tiers, so no change needed there.
`SWIM_DEPTH_THRESHOLD` (currently 0.9, switching wading → full swim) stays
as-is — it governs the wading/swimming boundary, not the dive depth, which
is a separate, deeper threshold implicit in `DIVE_TARGET_DEPTH`.

## Splash VFX

**File:** `src/scene/WaterLabScene.ts`

`update(dt)` already computes `depthBelowSurface` every frame. Track the
previous frame's value, detect a zero-crossing combined with the player's
vertical speed, and fire a one-shot particle burst plus a short-lived
"ripple ring" (a few particles scattered radially) via the existing
`ParticleSystem` API (`emit()` for individual particles, called in a small
loop) — no new VFX system:

```ts
constructor(
  private readonly _scene: THREE.Scene,
  private readonly _physics: PhysicsWorld,
  private readonly _player: PlayerController,
  private readonly _particles: ParticleSystem,
) {}

private _prevDepthBelowSurface = -Infinity;

update(dt: number): void {
  // ...existing uTime/submersion/swimming logic...

  const enteredWater = this._prevDepthBelowSurface <= 0 && depthBelowSurface > 0;
  const exitedWater  = this._prevDepthBelowSurface > 0 && depthBelowSurface <= 0;
  if (enteredWater || exitedWater) {
    this._spawnSplash(this._player.group.position.x, this._player.group.position.z, enteredWater);
  }
  this._prevDepthBelowSurface = depthBelowSurface;
}
```

`_spawnSplash` emits a small burst (8-12 particles, white/pale-blue,
short lifetime, radial velocity plus a bit of upward pop) at
`(x, WATER_LAB_SURFACE_Y, z)` — a smaller burst on exit than on entry.
`WaterLabScene`'s constructor signature changes (adds `_particles`); its
one call site in `main.ts`'s `enterWaterLab()` (`new WaterLabScene(scene,
physics, player)`) is updated to pass the existing module-scope `particles`
instance.

## Dual Water Visuals + A/B Toggle

**New file:** `src/world/WaterVariants.ts`

```ts
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Water2 } from 'three/examples/jsm/objects/Water2.js';

const NORMAL_MAP_URL = '/assets/textures/water/waternormals.jpg';

export type WaterVariantKind = 'reflective' | 'flow-refractive';

/** three.js Water: full planar reflection, tinted by sunDirection/waterColor. */
export function createReflectiveWater(size: number): Water { /* ... */ }

/** three.js Water2: flow-map-driven refraction/normal distortion, no separate
 *  reflection render target — cheaper, different look. */
export function createFlowRefractiveWater(size: number): Water2 { /* ... */ }
```

Both load `NORMAL_MAP_URL` via a shared, lazily-created
`THREE.TextureLoader` (loaded once, `RepeatWrapping` set on both axes so it
tiles across the basin's footprint) — mirrors how other texture loads in
this codebase are structured (single loader, cached result).

**Asset:** fetch three.js's own example texture
(`https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg`,
1024×1024, part of three.js's MIT-licensed example assets — the same
project this repo already depends on) into
`public/assets/textures/water/waternormals.jpg`.

**`WaterLabScene` changes:** replace the single `_waterMaterial`/`_waterMesh`
pair with a small variant-switching setup:

```ts
private _waterVariant: WaterVariantKind = 'reflective';
private _waterObject: THREE.Object3D | null = null; // Water | Water2 | fallback

private _buildWater(): void {
  if (this._waterObject) { this._scene.remove(this._waterObject); /* dispose */ }
  this._waterObject = this._waterVariant === 'reflective'
    ? createReflectiveWater(poolSize)
    : createFlowRefractiveWater(poolSize);
  this._waterObject.position.set(0, WATER_LAB_SURFACE_Y + 0.05, 0);
  this._waterObject.rotation.x = -Math.PI / 2;
  this._scene.add(this._waterObject);
}

setWaterVariant(kind: WaterVariantKind): void {
  if (kind === this._waterVariant) return;
  this._waterVariant = kind;
  this._buildWater();
}
```

`update(dt)` advances whichever variant's own time uniform it exposes
(`Water`/`Water2` both expose a `material.uniforms['time']`).

**Toggle UI:** a small button pair ("🪞 Reflective" / "🌊 Flow") added next
to the existing `waterLabBtn` in `DevSandbox.ts`'s Water Lab controls,
following the same `.ds-btn`/inline-onclick convention already used there
(e.g. the existing `↩ Arena` back button). Calls
`waterLab.setWaterVariant(...)`.

**Known risk:** `Water.js`'s oblique near-plane clip-bias math
(`Water.js`'s `updateTextureMatrix`/render function) is derived for a
perspective projection matrix layout; `CameraRig` uses
`THREE.OrthographicCamera`. The reflection render itself should still work
(three.js's `Water` only needs `camera.matrixWorld`/`projectionMatrix`
generically to compute the mirrored view), but the clip-bias term may not
correctly clip geometry behind the mirror plane, which could show faint
artifacts at the reflection's edges. This will be verified visually once
implemented; if it's a real problem, the fix is tuning/disabling that one
clip-bias term (`clipBias` option), not abandoning the variant.

## Underwater Screen Effect

**Files:** `src/main.ts` (fog + effect wiring), new
`src/rendering/UnderwaterEffect.ts` (the postprocessing `Effect` subclass).

Each frame, after computing `player.underwaterDepthFraction` (0 = dry/at
surface, 1 = fully at dive depth):

- **Fog:** lerp `scene.fog.color`, `.near`, `.far` from their normal values
  (`0x0a0a0f`, 30, 60) toward a closer/bluer set (e.g. `0x0a2a3a`, 2, 14) by
  the fraction, restoring on resurfacing. Plain per-frame lerp in `main.ts`
  — no new module needed for this part.
- **Color grade:** `UnderwaterEffect extends Effect` (from `postprocessing`,
  same library as the existing `BloomEffect`) — a small fragment shader
  that blends a blue-green tint and mild vignette darkening, with its
  `blendMode.opacity.value` set to the current fraction each frame. Added
  into the existing single `EffectPass` alongside `BloomEffect` (no new
  render pass).

```ts
export class UnderwaterEffect extends Effect {
  constructor() {
    super('UnderwaterEffect', /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 tint = vec3(0.05, 0.25, 0.35);
        float vignette = smoothstep(0.9, 0.35, distance(uv, vec2(0.5)));
        vec3 color = mix(inputColor.rgb, tint, 0.35) * mix(1.0, vignette, 0.4);
        outputColor = vec4(color, inputColor.a);
      }
    `);
  }
}
```

`main.ts` creates one `UnderwaterEffect` instance at boot, adds it to the
existing `EffectPass` next to `BloomEffect`, and each frame sets
`underwaterEffect.blendMode.opacity.value = player.underwaterDepthFraction`.

## Testing

- **Unit (vitest):** `PlayerController`'s new dive branch — holding
  `input.jump` while swimming eases `velocity.y` toward
  `waterSurfaceY - DIVE_TARGET_DEPTH` rather than the surface float target;
  releasing it eases back toward the surface target. `underwaterDepthFraction`
  returns 0 when not swimming, ramps 0→1 correctly across the dive range.
- **Unit (vitest):** `WaterLab.ts`'s `buildWaterLabTiers()` returns the new
  4-tier list with the expected `abyss` values.
- **Manual verification (dev room, this is what it's for):** swim to the
  basin, hold Space to dive to the floor, release to float back up; observe
  splash on entry/exit; toggle between the two water variants and visually
  compare; confirm the screen tints/fog thickens while diving and clears
  on resurfacing.
- No new Playwright e2e test is planned for this phase — the existing
  Water Lab e2e coverage (launch handoff, from the prior phase) already
  exercises boot-into-Water-Lab; dive/visual behavior is inherently a
  visual/feel check better done manually in the dev room than asserted via
  DOM/game-state polling.
