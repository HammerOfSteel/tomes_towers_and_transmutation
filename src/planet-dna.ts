/**
 * planet-dna.ts — Planet DNA types and visual presets for OW-F2
 *
 * Provides per-type biome color tables, atmosphere settings, ring and moon DNA.
 * Consumed by HexPlanetRenderer and PlanetRenderer.
 */

export type PlanetType =
  | 'terran' | 'ocean' | 'gas_giant' | 'ice'
  | 'volcanic' | 'toxic' | 'desert' | 'verdant'
  | 'dead' | 'ringed';

export type RGB = [number, number, number];
export type BiomeTable = Record<string, RGB>;

export interface MoonDNA {
  seed: number;
  size: number;         // radius fraction of BASE_R (0.04-0.18)
  orbitRadius: number;  // THREE.js units (2.8-5.5)
  orbitSpeed: number;   // rad/s
  tiltY: number;        // orbit tilt in rad
  color: number;        // THREE hex int
}

export interface PlanetDNA {
  seed: number;
  type: PlanetType;
  atmosphereColor: RGB;
  atmosphereDensity: number; // 0-1 → maps to opacity multiplier
  ringSystem: boolean;
  ringInner: number;         // fraction of BASE_R
  ringOuter: number;
  ringColor: RGB;
  ringOpacity: number;
  moons: MoonDNA[];
}

// ── Per-type UI metadata ────────────────────────────────────────────────────

export const PLANET_META: Record<PlanetType, { emoji: string; label: string }> = {
  terran:    { emoji: '🌍', label: 'Terran'    },
  ocean:     { emoji: '🌊', label: 'Ocean'     },
  gas_giant: { emoji: '🪐', label: 'Gas Giant' },
  ice:       { emoji: '❄',  label: 'Ice'       },
  volcanic:  { emoji: '🌋', label: 'Volcanic'  },
  toxic:     { emoji: '☣',  label: 'Toxic'     },
  desert:    { emoji: '🏜', label: 'Desert'    },
  verdant:   { emoji: '🌿', label: 'Verdant'   },
  dead:      { emoji: '☾',  label: 'Dead'      },
  ringed:    { emoji: '💫', label: 'Ringed'    },
};

// ── Biome colour tables per type ────────────────────────────────────────────

const TERRAN_COLORS: BiomeTable = {
  deep_ocean: [20,  60,  130], ocean:     [35,  90,  160],
  beach:      [194,178, 128], desert:    [210,180, 100],
  savanna:    [160,170,  80], grassland: [ 80,150,  70],
  forest:     [ 40,110,  50], taiga:     [ 70,100,  80],
  tundra:     [160,170, 160], snow:      [220,230, 240],
};

export const PLANET_BIOME_COLORS: Record<PlanetType, BiomeTable> = {
  terran: TERRAN_COLORS,

  ocean: {
    deep_ocean: [10, 50, 140], ocean:     [25, 80, 170],
    beach:      [160,190,220], desert:    [140,175,210],
    savanna:    [120,165,200], grassland: [100,155,190],
    forest:     [ 80,140,180], taiga:     [ 70,130,170],
    tundra:     [190,210,230], snow:      [220,235,250],
  },

  // Gas giant bands — overridden by getPlanetBandColor() at runtime
  gas_giant: {
    deep_ocean: [200,155, 90], ocean:     [215,175,110],
    beach:      [230,205,155], desert:    [220,195,140],
    savanna:    [190,145, 80], grassland: [210,165,100],
    forest:     [175,120, 65], taiga:     [160,105, 55],
    tundra:     [230,215,185], snow:      [245,235,220],
  },

  ice: {
    deep_ocean: [ 80,130,210], ocean:     [120,165,225],
    beach:      [200,215,235], desert:    [210,225,240],
    savanna:    [190,205,230], grassland: [185,200,225],
    forest:     [170,190,220], taiga:     [165,185,218],
    tundra:     [225,230,240], snow:      [240,245,255],
  },

  volcanic: {
    deep_ocean: [200, 40,  10], ocean:     [170, 30,   5],
    beach:      [ 55, 45,  35], desert:    [ 75, 65,  50],
    savanna:    [ 90, 70,  50], grassland: [ 65, 55,  40],
    forest:     [ 45, 35,  28], taiga:     [ 35, 28,  20],
    tundra:     [130,115, 100], snow:      [110, 95,  85],
  },

  toxic: {
    deep_ocean: [ 85, 95,  55], ocean:     [105,115, 70],
    beach:      [145,150, 100], desert:    [155,160,105],
    savanna:    [120,135,  80], grassland: [100,120, 65],
    forest:     [ 80,100,  50], taiga:     [ 70, 90, 45],
    tundra:     [160,165, 120], snow:      [180,175,140],
  },

  desert: {
    deep_ocean: [170, 95,  50], ocean:     [190,120,  65],
    beach:      [215,175, 110], desert:    [225,185, 120],
    savanna:    [210,168, 100], grassland: [195,155,  90],
    forest:     [180,138,  78], taiga:     [165,122,  68],
    tundra:     [205,190, 160], snow:      [220,210, 185],
  },

  verdant: {
    deep_ocean: [15, 75, 155],  ocean:     [30,115,185],
    beach:      [160,200,140],  desert:    [150,185,110],
    savanna:    [110,185, 80],  grassland: [ 55,185, 65],
    forest:     [ 20,145, 45],  taiga:     [ 45,120, 60],
    tundra:     [140,190,130],  snow:      [200,225,200],
  },

  dead: {
    deep_ocean: [ 55, 50,  45], ocean:     [ 75, 70,  62],
    beach:      [145,138, 128], desert:    [160,150, 140],
    savanna:    [148,140, 130], grassland: [135,128, 118],
    forest:     [118,112, 103], taiga:     [105, 98,  90],
    tundra:     [170,165, 155], snow:      [190,185, 178],
  },

  ringed: TERRAN_COLORS, // same terrain, just adds rings
};

// ── Gas giant latitude band colours ─────────────────────────────────────────

const GAS_PALETTES: Record<string, RGB[]> = {
  jupiter: [[230,210,175],[190,150, 90],[220,195,145],[170,110, 60],[215,185,130],[200,165,100],[230,215,180],[185,140, 80]],
  saturn:  [[235,220,185],[205,185,140],[225,210,170],[195,170,120],[240,228,195],[210,192,150],[230,215,178],[200,178,130]],
  uranus:  [[150,205,220],[130,190,210],[160,215,228],[140,198,218],[155,208,224],[135,194,214],[162,218,230],[138,200,220]],
  neptune: [[60, 90,180],[45, 75,165],[70,100,190],[50, 82,172],[65, 95,185],[48, 80,168],[68, 98,188],[52, 85,175]],
};

/** Returns an RGB colour for gas giant tile based on normalised latitude [−1,1] and seed. */
export function getGasGiantBandColor(latNorm: number, seed: number): RGB {
  const keys = Object.keys(GAS_PALETTES);
  const palette = GAS_PALETTES[keys[seed % keys.length]]!;
  const t = Math.abs(Math.sin(latNorm * 7.3 + seed * 0.4)) * 0.5 +
            Math.abs(Math.sin(latNorm * 3.1 + seed * 1.7)) * 0.3;
  const N = palette.length;
  const idx = Math.floor(t * (N - 1));
  const frac = t * (N - 1) - idx;
  const c0 = palette[Math.min(idx, N-1)]!;
  const c1 = palette[Math.min(idx+1, N-1)]!;
  return [
    Math.round(c0[0] + (c1[0]-c0[0])*frac),
    Math.round(c0[1] + (c1[1]-c0[1])*frac),
    Math.round(c0[2] + (c1[2]-c0[2])*frac),
  ];
}

// ── Atmosphere colours per type ──────────────────────────────────────────────

export const PLANET_ATMOS_COLOR: Record<PlanetType, RGB> = {
  terran:    [100,160,230],
  ocean:     [ 60,130,220],
  gas_giant: [200,170,110],
  ice:       [180,210,240],
  volcanic:  [200,100, 20],
  toxic:     [110,140, 50],
  desert:    [210,165, 90],
  verdant:   [ 80,185,100],
  dead:      [140,120, 90],
  ringed:    [110,170,230],
};

// ── Moon counts per type ─────────────────────────────────────────────────────

export const PLANET_MOON_COUNT: Record<PlanetType, number> = {
  terran: 1, ocean: 2, gas_giant: 3, ice: 2,
  volcanic: 1, toxic: 0, desert: 0, verdant: 1,
  dead: 0, ringed: 2,
};

// ── DNA generator ────────────────────────────────────────────────────────────

function mulberry(n: number) {
  let s = n >>> 0;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t^(t>>>15), t|1); t ^= t + Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; };
}

export function generatePlanetDNA(seed: number, type: PlanetType): PlanetDNA {
  const rng  = mulberry(seed ^ 0x4f2a1b3c);
  const hasRings = type === 'ringed' || type === 'gas_giant';

  const moonCount = PLANET_MOON_COUNT[type];
  const moons: MoonDNA[] = [];
  for (let i = 0; i < moonCount; i++) {
    const ms = Math.floor(rng() * 0xffffffff);
    moons.push({
      seed:        ms,
      size:        0.05 + rng() * 0.11,
      orbitRadius: 2.9 + rng() * 2.4,
      orbitSpeed:  0.12 + rng() * 0.35,
      tiltY:       (rng() - 0.5) * 0.6,
      color:       [0x9a9090, 0xc8c0b0, 0xb0b8c4, 0xe8d8c0, 0xa8a090][Math.floor(rng()*5)]!,
    });
  }

  const [ar, ag, ab] = PLANET_ATMOS_COLOR[type];
  const ringColors: Record<string, RGB> = {
    ringed:    [210,190,145],
    gas_giant: [220,195,150],
  };

  return {
    seed, type,
    atmosphereColor:   [ar, ag, ab],
    atmosphereDensity: type === 'dead' ? 0.05 : type === 'gas_giant' ? 0.7 : 0.38,
    ringSystem:  hasRings,
    ringInner:   type === 'gas_giant' ? 1.35 : 1.50,
    ringOuter:   type === 'gas_giant' ? 2.30 : 2.60,
    ringColor:   ringColors[type] ?? [200,185,145],
    ringOpacity: type === 'gas_giant' ? 0.35 : 0.45,
    moons,
  };
}
