/**
 * FactionBlockTextures.test.ts — Phase 2e.11 (settlement visual fidelity:
 * per-faction canvas textures for the shared BlockKit engine,
 * docs/superpowers/plans/2026-08-29-settlement-visual-fidelity.md).
 *
 * `BlockKit.ts`'s `blockGeometry()` now emits a world-space-projected `uv`
 * attribute (see BlockKit.test.ts's "UV generation" describe block) so
 * palette materials can carry a real `.map` texture instead of a flat
 * colour. These tests cover the 7 new faction-specific tileable canvas
 * textures that get wired into each faction's `FactionBlockProfiles`
 * palette (earth/root for vulperia, granite-mortar for dwarven, bark for
 * elven, hide/bone for orcish, ash-stone for undead, obsidian-vein for
 * vampire, toadstool-skin for fae — slime is deliberately exempt, its
 * translucent gel material has no block texture).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  earthTexture,
  graniteTexture,
  barkTexture,
  hideTexture,
  ashStoneTexture,
  obsidianTexture,
  toadstoolTexture,
  ashlarTexture,
} from '@/world/buildings/FactionBlockTextures';

const ALL_TEXTURES: Array<[string, (repX?: number, repY?: number) => THREE.CanvasTexture]> = [
  ['earthTexture', earthTexture],
  ['graniteTexture', graniteTexture],
  ['barkTexture', barkTexture],
  ['hideTexture', hideTexture],
  ['ashStoneTexture', ashStoneTexture],
  ['obsidianTexture', obsidianTexture],
  ['toadstoolTexture', toadstoolTexture],
  ['ashlarTexture', ashlarTexture],
];

describe('FactionBlockTextures — shared conventions', () => {
  for (const [name, fn] of ALL_TEXTURES) {
    it(`${name}() returns a THREE.CanvasTexture wrapped for tiling`, () => {
      const tex = fn();
      expect(tex).toBeInstanceOf(THREE.CanvasTexture);
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
      // `needsUpdate` is a write-only setter on THREE.Texture (it bumps an
      // internal version counter, no getter) — the only observable proxy
      // for "was it flagged" is that `.version` advanced past its initial 0.
      expect(tex.version).toBeGreaterThan(0);
    });

    it(`${name}() defaults to a 1:1 repeat (BlockKit UV is already world-space projected)`, () => {
      const tex = fn();
      expect(tex.repeat.x).toBeCloseTo(1, 5);
      expect(tex.repeat.y).toBeCloseTo(1, 5);
    });

    it(`${name}() honours explicit repX/repY overrides`, () => {
      const tex = fn(2.5, 3.5);
      expect(tex.repeat.x).toBeCloseTo(2.5, 5);
      expect(tex.repeat.y).toBeCloseTo(3.5, 5);
    });

    it(`${name}() builds its backing canvas only once (shared cache across calls)`, () => {
      const t1 = fn();
      const t2 = fn();
      expect(t1.image).toBe(t2.image);
    });

    it(`${name}()'s backing canvas has plausible tileable-swatch dimensions`, () => {
      // The test environment's jsdom canvas context is a non-functional
      // stub (getImageData always reads back zeros regardless of what was
      // drawn — verified directly against node-canvas/jsdom in this repo's
      // test setup), so actual rendered pixel content can't be asserted
      // here; that's also why the pre-existing human TextureFactory.ts has
      // no pixel-level tests. We instead assert the structural contract:
      // a real, reasonably-sized square canvas was produced and attached
      // as the texture's image source.
      const tex = fn();
      const canvas = tex.image as HTMLCanvasElement;
      expect(canvas.width).toBeGreaterThanOrEqual(64);
      expect(canvas.height).toBeGreaterThanOrEqual(64);
      expect(canvas.width).toBe(canvas.height);
    });
  }
});
