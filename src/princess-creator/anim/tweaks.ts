// ── Animation tuning: save/load per-species tweaks + game-ready JSON export ─
//
//  Tweaks (per-species, per-clip speed/amplitude) persist in localStorage and
//  ride along in the export. The export itself is the game-consumable
//  artifact: every species' RESOLVED clip set (base → species overrides →
//  saved tweaks, at canonical energy), baked to dense keys — a runtime only
//  needs lerp + ease to play them. JSON over YAML: zero deps, native parse,
//  same family as the DNA share codes.

import type { SpeciesId, PrincessDNA } from '../types';
import { SPECIES_IDS } from '../types';
import {
  ANIM_IDS, JOINT_IDS, NEUTRAL, STATE_IDS, resolveClips, speciesAnimInfo,
  type AnimId, type TweakMap, type ClipSet,
} from './clips';
import { defaultDna } from '../dna';

const KEY = 'ttt.princessCreator.animTweaks.v1';

export type AllTweaks = Partial<Record<SpeciesId, TweakMap>>;

export function loadTweaks(): AllTweaks {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AllTweaks) : {};
  } catch {
    return {};
  }
}

export function tweaksFor(species: SpeciesId): TweakMap {
  return loadTweaks()[species] ?? {};
}

export function setTweak(
  species: SpeciesId, clip: AnimId, patch: { speed?: number; amp?: number },
): TweakMap {
  const all = loadTweaks();
  const forSpecies: TweakMap = { ...(all[species] ?? {}) };
  forSpecies[clip] = { ...forSpecies[clip], ...patch };
  all[species] = forSpecies;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full — tweaks stay in-memory for this session */ }
  return forSpecies;
}

export function clearTweaks(species: SpeciesId, clip?: AnimId): TweakMap {
  const all = loadTweaks();
  if (clip && all[species]) delete all[species]![clip];
  else delete all[species];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* ignore */ }
  return all[species] ?? {};
}

// ── Export ───────────────────────────────────────────────────────────────────

export interface AnimationExport {
  format: 'ttt-princess-anim';
  v: 1;
  generated: string;
  rig: {
    joints: readonly string[];
    neutral: typeof NEUTRAL;
    states: readonly string[];
    notes: string;
  };
  species: Record<string, {
    speed: number;
    clips: ClipSet;
  }>;
  tweaks: AllTweaks;
}

/** Pure builder (unit-tested); the caller downloads/serializes it. */
export function buildAnimationExport(tweaks: AllTweaks = loadTweaks()): AnimationExport {
  const species: AnimationExport['species'] = {};
  for (const id of SPECIES_IDS) {
    const dna: PrincessDNA = defaultDna(id);
    species[id] = {
      speed: speciesAnimInfo(id).speed ?? 1,
      clips: resolveClips(dna, tweaks[id] ?? {}),
    };
  }
  return {
    format: 'ttt-princess-anim',
    v: 1,
    generated: new Date().toISOString(),
    rig: {
      joints: JOINT_IDS,
      neutral: NEUTRAL,
      states: STATE_IDS,
      notes: 'Angles in radians; key.t normalized 0..1 of duration (s); '
        + 'sample = lerp between adjacent keys eased by the RIGHT key '
        + '(linear | smooth=smoothstep | snap=1-(1-x)^3 | hold=step); '
        + 'rootY offsets the rest height; holdLast clips freeze on their final frame; '
        + 'events are gameplay hooks (hit, cast_release, step, liftoff, land, parry).',
    },
    species,
    tweaks,
  };
}

/** Import tweaks from a dropped export file. Returns true when applied. */
export function importAnimationExport(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const data = raw as Partial<AnimationExport>;
  if (data.format !== 'ttt-princess-anim' || typeof data.tweaks !== 'object' || data.tweaks === null) {
    return false;
  }
  const clean: AllTweaks = {};
  for (const species of SPECIES_IDS) {
    const t = (data.tweaks as AllTweaks)[species];
    if (!t) continue;
    const map: TweakMap = {};
    for (const id of ANIM_IDS) {
      const entry = t[id];
      if (!entry) continue;
      const speed = typeof entry.speed === 'number' ? Math.min(2, Math.max(0.4, entry.speed)) : undefined;
      const amp = typeof entry.amp === 'number' ? Math.min(1.8, Math.max(0.4, entry.amp)) : undefined;
      if (speed !== undefined || amp !== undefined) map[id] = { speed, amp };
    }
    if (Object.keys(map).length > 0) clean[species] = map;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch { /* ignore */ }
  return true;
}
