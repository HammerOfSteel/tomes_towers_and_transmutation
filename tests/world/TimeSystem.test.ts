// tests/world/TimeSystem.test.ts
//
//  Unit tests for TimeSystem.setHour() — the immediate, exact-value hour
//  setter used by TimeSkipUI's fast-forward animation. TimeSystem.instance
//  is a module-level singleton, so each test explicitly sets a known
//  starting hour rather than relying on constructor defaults.

import { describe, it, expect, beforeEach } from 'vitest';
import { TimeSystem } from '@/world/TimeSystem';

describe('TimeSystem.setHour', () => {
  beforeEach(() => {
    TimeSystem.instance.setHour(8); // deterministic baseline before each test
  });

  it('sets the hour to the given value', () => {
    TimeSystem.instance.setHour(14.5);
    expect(TimeSystem.instance.hour).toBe(14.5);
  });

  it('wraps a value >= 24 into [0, 24)', () => {
    TimeSystem.instance.setHour(25.5);
    expect(TimeSystem.instance.hour).toBe(1.5);
  });

  it('wraps a negative value into [0, 24)', () => {
    TimeSystem.instance.setHour(-2);
    expect(TimeSystem.instance.hour).toBe(22);
  });

  it('accepts exactly 0 without wrapping to 24', () => {
    TimeSystem.instance.setHour(0);
    expect(TimeSystem.instance.hour).toBe(0);
  });

  it('writes through to localStorage immediately', () => {
    TimeSystem.instance.setHour(19);
    expect(localStorage.getItem('ttt-time-hour')).toBe('19');
  });
});
