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

export type SpeciesId = 'human' | 'undead' | 'vulperia' | 'slime';

export type StoryObjectiveType =
  | 'defeat_enemies'
  | 'clear_dungeon'
  | 'reach_location'
  | 'craft_item'
  | 'survive_wave';

export interface StoryObjective {
  type:         StoryObjectiveType;
  count?:       number;   // defeat_enemies, craft_item
  targetLabel:  string;   // shown in quest log
  // reach_location: approximate tile coords (used only for display — checked by
  // proximity to any known settlement / dungeon with matching label)
  hintCol?:     number;
  hintRow?:     number;
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
          description:    "Something is causing all this. There is a dungeon nearby that smells of old magic.",
          objective:      { type: 'clear_dungeon', targetLabel: 'Clear the ruin' },
          completionText: "You find a ritual chamber. Someone has been very busy. Whoever did this is gone — but they left notes.",
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
          description:    "The absorbed information keeps suggesting you need certain materials to synthesise what you have learned. The crafting station is right there.",
          objective:      { type: 'craft_item', count: 2, targetLabel: 'Craft 2 items' },
          completionText: "You have made a potion. You are not certain how. The library book inside you seems pleased.",
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

// ── Export ────────────────────────────────────────────────────────────────────

export const STORY_LINES: Record<SpeciesId, StoryQuestLine> = {
  human:    HUMAN_STORY,
  undead:   UNDEAD_STORY,
  vulperia: VULPERIA_STORY,
  slime:    SLIME_STORY,
};

export function getStoryLine(characterId: CharacterId): StoryQuestLine {
  return STORY_LINES[speciesForCharacter(characterId)];
}
