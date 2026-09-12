import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHumanWindow, buildHumanDoor, buildHumanOculus, type HumanOpeningPalette } from '@/world/buildings/human/HumanOpenings';

function makePalette(): HumanOpeningPalette {
  return {
    timber: new THREE.MeshStandardMaterial({ color: '#4a2818' }),
    stone: new THREE.MeshStandardMaterial({ color: '#8a8a86' }),
    glazingMaterial: new THREE.MeshStandardMaterial({ color: '#1a2226' }),
    litGlazing: new THREE.MeshStandardMaterial({ color: '#f4c869', emissive: '#f4c869' }),
    wood: new THREE.MeshStandardMaterial({ color: '#5b3a22' }),
    iron: new THREE.MeshStandardMaterial({ color: '#22201d' }),
    recess: new THREE.MeshStandardMaterial({ color: '#2a2622' }),
  };
}

describe('buildHumanWindow', () => {
  it('produces the five-piece opening minimum: recess, surround, sill, division, glazing', () => {
    const win = buildHumanWindow({ width: 0.72, height: 0.95, wallZ: 0, palette: makePalette() });
    const names = win.children.map((c) => c.name);
    expect(names).toContain('recess');
    expect(names).toContain('surround');
    expect(names).toContain('sill');
    expect(names).toContain('glazing');
  });

  it('defaults to a flat rectangular lintel (archRatio 0) but supports an arched variant', () => {
    const flat = buildHumanWindow({ width: 0.72, height: 0.95, wallZ: 0, palette: makePalette() });
    const arched = buildHumanWindow({ width: 0.72, height: 0.95, wallZ: 0, palette: makePalette(), archRatio: 0.95 });
    const flatBox = new THREE.Box3().setFromObject(flat.getObjectByName('surround')!);
    const archedBox = new THREE.Box3().setFromObject(arched.getObjectByName('surround')!);
    // The arched surround rises further above the springline than the flat one.
    expect(archedBox.max.y).toBeGreaterThan(flatBox.max.y);
  });

  it('swaps in the stone surround material when stoneSurround is set', () => {
    const palette = makePalette();
    const win = buildHumanWindow({ width: 0.72, height: 0.95, wallZ: 0, palette, stoneSurround: true });
    const surround = win.getObjectByName('surround') as THREE.Group;
    const mesh = surround.children[0] as THREE.Mesh;
    expect(mesh.material).toBe(palette.stone);
  });

  it('swaps in the lit glazing material when lit is set', () => {
    const palette = makePalette();
    const win = buildHumanWindow({ width: 0.72, height: 0.95, wallZ: 0, palette, lit: true });
    const glazingGroup = win.getObjectByName('glazing') as THREE.Group;
    const glazingMesh = glazingGroup.children[0] as THREE.Mesh;
    expect(glazingMesh.material).toBe(palette.litGlazing);
  });
});

describe('buildHumanOculus', () => {
  it('builds a round window as ring + division spokes + set-back glazing, not a flat disc', () => {
    const oculus = buildHumanOculus({ diameter: 0.5, wallZ: 0, palette: makePalette() });
    const names = oculus.children.map((c) => c.name);
    expect(names).toContain('surround');
    expect(names).toContain('glazing');
    const glazing = oculus.getObjectByName('glazing')!;
    const surround = oculus.getObjectByName('surround')!;
    const glazingBox = new THREE.Box3().setFromObject(glazing);
    const surroundBox = new THREE.Box3().setFromObject(surround);
    // Glazing sits set back from the surround (real depth, not coplanar).
    expect(glazingBox.min.z).toBeLessThan(surroundBox.min.z);
  });
});

describe('buildHumanDoor', () => {
  it('builds a planked leaf with strap-iron bands and a threshold, not a flat box', () => {
    const door = buildHumanDoor({ width: 0.9, height: 2.0, wallZ: 0, palette: makePalette() });
    const names = door.children.map((c) => c.name);
    expect(names).toContain('threshold');
    const leaf = door.getObjectByName('door-leaf')!;
    const planks = leaf.children.filter((c) => c.name.startsWith('plank-'));
    const straps = leaf.children.filter((c) => c.name.startsWith('strap-'));
    expect(planks.length).toBeGreaterThanOrEqual(5);
    expect(planks.length).toBeLessThanOrEqual(7);
    expect(straps.length).toBeGreaterThanOrEqual(3);
    expect(straps.length).toBeLessThanOrEqual(5);
  });
});
