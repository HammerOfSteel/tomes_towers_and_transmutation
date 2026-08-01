import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { makeMottledCanvasTexture } from '@/world/NatureAssetBuilder';

// NOTE: this repo's jsdom test setup (src/__tests__/setup.ts) stubs
// HTMLCanvasElement's 2D context with no-op drawing methods (no real pixel
// buffer), so pixel-byte comparisons aren't meaningful here. Instead we spy
// on the arc() draw calls to verify the *sequence of draw operations* is
// deterministic per-seed. Real rendered output is checked via live
// Playwright visual verification during phase completion.
function captureArcCalls(seed: number): unknown[] {
  const calls: unknown[] = [];
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = origGetContext.apply(this, args as any) as any;
    const origArc = ctx.arc.bind(ctx);
    ctx.arc = (...arcArgs: unknown[]) => {
      calls.push(arcArgs);
      return origArc(...arcArgs);
    };
    return ctx;
  } as any;
  makeMottledCanvasTexture(0x2a6614, 0.15, seed);
  HTMLCanvasElement.prototype.getContext = origGetContext;
  return calls;
}

describe('makeMottledCanvasTexture', () => {
  it('returns a THREE.CanvasTexture with a 64x64 backing canvas', () => {
    const tex = makeMottledCanvasTexture(0x2a6614, 0.15, 42);
    expect(tex).toBeInstanceOf(THREE.CanvasTexture);
    const cv = tex.image as HTMLCanvasElement;
    expect(cv.width).toBe(64);
    expect(cv.height).toBe(64);
  });

  it('is deterministic: same seed draws the identical sequence of arc() calls', () => {
    const callsA = captureArcCalls(42);
    const callsB = captureArcCalls(42);
    expect(callsA.length).toBeGreaterThan(0);
    expect(callsA).toEqual(callsB);
  });

  it('produces a different draw sequence for a different seed', () => {
    const callsA = captureArcCalls(42);
    const callsB = captureArcCalls(99);
    expect(callsA).not.toEqual(callsB);
  });

  it('does not throw for a range of base colors and variances', () => {
    const colors = [0x2a6614, 0x8a8060, 0x9a9a9a];
    const variances = [0.05, 0.2, 0.4];
    for (const c of colors) {
      for (const v of variances) {
        expect(() => makeMottledCanvasTexture(c, v, 7)).not.toThrow();
      }
    }
    vi.restoreAllMocks();
  });
});
