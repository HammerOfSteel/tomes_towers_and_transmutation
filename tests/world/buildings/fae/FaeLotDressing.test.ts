import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFaeLotDressing } from '@/world/buildings/fae/FaeLotDressing';
import { buildFaePalette } from '@/world/buildings/fae/FaePalette';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';

describe('buildFaeLotDressing', () => {
  const palette = buildFaePalette(factionBuildingDna('house', 'fae', 1, 'small', 1));

  it('places deterministic props around the footprint, skipping the front doorway lane', () => {
    const g = buildFaeLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    expect(g.name).toBe('fae-lot-dressing');
    expect(g.children.length).toBeGreaterThan(2);
    for (const child of g.children) {
      expect(child.name.startsWith('fae-')).toBe(true);
    }
  });

  it('same seed produces the same prop layout', () => {
    const a = buildFaeLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    const b = buildFaeLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    expect(a.children.map((c) => c.name)).toEqual(b.children.map((c) => c.name));
  });

  it('produces only finite, uv-complete geometry', () => {
    const g = buildFaeLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      expect(o.geometry.getAttribute('uv')).toBeTruthy();
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i))).toBe(true);
      }
    });
  });
});
