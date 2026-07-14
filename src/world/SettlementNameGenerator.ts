/**
 * SettlementNameGenerator — seeded phoneme-table settlement names.
 *
 * Each settlement type produces a distinct linguistic feel:
 *   village  → short compound ("Ashwick", "Millford", "Braeholm")
 *   town     → two-part compound ("Blackhaven", "Ironbridge", "Moorgate")
 *   city     → grand single or "The X of Y" form ("Dawnreach", "The Silver Gate")
 */

import type { SettlementType } from './SettlementGenerator';
import { mulberry32 } from '@/core/prng';

const SYLLABLES_A = [
  'Ash', 'Brae', 'Crag', 'Dun', 'Elm', 'Fen', 'Gale', 'Holt',
  'Iron', 'Keld', 'Lorn', 'Mar', 'Mire', 'Neth', 'Oak', 'Pine',
  'Rook', 'Silt', 'Stone', 'Thorn', 'Vale', 'Veln', 'Wren', 'Yew',
] as const;

const SYLLABLES_B = [
  'ast', 'eld', 'ham', 'holm', 'on', 'stead', 'wick', 'worth',
] as const;

// Village suffixes: small, earthy
const VILLAGE_SUFFIX = [
  'ford', 'dell', 'wick', 'holm', 'sted', 'ton', 'holt', 'bridge', 'mill', 'field',
] as const;

// Town suffixes: connective, mercantile
const TOWN_SUFFIX = [
  'haven', 'gate', 'port', 'market', 'bridge', 'moor', 'cross', 'reach',
] as const;

// City prefixes + nouns
const CITY_ADJ = [
  'Silver', 'Iron', 'Dawn', 'Stone', 'Gold', 'Ashen', 'Pale', 'Black', 'Deep',
] as const;
const CITY_NOUN = [
  'Gate', 'Reach', 'Hold', 'Spire', 'Keep', 'Citadel', 'Crown', 'Bastion',
] as const;

export function generateSettlementName(seed: number, type: SettlementType): string {
  const rand = mulberry32(seed ^ 0xC1_7A_4E_53);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  switch (type) {
    case 'village': {
      const a = pick(SYLLABLES_A);
      const s = pick(VILLAGE_SUFFIX);
      return `${a}${s}`;
    }
    case 'town': {
      const a = pick(SYLLABLES_A);
      const b = rand() < 0.45 ? pick(SYLLABLES_B) : '';
      const s = pick(TOWN_SUFFIX);
      return `${a}${b}${s}`;
    }
    case 'city': {
      if (rand() < 0.45) {
        return `The ${pick(CITY_ADJ)} ${pick(CITY_NOUN)}`;
      }
      return `${pick(CITY_ADJ)}${pick(CITY_NOUN)}`;
    }
  }
}
