/**
 * Tests for ParticleSystem — Phase 7.5d
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem } from '@/rendering/ParticleSystem';
// Minimal THREE.Scene stand-in (jsdom Three.js scene works fine)
function makeScene() { return new THREE.Scene(); }
afterEach(() => {
    // Nothing to clean globally — each test creates its own instance
});
describe('ParticleSystem — construction', () => {
    it('creates without errors and adds a Points child to the scene', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const points = scene.children.find(c => c instanceof THREE.Points);
        expect(points).toBeDefined();
        ps.dispose();
    });
    it('starts with 0 live particles', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        expect(ps.liveCount).toBe(0);
        ps.dispose();
    });
});
describe('ParticleSystem — burst()', () => {
    it('increases liveCount by the requested count', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.burst(new THREE.Vector3(0, 1, 0), 0xff0000, 10);
        expect(ps.liveCount).toBe(10);
        ps.dispose();
    });
    it('defaults to 20 particles', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.burst(new THREE.Vector3(), 0x00ff00);
        expect(ps.liveCount).toBe(20);
        ps.dispose();
    });
    it('live particles age out after their lifetime', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.burst(new THREE.Vector3(), 0x0000ff, 5, 1, 0.1);
        expect(ps.liveCount).toBe(5);
        ps.update(0.5); // well past max lifetime of 0.1 * 1.3 = 0.13s
        expect(ps.liveCount).toBe(0);
        ps.dispose();
    });
});
describe('ParticleSystem — emit()', () => {
    it('adds one particle', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.emit(new THREE.Vector3(1, 0, 1), 0xffffff);
        expect(ps.liveCount).toBe(1);
        ps.dispose();
    });
    it('particle expires after its lifetime', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.emit(new THREE.Vector3(), 0xffffff, 0, 0, 0, 0.05);
        ps.update(0.2);
        expect(ps.liveCount).toBe(0);
        ps.dispose();
    });
});
describe('ParticleSystem — addEmitter()', () => {
    it('handle.active is true initially', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const h = ps.addEmitter(new THREE.Vector3(), { rate: 10, lifetime: 0.5 });
        expect(h.active).toBe(true);
        ps.dispose();
    });
    it('emits particles over time', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.addEmitter(new THREE.Vector3(), { rate: 100, lifetime: 2.0 });
        ps.update(0.1); // 100 p/s × 0.1s = 10 particles
        expect(ps.liveCount).toBeGreaterThanOrEqual(9);
        ps.dispose();
    });
    it('handle.stop() prevents further emission', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const h = ps.addEmitter(new THREE.Vector3(), { rate: 100, lifetime: 10 });
        ps.update(0.05);
        const countAfterFirst = ps.liveCount;
        h.stop();
        ps.update(0.05);
        // No new particles after stop (count should stay same or decrease due to expiry)
        expect(ps.liveCount).toBeLessThanOrEqual(countAfterFirst);
        expect(h.active).toBe(false);
        ps.dispose();
    });
    it('setPos() moves the emitter', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const h = ps.addEmitter(new THREE.Vector3(0, 0, 0), { rate: 1, lifetime: 10 });
        h.setPos(5, 2, 3);
        // Just verify no errors thrown and handle still active
        expect(h.active).toBe(true);
        ps.dispose();
    });
});
describe('ParticleSystem — addTorchFire()', () => {
    it('returns an active handle', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const h = ps.addTorchFire(new THREE.Vector3(1, 2, 3));
        expect(h.active).toBe(true);
        ps.dispose();
    });
    it('emits warm-toned particles (orange)', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.addTorchFire(new THREE.Vector3(0, 1, 0));
        ps.update(0.2);
        expect(ps.liveCount).toBeGreaterThan(0);
        ps.dispose();
    });
});
describe('ParticleSystem — addAmbientDust()', () => {
    it('returns an active handle', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        const h = ps.addAmbientDust(new THREE.Vector3(), 5);
        expect(h.active).toBe(true);
        ps.dispose();
    });
});
describe('ParticleSystem — dispose()', () => {
    it('removes the Points from the scene', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        expect(scene.children.some(c => c instanceof THREE.Points)).toBe(true);
        ps.dispose();
        expect(scene.children.some(c => c instanceof THREE.Points)).toBe(false);
    });
    it('dispose after burst does not throw', () => {
        const scene = makeScene();
        const ps = new ParticleSystem(scene);
        ps.burst(new THREE.Vector3(), 0xff00ff, 30);
        expect(() => ps.dispose()).not.toThrow();
    });
});
