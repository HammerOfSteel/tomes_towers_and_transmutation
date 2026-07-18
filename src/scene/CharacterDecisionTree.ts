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
  | 'slime_young'
  // NS3: New Tier-1 species
  | 'elf_scholar'
  | 'elf_wanderer'
  | 'celestial_dawn'
  | 'celestial_dusk'
  | 'draconic_fire'
  | 'draconic_scale';

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
  // NS3: New Tier-1 species — use closest available models as stand-ins
  elf_scholar:     'kaykit_adventurers/Mage',
  elf_wanderer:    'adventure/Adventurer',
  celestial_dawn:  'fantasy_heroes/Paladin',
  celestial_dusk:  'fantasy_heroes/Necromancer',
  draconic_fire:   'fantasy_heroes/Knight',
  draconic_scale:  'fantasy_heroes/Knight',
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
  // NS3: New Tier-1 species names
  elf_scholar:     'the Elf Scholar',
  elf_wanderer:    'the Wandering Elf',
  celestial_dawn:  'the Dawn Celestial',
  celestial_dusk:  'the Dusk Celestial',
  draconic_fire:   'the Fire-Blooded',
  draconic_scale:  'the Scale-Armoured',
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
      // NS3: New Tier-1 species choices
      '(Flicker briefly) "Yes. I\'ve been in a tower before.\nSeveral, actually. Though usually more intentionally."',
      '(Emit a faint ambient glow) "You\'re uncomfortable. That\'s the light.\nI can\'t turn it off. I\'ve tried."',
      '(Let your scales catch the firelight) "Your wards have been absorbing the ambient spellwork for three days.\nI assumed you knew."',
    ]);

    // ── PHASE 2: personality / class lock ─────────────────────────────────────
    let characterId: CharacterId = 'rogue';  // default fallback

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

    } else if (species === 3) {
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

    } else if (species === 4) {
      // ── ELF ────────────────────────────────────────────────────────────────
      await overlay.speak(
        "An elf! I can tell by the complete absence of surprise.\n" +
        "Either you've been in a tower before, or you simply don't show alarm.\n" +
        "I suspect the former. How many towers is this?",
      );

      const elfChoice = await overlay.choose([
        '"This would be the third. Your methodology is consistent\nbut your hiding spot for the basement key is not."',
        '"I\'ve lost count. Towers run together after the first century.\nYours has a better library than average."',
      ]);

      if (elfChoice === 0) {
        characterId = 'elf_scholar';
        await overlay.speak(
          "The third. And you've already found the pattern.\n" +
          "I should rethink the key placement.\n" +
          "Or just accept this was inevitable.",
        );
      } else {
        characterId = 'elf_wanderer';
        await overlay.speak(
          "A compliment! From an elf!\n" +
          "I'm putting this in the tower's official record under 'rare events'.\n" +
          "The library appreciates being seen.",
        );
      }

    } else if (species === 5) {
      // ── CELESTIAL ──────────────────────────────────────────────────────────
      await overlay.speak(
        "A celestial! That's...\n" +
        "It's very bright in here suddenly. That's you, isn't it.\n" +
        "I've been trying to recreate that effect artificially for fifteen years.",
      );

      const celestialChoice = await overlay.choose([
        '"It\'s ambient. I can\'t turn it off.\nI\'ve filed a complaint about this. I\'m still waiting for a response."',
        '"The paper you have on celestial binding in your archive.\nPage fourteen has a significant error."',
      ]);

      if (celestialChoice === 0) {
        characterId = 'celestial_dawn';
        await overlay.speak(
          "Filed a complaint! With whom exactly?\n" +
          "The celestial bureaucracy! I have so many questions.\n" +
          "This is unprecedented. Please don't leave.",
        );
      } else {
        characterId = 'celestial_dusk';
        await overlay.speak(
          "Page fourteen!\n" +
          "I knew something was wrong with page fourteen.\n" +
          "Please. What's the error. I'll get a quill.",
        );
      }

    } else if (species === 6) {
      // ── DRACONIC ───────────────────────────────────────────────────────────
      await overlay.speak(
        "Draconic! That explains a great deal.\n" +
        "Your scales have been absorbing the ambient spellwork\n" +
        "for approximately seventy-two hours. I noticed.",
      );

      const draconicChoice = await overlay.choose([
        '"I assumed you knew. You should put up a sign."',
        '"I noticed you noticed. I\'ve been waiting to see\nif you would mention it. You took three days."',
      ]);

      if (draconicChoice === 0) {
        characterId = 'draconic_fire';
        await overlay.speak(
          "A sign.\n" +
          "'Warning: ambient spellwork may be absorbed by visiting draconic entities.'\n" +
          "I'm making a note to install one. This is extremely reasonable.",
        );
      } else {
        characterId = 'draconic_scale';
        await overlay.speak(
          "You were waiting to see how long it took me.\n" +
          "That is an extremely draconic approach to social interaction.\n" +
          "I mean that as a compliment.",
        );
      }
    }

    // ── PHASE 3: stat allocation ───────────────────────────────────────────────
    await _pause(500);

    // Transition line adapts to species
    const TRANSITION: readonly string[] = [
      // human
      "Right then. That's the paperwork sorted.\n" +
      "Two more questions. Standard intake procedure.\n" +
      "You can stop rattling the door.",
      // undead
      "Excellent. The taxonomy is resolved.\n" +
      "Two further questions for completeness. Entirely bureaucratic.\n" +
      "I am not stalling. The door has a timer.",
      // vulperia
      "Good. Classification complete.\n" +
      "Two remaining questions. Don't look at me like that.\n" +
      "I can feel you judging the filing system from here.",
      // slime
      "Wonderful. That's the naming sorted.\n" +
      "Two small questions remain. Please try to hold a roughly consistent shape.\n" +
      "It helps me maintain eye contact.",
      // elf
      "Right. I have two remaining questions.\n" +
      "They're the same questions I ask everyone. I'm told they're revealing.\n" +
      "You've probably heard them before.",
      // celestial
      "Two more questions. Standard procedure.\n" +
      "I'll try not to be distracted by the ambient light.\n" +
      "No promises.",
      // draconic
      "Two more questions. Completely standard.\n" +
      "I'll keep them brief.\n" +
      "The ward absorption should stabilise once you're settled.",
    ];
    await overlay.speak(TRANSITION[Math.min(species, TRANSITION.length - 1)]);

    // ── Q1: approaches (species-specific framing, same stat mapping) ──────────
    const Q1_PROMPTS: readonly string[] = [
      // human — jar of pickled newt eyes
      "Tell me. If you encounter a stubborn jar of pickled newt eyes,\n" +
      "how do you open it?",
      // undead — a sealed coffin you want OUT of
      "Suppose you find yourself sealed inside a coffin.\n" +
      "Inconvenient, but familiar territory for your type.\n" +
      "How do you get out?",
      // vulperia — an enchanted locked chest
      "There is a locked chest. You want what's inside.\n" +
      "The lock is enchanted. The enchantment is watching you.\n" +
      "What do you do?",
      // slime — a very small gap you need to get through
      "There is a gap in the wall. Annoyingly small.\n" +
      "Something interesting is on the other side.\n" +
      "What is your approach?",
    ];
    const Q1_CHOICES: readonly (readonly [string, string, string, string])[] = [
      // human
      [
        "Smash it on the floor with the nearest heavy object.",
        "Carefully pry the lid with a dagger. Works on most enchanted lids.",
        "Read the label backwards. That usually reverses the enchantment.",
        "Stare at it. Very hard. Until it gives up. Everything gives up eventually.",
      ],
      // undead
      [
        "Force it open with whatever structural integrity I still have.",
        "Feel for air gaps. There's always a way out if you're patient.",
        "Recall the unsealing cantrip. I learned it for reasons.",
        "Wait. I have nothing but time. The wood will rot eventually.",
      ],
      // vulperia
      [
        "Apply appropriate force in the right place. Quickly.",
        "Study the lock's rhythm. Every enchantment has a pattern.",
        "Engage the enchantment in polite conversation until it's confused.",
        "Sit near it. Very visibly. Until someone else opens it out of discomfort.",
      ],
      // slime
      [
        "Push. Harder. It will yield eventually. Everything yields to sufficient pressure.",
        "Find the edges. There is always a slightly larger gap if you look carefully.",
        "Absorb some of the wall. Technically also getting through.",
        "Simply exist near the gap and wait for it to become philosophically irrelevant.",
      ],
    ];
    await overlay.speak(Q1_PROMPTS[Math.min(species, Q1_PROMPTS.length - 1)]);
    const q1 = await overlay.choose(Q1_CHOICES[species] as unknown as string[]);

    const statBonusA: StatBonus = (
      ['strength', 'agility', 'intelligence', 'constitution'] as const
    )[q1];
    overlay.showStatGain(STAT_DISPLAY[statBonusA]);

    // Brief species-aware reaction from the wizard
    const Q1_REACTIONS: readonly (readonly [string, string, string, string])[] = [
      // human
      [
        "Direct. Possibly reimbursable. We'll discuss the floor later.",
        "A dagger! Classic. You're a 'prepared for most things' sort. Noted.",
        "Enchanted labels! Yes. Only works if you can read them. Can you?\n" +
        "...Of course you can. Why did I ask.",
        "Passive stubbornness. A legitimate strategy. Slow, but legitimate.",
      ],
      // undead
      [
        "Brute persistence. Appropriate. Very on-brand for your condition.",
        "Patience and spatial awareness. Very sensible given your, ah, timeline.",
        "You know unsealing cantrips. You've been in a coffin before.\n" +
        "More than once, I'd guess. The answer is always more than once.",
        "Indefinite patience. The resting state. I respect the commitment.",
      ],
      // vulperia
      [
        "Direct action. No hesitation. The lock never saw you coming.\n" +
        "It rarely does.",
        "Pattern recognition. You notice everything, don't you.\n" +
        "Everything. I've just hidden my notes.",
        "You talked an enchantment into submission.\n" +
        "I find this funny and also slightly alarming.",
        "Strategic proximity. The social engineering approach.\n" +
        "I have seen this exact technique used on me. Repeatedly.",
      ],
      // slime
      [
        "Pure persistence. I respect this. The gap had no idea what it was dealing with.",
        "Careful observation first. Then action. Very methodical for someone\n" +
        "without, technically, a skeleton.",
        "You absorbed part of the wall. I'm writing 'creative problem-solver' in my notes.\n" +
        "And also 'please don't absorb the archives'.",
        "Philosophical approach! The gap was never really a gap.\n" +
        "It was a state of mind. I think. The notes get unclear here.",
      ],
    ];
    await overlay.speak(Q1_REACTIONS[Math.min(species, Q1_REACTIONS.length - 1)]![q1]);

    // ── Q2: adversity (species-specific framing, same stat mapping) ───────────
    const Q2_PROMPTS: readonly string[] = [
      // human
      "My constructs will deliver standard tower gruel this evening.\n" +
      "What is your immediate reaction?",
      // undead
      "I have been informed you technically don't require food.\n" +
      "The gruel is arriving anyway. Old habit. What do you do with it?",
      // vulperia
      "The gruel is arriving. It smells. Even by your standards.\n" +
      "Your nose is reporting a distressing number of unidentified compounds.\n" +
      "What is your plan?",
      // slime
      "The gruel is arriving. It is, by strange coincidence, the exact same\n" +
      "shade as you. This seems relevant somehow. Your response?",
    ];
    const Q2_CHOICES: readonly (readonly [string, string, string, string])[] = [
      // human
      [
        "Throw it back through the slot and demand to speak with the manager.",
        "Accept politely, wait for the footsteps to fade, then pick the lock and raid the pantry.",
        "Use the residual magic in this cell to transmute it into something edible.",
        "Complain at length about the texture. Eat it anyway. Revenge requires calories.",
      ],
      // undead
      [
        "Send it back with a note. In bone-ash ink. I carry some.",
        "Study it. I don't need it but information about the tower's supplies is useful.",
        "Transmute it into something I could theoretically use. Practice.",
        "Leave it. Accept the indignity. Store the memory for later motivation.",
      ],
      // vulperia
      [
        "Return it. Loudly. With specific complaints that suggest I know where the kitchen is.",
        "Note the timing. The delivery schedule tells me more than the gruel does.",
        "Analyse it. There's useful information in what someone chooses to feed a prisoner.",
        "Eat it. Complain internally. File everything for the debrief.",
      ],
      // slime
      [
        "Express strong opinions about it through the slot. Forcefully.",
        "Absorb just enough to understand what's in it. Research purposes.",
        "Attempt to improve it through selective absorption of the useful components.",
        "Contemplate the existential implications of the colour match. Then eat it.",
      ],
    ];
    await overlay.speak(Q2_PROMPTS[Math.min(species, Q2_PROMPTS.length - 1)]);
    const q2 = await overlay.choose(Q2_CHOICES[species] as unknown as string[]);

    const statBonusB: StatBonus = (
      ['attack_power', 'stealth', 'magic_power', 'max_hp'] as const
    )[q2];
    overlay.showStatGain(STAT_DISPLAY[statBonusB]);

    // Brief species-aware farewell
    const Q2_REACTIONS: readonly (readonly [string, string, string, string])[] = [
      // human
      [
        "Confrontational. Excellent. Energy like that is hard to extinguish.\n" +
        "I'll note 'high aggression' and 'possibly a management problem'.",
        "A planner. Thoughtful. Slightly alarming.\n" +
        "I'm going to check the pantry locks when you leave this cell.",
        "Transmutation instinct! Even on gruel.\n" +
        "I like this. The tower will have use for someone who improves what they're given.",
        "Stoic pragmatism. You eat the gruel AND you're angry about it.\n" +
        "Efficient. Unpleasant. Correct.",
      ],
      // undead
      [
        "Bone-ash ink. You came prepared.\n" +
        "Either very organised or very experienced. Both concerning.",
        "Intelligence gathering from a gruel delivery. I respect this.\n" +
        "Not what I expected. Exactly what I should have expected.",
        "Transmutation practice from dinner. Very dedicated.\n" +
        "Or very bored. Possibly both. Both is fine.",
        "Dignified resignation. The long game.\n" +
        "You have had centuries to develop this response. It shows.",
      ],
      // vulperia
      [
        "Tactical complaint. You want me to know you know where the kitchen is.\n" +
        "I will be moving the kitchen. It won't help.",
        "The delivery schedule! Nobody notices the delivery schedule.\n" +
        "You noticed immediately. I've just rethought my security arrangements.",
        "You're analysing my provisioning choices.\n" +
        "This is the most unsettling thing anyone has done in this cell.",
        "Silent suffering with full note-taking.\n" +
        "I find this somehow more threatening than the loud approach.",
      ],
      // slime
      [
        "Opinions through the slot. Clear communication.\n" +
        "Largely incomprehensible from my end but the intent was unmistakable.",
        "Research absorption! You ate the gruel as science.\n" +
        "I genuinely don't know how to feel about this. I'll put 'analytical'.",
        "Selective component extraction from dinner!\n" +
        "That's either very advanced chemistry or very strange dining.\n" +
        "Either way: impressive.",
        "Existential colour contemplation, then eating.\n" +
        "I will include this in my notes under 'exceptional self-awareness'.\n" +
        "Or possibly 'may have identified with the gruel'. Further study needed.",
      ],
    ];
    await overlay.speak(Q2_REACTIONS[Math.min(species, Q2_REACTIONS.length - 1)]![q2]);

    // ── Farewell (species-aware) ───────────────────────────────────────────────
    await _pause(600);
    const FAREWELLS: readonly string[] = [
      // human
      "Splendid. That's everything I need.\n" +
      "Don't touch the books on THAT shelf. Or that one.\n" +
      "I'll be upstairs. Toodles.",
      // undead
      "Excellent. Files updated. You have my professional respect,\n" +
      "which I realise means little from someone who locked you in.\n" +
      "The books on the left are for reference only. Good luck.",
      // vulperia
      "Perfect. Files closed.\n" +
      "I've moved the good cheese. You won't find it.\n" +
      "...Don't look at me like that. I'll be upstairs.",
      // slime
      "Wonderful. Everything noted.\n" +
      "Please don't absorb the bookshelves. They're load-bearing, emotionally.\n" +
      "I'll be upstairs. Take care of yourself. All of yourself.",
    ];
    await overlay.speak(FAREWELLS[species]);

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
