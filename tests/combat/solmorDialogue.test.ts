import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mock localStorage ─────────────────────────────────────────────────────────
const _store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v; },
  removeItem: (k: string) => { delete _store[k]; },
  clear:      () => { for (const k in _store) delete _store[k]; },
  key:        (_i: number) => null,
  length:     0,
});

// ── Mock document / DOM ───────────────────────────────────────────────────────
vi.stubGlobal('document', {
  createElement:   () => ({ style: {}, appendChild: vi.fn(), querySelector: () => null }),
  body:            { appendChild: vi.fn(), removeChild: vi.fn() },
  getElementById:  () => null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });

import {
  getSolmorStage,
  advanceSolmorStage,
  resetSolmorStage,
  getSolmorEndingChoice,
} from '@/world/SolmorDialogueTree';

describe('SolmorDialogueTree — stage tracking', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSolmorStage();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('starts at stage 0', () => {
    expect(getSolmorStage()).toBe(0);
  });

  it('advanceSolmorStage increments to stage 1', () => {
    advanceSolmorStage();
    expect(getSolmorStage()).toBe(1);
  });

  it('advancing twice reaches stage 2', () => {
    advanceSolmorStage();
    advanceSolmorStage();
    expect(getSolmorStage()).toBe(2);
  });

  it('stages advance linearly (no internal cap)', () => {
    advanceSolmorStage();
    advanceSolmorStage();
    advanceSolmorStage();
    expect(getSolmorStage()).toBe(3);
  });

  it('resetSolmorStage returns to 0', () => {
    advanceSolmorStage();
    advanceSolmorStage();
    resetSolmorStage();
    expect(getSolmorStage()).toBe(0);
  });

  it('persists stage across calls via localStorage', () => {
    advanceSolmorStage();
    // Simulate re-read (same localStorage)
    expect(getSolmorStage()).toBe(1);
  });

  it('getSolmorEndingChoice returns null before stage 3', () => {
    advanceSolmorStage();
    expect(getSolmorEndingChoice()).toBeNull();
  });
});
