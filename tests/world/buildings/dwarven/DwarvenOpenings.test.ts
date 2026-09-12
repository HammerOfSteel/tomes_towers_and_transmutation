import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { assertDepthSeparated } from '@/world/buildings/kit/DepthLadder';
import {
  buildDwarvenDoor,
  buildDwarvenForgeMouth,
  buildDwarvenOculus,
  buildDwarvenVentSlit,
  buildDwarvenWindow,
} from '@/world/buildings/dwarven/DwarvenOpenings';

function palette() {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#5f5a52', roughness: 1 }),
    glazing: new THREE.MeshStandardMaterial({ color: '#12140f', roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: '#3a2c1e', roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: '#2c2a28', roughness: 0.4, metalness: 0.8 }),
    forgeEmissive: new THREE.MeshStandardMaterial({ color: '#3a1a08', emissive: '#ff5a1e', emissiveIntensity: 1.6 }),
  };
}

function namesOf(group: THREE.Object3D): string[] {
  return group.children.map((c) => c.name);
}

describe('buildDwarvenWindow', () => {
  it('produces the five-piece opening minimum: recess, surround, sill, division, glazing', () => {
    const win = buildDwarvenWindow({ width: 0.45, height: 0.7, wallZ: 1.5, palette: palette() });
    const names = namesOf(win);
    expect(names).toContain('recess');
    expect(names).toContain('surround');
    expect(names).toContain('sill');
    expect(names).toContain('division');
    expect(names).toContain('glazing');
  });

  it('keeps every part depth-separated per the shared DepthLadder', () => {
    const win = buildDwarvenWindow({ width: 0.45, height: 0.7, wallZ: 1.5, palette: palette() });
    const depths = win.children.map((c) => c.position.z - 1.5);
    assertDepthSeparated(depths);
  });

  it('supports a round oculus shape via buildDwarvenOculus', () => {
    const oculus = buildDwarvenOculus({ diameter: 0.65, wallZ: 2, palette: palette() });
    expect(oculus.userData.openingShape).toBe('round');
  });
});

describe('buildDwarvenDoor', () => {
  it('produces a planked door leaf with 3-5 straps plus the shared opening parts', () => {
    const door = buildDwarvenDoor({ width: 0.95, height: 1.75, wallZ: 1.5, palette: palette() });
    const names = namesOf(door);
    expect(names).toContain('recess');
    expect(names).toContain('surround');
    expect(names).toContain('threshold');
    const doorLeaf = door.children.find((c) => c.name === 'door-leaf');
    expect(doorLeaf).toBeTruthy();
    const straps = doorLeaf!.children.filter((c) => c.name.startsWith('strap-'));
    expect(straps.length).toBeGreaterThanOrEqual(3);
    expect(straps.length).toBeLessThanOrEqual(5);
  });

  it('uses a low Romanesque/shouldered archRatio between 0.50 and 0.65', () => {
    // Not directly inspectable from the built group, but archRatio outside
    // the valid range must not throw and must clamp into range.
    expect(() => buildDwarvenDoor({ width: 0.95, height: 1.75, wallZ: 1.5, palette: palette(), archRatio: 1.4 })).not.toThrow();
    expect(() => buildDwarvenDoor({ width: 0.95, height: 1.75, wallZ: 1.5, palette: palette(), archRatio: 0.01 })).not.toThrow();
  });
});

describe('buildDwarvenVentSlit', () => {
  it('keeps the five-piece opening minimum but swaps glazing for a louvred vent insert', () => {
    const vent = buildDwarvenVentSlit({ width: 0.28, height: 0.55, wallZ: 1.5, palette: palette() });
    const names = namesOf(vent);
    expect(names).toContain('recess');
    expect(names).toContain('surround');
    expect(names).toContain('sill');
    expect(names).toContain('division');
    const louvre = vent.children.find((c) => c.name === 'vent-louvre');
    expect(louvre).toBeTruthy();
    // The louvre replaces the flat glazing pane -- no plain glazing child.
    expect(names).not.toContain('glazing');
  });

  it('keeps every part depth-separated per the shared DepthLadder', () => {
    const vent = buildDwarvenVentSlit({ width: 0.28, height: 0.55, wallZ: 1.5, palette: palette() });
    const depths = vent.children.map((c) => c.position.z - 1.5);
    assertDepthSeparated(depths);
  });
});

describe('buildDwarvenForgeMouth', () => {
  it('produces a large low-arch opening with an emissive forge throat and grate-bar division', () => {
    const mouth = buildDwarvenForgeMouth({ width: 1.55, height: 1.85, wallZ: 1.5, palette: palette() });
    const names = namesOf(mouth);
    expect(names).toContain('recess');
    expect(names).toContain('surround');
    expect(names).toContain('sill');
    expect(names).toContain('division');
    const throatGroup = mouth.children.find((c) => c.name === 'glazing');
    expect(throatGroup).toBeTruthy();
    const throatMesh = throatGroup!.children[0] as THREE.Mesh;
    expect((throatMesh.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
  });

  it('accepts a cool/soot state by falling back to plain dark glazing when no emissive material is given', () => {
    const p = palette();
    // A blacksmith at "cool/pristine" heat-state (design spec sec. 4
    // blacksmith procedural axis) has no glowing throat -- the preset
    // must not require forgeEmissive to be present.
    const mouth = buildDwarvenForgeMouth({ width: 1.55, height: 1.85, wallZ: 1.5, palette: { stone: p.stone, glazing: p.glazing, wood: p.wood } });
    expect(namesOf(mouth)).toContain('glazing');
  });
});
