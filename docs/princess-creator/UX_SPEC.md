# UX_SPEC — Princess Creator Editor

> Register: a jewel-box atelier inside the wizard's tower — dark plum night
> backdrop, warm candle-gold accents, rounded "storybook toy" panels. Cute but
> not saccharine (the canonical princess is punk-royal). All UI is HTML/CSS
> overlay on the canvas (game convention), no UI framework.

## 1. Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ ✦ Princess Atelier            [name field] 🎲        ↶ ↷   ⛭      │  top bar
│                                                                    │
│ ┌──────────┐                                        ┌───────────┐ │
│ │ TABS     │                                        │ CREATE    │ │
│ │ Body     │                                        │ 🎲 Random │ │
│ │ Face     │              (3D stage,                │ ⚡ Mutate  │ │
│ │ Hair     │               pedestal,                │───────────│ │
│ │ Parts    │               princess)                │ SHARE     │ │
│ │ Colors   │                                        │ code [⧉]  │ │
│ │ Motion   │                                        │ import…   │ │
│ │          │                                        │───────────│ │
│ │ (active  │                                        │ EXPORT    │ │
│ │  tab's   │                                        │ PNG  GLB  │ │
│ │  sliders │                                        │ JSON      │ │
│ │  +chips) │                                        │───────────│ │
│ └──────────┘                                        │ GALLERY   │ │
│                                                     │ ▣ ▣ ▣ ▣ + │ │
│   ┌─────────────────────────────────────────────┐   └───────────┘ │
│   │  👑 Human   🦊 Fox   💧 Slime   💀 Skeleton  │   ♪ emotes:     │
│   └─────────────────────────────────────────────┘  wave twirl     │
│                  archetype dock                     dance cast 🚶 │
└────────────────────────────────────────────────────────────────────┘
```

- **Left panel** — tabbed control sections. Only the active tab's controls
  render (few high-impact controls per tab; archetype-specific signature
  sliders pinned to the TOP of Body tab per archetype: fox → snout/fluff,
  slime → wobble/translucency/glow, skeleton → bone gauge/eye glow).
- **Right panel** — create/share/export/gallery. Always visible.
- **Species dock** — 12 species chips (icon + label + blurb tooltip), bottom
  center, with a second row of class chips (✦ Free / 📖 Scholar / 🔮 Mage /
  ⚔️ Warrior) and, when the species declares subtypes, a contextual subtype
  row (foxling: One/Three/Nine-tail). Species switching keeps name, seed and
  chosen class (reapplied), and lands on the species' canonical look —
  proportion presets and palette included. Camera auto-frames by species
  height (pixie fills the frame; high elf gets headroom).
- **Emote bar** — bottom right: wave / twirl / dance / cast + walk toggle
  (🚶 ⇄ 🧍). This is our Test Drive.

## 2. Interaction rules (from research — see RESEARCH_SUPPLEMENT §7)

1. **Instant feedback, no modals.** Every control applies live. No "apply"
   buttons, no confirmations except destructive gallery delete (single inline
   confirm state on the card, not a dialog).
2. **Single-click repeatables.** Randomize, mutate, preset, emote are all one
   click, spammable, and delightful to spam.
3. **Preset-first.** First load = a curated princess (seeded by day) so the
   stage is NEVER empty. Each archetype card click lands on that archetype's
   curated default, not a blank.
4. **Curated randomness.** 🎲 draws from per-archetype weighted pools +
   palette sets (never uniform noise). ⚡ Mutate nudges 2–4 fields ±15%.
5. **Undo/redo** (↶ ↷, Ctrl+Z / Ctrl+Shift+Z): structural edits push history
   on change; slider drags push once on release. Cap 100.
6. **Camera**: orbit (drag), zoom (wheel over canvas), auto-frame on archetype
   swap, double-click head = face close-up, `R` resets.
7. **Name dice** 🎲 next to the name field regenerates a seeded princess name.

## 3. Control inventory per tab

| Tab | Controls |
|---|---|
| Body | archetype signature sliders (pinned) · height · head size · chubbiness · arm/leg length · shoulder/hip width |
| Face | eye style chips · eye size/spacing/tilt · blush · mouth chips |
| Hair | style chips · length · (hair color lives in Colors) |
| Parts | crown chips + tilt · ears chips + size · tail chips + size · back chips · hand item chips (L/R) |
| Colors | palette cards (one-click full palette) · 8 swatch pickers (primary/secondary/accent/skin/hair/eyes/metal/glow) |
| Motion | energy · bounce · idle style chips · (walk toggle mirrors emote bar) |

Sliders: custom styled range inputs w/ value bubble; double-click a slider
resets it to the archetype default.
Chips: rounded toggle pills w/ tiny glyphs; selected = gold ring.

## 4. Share & gallery

- **Share code** field shows the live `P1.…` code; ⧉ copies; pasting a code +
  Import applies it (invalid code → shake animation + toast, never a dialog).
- **Gallery**: localStorage; card = 96² thumbnail + name. Click = load
  (pushes current to history so it's undoable). Long-press/right-click =
  delete (inline confirm). `+` saves current with fresh thumbnail.
- **Exports**: PNG (1024² transparent portrait), GLB (static snapshot), JSON
  (pretty DNA). All client-side downloads.

## 5. Keyboard map

| Key | Action |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z | undo / redo |
| Space | play random emote |
| W | toggle walk |
| R | reset camera |
| 1–4 | switch archetype |
| Ctrl+S | save to gallery |

## 6. Direct manipulation layer (SHIPPED — Phase 7)

- **Hover**: any part or region glows (pulsing emissive) with a tooltip naming
  it and its affordances. Cursor: `grab` on parts, `ns-resize` on regions.
- **Scroll** on the hovered thing resizes it (alt+scroll tilts crown/eyes).
- **Pull**: press-drag vertically on head / dress / body / arms / legs / eyes
  to inflate-deflate that dial. One undo entry per gesture; Esc cancels.
- **Drag parts**: pull a part away → red tint → release removes it; hand items
  drop onto the other hand to swap (screen-space snap ghost + marker).
- **Paint-drop**: drag a palette-card dot onto her to retint just that slot.
- **Portrait drop**: exported PNGs carry the DNA in-pixels (Spore homage) —
  drop any Atelier portrait (or .princess.json) onto the page to load her.
- Orbit stays on empty-space drags; sliders remain the always-available
  fallback for every one of these.

## 7. Micro-delight (cheap, high value)

- Springy scale-pop on chip select; sparkle burst on randomize; the princess
  glances toward the cursor occasionally; blink every 2.5–5s; soft "ta-da"
  pose after 🎲; emote buttons wiggle on hover. Sound pass is future polish
  (respect `prefers-reduced-motion`).
