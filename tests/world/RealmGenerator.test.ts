import { describe, it, expect } from 'vitest';
import { generateRealmData } from '@/world/RealmGenerator';

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
      'grassland', 'forest', 'taiga', 'tundra', 'snow',
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
});
