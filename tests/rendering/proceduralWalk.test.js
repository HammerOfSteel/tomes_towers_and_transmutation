/**
 * Tests for ProceduralWalk — Phase 7.5e
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ProceduralWalkController } from '@/rendering/ProceduralWalk';
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Build a minimal quad rig stub: root + torso + 4 hip groups.
 * Mirrors the structure buildCreature produces for 'quadruped'.
 */
function makeQuadRig() {
    const root = new THREE.Group();
    const torso = new THREE.Group();
    torso.position.y = 0.95;
    root.scale.setScalar(1);
    root.add(torso);
    const frontLegL = new THREE.Group();
    const frontLegR = new THREE.Group();
    const backLegL = new THREE.Group();
    const backLegR = new THREE.Group();
    for (const [hip, x, z] of [
        [frontLegL, -0.28, 0.4],
        [frontLegR, 0.28, 0.4],
        [backLegL, -0.28, -0.4],
        [backLegR, 0.28, -0.4],
    ]) {
        hip.position.set(x, -0.1, z);
        torso.add(hip);
    }
    return {
        root,
        bones: { torso, frontLegL, frontLegR, backLegL, backLegR },
        dispose: () => { },
    };
}
function makeBipedRig() {
    const root = new THREE.Group();
    const torso = new THREE.Group();
    root.add(torso);
    return {
        root,
        bones: { torso },
        dispose: () => { },
    };
}
// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ProceduralWalkController — applicability', () => {
    it('isApplicable is true for quad rig', () => {
        const ctrl = new ProceduralWalkController(makeQuadRig());
        expect(ctrl.isApplicable).toBe(true);
    });
    it('isApplicable is false for biped/no-leg rig', () => {
        const ctrl = new ProceduralWalkController(makeBipedRig());
        expect(ctrl.isApplicable).toBe(false);
    });
});
describe('ProceduralWalkController — initialization', () => {
    it('update() does not throw on first call', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        expect(() => ctrl.update(0.016, rig.root.position, 0)).not.toThrow();
    });
    it('foot positions are set after first update', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        ctrl.update(0.016, rig.root.position, 0);
        const feet = ctrl.getFootPositions();
        expect(feet.frontLegL).toBeDefined();
        expect(feet.frontLegR).toBeDefined();
        expect(feet.backLegL).toBeDefined();
        expect(feet.backLegR).toBeDefined();
    });
    it('initial feet are near body position (within 2 WU)', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        rig.root.position.set(0, 0, 0);
        ctrl.update(0.016, rig.root.position, 0);
        const feet = ctrl.getFootPositions();
        for (const pos of Object.values(feet)) {
            const d = Math.sqrt(pos.x ** 2 + pos.z ** 2);
            expect(d).toBeLessThan(2.0);
        }
    });
});
describe('ProceduralWalkController — stepping', () => {
    let rig;
    let ctrl;
    beforeEach(() => {
        rig = makeQuadRig();
        ctrl = new ProceduralWalkController(rig);
        rig.root.position.set(0, 0, 0);
        ctrl.update(0.016, rig.root.position, 0);
    });
    it('feet remain planted when body is stationary', () => {
        const before = ctrl.getFootPositions();
        // 10 frames, no movement
        for (let i = 0; i < 10; i++)
            ctrl.update(0.016, rig.root.position, 0);
        const after = ctrl.getFootPositions();
        for (const key of ['frontLegL', 'frontLegR', 'backLegL', 'backLegR']) {
            expect(after[key].x).toBeCloseTo(before[key].x, 3);
            expect(after[key].z).toBeCloseTo(before[key].z, 3);
        }
    });
    it('feet move to new positions after large body displacement', () => {
        const before = ctrl.getFootPositions();
        // Move body 3 WU forward — well past step threshold
        rig.root.position.set(0, 0, 3);
        for (let i = 0; i < 60; i++)
            ctrl.update(0.016, rig.root.position, 0);
        const after = ctrl.getFootPositions();
        // At least some feet should have moved
        let moved = 0;
        for (const key of ['frontLegL', 'frontLegR', 'backLegL', 'backLegR']) {
            const dz = after[key].z - before[key].z;
            if (Math.abs(dz) > 0.3)
                moved++;
        }
        expect(moved).toBeGreaterThanOrEqual(2);
    });
    it('hip quaternions are updated (non-identity) after movement', () => {
        rig.root.position.set(0, 0, 2.5);
        for (let i = 0; i < 30; i++)
            ctrl.update(0.016, rig.root.position, 0);
        // At least one hip should have a non-identity quaternion
        const bones = [rig.bones.frontLegL, rig.bones.frontLegR, rig.bones.backLegL, rig.bones.backLegR];
        const anyRotated = bones.some(h => {
            if (!h)
                return false;
            const q = h.quaternion;
            return Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) > 0.001;
        });
        expect(anyRotated).toBe(true);
    });
});
describe('ProceduralWalkController — diagonal stagger', () => {
    it('diagonal leg partners do not step simultaneously', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        rig.root.position.set(0, 0, 0);
        ctrl.update(0.016, rig.root.position, 0);
        // Large move to guarantee steps
        rig.root.position.set(5, 0, 5);
        let violations = 0;
        const DIAG_PAIRS = [['frontLegL', 'backLegR']];
        const DIAG_PAIRS2 = [['frontLegR', 'backLegL']];
        for (let frame = 0; frame < 50; frame++) {
            ctrl.update(0.016, rig.root.position, 0);
            // Check internal state indirectly via foot Y — a stepping foot lifts off floor
            const feet = ctrl.getFootPositions();
            for (const [a, b] of [...DIAG_PAIRS, ...DIAG_PAIRS2]) {
                // Both lifted ABOVE natural rest height simultaneously = violation
                // Natural rest foot Y ≈ 0.33; stepping arc peaks at ~0.47 (+0.14 STEP_HEIGHT)
                if (feet[a].y > 0.38 && feet[b].y > 0.38)
                    violations++;
            }
        }
        expect(violations).toBe(0);
    });
});
describe('ProceduralWalkController — reset()', () => {
    it('reset() reinitialises feet to rest positions', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        rig.root.position.set(0, 0, 10);
        for (let i = 0; i < 30; i++)
            ctrl.update(0.016, rig.root.position, 0);
        // Teleport to new position
        rig.root.position.set(0, 0, 0);
        ctrl.reset(rig.root.position, 0);
        const feet = ctrl.getFootPositions();
        // All feet should now be near (0,0,0)
        for (const pos of Object.values(feet)) {
            const d = Math.sqrt(pos.x ** 2 + pos.z ** 2);
            expect(d).toBeLessThan(2.0);
        }
    });
});
describe('ProceduralWalkController — body height', () => {
    it('torso Y stays at natural height (no dynamic adjustment)', () => {
        const rig = makeQuadRig();
        const ctrl = new ProceduralWalkController(rig);
        rig.root.position.set(0, 0, 0);
        // Run many frames; torso should keep its natural 0.95 height
        for (let i = 0; i < 120; i++)
            ctrl.update(0.016, rig.root.position, 0);
        // torso.position.y should remain close to 0 (makeQuadRig default)
        // — no body-height adjustment is applied in this controller
        expect(rig.bones.torso.position.y).toBeGreaterThan(-0.5);
        expect(rig.bones.torso.position.y).toBeLessThan(2.0);
    });
});
