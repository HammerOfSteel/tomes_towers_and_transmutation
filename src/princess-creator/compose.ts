// ── composePrincess: DNA → fully dressed, faced, part-equipped BuildResult ──
//
//  This is the single entry point used by both the editor (main.ts) and the
//  future game-side factory (see docs/princess-creator/INTEGRATION.md).

import type { PrincessDNA } from './types';
import type { MaterialKit } from './materials';
import type { BuildResult } from './synth/contracts';
import { SYNTHS } from './synth';
import { buildFace } from './face';
import { attachParts } from './parts';

/** Face feature radius per archetype (blob/snout surfaces differ slightly). */
function faceSurfaceR(dna: PrincessDNA, headR: number): number {
  switch (dna.archetype) {
    case 'fox': return headR * 0.93;
    case 'slime': return headR * 1.0;
    default: return headR;
  }
}

export function composePrincess(dna: PrincessDNA, kit: MaterialKit): BuildResult {
  const result = SYNTHS[dna.archetype].build(dna, kit);
  const face = buildFace(
    result.sockets.face, dna, kit, faceSurfaceR(dna, result.proportions.headR),
  );
  result.hooks.setBlink = face.setBlink;
  attachParts(result, dna, kit);
  return result;
}
