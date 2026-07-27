/**
 * builder.ts — PROC-B2b/c
 *
 * `buildEnemy(dna)` → EnemyRig (compatible with existing SlimeEnemy + AI code)
 *
 * Called by BOTH:
 *   - The Enemy Creator atelier (preview + arena)
 *   - EnemyLoader.loadEnemyById() (game runtime)
 *
 * Reuses buildPrincess for visuals — menacing colour palette, species-
 * appropriate body shape, no accessories, visual tier scaling.
 */
import { TIER_SCALE } from './types';
// ── Species → archetype PrincessDNA base (menacing version) ──────────────────
const ENEMY_SPECIES_BASE = {
    human: {
        species: 'human', archetype: 'human',
        dress: { style: 'slim', flare: 0.8, length: 0.95, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
            tail: 'none', tailSize: 1, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'sleepy', eyeSize: 1.05, eyeSpacing: 0.95, eyeTilt: -0.1, blush: 0, mouth: 'fang' },
    },
    undead: {
        species: 'skeleton', archetype: 'skeleton',
        dress: { style: 'slim', flare: 0.75, length: 1, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
            tail: 'none', tailSize: 1, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'void', eyeSize: 1.2, eyeSpacing: 1, eyeTilt: 0, blush: 0, mouth: 'none' },
        traits: { snoutLength: 1, fluff: 1, wobble: 0.2, translucency: 0.3, coreGlow: 1.0, boneThickness: 0.8, eyeGlowIntensity: 1.8 },
    },
    vulperia: {
        species: 'foxling', archetype: 'fox',
        dress: { style: 'aline', flare: 0.9, length: 0.85, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'fox', earSize: 1.2,
            tail: 'fluffy', tailSize: 1, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'slit', eyeSize: 1.1, eyeSpacing: 0.9, eyeTilt: -0.12, blush: 0, mouth: 'fang' },
    },
    slime: {
        species: 'slime', archetype: 'slime',
        dress: { style: 'bell', flare: 1.2, length: 1, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
            tail: 'none', tailSize: 1, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'star', eyeSize: 1.3, eyeSpacing: 1.1, eyeTilt: 0.1, blush: 0, mouth: 'open' },
        traits: { snoutLength: 1, fluff: 1, wobble: 1.0, translucency: 0.9, coreGlow: 0.6, boneThickness: 1, eyeGlowIntensity: 1.2 },
    },
    elf: {
        species: 'elf', archetype: 'human',
        dress: { style: 'slim', flare: 0.8, length: 1, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'long', earSize: 1.15,
            tail: 'none', tailSize: 1, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'glow', eyeSize: 1.1, eyeSpacing: 1, eyeTilt: 0.05, blush: 0, mouth: 'none' },
    },
    celestial: {
        species: 'celestial', archetype: 'human',
        dress: { style: 'bell', flare: 1.0, length: 1, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'none', earSize: 1,
            tail: 'none', tailSize: 1, back: 'wings_butterfly', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        traits: { snoutLength: 1, fluff: 1, wobble: 0.5, translucency: 0.75, coreGlow: 1.0, boneThickness: 0.85, eyeGlowIntensity: 1.6 },
    },
    draconic: {
        species: 'draconic', archetype: 'fox',
        dress: { style: 'aline', flare: 0.9, length: 0.85, trim: false, sash: false, puffSleeves: false },
        parts: { crown: 'none', crownTilt: 0, crownSize: 1, ears: 'horn_curved', earSize: 1.2,
            tail: 'thin', tailSize: 1.3, back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false },
        face: { eyeStyle: 'slit', eyeSize: 1.15, eyeSpacing: 0.9, eyeTilt: -0.15, blush: 0, mouth: 'fang' },
    },
};
// ── Role → hair style (fighters have shorter/wilder hair) ────────────────────
const ROLE_HAIR = {
    melee: { style: 'wild', length: 0.9 },
    ranged: { style: 'ponytail', length: 1.0 },
    caster: { style: 'long', length: 1.2 },
    support: { style: 'bob', length: 1.0 },
    tank: { style: 'none', length: 1.0 },
    swarm: { style: 'bob', length: 0.8 },
};
// ── Fake AnimationAction bridge for princess rig ──────────────────────────────
/**
 * Creates a fake THREE.AnimationAction-like object that delegates to
 * the princess rig's setState / play API.
 * This lets SlimeEnemy and other AI code call .play() / .stop() on it.
 */
function makeAnimBridge(setState, stateId) {
    return {
        play: () => { setState(stateId); return {}; },
        stop: () => { return {}; },
        fadeIn: () => { setState(stateId); return {}; },
        fadeOut: () => { return {}; },
        reset: () => { return {}; },
        isRunning: () => true,
    };
}
export async function buildEnemy(dna) {
    const { buildPrincess } = await import('@/princess-creator/factory');
    const { sanitizeDna } = await import('@/princess-creator/dna');
    const base = ENEMY_SPECIES_BASE[dna.species] ?? ENEMY_SPECIES_BASE['human'];
    const pDna = {
        v: 2,
        name: dna.name,
        seed: dna.seed,
        species: (base.species ?? 'human'),
        archetype: (base.archetype ?? 'human'),
        pclass: 'none',
        subtype: '',
        aura: { style: dna.tier >= 3 ? 'motes' : 'none', intensity: dna.tier >= 3 ? 0.6 : 0 },
        body: {
            height: TIER_SCALE[dna.tier],
            headSize: dna.tier === 4 ? 1.2 : 1.0,
            chubbiness: dna.combatRole === 'tank' ? 1.3 : dna.combatRole === 'swarm' ? 0.8 : 1.0,
            armLength: dna.combatRole === 'melee' ? 1.1 : 1.0,
            legLength: dna.combatRole === 'ranged' ? 1.05 : 1.0,
            shoulderWidth: dna.combatRole === 'tank' ? 1.2 : 1.0,
            hipWidth: 1.0,
        },
        dress: { ...{ style: 'slim', flare: 0.8, length: 0.9, trim: false, sash: false, puffSleeves: false }, ...(base.dress ?? {}) },
        face: {
            eyeStyle: 'glow',
            eyeSize: 1.1,
            eyeSpacing: 1,
            eyeTilt: -0.1,
            blush: 0,
            mouth: 'fang',
            ...(base.face ?? {}),
        },
        hair: ROLE_HAIR[dna.combatRole],
        parts: {
            crown: 'none', crownTilt: 0, crownSize: 1,
            ears: 'none', earSize: 1,
            tail: 'none', tailSize: 1,
            back: 'none', backSize: 1,
            handL: 'none', handR: 'none', handSize: 1, glasses: false,
            ...(base.parts ?? {}),
        },
        colors: {
            primary: dna.colors.body,
            secondary: dna.colors.accent,
            tertiary: '#ffffff',
            skin: dna.colors.body,
            hair: dna.colors.accent,
            eyes: dna.colors.accent,
            outline: dna.colors.outline,
            aura: dna.colors.accent,
        },
        traits: {
            snoutLength: 1, fluff: 0.8, wobble: 0.4,
            translucency: dna.species === 'slime' ? 0.85 : 0.3,
            coreGlow: dna.tier >= 3 ? 0.7 : 0.2,
            boneThickness: dna.combatRole === 'tank' ? 1.2 : 0.95,
            eyeGlowIntensity: dna.tier >= 3 ? 1.5 : 1.0,
            ...(base.traits ?? {}),
        },
        motion: { energy: 0.7, bounce: 0.5, idleStyle: 'sway' },
    };
    const safeDna = sanitizeDna(pDna);
    if (!safeDna)
        throw new Error(`[buildEnemy] sanitizeDna failed for "${dna.name}"`);
    const inst = buildPrincess(safeDna, { targetHeight: 1.8 * TIER_SCALE[dna.tier] });
    const group = inst.root;
    group.userData['enemyDna'] = dna;
    group.userData['enemyTier'] = dna.tier;
    // Bridge princess setState to EnemyAnimState for AI compatibility
    const setAnimState = (id) => inst.setState(id);
    const clips = {
        idle: makeAnimBridge(setAnimState, 'idle'),
        walk: makeAnimBridge(setAnimState, 'walk'),
        run: makeAnimBridge(setAnimState, 'run'),
        attack: makeAnimBridge(setAnimState, 'attack_1'),
        death: makeAnimBridge(setAnimState, 'die_1'),
        hurt: makeAnimBridge(setAnimState, 'get_hit_1'),
    };
    // Fake mixer: delegates update to princess inst.update()
    let _t = 0;
    const mixer = {
        update: (dt) => { inst.update(_t, dt); _t += dt; },
        stopAllAction: () => { },
        uncacheRoot: () => { },
    };
    const rig = {
        group,
        mixer,
        allClips: [],
        clips,
        normScale: TIER_SCALE[dna.tier],
        def: undefined,
    };
    return {
        rig,
        dna,
        update: (t, dt) => { _t = t; inst.update(t, dt); },
        dispose: () => inst.dispose(),
    };
}
