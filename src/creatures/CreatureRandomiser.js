// ── CreatureRandomiser ────────────────────────────────────────────────────────
//
//  Generates and mutates CreatureDNA using a seeded PRNG (mulberry32).
//  Math.random() is NEVER used here — every output is seed-deterministic.
import { mulberry32, randInt } from '@/core/prng';
import { dnaForArchetype, dnaForSubRace, cloneDNA, BIPED_SUBRACES, } from './CreatureDNA';
// ── Helpers ───────────────────────────────────────────────────────────────────
/** HSL (all values 0–1) → 24-bit RGB integer. */
function _hsl(h, s, l) {
    const C = (1 - Math.abs(2 * l - 1)) * s;
    const X = C * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - C / 2;
    let r = 0, g = 0, b = 0;
    if (h < 1 / 6) {
        r = C;
        g = X;
        b = 0;
    }
    else if (h < 2 / 6) {
        r = X;
        g = C;
        b = 0;
    }
    else if (h < 3 / 6) {
        r = 0;
        g = C;
        b = X;
    }
    else if (h < 4 / 6) {
        r = 0;
        g = X;
        b = C;
    }
    else if (h < 5 / 6) {
        r = X;
        g = 0;
        b = C;
    }
    else {
        r = C;
        g = 0;
        b = X;
    }
    return (Math.round((r + m) * 255) << 16)
        | (Math.round((g + m) * 255) << 8)
        | Math.round((b + m) * 255);
}
/** RGB int → {h, s, l} each in [0, 1]. */
function _rgbToHsl(rgb) {
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = ((rgb) & 0xff) / 255;
    const max = Math.max(r, g, b), min2 = Math.min(r, g, b);
    const l = (max + min2) / 2;
    const d = max - min2;
    const s = d === 0 ? 0 : (l < 0.5 ? d / (max + min2) : d / (2 - max - min2));
    let h = 0;
    if (d !== 0) {
        if (max === r)
            h = (((g - b) / d) + 6) % 6;
        else if (max === g)
            h = ((b - r) / d) + 2;
        else
            h = ((r - g) / d) + 4;
        h /= 6;
    }
    return { h, s, l };
}
function _pick(rand, arr) {
    return arr[randInt(rand, arr.length)];
}
function _lerp(a, b, t) {
    return a + (b - a) * t;
}
// ── Distributions ─────────────────────────────────────────────────────────────
const ARCH_WEIGHTS = [
    ['biped', 0.30], ['quadruped', 0.25], ['avian', 0.20], ['serpent', 0.15], ['amoeba', 0.10],
];
const PROP_POOLS = {
    biped: ['horns_small', 'horns_large', 'tail_stub', 'tail_long', 'wings_bat', 'crown', 'aura'],
    quadruped: ['horns_small', 'horns_large', 'tail_stub', 'tail_long', 'aura'],
    avian: ['tail_stub', 'tail_long', 'crown', 'aura'],
    amoeba: ['aura'],
    serpent: ['tail_long', 'aura', 'horns_small'],
};
const TOP_POOL = ['none', 'tunic', 'robe_top', 'armor_chest', 'wrap'];
const LEGS_POOL = ['none', 'trousers', 'skirt', 'shorts', 'loincloth', 'robe_skirt'];
const OVER_POOL = ['none', 'none', 'robe_full', 'cape', 'cloak']; // none weighted heavier
const FACE_POOLS = {
    biped: [
        ['cute', 'smile'], ['cute', 'smile'], ['cute', 'fangs'],
        ['angry', 'frown'], ['angry', 'fangs'], ['skull', 'fangs'],
        ['cherubic', 'smile'], ['cherubic', 'smile'],
        ['gaunt', 'frown'], ['gaunt', 'fangs'],
        ['demon', 'fangs'], ['compound', 'none'],
    ],
    quadruped: [
        ['angry', 'fangs'], ['angry', 'frown'], ['cute', 'smile'], ['blank', 'none'],
        ['lizard', 'fangs'], ['cat', 'smile'],
    ],
    amoeba: [['cyclops', 'none'], ['compound', 'none'], ['blank', 'none'], ['ancient', 'none']],
    avian: [['cute', 'beak'], ['cute', 'beak'], ['angry', 'beak'], ['bird', 'beak'], ['blank', 'none']],
    serpent: [['angry', 'fangs'], ['angry', 'frown'], ['lizard', 'fangs'], ['demon', 'fangs'], ['blank', 'none']],
};
const EYE_POOLS = {
    biped: ['round', 'round', 'almond', 'almond', 'star', 'void'],
    quadruped: ['slit', 'slit', 'almond', 'round'],
    amoeba: ['round', 'compound', 'void'],
    avian: ['round', 'almond'],
    serpent: ['slit', 'slit', 'void'],
};
const BROW_POOLS = {
    biped: ['none', 'thin', 'thick', 'arched', 'furrowed'],
    quadruped: ['none', 'thick', 'furrowed'],
    amoeba: ['none'],
    avian: ['none', 'thin'],
    serpent: ['none', 'thick'],
};
const PATTERN_POOLS = {
    biped: ['none', 'none', 'none', 'stripes', 'spots', 'gradient', 'fur'],
    quadruped: ['none', 'none', 'stripes', 'spots', 'fur'],
    amoeba: ['none', 'gradient', 'cracks'],
    avian: ['none', 'stripes', 'gradient'],
    serpent: ['none', 'scales', 'scales', 'stripes'],
};
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate a fully random, coherent CreatureDNA from a seed.
 * Pass `forceArch` to lock the archetype while randomising everything else.
 */
export function randomDNA(seed, forceArch) {
    const rand = mulberry32(seed);
    // Archetype
    let arch;
    if (forceArch) {
        arch = forceArch;
    }
    else {
        const r = rand();
        let cumul = 0;
        arch = 'biped';
        for (const [a, w] of ARCH_WEIGHTS) {
            cumul += w;
            if (r < cumul) {
                arch = a;
                break;
            }
        }
    }
    let dna = dnaForArchetype(arch);
    // Sub-race (biped only)
    if (arch === 'biped') {
        dna = dnaForSubRace(_pick(rand, BIPED_SUBRACES), dna);
    }
    // HSL-harmony palette
    const h1 = rand();
    const s1 = 0.30 + rand() * 0.55;
    const l1 = 0.35 + rand() * 0.35;
    const analogous = rand() > 0.45;
    const h2 = analogous
        ? (h1 + 0.08 + rand() * 0.10) % 1
        : (h1 + 0.42 + rand() * 0.17) % 1;
    const s2 = 0.35 + rand() * 0.50;
    const l2 = 0.20 + rand() * 0.30;
    const h3 = (h1 + 0.50 + rand() * 0.08) % 1;
    dna.colors.primary = _hsl(h1, s1, l1);
    dna.colors.secondary = _hsl(h2, s2, l2);
    dna.colors.emissive = _hsl(h3, 0.70 + rand() * 0.30, 0.40 + rand() * 0.25);
    dna.colors.emissiveIntensity = rand() < 0.35 ? 0.0 : 0.02 + rand() * 0.18;
    // Proportions
    const p = dna.proportions;
    p.global = _lerp(0.72, 1.40, rand());
    p.headSize = _lerp(0.70, 1.30, rand());
    p.limbLength = _lerp(0.75, 1.30, rand());
    p.limbWidth = _lerp(0.70, 1.40, rand());
    p.neckLength = _lerp(0.70, 1.50, rand());
    if (arch === 'biped') {
        p.shoulderWidth = _lerp(0.70, 1.55, rand());
        p.hipWidth = _lerp(0.70, 1.55, rand());
        p.bellySize = rand() < 0.35 ? _lerp(0.30, 1.20, rand()) : 0.0;
        p.neckThickness = _lerp(0.60, 1.50, rand());
    }
    // Face
    const [faceType, mouthType] = _pick(rand, FACE_POOLS[arch]);
    dna.face.type = faceType;
    dna.face.mouthType = mouthType;
    dna.face.eyeColor = _hsl((h1 + 0.5) % 1, 0.60 + rand() * 0.40, 0.10 + rand() * 0.20);
    dna.face.eyeShape = _pick(rand, EYE_POOLS[arch]);
    dna.face.browStyle = _pick(rand, BROW_POOLS[arch]);
    dna.face.skinPattern = _pick(rand, PATTERN_POOLS[arch]);
    dna.face.markColor = _hsl((h1 + 0.33 + rand() * 0.1) % 1, 0.5 + rand() * 0.4, 0.25 + rand() * 0.3);
    // Props: 0–3 from archetype pool
    const pool = PROP_POOLS[arch] ?? [];
    const propCount = randInt(rand, 4);
    const shuffled = [...pool].sort(() => rand() - 0.5);
    dna.props = shuffled.slice(0, Math.min(propCount, shuffled.length));
    // Outfit (biped only)
    if (arch === 'biped') {
        dna.outfit.top = rand() < 0.45 ? 'none' : _pick(rand, TOP_POOL);
        dna.outfit.legs = rand() < 0.30 ? 'none' : _pick(rand, LEGS_POOL);
        dna.outfit.over = rand() < 0.60 ? 'none' : _pick(rand, OVER_POOL);
    }
    // Material variation
    dna.material.roughness = 0.25 + rand() * 0.60;
    dna.material.metalness = rand() < 0.30 ? rand() * 0.40 : 0;
    dna.material.clearcoat = 0.40 + rand() * 0.50;
    return dna;
}
/**
 * Produce a nearby variant of an existing DNA.
 * Archetype and sub-race are preserved.
 * `strength` controls how much values shift (0 = unchanged, 1 = max drift).
 */
export function mutateDNA(dna, strength, seed) {
    const rand = mulberry32(seed);
    const d = cloneDNA(dna);
    const s = Math.min(1, Math.max(0, strength));
    const nudge = (v, lo, hi) => Math.min(hi, Math.max(lo, v + (rand() - 0.5) * 2 * s * (hi - lo) * 0.4));
    d.proportions.global = nudge(d.proportions.global, 0.50, 2.00);
    d.proportions.headSize = nudge(d.proportions.headSize, 0.60, 1.60);
    d.proportions.limbLength = nudge(d.proportions.limbLength, 0.50, 1.50);
    d.proportions.limbWidth = nudge(d.proportions.limbWidth, 0.50, 1.60);
    d.proportions.neckLength = nudge(d.proportions.neckLength, 0.50, 1.80);
    d.proportions.shoulderWidth = nudge(d.proportions.shoulderWidth ?? 1, 0.50, 2.00);
    d.proportions.hipWidth = nudge(d.proportions.hipWidth ?? 1, 0.50, 2.00);
    d.proportions.bellySize = nudge(d.proportions.bellySize ?? 0, 0.00, 1.50);
    d.proportions.neckThickness = nudge(d.proportions.neckThickness ?? 1, 0.50, 1.80);
    // Hue shift
    if (rand() < 0.25 * (1 + s)) {
        const { h, s: sat, l } = _rgbToHsl(d.colors.primary);
        const shift = (rand() - 0.5) * 0.25 * s;
        d.colors.primary = _hsl(((h + shift) + 1) % 1, sat, l);
        d.colors.secondary = _hsl(((h + shift + 0.1) + 1) % 1, sat * 0.90, l * 0.85);
    }
    // Swap one prop
    if (rand() < 0.20 * (1 + s)) {
        const pool = PROP_POOLS[d.archetype] ?? [];
        if (pool.length > 0) {
            if (d.props.length > 0 && rand() < 0.5) {
                d.props.splice(randInt(rand, d.props.length), 1);
            }
            else {
                const next = _pick(rand, pool);
                if (!d.props.includes(next))
                    d.props.push(next);
            }
        }
    }
    return d;
}
