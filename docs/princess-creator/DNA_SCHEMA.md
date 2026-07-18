# DNA_SCHEMA — PrincessDNA v2

> The DNA is the ONLY persistent description of a princess. Small, versioned,
> forward-migratable. If a feature isn't representable in DNA, it doesn't ship.

## 0. v2 changes (2026-07-18 — species/class expansion)

New top-level fields:

| Field | Type | Notes |
|---|---|---|
| `species` | 12-value `SpeciesId` | AUTHORITATIVE identity; `archetype` is now derived from `SPECIES_DEFS[species].synth` on sanitize. See SPECIES.md |
| `pclass` | `'none' \| 'scholar' \| 'mage' \| 'warrior'` | outfit vocabulary preset last applied |
| `subtype` | string | species-declared variants (foxling `'1'\|'3'\|'9'` tails); '' otherwise |
| `aura` | `{ style: 'none'\|'motes'\|'cold'\|'warm'; intensity: 0–1 }` | motes/cold/warm systems in aura.ts |

Renames/extensions:
- v1 `species` (signature knobs object) → **`traits`** (same fields).
- `parts` gains `crownSize`, `backSize`, `handSize` (0.6–1.6, wheel-scalable)
  and `glasses: boolean`.
- Enums extended: hair `braided/ponytail/wild/afro`; ears `horn_small/horn_curved`;
  back `wings_butterfly/wings_feather/wings_leaf/grimoire`; eyes `slit`;
  aura `ember`. Species grew to 15 with Wave 2a (`fae`, `ignis`, `specter`) —
  additive enum growth stays within v2 (old codes import; old builds fall
  back unknown species to human).
- `body.height` range widened to 0.5–1.35 (pixie/gnome/goblin ↔ high elf);
  `body.headSize` to 0.75–1.65.

**Migration v1→v2** (`dna.ts migrateV1toV2`): archetype→species map
(`human→human, fox→foxling, slime→slime, skeleton→skeleton`), old `species`
object copied to `traits`, `pclass:'none'`, foxling `subtype:'1'`, aura from
species default. Old `P1.` codes import forever; new codes emit `P2.`.

## 1. Share code format

```
P2.eyJ2IjoyLCJuYW1lIjoiTHVuYSIsIC4uLn0
└┬┘ └──────────────┬──────────────────┘
 │                 └ base64url(JSON.stringify(dna))  (no padding)
 └ prefix: P + schema major version
```

- Decoder accepts any `P<int>.` prefix ≤ current version and runs migrations.
- Unknown/missing fields → defaults (never throw on old codes).
- Out-of-range numerics are clamped to the ranges below on import.

## 2. Schema (v1)

All colors are `#rrggbb` strings. All numeric ranges are **inclusive** and
enforced by `clampDna`. "Default" columns are the per-archetype starting DNA
(`defaultDna(archetype)`).

### Top level

| Field | Type | Notes |
|---|---|---|
| `v` | `1` | schema version |
| `name` | string ≤ 24 chars | princess name |
| `seed` | uint32 | last seed used by randomize/mutate (provenance + thumbnails) |
| `archetype` | `'human' \| 'fox' \| 'slime' \| 'skeleton'` | selects the BodySynthesizer |

### `body` — shared proportions (chibi grammar)

| Field | Range | human | fox | slime | skeleton | Meaning |
|---|---|---|---|---|---|---|
| `height` | 0.8–1.25 | 1.0 | 1.0 | 0.95 | 1.0 | global scale |
| `headSize` | 0.75–1.5 | 1.0 | 1.0 | 1.1 | 1.0 | head radius multiplier (chibi ≈ 40% of height) |
| `chubbiness` | 0.6–1.8 | 1.0 | 1.1 | 1.2 | 0.85 | torso/limb thickness |
| `armLength` | 0.7–1.3 | 1.0 | 1.0 | 0.9 | 1.05 | |
| `legLength` | 0.7–1.3 | 1.0 | 0.95 | 0.85 | 1.05 | |
| `shoulderWidth` | 0.75–1.3 | 1.0 | 1.0 | 1.0 | 0.95 | |
| `hipWidth` | 0.75–1.4 | 1.0 | 1.05 | 1.15 | 0.9 | |

### `dress`

| Field | Type/Range | Notes |
|---|---|---|
| `style` | `'bell' \| 'aline' \| 'hex' \| 'layered' \| 'slim'` | bell=human POC cone, hex=fox POC 6-gon, aline=skeleton POC |
| `flare` | 0.6–1.6 | hem radius multiplier |
| `length` | 0.7–1.3 | hem drop multiplier |
| `trim` | boolean | ruffle/trim torus at hem |
| `sash` | boolean | waist ribbon/sash |
| `puffSleeves` | boolean | shoulder puffs (human/fox) |

### `face`

| Field | Type/Range | Notes |
|---|---|---|
| `eyeStyle` | `'sparkle' \| 'round' \| 'lash' \| 'sleepy' \| 'star' \| 'glow' \| 'void' \| 'button'` | glow/void default skeleton; button default fox |
| `eyeSize` | 0.7–1.5 | |
| `eyeSpacing` | 0.75–1.3 | |
| `eyeTilt` | −0.3–0.3 (rad) | cute inward tilt |
| `blush` | 0–1 | 0 = none |
| `mouth` | `'smile' \| 'open' \| 'cat' \| 'pout' \| 'fang' \| 'teeth' \| 'none'` | teeth default skeleton, cat default fox |

### `hair`

| Field | Type/Range | Notes |
|---|---|---|
| `style` | `'none' \| 'bob' \| 'pigtails' \| 'twintails' \| 'bun' \| 'long'` | bob = reference-art default (cap+bangs); slime renders hair as metaballs |
| `length` | 0.6–1.5 | tail/strand length multiplier |

### `parts` — socketed cosmetics (see PARTS_CATALOG.md)

| Field | Type | Default h/f/sl/sk |
|---|---|---|
| `crown` | `'none' \| 'classic' \| 'tiara' \| 'crooked' \| 'flower' \| 'halo'` | tiara / classic / halo / crooked |
| `crownTilt` | −0.35–0.35 rad | 0 / 0 / 0 / −0.25 (crooked charm) |
| `ears` | `'none' \| 'fox' \| 'cat' \| 'round' \| 'long'` | none / fox / none / none |
| `earSize` | 0.6–1.8 | |
| `tail` | `'none' \| 'fluffy' \| 'thin' \| 'bone' \| 'wisp'` | none / fluffy / wisp / none |
| `tailSize` | 0.6–1.6 | |
| `back` | `'none' \| 'bow' \| 'cape' \| 'wings'` | bow / none / none / cape |
| `handL`, `handR` | `'none' \| 'wand' \| 'staff' \| 'fan' \| 'tome'` | none (tome = a spellbook, very TTT) |

### `colors`

| Slot | Used for |
|---|---|
| `primary` | dress body |
| `secondary` | trim, ruffles, fur tips, cape lining |
| `accent` | sash, bows, gems, cape |
| `skin` | skin / fur base / jelly / bone |
| `hair` | hair (fox: alt fur) |
| `eyes` | iris / glow color |
| `metal` | crown & jewelry metal |
| `glow` | emissive accents (slime core, skeleton eyes) |

### `species` — per-archetype signature knobs (all present, used when relevant)

| Field | Range | Used by | Meaning |
|---|---|---|---|
| `snoutLength` | 0.5–1.6 | fox | cone snout length |
| `fluff` | 0.5–2.0 | fox | tail/ear fluffiness |
| `wobble` | 0–1 | slime | jelly secondary-motion amount |
| `translucency` | 0.2–0.9 | slime | material transmission |
| `coreGlow` | 0–1 | slime | inner nucleus visibility/emissive |
| `boneThickness` | 0.6–1.6 | skeleton | limb bone gauge |
| `eyeGlowIntensity` | 0–1.5 | skeleton | socket glow + point lights |

### `motion`

| Field | Range | Meaning |
|---|---|---|
| `energy` | 0–1 | animation amplitude/tempo scalar |
| `bounce` | 0–1 | walk bob height |
| `idleStyle` | `'sway' \| 'bob' \| 'float' \| 'rattle'` | defaults: human sway, fox bob, slime float, skeleton rattle |

## 3. Invariants

- `defaultDna(a)` passes `validateDna` for every archetype (unit-tested).
- `shareCodeToDna(dnaToShareCode(d))` deep-equals `d` (unit-tested).
- Randomize/mutate output always passes validation (unit-tested, 200 seeds).
- Migrations are pure functions `(old: unknown) → v1` living in `dna.ts`;
  add `migrateV1toV2` etc. when the schema grows. Never mutate meaning of an
  existing field — add a new one and migrate.

## 4. Example (abbreviated)

```json
{
  "v": 1, "name": "Maribel", "seed": 3735928559, "archetype": "fox",
  "body": { "height": 1, "headSize": 1.05, "chubbiness": 1.15, "armLength": 1,
            "legLength": 0.95, "shoulderWidth": 1, "hipWidth": 1.05 },
  "dress": { "style": "hex", "flare": 1.1, "length": 1, "trim": true,
             "sash": false, "puffSleeves": false },
  "face": { "eyeStyle": "button", "eyeSize": 1, "eyeSpacing": 1,
            "eyeTilt": 0.12, "blush": 0.4, "mouth": "cat" },
  "hair": { "style": "none", "length": 1 },
  "parts": { "crown": "classic", "crownTilt": 0, "ears": "fox", "earSize": 1.2,
             "tail": "fluffy", "tailSize": 1, "back": "none",
             "handL": "none", "handR": "none" },
  "colors": { "primary": "#ff8fb3", "secondary": "#fff6ec", "accent": "#ffd166",
              "skin": "#e86a33", "hair": "#fff6ec", "eyes": "#3c2a1e",
              "metal": "#f1c40f", "glow": "#ffe9a8" },
  "species": { "snoutLength": 1, "fluff": 1.2, "wobble": 0.5,
               "translucency": 0.6, "coreGlow": 0.3,
               "boneThickness": 1, "eyeGlowIntensity": 1 },
  "motion": { "energy": 0.6, "bounce": 0.5, "idleStyle": "bob" }
}
```
