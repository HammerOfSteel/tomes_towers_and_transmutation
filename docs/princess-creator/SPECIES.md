# SPECIES — The Princess Multiverse in the Atelier

> Source of truth: the game's Character Design doc ("Character Design — The
> Princess"). This file is its *atelier distillation*: what each species means
> in DNA, geometry and color terms. Registry: `src/princess-creator/species.ts`.

## 1. Model

```
species (identity)  ─┬─ synth (body tech: human | fox | slime | skeleton)
                     ├─ proportion preset (+ lockBody pins for the randomizer)
                     ├─ signature features (ears/horns/wings/halo/aura/tails…)
                     ├─ skin + hair tone pools   ← "colour communicates story"
                     ├─ curated palettes (first = canonical)
                     └─ weighted randomizer pools

pclass (outfit vocabulary)  = none | scholar | mage | warrior  — one-click
                              preset patch, never a lock (magic crayons)
subtype                     = species-specific variant (foxling tails 1/3/9)
aura                        = none | motes | cold | warm  (+ intensity)
```

- `species` is authoritative in DNA v2; `archetype` (the body tech) is derived.
- Species switching keeps name/seed/class, lands on the species' canonical
  look — silhouette presets included. Silhouette-first: signature features are
  *defaults with heavy randomizer weights*, so 🎲 keeps every species readable
  at thumbnail size.
- v1 share codes migrate: `fox→foxling`, knobs `species{}` → `traits{}`.

## 2. Roster (Wave 1 + Wave 2a — all live)

| Species | Tech | Silhouette hook | Signature defaults | Aura | Canonical palette |
|---|---|---|---|---|---|
| 🧑 Human | smooth | bob + tiara | bow, bell dress | — | Midnight Punk |
| 🧝 Elf | smooth | pointed ears, tall + slender (1.08, lock) | long/braided hair, wire tiara, sleepy eyes | — | Sylvan Sage |
| ⭐ High Elf | smooth | most elongated (1.2), long ears ×1.45, ALWAYS long hair | actual crown, lash eyes | motes | Indigo Dawn |
| 🧚 Pixie | smooth | 0.55× tall, 1.45× head, butterfly wings | wild hair, flower crown, big sparkle eyes, float idle | — | Petal Storm |
| 🥀 Undead | smooth | pale luminous skin, cold aura | long dishevelled hair, tilted tiara, void eyes, no blush | cold | The Haunting (+ jewel "Reclaimed" sets — she refuses grey) |
| ✨ Celestial | smooth | feather wings + halo + warm glow, floats | star eyes, long moving hair, skin emissive | warm | Divine Dawn |
| 🐉 Draconic | smooth | horns (no crown needed), slit eyes, broad shoulders | braided dark hair, fang mouth, small tail | — | Ember Scale |
| 🍄 Gnome | smooth | 0.7× tall, 1.35× head, STRUCTURAL afro | glasses + tome, round ears, bob idle | — | Hearth & Apron |
| 👺 Goblin | smooth | 0.78× tall, huge radar ears (×1.6) | wild hair, crooked (acquired) crown, fang, big round eyes | — | Scrap Chic |
| 🦊 Foxling | fox (flat low-poly) | fox ears + fluffy tail(s) | hex dress, cat mouth, button eyes | — | Autumn Maple |
| 🌿 Fae | smooth | LEAF WINGS + leaves growing in hair | flower crown, elf ears, green-gold glow skin, float idle | motes (fireflies) | Forest Court |
| 🔥 Ignis | smooth | hair is SHAPED FIRE (style→flame layout) | ember-lit skin, glow eyes, structured dark dress, firelight flicker | ember (rising sparks) | Emberheart |
| 👻 Specter | smooth | translucent body + mist-trail hair | void eyes, no mouth, wisp trail, the tome she can't put down | cold | The Grey Passage |
| 💧 Slime | metaballs | translucent blob + jelly twintails | halo, wisp trail, open mouth, float | — | Mint Jelly |
| 💀 Skeleton | bones | skull + glow sockets + cape | crooked crown, teeth, rattle idle | cold (low) | Gothic Royal |

**Subtypes:** Foxling `1` / `3` / `9` tails (novice → adept → mythic; tails fan
and sway on independent beats, per-tail size drops so the mass stays readable).

## 3. Classes (outfit vocabulary)

| Class | Patch |
|---|---|
| ✦ Free | pure species look (no patch) |
| 📖 Scholar | glasses on, tome in hand, trimmed dress — "she read first" |
| 🔮 Mage | layered robe, sash, staff, orbiting grimoire |
| ⚔️ Warrior | slim fitted dress, sash, cape, no glasses — sensible boots energy |

Applied last by the randomizer (weighted 4:2:2:2 none:s:m:w) so rolled outfits
stay coherent; reapplied on species switch when chosen.

## 4. New content shipped for Wave 1

- **Parts**: butterfly wings (patterned, fast flap), feather wings (3-layer,
  slow flap), orbiting grimoire, horns ×2 (small/curved — live in the ear slot,
  mutually exclusive with animal ears, which fits draconic), reading glasses,
  kitsune multi-tail fan.
- **Hair**: braided, ponytail (reuses pigtail sway), wild (deterministic spike
  crown), afro (multi-sphere volume).
- **Eyes**: `slit` (draconic vertical pupil), `star` now gold + twinkle.
- **Aura module** (`aura.ts`): drifting motes / cold shell+light / warm
  glow — all colored by the live palette `glow` slot (lights share the kit's
  Color instance, so palette swaps retint them).
- **Skin luminescence**: celestial / high elf / undead get species-tuned
  emissive skin.
- **Height-aware camera framing** per species (a pixie fills the frame; a high
  elf gets headroom).

## 5. Wave 2 backlog (designed in the game doc, not yet built)

| Species | Key tech needed | Status |
|---|---|---|
| 🌿 Fae | leaf wings, leaf-sprinkled hair, firefly motes | ✅ SHIPPED (leaf-hem dress profile still backlog) |
| 🔥 Ignis | flame hair (style→fire layout), ember aura, ember-lit skin | ✅ SHIPPED (ember skin *patterns* wait for paint phase) |
| 👻 Specter | translucent material kit, mist-trail hair | ✅ SHIPPED (motion-lag cloth backlog) |
| 🌊 Naiad | iridescent/wet materials, temple fins part, water palettes | backlog |
| 🌙 Moonborn | silver skin pattern lines (paint phase), crescent hair, Crescent/Full/Eclipse subtypes | backlog |
| 🌺 Verdant | growing-things hair, living wreath, bark accessories | backlog |
| 🐍 Lamia | serpent lower-body synth variant (biggest lift — new tech) | backlog |
| 💪 Orc / 🧌 Troll | broad-build preset + tusk part (small lift) | backlog |

Also backlogged: outfit vocabulary expansions (corset, ballgown skirt, veil,
mantle…), `familiar_shoulder`, tail bell-charms, and boon-flavored accessory
sets (Night-Touched, Static Charge…) once the game's boon list stabilizes.

## 6. Authoring a new species (checklist)

1. Add id to `SpeciesId` + `SPECIES_IDS` (types.ts).
2. Write its `SpeciesDef` in species.ts: `apply()` identity, `lockBody` pins,
   tone pools, ≥2 palettes, full `rand` pools, optional `subtypes`.
3. New signature parts → PARTS_CATALOG checklist first.
4. Name default in dna.ts `NAME_DEFAULTS`.
5. Tests pass automatically (SPECIES_IDS-driven), but add assertions for the
   species' silhouette hooks in interact.test.
6. Playwright screenshot pass + black-silhouette check at slider extremes.
7. Update the roster table above + DNA_SCHEMA if fields changed.
