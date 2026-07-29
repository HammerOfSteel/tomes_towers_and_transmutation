# Camera Modes: Isometric + WoW-Style Third-Person

## Problem

The game currently has one fixed isometric camera (`CameraRig.ts`): a
constant offset (`ISO_OFFSET = (14, 20, 14)`) translated with the player,
with `lookAt` called once at construction and never again. Indoors, this
means walls between the camera and the player block visibility with no way
for the player to see around them (the dollhouse-cutaway/wall-occlusion
systems that previously tried to solve this are being disabled — see
`2026-07-29-disable-indoor-wall-occlusion-design.md`).

Rather than hiding geometry, the chosen fix is to let the player rotate/
orbit the camera around themselves. The user also wants to explore whether a
full WoW-style third-person camera (not first-person) feels better for
general gameplay, not just as an occlusion workaround — so this is built as
a genuine second camera mode the player can toggle, not a one-off debug
tool.

## Decision

Add a **camera mode toggle** (key: **V**) that switches between:

- **Isometric** (default, current behavior, unchanged in every respect).
- **WoW-style third-person**: mouse-driven orbit camera behind the player,
  with camera-relative movement and vanilla-WoW-like turning.

Isometric mode is not touched at all — same fixed offset, translation-only
update, no per-frame `lookAt`. All new logic lives in a new code path that
only runs when WoW mode is active.

## Architecture

### `CameraRig.ts`

- Add `mode: 'isometric' | 'wow'` state (default `'isometric'`).
- Add `setMode(mode)` / `toggleMode()` methods.
- Isometric branch: **identical to current code** — `position = target +
  ISO_OFFSET`, no per-frame `lookAt`.
- WoW branch: maintains `yaw` (radians, horizontal), `pitch` (radians,
  vertical, clamped), `distance` (clamped to `[MIN_DISTANCE,
  MAX_DISTANCE]`). Each frame:
  - Compute offset via spherical-to-Cartesian conversion from
    `yaw`/`pitch`/`distance`, centered on the player.
  - `camera.position = target.position + offset`.
  - `camera.lookAt(target.position)` — called every frame (new; isometric
    mode still never does this).
- Switching modes does not move/rotate the player; only the camera changes.
  When switching *into* WoW mode, initialize `yaw` from the player's current
  facing so the camera starts behind them; `pitch`/`distance` default to
  fixed starting values.

### New module: `WoWCameraController.ts`

Encapsulates all mouse handling for WoW mode. Only attaches
mousedown/mousemove/mouseup/wheel listeners while `CameraRig.mode === 'wow'`;
fully inert (no listeners) in isometric mode so isometric behavior can never
regress.

- **Right-button drag**: adjusts `yaw`/`pitch` on the rig. Look-only — does
  not change the player's facing.
- **Left-button drag**: adjusts `yaw`/`pitch` on the rig **and** sets the
  player's facing to match the new yaw (classic WoW "turn while holding left
  mouse" behavior).
- **Release** (either button): camera stays exactly where it was left — no
  auto re-centering behind the player.
- **Mouse wheel**: adjusts `distance`, clamped to `[MIN_DISTANCE,
  MAX_DISTANCE]`.
- **Pitch clamp**: prevents the camera from flipping over the top of the
  player or dipping below the ground plane (e.g. roughly
  `[-80°, +5°]` from horizontal — exact constants tuned during
  implementation, not user-facing).

### `PlayerController.ts`

- Reads the active camera mode each frame.
- **Isometric mode** (unchanged): movement resolved via fixed world-space
  `ISO_FORWARD/BACKWARD/LEFT/RIGHT` vectors exactly as today. Melee
  triggered by left-click exactly as today.
- **WoW mode**: 
  - `W`/`S` move the player forward/backward along the camera's current
    yaw direction (camera-relative, not world-fixed).
  - `A`/`D` **turn the character in place** (rotate facing left/right),
    matching vanilla WoW's default keyboard turning — they do not strafe.
  - Left-click is now consumed by `WoWCameraController` for camera/facing
    drag, so it can no longer trigger melee in this mode.

### `InputManager.ts` / action bar

- Add a new action-bar slot bound to **Digit5** for melee attack. This slot
  is available in both camera modes going forward (isometric mode keeps
  left-click melee as well — Digit5 is simply an additional trigger, not a
  replacement, so no regression there). In WoW mode, Digit5 is the only way
  to trigger melee since left-click is occupied by camera control.
- **V** is added as the camera-mode-toggle key (previously unused).

## Out of scope

- First-person camera (explicitly not wanted, at least until WoW-style mode
  proves out).
- Any change to spell slots (Digit1-4) or existing ability keys
  (Q/R/Z/X) — untouched.
- Any change to the outdoor `OcclusionManager.ts` fade system.
- Collision, NPC, or vegetation-variance work (tracked separately in the
  existing backlog).

## Testing / Verification

1. **Unit tests** for the new yaw/pitch/distance math in
   `WoWCameraController.ts`/`CameraRig.ts`: clamping behavior at pitch and
   distance limits, spherical-to-Cartesian offset calculation, yaw
   initialization on mode switch.
2. **Regression check**: with mode left at `'isometric'` (the default),
   camera position/behavior is identical to pre-change behavior — no visual
   or behavioral difference for players who never press V.
3. **Manual playtest of WoW mode**: indoors and outdoors — verify
   right-drag free-look, left-drag look+turn, wheel zoom clamps correctly,
   camera holds its position after releasing a drag, A/D turns the
   character without strafing, W/S move relative to current facing, melee
   fires via Digit5.
4. **Mode-switch robustness**: toggling V mid-movement (walking, mid-turn,
   indoors, outdoors) does not change player position, does not desync
   facing, and does not throw errors.
