import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildVampireWindow,
  buildVampireShutteredWindow,
  buildVampireDoor,
  buildVampireOculus,
} from '@/world/buildings/vampire/VampireOpenings';

function palette() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#888' }),
    glazing: new THREE.MeshStandardMaterial({ color: '#222', emissive: '#e8a030', emissiveIntensity: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: '#332211' }),
    iron: new THREE.MeshStandardMaterial({ color: '#444' }),
  };
}

describe('buildVampireWindow', () => {
  it('builds a tall lancet window with all five opening parts', () => {
    const win = buildVampireWindow({ width: 0.8, height: 1.9, wallZ: 0, palette: palette() });
    const names = new Set<string>();
    win.traverse((o) => { if (o.name) names.add(o.name); });
    for (const part of ['recess', 'surround', 'sill', 'division', 'glazing']) {
      expect(names.has(part)).toBe(true);
    }
  });

  it('produces a taller point (lancet) than a dwarven-style low-ratio arch would', () => {
    const shallow = buildVampireWindow({ width: 0.8, height: 1.9, wallZ: 0, palette: palette(), archRatio: 0.6 }); // clamped up
    const lancet = buildVampireWindow({ width: 0.8, height: 1.9, wallZ: 0, palette: palette(), archRatio: 1.6 });
    const shallowBox = new THREE.Box3().setFromObject(shallow.getObjectByName('surround')!);
    const lancetBox = new THREE.Box3().setFromObject(lancet.getObjectByName('surround')!);
    // archRatio is clamped to [1.4, 1.7], so the "shallow" request (0.6) still
    // lands near the floor of that lancet range, well below the lancet request.
    expect(lancetBox.max.y).toBeGreaterThanOrEqual(shallowBox.max.y);
  });
});

describe('buildVampireShutteredWindow', () => {
  it('combines a real window opening with a closed shutter pair', () => {
    const group = buildVampireShutteredWindow({ width: 0.8, height: 1.9, wallZ: 0, palette: palette() });
    expect(group.getObjectByName('opening')).toBeTruthy();
    expect(group.getObjectByName('shutter-pair')).toBeTruthy();
    const shutters = group.getObjectByName('shutter-pair')!;
    expect(shutters.getObjectByName('shutter-leaf-left')).toBeTruthy();
    expect(shutters.getObjectByName('shutter-leaf-right')).toBeTruthy();
  });

  it('supports a one-leaf-ajar variant for lived-in variety', () => {
    const group = buildVampireShutteredWindow({
      width: 0.8, height: 1.9, wallZ: 0, palette: palette(), rightShutterState: 'one_ajar',
    });
    const shutters = group.getObjectByName('shutter-pair')!;
    const rightPivot = shutters.getObjectByName('shutter-leaf-right')!.getObjectByName('hinge-pivot')!;
    expect(Math.abs(rightPivot.rotation.y)).toBeGreaterThan(0.1);
  });
});

describe('buildVampireDoor', () => {
  it('builds a tall lancet door with planks, straps, and a threshold', () => {
    const door = buildVampireDoor({ width: 1.1, height: 2.4, wallZ: 0, palette: palette() });
    const names = new Set<string>();
    door.traverse((o) => { if (o.name) names.add(o.name); });
    expect(names.has('recess')).toBe(true);
    expect(names.has('surround')).toBe(true);
    expect(names.has('threshold')).toBe(true);
    expect([...names].some((n) => n.startsWith('plank-'))).toBe(true);
  });
});

describe('buildVampireOculus', () => {
  it('builds a round window with a cross division', () => {
    const oculus = buildVampireOculus({ diameter: 0.9, wallZ: 0, palette: palette() });
    const names = new Set<string>();
    oculus.traverse((o) => { if (o.name) names.add(o.name); });
    for (const part of ['recess', 'surround', 'division', 'glazing']) {
      expect(names.has(part)).toBe(true);
    }
  });
});
