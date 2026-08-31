import { describe, it, expect } from 'vitest';
import { generateRealmData, classifyBiome, _domainWarp } from '@/world/RealmGenerator';
import { createNoise2D } from '@/core/SimplexNoise';

describe('generateRealmData', () => {
  it('is deterministic for the same seed', () => {
    const a = generateRealmData(12345);
    const b = generateRealmData(12345);
    expect(a).toEqual(b);
  });

  it('produces different output for different seeds', () => {
    const a = generateRealmData(1);
    const b = generateRealmData(2);
    expect(a.cells).not.toEqual(b.cells);
  });

  it('produces a cells grid matching the requested W x H', () => {
    const realm = generateRealmData(42, 40, 30);
    expect(realm.W).toBe(40);
    expect(realm.H).toBe(30);
    expect(realm.cells.length).toBe(30);
    expect(realm.cells[0]!.length).toBe(40);
  });

  it('every cell has a valid elevation, moisture, and biome', () => {
    const realm = generateRealmData(7, 30, 20);
    const validBiomes = new Set([
      'deep_ocean', 'ocean', 'beach', 'desert', 'savanna',
      'grassland', 'forest', 'taiga', 'tundra', 'snow', 'mountain',
    ]);
    for (const row of realm.cells) {
      for (const cell of row) {
        expect(cell.elevation).toBeGreaterThanOrEqual(0);
        expect(cell.elevation).toBeLessThanOrEqual(1);
        expect(cell.moisture).toBeGreaterThanOrEqual(0);
        expect(validBiomes.has(cell.biome)).toBe(true);
      }
    }
  });

  it('places the requested number of settlements (or fewer if land is scarce)', () => {
    const realm = generateRealmData(99, 60, 45, 5);
    expect(realm.settlements.length).toBeLessThanOrEqual(5);
    expect(realm.settlements.length).toBeGreaterThan(0);
  });

  it('places the tower on non-ocean land', () => {
    const realm = generateRealmData(55, 50, 40);
    const towerCell = realm.cells[realm.towerY]![realm.towerX]!;
    expect(towerCell.biome).not.toBe('ocean');
    expect(towerCell.biome).not.toBe('deep_ocean');
  });

  it('places at least one dungeon marker for a reasonably sized realm', () => {
    const realm = generateRealmData(8, 60, 45);
    expect(realm.dungeons.length).toBeGreaterThan(0);
  });

  it('records the seed it was generated with', () => {
    const realm = generateRealmData(777);
    expect(realm.seed).toBe(777);
  });

  it('produces a lakes field (array) alongside rivers', () => {
    const realm = generateRealmData(42, 40, 30);
    expect(Array.isArray(realm.lakes)).toBe(true);
  });

  it('produces at least one lake with tiles for at least one of several seeds ' +
     '(lake placement depends on local elevation minima, so checked loosely ' +
     'across seeds rather than guaranteed for every single one)', () => {
    const seeds = [10, 11, 12, 13, 14, 15, 16, 17];
    let found = false;
    for (const seed of seeds) {
      const realm = generateRealmData(seed, 80, 60);
      if (realm.lakes.some(l => l.cells.length > 0)) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});

describe('classifyBiome — mountain biome (Phase 1)', () => {
  it('classifies high elevation below the snow line as mountain, regardless of moisture/temperature', () => {
    expect(classifyBiome(0.75, 0.1, 0.9)).toBe('mountain');  // dry + hot
    expect(classifyBiome(0.78, 0.9, 0.1)).toBe('mountain');  // wet + cold
    expect(classifyBiome(0.80, 0.5, 0.5)).toBe('mountain');  // mid moisture/temp
  });

  it('still classifies the very highest elevations as snow, not mountain', () => {
    expect(classifyBiome(0.90, 0.5, 0.5)).toBe('snow');
    expect(classifyBiome(0.99, 0.1, 0.9)).toBe('snow');
  });

  it('does not classify low/mid elevation as mountain regardless of moisture/temperature', () => {
    expect(classifyBiome(0.10, 0.5, 0.5)).not.toBe('mountain'); // deep_ocean band
    expect(classifyBiome(0.50, 0.1, 0.9)).not.toBe('mountain'); // desert-band elevation
    expect(classifyBiome(0.65, 0.5, 0.5)).not.toBe('mountain'); // just below the mountain threshold
  });
});

describe('_domainWarp', () => {
  it('is deterministic for the same inputs', () => {
    const noiseW = createNoise2D(123);
    const a = _domainWarp(0.4, 0.6, 0.5, noiseW);
    const b = _domainWarp(0.4, 0.6, 0.5, noiseW);
    expect(a).toEqual(b);
  });

  it('stays within the documented bound (0.03 + roughness * 0.05) for a range of roughness values', () => {
    const noiseW = createNoise2D(456);
    for (let i = 0; i < 30; i++) {
      for (const roughness of [0, 0.25, 0.5, 0.75, 1]) {
        const nx = (i * 0.037) % 1, ny = (i * 0.071) % 1;
        const { wx, wy } = _domainWarp(nx, ny, roughness, noiseW);
        const bound = 0.03 + roughness * 0.05;
        expect(Math.abs(wx - nx)).toBeLessThanOrEqual(bound + 1e-9);
        expect(Math.abs(wy - ny)).toBeLessThanOrEqual(bound + 1e-9);
      }
    }
  });

  it('produces more than one distinct displacement across many positions (not a degenerate constant)', () => {
    const noiseW = createNoise2D(789);
    const displacements = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const nx = (i * 0.041) % 1, ny = (i * 0.083) % 1;
      const { wx, wy } = _domainWarp(nx, ny, 0.5, noiseW);
      displacements.add(`${(wx - nx).toFixed(6)},${(wy - ny).toFixed(6)}`);
    }
    expect(displacements.size).toBeGreaterThan(1);
  });

  it('gives dx and dy different values (decorrelated, not the same displacement in both axes)', () => {
    const noiseW = createNoise2D(321);
    const { wx, wy } = _domainWarp(0.33, 0.71, 0.5, noiseW);
    expect(wx - 0.33).not.toBeCloseTo(wy - 0.71, 6);
  });
});

describe('generateRealmData — domain warp wiring', () => {
  it('feeds a warped coordinate into elevation/moisture sampling, not the raw (nx, ny)', () => {
    // Reproduce the exact pre-warp sampling formula inline (same noise
    // instances/seeds generateRealmData() itself constructs) and confirm
    // the real, current output differs from what the OLD unwarped formula
    // would have produced at the same cell — proves the warp is actually
    // wired into the real generation path, not just correct in isolation
    // (the _domainWarp describe block above already proves the underlying
    // pure function is correct/bounded).
    const seed = 2024, W = 40, H = 30;
    const realm = generateRealmData(seed, W, H, 6, 'island', 'temperate', 0.5);

    const noiseE = createNoise2D(seed);
    const noiseR = createNoise2D(seed ^ 0xBADF00D);
    const oct = 4 + Math.round(0.5 * 2), scale = 1.8 + 0.5 * 1.2;
    const cx = 17, cy = 11; // an arbitrary non-edge, non-symmetric cell
    const nx = cx / W, ny = cy / H;
    const mask = (nx2: number, ny2: number) => Math.min(nx2, 1 - nx2, ny2, 1 - ny2) * 4.2; // 'island' shape's mask fn
    const fbmR2 = (noise: (x: number, y: number) => number, x: number, y: number, o: number, s: number) => {
      let v = 0, amp = 0.5, freq = s, max = 0;
      for (let i = 0; i < o; i++) { v += noise(x * freq, y * freq) * amp; max += amp; amp *= 0.5; freq *= 2.0; }
      return (v / max + 1) / 2;
    };
    const unwarpedMVal  = Math.min(1, mask(nx, ny));
    const unwarpedNoise = fbmR2(noiseE, nx, ny, oct, scale);
    const unwarpedRidge = Math.abs(fbmR2(noiseR, nx * 1.3, ny * 1.3, 3, 3.0) - 0.5) * 2;
    const unwarpedElev  = Math.min(1, unwarpedMVal * (unwarpedNoise * 0.75 + unwarpedRidge * 0.25 * 0.5 + 0.2));

    const actualElev = realm.cells[cy]![cx]!.elevation;
    expect(actualElev).not.toBeCloseTo(unwarpedElev, 6);
  });
});
