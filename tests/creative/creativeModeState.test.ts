/**
 * Tests for CreativeModeState — all pure state with no DOM or Three.js deps.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCreativeState, isCreativeActive,
  setCreativeActive, setFlyEnabled, setNoClip, setGodMode,
  setFrozenEnemies, setCurrentZone, setCurrentSkin,
  setActiveTool, setActiveHotbarSlot, setHotbarSlot,
  cycleSpeedUp, cycleSpeedDown, getSpeedMultiplier,
  SPEED_MULTIPLIERS,
} from '@/creative/CreativeModeState';

// Reset state before each test by directly reading and asserting initial values
beforeEach(() => {
  // Reset via the write API
  setCreativeActive(false);
  setFlyEnabled(true);
  setNoClip(false);
  setGodMode(true);
  setFrozenEnemies(false);
  setCurrentZone('Tower');
  setCurrentSkin(null);
  setActiveTool('select');
  setActiveHotbarSlot(0);
  for (let i = 0; i < 8; i++) setHotbarSlot(i, null);
  // Reset speed to tier 1 (3×) by cycling: cycle up from 0 to get a known state
  // We can't directly set speedTier, so reset by cycling 4 times (full cycle)
  // Actually: just accept the speed may be at any tier and test relative changes
});

describe('CreativeModeState — basic flags', () => {
  it('starts inactive', () => {
    expect(isCreativeActive()).toBe(false);
  });

  it('setCreativeActive(true) makes it active', () => {
    setCreativeActive(true);
    expect(isCreativeActive()).toBe(true);
    expect(getCreativeState().active).toBe(true);
  });

  it('setGodMode toggles god mode', () => {
    setGodMode(false);
    expect(getCreativeState().godMode).toBe(false);
    setGodMode(true);
    expect(getCreativeState().godMode).toBe(true);
  });

  it('setNoClip toggles no-clip', () => {
    setNoClip(true);
    expect(getCreativeState().noClip).toBe(true);
    setNoClip(false);
    expect(getCreativeState().noClip).toBe(false);
  });

  it('setFlyEnabled toggles fly', () => {
    setFlyEnabled(false);
    expect(getCreativeState().flyEnabled).toBe(false);
  });

  it('setFrozenEnemies toggles', () => {
    setFrozenEnemies(true);
    expect(getCreativeState().frozenEnemies).toBe(true);
  });
});

describe('CreativeModeState — zone and skin', () => {
  it('setCurrentZone updates zone', () => {
    setCurrentZone('The Observatory');
    expect(getCreativeState().currentZone).toBe('The Observatory');
  });

  it('setCurrentSkin updates skin', () => {
    setCurrentSkin('wizards/elf');
    expect(getCreativeState().currentSkin).toBe('wizards/elf');
    setCurrentSkin(null);
    expect(getCreativeState().currentSkin).toBeNull();
  });
});

describe('CreativeModeState — tool selection', () => {
  it('setActiveTool switches tool', () => {
    setActiveTool('place');
    expect(getCreativeState().activeTool).toBe('place');
    setActiveTool('delete');
    expect(getCreativeState().activeTool).toBe('delete');
    setActiveTool('inspect');
    expect(getCreativeState().activeTool).toBe('inspect');
    setActiveTool('select');
    expect(getCreativeState().activeTool).toBe('select');
  });
});

describe('CreativeModeState — hotbar', () => {
  it('setActiveHotbarSlot clamps to 0–7', () => {
    setActiveHotbarSlot(5);
    expect(getCreativeState().activeHotbarSlot).toBe(5);
    setActiveHotbarSlot(-1);
    expect(getCreativeState().activeHotbarSlot).toBe(0);
    setActiveHotbarSlot(99);
    expect(getCreativeState().activeHotbarSlot).toBe(7);
  });

  it('hotbar has 8 slots', () => {
    expect(getCreativeState().hotbar).toHaveLength(8);
  });

  it('setHotbarSlot stores asset path', () => {
    setHotbarSlot(3, '/assets/castle/wall.glb');
    expect(getCreativeState().hotbar[3]).toBe('/assets/castle/wall.glb');
  });

  it('setHotbarSlot can clear a slot', () => {
    setHotbarSlot(3, '/assets/castle/wall.glb');
    setHotbarSlot(3, null);
    expect(getCreativeState().hotbar[3]).toBeNull();
  });

  it('setHotbarSlot ignores out-of-range slot', () => {
    const before = [...getCreativeState().hotbar];
    setHotbarSlot(99, '/bad/path.glb');
    expect(getCreativeState().hotbar).toEqual(before);
  });
});

describe('CreativeModeState — speed tiers', () => {
  it('SPEED_MULTIPLIERS has 4 tiers', () => {
    expect(SPEED_MULTIPLIERS).toHaveLength(4);
    expect(SPEED_MULTIPLIERS[0]).toBe(1);
    expect(SPEED_MULTIPLIERS[1]).toBe(3);
    expect(SPEED_MULTIPLIERS[2]).toBe(10);
    expect(SPEED_MULTIPLIERS[3]).toBe(50);
  });

  it('cycleSpeedUp advances through tiers', () => {
    // Force to tier 0 by cycling 4 times down then checking
    cycleSpeedDown(); cycleSpeedDown(); cycleSpeedDown(); cycleSpeedDown();
    const before = getSpeedMultiplier();
    cycleSpeedUp();
    const after = getSpeedMultiplier();
    // Should be the next tier's value
    const expectedIdx = SPEED_MULTIPLIERS.indexOf(before as typeof SPEED_MULTIPLIERS[number]);
    if (expectedIdx !== -1) {
      expect(after).toBe(SPEED_MULTIPLIERS[(expectedIdx + 1) % 4]);
    }
  });

  it('cycleSpeedDown wraps around', () => {
    // Cycle 4 times and come back to the same speed
    const start = getSpeedMultiplier();
    cycleSpeedDown();
    cycleSpeedDown();
    cycleSpeedDown();
    cycleSpeedDown();
    expect(getSpeedMultiplier()).toBe(start);
  });

  it('getSpeedMultiplier returns a SPEED_MULTIPLIERS value', () => {
    const v = getSpeedMultiplier();
    expect(SPEED_MULTIPLIERS).toContain(v);
  });

  it('cycling up 4 times returns to original speed', () => {
    const start = getSpeedMultiplier();
    cycleSpeedUp(); cycleSpeedUp(); cycleSpeedUp(); cycleSpeedUp();
    expect(getSpeedMultiplier()).toBe(start);
  });
});

describe('CreativeModeState — state is a singleton reference', () => {
  it('getCreativeState returns the same object reference each call', () => {
    const a = getCreativeState();
    const b = getCreativeState();
    expect(a).toBe(b);
  });
});
