# Lantern Spell — Design

## 1. Context

The user asked for a lantern-type spell so the character can light up dark areas (overworld
nights genuinely dim the scene — `DayNightSystem.ts` drops the main directional light's intensity
from 0.85 during the day to 0.3 at night — so a personal light source has real value). This is a
utility/QOL feature, not a combat spell.

**Existing infrastructure this reuses, confirmed by direct code read:**
- `SpellSystem.ts` already has a precedent for toggle-style utility "spells" under the
  `'movement'` `SpellType` category: `blink` (one-shot teleport), `levitate` (a timed hover buff),
  and `fly` — critically, `fly`'s own callback (`onFlyBurst` in `main.ts`) is a **true on/off
  toggle**, not a timed buff: `player.flySpellMode = !wasFlying; player.group.userData['_flySpellMode'] = player.flySpellMode;`,
  read and consumed once per frame by `PlayerController.update()`. This is the exact pattern the
  lantern reuses.
- Warm point-light conventions already exist (`LampPostFactory.ts`'s `new THREE.PointLight(0xffaa55, 0, 5)`).
- `ProgressionSystem`'s constructor directly seeds `_unlockedSpells`/`_equippedSlots` for
  `magic_bolt` — the lantern is added the same way, no new mechanism needed.
- The hotbar/HUD already generically renders whatever's in an equipped slot — no new UI code.

## 2. Spell Definition & Toggle Plumbing

`src/combat/SpellSystem.ts`:

```ts
const SPELL_DEFS: Record<string, SpellDef> = {
  // ...existing entries...
  lantern: { type: 'movement', color: 0xffaa55, emissive: 0xcc7733, damage: 0, speed: 0, radius: 0, cooldown: 0.3 },
};
```

`cooldown: 0.3` is pure input debounce (prevents an accidental double-toggle within the same
input frame), not a meaningful gameplay limiter — matching how a real lantern's clasp isn't
"on cooldown."

`CastOptions` gains:
```ts
/** Lantern: toggle the player's carried light on/off. */
onLanternToggle?: () => void;
```

`_fireMovement()` gains a new branch (alongside the existing `blink`/`levitate`/`fly` branches):
```ts
} else if (spellId === 'lantern') {
  this._addSpark(origin, def.color, 2.0, scene); // toggle feedback burst, matches levitate's own _addSpark call
  opts.onLanternToggle?.();
}
```

`main.ts`'s cast-options block gains, alongside the existing `onLevitateToggle`/`onFlyBurst`:
```ts
onLanternToggle: () => {
  const wasOn = player.isLanternOn;
  player.isLanternOn = !wasOn;
  player.group.userData['_lanternToggle'] = player.isLanternOn;
},
```

## 3. `PlayerController` — Light + Visible Prop

`PlayerController.ts` gains a public `isLanternOn = false` field (mirroring `flySpellMode`), a
`THREE.PointLight`, and a small visible prop group, both added as children of `this.group` at
construction (mirroring exactly how `this._levitateEffect.group` is attached today via
`this.group.add(this._levitateEffect.group)`):

```ts
private readonly _lanternLight = new THREE.PointLight(0xffaa55, 1.1, 6);
private readonly _lanternProp  = _buildLanternProp(); // small primitive-composition group, see §4
```

In the constructor (alongside the existing `this.group.add(this._levitateEffect.group)` line):
```ts
this._lanternLight.position.set(0.4, 1.0, 0.3); // fixed hip-height offset, tunable
this._lanternProp.position.copy(this._lanternLight.position);
this._lanternLight.visible = false;
this._lanternProp.visible = false;
this.group.add(this._lanternLight);
this.group.add(this._lanternProp);
```

In `update()`, alongside the existing `_flySpellMode` userData-flag consumption block:
```ts
if (typeof this.group.userData['_lanternToggle'] === 'boolean') {
  this.isLanternOn = this.group.userData['_lanternToggle'] as boolean;
  delete this.group.userData['_lanternToggle'];
  this._lanternLight.visible = this.isLanternOn;
  this._lanternProp.visible = this.isLanternOn;
}
```

Reading the flag only inside the `if` (not unconditionally re-syncing visibility every frame)
mirrors the exact one-shot-consume style of the existing `_flySpellMode`/`_levitateBuffDuration`
blocks — cheap, and avoids fighting any other code that might toggle `.visible` directly.

## 4. Visible Prop — Simple Primitive Composition

A tiny lantern shape, built once (not per-frame), same primitive-composition style as the
existing tree/rock scatter builders (not `BlockKit` — this is a small personal held item, not
architecture or a scatter prop):

```ts
function _buildLanternProp(): THREE.Group {
  const g = new THREE.Group();
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.6, metalness: 0.4 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffcc66, emissive: 0xffaa44, emissiveIntensity: 1.2, roughness: 0.4,
  });
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8, 1, true), cageMat);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), glowMat);
  g.add(cage, glow);
  return g;
}
```

`CylinderGeometry`'s `openEnded: true` (the 6th param) gives a hollow "cage" look with the glow
sphere visible through the open top/bottom, avoiding a separate wireframe/lattice pass — cheap and
simple, matching this project's established restraint for small held-item props.

## 5. `ProgressionSystem` — Default Starting Spell

```ts
private readonly _equippedSlots: (string | null)[] = ['magic_bolt', 'lantern', null, null];
// ...
constructor() {
  this._unlockedSpells.add('magic_bolt');
  this._unlockedSpells.add('lantern'); // starting utility spell, always available like magic_bolt
}
```

Equipping it directly into slot 1 (not just unlocking it) means it's immediately usable without
any extra spellbook-menu interaction — matching the "available for the character" framing.

## 6. Testing

- `SPELL_DEFS.lantern` exists with `type: 'movement'` and a low cooldown.
- `SpellSystem.cast('lantern', ...)` invokes the supplied `onLanternToggle` callback exactly once.
- `PlayerController`: `isLanternOn` starts `false`; setting `group.userData['_lanternToggle'] = true`
  then calling `update()` flips `isLanternOn` to `true`, makes both the light and prop visible,
  and deletes the userData flag (consumed exactly once — a second `update()` call without
  re-setting the flag leaves `isLanternOn` unchanged).
- `ProgressionSystem`: a fresh instance has `'lantern'` in its unlocked-spells set and in
  equipped slot 1 (verified via whatever public getter already exposes this — `getEquippedSlots()`
  is confirmed to exist and return a copy of the array).

## 7. Explicitly Out of Scope

- Any interaction with swim/underwater state (the light does **not** extinguish when the player
  is submerged) — a real "snuffed out underwater" touch is a plausible future nice-to-have, not
  part of this pass.
- Any resource/mana cost — no Spell in this game has one today (only keyboard-bound Abilities use
  the separate mana pool); adding one just for the lantern would be an inconsistent one-off.
- Any bespoke HUD/UI changes — the hotbar already generically renders whatever's equipped.
- Any dungeon/cave-specific lighting integration beyond the plain point light already reused here
  — it works the same everywhere (overworld, interiors) since it's just an ordinary attached light.
