/**
 * NameGenerator — procedural character name generation.
 *
 * Each CharacterId gets its own thematic name pool.  Names are produced by
 * combining a first-part fragment with a second-part fragment, giving a
 * combinatorial space of (|a| × |b|) possibilities per type.
 *
 * Human characters have a 30 % chance of receiving a family name.
 * Vulperia characters have a 25 % chance of a clan suffix.
 * Undead and Slime characters never receive a family name — they either
 * forgot it or never had one.
 */

import type { CharacterId } from '@/scene/CharacterDecisionTree';

// ── Fragment tables ──────────────────────────────────────────────────────────
// Each table entry: { a: first-parts, b: second-parts }
// Generated name = a[i] + b[j].  Both arrays should feel natural together.
// Tables are intentionally generous so even unlikely combos still sound plausible.

interface FragmentPool { a: readonly string[]; b: readonly string[] }

const HUMAN_ROGUE_POOL: FragmentPool = {
  a: ['Kes', 'Mir', 'Lir', 'Bryn', 'Tov', 'Nad', 'Ser', 'Tam', 'Fen', 'Sab',
      'Ely', 'Dac', 'Rim', 'Cait', 'Jess', 'Evyn', 'Wren', 'Penn', 'Seren', 'Vael'],
  b: ['sa',  'ra',  'ia',  'na',   'ven', 'va',   'yn',  'sin', 'elle', 'an',
      'se',  'la',  'en',  'wyn',  'essa','in',   '',    'ie',  'a',    'e'],
};

const HUMAN_MAGE_POOL: FragmentPool = {
  a: ['Sera', 'Ael', 'Lyri', 'Thess', 'Cal', 'Nim', 'Viv', 'Elor', 'Arc', 'Sorv',
      'Iver', 'Mel', 'Ariad', 'Evai', 'Orinth', 'Calyx', 'Caelia', 'Imara', 'Lirael', 'Thessia'],
  b: ['phine','indra','ia',  'aly',  'anthe','ue',  'ienne','wen',  'eniel','aine',
      'ella', 'issa', 'aria','ora',   'endre','iel', 'a',   'ira',  '',     'is'],
};

const HUMAN_WARRIOR_POOL: FragmentPool = {
  a: ['Bri',  'Sig',  'Ast',  'Valk', 'Rag',   'Svan', 'Ulf',  'Solv', 'Berg', 'Hild',
      'Vigr', 'Dagh', 'Gudr', 'Ingr', 'Borgh', 'Edda', 'Maren','Rowan','Thyra','Freyj'],
  b: ['enne', 'rid',  'rid',  'a',    'nhild', 'a',    'hild', 'eig',  'hild', 'ur',
      'a',    'ny',   'un',   'id',   'ild',   '',     '',     '',     '',     'a'],
};

const HUMAN_PALADIN_POOL: FragmentPool = {
  a: ['Alis',  'Cel',   'Auri',  'Elen',  'Merid', 'Rosal', 'Lysar', 'Solar',
      'Avel',  'Anw',   'Elsp',  'Silv',  'Seren', 'Aldar', 'Evang', 'Lumis',
      'Elysar','Celest','Aelind','Thess'],
  b: ['anne',  'este',  'iel',   'is',    'ia',    'ind',   'a',     'a',
      'ine',   'en',    'eth',   'aine',  'ith',   'a',     'eline', 'ara',
      'a',     'ine',   'ra',    'ara'],
};

const HUMAN_BARD_POOL: FragmentPool = {
  a: ['Lior',  'Sylv',  'Tams',  'Myrn', 'Vess',  'Orl',  'Sidr',  'Lyan',
      'Bris',  'Melis', 'Cress', 'Loral','Isdor', 'Callia','Amara', 'Delor',
      'Florin','Tessaly','Aria',  'Caeli'],
  b: ['in',    'ie',    'in',    'a',    'a',     'a',    'a',     'a',
      'eis',   'ande',  'ida',   'ei',   'a',     '',     '',      'a',
      '',      '',      '',      'a'],
};

// Undead — names carry the weight of prior lives.  All standalone (no suffix pool).
// Represented as a: full name; b: always '' so a+b = name.
const UNDEAD_POOL: Record<
  'skeleton_rogue'|'skeleton_mage'|'zombie'|'ghost'|'mystery_undead',
  FragmentPool
> = {
  skeleton_rogue: {
    a: ['Vayne',   'Maren',  'Grisel', 'Aldric', 'Mordecai','Regan',  'Draven',
        'Calder',  'Caius',  'Selene', 'Thalia', 'Elspeth', 'Sable',  'Caden',
        'Isolde',  'Liriel', 'Elodie', 'Seraph', 'Voss',    'Nera',   'Devin', 'Vesper'],
    b: Array(22).fill(''),
  },
  skeleton_mage: {
    a: ['Sorvaine','Valdris','Melchior','Arceniel','Thessaly','Vexara','Calanthe',
        'Morden',  'Elaris', 'Balthora','Drusilla','Nihveen','Solvira','Theron',
        'Evadne',  'Malvira','Cadrin',  'Zeloth',  'Meredin','Orchidea','Caius','Thael'],
    b: Array(22).fill(''),
  },
  zombie: {
    a: ['Edmund',  'Agatha',  'Harold',   'Mildred', 'Percival','Constance','Reginald',
        'Beatrice','Aldous',  'Mervyn',   'Cordelia','Basil',   'Euphemia', 'Clarence',
        'Millicent','Lionel', 'Dorothea', 'Willoughby','Arabella','Theobald','Prudence','Rupert'],
    b: Array(22).fill(''),
  },
  ghost: {
    a: ['Sephira', 'Elodie',  'Liriel',  'Thessia', 'Moira',   'Caelith', 'Vesper',
        'Miriel',  'Ysabel',  'Seraphel','Calyss',  'Meliora', 'Silvaine','Lyonesse',
        'Callista','Iseline', 'Rhoswen', 'Ellys',   'Aelin',   'Thessara','Soleima','Aelindra'],
    b: Array(22).fill(''),
  },
  mystery_undead: {
    a: ['Vayne',   'Theron',  'Calix',   'Morden',  'Solvira', 'Draven',  'Neressa',
        'Nihveen', 'Seregil', 'Zeloth',  'Mordrana','Caladrel','Vexara',  'Threnody',
        'Orphiel', 'Elaris',  'Nihvael', 'Caelith', 'Malachar','Corvaine','Serafin','Velkan'],
    b: Array(22).fill(''),
  },
};

// Fox / Vulperia — sharp, nature-linked.
const FOX_POOL: Record<'fox_rogue'|'fox_ranger'|'fox_mage'|'fox_mysterious', FragmentPool> = {
  fox_rogue: {
    a: ['Sab', 'Vesp', 'Kir',  'Nyx',  'Ryn', 'Sorr', 'Ashk', 'Wisk', 'Siv',  'Tress',
        'Dusk','Pell', 'Vex',  'Zar',  'Emb', 'Fen',  'Bri',  'Russ', 'Amb',  'Skiv'],
    b: ['le',  'er',   'a',    'x',    'n',   'el',   'a',    '',     '',    '',
        '',    '',     '',     'a',    'er',  'na',   'ar',   'et',   'er',  'er'],
  },
  fox_ranger: {
    a: ['Sorr', 'Ashk', 'Bri',  'Fawn', 'Tawn','Haz',  'Marr', 'Cind', 'Lind', 'Russ',
        'Aster','Larch','Tress','Wren', 'Emb', 'Birch','Heath','Gorse','Hazel','Mosfen'],
    b: ['el',   'a',    'ar',   '',     'y',   'el',   'en',   'er',   'en',   'et',
        '',     '',     '',     '',     'er',  '',     '',     '',     '',     ''],
  },
  fox_mage: {
    a: ['Emb',  'Cind', 'Solar','Vesp', 'Kir',  'Pyrr', 'Sol',  'Ard',  'Pyr',  'Scor',
        'Cor',  'Ser',  'Ash',  'Sind', 'Brin',  'Ignar','Calyx','Ardea','Vespera','Solenn'],
    b: ['er',   'er',   'a',    'er',   'a',    'a',    'enne', 'is',   'e',    'ia',
        'yn',   'aph',  'fen',  'ra',   'dl',   'a',    '',     '',     '',     'e'],
  },
  fox_mysterious: {
    a: ['Vesp', 'Shad', 'Sab',  'Thr',  'Zar',  'Rim',  'Vael', 'Morr', 'Dusk', 'Siv',
        'Rev',  'Nair', 'Solm', 'Murk', 'Ash',  'Ink',  'Drif', 'Holl', 'Vex',  'Sable'],
    b: ['er',   'e',    'le',   'en',   'a',    'e',    '',     '',     '',     '',
        'ek',   '',     '',     '',     '',     '',     't',    'ow',   '',     ''],
  },
};

// Slime — each archetype has its own personality-matched standalone pool.
const SLIME_STANDALONE: Record<
  'slime'|'slime_arcane'|'slime_philosopher'|'slime_young', readonly string[]
> = {
  slime: [
    'Gloop',   'Verdis',  'Murk',    'Phlox',   'Limpid',  'Glyc',    'Bub',
    'Soss',    'Gloss',   'Rivule',  'Plash',   'Blorb',   'Merp',    'Brine',
    'Smirch',  'Tremor',  'Gelwin',  'Slurrp',  'Wibble',  'Oozle',   'Blobbert','Squelch',
  ],
  slime_arcane: [
    'Arcanox',    'Verdris',   'Pellucid',  'Luminus',   'Aetherix',
    'Scintilla',  'Chromath',  'Glyphus',   'Arcenix',   'Sigilla',
    'Voltex',     'Osmoria',   'Lumenix',   'Phlogis',   'Crystor',
    'Tesseract',  'Spectrix',  'Radium',    'Chromis',   'Aethorex',   'Prismax',
  ],
  slime_philosopher: [
    'Algernon',  'Cornelius', 'Euphonius', 'Reginald',  'Ponderus',
    'Edmund',    'Mortimer',  'Archibald', 'Gelward',   'Viscus',
    'Murgatroyd','Oswald',    'Bertrand',  'Percival',  'Theodoric',
    'Bramwell',  'Sylvester', 'Crispin',   'Ambrose',   'Godfrey',    'Huxley',
  ],
  slime_young: [
    'Pip',     'Bub',     'Wibble',  'Tiny',    'Glup',
    'Sprout',  'Mochi',   'Gummi',   'Bloop',   'Bitty',
    'Pebble',  'Squish',  'Dewdrop', 'Nubby',   'Jell',
    'Squishy', 'Dribble', 'Trickle', 'Puddin',  'Blob',
  ],
};

// ── Optional family / clan names ─────────────────────────────────────────────

const HUMAN_SURNAMES = [
  'Thornwood',  'Ashveil',    'Ironside',  'Coldwater',  'Brightstone',
  'Swiftblade', 'Darkhollow', 'Silverbranch','Dunehollow','Ravenscroft',
  'Stormveil',  'Cinderfall', 'Goldenmill','Blackthorn', 'Whitfield',
  'Fairhollow', 'Greymoor',   'Aldermast', 'Coppergate','Wychwood',
  'Emberhurst', 'Fallowmere', 'Harroway',  'Irongate',  'Kestrelwind',
] as const;

const FOX_CLAN_SUFFIXES = [
  'of the Red Warren',  'of the Ashwood',   'of the Silverfen',
  'of the Copperhill',  'of the Dusk Spire','of the Thornrun',
  'of the Brightburn',  'of the Emberwood', 'of the Long Hollow',
] as const;

// ── Core generator ───────────────────────────────────────────────────────────

function _rand(n: number): number {
  return Math.floor(Math.random() * n);
}

function _pick<T>(arr: readonly T[]): T {
  return arr[_rand(arr.length)];
}

function _fromFragments(pool: FragmentPool): string {
  const a = _pick(pool.a);
  const b = _pick(pool.b);
  // Avoid double-vowel junctions that feel awkward (e.g. "Sera" + "ia" → "Seraia")
  if (b.length > 0 && /[aeiou]$/i.test(a) && /^[aeiou]/i.test(b)) {
    // Drop the trailing vowel from `a`
    return a.slice(0, -1) + b;
  }
  return a + b;
}

/**
 * Generate a thematically appropriate name for the given `CharacterId`.
 *
 * Human characters have a 30 % chance of receiving a family name.
 * Vulperia characters have a 25 % chance of a clan suffix.
 * Undead and Slime characters receive only a first name.
 */
export function generateCharacterName(characterId: CharacterId): string {
  switch (characterId) {
    // ── Human ──────────────────────────────────────────────────────────────
    case 'rogue':
    case 'rogue_hooded': {
      const first = _fromFragments(HUMAN_ROGUE_POOL);
      return Math.random() < 0.30
        ? `${first} ${_pick(HUMAN_SURNAMES)}`
        : first;
    }
    case 'mage': {
      const first = _fromFragments(HUMAN_MAGE_POOL);
      return Math.random() < 0.30
        ? `${first} ${_pick(HUMAN_SURNAMES)}`
        : first;
    }
    case 'human_warrior': {
      const first = _fromFragments(HUMAN_WARRIOR_POOL);
      return Math.random() < 0.30
        ? `${first} ${_pick(HUMAN_SURNAMES)}`
        : first;
    }
    case 'human_paladin': {
      const first = _fromFragments(HUMAN_PALADIN_POOL);
      return Math.random() < 0.30
        ? `${first} ${_pick(HUMAN_SURNAMES)}`
        : first;
    }
    case 'human_bard': {
      const first = _fromFragments(HUMAN_BARD_POOL);
      return Math.random() < 0.30
        ? `${first} ${_pick(HUMAN_SURNAMES)}`
        : first;
    }

    // ── Undead ─────────────────────────────────────────────────────────────
    case 'skeleton_rogue':   return _fromFragments(UNDEAD_POOL.skeleton_rogue);
    case 'skeleton_mage':    return _fromFragments(UNDEAD_POOL.skeleton_mage);
    case 'zombie':           return _fromFragments(UNDEAD_POOL.zombie);
    case 'ghost':            return _fromFragments(UNDEAD_POOL.ghost);
    case 'mystery_undead':   return _fromFragments(UNDEAD_POOL.mystery_undead);

    // ── Vulperia ───────────────────────────────────────────────────────────
    case 'fox_rogue': {
      const first = _fromFragments(FOX_POOL.fox_rogue);
      return Math.random() < 0.25
        ? `${first} ${_pick(FOX_CLAN_SUFFIXES)}`
        : first;
    }
    case 'fox_ranger': {
      const first = _fromFragments(FOX_POOL.fox_ranger);
      return Math.random() < 0.25
        ? `${first} ${_pick(FOX_CLAN_SUFFIXES)}`
        : first;
    }
    case 'fox_mage': {
      const first = _fromFragments(FOX_POOL.fox_mage);
      return Math.random() < 0.25
        ? `${first} ${_pick(FOX_CLAN_SUFFIXES)}`
        : first;
    }
    case 'fox_mysterious': {
      const first = _fromFragments(FOX_POOL.fox_mysterious);
      return Math.random() < 0.25
        ? `${first} ${_pick(FOX_CLAN_SUFFIXES)}`
        : first;
    }

    // ── Slime ──────────────────────────────────────────────────────────────
    case 'slime':             return _pick(SLIME_STANDALONE.slime);
    case 'slime_arcane':      return _pick(SLIME_STANDALONE.slime_arcane);
    case 'slime_philosopher': return _pick(SLIME_STANDALONE.slime_philosopher);
    case 'slime_young':       return _pick(SLIME_STANDALONE.slime_young);
    // NS3: New Tier-1 species — use fitting name pools
    case 'elf_scholar':
    case 'elf_wanderer':      return generateNameForSpecies('elf');
    case 'celestial_dawn':
    case 'celestial_dusk':    return generateNameForSpecies('celestial');
    case 'draconic_fire':
    case 'draconic_scale':    return generateNameForSpecies('draconic');

    default: {
      // Exhaustive fallback — should never be reached with a well-typed caller
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive = characterId;
      return 'Mysterious Stranger';
    }
  }
}

/**
 * Re-roll until the name passes a minimum quality check.
 * Currently: must be at least 3 characters and not start/end with a vowel run.
 * Usually the first result is fine — this is a safety valve for edge-case
 * fragment combinations.
 */
export function generateQualityName(characterId: CharacterId, tries = 6): string {
  for (let i = 0; i < tries; i++) {
    const name = generateCharacterName(characterId);
    if (_isAcceptable(name)) return name;
  }
  // Fall through to plain generation (better than infinite looping)
  return generateCharacterName(characterId);
}

function _isAcceptable(name: string): boolean {
  if (name.length < 3) return false;
  // No double-vowel start after combination
  if (/^[aeiou]{2}/i.test(name)) return false;
  // No trailing standalone single consonant (e.g. "Valc")
  if (/[^aeiou\s]$/i.test(name) && name.split(' ')[0].length < 4) return false;
  return true;
}

// ── Species helpers (used by non-wizard creation paths) ──────────────────────

export type NameableSpecies = 'human' | 'fox' | 'slime' | 'undead' | 'any'
  | 'elf' | 'celestial' | 'draconic';

const HUMAN_IDS:  readonly CharacterId[] = ['rogue', 'mage', 'human_warrior', 'human_paladin', 'human_bard'];
const FOX_IDS:    readonly CharacterId[] = ['fox_rogue', 'fox_ranger', 'fox_mage', 'fox_mysterious'];
const SLIME_IDS:  readonly CharacterId[] = ['slime', 'slime_arcane', 'slime_philosopher', 'slime_young'];
const UNDEAD_IDS: readonly CharacterId[] = ['skeleton_rogue', 'skeleton_mage', 'zombie', 'ghost', 'mystery_undead'];

/**
 * Generate a name for a broader species category without needing a specific
 * CharacterId.  Useful for the DNA-editor and asset-browser creation flows.
 */
export function generateNameForSpecies(species: NameableSpecies, tries = 6): string {
  let pool: readonly CharacterId[];
  switch (species) {
    case 'human':     pool = HUMAN_IDS;  break;
    case 'fox':       pool = FOX_IDS;    break;
    case 'slime':     pool = SLIME_IDS;  break;
    case 'undead':    pool = UNDEAD_IDS; break;
    // NS3: new species — fall back to human pool (matching lore tone)
    case 'elf':       pool = HUMAN_IDS;  break;
    case 'celestial': pool = HUMAN_IDS;  break;
    case 'draconic':  pool = HUMAN_IDS;  break;
    case 'any': {
      const ALL = [...HUMAN_IDS, ...FOX_IDS, ...SLIME_IDS, ...UNDEAD_IDS] as CharacterId[];
      return generateQualityName(_pick(ALL), tries);
    }
  }
  return generateQualityName(_pick(pool), tries);
}
