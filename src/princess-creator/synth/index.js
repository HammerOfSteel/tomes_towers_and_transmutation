// ── Synth registry ───────────────────────────────────────────────────────────
import { humanSynth } from './human';
import { foxSynth } from './fox';
import { slimeSynth } from './slime';
import { skeletonSynth } from './skeleton';
import { lamiaSynth } from './lamia';
export * from './contracts';
export { computeProportions } from './shared';
export const SYNTHS = {
    human: humanSynth,
    fox: foxSynth,
    slime: slimeSynth,
    skeleton: skeletonSynth,
    lamia: lamiaSynth,
};
