# Tomes, Research & Spellcraft
> Core knowledge-progression layer for *Tomes, Towers & Transmutation*. Covers book taxonomy, personal library, school mastery, research unlocks, and structured spell mutation. Depends on world/content placement work in 02/03/05.

## Status: ⚠️ GAP — design defined in `story_quests_mechanics/03-tomes-and-grimoire-progression.md`, no production plan yet

## Goals
- Make **books** a first-class progression system rather than one-off spell unlocks
- Tie dungeon exploration, story arcs, and overworld ruins into **knowledge acquisition**
- Add a **personal library** and research bridge inside the tower
- Expand spell progression from `unlock spell` into `seen → learned → studied → transmuted`
- Support structured spell mutations without becoming an unreadable sandbox

## Scope
This file covers:
- book and archive taxonomy
- spell school progression
- player library/catalog state
- research unlock hooks from discovered texts
- spell mutation ladders and doctrine tags

This file does **not** cover:
- potion/material conversion pipelines → see future `alchemy-transmutation-crafting.md`
- follower assignment or defense runtime → see future `follower-companion-system.md` and `tower-defense-domain-events.md`

---

## Phase TRS-1 — Book Taxonomy & Data Model

### Goals
- Distinguish notes, tomes, grimoires, and archives in data
- Make books trackable as progression objects
- Support placement metadata for runtime and procedural seeding

### Tasks
- [ ] Add `BookDef` / `KnowledgeDef` schema with:
  - `id`
  - `title`
  - `kind` (`note | tome | grimoire | archive`)
  - `role` (`spell_unlock | school_deepen | research_unlock | narrative_reveal | defense_doctrine | access_key`)
  - `school?`
  - `rarity`
  - `origin` (`tower | dungeon | overworld | settlement | quest | candidate_archive`)
  - `placementRules`
  - `researchUnlockIds?`
  - `spellMutationIds?`
- [ ] Add book state tracking enum:
  - `seen`
  - `learned`
  - `studied`
  - `transmuted`
- [ ] Define school list aligned to new design:
  - Arcane
  - Pyromancy
  - Stormcraft
  - Umbromancy
  - Vital / Nature Alchemy
  - Gravity / Transmutative Matter
- [ ] Add content tags for site bias:
  - `knowledge_rich`
  - `candidate_archive`
  - `defense_intel`
  - `volatile_materials`
  - `school_<name>_bias`
- [ ] Add tests validating:
  - every book has a legal kind/role
  - `grimoire` entries never use trivial roles
  - school-tagged books reference a valid school

### Done means
- runtime can represent books as typed knowledge objects
- content placement can target books intentionally
- save layer can persist knowledge state cleanly

---

## Phase TRS-2 — Personal Library & Catalog

### Goals
- Make discovered knowledge visible in the tower
- Turn books into a persistent domain system rather than consumed pickups
- Let players inspect progression by school, rarity, origin, and unresolved leads

### Tasks
- [ ] Create `LibraryCatalog` state that stores:
  - discovered book IDs
  - current knowledge state
  - unread/new flags
  - unresolved lead markers
- [ ] Add tower Library / Archive interaction panel:
  - by school
  - by rarity
  - by origin
  - by role
- [ ] Show silhouettes or “seen but not owned” entries after first references
- [ ] Surface “this text points to…” leads for:
  - hidden rooms
  - dungeon families
  - candidate archives
  - observatory / celestial ruins
- [ ] Display which spells are:
  - seen
  - learned
  - studied
  - transmuted
- [ ] Add UI hook for “new research available from newly catalogued texts”
- [ ] Playwright coverage:
  - discover book
  - return to tower
  - open library
  - verify new entry/state change displayed

### Done means
- tower return loop gains a strong knowledge-management action
- player can understand what books have changed and what they unlock next

---

## Phase TRS-3 — Spell School Progression

### Goals
- Move from isolated spell unlocks to coherent school mastery
- Let follow-up books deepen existing spells and schools
- Make dungeon target choice depend on school progression goals

### Tasks
- [ ] Assign every current and planned spell to a school
- [ ] Add school mastery state:
  - `unknown`
  - `initiated`
  - `practiced`
  - `mastered`
  - `transmutive`
- [ ] Define what school-deepening books can unlock:
  - lower cooldown variants
  - alternate status riders
  - synergy tags
  - new research topics
  - defense-linked spell forms
- [ ] Add per-school progression tables for at least:
  - 1 foundational spell
  - 2–3 deepening texts
  - 1 grimoire / doctrine capstone
- [ ] Link existing `AbilitySystem` unlocks to book state rather than only direct flags
- [ ] Ensure species arcs can bias school exposure without hard-locking other schools
- [ ] Unit tests:
  - school books correctly deepen instead of duplicate unlocks
  - state transitions are legal
  - mastered schools unlock the right downstream research/mutation hooks

### Done means
- books can deepen builds, not just add hotbar clutter
- site families can support meaningful school-specialized hunts

---

## Phase TRS-4 — Research Bridge

### Goals
- Make certain books unlock tower-side research rather than direct combat only
- Connect lore discovery to long-horizon progression
- Ensure research feels like application of knowledge

### Tasks
- [ ] Define `ResearchProjectDef` bridge fields from books:
  - `bookIdsRequired`
  - `schoolRequirement?`
  - `materialRequirementSummary`
  - `facilityRequirement`
  - `outcomeType`
- [ ] Support research outcome types:
  - unlock formula family
  - unlock spell mutation branch
  - unlock defense doctrine
  - unlock tower restoration method
  - unlock archive interpretation
- [ ] Add “newly unlocked research” alerts when relevant books are catalogued
- [ ] Identify at least one starter research project per major school
- [ ] Identify at least one candidate-archive-driven forbidden project
- [ ] Add quest hooks where reading a book is necessary but not sufficient — player must also research it
- [ ] Save/load coverage for:
  - unlocked research topics
  - in-progress research
  - completed research from books

### Done means
- knowledge has a strong tower-side payoff
- reading books creates mid-term goals instead of only immediate spell rewards

---

## Phase TRS-5 — Structured Spellcraft & Mutation Ladders

### Goals
- Let spells branch into curated high-identity variants
- Keep mutation structured and readable
- Connect school mastery, books, research, and facilities

### Tasks
- [ ] Add `SpellMutationDef` schema with:
  - parent spell ID
  - mutation axis (`form | affinity | function | doctrine`)
  - required knowledge state
  - required research
  - required facility
  - catalyst tags
  - effect summary
- [ ] Implement first curated ladders for:
  - `Flame Dart`
  - `Arcane Ward`
  - `Chain Lightning`
  - `Gravity Well`
- [ ] Add doctrine-oriented variants for defense relevance:
  - beacon / mark variants
  - sanctuary / anchor variants
  - anti-swarm / anti-construct variants
- [ ] Add UI for comparing base spell vs mutation options
- [ ] Prevent full freeform editing; mutation is branch selection, not arbitrary parameter tuning
- [ ] Unit tests:
  - mutation prerequisites enforce correctly
  - only one incompatible branch can be active where intended
  - mutated spells serialize and restore correctly

### Done means
- spellcraft becomes a pillar mechanic
- players can build distinct magical identities through knowledge, not only talents

---

## Phase TRS-6 — Content Placement & Quest Integration

### Goals
- Integrate book logic into authored content and procedural spaces
- Ensure core texts are guaranteed while rarer texts remain exciting discoveries
- Use books to drive quests, defenses, and site choice

### Tasks
- [ ] Mark guaranteed core placements for:
  - first projectile spell book
  - first defensive spell book
  - first research primer
  - first school-deepening follow-up
- [ ] Expand `lore-books.md` into taxonomy-aware placement:
  - spell unlock texts
  - school-deepening texts
  - candidate journals
  - defense manuals
  - faction records
- [ ] Add quest reward support for:
  - direct book rewards
  - archive access rewards
  - school manual unlocks
- [ ] Add defense/manual rewards from tower events or siege resolutions
- [ ] Add site-family weighted placement rules for:
  - library ruins
  - observatories
  - tombs
  - alchemy vaults
  - beast shrines
- [ ] Ensure species arcs each reference at least one system-defining book family

### Done means
- books meaningfully shape exploration and quests
- players can route expeditions around knowledge goals

---

## Phase TRS-7 — Verification

### Unit
- [ ] knowledge object schema tests
- [ ] state transition tests
- [ ] school progression tests
- [ ] mutation prerequisite tests
- [ ] save/load tests for library and mutation state

### E2E
- [ ] tutorial/core book path: discover → learn spell → open library
- [ ] follow-up book path: learn → study → unlock research
- [ ] mutation path: catalog required texts → complete research → apply mutation
- [ ] defense-manual path: obtain doctrine book → verify preparation option appears

### Bot / content audits
- [ ] audit all placed books have taxonomy and legal origin tags
- [ ] audit guaranteed core books exist in all valid seeds / tutorial paths

---

## Dependencies
- `TODO/05-content/lore-books.md`
- `TODO/05-content/quests.md`
- `TODO/05-content/story-arcs.md`
- `TODO/02-game-world-integration/dungeon-integration.md`
- `TODO/03-procedural-pipeline/PROC-C-world-generation.md`
- future `alchemy-transmutation-crafting.md`
- current `abilities-talents.md`

## Related design docs
- `story_quests_mechanics/03-tomes-and-grimoire-progression.md`
- `story_quests_mechanics/07-story-and-quest-integration.md`

## Success Criteria
The system is successful when a player can:
- target expeditions for **specific knowledge goals**
- return to the tower and meaningfully **catalog and interpret books**
- deepen a school through study rather than only levels
- unlock structured spell mutations through library + research work
- clearly feel that **Tomes** is a primary gameplay pillar