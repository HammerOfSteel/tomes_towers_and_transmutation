/**
 * OW-4 — Building Generator tests.
 *
 * Three.js geometry generation can throw if the input data is malformed
 * (negative radii, degenerate paths, NaN positions, etc.).  These smoke tests
 * verify that every building type:
 *   1. Returns a THREE.Group without throwing.
 *   2. Has at least one child mesh.
 *   3. Is deterministic — same seed → identical child count.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateBuilding } from '@/world/buildings/BuildingGenerator';
import { BUILDING_SPECS } from '@/world/buildings/BuildingTypes';
const ALL_TYPES = Object.keys(BUILDING_SPECS);
describe('generateBuilding', () => {
    it('returns a THREE.Group for every building type', () => {
        for (const type of ALL_TYPES) {
            const grp = generateBuilding(type, 0xDEAD_BEEF);
            expect(grp).toBeInstanceOf(THREE.Group);
        }
    });
    it('every building has at least 2 children', () => {
        for (const type of ALL_TYPES) {
            const grp = generateBuilding(type, 0x1234_5678);
            // Use a flat count so nested groups (e.g. _buildFlatParapet returns Group)
            // are still counted.
            let total = 0;
            grp.traverse(() => total++);
            // traverse includes the root group itself, so ≥ 3 means at least 2 children
            expect(total).toBeGreaterThanOrEqual(3);
        }
    });
    it('is deterministic — same seed gives same child count', () => {
        for (const type of ALL_TYPES) {
            const seed = 0xABCD_1234;
            const g1 = generateBuilding(type, seed);
            const g2 = generateBuilding(type, seed);
            let c1 = 0;
            g1.traverse(() => c1++);
            let c2 = 0;
            g2.traverse(() => c2++);
            expect(c1).toBe(c2);
        }
    });
    it('different seeds produce structurally valid groups', () => {
        // Just make sure randomised parameters do not produce NaN positions
        for (const type of ALL_TYPES) {
            for (const seed of [0, 1, 0xFFFF_FFFF, 0x5A3C_0012]) {
                const grp = generateBuilding(type, seed);
                grp.traverse((obj) => {
                    const mesh = obj;
                    if (mesh.isMesh) {
                        expect(Number.isFinite(mesh.position.x)).toBe(true);
                        expect(Number.isFinite(mesh.position.y)).toBe(true);
                        expect(Number.isFinite(mesh.position.z)).toBe(true);
                    }
                });
            }
        }
    });
});
