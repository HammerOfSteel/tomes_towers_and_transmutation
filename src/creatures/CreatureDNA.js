// ── CreatureDNA ─────────────────────────────────────────────────────────────────
//
//  Single source of truth for generating any creature or player character.
//  A DNA object serialises to Base64 for save files, clipboard, and the lab.
// ── Defaults ──────────────────────────────────────────────────────────────────
export const DEFAULT_PLAYER_DNA = {
    archetype: 'biped',
    subRace: 'human',
    colors: { primary: 0xf5c89a, secondary: 0x4a2080, emissive: 0x6030c0, emissiveIntensity: 0.04,
        pattern: 'none', patternColor: 0x884488, patternScale: 1.0, patternOpacity: 0.35 },
    proportions: {
        global: 1.0, torso: [1, 1, 1], headSize: 1.0,
        limbLength: 1.0, limbWidth: 1.0, neckLength: 1.0,
        tailLength: 0.0, wingSpan: 1.5, segmentCount: 5,
        shoulderWidth: 1.0, hipWidth: 1.0, bellySize: 0.0, neckThickness: 1.0,
    },
    face: {
        type: 'cute', eyeColor: 0x2a1a4a, mouthType: 'smile', expression: 'neutral',
        eyeShape: 'round', skinPattern: 'none', markColor: 0x884488, browStyle: 'none',
    },
    material: { roughness: 0.55, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 },
    props: [],
    outfit: { top: 'none', legs: 'none', over: 'none' },
};
export const SUBRACE_DEFS = {
    none: { label: 'Unknown', icon: '?', hint: 'Indeterminate form.',
        earShape: 'round', headStyle: 'normal' },
    human: { label: 'Human', icon: '👤', hint: 'Versatile and adaptable.',
        earShape: 'round', headStyle: 'normal' },
    elf: { label: 'Elf', icon: '🧝', hint: 'Slender, long-lived, and sharp of ear.',
        earShape: 'pointed', headStyle: 'elongated',
        proportions: { limbLength: 1.15, global: 0.95, headSize: 0.92, neckLength: 1.1 },
        colors: { primary: 0xd8e0c8 },
        face: { type: 'cute', mouthType: 'smile' } },
    high_elf: { label: 'High Elf', icon: '⭐', hint: 'Ancient bloodline, luminous bearing.',
        earShape: 'pointed', headStyle: 'elongated',
        proportions: { limbLength: 1.2, global: 1.0, headSize: 0.88, neckLength: 1.2 },
        colors: { primary: 0xe8f0e0, emissive: 0xc0e0ff, emissiveIntensity: 0.06 },
        face: { type: 'cute', mouthType: 'smile' } },
    goblin: { label: 'Goblin', icon: '👺', hint: 'Short, clever, and mischievous.',
        earShape: 'large', headStyle: 'large',
        proportions: { global: 0.78, headSize: 1.35, limbLength: 0.88, limbWidth: 0.85 },
        colors: { primary: 0x88a050 },
        face: { type: 'angry', mouthType: 'fangs' } },
    orc: { label: 'Orc', icon: '💪', hint: 'Broad, strong, and battle-forged.',
        earShape: 'round', headStyle: 'normal',
        proportions: { global: 1.08, limbWidth: 1.3, headSize: 1.05 },
        colors: { primary: 0x708050 },
        face: { type: 'angry', mouthType: 'fangs' } },
    troll: { label: 'Troll', icon: '🧌', hint: 'Massive and regenerative.',
        earShape: 'large', headStyle: 'large',
        proportions: { global: 1.3, headSize: 1.4, limbWidth: 1.45, limbLength: 1.05 },
        colors: { primary: 0x6a7060 },
        face: { type: 'angry', mouthType: 'frown' } },
    pixie: { label: 'Pixie', icon: '🧚', hint: 'Tiny, fast, and full of tricks.',
        earShape: 'pointed', headStyle: 'large',
        proportions: { global: 0.52, headSize: 1.5, limbLength: 0.9 },
        colors: { primary: 0xf0d0ff, emissive: 0xe080ff, emissiveIntensity: 0.12 },
        face: { type: 'cute', mouthType: 'smile' },
        props: ['wings_bat'] },
    fae: { label: 'Fae', icon: '🌿', hint: 'Nature-bound, mercurial, and enchanting.',
        earShape: 'pointed', headStyle: 'large',
        proportions: { global: 0.72, headSize: 1.25, limbLength: 1.05 },
        colors: { primary: 0xa0d880, emissive: 0x60ff80, emissiveIntensity: 0.1 },
        face: { type: 'cute', mouthType: 'smile' },
        props: ['wings_bat', 'aura'] },
    gnome: { label: 'Gnome', icon: '🍄', hint: 'Inventive, stout, and surprising.',
        earShape: 'round', headStyle: 'large',
        proportions: { global: 0.72, headSize: 1.3, limbLength: 0.85 },
        colors: { primary: 0xf0c890 } },
    undead: { label: 'Undead', icon: '💀', hint: 'Returned from beyond — cold and tireless.',
        earShape: 'none', headStyle: 'normal',
        colors: { primary: 0xc0b8a8, secondary: 0x302820 },
        face: { type: 'skull', mouthType: 'fangs' },
        props: ['aura'] },
    draconic: { label: 'Draconic', icon: '🐉', hint: 'Dragon-blooded. Scales, fire, and pride.',
        earShape: 'none', headStyle: 'normal',
        colors: { primary: 0x904020, secondary: 0x602010, emissive: 0xff4000, emissiveIntensity: 0.08 },
        face: { type: 'angry', mouthType: 'fangs' },
        props: ['horns_small'] },
    celestial: { label: 'Celestial', icon: '✨', hint: 'Descended from starlight. Radiant and serene.',
        earShape: 'pointed', headStyle: 'elongated',
        proportions: { global: 1.0, limbLength: 1.1, headSize: 0.9 },
        colors: { primary: 0xfff0d8, secondary: 0xd0c0f0, emissive: 0xffd080, emissiveIntensity: 0.12 },
        face: { type: 'cute', mouthType: 'smile' },
        props: ['aura', 'crown'] },
};
/** Subraces available when archetype === 'biped'. */
export const BIPED_SUBRACES = [
    'human', 'elf', 'high_elf', 'goblin', 'orc', 'troll',
    'pixie', 'fae', 'gnome', 'undead', 'draconic', 'celestial',
];
export const ARCHETYPE_DEFAULTS = {
    quadruped: {
        colors: { primary: 0x6a9a5a, secondary: 0x3a5a2a, emissive: 0x204010, emissiveIntensity: 0.02, pattern: 'none', patternColor: 0x3a5a2a, patternScale: 1.0, patternOpacity: 0.35 },
        proportions: { global: 1.0, torso: [1.4, 0.85, 1.8], headSize: 0.85, limbLength: 0.95, limbWidth: 0.9, neckLength: 1.4, tailLength: 1.2, wingSpan: 1.5, segmentCount: 4, shoulderWidth: 1.1, hipWidth: 1.0, bellySize: 0.0, neckThickness: 1.1 },
        face: { type: 'angry', eyeColor: 0xff4000, mouthType: 'fangs', expression: 'angry', eyeShape: 'slit', skinPattern: 'none', markColor: 0x443322, browStyle: 'thick' },
        props: [],
    },
    amoeba: {
        colors: { primary: 0x40c0a0, secondary: 0x20a080, emissive: 0x40ffd0, emissiveIntensity: 0.18, pattern: 'none', patternColor: 0x20a080, patternScale: 1.0, patternOpacity: 0.35 },
        proportions: { global: 1.0, torso: [1.3, 1.3, 1.3], headSize: 1.6, limbLength: 0.3, limbWidth: 1.5, neckLength: 0.3, tailLength: 0, wingSpan: 0.5, segmentCount: 6, shoulderWidth: 1.0, hipWidth: 1.0, bellySize: 0.0, neckThickness: 0.7 },
        face: { type: 'cyclops', eyeColor: 0xff8800, mouthType: 'none', expression: 'neutral', eyeShape: 'round', skinPattern: 'none', markColor: 0x40ffd0, browStyle: 'none' },
        props: ['aura'],
    },
    avian: {
        colors: { primary: 0xe8c060, secondary: 0xa87020, emissive: 0xffe080, emissiveIntensity: 0.06, pattern: 'none', patternColor: 0xa87020, patternScale: 1.0, patternOpacity: 0.35 },
        proportions: { global: 0.85, torso: [0.85, 1.1, 0.7], headSize: 0.75, limbLength: 0.7, limbWidth: 0.7, neckLength: 1.6, tailLength: 0.9, wingSpan: 2.2, segmentCount: 3, shoulderWidth: 0.9, hipWidth: 0.85, bellySize: 0.0, neckThickness: 0.8 },
        face: { type: 'cute', eyeColor: 0x1a3060, mouthType: 'beak', expression: 'neutral', eyeShape: 'round', skinPattern: 'none', markColor: 0xa87020, browStyle: 'none' },
        props: [],
    },
    serpent: {
        colors: { primary: 0x506020, secondary: 0x304010, emissive: 0x60a020, emissiveIntensity: 0.08, pattern: 'scales', patternColor: 0x304010, patternScale: 1.2, patternOpacity: 0.4 },
        proportions: { global: 1.0, torso: [1.0, 1.0, 1.0], headSize: 1.1, limbLength: 0.4, limbWidth: 0.6, neckLength: 0.5, tailLength: 1.8, wingSpan: 0.5, segmentCount: 9, shoulderWidth: 0.8, hipWidth: 0.8, bellySize: 0.0, neckThickness: 0.9 },
        face: { type: 'angry', eyeColor: 0xff2000, mouthType: 'fangs', expression: 'angry', eyeShape: 'slit', skinPattern: 'scales', markColor: 0x304010, browStyle: 'thick' },
        props: ['tail_long'],
    },
};
export function dnaForArchetype(arch) {
    const base = cloneDNA(DEFAULT_PLAYER_DNA);
    base.archetype = arch;
    // Non-biped archetypes have no sub-race.
    if (arch !== 'biped')
        base.subRace = 'none';
    const over = ARCHETYPE_DEFAULTS[arch];
    if (!over)
        return base;
    if (over.colors)
        Object.assign(base.colors, over.colors);
    if (over.proportions)
        Object.assign(base.proportions, over.proportions);
    if (over.face)
        Object.assign(base.face, over.face);
    if (over.props !== undefined)
        base.props = [...over.props];
    return base;
}
/** Apply a sub-race's defaults on top of an existing DNA (biped only). */
export function dnaForSubRace(subRace, base) {
    const dna = cloneDNA(base);
    dna.subRace = subRace;
    if (subRace === 'none')
        return dna;
    const def = SUBRACE_DEFS[subRace];
    if (def.proportions)
        Object.assign(dna.proportions, def.proportions);
    if (def.colors)
        Object.assign(dna.colors, def.colors);
    if (def.face)
        Object.assign(dna.face, def.face);
    if (def.props !== undefined)
        dna.props = [...def.props];
    return dna;
}
// ── Serialisation ─────────────────────────────────────────────────────────────
export function dnaToBase64(dna) { return btoa(JSON.stringify(dna)); }
export function base64ToDna(b64) {
    const dna = JSON.parse(atob(b64));
    // Backwards-compat: old saves have no subRace field.
    if (dna.subRace === undefined)
        dna.subRace = dna.archetype === 'biped' ? 'human' : 'none';
    // Backwards-compat: old saves have no outfit field.
    if (!dna.outfit)
        dna.outfit = { top: 'none', legs: 'none', over: 'none' };
    // Migrate legacy 'robe' prop → outfit.over = 'robe_full'.
    const _ri = dna.props.indexOf('robe');
    if (_ri >= 0) {
        dna.props.splice(_ri, 1);
        if (dna.outfit.over === 'none')
            dna.outfit.over = 'robe_full';
    }
    // Backwards-compat: CC-3 morph fields.
    const _pp = dna.proportions;
    if (_pp.shoulderWidth === undefined)
        _pp.shoulderWidth = 1.0;
    if (_pp.hipWidth === undefined)
        _pp.hipWidth = 1.0;
    if (_pp.bellySize === undefined)
        _pp.bellySize = 0.0;
    if (_pp.neckThickness === undefined)
        _pp.neckThickness = 1.0;
    // Backwards-compat: CC-5 face expansion fields.
    const _ff = dna.face;
    if (_ff.eyeShape === undefined)
        _ff.eyeShape = 'round';
    if (_ff.skinPattern === undefined)
        _ff.skinPattern = 'none';
    if (_ff.markColor === undefined)
        _ff.markColor = 0x884488;
    if (_ff.browStyle === undefined)
        _ff.browStyle = 'none';
    // Backwards-compat: CC-7 body skin pattern fields.
    const _cc = dna.colors;
    if (_cc.pattern === undefined)
        _cc.pattern = 'none';
    if (_cc.patternColor === undefined)
        _cc.patternColor = 0x884488;
    if (_cc.patternScale === undefined)
        _cc.patternScale = 1.0;
    if (_cc.patternOpacity === undefined)
        _cc.patternOpacity = 0.35;
    return dna;
}
export function cloneDNA(dna) { return JSON.parse(JSON.stringify(dna)); }
export function numToHex(n) { return '#' + n.toString(16).padStart(6, '0'); }
export function hexToNum(s) { return parseInt(s.replace('#', ''), 16); }
// ── CC-5 / CC-6 Allowlists ────────────────────────────────────────────────────
/** Which face types are valid for each archetype (union across all subraces). */
export const ARCHETYPE_FACE_ALLOW = {
    biped: ['cute', 'cherubic', 'gaunt', 'angry', 'skull', 'cat', 'demon', 'ancient', 'cyclops', 'compound', 'blank'],
    quadruped: ['cat', 'lizard', 'angry', 'blank'],
    amoeba: ['cyclops', 'compound', 'insect', 'blank', 'ancient'],
    avian: ['bird', 'cute', 'cyclops'],
    serpent: ['lizard', 'angry', 'demon', 'cat'],
};
/** Which props are valid (shown in UI) for each archetype. */
export const ARCHETYPE_PROP_ALLOW = {
    biped: ['horns_small', 'horns_large', 'tail_stub', 'tail_long', 'wings_bat', 'crown', 'armor_light', 'aura',
        'antlers', 'mane', 'feather_crest', 'tusk_lower', 'lantern', 'ghost_trail',
        'hair_short', 'hair_long', 'hair_bun'],
    quadruped: ['horns_small', 'horns_large', 'tail_stub', 'tail_long', 'armor_light', 'aura',
        'antlers', 'mane', 'tusk_lower', 'scale_ridges', 'carapace'],
    amoeba: ['aura', 'fin_dorsal', 'tentacles', 'carapace', 'lantern', 'ghost_trail'],
    avian: ['wings_bat', 'crown', 'tail_stub', 'tail_long', 'feather_crest', 'fin_dorsal', 'lantern', 'scale_ridges'],
    serpent: ['tail_long', 'horns_small', 'crown', 'aura', 'fin_dorsal', 'scale_ridges', 'tentacles', 'carapace'],
};
// ── Preset DNA ───────────────────────────────────────────────────────────────
/** Golden-retriever-inspired quad — robust, warm colouring, happy face.
 *  Longer legs (limbLength 1.25) so the analytical IK knee bend is clearly visible. */
export const DOG_DNA = (() => {
    const d = dnaForArchetype('quadruped');
    d.colors = { primary: 0xc2410c, secondary: 0x7c2d12, emissive: 0x3a0f00,
        emissiveIntensity: 0.02, pattern: 'none', patternColor: 0x7c2d12,
        patternScale: 1.0, patternOpacity: 0.0 };
    d.proportions = { ...d.proportions,
        torso: [0.9, 0.65, 1.3], headSize: 1.05, limbLength: 1.25, limbWidth: 1.1,
        neckLength: 1.2, tailLength: 1.0, shoulderWidth: 1.1, hipWidth: 1.0 };
    d.face = { type: 'cute', eyeColor: 0x4a2800, mouthType: 'smile',
        expression: 'happy', eyeShape: 'round', skinPattern: 'none',
        markColor: 0x7c2d12, browStyle: 'none' };
    d.props = ['tail_long'];
    return d;
})();
/** Sleek tabby-inspired quad — smaller body, long slender legs, slit eyes, stripes.
 *  Higher limbLength (1.40) gives the slinky feline silhouette. */
export const CAT_DNA = (() => {
    const d = dnaForArchetype('quadruped');
    d.colors = { primary: 0xf59e0b, secondary: 0x92400e, emissive: 0x301800,
        emissiveIntensity: 0.02, pattern: 'stripes', patternColor: 0x78350f,
        patternScale: 0.8, patternOpacity: 0.50 };
    d.proportions = { ...d.proportions,
        global: 0.80, torso: [0.7, 0.55, 1.1], headSize: 0.85, limbLength: 1.40,
        limbWidth: 0.65, neckLength: 1.4, tailLength: 1.6, shoulderWidth: 0.90, hipWidth: 0.85 };
    d.face = { type: 'cat', eyeColor: 0x34d399, mouthType: 'smile',
        expression: 'neutral', eyeShape: 'slit', skinPattern: 'stripes',
        markColor: 0x78350f, browStyle: 'none' };
    d.props = ['tail_long'];
    return d;
})();
