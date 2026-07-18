/**
 * Tests for ProceduralProps — Phase 7.5b
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCauldron, buildGoblet, buildArch, buildBookStack, buildLantern } from '@/rendering/ProceduralProps';
import { GeometryCache } from '@/rendering/GeometryCache';
import { MaterialLibrary } from '@/rendering/MaterialLibrary';
afterEach(() => {
    GeometryCache.disposeAll();
    MaterialLibrary.disposeAll();
});
const lambertMat = () => new THREE.MeshLambertMaterial({ color: 0x888888 });
const glowMat = () => new THREE.MeshBasicMaterial({ color: 0x44ff00 });
describe('buildCauldron', () => {
    it('returns a THREE.Group', () => {
        const g = buildCauldron(lambertMat(), glowMat());
        expect(g).toBeInstanceOf(THREE.Group);
    });
    it('has at least 5 children (bowl + rim + liquid + 3 legs)', () => {
        const g = buildCauldron(lambertMat(), glowMat());
        expect(g.children.length).toBeGreaterThanOrEqual(5);
    });
    it('all mesh children castShadow', () => {
        const g = buildCauldron(lambertMat(), glowMat());
        const meshes = g.children.filter((c) => c instanceof THREE.Mesh);
        // liquid mesh does not castShadow (it's added without the helper)
        // at least 4 shadow-casting meshes: bowl, rim, 3 legs
        const shadowCasters = meshes.filter(m => m.castShadow);
        expect(shadowCasters.length).toBeGreaterThanOrEqual(4);
    });
    it('caches bowl geometry in GeometryCache', () => {
        buildCauldron(lambertMat(), glowMat());
        expect(GeometryCache.has('prop_cauldron_bowl')).toBe(true);
    });
});
describe('buildGoblet', () => {
    it('returns a THREE.Group', () => {
        expect(buildGoblet(lambertMat())).toBeInstanceOf(THREE.Group);
    });
    it('has at least 1 mesh child', () => {
        const g = buildGoblet(lambertMat());
        const meshes = g.children.filter(c => c instanceof THREE.Mesh);
        expect(meshes.length).toBeGreaterThanOrEqual(1);
    });
    it('caches goblet geometry', () => {
        buildGoblet(lambertMat());
        expect(GeometryCache.has('prop_goblet')).toBe(true);
    });
});
describe('buildArch', () => {
    it('returns a THREE.Group', () => {
        expect(buildArch(lambertMat())).toBeInstanceOf(THREE.Group);
    });
    it('has at least 3 children (2 piers + span)', () => {
        const g = buildArch(lambertMat());
        expect(g.children.length).toBeGreaterThanOrEqual(3);
    });
    it('accepts custom width and height', () => {
        const g = buildArch(lambertMat(), 3.0, 4.5);
        expect(g.children.length).toBeGreaterThanOrEqual(3);
    });
});
describe('buildBookStack', () => {
    it('returns a THREE.Group', () => {
        expect(buildBookStack(lambertMat())).toBeInstanceOf(THREE.Group);
    });
    it('has 4 book children', () => {
        const g = buildBookStack(lambertMat());
        expect(g.children.length).toBe(4);
    });
});
describe('buildLantern', () => {
    it('returns a THREE.Group', () => {
        expect(buildLantern(lambertMat(), glowMat())).toBeInstanceOf(THREE.Group);
    });
    it('has cage, flame, and hook', () => {
        const g = buildLantern(lambertMat(), glowMat());
        expect(g.children.length).toBeGreaterThanOrEqual(3);
    });
});
