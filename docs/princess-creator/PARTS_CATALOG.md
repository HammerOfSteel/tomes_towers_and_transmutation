# PARTS_CATALOG — Sockets, Parts, Morphs, Adaptations

> Parts are our "rigblocks": hand-authored cosmetic modules snapped into named
> sockets on any archetype body, with per-instance morph params stored in DNA.
> Curation over volume: every part must look good on all archetypes it's
> allowed on, at every slider extreme.

## 1. Sockets

Every `BodySynthesizer` MUST provide all nine sockets (empty `Group`s parented
into the rig so parts inherit animation):

| Socket | Parent joint | Typical parts | Notes |
|---|---|---|---|
| `headTop` | head | crowns, halo | oriented +Y up, sits on scalp |
| `earL` / `earR` | head | ears | **mirrored pair** — author left, right auto-mirrors (`scale.x = -1`) |
| `hairBack` | head | hair backs, buns, pigtail roots | |
| `face` | head | (face module owns this) eyes, mouth, blush | slime: tracked anchor just outside blob surface |
| `back` | torso | bow, cape, wings | |
| `tail` | torso (rear, hem height) | tails | |
| `handL` / `handR` | elbows (wrist end) | wand, staff, fan, tome | mirrored pair |

Slime specifics: sockets parent to invisible anchors the synth repositions
every frame (head anchor, torso anchor, tail anchor) so parts ride the jelly
bob. Parts on slime get a slight sink offset (−4% of head radius) so they read
as "embedded".

## 2. Part registry

```ts
interface PartDef {
  id: string;                       // 'crown.classic'
  socket: SocketId;                 // primary socket
  mirrored?: boolean;               // build L, auto-mirror to R
  allowed?: Archetype[];            // omit = all
  build(ctx: PartCtx): THREE.Object3D;  // pure builder, no side effects
}
interface PartCtx {
  dna: PrincessDNA;                 // read morph params (earSize, crownTilt…)
  kit: MaterialKit;                 // NEVER create raw materials in a part
  rng: () => number;                // seeded — deterministic jitter only
}
```

Rules for authors:
- Geometry only from three primitives; `flatShade()` when the target archetype
  kit is flat (kit exposes `kit.flat: boolean`).
- Pivot at the attachment point, +Z forward, sized for `headSize = 1`; the
  attach step scales by the relevant DNA morph.
- Use `kit` material slots (`metal`, `accent`, …) so palette retints work with
  zero part code.
- Deterministic: same DNA ⇒ same part, always (jitter through `ctx.rng` only).

## 3. Starter set (Phase 1 build — this session)

### Crowns (`headTop`, all archetypes)
| id | Look | Morphs used |
|---|---|---|
| `classic` | torus band + 4–6 spikes (fox POC) | crownTilt, metal color |
| `tiara` | front half-arc band + small peaks + gem (reference art: dark studded tiara) | crownTilt |
| `crooked` | 5-spike band, permanently tilted + bent spike (skeleton POC charm) | crownTilt adds to base tilt |
| `flower` | ring of petal spheres + center gem | crownTilt |
| `halo` | floating emissive torus (slime/celestial vibe) | glow color, bobs in update |

### Ears (`earL/R`, mirrored; human/fox/slime — skeleton allowed for comedy)
| id | Look | Morphs |
|---|---|---|
| `fox` | cone + inner-fluff cone (fox POC) | earSize, species.fluff |
| `cat` | shorter wide cones | earSize |
| `round` | flattened spheres (mouse/bear) | earSize |
| `long` | tall thin cones, slight droop (bunny/elf) | earSize |

### Tails (`tail`)
| id | Look | Morphs | Motion |
|---|---|---|---|
| `fluffy` | 5 chained icosahedrons, diamond size curve, white tip (fox POC) | tailSize, species.fluff | sine-propagated swish |
| `thin` | tapered cylinder chain w/ tuft | tailSize | lazy sway |
| `bone` | small bone segments + heart-shaped tip vertebra | tailSize | stiff rattle sway |
| `wisp` | 3 fading emissive blobs (ghost trail) | tailSize | float + fade pulse |

### Back (`back`)
| id | Look | Morphs | Motion |
|---|---|---|---|
| `bow` | two scaled-sphere wings + knot (human POC) | — | squash on bounce |
| `cape` | 5 hinged widening panels (skeleton POC) | dress.length | sine ripple |
| `wings` | two small bat/fairy wing planes | — | slow flap |

### Hand items (`handL/R`)
| id | Look |
|---|---|
| `wand` | thin rod + star tip (emissive) |
| `staff` | tall rod + orb (emissive) + mini rings |
| `fan` | folded fan wedge |
| `tome` | tiny spellbook (very TTT — the whole game is book-powered) |

### Hair (special: built by `face`/hair module, socket `hairBack` + scalp)
| id | Look | Motion |
|---|---|---|
| `bob` | cap + bangs (reference art default) | — |
| `pigtails` | cap + bangs + 2 cone tails w/ scrunchies (human POC) | bounce w/ walk |
| `twintails` | 2 large side blobs (slime renders as metaballs!) | sway |
| `bun` | cap + sphere bun + tiara-friendly | — |
| `long` | cap + back panel strands | sway |

## 4. Per-archetype material adaptation

The SAME part id renders differently per archetype because parts only use kit
slots:

| Part | Human | Fox | Slime | Skeleton |
|---|---|---|---|---|
| crown.classic | polished gold | gold, flat-shaded | gold, slightly sunk into blob | tarnished gold, crooked default |
| ears.fox | skin-tone inner | fur + cream fluff | jelly (transmission) — gummy ears! | bone ears (comedy) |
| tail.fluffy | hair-colored | fur + white tip | jelly blobs (metaball tail via synth hook) | (disallowed → bone tail suggested) |
| hand.tome | leather + gold | leather | jelly-stuck cover | necronomicon-ish dark cover |

Adaptation is automatic (kit slots) + per-part small overrides via
`ctx.kit.flat` and archetype checks ONLY when geometry must change (e.g. slime
tail renders as metaballs → the slime synth reads `dna.parts.tail` and adds
blob chains; the mesh part is skipped there).

## 5. Adding a new part (checklist)

1. Add id to the relevant DNA union in `types.ts` (+ DNA_SCHEMA.md table).
2. Write builder in `parts.ts` following the rules above.
3. Add to `PART_ALLOW` matrix if restricted.
4. Add a chip in the UI section for its category (automatic if registered).
5. Extend `randomize.ts` pools (weighted — signature parts weighted toward
   their home archetype).
6. Unit test: builds on every allowed archetype; mirrored variant mirrors.
7. Eyeball on ALL allowed archetypes at slider extremes (min/max headSize,
   chubbiness) before merging.

## 5b. Wave-1 species additions (shipped)

Ears slot: `horn_small`, `horn_curved` (draconic — mutually exclusive with
animal ears by design). Back slot: `wings_butterfly` (patterned, fast flap),
`wings_feather` (3-layer, slow flap), `grimoire` (orbiting spellbook).
Hair: `braided`, `ponytail`, `wild`, `afro`. Face extras: `parts.glasses`
(wire rims sized off the live eye metrics). Kitsune tails: the fluffy tail
becomes a 1/3/9 fan driven by `subtype`, per-tail phase sway.

## 6. Future parts backlog (Phase 4+)

Necklaces/chokers (reference art: studded choker), shoulder pads, gloves,
boots vs. slippers toggle, freckles/face-paint layer, glasses/monocle,
witch hat (crown slot), antlers, flower in hair, held slime-pet (fox holds a
tiny slimey — see `concept_art/hiking_with_slimey.png`), harness/belt overlay
for the Midnight Punk look, safety-pin details.
