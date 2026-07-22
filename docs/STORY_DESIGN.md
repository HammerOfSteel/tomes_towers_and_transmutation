# Story Design — The Tower Prologue & All Species Arcs

> **Status:** All story arcs implemented in `StoryQuestLine.ts`.
> 7 species × 4-act arcs + 5 general quests. Solmor encounter Stages 1–3 done.
> Last updated: 2026-07 (princess-creator expansion — Elf, Celestial, Draconic added)

---

## Species Arc Quick Reference

| Species | Arc Title | Theme | Acts |
|---|---|---|---|
| **Human** | The Kingdom's Call | Duty vs. revenge — a barbarian war band follows tower intelligence | 4 acts + prologue |
| **Undead** | The Unliving Question | Why am I still moving? — a necromancer made her and disappeared | 4 acts + prologue |
| **Vulperia** | The Price on Your Head | Bounty contract, Baron's Keep, intelligence networks | 4 acts + prologue |
| **Slime** | A Philosophical Ooze | Absorbs a construct personality fragment; finds a way out that isn't the front door | 4 acts + prologue |
| **Elf** | The Second Time Around | Third tower. Annotated book in her own handwriting from 3 centuries ago. | 4 acts + prologue |
| **Celestial** | Atmospheric Re-entry | Fell from the sky, found the ward stone blocking her signal, filed a formal complaint | 4 acts + prologue |
| **Draconic** | The Fire That Stays | Scales absorbing ambient spellwork; territorial history; sealed Appendix D | 4 acts + prologue |

### General Quests (all species)
| Quest | Summary |
|---|---|
| The Missing Familiar | Cat-construct wanders overworld → escort → permanent companion |
| Supply Line | 8 medicinal herbs → settlement friendly |
| The Ruined Greenhouse | Defeat guardians, plant 5 seeds → reagent source |
| The Baron's Complaint | Deliver letters → Baron's Keep neutral |
| The Ninth Tower | Observatory evidence → 3 ruin dungeons unlocked |

---

## Solmor Encounter Stages

### Stage 1 — First Meeting
Fires the first time the player exits the tower. Species-aware opening line (7 variants).
Core: he introduces the ascension research, offers a contract.

### Stage 2 — Candid Word
Fires after Act I completes (onActBegin for non-prologue acts).
Species-aware opening (7 variants — the question relevant to the player's just-completed arc).
Core: explains the truth of ascension, acknowledges failures, reveals 9 towers.

### Stage 3 — The True Question
Fires when the complete story arc finishes (onStoryComplete).
4 generic choices + 1 species-specific choice (7 total species variants).
Generic: independent / partner / freedom / ask-him-back.
Species choices: human=return-on-own-terms / undead=why-still-here / vulperia=proper-contract / slime="more" / elf=what-happened-to-the-others / celestial=complaint-first / draconic=unseal-appendix-D.

---

## Premise

Every playable character begins in the same place: a locked wizard's tower,
somewhere remote, at some point after they have been placed there without
their consent. The wizard is absent. The door is locked. The floors above
and below are also locked. Someone was very thorough.

The prologue is the player asking one question: *how do I get out?*

The arc, played over the rest of the game, is the player slowly realising
that getting out was never the only question.

---

## The Wizard — Arcanist Solmor

**Public name:** The Collector, The Arcanist, "that wizard in the tower"
**Real name:** Solmor (they stopped using it centuries ago)
**Tone:** Dry, methodical, occasionally paternal in a way that is clearly
calculated but just convincing enough to be unsettling.

### The Ascension Cycle

In this world, wizards of sufficient power eventually *ascend* — a rebirth
process that resets them to infancy, wipes their memory, but permanently
expands the baseline of their magical potential. It is not glorious.
It is bureaucratic, tedious, and compulsory once a threshold is crossed.

Solmor has done it nine times. He knows exactly what he is losing each
time — and so he has spent the last several centuries trying to solve the
problem: find a worthy successor who can carry his work forward across the
gap while he is *away*.

The gap takes approximately twenty years.

He has been looking for a very long time. Most candidates declined.
A few didn't make it. One or two took the work and used it for things
he still doesn't like to think about.

This time, he is certain. And this time he arranged for them to be *in the
tower* before they could politely refuse.

---

## The Tower — Physical Design

```
Floor 3 — Workshop & Observatory
  Solmor's active experiments. Spellcrafting tools. His current journal.
  The basement key (dropped on the workbench when he left in haste).
  
Floor 2 — Library
  Centuries of arcane texts. A telescope. Large windows.
  A note: "Do not go to the basement."
  The workshop key is here (hidden in a glove, badly).
  
Floor 1 — Ground Floor (Starting Room)
  Bedroom, study, small kitchen. Comfortable. Deliberately so.
  The pantry key is hidden behind a loose stone (ground floor quest).
  A binding circle under the rug explains why leaving felt impossible.

Floor B1 — Basement
  Solmor's records. Centuries of journals. Previous candidate profiles.
  The player's own profile — detailed, accurate, compiled over years of
  watching from a distance.
  A letter, abandoned in haste:
    "Note to self: spare master key — left on workbench, Floor 3.
     Front door key — DO NOT LEAVE THIS BEHIND AGAIN —"
     (The letter is torn. The rest is missing. He left in a very great hurry.)
  The spare master key IS on the workbench, Floor 3.
```

---

## Prologue Quest Beats (all species)

The four beats are mechanically simple (survive_wave / clear_dungeon)
because the tower prologue happens before the player has combat context.
Narrative weight is carried by the completion text.

### Beat 1 — The First Floor (Ground)
**Trigger:** Character wakes up. Locked in. Needs food or a reason to explore.

| Species | Motivation | Key Text |
|---|---|---|
| Human | Hungry, frustrated, needs to do *something* | "A knight without a quest is just someone standing in a room." |
| Undead | Feels the binding circle. Needs to understand the magic. | "A circle. Subtle. Someone knew what they were doing." |
| Vulperia | Territorial. Mapping escape routes. | "Every space has a weakness. Find the pantry key. Find everything." |
| Slime | Hungry. Absorbed the candle. Needs real food. | "The candle tasted of regret. The pantry key smells of iron." |

### Beat 2 — The Library (Floor 2)
**Discovery:** The outside world is visible. And there's a note.

The note from Solmor is identical regardless of species:
> *"Do not go to the basement."*

This is written in a controlled, slightly urgent hand. There is a second,
crossed-out version beneath it that read: *"Please do not go to the basement."*
He reconsidered the *please*.

### Beat 3 — The Workshop (Floor 3)
**Discovery:** The workshop key is here. The basement is now reachable.

The workshop holds his active experiments. Some of them are still running.
One is labelled: *[character's name] — Phase II*.

The player is allowed to be disturbed by this.

### Beat 4 — The Basement
**Discovery:** Everything.

Key items found:
- **Candidate Journals (Vol. I–IX):** Previous candidates. Brief profiles,
  observations, outcomes. Some declined gracefully. Some are noted with a
  single word: *unsuitable*. One entry is just: *"We do not speak of Candidate V."*
- **The Player's Profile:** Several pages. Compiled over years.
  Details the character has never told anyone. Solmor has been watching
  for a while.
- **The Dropped Letter:**
  ```
  Note to self: spare master key — left on workbench, Floor 3.
  Front door key — DO NOT LEAVE THIS BEHIND AGAIN — it is in my left coat
  pocket. The coat is the
  ```
  The rest is torn. He left in enormous haste.
- **The Spare Master Key:** On the workbench, Floor 3. (Player retrieves
  this and can now exit the tower.)

**Beat completion text (all species variant):**

*"The spare master key. The plans. The journals. The centuries of meticulous
notes about people he has watched and chosen and, eventually, lost. Your name
is on the first page. He did not write it as a question. The front door is
one floor up. The plans are right here."*

---

## Act I — The First Return

After the player escapes and begins exploring the world, Solmor returns.

**First encounter:** He does not apologise. He explains, concisely, that
he knows the player read the basement records, and that he expected nothing
less. He offers a choice — but frames it in a way that makes declining
clearly very difficult. The tower is still safer than outside. He has
resources. And he needs someone to continue his work when he ascends.

He doesn't say *when* the ascension will happen. The player doesn't know
to ask yet.

This encounter is written differently per species — he speaks to each
character's specific psychology based on his surveillance notes.

---

## The Reluctant Apprentice Arc (Acts II–IV context)

The main story arcs (human/undead/vulperia/slime) all unfold in the outside
world. But woven through them, Solmor's requests appear:

- **Act II:** He asks for a specific item "found in places like this dungeon
  you're clearing anyway." Feels coincidental. Isn't.
- **Act III:** He knows something about the main antagonist that the player
  needs. The price is a week helping in the workshop.
- **Act IV:** The player realises that several of the events in their arc
  were shaped by him. Not fully controlled — but *shaped*. Nudged.

By the end of Act IV, the player has done things that are identifiably
apprentice tasks, while believing themselves to be doing their own story.

---

## The Final Revelation (Post-Act IV)

Solmor is close to the threshold. The ascension is imminent — months,
maybe weeks. He tells the player this in a matter-of-fact way, as if
it is only slightly important.

He will be reset to infancy. He will lose everything. When he returns,
twenty years later, he will not remember them. But the tower will
remember them — the wards, the records, the ongoing experiments —
all of it needs someone to continue.

He chose the player specifically because, unlike the others, they went
to the basement first.

"Everyone else read the note and obeyed it. You didn't. That's the only
quality I've ever actually needed."

The player can stay. They can leave. They can burn the journals.
The game does not judge.

But the tower's magic is woven into them now, whether they intended it
or not. Somewhere in the world is a child who, in twenty years, will
remember being a wizard who spent centuries looking for someone like
this, and failing, and then finally, once — not failing.

---

## Design Notes

### Tone
- Solmor should never be sinister in a conventional way. He is methodical,
  occasionally kind in an entirely unsentimental sense, and completely
  convinced that what he is doing is reasonable.
- The player's discomfort should come from him being *right* more often
  than not, and from the accumulation of evidence that the situation was
  always designed, not discovered.
- The Stockholm syndrome angle should be slow — never explicit, never
  dramatic. Just: at some point, the player notices they've been defending
  his decisions to NPCs, and isn't quite sure when that started.

### Wizard's Ascension Cycle (world-building)
- All great wizards cycle. It is not optional. It is not a reward.
  It is closer to a mandatory retirement that destroys everything you were
  and gives back a slightly larger capacity to be something else.
- Most wizards resist for as long as possible, then go quietly.
- Solmor has been working on a solution for four hundred years.
  He has not found one. The player is not the solution — they are the
  *continuation strategy*.

### The Other Candidates (Vol. I–IX)
Future content: the player can find and track down surviving candidates
from previous centuries. Some are helpful. Some are hostile. 
Candidate V is a whole quest line.

---

## Implementation Status

| Item | Status |
|---|---|
| Prologue beats (4×) in all species StoryQuestLine | ✅ Implemented |
| Tower physical structure (dungeon floors) | ⬜ Floor B1 needed as dungeon room |
| Basement interactable objects (journal, letter, key) | ⬜ Interactable system needed |
| First Solmor encounter (post-escape) | ⬜ NPC + dialogue script |
| Act weave (Acts II–IV cross-references) | ⬜ Future |
| Final revelation scene | ⬜ Future |

---

*Last updated: 2026-07-16*
