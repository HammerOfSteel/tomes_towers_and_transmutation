/**
 * CharacterDecisionTree — the full dialogue script and branching logic.
 *
 * Pure data + async state-machine. No DOM, no Three.js.
 * Feed it an IDialogue and it will walk the conversation,
 * returning a ConversationResult when done.
 *
 * PHASE 1 — species determination (4 choices)
 * PHASE 2 — personality / class lock (4 choices, fully branched by species)
 * PHASE 3 — stat allocation (2 × 4-choice questions)
 */

import type { IDialogue } from '@/ui/IDialogue';

// ── public types ──────────────────────────────────────────────────────────────

export type CharacterId =
  | 'rogue'
  | 'rogue_hooded'
  | 'mage'
  | 'human_warrior'
  | 'human_paladin'
  | 'human_bard'
  | 'skeleton_mage'
  | 'skeleton_rogue'
  | 'zombie'
  | 'ghost'
  | 'mystery_undead'
  | 'fox_rogue'
  | 'fox_ranger'
  | 'fox_mage'
  | 'fox_mysterious'
  | 'slime'
  | 'slime_arcane'
  | 'slime_philosopher'
  | 'slime_young';

export type StatBonus =
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'constitution'
  | 'attack_power'
  | 'stealth'
  | 'magic_power'
  | 'max_hp';

export interface ConversationResult {
  characterId:  CharacterId;
  statBonuses:  [StatBonus, StatBonus];
}

/** Maps CharacterId → the charManifest model ID string. */
export const CHAR_MANIFEST_MAP: Record<CharacterId, string> = {
  // ── Core adventurers ─────────────────────────────────────────────────────
  rogue:             'kaykit_adventurers/Rogue',
  rogue_hooded:      'kaykit_adventurers/Rogue_Hooded',
  mage:              'kaykit_adventurers/Mage',
  // ── Human class variants ─────────────────────────────────────────────────
  human_warrior:     'fantasy_heroes/Knight',              // armoured fighter
  human_paladin:     'fantasy_heroes/Paladin',             // dedicated paladin
  human_bard:        'adventure/Adventurer',               // adventurer / performer
  // ── Skeleton / undead ────────────────────────────────────────────────────
  skeleton_mage:     'kaykit_skeletons/Skeleton_Mage',
  skeleton_rogue:    'kaykit_skeletons/Skeleton_Rogue',
  zombie:            'skeletons_free/Skeleton',            // shambling undead
  ghost:             'kaykit_skeletons/Skeleton_Mage',     // ethereal caster
  mystery_undead:    'fantasy_heroes/Necromancer',         // dark caster silhouette
  // ── Fox folk ─────────────────────────────────────────────────────────────
  fox_rogue:         'fox/fox',
  fox_ranger:        'fox/fox',
  fox_mage:          'fox/fox',
  fox_mysterious:    'fox/fox',
  // ── Slime forms ──────────────────────────────────────────────────────────
  slime:             'slime/Slime',
  slime_arcane:      'slime/Slime',
  slime_philosopher: 'slime/Slime',
  slime_young:       'slime/Slime',
};

/** Default lore display name per character. */
export const CHAR_DEFAULT_NAMES: Record<CharacterId, string> = {
  rogue:             'the Rogue',
  rogue_hooded:      'the Hooded',
  mage:              'the Mage',
  human_warrior:     'the Warrior',
  human_paladin:     'the Paladin',
  human_bard:        'the Bard',
  skeleton_mage:     'the Undead Mage',
  skeleton_rogue:    'the Skeleton',
  zombie:            'the Zombie',
  ghost:             'the Ghost',
  mystery_undead:    'the Undead',
  fox_rogue:         'the Fox',
  fox_ranger:        'the Fox Ranger',
  fox_mage:          'the Fox Mage',
  fox_mysterious:    'the Mysterious Fox',
  slime:             'the Slime',
  slime_arcane:      'the Arcane Slime',
  slime_philosopher: 'the Philosopher Slime',
  slime_young:       'the Young Slime',
};

/** Maps a stat bonus to its display label. */
export const STAT_DISPLAY: Record<StatBonus, string> = {
  strength:     '+2 ✦ Strength',
  agility:      '+2 ✦ Agility',
  intelligence: '+2 ✦ Intelligence',
  constitution: '+2 ✦ Constitution',
  attack_power: '+2 ✦ Attack Power',
  stealth:      '+2 ✦ Stealth',
  magic_power:  '+2 ✦ Magic Power',
  max_hp:       '+2 ✦ Max HP',
};

// ── decision tree ─────────────────────────────────────────────────────────────

export class CharacterDecisionTree {
  async run(overlay: IDialogue): Promise<ConversationResult> {

    // ── PHASE 1: taxonomic assessment ─────────────────────────────────────────
    await overlay.speak(
      "Ah! You're awake. Excellent.\n" +
      "My notes got ruined by a potion of frog-breath, so you'll have to remind me.\n" +
      "What exactly are you? My eyesight isn't what it used to be.",
    );

    const species = await overlay.choose([
      '"I\'m a human, you senile old bat. Open this door."',
      '(Rattle your bones aggressively) "Do I look like I have any skin left?"',
      '(Hiss, baring fangs) "Touch my tail and you lose a finger."',
      '(Squelch indignantly) "We... are... squishy... we are legion..."',
    ]);

    // ── PHASE 2: personality / class lock ─────────────────────────────────────
    let characterId: CharacterId;

    if (species === 0) {
      // ── HUMAN ──────────────────────────────────────────────────────────────
      await overlay.speak(
        "Human! Ah, yes. The fleshy, complain-y ones.\n" +
        "I forget you lot exist between visits. Nothing personal.\n" +
        "Who is going to show up here furious about this?",
      );

      const humanChoice = await overlay.choose([
        '"My dad. He\'s a barbarian. He flips tables as a greeting.\nThis tower will be rubble by Tuesday."',
        '"My partner. A paladin. Very lawful, very good.\nVery much going to file a divine complaint about you."',
        '"Nobody. I work alone.\nI am the problem and also the solution."',
        '"My entire adventuring party. All six of them.\nOne is a bard so they\'re already writing a ballad."',
      ]);

      if (humanChoice === 0) {
        characterId = 'human_warrior';
        await overlay.speak(
          "A barbarian parent. That explains the immediate aggression.\n" +
          "I'll reinforce the gate. Lovely chat.",
        );
      } else if (humanChoice === 1) {
        characterId = 'human_paladin';
        await overlay.speak(
          "A paladin. So preachy. So relentless.\n" +
          "I receive unsolicited divine correspondence just from knowing one.\n" +
          "It's exhausting.",
        );
      } else if (humanChoice === 2) {
        characterId = 'rogue';
        await overlay.speak(
          "A self-sufficient loner! How romantically tragic.\n" +
          "You have the eyes of someone who has absolutely stolen something recently.\n" +
          "I'm not judging. I'm writing it down.",
        );
      } else {
        characterId = 'human_bard';
        await overlay.speak(
          "A bard in the party. I'm going to be in a song.\n" +
          "I've been avoiding that for 140 years.\n" +
          "It was going so well.",
        );
      }

    } else if (species === 1) {
      // ── UNDEAD ─────────────────────────────────────────────────────────────
      await overlay.speak(
        "Undead! Oh, splendid. No feeding schedule, minimal upkeep.\n" +
        "The economic efficiency alone is remarkable.\n" +
        "What flavour of undead, exactly? I like to be precise.",
      );

      const undeadChoice = await overlay.choose([
        '"Skeleton. The structural minimalist variety."',
        '"Zombie. But I\'m extremely articulate about it."',
        '"Ghost. I\'m technically haunting you right now.\nYou didn\'t notice. That\'s fine."',
        '"I don\'t actually know. I woke up like this.\nIt was a Tuesday."',
      ]);

      if (undeadChoice === 0) {
        characterId = 'skeleton_rogue';
        await overlay.speak(
          "Skeleton! Efficient. Percussive when walking.\n" +
          "Do you rattle? I find it either charming or unsettling\n" +
          "depending entirely on my blood sugar level.",
        );
      } else if (undeadChoice === 1) {
        characterId = 'zombie';
        await overlay.speak(
          "An articulate zombie! You are a genuine rarity.\n" +
          "Most have a one-word vocabulary.\n" +
          "It isn't a useful word in polite conversation.",
        );
      } else if (undeadChoice === 2) {
        characterId = 'ghost';
        await overlay.speak(
          "That DOES explain the cold spot. I blamed the windows.\n" +
          "You could at least knock. Or flicker a candle.\n" +
          "Courtesy costs nothing, even posthumously.",
        );
      } else {
        characterId = 'mystery_undead';
        await overlay.speak(
          "The mystery undead! My favourite administrative category.\n" +
          "We'll put 'unspecified' on the form.\n" +
          "Let future scholars sort it out. Very exciting. For them.",
        );
      }

    } else if (species === 2) {
      // ── VULPERIA ───────────────────────────────────────────────────────────
      await overlay.speak(
        "A Vulperia! Magnificent. Mysterious, agile,\n" +
        "radiating profound judgment of everything in this room.\n" +
        "What exactly do you do? I need it for the census.",
      );

      const foxChoice = await overlay.choose([
        '"I\'m a rogue. I steal things.\nQuietly, professionally, and with excellent taste."',
        '"Ranger. I track things through forests\nand occasionally shoot them."',
        '"I\'m a mage. Fire, mostly.\nI have questions about your bookshelves."',
        '"I\'m between career phases at the moment.\nIt\'s complicated."',
      ]);

      if (foxChoice === 0) {
        characterId = 'fox_rogue';
        await overlay.speak(
          "The honest thief! A rare and admirable subtype.\n" +
          "Most insist they're something else. I respect the clarity.\n" +
          "Please don't steal anything while you're here. Again.",
        );
      } else if (foxChoice === 1) {
        characterId = 'fox_ranger';
        await overlay.speak(
          "A fox ranger tracking through forests!\n" +
          "How aggressively on-brand.\n" +
          "Do you appreciate the irony, or has it become background noise?",
        );
      } else if (foxChoice === 2) {
        characterId = 'fox_mage';
        await overlay.speak(
          "A pyromancer fox. I'm choosing not to comment on that.\n" +
          "Please stand away from the archives\n" +
          "and try not to sneeze.",
        );
      } else {
        characterId = 'fox_mysterious';
        await overlay.speak(
          "Between career phases! That's just what rogues say between heists.\n" +
          "Completely relatable. I was 'between phases' for thirty years.\n" +
          "It sorted itself out eventually.",
        );
      }

    } else {
      // ── SLIME ──────────────────────────────────────────────────────────────
      await overlay.speak(
        "A slime! Oh, wonderful.\n" +
        "I had one of you through last month, different colour, similar energy.\n" +
        "Is the hivemind a real thing? I've always wanted to ask.",
      );

      const slimeChoice = await overlay.choose([
        '(Vibrate at a contemplative frequency) "Bloop."',
        '(Absorb his quill entirely) "We contain multitudes."',
        '"The hivemind exists but I find it overstimulating.\nI prefer quiet."',
        '"What\'s a hivemind? I\'m new to... all of this."',
      ]);

      if (slimeChoice === 0) {
        characterId = 'slime';
        await overlay.speak(
          "Eloquent. Truly.\n" +
          "I'm writing 'deep thinker, possible ancient entity' in my notes.\n" +
          "Either way: fascinating.",
        );
      } else if (slimeChoice === 1) {
        characterId = 'slime_arcane';
        await overlay.speak(
          "You've absorbed my favourite quill. Sentimental value.\n" +
          "I respect the power move enormously.\n" +
          "Please return it. Or don't. I'll feel it judging me for years.",
        );
      } else if (slimeChoice === 2) {
        characterId = 'slime_philosopher';
        await overlay.speak(
          "An introvert slime! The rarest configuration.\n" +
          "I've lived alone in this tower for 140 years for similar reasons.\n" +
          "We should NOT talk more. This is already too much.",
        );
      } else {
        characterId = 'slime_young';
        await overlay.speak(
          "New! The early chapters! Everything is still possible.\n" +
          "There will be some dissolution statistically.\n" +
          "But also perhaps something entirely other. Welcome to existing.",
        );
      }
    }

    // ── PHASE 3: stat allocation ───────────────────────────────────────────────
    await _pause(500);

    await overlay.speak(
      "Right then. That's the taxonomy sorted.\n" +
      "Two more questions for my files. Completely standard procedure.\n" +
      "You can stop staring at the door like that.",
    );

    // Question 1 — approach to problems
    await overlay.speak(
      "Tell me. If you encounter a stubborn jar of pickled newt eyes,\n" +
      "how do you open it?",
    );

    const q1 = await overlay.choose([
      "Smash it on the floor with the nearest heavy object.",
      "Carefully pry the lid with a dagger. Or a claw. Or whatever's available.",
      "Read the enchanted label backwards. That usually reverses the enchantment.",
      "Stare at it. Very hard. Until it gives up. Everything gives up eventually.",
    ]);

    const statBonusA: StatBonus = (
      ['strength', 'agility', 'intelligence', 'constitution'] as const
    )[q1];
    overlay.showStatGain(STAT_DISPLAY[statBonusA]);

    // Question 2 — response to adversity
    await overlay.speak(
      "My constructs will deliver standard tower gruel this evening.\n" +
      "What is your immediate reaction?",
    );

    const q2 = await overlay.choose([
      "Throw it back through the slot and demand to speak with the manager.",
      "Accept it politely, wait for the footsteps, then pick the lock and raid the pantry.",
      "Use the residual magic in this cell to transmute it into something edible.",
      "Complain at length about the texture. Eat it anyway. Revenge requires calories.",
    ]);

    const statBonusB: StatBonus = (
      ['attack_power', 'stealth', 'magic_power', 'max_hp'] as const
    )[q2];
    overlay.showStatGain(STAT_DISPLAY[statBonusB]);

    // ── Farewell ───────────────────────────────────────────────────────────────
    await _pause(600);
    await overlay.speak(
      "Splendid! That's everything I need.\n" +
      "Don't touch the books on THAT shelf. Or that one.\n" +
      "I'll be upstairs. Toodles!",
    );

    return {
      characterId,
      statBonuses: [statBonusA, statBonusB],
    };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function _pause(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
