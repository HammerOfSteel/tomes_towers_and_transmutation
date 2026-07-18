// ── Synth registry ───────────────────────────────────────────────────────────

import type { Archetype } from '../types';
import type { BodySynthesizer } from './contracts';
import { humanSynth } from './human';
import { foxSynth } from './fox';
import { slimeSynth } from './slime';
import { skeletonSynth } from './skeleton';
import { lamiaSynth } from './lamia';

export * from './contracts';
export { computeProportions } from './shared';

export const SYNTHS: Record<Archetype, BodySynthesizer> = {
  human: humanSynth,
  fox: foxSynth,
  slime: slimeSynth,
  skeleton: skeletonSynth,
  lamia: lamiaSynth,
};
