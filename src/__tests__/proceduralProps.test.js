/**
 * Tests for ProceduralProps — every exported builder should:
 *  - return a THREE.Group
 *  - contain at least one Mesh child
 *  - not throw with default params
 *  - not throw with boundary (min/max) params
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildCauldron, buildGoblet, buildArch, buildBookStack, buildLantern, buildBed, buildTable, buildChair, buildWardrobe, buildCampfire, buildTelescope, buildShelf, buildPillar, buildAltar, buildRug, buildBanner, buildFireplace, } from '@/rendering/ProceduralProps';
// ── Helpers ────────────────────────────────────────────────────────────────────
function solidMat(color = '#8b7355') {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
}
function emissiveMat() {
    return new THREE.MeshStandardMaterial({ emissive: new THREE.Color('#ff4400'), emissiveIntensity: 1.5 });
}
/** Count all Mesh descendants (including in nested groups). */
function countMeshes(grp) {
    let count = 0;
    grp.traverse(obj => { if (obj instanceof THREE.Mesh)
        count++; });
    return count;
}
/** Dispose a group's geometry and materials to free memory. */
function disposeGroup(grp) {
    grp.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material))
                obj.material.forEach(m => m.dispose());
            else
                obj.material.dispose();
        }
    });
}
// ── Shared assertion ───────────────────────────────────────────────────────────
function assertValidGroup(grp, minMeshes = 1) {
    expect(grp).toBeInstanceOf(THREE.Group);
    expect(countMeshes(grp)).toBeGreaterThanOrEqual(minMeshes);
}
// ── Single-material builders ───────────────────────────────────────────────────
describe('buildGoblet', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('returns a Group with meshes', () => {
        const g = buildGoblet(mat);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildBookStack', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('returns a Group with meshes', () => {
        const g = buildBookStack(mat);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildChair', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('returns a Group with at least 4 meshes (seat + back + 4 legs)', () => {
        const g = buildChair(mat);
        assertValidGroup(g, 4);
        disposeGroup(g);
    });
});
describe('buildWardrobe', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('returns a Group with meshes', () => {
        const g = buildWardrobe(mat);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildTelescope', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('returns a Group with meshes', () => {
        const g = buildTelescope(mat);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
// ── Two-material builders ──────────────────────────────────────────────────────
describe('buildCauldron', () => {
    it('returns a Group with a body and a glow mesh', () => {
        const g = buildCauldron(solidMat(), emissiveMat());
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
});
describe('buildLantern', () => {
    it('returns a Group with a cage and a glow mesh', () => {
        const g = buildLantern(solidMat(), emissiveMat());
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
});
describe('buildCampfire', () => {
    it('returns a Group with stones and flame meshes', () => {
        const g = buildCampfire(solidMat('#7a6a5a'), solidMat(), emissiveMat());
        assertValidGroup(g, 3);
        disposeGroup(g);
    });
});
describe('buildBed', () => {
    it('returns a Group with multiple meshes', () => {
        const g = buildBed(solidMat(), solidMat('#c8a870'));
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
});
// ── Parameterised builders ─────────────────────────────────────────────────────
describe('buildTable', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('works with default params', () => {
        const g = buildTable(mat, 1.4, 0.8, 0.78);
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
    it('works at minimum size', () => {
        const g = buildTable(mat, 0.8, 0.6, 0.6);
        assertValidGroup(g);
        disposeGroup(g);
    });
    it('works at maximum size', () => {
        const g = buildTable(mat, 2.8, 1.6, 1.0);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildArch', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('works with default params', () => {
        const g = buildArch(mat, 2.0, 3.5);
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
    it('works at minimum dimensions', () => {
        const g = buildArch(mat, 1.0, 2.0);
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildShelf', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('works with defaults', () => {
        const g = buildShelf(mat, 1.2, 0.28, { shelfCount: 2, bracketStyle: 1 });
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
    it('works with 4 shelves', () => {
        const g = buildShelf(mat, 2.0, 0.35, { shelfCount: 4, bracketStyle: 0 });
        assertValidGroup(g, 4);
        disposeGroup(g);
    });
});
describe('buildPillar', () => {
    let mat;
    beforeEach(() => { mat = solidMat(); });
    it('works with default params', () => {
        const g = buildPillar(mat, 3.0, 0.18, { style: 0, capitalH: 0.25, baseH: 0.15, entasis: 0.06 });
        assertValidGroup(g);
        disposeGroup(g);
    });
    it('works with Doric style (1)', () => {
        const g = buildPillar(mat, 2.5, 0.2, { style: 1 });
        assertValidGroup(g);
        disposeGroup(g);
    });
    it('works with Corinthian style (2)', () => {
        const g = buildPillar(mat, 4.0, 0.25, { style: 2 });
        assertValidGroup(g);
        disposeGroup(g);
    });
});
describe('buildAltar', () => {
    it('works with 1 tier', () => {
        const g = buildAltar(solidMat(), emissiveMat(), 1.2, 0.7, 1.0, { tiers: 1, topElement: 0 });
        assertValidGroup(g);
        disposeGroup(g);
    });
    it('works with 3 tiers and a crystal top', () => {
        const g = buildAltar(solidMat(), emissiveMat(), 1.4, 0.8, 1.2, { tiers: 3, topElement: 2 });
        assertValidGroup(g, 3);
        disposeGroup(g);
    });
});
describe('buildRug', () => {
    it('returns a Group with a mesh using canvas texture', () => {
        const g = buildRug('#8b5e3c', '#d4aa00', 2.0, 1.4, 2);
        assertValidGroup(g);
        disposeGroup(g);
    });
    it('works with all pattern variants 0-4', () => {
        for (let pattern = 0; pattern <= 4; pattern++) {
            const g = buildRug('#aa5533', '#ffcc00', 1.8, 1.2, pattern);
            assertValidGroup(g);
            disposeGroup(g);
        }
    });
});
describe('buildBanner', () => {
    it('returns a Group with a pole and cloth mesh', () => {
        const g = buildBanner(solidMat(), '#8b2222', '#d4aa00', 0.65, 1.4, 1);
        assertValidGroup(g, 2);
        disposeGroup(g);
    });
    it('works with all pattern variants 0-3', () => {
        for (let pattern = 0; pattern <= 3; pattern++) {
            const g = buildBanner(solidMat(), '#ff0000', '#ffff00', 0.65, 1.4, pattern);
            assertValidGroup(g);
            disposeGroup(g);
        }
    });
});
describe('buildFireplace', () => {
    it('returns a Group with walls, mantel, and fire meshes', () => {
        const g = buildFireplace(solidMat(), emissiveMat(), 1.8, 2.0, { archOpening: 1, mantelH: 0.18 });
        assertValidGroup(g, 3);
        disposeGroup(g);
    });
    it('works with no arch (archOpening=0)', () => {
        const g = buildFireplace(solidMat(), emissiveMat(), 1.6, 1.8, { archOpening: 0, mantelH: 0 });
        assertValidGroup(g);
        disposeGroup(g);
    });
});
