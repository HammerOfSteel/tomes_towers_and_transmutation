/**
 * CharacterDecisionTree — the full dialogue script and branching logic.
 *
 * Pure data + async state-machine. No DOM, no Three.js.
 * Feed it a DialogueOverlay and it will walk the conversation,
 * returning a ConversationResult when done.
 *
 * PHASE 1 — species determination (always 4 choices)
 * PHASE 2 — backstory / class lock (1–3 choices, branched by species)
 * PHASE 3 — stat allocation (2 × 4-choice questions, always)
 */

import type { DialogueOverlay } from '@/ui/DialogueOverlay';

// ── public types ──────────────────────────────────────────────────────────────

export type CharacterId =
  | 'rogue'
  | 'rogue_hooded'
  | 'mage'
  | 'skeleton_mage'
  | 'skeleton_rogue'
  | 'slime'
  | 'fox_rogue';

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
  statBonuses:  [StatBonus, StatBonus];  // exactly two
}

/** Maps CharacterId → the charManifest model ID string. */
export const CHAR_MANIFEST_MAP: Record<CharacterId, string> = {
  rogue:          'kaykit_adventurers/Rogue',
  rogue_hooded:   'kaykit_adventurers/Rogue_Hooded',
  mage:           'kaykit_adventurers/Mage',
  skeleton_mage:  'kaykit_skeletons/Skeleton_Mage',
  skeleton_rogue: 'kaykit_skeletons/Skeleton_Rogue',
  slime:          'slime/Slime',
  fox_rogue:      'kaykit_adventurers/Rogue',  // placeholder — see NEW_GAME.md NG-5
};

/** Default lore display name per character. */
export const CHAR_DEFAULT_NAMES: Record<CharacterId, string> = {
  rogue:          'the Rogue',
  rogue_hooded:   'the Hooded',
  mage:           'the Mage',
  skeleton_mage:  'the Undead Mage',
  skeleton_rogue: 'the Skeleton Rogue',
  slime:          'the Slime',
  fox_rogue:      'the Fox',
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
  async run(overlay: DialogueOverlay): Promise<ConversationResult> {
    // ── PHASE 1: taxonomic assessment ──────────────────────────────────────────
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

    // ── PHASE 2: backstory ──────────────────────────────────────────────────────
    let characterId: CharacterId;

    if (species === 0) {
      // Human branch
      await overlay.speak(
        'Human? Ah, yes. The fleshy, complain-y ones. Well, I need to know who I should ' +
        'expect to come banging on my tower door. Who is going to be mildly ' +
        'inconvenienced by your disappearance?',
      );

      const humanChoice = await overlay.choose([
        '"My dad. He\'s massive, furious, and doesn\'t know what an \'inside voice\' is. He\'s going to smash this tower to rubble."',
        '"My boyfriend. He\'s a knight in shining armor. The glare is why I wear this hood. But he will find me."',
        '"My uncle. He\'s a ranger. He spent my whole life trying to teach me to stay \'out of range\' of trouble. Guess I failed."',
      ]);

      if (humanChoice === 0) {
        characterId = 'rogue';
        await overlay.speak(
          'Mmm. *(scribbles frantically)* ' +
          '"Reinforce. Front. Gate." ' +
          'Yes, well. Lovely.',
        );
      } else if (humanChoice === 1) {
        characterId = 'rogue_hooded';
        await overlay.speak(
          'Ugh. *(visibly shudders)* ' +
          'Paladins. So preachy. ' +
          'So much unsolicited divine commentary.',
        );
      } else {
        characterId = 'mage';
        await overlay.speak(
          '*(brightens noticeably)* ' +
          'A fellow academic of the ranged arts! ' +
          'How charming. I do enjoy a methodical approach to not being found.',
        );
      }

    } else if (species === 1) {
      // Undead branch
      await overlay.speak(
        'Undead! Oh, marvelous. No feeding required. Cuts down on the grocery budget ' +
        'immensely. How did you end up so… calcified?',
      );

      const undeadChoice = await overlay.choose([
        '"An ancient lich, a botched dungeon dive, and a warrior party leader who insisted we \'push ahead just one more room\'."',
        '"Tragic romance. My undead minion boyfriend wouldn\'t leave me alone even after death. We got separated when you dragged me here."',
      ]);

      if (undeadChoice === 0) {
        characterId = 'skeleton_mage';
        await overlay.speak(
          '*(chuckles warmly)* ' +
          'Classic. Middle. Management. Error. ' +
          'I\'ve written extensively on the subject.',
        );
      } else {
        characterId = 'skeleton_rogue';
        await overlay.speak(
          '*(sighs with profound wistfulness)* ' +
          'Ah. Young, eternal, co-dependent love. ' +
          'The most durable enchantment there is.',
        );
      }

    } else if (species === 2) {
      // Vulperia branch — auto-locked, no further choice
      characterId = 'fox_rogue';
      await overlay.speak(
        'A Vulperia! Fascinating. So mysterious. So brooding. ' +
        'So much shedding on my stone floors.',
      );
      // Beat — player gets a moment to feel seen
      await _pause(600);
      await overlay.speak(
        '*(wisely says nothing further)*\n' +
        'Lone wolf type, I presume? ' +
        'Though you did get captured, so…',
      );

    } else {
      // Slime branch — auto-locked, no further choice
      characterId = 'slime';
      await overlay.speak(
        'A slime! Oh, lovely. I had another one of you earlier, just a different color. ' +
        'Do you all share a hivemind, or…?',
      );
      await _pause(800);
      await overlay.speak(
        '*(takes careful note of the profound existential silence)* ' +
        'Splendid. I\'ll just… not ask any follow-up questions then.',
      );
    }

    // ── PHASE 3: stat allocation ────────────────────────────────────────────────
    await _pause(500);

    await overlay.speak(
      'Right, well, that\'s the demographics sorted. Just a few more questions for my ' +
      'files. Totally standard procedure, I assure you.',
    );

    // Question 1
    await overlay.speak(
      'Tell me — if you encounter a stubborn jar of pickled newt eyes, how do you open it?',
    );

    const q1 = await overlay.choose([
      'Smash it with the nearest heavy object.',
      'Carefully pry the seal open with a dagger or sharp claw.',
      'Read the enchanted label to reverse the vacuum seal.',
      'Stare at it until it gives up. Or swallow the whole jar.',
    ]);

    const statBonusA: StatBonus = (['strength', 'agility', 'intelligence', 'constitution'] as const)[q1];
    overlay.showStatGain(STAT_DISPLAY[statBonusA]);

    // Question 2
    await overlay.speak(
      'I\'m going to have my constructs deliver standard tower gruel for dinner. ' +
      'What is your immediate reaction?',
    );

    const q2 = await overlay.choose([
      'Throw it directly into your stupid face.',
      'Wait until you leave, then pick the lock and raid your pantry for the good cheese.',
      'Use the latent magical residue in the cell to transmute it into passable stew.',
      'Complain loudly about the texture, but eat it anyway because revenge requires calories.',
    ]);

    const statBonusB: StatBonus = (['attack_power', 'stealth', 'magic_power', 'max_hp'] as const)[q2];
    overlay.showStatGain(STAT_DISPLAY[statBonusB]);

    // Farewell
    await _pause(700);
    await overlay.speak(
      'Splendid! Well, you have fun in here. ' +
      'Don\'t touch the books on that shelf — they\'re highly volatile. ' +
      'I\'ll be upstairs if you need me, which you won\'t, because the door is locked. ' +
      'Toodles!',
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
