// tests/interactables/timeSkipUI.test.ts
//
//  Unit tests for TimeSkipUI's state machine and forward-only hour
//  animation. Constructed with no THREE.Scene argument (matching
//  tests/interactables/tamingGame.test.ts's precedent) so the
//  TimeVortexVfx branch — real, unmocked THREE.js — is never exercised;
//  these tests only cover DOM strip + TimeSystem interaction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { TimeSkipUI } from '@/interactables/TimeSkipUI';
import { TimeSystem } from '@/world/TimeSystem';

const ORIGIN = new THREE.Vector3(0, 0, 0);

/** Click the nth preset button inside the active time-skip strip. */
function clickPreset(index: number): void {
  const strips = document.querySelectorAll('#timeskip-strip');
  const strip = strips[strips.length - 1] as HTMLElement;
  const buttons = strip.querySelectorAll('button');
  (buttons[index] as HTMLButtonElement).click();
}

describe('TimeSkipUI', () => {
  let ui: TimeSkipUI;

  beforeEach(() => {
    TimeSystem.instance.setHour(8); // deterministic starting hour
    ui = new TimeSkipUI();
  });

  afterEach(() => {
    ui.dispose();
    document.querySelectorAll('#timeskip-strip').forEach(el => el.remove());
  });

  it('is not active before begin()', () => {
    expect(ui.active).toBe(false);
  });

  it('becomes active after begin() and shows the strip with 4 preset buttons', () => {
    ui.begin(ORIGIN);
    expect(ui.active).toBe(true);
    const strip = document.querySelector('#timeskip-strip') as HTMLElement;
    expect(strip).not.toBeNull();
    expect(strip.querySelectorAll('button').length).toBe(4);
  });

  it('begin() is a no-op if already active', () => {
    ui.begin(ORIGIN);
    ui.begin(ORIGIN);
    expect(document.querySelectorAll('#timeskip-strip').length).toBe(1);
  });

  it('close() deactivates and removes the strip', () => {
    ui.begin(ORIGIN);
    ui.close();
    expect(ui.active).toBe(false);
    expect(document.querySelector('#timeskip-strip')).toBeNull();
  });

  it('picking noon (hour 12) advances TimeSystem.instance.hour toward 12 over time', () => {
    ui.begin(ORIGIN);
    clickPreset(1); // index 1 = Noon in PRESETS order
    ui.update(1.25); // halfway through the 2.5s warp
    expect(TimeSystem.instance.hour).toBeGreaterThan(8);
    expect(TimeSystem.instance.hour).toBeLessThan(12);
    ui.update(1.25); // finishes the warp
    expect(TimeSystem.instance.hour).toBe(12);
    expect(ui.active).toBe(false); // auto-closes on completion
  });

  it('forward-wraps past midnight rather than moving backward (22:00 -> dawn 6:00)', () => {
    TimeSystem.instance.setHour(22);
    ui.begin(ORIGIN);
    clickPreset(0); // index 0 = Dawn (hour 6)
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      ui.update(0.25);
      samples.push(TimeSystem.instance.hour);
    }
    // Hour must never move backward until it wraps past 24 -> re-enters near 0
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      const movedForwardOrWrapped = cur >= prev || (prev > 20 && cur < 4);
      expect(movedForwardOrWrapped).toBe(true);
    }
    expect(TimeSystem.instance.hour).toBe(6);
  });

  it('picking a preset equal to the current hour completes without error', () => {
    TimeSystem.instance.setHour(12);
    ui.begin(ORIGIN);
    clickPreset(1); // Noon (hour 12), already at 12
    ui.update(2.5);
    expect(TimeSystem.instance.hour).toBe(12);
    expect(ui.active).toBe(false);
  });

  it('Escape cancels the picker without changing the hour', () => {
    ui.begin(ORIGIN);
    const before = TimeSystem.instance.hour;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(ui.active).toBe(false);
    expect(TimeSystem.instance.hour).toBe(before);
  });

  it('Escape during the warp animation does not cancel it', () => {
    ui.begin(ORIGIN);
    clickPreset(1); // Noon
    ui.update(0.5); // now mid-warp
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(ui.active).toBe(true); // still animating, Escape only cancels the picker phase
  });

  it('invokes onToast with the preset toast text once the warp completes', () => {
    let toastText: string | null = null;
    ui.onToast = (text) => { toastText = text; };
    ui.begin(ORIGIN);
    clickPreset(3); // index 3 = Midnight
    ui.update(2.5);
    expect(toastText).toBe('Time flows to midnight\u2026');
  });
});
