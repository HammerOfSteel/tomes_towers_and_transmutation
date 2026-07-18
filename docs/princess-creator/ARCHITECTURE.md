# ARCHITECTURE — Princess Creator

> Standalone Vite entry: `princess-creator.html` → `src/princess-creator/main.ts`.
> Hard rule: **no imports from game runtime** (`src/core`, `src/player`,
> `src/levels`, `src/combat`, …). Allowed deps: `three`, `three/addons`, DOM.

## 1. Module map

```
princess-creator.html         entry page: layout shell + all CSS (no framework)
src/princess-creator/
├── main.ts                   bootstrap: store + stage + ui + loop wiring
├── types.ts                  PrincessDNA + enums + BuildResult/Synth contracts
├── dna.ts                    defaults, clone, validate/migrate, share codes
├── rng.ts                    mulberry32, seeded helpers (int/float/pick/chance)
├── names.ts                  seeded princess name generator
├── randomize.ts              randomDna(archetype), mutateDna(dna, amount)
├── palettes.ts               curated palettes per archetype + apply helpers
├── store.ts                  observable DNA state + undo/redo + dirty flags
├── scene.ts                  Stage: renderer/camera/lights/pedestal/sparkles
├── materials.ts              MaterialKit: shared materials built from dna.colors
├── face.ts                   eye/mouth/blush builders (all eye styles)
├── parts.ts                  part registry + builders + socket attachment
├── animate.ts                Animator: idle/walk + emotes + secondary motion
├── exporter.ts               PNG portrait, GLB (GLTFExporter), .princess.json
├── gallery.ts                localStorage gallery (dna + thumbnail)
├── ui.ts                     DOM panels: tabs, sliders, chips, swatches, wiring
└── synth/
    ├── index.ts              SYNTHS registry (archetype → BodySynthesizer)
    ├── shared.ts             chibi rig scaffold, limb helpers, dress builders
    ├── human.ts              smooth toon body (capsules, sphere head)
    ├── fox.ts                flat-shaded low-poly body (icosa head, snout)
    ├── skeleton.ts           bone-segment body (shaft+knob bones, skull)
    └── slime.ts              MarchingCubes metaball body (per-frame re-blob)
```

Tests: `src/princess-creator/__tests__/*.test.ts` (vitest + jsdom, no WebGL —
synths build pure scene-graph + geometry, render is never required in tests).

## 2. Data flow

```
        UI events (sliders/chips/swatches/buttons)
                        │ set(path, value) / setDna(dna)
                        ▼
                  ┌──────────┐   history push (structural edits)
                  │  store   │──────────────────────────────► undo/redo
                  └──────────┘
                        │ notify(diff)  — coalesced to ≤1/frame
          ┌─────────────┼──────────────────┐
          ▼             ▼                  ▼
   colors-only?   structural change   archetype change
   MaterialKit    dispose old build   swap synth, rebuild,
   retint (no     → synth.build(dna)  reset camera framing
   rebuild)       → parts.attach()
                  → animator.bind()
                        │
                        ▼
              per-frame: animator.update(t, dt) → result.update(t, dt)
                        → stage.render()
```

Rules:
- **DNA is the single source of truth.** No UI state that isn't DNA except:
  active tab, emote button state, camera.
- **Color-only edits retint materials** (`MaterialKit.apply(dna.colors)`);
  they do not rebuild and do not spam history (history-push on release).
- **Structural edits rebuild the whole character** (POC-proven cheap). Rebuild
  is coalesced with `requestAnimationFrame` so slider scrubbing costs ≤1
  rebuild per frame.

## 3. The BodySynthesizer contract

```ts
interface BodySynthesizer {
  readonly archetype: Archetype;
  build(dna: PrincessDNA, kit: MaterialKit): BuildResult;
}

interface BuildResult {
  root: THREE.Group;              // add to stage; origin at floor center
  rig: PrincessRig;               // named joints (see below) for the Animator
  sockets: Sockets;               // named attachment Groups for parts
  update(t: number, dt: number): void;  // archetype secondary motion +
                                        // (slime) per-frame re-blob
  dispose(): void;                // free ALL geometries created by build
}

interface PrincessRig {
  root: THREE.Group;      // bob/bounce target (y = base height)
  torso: THREE.Group;     // breath scale, sway
  neck: THREE.Group;      // head look/tilt
  head: THREE.Object3D;   // head mesh or anchor (slime: tracked anchor)
  shoulders: [THREE.Group, THREE.Group];   // L, R  (rotation joints)
  elbows:    [THREE.Group, THREE.Group];
  hips:      [THREE.Group, THREE.Group];
  knees:     [THREE.Group, THREE.Group];
  baseY: number;          // rest height of root
}

type SocketId = 'headTop' | 'earL' | 'earR' | 'hairBack' | 'face'
              | 'back' | 'tail' | 'handL' | 'handR';
type Sockets = Record<SocketId, THREE.Group>;
```

Conventions:
- **+Z is forward** (face direction), +Y up. Character stands on y=0.
- Every joint `Group` has its **pivot at the anatomical joint** (mesh offset
  inside), so the Animator can rotate joints without knowing geometry.
- Paired sockets (`earL`/`earR`) are **mirrored by the parts module** — a part
  is authored for the left; the right instance gets `scale.x *= -1` +
  mirrored position.
- The **slime synth** owns a `MarchingCubes` field object; its `update()`
  resets and re-adds balls from the *current world positions* of the rig
  joints, which is what makes jelly wobble free. Sockets are plain Groups
  parented to invisible anchor objects that follow the blob (head anchor,
  torso anchor, tail anchor).
- `dispose()` must dispose geometries it created. Materials belong to the
  `MaterialKit` (shared, retintable) and are disposed only on archetype swap.

## 4. MaterialKit

One kit per archetype build, constructed from `dna.colors` + archetype:

| Slot | Human | Fox | Slime | Skeleton |
|---|---|---|---|---|
| `primary` (dress) | smooth standard | flat-shaded | jelly (physical, transmission) | flat-shaded |
| `secondary` (trim/ruffles) | standard | flat white-tip fur | jelly lighter | trim |
| `accent` (sash/bows/cape) | standard | flat | glossy core | trim/cape |
| `skin` | toon skin | fur base | jelly body (same as primary family) | bone |
| `hair` | hair | fur alt | jelly twin-tails (metaball) | — (bone) |
| `eyes` | iris color | dark bead | dark bead w/ highlight | glow (emissive) |
| `metal` | gold, metalness .8–.9 | gold | gold (floats/sinks on blob) | tarnished gold |
| `glow` | — | — | inner-core emissive | eye glow + point lights |

`kit.apply(colors)` retints in place. `kit.dispose()` on archetype swap.
Slime materials: `MeshPhysicalMaterial` transmission .55–.7, ior 1.4,
thickness 2, roughness .1 (POC-proven).

## 5. Animator

```ts
class Animator {
  bind(result: BuildResult, dna: PrincessDNA): void;
  setMode(mode: 'idle' | 'walk'): void;
  playEmote(id: 'wave' | 'twirl' | 'dance' | 'cast'): void;  // ~2s, auto-return
  update(t: number, dt: number): void;
}
```

- Operates ONLY on the `PrincessRig` contract → identical code for all four
  archetypes; per-archetype flavor comes from `dna.motion` (energy, bounce) +
  each synth's own `update()` (tail swish, cape ripple, pigtail bounce,
  jelly re-blob, occasional ear flick / bone rattle).
- Walk/idle poses are ported from the POCs (they were already charming):
  bob = |sin(φ)|·bounce, hip swing, knee bend on backswing, opposite arm
  swing, shy hand-clasp idle, curious head look-around.
- Emotes are small procedural clips with ease-in/out envelopes; `cast` pairs
  with a sparkle burst from the stage.
- Blink: eye-scale or lid flash every 2.5–5s (seeded), handled by face module
  hooks stored on the BuildResult (`result.root.userData.blink?.()`), driven
  by Animator.

## 6. Stage

- Renderer: ACESFilmic tone mapping, PCFSoft shadows, `outputColorSpace`
  sRGB, pixel ratio ≤ 2.
- Set: circular stone pedestal + gold trim ring, soft key light (warm), cool
  rim light, gentle fog, floating dust sparkles; subtle per-archetype rim tint
  (sunny / autumn / mint / moonlit).
- OrbitControls clamped above ground; double-click = refocus head.
- `stage.snapshot(w, h)` renders offscreen for gallery thumbnails and PNG
  export (transparent background variant for portraits).

## 7. Rebuild & memory strategy

1. `store` marks dna dirty → rAF flush.
2. If only `colors.*` changed → `kit.apply()`; done.
3. Else: `animator.unbind()` → `old.dispose()` → `synth.build()` →
   `parts.attach(result, dna, kit)` → `animator.bind()`.
4. Archetype swap additionally rebuilds the MaterialKit and re-tints the stage.

Full structural rebuild budget: **< 8ms** for parts synths, **< 16ms** for
slime (MC allocation). Verified by `console.time` in dev; regression-guarded
by a smoke test that builds all archetypes 10× (time-asserted loosely).

## 8. Export

- **Share code**: `P1.` + base64url(JSON) — see DNA_SCHEMA.md.
- **PNG portrait**: 1024² offscreen render, transparent bg, slight top-down
  hero angle.
- **GLB**: `GLTFExporter` on a **static snapshot clone** of `result.root`
  (slime MC geometry is trimmed to its live vertex count and converted to a
  plain `BufferGeometry` first; transmission maps to `KHR_materials_
  transmission` automatically). Rig groups export as node hierarchy.
- **.princess.json**: pretty-printed DNA for versioning in-repo.

## 9. Testing strategy

- `dna.test.ts`: defaults valid for all archetypes; share-code round-trip
  (dna → code → dna deep-equal); migration fills missing keys; validation
  clamps out-of-range values; randomize/mutate are deterministic per seed and
  always produce valid DNA.
- `synth.test.ts` (jsdom, no render): each archetype builds; rig joints + all
  9 sockets present; part attachment adds children to the right sockets;
  mirrored parts have negative x scale; dispose() leaves no geometry
  references (dispose spies); slime `update()` runs without a renderer.
- e2e (Phase 6+): playwright — page loads, canvas non-black, tab switching,
  randomize changes DNA field, share-code import renders.
