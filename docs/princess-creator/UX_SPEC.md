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
- **Archetype dock** — 4 big rounded cards, bottom center. Switching keeps
  shared DNA (name, body proportions, motion energy/bounce) and applies the
  archetype's curated defaults for everything else — colors reset to that
  archetype's canonical palette so every card lands looking its best; any
  palette is one click away in the Colors tab.
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

## 6. Phase 7 (later): direct manipulation layer

Raycast hover glow on parts → mouse-wheel scales hovered part (Spore's
signature), drag part between sockets, drag-and-pull proportion handles on
torso/head, palette drag-onto-part. Spec'd in TODO Phase 7; sliders remain the
fallback so the tool never depends on it.

## 7. Micro-delight (cheap, high value)

- Springy scale-pop on chip select; sparkle burst on randomize; the princess
  glances toward the cursor occasionally; blink every 2.5–5s; soft "ta-da"
  pose after 🎲; emote buttons wiggle on hover. Sound pass is future polish
  (respect `prefers-reduced-motion`).
