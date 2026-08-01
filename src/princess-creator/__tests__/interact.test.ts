// ── Direct-manipulation logic (pure parts; DOM wiring is exercised by e2e) ──

import { describe, it, expect } from 'vitest';
import { SPECIES_IDS, RANGES } from '../types';
import { defaultDna } from '../dna';
import { createMaterialKit } from '../materials';
import { composePrincess } from '../compose';
import {
  wheelTargetFor, tiltTargetFor, resolveDrop, removalFor, tagPickables,
  paintSlotFor, DRAGGABLE, PULLABLE, type PickId,
} from '../interact';

const ALL_PICKS: PickId[] = [
  'crown', 'ears', 'tail', 'back', 'handL', 'handR', 'hair',
  'head', 'face', 'dress', 'arm', 'leg', 'body',
];

describe('wheel mapping', () => {
  it('every pick id turns a real, ranged DNA dial', () => {
    for (const pick of ALL_PICKS) {
      const target = wheelTargetFor(pick);
      expect(target.path).toBeTruthy();
      expect(target.range.max).toBeGreaterThan(target.range.min);
    }
  });

  it('hands share one size dial; crown and eyes have tilt dials', () => {
    expect(wheelTargetFor('handL').path).toBe(wheelTargetFor('handR').path);
    expect(tiltTargetFor('crown')?.path).toBe('parts.crownTilt');
    expect(tiltTargetFor('face')?.path).toBe('face.eyeTilt');
    expect(tiltTargetFor('tail')).toBeNull();
    expect(wheelTargetFor('crown').range).toEqual(RANGES.parts.crownSize);
  });

  it('every pullable region has a dial; paint drop maps every pick to a slot', () => {
    for (const pick of PULLABLE) {
      expect(wheelTargetFor(pick).path).toBeTruthy();
    }
    for (const pick of ALL_PICKS) {
      expect(typeof paintSlotFor(pick)).toBe('string');
    }
    expect(paintSlotFor('dress')).toBe('primary');
    expect(paintSlotFor('hair')).toBe('hair');
    expect(paintSlotFor('crown')).toBe('metal');
    expect(paintSlotFor('head')).toBe('skin');
  });
});

describe('resolveDrop', () => {
  it('release far from any socket removes the part', () => {
    for (const pick of DRAGGABLE) {
      const action = resolveDrop(pick, null);
      expect(action.kind).toBe('remove');
      if (action.kind === 'remove') {
        expect(action.value).toBe('none');
        expect(action.path).toBe(removalFor(pick)!.path);
      }
    }
  });

  it('release at home cancels; hand-to-other-hand swaps', () => {
    expect(resolveDrop('crown', 'home').kind).toBe('cancel');
    expect(resolveDrop('handL', 'handL').kind).toBe('cancel');
    expect(resolveDrop('handL', 'handR').kind).toBe('swapHands');
    expect(resolveDrop('handR', 'handL').kind).toBe('swapHands');
  });

  it('regions are never removable', () => {
    expect(removalFor('head')).toBeNull();
    expect(removalFor('dress')).toBeNull();
  });
});

describe('tagPickables', () => {
  it.each(SPECIES_IDS)('%s: default princess exposes hoverable parts and regions', (a) => {
    const dna = defaultDna(a);
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const map = tagPickables(result);
    const picks = new Set(map.values());

    expect(map.size).toBeGreaterThan(3);
    expect(picks.has('body')).toBe(true);
    expect(picks.has('face')).toBe(true);
    if (a !== 'slime') {
      expect(picks.has('dress')).toBe(true);
      expect(picks.has('arm')).toBe(true);
    }
    if (a === 'foxling') {
      expect(picks.has('ears')).toBe(true);
      expect(picks.has('tail')).toBe(true);
    }
    if (a === 'human') expect(picks.has('hair')).toBe(true);
    // Species whose default look includes a crown expose it as a pickable
    // (draconic wears horns instead; gnome's hair IS the crown).
    if (dna.parts.crown !== 'none') expect(picks.has('crown')).toBe(true);

    result.dispose();
    kit.dispose();
  });

  it('nearest tag wins: crown meshes are crown, not head', () => {
    const dna = defaultDna('foxling');
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const map = tagPickables(result);
    let crownMeshes = 0;
    for (const [mesh, pick] of map) {
      if (pick !== 'crown') continue;
      crownMeshes++;
      // The mesh must live under the crown part group, which sits inside the
      // headTop socket — i.e. an ancestor tagged 'crown' exists below 'head'.
      let cur: typeof mesh.parent = mesh.parent;
      let found = false;
      while (cur) {
        if (cur.userData.pick === 'crown') { found = true; break; }
        if (cur.userData.pick === 'head') break;
        cur = cur.parent;
      }
      expect(found).toBe(true);
    }
    expect(crownMeshes).toBeGreaterThan(0);
    result.dispose();
    kit.dispose();
  });
});

describe('new size fields', () => {
  it('crownSize/backSize/handSize scale the built parts', () => {
    const dna = defaultDna('human');
    dna.parts.handL = 'wand';
    dna.parts.crownSize = 1.5;
    dna.parts.handSize = 1.4;
    const kit = createMaterialKit(dna);
    const result = composePrincess(dna, kit);
    const crown = result.sockets.headTop.children[0];
    expect(crown.scale.x).toBeCloseTo(1.5);
    const wand = result.sockets.handL.children[0];
    expect(wand.scale.x).toBeCloseTo(1.4);
    result.dispose();
    kit.dispose();
  });
});
