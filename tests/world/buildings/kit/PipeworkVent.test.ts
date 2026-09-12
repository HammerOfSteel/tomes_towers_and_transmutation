import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLouvredVent, buildPipeRun, buildStorageTank } from '@/world/buildings/kit/PipeworkVent';

function makeMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.7, metalness: 0.5 });
}

describe('buildPipeRun', () => {
  it('produces straight segments, elbows, and mounting brackets (never a single bare cylinder)', () => {
    const pipe = buildPipeRun({
      segments: [
        { dir: 'up', length: 0.6 },
        { dir: 'forward', length: 0.4 },
        { dir: 'up', length: 0.3 },
      ],
      material: makeMaterial(),
    });
    const names = pipe.children.map((c) => c.name);
    expect(names.some((n) => n.startsWith('pipe-segment-'))).toBe(true);
    expect(names.some((n) => n.startsWith('pipe-elbow-'))).toBe(true);
    expect(names.some((n) => n.startsWith('pipe-bracket-'))).toBe(true);
  });
});

describe('buildLouvredVent', () => {
  it('produces a recessed frame with angled louvre slats (real relief, not a grille texture)', () => {
    const vent = buildLouvredVent({ width: 0.5, height: 0.7, material: makeMaterial() });
    const names = vent.children.map((c) => c.name);
    expect(names).toContain('vent-frame');
    const louvres = vent.children.filter((c) => c.name.startsWith('vent-louvre-'));
    expect(louvres.length).toBeGreaterThanOrEqual(3);
    for (const louvre of louvres) {
      expect(Math.abs(louvre.rotation.x)).toBeGreaterThan(0.05);
    }
  });
});

describe('buildStorageTank', () => {
  it('produces a banded cylindrical tank with rivet bands, base, and cap (never a bare cylinder)', () => {
    const tank = buildStorageTank({ radius: 0.5, height: 1.2, material: makeMaterial() });
    const names = tank.children.map((c) => c.name);
    expect(names).toContain('tank-body');
    expect(names).toContain('tank-cap');
    expect(names).toContain('tank-base');
    expect(names.some((n) => n.startsWith('tank-rivet-band-'))).toBe(true);
  });
});
