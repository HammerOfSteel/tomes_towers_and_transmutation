// ── Animation tuning: save/load per-species tweaks + game-ready JSON export ─
//
//  Tweaks (per-species, per-clip speed/amplitude) persist in localStorage and
//  ride along in the export. The export itself is the game-consumable
//  artifact: every species' RESOLVED clip set (base → species overrides →
//  saved tweaks, at canonical energy), baked to dense keys — a runtime only
//  needs lerp + ease to play them. JSON over YAML: zero deps, native parse,
//  same family as the DNA share codes.
import { SPECIES_IDS } from '../types';
import { ANIM_IDS, JOINT_IDS, NEUTRAL, STATE_IDS, resolveClips, speciesAnimInfo, } from './clips';
import { defaultDna } from '../dna';
const KEY = 'ttt.princessCreator.animTweaks.v1';
export function loadTweaks() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
export function tweaksFor(species) {
    return loadTweaks()[species] ?? {};
}
export function setTweak(species, clip, patch) {
    const all = loadTweaks();
    const forSpecies = { ...(all[species] ?? {}) };
    forSpecies[clip] = { ...forSpecies[clip], ...patch };
    all[species] = forSpecies;
    try {
        localStorage.setItem(KEY, JSON.stringify(all));
    }
    catch { /* storage full — tweaks stay in-memory for this session */ }
    return forSpecies;
}
export function clearTweaks(species, clip) {
    const all = loadTweaks();
    if (clip && all[species])
        delete all[species][clip];
    else
        delete all[species];
    try {
        localStorage.setItem(KEY, JSON.stringify(all));
    }
    catch { /* ignore */ }
    return all[species] ?? {};
}
/** Pure builder (unit-tested); the caller downloads/serializes it. */
export function buildAnimationExport(tweaks = loadTweaks()) {
    const species = {};
    for (const id of SPECIES_IDS) {
        const dna = defaultDna(id);
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
export function importAnimationExport(raw) {
    if (typeof raw !== 'object' || raw === null)
        return false;
    const data = raw;
    if (data.format !== 'ttt-princess-anim' || typeof data.tweaks !== 'object' || data.tweaks === null) {
        return false;
    }
    const clean = {};
    for (const species of SPECIES_IDS) {
        const t = data.tweaks[species];
        if (!t)
            continue;
        const map = {};
        for (const id of ANIM_IDS) {
            const entry = t[id];
            if (!entry)
                continue;
            const speed = typeof entry.speed === 'number' ? Math.min(2, Math.max(0.4, entry.speed)) : undefined;
            const amp = typeof entry.amp === 'number' ? Math.min(1.8, Math.max(0.4, entry.amp)) : undefined;
            if (speed !== undefined || amp !== undefined)
                map[id] = { speed, amp };
        }
        if (Object.keys(map).length > 0)
            clean[species] = map;
    }
    try {
        localStorage.setItem(KEY, JSON.stringify(clean));
    }
    catch { /* ignore */ }
    return true;
}
