# Water Lab swim polish: breaststroke animation + wake ripple VFX

## Context

The Water Lab dive/swim system (dive mechanics, tiered basin, splash VFX,
dual water-surface visuals, underwater fog/glow, tier-floor collision, swim
autostep) is complete and stable. This is a small, focused polish pass on
top of that stable foundation — no new subsystems, no changes to swim
physics/collision/state logic.

Two independent, additive changes:

1. Replace the active-swim animation clip with a breaststroke cycle.
2. Add a particle-based wake trail while swimming at the surface.

## 1. Breaststroke swim animation

**Where:** `src/princess-creator/anim/clips.ts`, the `swim` clip
(`CLIPS.swim`). `swim_idle` (treading water when stationary) is unchanged.

**What changes:** The current `swim` clip is an alternating freestyle-style
stroke (one arm pulls while the other recovers, opposite-side torso roll).
It will be replaced with a symmetric breaststroke cycle:

- **Arms:** both `shoulderL`/`shoulderR` and `elbowL`/`elbowR` move
  together (mirrored, not alternating) through the four breaststroke
  phases — glide (arms extended forward, together), out-sweep (arms sweep
  out and back in a circular pull), in-sweep/recovery (elbows bend, hands
  drawn back toward the chest), and reach (arms shoot forward again into
  the next glide).
- **Legs:** `hipL`/`hipR` and `kneeL`/`kneeR` do a synchronized frog-kick —
  knees draw up and splay outward, then snap together and back straight
  during the propulsive kick, timed so the kick's power phase lines up
  with the arms' glide phase (as in a real breaststroke cycle: pull, then
  kick-and-glide).
- **Torso/neck:** a subtle forward/back undulation (torso pitching slightly
  down during the arm pull, lifting slightly during the glide/kick) rather
  than the freestyle clip's side-to-side roll, since breaststroke doesn't
  roll.
- Clip `duration` and the two `stroke` events are kept (a full pull+kick
  cycle per loop), but keyframe timing is adjusted so the glide phase gets
  a visibly longer hold than the quick pull/kick, matching real
  breaststroke rhythm.

**Not changed:** `PlayerController`'s `swim`/`swim_idle` state selection
logic (`hSpeed > 0.3 ? 'swim' : 'swim_idle'`), clip duration/loop/event
count and names (so nothing downstream that keys off `swim`'s id/events
needs updating), and `swim_idle`.

**Testing:** Existing animation/clip tests (if any check clip shape,
joint-id coverage, or event timing) must still pass since `AnimId`,
`STATE_IDS`, and the event count/ids on `swim` are unchanged — only the
keyframe pose data changes. Verified visually via the Atelier/dev preview
and live in Water Lab.

## 2. Wake ripple particle trail

**Where:** `src/scene/WaterLabScene.ts`, alongside the existing
`_spawnSplash()` one-shot entry/exit VFX (same `ParticleSystem` instance
already injected into the scene).

**Behavior:** A continuous, low-rate particle trail spawns near the
player's position while ALL of the following hold, checked once per frame
in `update()`:

- `player.isSwimming` is true,
- the player is near the surface — reuse the existing shallow-depth
  condition already available via `player.underwaterDepthFraction` (small
  fraction = near surface; large = deep-diving), thresholded so the wake
  only shows while swimming at/near the surface, not while deep-diving,
- horizontal speed is above a small "actually moving" threshold (reuse the
  same kind of check `PlayerController` uses for `swim` vs `swim_idle`, or
  derive horizontal displacement per frame in `WaterLabScene` itself).

**Implementation:** Use `ParticleSystem.addEmitter()`'s continuous-emitter
API (already used elsewhere in the codebase for ambient effects), created
once and toggled active/inactive (via the returned `EmitterHandle`'s
`stop()`/re-add pattern, or a persisted handle with position updated every
frame via `setPos()`) rather than re-creating it every frame. Particle
config: small pale-blue/white particles (visually consistent with the
existing splash burst color `0xdff3ff`), low rate, short lifetime, no
gravity (`gravity: false`), narrow spread, low outward speed, spawned at
water-surface height at the player's current X/Z position (trailing
naturally as she swims since the emitter's position is updated to follow
her each frame).

**Turns off automatically** the moment any condition stops holding
(stationary, deep dive, exits water) — no explicit "wake" state needed
beyond the per-frame condition check already described.

**Not changed:** the existing one-shot `_spawnSplash()` entry/exit burst
logic, `ParticleSystem`'s core API, and anything outside `WaterLabScene`.

**Testing:** Add/extend `tests/scene/WaterLabScene.test.ts` coverage to
assert the wake emitter is active only under the swim+surface+moving
condition (e.g. via a spy/mock on the injected `ParticleSystem`, following
the existing test file's pattern for verifying `_spawnSplash` calls).
Verified visually live in Water Lab (dev server), both camera modes.

## Out of scope

- No changes to swim physics, collision, autostep, or the tier-floor
  correction fix from the prior segment.
- No new water-surface shader work (ripple/wake is particle-based, not a
  shader distortion — see the design conversation for why: shader-based
  expanding rings were considered and explicitly deferred as pricier/more
  complex than needed here).
- No changes to the underwater screen effect, dual water-variant shaders,
  or splash-on-entry/exit VFX.
