# Art Direction — Procedural Style Guide

## Overview

From Phase 1 through Phase 7, **all visuals are generated in code**. No external texture files, no 3D model imports. This is a feature, not a constraint — the procedural aesthetic creates a consistent, stylized look that reads clearly at an isometric distance.

Phase 8 replaces procedural greybox with authored `.gltf` assets. This document governs the procedural era and will inform the Phase 8 asset brief.

---

## Visual Identity

**Target aesthetic:** "Arcane greybox with intent." The world looks like a technical demo that knows it's beautiful.

Key visual qualities:
- Strong silhouette reads — every character and enemy is distinct at a glance.
- Consistent glow language — magic is always additive-blended, always emissive.
- Noise-based surfaces that suggest material without using photographs.
- Toon-adjacent rendering — hard specular if any, flat lit areas broken by emissive details.

**Reference touchstones (mood, not literal):** *Tron: Legacy* environments, *Monument Valley* geometry, early *Minecraft* modded shaders, lo-fi synthwave aesthetics.

---

## Geometry Conventions

### Characters (Player & Enemies)

All characters are built from compound Three.js primitives. No custom mesh files.

| Part | Geometry | Notes |
|---|---|---|
| Body | `CapsuleGeometry` | Main collision volume too — physics body matches visual |
| Head | `SphereGeometry` | Slightly floating above capsule |
| Limbs | `CylinderGeometry` | Attached via parenting; animated by rotating around joint pivot |
| Weapons (melee arc) | `TorusGeometry` (partial arc) | Generated at attack time, destroyed after animation |

**Scale reference:** Player capsule is 1.8 units tall. Design all spaces around this.

### Environment

| Element | Geometry | Notes |
|---|---|---|
| Floor tile | `PlaneGeometry` | Noise texture generated in fragment shader |
| Wall segment | `BoxGeometry` | Slightly oversized to prevent z-fighting |
| Doorway arch | Composite boxes | Two vertical + one horizontal box |
| Torch | `CylinderGeometry` + `SphereGeometry` | Sphere emits point light |
| Bookcase | Compound boxes | Grid of small box "books" as children |
| Tree (exterior) | `CylinderGeometry` (trunk) + `SphereGeometry` (canopy) | Canopy uses vertex displacement |
| Rock | `DodecahedronGeometry` | Random `.detail` value for LOD-like variation |

---

## Shader Conventions

### Material Categories

| Category | Three.js Material | Usage |
|---|---|---|
| Structural geometry | `MeshLambertMaterial` | Walls, floors, static objects |
| Characters | `MeshToonMaterial` | Player and enemies — flat shaded with optional emissive |
| Procedural textures | `ShaderMaterial` | Custom GLSL for noise patterns |
| Magic / VFX | `ShaderMaterial` + `AdditiveBlending` | All spell effects, auras, particles |
| Post-processing | `UnrealBloomPass` | Applied globally; spell materials emit HDR values to feed it |

### Color Palette

All colors are defined as named constants in `src/shaders/palette.ts`:

```typescript
export const PALETTE = {
  // Environment
  STONE_DARK:     0x2a2a3a,
  STONE_MID:      0x3d3d52,
  WOOD_BROWN:     0x4a3728,
  TORCH_WARM:     0xff8833,

  // Player
  PLAYER_BODY:    0x8899aa,
  PLAYER_GLOW:    0x44ddff,

  // Magic (spells — HDR-range values fed to bloom)
  SPELL_BOLT:     0x88ccff,
  SPELL_FIRE:     0xff6600,
  SPELL_WARD:     0xaaffdd,
  SPELL_CHAIN:    0xffff44,
  SPELL_GRAVITY:  0x660099,
  SPELL_NOVA:     0xffffff,

  // UI
  HP_BAR:         0xff4444,
  MP_BAR:         0x4488ff,
  RECRUIT_AURA:   0x33ffaa,
};
```

Do not hardcode hex color values in shader or material code — always reference this palette.

### Noise Textures

Noise textures are generated in GLSL. The standard pattern:

```glsl
// Classic value noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    return mix(
        mix(hash(i), hash(i + vec2(1,0)), f.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
        f.y
    );
}
```

**Usage examples:**
- **Stone floor:** `mix(STONE_DARK, STONE_MID, noise(uv * 8.0))`
- **Dirt exterior:** `mix(#3d2b1f, #5a4030, noise(uv * 4.0) + noise(uv * 12.0) * 0.3)`

### Emissive Rune Markings

Runes on enemies (Runic Sentinel, recruited minions) are generated via Canvas API into a `CanvasTexture` at load time. This avoids shipping PNG assets while still allowing authored marks.

```typescript
function generateRuneTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // ... draw procedural sigils using ctx.arc, ctx.lineTo with seeded randomness
  return new THREE.CanvasTexture(canvas);
}
```

---

## Lighting Setup

Each scene uses a **three-point lighting rig** as a baseline:

| Light | Type | Intensity | Notes |
|---|---|---|---|
| Ambient | `AmbientLight` | 0.3 | Fills shadows, flat baseline |
| Key | `DirectionalLight` | 1.0 | High angle, slightly warm (isometric "sun") |
| Torch(es) | `PointLight` per torch | 0.8 | Warm orange, radius 6 units, flicker uniform |

Shadows: `DirectionalLight.castShadow = true` with a `shadow.mapSize` of 1024x1024 (balance quality vs. performance).

---

## Particle Systems

All particles use Three.js `Points` with a custom `ShaderMaterial`:
- Positions stored in `BufferAttribute` — updated each frame in the vertex shader, not on the CPU.
- Alpha fading over lifetime using a `uTime` uniform.
- Gravity term in vertex shader (not physics engine) for performance.

Maximum simultaneous particle systems: **8**. Oldest is culled when limit is exceeded.

---

## Phase 8 Asset Brief (Forward Reference)

When authored assets replace procedural ones:
- Target resolution: 1024px textures, 2k for the protagonist and boss.
- Poly budget: 2k–5k tris per character, 500–1k tris per environment piece.
- Animations: Idle, Walk, Attack (x2), Hurt, Die. Delivered as `.gltf` with embedded armature.
- Style: Should match the established procedural palette. Clean, slightly stylized, not photorealistic.
- Shaders: Maintain the `UnrealBloomPass` pipeline — authored materials should still use emissive channels for magic elements.

---

## Open Questions

- [ ] Should the player character have a visible gender/design differentiation, or remain as a neutral capsule until Phase 8?
- [ ] Is `MeshToonMaterial` the right call for characters, or does a custom cel-shader give more control?
- [ ] Confirm bloom threshold — too low and everything glows, too high and spells lose impact.
