# Alchemy, Transmutation & Crafting
> Core material-conversion layer for *Tomes, Towers & Transmutation*. Covers reagent families, refinement tiers, facility-gated crafting, potion/formula families, transmutation risk, and links to quests, companions, and defense. Depends on world/resource distribution work in 02/03 and knowledge progression in `tomes-research-spellcraft.md`.

## Status: ⚠️ GAP — design defined in `story_quests_mechanics/04-transmutation-alchemy-and-spellcrafting.md`; Phase 0 schema unblocking is now defined, later runtime phases still need production implementation

## Goals
- Make **transmutation** a pillar mechanic rather than a generic crafting sidebar
- Turn dungeon loot, gathering, and monster drops into a coherent alchemical economy
- Gate stronger outputs behind reclaimed tower facilities
- Support potion brewing, utility formulas, defense prep, and quest problem-solving
- Feed structured spellcraft, companion support, and tower defense through crafted outputs

## Scope
This file covers:
- reagent and material taxonomy
- raw → refined → specialized → signature refinement chains
- potion / formula families
- facility-gated crafting rules
- instability / risk mechanics
- crafting uses in quests and defense prep

This file does **not** cover:
- book/library progression → see `tomes-research-spellcraft.md`
- follower assignment/runtime → see future `follower-companion-system.md`
- forecast/assault loops → see future `tower-defense-domain-events.md`

---

## Phase 0 — Data Schema (content unblocker)

> Must ship before `TODO/05-content/quests.md` and `story-arcs.md` can safely reference transmutation items, formulas, or crafting-gated quest solutions. This is the schema-first step that unblocks content without requiring full alchemy runtime.

### Goals
- Define the minimum item/material/recipe contracts that authored quest and story content can safely point at
- Separate data-schema work from later crafting/facility implementation
- Prevent reward/event docs from inventing incompatible alchemy payloads

### Tasks
- [ ] Define the minimal `MaterialDef` / `ReagentDef` taxonomy:
  - `id`
  - `name`
  - `family`
  - `rarity`
  - `stability`
  - `refinementTier`
  - `originSiteFamily?`
- [ ] Define the minimal `RecipeDef` shape for authored unlocks and quest gates:
  - `id`
  - `name`
  - `category`
  - `inputs[]`
  - `outputs[]`
  - `facilityRequirement?`
  - `researchRequirementIds?`
- [ ] Define the shared enums/ID namespaces content needs first:
  - material families
  - refinement tiers
  - recipe categories (`potion | utility | transmutation | defense_prep | companion_support`)
  - facility IDs used by recipe gating
- [ ] Define the reward/reference payloads 05 content will need to point at:
  - material stack reward
  - recipe unlock reward
  - permanent transmutation-capacity upgrade reward
  - crafted-solution objective target IDs
- [ ] Document which 05-content references must wait on these schemas:
  - transmutation item rewards
  - crafted quest-solution beats
  - defense-prep consumable references
  - facility-process unlock rewards

### Done means
- 05-content can reference stable material/reagent/recipe IDs without pretending crafting delivery already exists
- later alchemy implementation phases can build against a fixed contract instead of backfilling content names

---

## Phase ATC-1 — Material Taxonomy & Inventory Model

> Needs Phase 0 first.

### Goals
- Classify all alchemical inputs into clear families
- Prevent future inventory bloat
- Make resource distribution readable across world and dungeon types

### Tasks
- [ ] Add typed material families:
  - Botanical Reagents
  - Mineral / Structural Matter
  - Monster-Derived Components
  - Arcane Residues
  - Knowledge Artifacts
- [ ] Add per-item metadata fields:
  - `family`
  - `rarity`
  - `stability`
  - `originSiteFamily`
  - `refinementTier`
  - `schoolBias?`
  - `companionUse?`
  - `defenseUse?`
- [ ] Define refinement tiers:
  - `raw`
  - `refined`
  - `specialized`
  - `signature`
- [ ] Add category-first inventory presentation rules
- [ ] Add validation tests:
  - every transmutation item belongs to a valid family
  - refinement tiers never skip illegally
  - signature items require non-raw inputs

### Done means
- every transmutation item has a clear systemic identity
- inventory and drop tables can stay manageable as content grows

---

## Phase ATC-2 — Tower Facility Gating

### Goals
- Make reclaimed tower rooms mechanically meaningful
- Tie crafting power to domain progression
- Distinguish where each type of work happens

### Tasks
- [ ] Define facility capabilities for:
  - Alchemical Workshop
  - Brewing Chamber
  - Library / Archive
  - Workshop / Spell Lab
  - Menagerie / Followers’ Den
  - Observatory / High Arcane Chamber
- [ ] Add facility requirements to crafting/research recipes
- [ ] Define which outputs are available at each facility tier
- [ ] Add room restoration dependencies for advanced process families
- [ ] Support temporary lockout/damage interactions for future defense consequences
- [ ] Add tests:
  - recipes requiring a facility cannot be crafted early
  - restored facility state unlocks appropriate formula classes

### Done means
- the tower materially grows as more than scenery
- crafting progression is spatially anchored to reclaimed rooms

---

## Phase ATC-3 — Refinement Chains & Core Processes

### Goals
- Implement the raw → refined → specialized → signature conversion fantasy
- Make processing a strategic step rather than instant recipe clicking
- Establish a reusable transmutation backbone

### Tasks
- [ ] Define baseline refinement processes:
  - distill
  - powder
  - clarify
  - bind
  - suspend
  - stabilize
  - infuse
- [ ] Create starter refinement chains for:
  - herbs → extracts
  - crystal/ore → powders/salts
  - slime/monster parts → gels/residues
  - ward matter → solvents/sealants
- [ ] Add output traits:
  - volatile
  - stable
  - restorative
  - conductive
  - corrosive
  - binding
  - sovereign
- [ ] Add process summaries/hints to UI
- [ ] Add unit tests:
  - valid chain outputs
  - no illegal loops
  - trait propagation behaves predictably

### Done means
- players can meaningfully transform field materials into stronger forms
- later potion and spellcraft systems have a stable input backbone

---

## Phase ATC-4 — Potion & Formula Families

### Goals
- Make potion crafting broader than healing
- Support combat, expedition utility, control, and defense prep
- Give different builds reasons to care about alchemy

### Tasks
- [ ] Define recipe families:
  - Survival
  - Aggression
  - Control
  - Expedition Utility
  - Defense Preparation
- [ ] Create first recipes for each family, for example:
  - healing draught
  - ward tonic
  - burn oil
  - shock tincture
  - smoke vial
  - binding foam
  - night sight
  - hidden-door solvent
  - follower rally brew
  - anti-swarm fumes
- [ ] Add effect metadata:
  - duration
  - target type
  - stack behavior
  - compatible school/doctrine tags
- [ ] Link some formulas to book/research prerequisites
- [ ] Add UI differentiation between:
  - combat consumables
  - expedition tools
  - defense prep items
- [ ] Add tests for:
  - recipe legality
  - duration/stack constraints
  - gating by facility and knowledge

### Done means
- alchemy matters to all major loops, not just HP recovery
- players can prepare for expeditions and defenses in differentiated ways

---

## Phase ATC-5 — Companion & Defense Support Formulas

### Goals
- Make alchemy useful for non-solo and domain play
- Support tamed creatures, followers, and defense assignments
- Tie crafted outputs directly into the “Towers” pillar

### Tasks
- [ ] Define companion support formula classes:
  - taming aids
  - field enhancements
  - recovery formulas
  - behavioral doctrine brews
- [ ] Add sample effects:
  - longer spare/capture window
  - role-specific buff for vanguard/artillery/scout types
  - post-defense wound recovery
  - morale restoration
  - anti-corruption cleanse
- [ ] Define defense prep consumable classes:
  - corridor denial resin
  - emergency barrier phial
  - beast lure bundle
  - construct disruption salts
  - anti-swarm smoke
- [ ] Add compatibility tags for future follower role system
- [ ] Add tests for:
  - follower-targetable effects
  - defense prep item classification
  - mutually exclusive brew rules where relevant

### Done means
- crafting directly strengthens companion strategy
- tower defense prep is clearly alchemy-enabled rather than turret-driven

---

## Phase ATC-6 — Quest & Site Integration

### Goals
- Make transmutation solve real game problems
- Tie recipe access and ingredient sourcing to site families and authored quests
- Ensure the world teaches the system naturally

### Tasks
- [ ] Add quest hooks for:
  - disruption reagent crafting
  - stabilization tonic crafting
  - ritual solvent preparation
  - anomaly analysis
  - facility restoration material needs
- [ ] Expand resource/site mapping so worldgen and dungeon families bias:
  - botanical reagents in groves/greenhouse chains
  - conductors and salts in mines/works
  - residues in arcane breach sites
  - memory/death matter in tombs/barrows
  - volatile catalysts in alchemy vaults
- [ ] Tie at least one general quest reward to a permanent transmutation upgrade
- [ ] Tie species arcs to preferred reagent/problem families
- [ ] Add content audits ensuring each major site family yields useful transmutation inputs

### Done means
- transmutation is learned through play, not only menus
- dungeons and overworld routes matter because of what they feed back to the tower

---

## Phase ATC-7 — Risk, Instability & Verification

### Goals
- Preserve the tone of dangerous magical work
- Add risk without making the system annoying
- verify persistence and usability

### Tasks
- [ ] Add instability concepts for advanced recipes:
  - backlash chance
  - contamination chance
  - threat generation increase
  - follower corruption risk on forbidden paths
- [ ] Constrain instability to advanced/volatile branches, not all crafting
- [ ] Define mitigation methods:
  - stabilizers
  - facility upgrades
  - research unlocks
  - safer variants with weaker output
- [ ] Save/load coverage for:
  - discovered recipes
  - refined materials
  - in-progress or queued processes if implemented
- [ ] Unit tests:
  - instability only appears where intended
  - mitigation reduces risk correctly
  - crafted outputs serialize/restore cleanly
- [ ] E2E:
  - gather raw input → refine → craft potion → use in expedition
  - craft defense prep item → confirm available during forecast/prep flow
  - complete transmutation quest step via crafted solution

### Done means
- advanced transmutation feels powerful and risky
- the system is robust enough for long-form progression

---

## Dependencies
- `TODO/06-game-systems/tomes-research-spellcraft.md`
- `TODO/05-content/quests.md`
- `TODO/05-content/story-arcs.md`
- `TODO/02-game-world-integration/dungeon-integration.md`
- `TODO/03-procedural-pipeline/PROC-C-world-generation.md`
- `TODO/01-overworld-studio/game-inventory.md`

## Related design docs
- `story_quests_mechanics/04-transmutation-alchemy-and-spellcrafting.md`
- `story_quests_mechanics/05-dungeon-loot-and-resource-ecology.md`
- `story_quests_mechanics/06-towers-companions-and-defense-events.md`

## Success Criteria
The system is successful when a player can:
- understand what kinds of materials they are collecting and why
- return to the tower and meaningfully refine them
- craft formulas that matter in combat, quests, expeditions, and defenses
- see tower room reclamation unlock stronger transmutation capacity
- clearly feel that **Transmutation** is a primary gameplay pillar