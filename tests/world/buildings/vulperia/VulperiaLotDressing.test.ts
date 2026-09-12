import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVulperiaLotDressing } from '@/world/buildings/vulperia/VulperiaLotDressing';
import { buildVulperiaPalette } from '@/world/buildings/vulperia/VulperiaPalette';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';

describe('buildVulperiaLotDressing', () => {
  const palette = buildVulperiaPalette(factionBuildingDna('house', 'vulperia', 1, 'small', 1));

  it('places deterministic props around the footprint, skipping the front doorway lane', () => {
    const g = buildVulperiaLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    expect(g.name).toBe('vulperia-lot-dressing');
    expect(g.children.length).toBeGreaterThan(2);
    for (const child of g.children) {
      expect(child.name.startsWith('vulperia-')).toBe(true);
    }
  });

  it('same seed produces the same prop layout', () => {
    const a = buildVulperiaLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    const b = buildVulperiaLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
    expect(a.children.map((c) => c.name)).toEqual(b.children.map((c) => c.name));
  });

  it('produces only finite, uv-complete geometry', () => {
    const g = buildVulperiaLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 5 });
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
