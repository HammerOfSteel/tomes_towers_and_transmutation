/**
 * Phase 7.5c — LightingSystem tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { LightingSystem } from '@/rendering/LightingSystem';
import type { Blueprint } from '@/levels/blueprint';

// ── Minimal Blueprint stub ────────────────────────────────────────────────────

function makeBlueprint(
  id = 'test_room',
  width = 10,
  depth = 10,
  wallHeight = 4,
): Blueprint {
  return {
    id, version: 1 as const,
    width, depth,
    cellSize: 2,
    wallHeight,
    tiles: [], doors: [], staircases: [], spawns: [], interactables: [],
    floor: 1,
    floorType: 'stone',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LightingSystem', () => {
  let scene: THREE.Scene;
  let ls: LightingSystem;

  beforeEach(() => {
    scene = new THREE.Scene();
    ls = new LightingSystem(scene);
  });

  afterEach(() => {
    ls.dispose();
  });

  // ── Torch placement ────────────────────────────────────────────────────────

  it('addTorchesForBlueprint adds PointLights to the scene', () => {
    const bp = makeBlueprint();
    ls.addTorchesForBlueprint(bp);

    const lights = scene.children.filter(c => c instanceof THREE.PointLight);
    expect(lights.length).toBeGreaterThanOrEqual(4); // at least 4 corner torches
  });

  it('clearTorches removes all torch lights', () => {
    ls.addTorchesForBlueprint(makeBlueprint());
    ls.clearTorches();

    const lights = scene.children.filter(c => c instanceof THREE.PointLight);
    // Only the ambient light remains (not a PointLight) → 0 PointLights
    expect(lights.length).toBe(0);
  });

  it('wider rooms get more torches than narrow rooms', () => {
    const narrow = makeBlueprint('narrow', 5, 5);
    const wide   = makeBlueprint('wide', 12, 12);

    ls.addTorchesForBlueprint(narrow);
    const narrowCount = scene.children.filter(c => c instanceof THREE.PointLight).length;

    ls.clearTorches();
    ls.addTorchesForBlueprint(wide);
    const wideCount = scene.children.filter(c => c instanceof THREE.PointLight).length;

    expect(wideCount).toBeGreaterThan(narrowCount);
  });

  it('same blueprint id always produces the same number of torches (determinism)', () => {
    const bp = makeBlueprint('room_42', 8, 8);
    ls.addTorchesForBlueprint(bp);
    const count1 = scene.children.filter(c => c instanceof THREE.PointLight).length;
    ls.clearTorches();

    ls.addTorchesForBlueprint(bp);
    const count2 = scene.children.filter(c => c instanceof THREE.PointLight).length;

    expect(count1).toBe(count2);
  });

  // ── Spell pulse ────────────────────────────────────────────────────────────

  it('addSpellPulse adds a PointLight to the scene', () => {
    const before = scene.children.filter(c => c instanceof THREE.PointLight).length;
    ls.addSpellPulse(new THREE.Vector3(0, 1, 0), 0x44aaff);
    const after = scene.children.filter(c => c instanceof THREE.PointLight).length;
    expect(after).toBe(before + 1);
  });

  it('spell pulse intensity decays to zero and light is removed', () => {
    ls.addSpellPulse(new THREE.Vector3(0, 1, 0), 0xff6600);

    // Simulate 0.5s — longer than PULSE_DURATION (0.4s)
    ls.update(0.25);
    ls.update(0.26);

    const pulseCount = scene.children.filter(c => c instanceof THREE.PointLight).length;
    expect(pulseCount).toBe(0);
  });

  it('pulse light has the correct color', () => {
    const color = 0x7733cc;
    ls.addSpellPulse(new THREE.Vector3(0, 1, 0), color);

    const pulse = scene.children.find(
      c => c instanceof THREE.PointLight && (c as THREE.PointLight).color.getHex() === color,
    );
    expect(pulse).toBeDefined();
  });

  // ── Preset ────────────────────────────────────────────────────────────────

  it('applyPreset updates scene fog', () => {
    ls.applyPreset('observatory');
    expect(scene.fog).not.toBeNull();
    const fog = scene.fog as THREE.Fog;
    // Observatory preset: fogNear=30, fogFar=100
    expect(fog.far).toBe(100);
  });

  it('applyPreset greenhouse has different fog than dungeon', () => {
    ls.applyPreset('dungeon');
    const dungeonFar = (scene.fog as THREE.Fog).far;

    ls.applyPreset('greenhouse');
    const greenFar = (scene.fog as THREE.Fog).far;

    expect(dungeonFar).not.toBe(greenFar);
  });

  // ── Update loop ───────────────────────────────────────────────────────────

  it('update modulates torch intensity within [0.1, 2.0]', () => {
    ls.addTorchesForBlueprint(makeBlueprint());
    // Tick several times to get flicker variation
    ls.update(0.05);
    ls.update(0.1);
    ls.update(0.2);

    const torches = scene.children.filter(
      c => c instanceof THREE.PointLight,
    ) as THREE.PointLight[];

    for (const t of torches) {
      expect(t.intensity).toBeGreaterThanOrEqual(0.1);
      expect(t.intensity).toBeLessThanOrEqual(2.0);
    }
  });

  // ── Dispose ───────────────────────────────────────────────────────────────

  it('dispose removes all managed lights from the scene', () => {
    ls.addTorchesForBlueprint(makeBlueprint());
    ls.addSpellPulse(new THREE.Vector3(0, 1, 0), 0xffffff);

    ls.dispose();

    const lights = scene.children.filter(c => c instanceof THREE.Light);
    expect(lights.length).toBe(0);
  });
});
