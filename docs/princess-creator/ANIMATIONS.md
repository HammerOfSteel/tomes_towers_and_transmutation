# ANIMATIONS — The Princess Clip Library

> Phase 9. Every princess ships with a full game-ready move set: 24 keyframed
> clips resolved per species, tunable in the Atelier, exportable as one
> versioned JSON the game can play with ~40 lines of runtime.

## 1. Design

- **Keyframe clips on the shared rig contract** — every synth (human, fox,
  slime, skeleton, lamia) exposes the same 10 rotation joints
  (`torso, neck, shoulderL/R, elbowL/R, hipL/R, kneeL/R`) plus root
  (`rootY` lift, `rootRot`, `torsoScale`), so ONE clip library animates all
  21 species. Species flavor comes from **overrides**, not per-species data
  entry.
- **Sparse authoring, dense baking.** Authored keys specify only the channels
  they care about; `bakeClip` fills the rest by interpolating between the
  nearest keys that DO specify the channel (neutral when none do). A key with
  *no channels at all* — `k(0)`, `k(1)` — is an explicit **full-neutral
  anchor**: the pose returns home there instead of neighboring values bleeding
  to the clip edges.
- **Runtime = lerp + ease.** A baked clip is dense `BakedKey[]`; sampling
  brackets two keys and eases by the *incoming* key's ease
  (`linear | smooth(smoothstep) | snap = 1−(1−x)³ | hold`). No IK, no curves
  library — deliberately trivial to re-implement in the game.

## 2. The clip set (24)

| Group | Clips | Notes |
|---|---|---|
| Locomotion | `idle`, `idle_alt` (crown check), `walk`, `run`, `jump_begin`, `jump_idle`, `jump_land` | walk/run carry `step` events; jumps carry `liftoff`/`land` |
| Combat | `attack_1` (swipe), `attack_2` (overhead), `cast_spell_1` (bolt), `cast_spell_2` (tempest), `block_1` (hold loop), `block_2` (deflect, `parry` event) | attacks fire `hit` at the damage frame; casts fire `cast_release` |
| Reaction | `get_hit_1`, `get_hit_2`, `die_1` (swoon), `die_2` (crumple), `stunned` (loop), `victory` | deaths are `holdLast` — they freeze on the final frame |
| Misc / emotes | `curtsy`, `read` (loop), `wave`, `twirl`, `dance` | Atelier flavor; free to use as game emotes |

**States** (base loops the Animator can rest in): `idle, idle_alt, walk, run,
jump_idle, block_1, stunned, read`. Everything else is a one-shot that
auto-returns to the current state — except `holdLast` deaths.

### Events

`ClipEvent { t, id }` at normalized time. The player fires each event once per
crossing (loop-aware, wrap-safe): `hit`, `cast_release`, `step`, `liftoff`,
`land`, `parry`. In the Atelier, `cast_release` triggers the stage sparkle
burst; in the game, hook damage/SFX/VFX to these.

## 3. Species flavor

`SPECIES_ANIM` in `anim/clips.ts`:

| Species | Override |
|---|---|
| lamia | `walk`/`run` → **Slither** (torso sway, zero leg swing), `jump_begin/land` → coil spring/settle; speed ×0.95 |
| slime | `die_1` → **Melt** (rootY −3.6, torsoScale 1.45 — the marching-cubes body reads it as a puddle, eyes floating in the goo) |
| skeleton | `die_2` → **Collapse** (the magic gives out — straight down into a bone pile) |
| troll ×0.78 · moonborn ×0.9 · specter ×0.88 · gnome ×1.05 · goblin ×1.1 · pixie ×1.15 | global speed scalars |

On top of clips, the Animator keeps the Atelier's living-texture overlays:
`motion.idleStyle` float/bob/rattle on grounded states, breath scale, blink —
all suppressed while a death holds ("the dead don't blink").

Resolution order: **base clip → species replace → speed
(`species × (0.85 + energy·0.3)`) → per-clip tweaks (speed/amp)**.
Amp scales joint deltas *from neutral* plus `rootY`.

## 4. Tuning, save/load, export

- **Animations panel** (bottom-right): state chips, grouped one-shot buttons,
  and a tune section — clip selector + Speed/Punch sliders. Tweaks persist to
  `localStorage` **per species per clip** (`anim/tweaks.ts`) and preview
  instantly.
- **💾 Anim JSON** exports `princess-animations.anim.json`:

```jsonc
{
  "format": "ttt-princess-anim", "v": 1, "generated": "…",
  "rig": { "joints": [/* 10 */], "neutral": {…}, "states": [/* 8 */], "notes": "…" },
  "species": {
    "human":  { "speed": 1,    "clips": { "idle": {/* BakedClip */}, /* ×24 */ } },
    "lamia":  { "speed": 0.95, "clips": { "walk": { "label": "Slither", … } } }
    /* … all 21 species, fully resolved (overrides + tweaks applied) */
  },
  "tweaks": { "human": { "attack_1": { "speed": 1.2 } } }
}
```

  ~0.9 MB pretty-small JSON; the `species.*.clips` blocks are directly
  playable (dense keys, seconds, radians). `tweaks` rides along so re-importing
  restores your tuning session.
- **Import**: drop a `.anim.json` (any name — detected by `format`) onto the
  Atelier → tweaks restored, animator rebound, panel refreshed. Dropping
  portraits/`.princess.json` still loads princesses; the drop handler
  disambiguates by content.

JSON over YAML: zero deps, native parse on both sides, same family as DNA
share codes and `.princess.json`.

## 5. Using it in the game

### Path A — factory (live)
```ts
import { buildPrincess } from '@/princess-creator/factory';

const p = buildPrincess(shareCode, { targetHeight: 1.6, tweaks });
scene.add(p.root);
p.onEvent((id) => { if (id === 'hit') dealDamage(); });
p.setState('run');            // base loops: idle/walk/run/jump_idle/block_1/…
p.play('attack_1');           // one-shots auto-return to the state
p.play('die_1');              // holdLast — freezes defeated
// per frame: p.update(t, dt);   p.clips → the resolved BakedClips
```

### Path B — exported JSON + your own sampler
Load `princess-animations.anim.json`, pick `species[id].clips[clipId]`, then:

```ts
function sample(clip, time) {
  const u = clip.loop ? (time / clip.duration) % 1 : Math.min(time / clip.duration, 1);
  let b = clip.keys.findIndex((k) => k.t >= u); if (b < 0) b = clip.keys.length - 1;
  const a = Math.max(0, b - 1), ka = clip.keys[a], kb = clip.keys[b];
  let x = (u - ka.t) / (kb.t - ka.t || 1);
  x = kb.ease === 'linear' ? x
    : kb.ease === 'snap' ? 1 - (1 - x) ** 3
    : kb.ease === 'hold' ? (x >= 1 ? 1 : 0)
    : x * x * (3 - 2 * x);
  // lerp ka→kb by x: joints (Euler radians), rootY, rootRot, torsoScale
}
```
Apply to any rig with the same 10 joint names (the game's
`AnimationRetargeter` convention), or bake to `THREE.AnimationClip`s offline.

## 6. Files

| File | Role |
|---|---|
| `src/princess-creator/anim/clips.ts` | clip defs, species overrides, `bakeClip`, `resolveClips` |
| `src/princess-creator/anim/player.ts` | `sampleClip`, crossfading `ClipPlayer`, event firing |
| `src/princess-creator/anim/tweaks.ts` | localStorage tweaks, `buildAnimationExport`, import |
| `src/princess-creator/animate.ts` | `Animator` state machine + overlays (breath/blink/idle styles) |
| `src/princess-creator/__tests__/anim.test.ts` | 27 tests: library validity, baking, species resolution, sampling, events, factory API, export round-trip |
| `scripts/princess-anim-verify.mjs` | Playwright pose/panel/export QA (freeze-frame captures) |
