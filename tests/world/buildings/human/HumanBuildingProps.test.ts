import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildFlowerBox,
  buildChoppingBlock,
  buildBench,
  buildHangingSign,
  buildToolRack,
  buildLaundryPole,
  buildDrainSpout,
  buildWagonWheel,
  buildAwning,
  buildBannerPole,
  buildGraveMarker,
  buildCellarHatch,
} from '@/world/buildings/human/HumanBuildingProps';

function mat(color = '#4a2818') {
  return new THREE.MeshStandardMaterial({ color });
}

// Every prop must be composed from multiple real named parts, never a
// single bare primitive standing in for the whole prop (doctrine Rule 3).
function expectComposed(group: THREE.Group, minParts = 2) {
  expect(group.children.length).toBeGreaterThanOrEqual(minParts);
  const names = new Set(group.children.map((c) => c.name));
  expect(names.size).toBe(group.children.length);
}

describe('HumanBuildingProps', () => {
  it('buildFlowerBox: planter shell + soil + several jittered plants', () => {
    const box = buildFlowerBox({ boxMaterial: mat(), seed: 3 });
    expectComposed(box, 6);
    const plants = box.children.filter((c) => c.name.startsWith('flowerbox-plant-'));
    expect(plants.length).toBeGreaterThanOrEqual(4);
    for (const plant of plants) {
      expect((plant as THREE.Group).children.length).toBe(3); // stem, leaf, bloom
    }
  });

  it('buildChoppingBlock: extruded stump + embedded axe head + handle', () => {
    const block = buildChoppingBlock({ woodMaterial: mat() });
    expectComposed(block, 3);
    expect(block.getObjectByName('stump')).toBeTruthy();
    expect(block.getObjectByName('axe-head')).toBeTruthy();
    expect(block.getObjectByName('axe-handle')).toBeTruthy();
  });

  it('buildBench: seat + 4 legs + back rail', () => {
    const bench = buildBench({ woodMaterial: mat() });
    expectComposed(bench, 6);
    const legs = bench.children.filter((c) => c.name.startsWith('bench-leg-'));
    expect(legs.length).toBe(4);
  });

  it('buildHangingSign: bracket + chain + board, with optional trade icon', () => {
    const plain = buildHangingSign({ bracketMaterial: mat(), boardMaterial: mat() });
    expectComposed(plain, 5);
    expect(plain.getObjectByName('sign-board')).toBeTruthy();

    const withIcon = buildHangingSign({ bracketMaterial: mat(), boardMaterial: mat(), icon: 'mug' });
    const iconGroup = withIcon.getObjectByName('sign-icon-mug') as THREE.Group;
    expect(iconGroup).toBeTruthy();
    expect(iconGroup.children.length).toBeGreaterThanOrEqual(2);
  });

  it('buildToolRack: two posts + rail + several tools', () => {
    const rack = buildToolRack({ woodMaterial: mat() });
    const posts = rack.children.filter((c) => c.name.startsWith('rack-post-'));
    expect(posts.length).toBe(2);
    expect(rack.getObjectByName('rack-rail')).toBeTruthy();
    const tools = rack.children.filter((c) => c.name.startsWith('rack-tool-'));
    expect(tools.length).toBeGreaterThanOrEqual(3);
  });

  it('buildLaundryPole: post + crossbar + line + draped cloths', () => {
    const pole = buildLaundryPole({ poleMaterial: mat() });
    expect(pole.getObjectByName('laundry-post')).toBeTruthy();
    expect(pole.getObjectByName('laundry-crossbar')).toBeTruthy();
    expect(pole.getObjectByName('laundry-line')).toBeTruthy();
    const cloths = pole.children.filter((c) => c.name.startsWith('laundry-cloth-'));
    expect(cloths.length).toBeGreaterThanOrEqual(2);
  });

  it('buildDrainSpout: gutter + bracket + angled spout lip', () => {
    const spout = buildDrainSpout({ material: mat() });
    expectComposed(spout, 3);
  });

  it('buildWagonWheel: rim + hub + real radial spokes (not a bare torus)', () => {
    const wheel = buildWagonWheel({ material: mat() });
    expect(wheel.getObjectByName('wheel-rim')).toBeTruthy();
    expect(wheel.getObjectByName('wheel-hub')).toBeTruthy();
    const spokes = wheel.children.filter((c) => c.name.startsWith('wheel-spoke-'));
    expect(spokes.length).toBeGreaterThanOrEqual(6);
  });

  it('buildAwning: sloped fabric + visible ribs + 2 support poles', () => {
    const awning = buildAwning({ fabricMaterial: mat() });
    expect(awning.getObjectByName('awning-fabric')).toBeTruthy();
    const ribs = awning.children.filter((c) => c.name.startsWith('awning-rib-'));
    expect(ribs.length).toBeGreaterThanOrEqual(3);
    const poles = awning.children.filter((c) => c.name.startsWith('awning-pole-'));
    expect(poles.length).toBe(2);
  });

  it('buildBannerPole: shaft + finial + banner cloth + batten', () => {
    const pole = buildBannerPole({ poleMaterial: mat(), bannerMaterial: mat('#a12020') });
    expectComposed(pole, 4);
  });

  it('buildGraveMarker: base plinth + rounded headstone slab', () => {
    const grave = buildGraveMarker({ material: mat('#8a8a86') });
    expectComposed(grave, 2);
    expect(grave.getObjectByName('grave-base')).toBeTruthy();
    expect(grave.getObjectByName('grave-slab')).toBeTruthy();
  });

  it('buildCellarHatch: curb frame + two angled doors', () => {
    const hatch = buildCellarHatch({ woodMaterial: mat() });
    expect(hatch.getObjectByName('hatch-curb')).toBeTruthy();
    expect(hatch.getObjectByName('hatch-door-left')).toBeTruthy();
    expect(hatch.getObjectByName('hatch-door-right')).toBeTruthy();
  });
});
