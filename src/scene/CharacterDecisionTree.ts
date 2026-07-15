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
  rogue:             'kaykit_adventurers/Rogue',
  rogue_hooded:      'kaykit_adventurers/Rogue_Hooded',
  mage:              'kaykit_adventurers/Mage',
  human_warrior:     'kaykit_adventurers/Rogue',           // placeholder
  human_paladin:     'kaykit_adventurers/Rogue_Hooded',    // placeholder
  human_bard:        'kaykit_adventurers/Mage',            // placeholder
  skeleton_mage:     'kaykit_skeletons/Skeleton_Mage',
  skeleton_rogue:    'kaykit_skeletons/Skeleton_Rogue',
  zombie:            'kaykit_skeletons/Skeleton_Rogue',    // placeholder
  ghost:             'kaykit_skeletons/Skeleton_Mage',     // placeholder
  mystery_undead:    'kaykit_skeletons/Skeleton_Rogue',    // placeholder
  fox_rogue:         'kaykit_adventurers/Rogue',
  fox_ranger:        'kaykit_adventurers/Rogue',           // placeholder
  fox_mage:          'kaykit_adventurers/Mage',            // placeholder
  fox_mysterious:    'kaykit_adventurers/Rogue_Hooded',    // placeholder
  slime:             'slime/Slime',
  slime_arcane:      'slime/Slime',                        // placeholder
  slime_philosopher: 'slime/Slime',                        // placeholder
  slime_young:       'slime/Slime',                        // placeholder
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
      "Ah! You're awake. Excellent. My notes got completely ruined by a spilled " +
      "potion of frog-breath, so you'll have to remind me... " +
      "what exactly are you? My eyesight isn't what it used to be.",
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
        "Human! Ah, yes. The fleshy, complain-y kind. Honestly I forget you lot " +
        "exist between visits. Nothing personal. There are just so many of you " +
        "and you all sort of blur together. Now — who's going to show up here " +
        "furious about this?",
      );

      const humanChoice = await overlay.choose([
        '"My dad. He\'s a barbarian. He flips tables as a greeting. ' +
        'This tower will be rubble by Tuesday."',
        '"My partner. They\'re a paladin. Very lawful. Very good. ' +
        'Very much going to file a divine complaint about you."',
        '"Nobody. I work alone. I am the problem and also the solution."',
        '"My entire adventuring party. All six of them. One is a bard ' +
        'so they\'re probably already writing a ballad about this."',
      ]);

      if (humanChoice === 0) {
        characterId = 'human_warrior';
        await overlay.speak(
          "Ah. A barbarian parent. That explains the door-rattling constitution " +
          "and the immediate aggression. I'll reinforce the gate. " +
          "Lovely chat.",
        );
      } else if (humanChoice === 1) {
        characterId = 'human_paladin';
        await overlay.speak(
          "Oh dear. A paladin. So preachy. So relentless. " +
          "Do you know how much unsolicited divine correspondence I receive " +
          "just from knowing a paladin? It's exhausting.",
        );
      } else if (humanChoice === 2) {
        characterId = 'rogue';
        await overlay.speak(
          "A self-sufficient loner! How romantically tragic. " +
          "You have the eyes of someone who has absolutely stolen something recently. " +
          "I'm not judging. I'm writing it down.",
        );
      } else {
        characterId = 'human_bard';
        await overlay.speak(
          "A bard in the party. Wonderful. I'm going to be in a song. " +
          "You know, I have been actively avoiding that for 140 years. " +
          "It was going so well.",
        );
      }

    } else if (species === 1) {
      // ── UNDEAD ─────────────────────────────────────────────────────────────
      await overlay.speak(
        "Undead! Oh, splendid. No feeding schedule, no sleep requirements, " +
        "minimal upkeep. The economic efficiency alone is remarkable. " +
        "Now — what flavour of undead, exactly? I like to be precise in my records.",
      );

      const undeadChoice = await overlay.choose([
        '"Skeleton. The structural minimalist variety."',
        '"Zombie. But I\'m extremely articulate about it."',
        '"Ghost. I\'m technically haunting you right now. ' +
        'You didn\'t notice. That\'s fine."',
        '"I don\'t actually know. I woke up like this. It was a Tuesday."',
      ]);

      if (undeadChoice === 0) {
        characterId = 'skeleton_rogue';
        await overlay.speak(
          "Skeleton! Efficient. Percussive when walking. Truly unsettling in doorways. " +
          "Do you rattle? I find the rattling either charming or deeply unnerving " +
          "depending entirely on my blood sugar level.",
        );
      } else if (undeadChoice === 1) {
        characterId = 'zombie';
        await overlay.speak(
          "An articulate zombie! You are a genuine rarity. " +
          "Most of the ones I meet have a one-word vocabulary " +
          "and it isn't a particularly useful word in polite conversation.",
        );
      } else if (undeadChoice === 2) {
        characterId = 'ghost';
        await overlay.speak(
          "That DOES explain the cold spot. I blamed the north-facing windows. " +
          "You could at least knock. Or flicker a candle. " +
          "Something. Courtesy costs nothing, even posthumously.",
        );
      } else {
        characterId = 'mystery_undead';
        await overlay.speak(
          "The mystery undead! My absolute favourite administrative category. " +
          "We'll put 'unspecified' on the form and let future scholars " +
          "sort it out. Very exciting. For them, I mean.",
        );
      }

    } else if (species === 2) {
      // ── VULPERIA ───────────────────────────────────────────────────────────
      await overlay.speak(
        "A Vulperia! Magnificent. Mysterious, agile, radiating profound " +
        "judgment of everything in this room. Including me, I suspect. " +
        "The tail is an excellent touch. Now — what exactly do you DO? " +
        "I need it for the census.",
      );

      const foxChoice = await overlay.choose([
        '"I\'m a rogue. I steal things. Quietly, professionally, ' +
        'and with excellent taste."',
        '"Ranger. I track things through forests and occasionally shoot them."',
        '"I\'m a mage. Fire, mostly. I have questions about your bookshelves."',
        '"I\'m between career phases at the moment. It\'s complicated."',
      ]);

      if (foxChoice === 0) {
        characterId = 'fox_rogue';
        await overlay.speak(
          "The honest thief! A rare and admirable subtype. Most thieves " +
          "insist they're something else entirely. I respect the clarity. " +
          "Please don't steal anything while you're here. Again.",
        );
      } else if (foxChoice === 1) {
        characterId = 'fox_ranger';
        await overlay.speak(
          "A fox ranger tracking through forests! How aggressively on-brand. " +
          "Do you appreciate the irony, or does it just follow you around " +
          "like an awkward party member who won't take hints?",
        );
      } else if (foxChoice === 2) {
        characterId = 'fox_mage';
        await overlay.speak(
          "A pyromancer fox. I am choosing not to comment on that at any length. " +
          "I will only say: please stand away from the archives " +
          "and try not to sneeze.",
        );
      } else {
        characterId = 'fox_mysterious';
        await overlay.speak(
          "Between career phases! That's just what rogues say between heists. " +
          "It's fine. Completely relatable. I was 'between phases' " +
          "for thirty years once. It sorted itself out eventually.",
        );
      }

    } else {
      // ── SLIME ──────────────────────────────────────────────────────────────
      await overlay.speak(
        "A slime! Oh, wonderful. I had another one of you through last month — " +
        "different colour, similar energy. Tell me, is the hivemind a real thing? " +
        "I've always wanted to ask but it never seemed polite at parties.",
      );

      const slimeChoice = await overlay.choose([
        '(Vibrate at a contemplative frequency) "Bloop."',
        '(Absorb his quill entirely) "We contain multitudes."',
        '"The hivemind exists but I find it overstimulating. I prefer quiet."',
        '"What\'s a hivemind? I\'m new to... all of this."',
      ]);

      if (slimeChoice === 0) {
        characterId = 'slime';
        await overlay.speak(
          "Eloquent. Truly. I'm writing 'deep thinker — possible ancient entity' " +
          "in my notes. The brevity alone suggests either centuries of wisdom " +
          "or no opinion on the matter whatsoever. Either way: fascinating.",
        );
      } else if (slimeChoice === 1) {
        characterId = 'slime_arcane';
        await overlay.speak(
          "You've absorbed my favourite quill. It had genuine sentimental value. " +
          "I respect the power move enormously. Please — at some point — " +
          "return it. Or don't. I'll feel it in there judging me for years.",
        );
      } else if (slimeChoice === 2) {
        characterId = 'slime_philosopher';
        await overlay.speak(
          "An introvert slime! The rarest configuration. I completely understand. " +
          "I've lived alone in this tower for 140 years for nearly identical reasons. " +
          "We should NOT talk more. This is already too much.",
        );
      } else {
        characterId = 'slime_young';
        await overlay.speak(
          "New! How marvellous. The early chapters! Everything is still possible. " +
          "There will be some dissolution statistically — " +
          "but also perhaps something entirely other. Welcome to existing.",
        );
      }
    }

    // ── PHASE 3: stat allocation ───────────────────────────────────────────────
    await _pause(500);

    await overlay.speak(
      "Right then. That's the taxonomy sorted. I have just two more questions for my files. " +
      "Completely standard procedure. You can stop staring at the door like that.",
    );

    // Question 1 — approach to problems
    await overlay.speak(
      "Tell me — if you encounter a stubborn jar of pickled newt eyes, how do you open it?",
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
      "My constructs will be delivering standard tower gruel at some point this evening. " +
      "What is your immediate reaction?",
    );

    const q2 = await overlay.choose([
      "Throw it back through the slot and demand to speak with the manager.",
      "Accept it politely, wait for the footsteps to recede, then pick the lock and raid the pantry.",
      "Use the residual magic in this cell to quietly transmute it into something edible.",
      "Complain at length about the texture. Eat it anyway. Revenge requires maintaining caloric reserves.",
    ]);

    const statBonusB: StatBonus = (
      ['attack_power', 'stealth', 'magic_power', 'max_hp'] as const
    )[q2];
    overlay.showStatGain(STAT_DISPLAY[statBonusB]);

    // ── Farewell ───────────────────────────────────────────────────────────────
    await _pause(600);
    await overlay.speak(
      "Splendid! That's everything I need. " +
      "Well — you have fun in here. Don't touch the books on THAT shelf. " +
      "Or that one. Or the small humming box in the corner. " +
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
