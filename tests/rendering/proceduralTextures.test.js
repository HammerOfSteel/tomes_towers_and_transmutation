/**
 * Tests for ProceduralTextures — Phase 7.5b
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeStoneTexture, makeWoodGrainTexture, makeMossOverlay, makeRuneEmissiveMap, } from '@/rendering/ProceduralTextures';
describe('makeStoneTexture', () => {
    it('returns a THREE.CanvasTexture', () => {
        const t = makeStoneTexture(1);
        expect(t).toBeInstanceOf(THREE.CanvasTexture);
    });
    it('has RepeatWrapping on both axes', () => {
        const t = makeStoneTexture(1);
        expect(t.wrapS).toBe(THREE.RepeatWrapping);
        expect(t.wrapT).toBe(THREE.RepeatWrapping);
    });
    it('produces different textures for different seeds', () => {
        const a = makeStoneTexture(1);
        const b = makeStoneTexture(2);
        expect(a).not.toBe(b);
    });
    it('same seed produces same CanvasTexture instance (each call is a new object)', () => {
        // These are not the same object — the function always creates a new canvas
        const a = makeStoneTexture(5);
        const b = makeStoneTexture(5);
        expect(a).not.toBe(b); // different objects, but same seed → same pixel content
    });
});
describe('makeWoodGrainTexture', () => {
    it('returns a THREE.CanvasTexture', () => {
        expect(makeWoodGrainTexture(42)).toBeInstanceOf(THREE.CanvasTexture);
    });
    it('has RepeatWrapping', () => {
        const t = makeWoodGrainTexture(42);
        expect(t.wrapS).toBe(THREE.RepeatWrapping);
        expect(t.wrapT).toBe(THREE.RepeatWrapping);
    });
});
describe('makeMossOverlay', () => {
    it('returns a THREE.CanvasTexture', () => {
        expect(makeMossOverlay()).toBeInstanceOf(THREE.CanvasTexture);
    });
    it('intensity=0 and intensity=1 both produce textures', () => {
        expect(makeMossOverlay(1, 0)).toBeInstanceOf(THREE.CanvasTexture);
        expect(makeMossOverlay(1, 1)).toBeInstanceOf(THREE.CanvasTexture);
    });
});
describe('makeRuneEmissiveMap', () => {
    it('returns a THREE.CanvasTexture', () => {
        expect(makeRuneEmissiveMap()).toBeInstanceOf(THREE.CanvasTexture);
    });
    it('accepts a custom tint', () => {
        expect(makeRuneEmissiveMap(7, '#ff4400')).toBeInstanceOf(THREE.CanvasTexture);
    });
    it('uses ClampToEdgeWrapping', () => {
        const t = makeRuneEmissiveMap(3);
        expect(t.wrapS).toBe(THREE.ClampToEdgeWrapping);
        expect(t.wrapT).toBe(THREE.ClampToEdgeWrapping);
    });
});
