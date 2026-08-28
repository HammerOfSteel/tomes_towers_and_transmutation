import { describe, it, expect } from 'vitest';
import { generateRealmData } from '@/world/RealmGenerator';

describe('generateRealmData — 512x512 performance + determinism', () => {
  it('generates a 512x512 realm in under 3 seconds', () => {
    const start = performance.now();
    const realm = generateRealmData(999, 512, 512);
    const elapsedMs = performance.now() - start;
    expect(realm.W).toBe(512);
    expect(realm.H).toBe(512);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it('is fully deterministic for the same seed and size', () => {
    const a = generateRealmData(4242, 512, 512);
    const b = generateRealmData(4242, 512, 512);
    // Full deep-equal over the entire 512x512 cell grid (elevation/moisture/biome
    // per cell) — catches any nondeterminism anywhere in the grid, not just at
    // two corners. Measured ~330ms for the comparison, well within budget.
    expect(a.cells).toEqual(b.cells);
    // Full settlement objects (position, name, size, faction) must match exactly,
    // not just the count — a shuffled-but-same-length settlement list would
    // otherwise slip through undetected.
    expect(a.settlements).toEqual(b.settlements);
  });

  it('produces the same settlement count across resolutions for the same seed (macro-structure stable)', () => {
    const small = generateRealmData(555, 96, 72, 6);
    const large = generateRealmData(555, 512, 512, 6);
    expect(small.settlements.length).toBe(large.settlements.length);
  });

  it('produces a recognizably similar coastline (land/water layout) across resolutions for the same seed', () => {
    // Settlement placement itself is NOT resolution-invariant: it depends on a
    // shuffled list of resolution-dependent "valid biome" candidate cells (see
    // `sv = [...validCells].sort(() => rand() - 0.5)` in RealmGenerator.ts), so
    // the *order* in which the shared PRNG stream is consumed diverges between
    // a 96x72 and a 512x512 grid — verified empirically: normalized settlement
    // positions for the same seed do NOT line up across resolutions. Asserting
    // proportional settlement-position equality would therefore be testing a
    // property the implementation doesn't actually provide.
    //
    // What *is* resolution-invariant is the underlying terrain field: elevation/
    // biome are pure functions of normalized coordinates (nx = cx/W, ny = cy/H)
    // and the seed, sampled independently of grid size. So the coastline
    // (land vs. water) shape should be recognizably the same regardless of
    // resolution. We sample a grid of normalized positions and compare the
    // land/water classification at the nearest cell in each resolution.
    const small = generateRealmData(555, 96, 72, 6);
    const large = generateRealmData(555, 512, 512, 6);

    const isLand = (biome: string) => biome !== 'ocean' && biome !== 'deep_ocean';
    const SAMPLES = 20;
    let matches = 0;
    let total = 0;
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < SAMPLES; j++) {
        const nx = (i + 0.5) / SAMPLES;
        const ny = (j + 0.5) / SAMPLES;
        const sx = Math.min(small.W - 1, Math.floor(nx * small.W));
        const sy = Math.min(small.H - 1, Math.floor(ny * small.H));
        const lx = Math.min(large.W - 1, Math.floor(nx * large.W));
        const ly = Math.min(large.H - 1, Math.floor(ny * large.H));
        const smallIsLand = isLand(small.cells[sy]![sx]!.biome);
        const largeIsLand = isLand(large.cells[ly]![lx]!.biome);
        total++;
        if (smallIsLand === largeIsLand) matches++;
      }
    }
    // Observed match rate is ~0.99 for seed 555; allow generous slack for
    // discretization/boundary noise while still catching a genuinely different
    // (unrecognizable) coastline.
    expect(matches / total).toBeGreaterThanOrEqual(0.9);

    // Overall land coverage should also be close across resolutions — a sanity
    // check on gross continent size/shape, independent of per-cell noise.
    const landFraction = (realm: ReturnType<typeof generateRealmData>) =>
      realm.cells.flat().filter(c => isLand(c.biome)).length / (realm.W * realm.H);
    expect(Math.abs(landFraction(small) - landFraction(large))).toBeLessThan(0.05);
  });
});
