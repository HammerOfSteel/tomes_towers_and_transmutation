/**
 * StoryQuestLine — per-species narrative quest chains.
 *
 * Each of the 4 species has a unique 4-act story that runs in parallel with
 * procedural overworld quests. Acts unlock in sequence; each act has 2–3 beats.
 *
 * Objectives only reference mechanics that already exist in the game:
 *   defeat_enemies  — kill N enemies (tracked by SlimeEnemy death callback)
 *   clear_dungeon   — clear any dungeon floor (tracked by SceneManager)
 *   reach_location  — get within 6 tiles of (col, row) on the overworld
 *   craft_item      — craft N items at any crafting station
 *   interact_key    — pick up the workbench_key interactable (master key in basement)
 *   read_lore       — open and read any book/lectern at least once since this beat started
 *   explore_floor   — visit a floor index not seen before this beat started (SceneManager.uniqueFloorsVisited)
 *   survive_wave    — placeholder: fulfilled immediately until WaveManager exists
 *
 * Species → CharacterId mapping:
 *   human    — rogue | rogue_hooded | mage | human_warrior | human_paladin | human_bard
 *   undead   — skeleton_mage | skeleton_rogue | zombie | ghost | mystery_undead
 *   vulperia — fox_rogue | fox_ranger | fox_mage | fox_mysterious
 *   slime    — slime | slime_arcane | slime_philosopher | slime_young
 */

import type { CharacterId } from '@/scene/CharacterDecisionTree';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpeciesId =
  | 'human' | 'undead' | 'vulperia' | 'slime'
  // NS0: New Tier-1 species added with princess-creator expansion
  | 'elf' | 'celestial' | 'draconic';

export type StoryObjectiveType =
  | 'defeat_enemies'
  | 'clear_dungeon'
  | 'reach_location'
  | 'craft_item'
  | 'explore_floor'
  | 'survive_wave'
  | 'interact_key'
  | 'read_lore'
  /** Phase C1: complete a full dialogue with a specific NPC (by npcId). */
  | 'talk_to_npc'
  /** Phase C1: defeat a specific named enemy instance (by enemyId). */
  | 'defeat_elite';

export interface StoryObjective {
  type:         StoryObjectiveType;
  count?:       number;   // defeat_enemies, craft_item
  targetLabel:  string;   // shown in quest log
  // reach_location: approximate tile coords (used only for display — checked by
  // proximity to any known settlement / dungeon with matching label)
  hintCol?:     number;
  hintRow?:     number;
  /** talk_to_npc: canonical NPC id to complete dialogue with. */
  npcId?:       string;
  /** defeat_elite: canonical enemy id of the named elite to kill. */
  enemyId?:     string;
}

// ── Quest reward (Phase C1) ───────────────────────────────────────────────────

/** Structured reward granted when a quest or act completes. */
export interface QuestReward {
  xp:           number;
  gold?:        number;
  /** ID of an item added to the player's inventory (e.g. 'forgeborn_blade'). */
  itemId?:      string;
  /** Spell ID unlocked in the spellbook (e.g. 'nova_burst'). */
  spellId?:     string;
  /** Flat stat bonus applied to progression.mods. */
  statBonus?:   Partial<{
    meleeDamageMult: number;
    spellDamageMult: number;
    maxHpBonus:      number;
    movementMult:    number;
  }>;
  /** Zone or area unlocked (used by DiscoveryTracker). */
  unlockZone?:  string;
  /** Display name shown in the reward toast. */
  label:        string;
}

export interface StoryBeat {
  id:             string;
  title:          string;
  description:    string;
  objective:      StoryObjective;
  completionText: string;   // shown in a brief toast when the beat completes
  rewardXp:       number;
  rewardGold:     number;
}

export interface StoryAct {
  id:    string;
  title: string;
  intro: string;  // shown as a brief toast when the act begins
  beats: StoryBeat[];
}

export interface StoryQuestLine {
  speciesId:    SpeciesId;
  displayTitle: string;
  synopsis:     string;
  acts:         StoryAct[];
}

// ── Species mapping ───────────────────────────────────────────────────────────

const SPECIES_MAP: Record<CharacterId, SpeciesId> = {
  rogue:             'human',
  rogue_hooded:      'human',
  mage:              'human',
  human_warrior:     'human',
  human_paladin:     'human',
  human_bard:        'human',
  skeleton_mage:     'undead',
  skeleton_rogue:    'undead',
  zombie:            'undead',
  ghost:             'undead',
  mystery_undead:    'undead',
  fox_rogue:         'vulperia',
  fox_ranger:        'vulperia',
  fox_mage:          'vulperia',
  fox_mysterious:    'vulperia',
  slime:             'slime',
  slime_arcane:      'slime',
  slime_philosopher: 'slime',
  slime_young:       'slime',
  // NS3: New Tier-1 species
  elf_scholar:     'elf',
  elf_wanderer:    'elf',
  celestial_dawn:  'celestial',
  celestial_dusk:  'celestial',
  draconic_fire:   'draconic',
  draconic_scale:  'draconic',
};

export function speciesForCharacter(id: CharacterId): SpeciesId {
  return SPECIES_MAP[id];
}

// ── Story lines ───────────────────────────────────────────────────────────────

const HUMAN_STORY: StoryQuestLine = {
  speciesId:    'human',
  displayTitle: "The Kingdom's Call",
  synopsis:     'Barbarian warlords are mustering beyond the northern hills. The kingdom needs a hero — whether you want to be one or not.',
  acts: [
    {
      id:    'tower_prologue',
      title: 'Prologue — The Tower',
      intro: "You wake in a tower you do not remember entering. The door at the bottom is locked. Someone has gone to considerable effort to put you here.",
      beats: [
        {
          id:             'tower_p1',
          title:          'Hunger Sharpens the Mind',
          description:    "You are hungry, restless, and somewhat annoyed. Explore the ground floor. There must be a pantry key hidden somewhere in this study — a wizard this organised would not leave food inaccessible.",
          objective:      { type: 'explore_floor', targetLabel: 'Explore the ground floor' },
          completionText: 'You find a small iron key tucked behind a loose stone. The pantry. Finally.',
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p2',
          title:          'A View from Somewhere Higher',
          description:    "The ground floor is well-stocked but suffocating. There is a locked door at the top of the first staircase. Find the floor key — it must be in the study.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the upper floor key' },
          completionText: "A brass key behind the bookcase. The upper floor holds a library — and a window with a view of the world outside.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p3',
          title:          'The Wizard\'s Warning',
          description:    "In the library you find a note pinned to the telescope: 'Do not go to the basement.' This is not a request you intend to honour. The workshop floor is next — and the basement key must be up here somewhere.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the workshop key' },
          completionText: 'A tarnished key between two thick volumes of arcane theory. The workshop is unlocked.',
          rewardXp:       40,
          rewardGold:     0,
        },
        {
          id:             'tower_p4',
          title:          'Down Into Dark',
          description:    "The basement. The wizard said not to come here. The basement key was on the workshop bench, abandoned in haste. Descend and find the spare master key on the workbench.",
          objective:      { type: 'interact_key', targetLabel: 'Pick up the master key' },
          completionText: 'You find the plans. The journals. The centuries of notes. And on the workbench — the spare master key he forgot. The front door is one floor up. But the plans... the plans are extraordinary.',
          rewardXp:       100,
          rewardGold:     0,
        },
      ],
    },
    {
      id:    'human_act1',
      title: 'Act I — Rumours of War',
        intro: 'Word reaches you: raiders are massing. If anyone is going to do something, it is apparently you.',
      beats: [
        {
          id:             'human_a1b1',
          title:          'Prove Your Worth',
          description:    "The garrison captain won't talk to you until you've shown you can handle yourself. Clear out some of the trouble lurking nearby.",
          objective:      { type: 'defeat_enemies', count: 8, targetLabel: 'Defeat 8 enemies' },
          completionText: 'The captain raises an eyebrow. "Not bad. Come inside."',
          rewardXp:       60,
          rewardGold:     20,
        },
        {
          id:             'human_a1b2',
          title:          'Find a Settlement',
          description:    'The captain needs you to report to the nearest garrison town. Get there.',
          objective:      { type: 'reach_location', targetLabel: 'Reach a settlement' },
          completionText: "You find the settlement. It is smaller than you hoped and more frightened than you expected.",
          rewardXp:       40,
          rewardGold:     15,
        },
      ],
    },
    {
      id:    'human_act2',
      title: 'Act II — The Spy in the Ruins',
      intro: 'Someone is feeding the barbarians information. The trail leads to an old ruin.',
      beats: [
        {
          id:             'human_a2b1',
          title:          'Into the Ruins',
          description:    "The garrison's informant fled into a nearby dungeon when cornered. Clear it out and find what they left behind.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear a dungeon' },
          completionText: "You find a coded message. It is worse than the captain feared.",
          rewardXp:       100,
          rewardGold:     35,
        },
        {
          id:             'human_a2b2',
          title:          'Stock Up',
          description:    "The road ahead is long. Craft some supplies before you go.",
          objective:      { type: 'craft_item', count: 2, targetLabel: 'Craft 2 items' },
          completionText: "You pack your things. The journey north begins.",
          rewardXp:       50,
          rewardGold:     10,
        },
      ],
    },
    {
      id:    'human_act3',
      title: 'Act III — The Gates Hold',
      intro: 'The warlord\'s vanguard has reached the walls. The garrison is outnumbered.',
      beats: [
        {
          id:             'human_a3b1',
          title:          'Thin the Horde',
          description:    "The first wave is already at the walls. Cut through them before they break the gate.",
          objective:      { type: 'defeat_enemies', count: 20, targetLabel: 'Defeat 20 enemies' },
          completionText: "The first wave breaks. The second is already forming.",
          rewardXp:       150,
          rewardGold:     50,
        },
        {
          id:             'human_a3b2',
          title:          'Survive the Night',
          description:    "Hold the gate until dawn. Just survive.",
          objective:      { type: 'survive_wave', targetLabel: 'Survive the wave' },
          completionText: "Dawn comes. The warlord retreats — for now.",
          rewardXp:       120,
          rewardGold:     40,
        },
      ],
    },
    {
      id:    'human_act4',
      title: 'Act IV — End It',
      intro: "The warlord fled to a keep somewhere in the wilds. This ends where he hides.",
      beats: [
        {
          id:             'human_a4b1',
          title:          'Track the Warlord',
          description:    "His scattered troops are everywhere. Fight through them to find the keep.",
          objective:      { type: 'defeat_enemies', count: 15, targetLabel: 'Defeat 15 enemies' },
          completionText: "A survivor points you toward a dungeon on the hill.",
          rewardXp:       140,
          rewardGold:     45,
        },
        {
          id:             'human_a4b2',
          title:          "The Warlord's Keep",
          description:    "Clear the keep. End this.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the keep' },
          completionText: "It is over. The kingdom will remember this — though probably not your name correctly.",
          rewardXp:       250,
          rewardGold:     120,
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const UNDEAD_STORY: StoryQuestLine = {
  speciesId:    'undead',
  displayTitle: 'The Unliving Question',
  synopsis:     "You are dead. Technically. The more pressing question is: why are you still walking around, and is it too late to ask for a refund?",
  acts: [
    {
      id:    'tower_prologue',
      title: 'Prologue — The Tower',
      intro: "You were dead. You are apparently less dead now. You are in a tower. These facts do not yet form a coherent narrative.",
      beats: [
        {
          id:             'tower_p1',
          title:          'The Hollow Hunger',
          description:    "You do not require food in the traditional sense. But there is something in this tower drawing you — a wrongness, a residue of old magic. Explore the ground floor. Find what anchors you here.",
          objective:      { type: 'explore_floor', targetLabel: 'Explore the ground floor' },
          completionText: "A binding circle, barely visible under the rug. Subtle. Professional. You are impressed despite yourself.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p2',
          title:          'Above the Binding',
          description:    "The upper floors are outside the binding's range. A locked door at the first staircase. The key is somewhere in this study — find it.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the upper floor key' },
          completionText: "The library is rich with arcane texts. A note on the telescope reads: 'Do not go to the basement.' You find this suspicious.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p3',
          title:          'The Workshop',
          description:    "The workshop floor holds tools, half-finished experiments, and a door to the basement. The workshop key was hidden badly — behind a skull, of all things. At least someone has taste.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the workshop key' },
          completionText: "The basement door stands before you. Every instinct — even the undead ones — says something important is down there.",
          rewardXp:       40,
          rewardGold:     0,
        },
        {
          id:             'tower_p4',
          title:          'The Reason',
          description:    "Descend. Find what the wizard did not want you to find. The basement key was on the workshop bench — left in haste. Find the spare master key on the workbench.",
          objective:      { type: 'interact_key', targetLabel: 'Pick up the master key' },
          completionText: "Journals. Centuries of them. Notes on dozens of candidates. And a letter, freshly abandoned: 'Spare master key — workbench.' He left in a hurry. But the plans... you have been chosen for something.",
          rewardXp:       100,
          rewardGold:     0,
        },
      ],
    },
    {
      id:    'undead_act1',
      title: 'Act I — Why Am I Moving?',
      intro: "You wake up. This is unexpected. The last thing you remember is considerably worse than waking up.",
      beats: [
        {
          id:             'undead_a1b1',
          title:          'Others Like You',
          description:    "You are not the only mistake someone made tonight. The other newly-risen seem less philosophical about it. Deal with them.",
          objective:      { type: 'defeat_enemies', count: 5, targetLabel: 'Defeat 5 enemies' },
          completionText: "They were easier to stop than you expected. You file that away.",
          rewardXp:       50,
          rewardGold:     0,
        },
        {
          id:             'undead_a1b2',
          title:          'Find the Source',
          description:    "Something is causing all this. There is a dungeon nearby that smells of old magic. Find the ritual chamber. They left notes.",
          objective:      { type: 'read_lore', targetLabel: 'Read the ritual notes' },
          completionText: "You find a ritual chamber. Someone has been very busy. Whoever did this is gone — but the notes they left behind are detailed. Uncomfortably so. They were expecting someone exactly like you.",
          rewardXp:       90,
          rewardGold:     20,
        },
      ],
    },
    {
      id:    'undead_act2',
      title: 'Act II — The Necromancer\'s Mess',
      intro: "The notes point to a necromancer operating out of a nearby ruin. They made you. You have questions.",
      beats: [
        {
          id:             'undead_a2b1',
          title:          'Prepare for the Confrontation',
          description:    "You will need to be ready. Craft what you need before you go.",
          objective:      { type: 'craft_item', count: 2, targetLabel: 'Craft 2 items' },
          completionText: "As ready as a recently-deceased person can be.",
          rewardXp:       60,
          rewardGold:     15,
        },
        {
          id:             'undead_a2b2',
          title:          "Into the Necromancer's Workshop",
          description:    "Clear out the workshop and find whoever is responsible for your current situation.",
          objective:      { type: 'clear_dungeon', targetLabel: "Clear the necromancer's lair" },
          completionText: "The necromancer is not there. But their research is. You learn a great deal about yourself. Some of it is upsetting.",
          rewardXp:       130,
          rewardGold:     50,
        },
      ],
    },
    {
      id:    'undead_act3',
      title: 'Act III — Mob Justice',
      intro: "Word has spread. The living are not enthusiastic about a self-aware undead wandering the countryside.",
      beats: [
        {
          id:             'undead_a3b1',
          title:          'The Extermination Party',
          description:    "A settlement has organised what they are calling a \"cleansing\". They are coming for you. You would like them not to.",
          objective:      { type: 'survive_wave', targetLabel: 'Survive the mob' },
          completionText: "They scatter. You consider writing them a strongly worded letter. You decide against it.",
          rewardXp:       110,
          rewardGold:     30,
        },
        {
          id:             'undead_a3b2',
          title:          'Find Somewhere Quieter',
          description:    "There is a settlement further out where the inhabitants are reportedly more broad-minded. Get there.",
          objective:      { type: 'reach_location', targetLabel: 'Reach a distant settlement' },
          completionText: "They are not more broad-minded. But they are too frightened to do anything about it.",
          rewardXp:       50,
          rewardGold:     25,
        },
      ],
    },
    {
      id:    'undead_act4',
      title: 'Act IV — The Lich\'s Offer',
      intro: "A powerful undead lord has noticed you. They have an offer. You have the right to be suspicious.",
      beats: [
        {
          id:             'undead_a4b1',
          title:          "Pass the Trial",
          description:    "The Lich Lord requires a demonstration. Destroy enough of the living to prove you are serious.",
          objective:      { type: 'defeat_enemies', count: 20, targetLabel: 'Defeat 20 enemies' },
          completionText: '"Acceptable," the voice says, from everywhere at once.',
          rewardXp:       160,
          rewardGold:     60,
        },
        {
          id:             'undead_a4b2',
          title:          "Claim the Lich's Dungeon",
          description:    "The Lich offers their abandoned keep as a base — if you can clear out the squatters they failed to mention.",
          objective:      { type: 'clear_dungeon', targetLabel: "Clear the Lich's keep" },
          completionText: "The keep is yours. It smells of old bones and ambition. You feel at home.",
          rewardXp:       280,
          rewardGold:     130,
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const VULPERIA_STORY: StoryQuestLine = {
  speciesId:    'vulperia',
  displayTitle: 'The Price on Your Head',
  synopsis:     "Someone posted a very generous bounty for you. You have not decided whether to be flattered or alarmed. Perhaps both.",
  acts: [
    {
      id:    'tower_prologue',
      title: 'Prologue — The Tower',
      intro: "You are in a tower. You did not choose to be in a tower. You have begun mapping exit routes, because of course you have — and found none. Yet.",
      beats: [
        {
          id:             'tower_p1',
          title:          'Map the Territory',
          description:    "A Vulperia does not panic. A Vulperia assesses. The ground floor is your starting point. Find the pantry key — hidden somewhere in the study — and establish what resources you actually have.",
          objective:      { type: 'explore_floor', targetLabel: 'Map the ground floor' },
          completionText: "Well-stocked. Thought-out. Whoever put you here planned for a long stay. This is either comforting or alarming, depending on their intentions.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p2',
          title:          'Higher Ground',
          description:    "The first staircase is locked. The key is in this study — you can smell the iron. Find it, get above the fog layer, and get a proper view of what is outside.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the upper floor key' },
          completionText: "The library. A telescope. And a note in controlled handwriting: 'Do not go to the basement.' The wizard has very specific rules. Noted.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p3',
          title:          'The Workshop',
          description:    "The workshop must hold the basement key. A Vulperia who ignores a note saying 'do not enter' is just following instinct. Find the key.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the workshop key' },
          completionText: "The key was tucked inside a glove. An amateur's hiding spot. The workshop is open. The basement door waits.",
          rewardXp:       40,
          rewardGold:     0,
        },
        {
          id:             'tower_p4',
          title:          'The Collection',
          description:    "The basement key was abandoned on the workshop bench. He left in a hurry. Descend — and find the spare master key on the workbench.",
          objective:      { type: 'interact_key', targetLabel: 'Pick up the master key' },
          completionText: "Plans. Profiles. Decades of surveillance notes — and one about you, with unsettling accuracy. The spare master key is on the workbench. But the files... your name appears on the first page of a very long document.",
          rewardXp:       100,
          rewardGold:     0,
        },
      ],
    },
    {
      id:    'vulperia_act1',
      title: 'Act I — Someone Wants You Dead',
      intro: "You find a wanted poster. The illustration is flattering. The reward is not.",
      beats: [
        {
          id:             'vulperia_a1b1',
          title:          'Bounty Hunters Already',
          description:    "They found you faster than expected. Discourage them.",
          objective:      { type: 'defeat_enemies', count: 6, targetLabel: 'Defeat 6 bounty hunters' },
          completionText: "They were professionals. Whoever posted that bounty is paying well.",
          rewardXp:       60,
          rewardGold:     25,
        },
        {
          id:             'vulperia_a1b2',
          title:          'Find Out Who',
          description:    "There is a settlement with a bounty office. Someone there will know something — or be persuaded to.",
          objective:      { type: 'reach_location', targetLabel: 'Reach a settlement' },
          completionText: "A name. A very old name. This is more complicated than you thought.",
          rewardXp:       40,
          rewardGold:     20,
        },
      ],
    },
    {
      id:    'vulperia_act2',
      title: 'Act II — The Contraband Run',
      intro: "You need money and allies. An old contact has a job. The timing is, as always, terrible.",
      beats: [
        {
          id:             'vulperia_a2b1',
          title:          'Prepare the Shipment',
          description:    "The contact needs supplies you do not have. Make them.",
          objective:      { type: 'craft_item', count: 3, targetLabel: 'Craft 3 items' },
          completionText: "Good enough. Now move.",
          rewardXp:       70,
          rewardGold:     20,
        },
        {
          id:             'vulperia_a2b2',
          title:          'Deliver It',
          description:    "Get the goods to the drop settlement without dying. Easy.",
          objective:      { type: 'reach_location', targetLabel: 'Reach the drop point' },
          completionText: "The contact is pleased. You now have allies. Cheap ones, but allies.",
          rewardXp:       80,
          rewardGold:     50,
        },
      ],
    },
    {
      id:    'vulperia_act3',
      title: 'Act III — The Net Tightens',
      intro: "They found the contact. Now they know where you are.",
      beats: [
        {
          id:             'vulperia_a3b1',
          title:          "The Bounty Office",
          description:    "Burn the records. The bounty office is inside a fortified ruin. Clear it.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the bounty office' },
          completionText: "Records destroyed. The bounty is still active — whoever posted it did not need paperwork.",
          rewardXp:       140,
          rewardGold:     55,
        },
        {
          id:             'vulperia_a3b2',
          title:          'The Main Force',
          description:    "They sent everyone. Hold them off.",
          objective:      { type: 'survive_wave', targetLabel: 'Survive the hunter force' },
          completionText: "They will regroup. You will be gone before they do.",
          rewardXp:       120,
          rewardGold:     40,
        },
      ],
    },
    {
      id:    'vulperia_act4',
      title: 'Act IV — Ghost in the Wind',
      intro: "You know who posted the bounty. Time to make sure they regret it.",
      beats: [
        {
          id:             'vulperia_a4b1',
          title:          'Scatter the Sweep',
          description:    "They sent a final sweep force. Make them regret it.",
          objective:      { type: 'defeat_enemies', count: 18, targetLabel: 'Defeat 18 enemies' },
          completionText: "They scatter. Word spreads: this particular fox is more trouble than the gold is worth.",
          rewardXp:       150,
          rewardGold:     65,
        },
        {
          id:             'vulperia_a4b2',
          title:          'The Sanctuary',
          description:    "There is a place in the far wilds where no bounty poster has ever been pinned. Get there.",
          objective:      { type: 'reach_location', targetLabel: 'Reach the sanctuary' },
          completionText: "You sit down for the first time in what feels like weeks. Nobody knows where you are. It is wonderful.",
          rewardXp:       220,
          rewardGold:     100,
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

const SLIME_STORY: StoryQuestLine = {
  speciesId:    'slime',
  displayTitle: 'A Philosophical Ooze',
  synopsis:     "You are a slime. You have recently become aware that you are a slime. These two facts are proving very difficult to process simultaneously.",
  acts: [
    {
      id:    'tower_prologue',
      title: 'Prologue — The Tower',
      intro: "You are in a tower. You absorbed part of the doorframe while trying to leave. The door remains locked. You are not sure which of you is more surprised.",
      beats: [
        {
          id:             'tower_p1',
          title:          'The Absorbing Problem of Hunger',
          description:    "You are hungry. You absorbed a candle and a bootlace. Neither helped. There is presumably food somewhere on the ground floor. Explore. Try not to absorb anything important.",
          objective:      { type: 'explore_floor', targetLabel: 'Find something edible' },
          completionText: "You found the pantry key inside a jar of pickled... something. You ate the jar. And the pickles. You feel much better.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p2',
          title:          'Curiosity Is an Extremely Solvent Quality',
          description:    "The first staircase has a locked door. You find a key hidden in the study — you absorbed it by accident and then carefully reconstituted it. Progress. The library above has a window.",
          objective:      { type: 'explore_floor', targetLabel: 'Reach the library floor' },
          completionText: "The library is magnificent. You absorbed one page of a book before you could stop yourself. It tasted of advanced transmutation theory. A note on the telescope says 'Do not go to the basement.' You have already forgotten reading it.",
          rewardXp:       30,
          rewardGold:     0,
        },
        {
          id:             'tower_p3',
          title:          'The Workshop Smells Interesting',
          description:    "The workshop floor is full of interesting substances. You find the workshop key and resist absorbing the entire workbench. Mostly. The basement calls.",
          objective:      { type: 'explore_floor', targetLabel: 'Explore the workshop' },
          completionText: "You may have accidentally absorbed a small vial of something that was labelled 'DO NOT'. You feel fizzy. In a good way.",
          rewardXp:       40,
          rewardGold:     0,
        },
        {
          id:             'tower_p4',
          title:          'The Basement Is Full of Extremely Interesting Things',
          description:    "The basement key was on the workbench — you absorbed it and reconstituted it immediately, you are getting better at this. Descend. Find the spare master key on the workbench.",
          objective:      { type: 'interact_key', targetLabel: 'Pick up the master key' },
          completionText: "Journals! Plans! A whole room of documents you could absorb! You restrain yourself to reading. Barely. Your name (or rather, a very detailed description of you) is on the front page. And on the workbench: the spare master key. The front door is one floor up. You are not sure you want to leave yet.",
          rewardXp:       100,
          rewardGold:     0,
        },
      ],
    },
    {
      id:    'slime_act1',
      title: 'Act I — What Is This?',
      intro: "You exist. This is a very new development. Everything is interesting. Everything is also slightly edible. You are not sure how you feel about that.",
      beats: [
        {
          id:             'slime_a1b1',
          title:          'Establish Personhood',
          description:    "Some of the other creatures in this area do not seem to recognise you as a person. This is a philosophical crisis and also a practical one. Defend yourself.",
          objective:      { type: 'defeat_enemies', count: 4, targetLabel: 'Defeat 4 enemies' },
          completionText: "You are still uncertain what you are. You are, however, certain that you are not easy to kill.",
          rewardXp:       40,
          rewardGold:     0,
        },
        {
          id:             'slime_a1b2',
          title:          'Find the Library',
          description:    "Someone told you (by screaming) that there is an ancient library to the south. It probably has answers. It definitely has books. You are interested in both.",
          objective:      { type: 'reach_location', targetLabel: 'Reach the library settlement' },
          completionText: "The library exists. The librarian is deeply unhappy about your presence. You will need to grow on them. Possibly literally.",
          rewardXp:       50,
          rewardGold:     5,
        },
      ],
    },
    {
      id:    'slime_act2',
      title: 'Act II — The Absorption Problem',
      intro: "You accidentally absorbed some arcane residue from the library shelf. Now you have opinions about theoretical magic. This is confusing.",
      beats: [
        {
          id:             'slime_a2b1',
          title:          'Process the Knowledge',
          description:    "The absorbed information keeps suggesting you should read more. It wants context. The library shelf is right there and nothing has stopped you yet.",
          objective:      { type: 'read_lore', targetLabel: 'Read something in the library' },
          completionText: "You have absorbed another text. It was a philosophical treatise on the nature of identity. You are not certain if this helped. It definitely added opinions.",
          rewardXp:       80,
          rewardGold:     20,
        },
        {
          id:             'slime_a2b2',
          title:          'Clear the Absorbed Memory',
          description:    "One of the absorbed tomes contained a dungeon map. Your body is now trying to navigate there. You have decided to just go.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the remembered dungeon' },
          completionText: "You have resolved the internal navigation conflict. The dungeon is clear. You feel lighter. Marginally.",
          rewardXp:       120,
          rewardGold:     40,
        },
      ],
    },
    {
      id:    'slime_act3',
      title: 'Act III — Unwanted Attention',
      intro: "It turns out that a self-aware slime who clears dungeons is considered threatening by several parties. You find this hurtful.",
      beats: [
        {
          id:             'slime_a3b1',
          title:          'The Extermination Committee',
          description:    "A village has formed a committee. Its mandate is you, specifically. Survive the vote.",
          objective:      { type: 'survive_wave', targetLabel: 'Survive the committee' },
          completionText: "The committee is disbanded, mainly because they all ran away. You consider writing a letter of complaint to the village council.",
          rewardXp:       100,
          rewardGold:     30,
        },
        {
          id:             'slime_a3b2',
          title:          'Demonstrate Heroism',
          description:    "Perhaps if you help enough, they will stop trying to destroy you. Prove slimes can be heroic.",
          objective:      { type: 'defeat_enemies', count: 12, targetLabel: 'Defeat 12 enemies' },
          completionText: "Several villages now refer to you as \"the helpful slime\" rather than \"the dangerous slime\". Progress.",
          rewardXp:       110,
          rewardGold:     35,
        },
      ],
    },
    {
      id:    'slime_act4',
      title: 'Act IV — Become More',
      intro: "There is a legend of an elder slime who has lived for centuries and accumulated knowledge the way other beings accumulate regrets. You should find them.",
      beats: [
        {
          id:             'slime_a4b1',
          title:          'Find the Elder',
          description:    "The elder slime is somewhere in the far reaches of the world. Reach the place they were last reported.",
          objective:      { type: 'reach_location', targetLabel: 'Find the elder slime' },
          completionText: '"Oh," the elder says, regarding you with seventeen concentric eyes. "Another one. Come in."',
          rewardXp:       160,
          rewardGold:     60,
        },
        {
          id:             'slime_a4b2',
          title:          "The Wizard's Trap",
          description:    "A wizard who studies slimes has laid a trap in a nearby ruin. They want to dissect you for research. Clear the ruin. Politely.",
          objective:      { type: 'clear_dungeon', targetLabel: "Clear the wizard's trap" },
          completionText: "The wizard will not be dissecting anyone for some time. You have absorbed their research notes. You know more about slimes than they ever will.",
          rewardXp:       260,
          rewardGold:     110,
        },
      ],
    },
  ],
};

// ── NS1: New Tier-1 species — stub story lines (full arcs in Phase NS1) ─────

const ELF_STORY: StoryQuestLine = {
  speciesId:    'elf',
  displayTitle: 'The Second Time Around',
  synopsis:     'She has been in a tower before. A different one. A different century. She is less surprised than she should be, which says something.',
  acts: [
    {
      id:    'tower_prologue',
      title: 'Prologue — The Tower',
      intro: "The staircase layout is different. The books are in the wrong order. These are the only comforts. You begin, as you always do, by reading the problem.",
      beats: [
        {
          id: 'tower_p1', title: 'Not The First Time',
          description:    "You have been in a tower before. The procedure is the same: find what you need, find the exit. Explore the ground floor. There will be a key.",
          objective:      { type: 'explore_floor', targetLabel: 'Explore the ground floor' },
          completionText: "Exactly where you expected it. The wizard at least has consistent methodology.", rewardXp: 30, rewardGold: 0,
        },
        {
          id: 'tower_p2', title: 'The Library Has Opinions',
          description:    "The first staircase is locked. The key is in the study. Find it — the books can wait, despite what they say about themselves.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the upper floor key' },
          completionText: "A library with a telescope. A note: 'Do not go to the basement.' You recognise that note. A different handwriting, but the same note.", rewardXp: 30, rewardGold: 0,
        },
        {
          id: 'tower_p3', title: 'The Workshop Is Familiar',
          description:    "The workshop key. Always in the workshop, always badly hidden. Find it.",
          objective:      { type: 'explore_floor', targetLabel: 'Find the workshop key' },
          completionText: "Inside a glove. The third wizard in a row who hid it in a glove. You despair of their creativity.", rewardXp: 40, rewardGold: 0,
        },
        {
          id: 'tower_p4', title: 'Annotated In Your Own Hand',
          description:    "Descend. The spare master key is on the workbench. As always.",
          objective:      { type: 'interact_key', targetLabel: 'Pick up the master key' },
          completionText: "You find the spare key. And in the archives: a book you annotated. Three hundred years ago. In a different tower. Your handwriting hasn't changed. His notes reference you by name.", rewardXp: 100, rewardGold: 0,
        },
      ],
    },
    {
      id: 'elf_act1', title: 'Act I — Something Familiar',
      intro: "A book in the library is annotated in your own handwriting. You do not remember writing it. You remember writing the book it was copied from.",
      beats: [
        {
          id: 'elf_a1b1', title: 'Secure the Area',
          description:    "There are enemies between you and answers. Remove them.",
          objective:      { type: 'defeat_enemies', count: 8, targetLabel: 'Defeat 8 enemies' },
          completionText: "Dealt with.", rewardXp: 60, rewardGold: 20,
        },
        {
          id: 'elf_a1b2', title: 'Find the Record',
          description:    "There is a settlement with an archive that predates the tower. Find what record exists of the previous candidate.",
          objective:      { type: 'reach_location', targetLabel: 'Reach the settlement archive' },
          completionText: "The record names your predecessor. The description is accurate. She escaped. The wizard built a new tower.", rewardXp: 70, rewardGold: 20,
        },
      ],
    },
    {
      id: 'elf_act2', title: 'Act II — The Century Gap',
      intro: "There is a gap in the records. Forty years where no one saw what happened. You were here for part of it.",
      beats: [
        {
          id: 'elf_a2b1', title: 'Into the Old Records',
          description:    "Read what remains of the archive.",
          objective:      { type: 'read_lore', targetLabel: 'Read the old archive' },
          completionText: "You find the gap. And at the edge of it, your name, in someone else's handwriting.", rewardXp: 90, rewardGold: 25,
        },
        {
          id: 'elf_a2b2', title: 'Clear the Path',
          description:    "Whatever was buried in that dungeon to seal the records is still active. Clear it.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the sealed archive dungeon' },
          completionText: "The seal breaks. The records are incomplete. But you know enough.", rewardXp: 130, rewardGold: 50,
        },
      ],
    },
    {
      id: 'elf_act3', title: 'Act III — Making It Difficult',
      intro: "Solmor has noticed your interest in the records. He has sent people to discourage further investigation.",
      beats: [
        {
          id: 'elf_a3b1', title: 'Discourage the Discouragements',
          description:    "A retrieval party. Discourage them.",
          objective:      { type: 'defeat_enemies', count: 12, targetLabel: 'Defeat 12 enemies' },
          completionText: "Discouraged.", rewardXp: 100, rewardGold: 30,
        },
        {
          id: 'elf_a3b2', title: 'Survive the Night',
          description:    "More coming.",
          objective:      { type: 'survive_wave', targetLabel: 'Survive the retrieval wave' },
          completionText: "They send fewer each time, which is instructive.", rewardXp: 120, rewardGold: 40,
        },
      ],
    },
    {
      id: 'elf_act4', title: 'Act IV — The Graceful Exit',
      intro: "She could leave. She has what she came for. She is choosing not to, for now.",
      beats: [
        {
          id: 'elf_a4b1', title: 'Settle the Score',
          description:    "There is a dungeon where the original binding ward was constructed. Clear it.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the binding ward dungeon' },
          completionText: "The ward is dismantled. The binding dissolves. The century-gap closes.", rewardXp: 200, rewardGold: 80,
        },
        {
          id: 'elf_a4b2', title: 'Make It Official',
          description:    "Reach the settlement that holds the founding charter of this region. They should know what the tower is.",
          objective:      { type: 'reach_location', targetLabel: 'Reach the founding settlement' },
          completionText: "They know now. They will remember. She leaves, as she always leaves: without hurry, without fanfare, and without the wizard noticing until significantly later.", rewardXp: 260, rewardGold: 110,
        },
      ],
    },
  ],
};

// ── Celestial stub ─────────────────────────────────────────────────────────

const CELESTIAL_STORY: StoryQuestLine = {
  speciesId:    'celestial',
  displayTitle: 'Atmospheric Re-entry',
  synopsis:     "She fell. This happens. The tower was just where she landed. She has filed a formal complaint and is waiting for a response.",
  acts: [
    {
      id: 'tower_prologue', title: 'Prologue — The Tower',
      intro: "The tower is cold. The ceiling has three cracks. She has counted them. The ceiling is, objectively, insufficient.",
      beats: [
        { id: 'tower_p1', title: 'Orientation', description: "Assess the ground floor. There is a key somewhere.", objective: { type: 'explore_floor', targetLabel: 'Explore the ground floor' }, completionText: "The pantry key. At least there is food.", rewardXp: 30, rewardGold: 0 },
        { id: 'tower_p2', title: 'Elevation', description: "The staircase key. Find it.", objective: { type: 'explore_floor', targetLabel: 'Find the upper floor key' }, completionText: "A library. A window. And a note: 'Do not go to the basement.' She notes this with patience.", rewardXp: 30, rewardGold: 0 },
        { id: 'tower_p3', title: 'The Workshop', description: "The workshop key.", objective: { type: 'explore_floor', targetLabel: 'Find the workshop key' }, completionText: "The workshop is full of incomplete experiments. She identifies three significant errors.", rewardXp: 40, rewardGold: 0 },
        { id: 'tower_p4', title: 'The Anchor', description: "Descend. Find the spare master key.", objective: { type: 'interact_key', targetLabel: 'Pick up the master key' }, completionText: "The key. And in the archive: a paper titled 'Celestial Binding Efficacy at Ground Level'. Results: INCONCLUSIVE, in very large letters. She is not surprised.", rewardXp: 100, rewardGold: 0 },
      ],
    },
    {
      id: 'celestial_act1', title: 'Act I — Something Is Blocking the Signal',
      intro: "Her connection to the stars is suppressed. Something in the tower is doing this deliberately.",
      beats: [
        { id: 'celestial_a1b1', title: 'Clear the Interference', description: "Enemies nearby are disrupting the investigation.", objective: { type: 'defeat_enemies', count: 8, targetLabel: 'Defeat 8 enemies' }, completionText: "Clearer now.", rewardXp: 60, rewardGold: 20 },
        { id: 'celestial_a1b2', title: 'Find the Ward', description: "A settlement scholar knows about binding wards. Find them.", objective: { type: 'reach_location', targetLabel: 'Reach the scholar settlement' }, completionText: "The scholar is helpful and frightened in approximately equal measure.", rewardXp: 60, rewardGold: 20 },
      ],
    },
    {
      id: 'celestial_act2', title: 'Act II — The Ward Stone',
      intro: "There is a ward stone somewhere in the tower region. It was placed specifically to block celestial abilities.",
      beats: [
        { id: 'celestial_a2b1', title: 'Research', description: "The answer is in the archive.", objective: { type: 'read_lore', targetLabel: 'Read the celestial binding research' }, completionText: "The ward stone is on floor 7. Placed within the last fifty years. By someone who knew.", rewardXp: 80, rewardGold: 25 },
        { id: 'celestial_a2b2', title: 'Reach Floor 7', description: "Clear the path.", objective: { type: 'clear_dungeon', targetLabel: 'Clear to the ward stone' }, completionText: "The ward stone is found. The connection flickers.", rewardXp: 130, rewardGold: 45 },
      ],
    },
    {
      id: 'celestial_act3', title: 'Act III — They Do Not Want It Removed',
      intro: "Word has reached someone that she is close to the ward stone. They have sent people.",
      beats: [
        { id: 'celestial_a3b1', title: 'Remove the Obstruction', description: "A guard party. Remove them.", objective: { type: 'defeat_enemies', count: 14, targetLabel: 'Defeat 14 enemies' }, completionText: "Removed.", rewardXp: 110, rewardGold: 35 },
        { id: 'celestial_a3b2', title: 'Survive the Second Wave', description: "Another wave.", objective: { type: 'survive_wave', targetLabel: 'Survive the second wave' }, completionText: "It ends. The ward stone is unprotected.", rewardXp: 120, rewardGold: 40 },
      ],
    },
    {
      id: 'celestial_act4', title: 'Act IV — Reconnection',
      intro: "The ward stone can be destroyed or repurposed. The stars have been patient.",
      beats: [
        { id: 'celestial_a4b1', title: 'Destroy the Stone', description: "Clear the dungeon that houses it.", objective: { type: 'clear_dungeon', targetLabel: 'Destroy the ward stone dungeon' }, completionText: "The ward shatters. The signal returns. The stars, after some consideration, acknowledge receipt of her complaint.", rewardXp: 210, rewardGold: 85 },
        { id: 'celestial_a4b2', title: 'Signal Home', description: "Reach a high point and broadcast.", objective: { type: 'reach_location', targetLabel: 'Reach the signal point' }, completionText: "She stands in an open field. The light returns. The complaint has been logged. Resolution: pending, estimated arrival: one to four centuries. She decides not to wait.", rewardXp: 250, rewardGold: 110 },
      ],
    },
  ],
};

// ── Draconic stub ──────────────────────────────────────────────────────────

const DRACONIC_STORY: StoryQuestLine = {
  speciesId:    'draconic',
  displayTitle: 'The Fire That Stays',
  synopsis:     "She is not angry. She is patient. The scales absorbing the wizard's ambient spellwork are a side effect. She has not explained this.",
  acts: [
    {
      id: 'tower_prologue', title: 'Prologue — The Tower',
      intro: "The tower is cooler than she expected. The books are not fire-resistant. She makes adjustments.",
      beats: [
        { id: 'tower_p1', title: 'Heat Retention', description: "The ground floor. There will be a key.", objective: { type: 'explore_floor', targetLabel: 'Explore the ground floor' }, completionText: "The pantry key. The food is adequate. The temperature is not.", rewardXp: 30, rewardGold: 0 },
        { id: 'tower_p2', title: 'Upward', description: "Staircase key. Study.", objective: { type: 'explore_floor', targetLabel: 'Find the upper floor key' }, completionText: "The library. A telescope. A note: 'Do not go to the basement.' She notes this with the patience of a species that measures time in centuries.", rewardXp: 30, rewardGold: 0 },
        { id: 'tower_p3', title: 'The Forge Floor', description: "The workshop. She approves of it.", objective: { type: 'explore_floor', targetLabel: 'Find the workshop key' }, completionText: "The forge is cold. She considers warming it up and decides this is not the moment.", rewardXp: 40, rewardGold: 0 },
        { id: 'tower_p4', title: 'The Proof', description: "Descend. Find the spare master key.", objective: { type: 'interact_key', targetLabel: 'Pick up the master key' }, completionText: "The key. And in the archive: a star chart noting three constellations as \"formerly draconic territorial claims.\" Solmor's note reads: \"current occupant: human wizard.\" She disagrees with this assessment.", rewardXp: 100, rewardGold: 0 },
      ],
    },
    {
      id: 'draconic_act1', title: 'Act I — The Hoard Instinct',
      intro: "She keeps finding rooms she wants to claim. This is, apparently, cultural. She is choosing to document it.",
      beats: [
        { id: 'draconic_a1b1', title: 'Establish Territory', description: "There are creatures in her claimed areas. Remove them.", objective: { type: 'defeat_enemies', count: 10, targetLabel: 'Defeat 10 enemies' }, completionText: "The area is clear. She places a very small stone in the corner. This is not symbolic. It is definitely symbolic.", rewardXp: 70, rewardGold: 25 },
        { id: 'draconic_a1b2', title: 'Find the Old Maps', description: "A settlement holds maps predating the tower. Find them.", objective: { type: 'reach_location', targetLabel: 'Reach the map settlement' }, completionText: "The maps confirm what she suspected. This land was draconic territory. Several centuries ago. She considers the implications.", rewardXp: 60, rewardGold: 20 },
      ],
    },
    {
      id: 'draconic_act2', title: 'Act II — Old Claim',
      intro: "The land the tower stands on was draconic territory. There are plaques. The wizard did not read them.",
      beats: [
        { id: 'draconic_a2b1', title: 'Find the Plaques', description: "The archive will have records.", objective: { type: 'read_lore', targetLabel: 'Read the territorial records' }, completionText: "Three plaques. Two in good condition. One partially melted by someone who was, probably, annoyed.", rewardXp: 80, rewardGold: 20 },
        { id: 'draconic_a2b2', title: 'Clear the Disputed Dungeon', description: "A dungeon on the old territorial boundary has been occupied by something that is not welcome.", objective: { type: 'clear_dungeon', targetLabel: 'Clear the disputed dungeon' }, completionText: "Clear. She places another small stone. This is still not symbolic.", rewardXp: 120, rewardGold: 50 },
      ],
    },
    {
      id: 'draconic_act3', title: 'Act III — They Noticed',
      intro: "The fact of her clearing dungeons and reading territorial records has attracted attention.",
      beats: [
        { id: 'draconic_a3b1', title: 'A Formal Objection', description: "A party has been sent to formally object. She will formally disagree.", objective: { type: 'defeat_enemies', count: 15, targetLabel: 'Defeat 15 enemies' }, completionText: "The objection has been noted and declined.", rewardXp: 120, rewardGold: 40 },
        { id: 'draconic_a3b2', title: 'The Siege', description: "They sent more.", objective: { type: 'survive_wave', targetLabel: 'Survive the siege' }, completionText: "It ends. They do not come back. She is faintly disappointed — she was beginning to warm up.", rewardXp: 130, rewardGold: 50 },
      ],
    },
    {
      id: 'draconic_act4', title: 'Act IV — Reclamation',
      intro: "She does not want the tower. She wants it acknowledged that she could take the tower. These are different.",
      beats: [
        { id: 'draconic_a4b1', title: 'The Final Dungeon', description: "There is a dungeon at the old territorial heart. Clear it. Formally reclaim.", objective: { type: 'clear_dungeon', targetLabel: 'Clear the territorial heart dungeon' }, completionText: "The dungeon is clear. She places a very large stone. This is a little symbolic.", rewardXp: 220, rewardGold: 90 },
        { id: 'draconic_a4b2', title: 'The Declaration', description: "Reach the settlement that controls the local historical record. They will note this.", objective: { type: 'reach_location', targetLabel: 'Reach the record-keeping settlement' }, completionText: "The record is updated. The territory is noted as \"under draconic advisory oversight.\" She considers this adequate. She leaves. The stones remain.", rewardXp: 260, rewardGold: 110 },
      ],
    },
  ],
};

// ── Export ────────────────────────────────────────────────────────────────────

export const STORY_LINES: Record<SpeciesId, StoryQuestLine> = {
  human:     HUMAN_STORY,
  undead:    UNDEAD_STORY,
  vulperia:  VULPERIA_STORY,
  slime:     SLIME_STORY,
  // NS1: New Tier-1 species
  elf:       ELF_STORY,
  celestial: CELESTIAL_STORY,
  draconic:  DRACONIC_STORY,
};

export function getStoryLine(characterId: CharacterId): StoryQuestLine {
  return STORY_LINES[speciesForCharacter(characterId)];
}

/** Get a story line directly by species ID (for princess-creator mode). */
export function getStoryLineBySpecies(species: SpeciesId): StoryQuestLine {
  return STORY_LINES[species];
}
