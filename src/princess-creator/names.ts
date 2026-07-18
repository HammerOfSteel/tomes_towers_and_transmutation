// ── Seeded princess name generator (Spore's name dice, 40 lines) ────────────

import type { Archetype } from './types';
import type { Rng } from './rng';
import { pick, chance } from './rng';

const STARTS = [
  'Ma', 'Lu', 'Ro', 'A', 'Se', 'Vi', 'El', 'Li', 'No', 'Ce',
  'Ta', 'Mi', 'Be', 'Fi', 'Yu', 'Os', 'Ka', 'Pri', 'Isa', 'Ophe',
];
const MIDS = ['ri', 'la', 'na', 'sel', 'mi', 'ra', 'vi', 'lu', 'be', 'do', 'ne', 'mo', ''];
const ENDS = [
  'bel', 'na', 'lia', 'ette', 'ara', 'ine', 'wyn', 'ossa', 'elle',
  'ka', 'mira', 'the', 'nne', 'ley', 'sa',
];

const FLAVOR: Record<Archetype, string[]> = {
  human: [],
  fox: ['Vixen ', 'Kit '],
  slime: ['Goo-', 'Blob-'],
  skeleton: ['Bone-', 'Grave-'],
};

export function generateName(rng: Rng, archetype: Archetype): string {
  let name = pick(rng, STARTS) + pick(rng, MIDS) + pick(rng, ENDS);
  // Tidy accidental double letters at the seam ("Mannna" → "Manna").
  name = name.replace(/(.)\1{2,}/g, '$1$1');
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const flavors = FLAVOR[archetype];
  if (flavors.length > 0 && chance(rng, 0.18)) {
    name = pick(rng, flavors) + name;
  }
  return name.slice(0, 24);
}
