import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildUndeadLotDressing } from '@/world/buildings/undead/UndeadLotDressing';
import { buildUndeadPalette } from '@/world/buildings/undead/UndeadNecropolisPalette';
import type { BuildingDNA } from '@/world/buildings/BuildingDNA';

function makeDna(seed: number): BuildingDNA {
  return {
    seed,
    faction: 'undead_common',
    buildingKind: 'house',
    size: 'small',
    style: 'stone',
    condition: 'ruined',
    floors: 1,
    colors: { walls: '#5a5048', roof: '#383028', trim: '#2a2020', door: '#1a1a18' },
  } as BuildingDNA;
}

function serialize(group: THREE.Group): string {
  const parts: string[] = [];
  group.children.forEach((child) => {
    parts.push(`${child.name}:${child.position.x.toFixed(4)},${child.position.y.toFixed(4)},${child.position.z.toFixed(4)}`);
  });
  return parts.join('|');
}

function assertFiniteGeometry(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const pos = child.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });
}

describe('buildUndeadLotDressing', () => {
  it('is deterministic for the same seed', () => {
    const palette = buildUndeadPalette(makeDna(42));
    const a = buildUndeadLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 42, propCount: 6 });
    const b = buildUndeadLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 42, propCount: 6 });
    expect(serialize(a)).toBe(serialize(b));
  });

  it('varies across seeds', () => {
    const palette = buildUndeadPalette(makeDna(1));
    const a = buildUndeadLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 1, propCount: 6 });
    const b = buildUndeadLotDressing({ halfW: 2, halfD: 1.5, palette, seed: 2, propCount: 6 });
    expect(serialize(a)).not.toBe(serialize(b));
  });

  it('never places a prop inside the front entrance clearance rectangle', () => {
    const palette = buildUndeadPalette(makeDna(7));
    const halfW = 2.2;
    const halfD = 1.6;
    const entranceHalfWidth = 0.6;
    for (const seed of [1, 2, 3, 42, 999]) {
      const dressing = buildUndeadLotDressing({ halfW, halfD, palette, seed, entranceHalfWidth, propCount: 9 });
      dressing.children.forEach((child) => {
        const insideClearanceX = Math.abs(child.position.x) < entranceHalfWidth;
        const inFrontOfDoor = child.position.z > halfD - 0.05;
        expect(insideClearanceX && inFrontOfDoor).toBe(false);
      });
    }
  });

  it('produces real named ground-contact props with finite geometry (not floating)', () => {
    const palette = buildUndeadPalette(makeDna(5));
    const dressing = buildUndeadLotDressing({ halfW: 2.5, halfD: 2, palette, seed: 5, propCount: 9 });
    expect(dressing.name).toBe('undead-lot-dressing');
    expect(dressing.children.length).toBe(9);
    const kindPrefixes = ['undead-monument-', 'undead-rail-', 'undead-lantern-post-', 'undead-paver-', 'undead-rubble-'];
    dressing.children.forEach((child) => {
      expect(kindPrefixes.some((prefix) => child.name.startsWith(prefix))).toBe(true);
    });
    assertFiniteGeometry(dressing);
  });

  it('varies prop kinds across a large sweep (not a single monoculture)', () => {
    const palette = buildUndeadPalette(makeDna(11));
    const dressing = buildUndeadLotDressing({ halfW: 4, halfD: 3, palette, seed: 11, propCount: 9 });
    const kinds = new Set(dressing.children.map((c) => c.name.replace(/-\d+$/, '')));
    expect(kinds.size).toBeGreaterThan(1);
  });
});
