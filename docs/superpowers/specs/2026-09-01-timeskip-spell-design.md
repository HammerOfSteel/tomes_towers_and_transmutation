# Time-skip spell ("Chronomancer's Hourglass") — design spec

Status: drafted autonomously (user unavailable mid-brainstorm — see
"Autonomous decisions" note below). Ready for user review before
implementation begins.

## Origin

User feedback: "Maybe we can have some time-spell that I can use to
forward time to specific time of day effecting the day-night cycle etc.
maybe some cute ui and effect speeding up time until the time chosen etc,
the charming spell (singing to enemies to tame them) has some nice UI
type spell effect we could base something like this on."

## Autonomous decisions note

Mid-brainstorm the user became unavailable for interactive Q&A (autopilot
mode). Per the "decide, don't ask" directive, the open design questions
below were resolved with reasonable, documented assumptions rather than
left blank. **The user should review this whole spec before implementation
starts** — anything here can still change.

## Investigation findings

- The user's "charming spell" reference is `TamingGame`
  (`src/interactables/TamingGame.ts`, "The Princess's Song") — a 3-round
  word-picking mini-game for taming fleeing slimes. It is **not** a
  spellbar spell: it's triggered by the interact key near a fleeing slime
  (`main.ts` ~line 2988), and gates other input via a `tamingGame.active`
  flag (same pattern as `bookReader.isOpen` / `telescopeView.active`).
  Its presentation style is what's charming: **no modal overlay** — the
  world stays fully visible, a **bottom HUD strip** offers a small set of
  themed buttons, a **3D VFX** (counter-rotating torus rings + orbiting
  rune spheres + light beam) plays at the target's position, and
  **floating reaction text** drifts up from world-space. That's the
  visual language to borrow — not the word-picking scoring mechanic
  itself, which doesn't map to "pick a time of day."
- Real spells (`magic_bolt`, `lantern`, `blink`, `fly`, ...) live in
  `SPELL_DEFS` (`src/combat/SpellSystem.ts`) and are equipped to slots
  (`ProgressionSystem`), instant-cast on keypress/right-click via
  `spells.cast(...)`, with special non-damage behaviour wired through
  `CastOptions` callbacks (`onBlink`, `onLevitateToggle`, `onFlyBurst`,
  `onLanternToggle`). This is the natural home for a spell the user calls
  a "time-spell."
- `TimeSystem` (`src/world/TimeSystem.ts`) is a tiny singleton: `hour` is
  a plain public `number` field (0–23), persisted to `localStorage`.
  `schedulePhase` (used by `NPCEntity.ts` in two places, both re-read
  every frame — confirmed, not cached at spawn) is a pure getter derived
  from `hour`. Nothing needs to be told "time jumped" — NPCs will simply
  see the new `schedulePhase` on their very next update.
- `DayNightSystem.update(hour)` (`src/rendering/DayNightSystem.ts`) is
  a **pure function of `hour`** — no internal momentum/state. Driving
  `hour` through a range across several animation frames and calling
  `_dayNight.update(hour)` each frame (exactly as the main loop already
  does every frame) will visibly race the sky/fog/lighting through phases
  with no changes needed to `DayNightSystem` itself.
- There is no sun/moon disc mesh in the scene — day/night is conveyed
  purely through lighting/sky/fog colour, so the "speeding up time" effect
  needs its own VFX to sell the passage of time (no celestial body to
  visibly whip across the sky "for free").
- `SPELL_DEFS` has no mana/resource field — spells are cooldown-gated
  only. No new resource system is needed for this spell.

## Approach

### Integration: a real spellbar spell

Add a new spell, `time_warp`, of a new `SpellDef.type: 'timeskip'`. It's
equipped/cast exactly like `blink`/`fly`/`lantern` — no new input paths.
Casting it does not immediately do the effect; instead `SpellSystem.cast()`
recognizes the `timeskip` type and invokes a new `CastOptions.onTimeSkip()`
callback, handing control to a new dedicated class, `TimeSkipUI`
(`src/interactables/TimeSkipUI.ts`), mirroring `TamingGame`'s shape
(`begin()` / `update(dt)` / `active` / `onComplete`).

### Flow

1. **Cast.** Player presses the spell's slot key. `SpellSystem.cast()`
   starts the spell's cooldown (same as every other spell — see
   "Cooldown" below for why casting always consumes it, even if the
   player then cancels) and calls `onTimeSkip()`.
2. **Pick a time (non-modal bottom strip).** `TimeSkipUI.begin()` shows a
   bottom HUD strip — same visual family as `TamingGame`'s (dark glass
   panel, runic border, world still fully visible) — with 4 preset
   buttons matching `DayNightSystem`'s actual phase anchors:
   - 🌅 Dawn (6:00)
   - ☀️ Noon (12:00)
   - 🌇 Dusk (19:00) — chosen because hour 19 lands exactly on
     `DayNightSystem`'s pure-dusk blend point (`t=0` in the dusk→night
     branch), giving the most saturated "dusk" look of any candidate hour.
   - 🌙 Midnight (0:00)

   Esc cancels (closes the strip, no time change — cooldown was already
   charged at cast time per above).
   While the strip is open, player movement/attack/cast input is frozen
   via a new `timeSkipUI.active` gate added alongside the existing
   `bookReader.isOpen` / `telescopeView.active` / `tamingGame.active`
   checks in `main.ts`.
3. **Confirm → time-vortex VFX + accelerated clock.** On picking a preset,
   the strip closes and a new 3D VFX plays centred above the player: a
   spinning rune ring (reusing the existing additive-blended,
   deterministic-PRNG particle conventions already used elsewhere in
   `SpellSystem.ts`) with orbiting hourglass-sand particles — thematically
   an "hourglass/clock" analogue to the song-circle's torus rings, not a
   literal reuse of that geometry (a torus-ring "song circle" wouldn't
   read as time-themed).
   Over a fixed **2.5 real-second** window, `TimeSkipUI` advances
   `TimeSystem.instance.hour` from its current value forward (wrapping
   past 24 if needed — the clock only ever moves forward, matching how a
   real clock/hourglass works, so no "undo NPC state" question ever
   arises) toward the chosen target hour, eased (ease-in/out) rather than
   linear for a "spinning up, then settling" feel. Each animation frame
   also calls `_dayNight.update(hour)` exactly as the main loop's own
   per-frame call would, so the sky/lighting visibly race through phases
   live.
   Player input stays frozen for this whole 2.5 s window (same gate as
   step 2) — short enough to not feel like a real interruption, and
   avoids the weirdness of being attacked while the world is visibly
   time-lapsing.
4. **Land.** `hour` is set to the exact target (no floating-point drift
   from the eased animation), `TimeSystem`'s existing `localStorage`
   persistence path is invoked immediately (rather than waiting for its
   normal probabilistic per-frame write), input unlocked, and a short
   `_storyToast` plays (matching the existing toast component/style used
   elsewhere in `main.ts`), e.g. "Time flows to dusk...".

### New code surface

- `src/world/TimeSystem.ts`: add `setHour(h: number): void` — clamps/wraps
  into `[0, 24)` and writes through to `localStorage` immediately. This is
  the only change to `TimeSystem` itself; the animation/easing logic is a
  presentation concern and lives in `TimeSkipUI`, not here.
- `src/combat/SpellSystem.ts`: add `time_warp` to `SPELL_DEFS` (`type:
  'timeskip'`, cooldown 45 s — see below); add `onTimeSkip?: () => void`
  to `CastOptions`; `cast()` invokes it for `timeskip`-type spells instead
  of the projectile/aoe/etc. paths.
- `src/interactables/TimeSkipUI.ts` (new): the bottom-strip picker, the
  time-vortex VFX, and the eased `hour` advancement — same shape/pattern
  as `TamingGame` (`begin(origin: THREE.Vector3)`, `update(dt)`, `active`,
  `onComplete`).
- `src/main.ts`: instantiate `TimeSkipUI` once at startup (mirroring
  `tamingGame`), wire `time_warp`'s `onTimeSkip` callback to
  `timeSkipUI.begin(player.group.position)`, call `timeSkipUI.update(dt)`
  each frame, and add `!timeSkipUI.active` to the existing input-gate
  checks (movement/attack/cast/interact) alongside the other three.

### Cooldown

45 seconds — deliberately on the long end of the existing spell roster
(`fly`: 12 s, `nova_burst`: 15 s) since this is a powerful utility effect,
not a combat tool. **Casting always consumes the cooldown, even if the
player then cancels the picker with Esc** — this matches how every other
spell already charges its cooldown at cast time in `SpellSystem.cast()`,
and avoids adding new "refund on cancel" plumbing for a low-stakes edge
case (a 45 s cooldown makes accidental cancels a minor, rare annoyance,
not a real cost).

### Explicitly out of scope

- No rewinding time (only forward — see above for why this sidesteps a
  whole class of "undo NPC state" questions).
- No free-form hour slider/dial — 4 presets only, matching the "cute UI"
  ask and mirroring `TamingGame`'s existing 4-button convention. A slider
  can be considered later if the user wants finer control.
- No new resource/mana cost system — cooldown-gated only, like every
  other spell.
- No interaction with quests/story beats tied to specific times of day —
  none currently exist in the codebase to interact with.
- No changes to the normal passive time flow (`REAL_TO_GAME_RATIO`,
  `TimeSystem.update(dt)`) — the spell only calls the new `setHour()`
  during its own animation window.

## Testing plan

- `TimeSystem.test.ts`: extend for `setHour()` — wraps `[0,24)`
  correctly (including from e.g. 23 forward-wrapping to 1), writes
  through to `localStorage` immediately (not probabilistically).
- `SpellSystem.test.ts`: extend for `time_warp` — present in `SPELL_DEFS`
  with `type: 'timeskip'`; `cast()` invokes `onTimeSkip` and does not
  fall through to projectile/aoe paths; cooldown gates a second cast
  within 45 s.
- `TimeSkipUI.test.ts` (new): `begin()` sets `active`; picking a preset
  drives `TimeSystem.instance.hour` from current toward the target over
  the animation window (test with fake timers / manual `update(dt)`
  stepping, mirroring `TamingGame.test.ts`'s existing pattern if one
  exists); Esc cancels without changing `hour`; forward-wrap case (e.g.
  current hour 22, target 6) never regresses backward mid-animation.
- Manual playtest (required, no unverified completion claim): cast the
  spell, confirm the bottom strip appears without blocking the 3D view,
  pick each of the 4 presets and confirm the sky/lighting visibly race
  through phases and land correctly, confirm player input is frozen only
  during the strip+animation and resumes correctly after, confirm NPCs'
  behaviour reacts to the new `schedulePhase` shortly after landing.
