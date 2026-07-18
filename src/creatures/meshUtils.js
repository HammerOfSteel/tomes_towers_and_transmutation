/**
 * meshUtils — geometry post-processing utilities for creature visual quality.
 *
 * CC-10: flat shading + vertex wobble.
 * Call wobbleVertices once at build time (not per frame).
 */
import { mulberry32 } from '@/core/prng';
/**
 * Applies subtle pseudo-random vertex displacement to a BufferGeometry **in-place**.
 *
 * Uses the mulberry32 PRNG seeded from `seed` so the wobble is deterministic per DNA.
 * The displacement is modulated by a spatial sine function so nearby vertices move
 * coherently (avoiding a pure-random salt-and-pepper look).
 *
 * @param geo      Target geometry — must have a `position` BufferAttribute.
 * @param strength Displacement magnitude in world units. Typical ranges:
 *                 head sphere → 0.018, torso → 0.014, limbs → 0.010, neck → 0.008
 * @param seed     Deterministic seed (pass `dna.colors.primary ^ partIndex`).
 */
export function wobbleVertices(geo, strength, seed) {
    const posAttr = geo.getAttribute('position');
    if (!posAttr)
        return;
    const rand = mulberry32(seed >>> 0);
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        const pz = posAttr.getZ(i);
        // Coherent modulation — low-frequency envelope keeps neighbouring verts aligned
        const env = Math.sin(px * 11.0 + 1.1) * Math.cos(pz * 9.0 + 0.7)
            + Math.sin(py * 13.0 + 2.3) * 0.5;
        const r = (rand() * 2 - 1);
        const dx = r * env * strength * (rand() * 0.6 + 0.7);
        const dy = (rand() * 2 - 1) * env * strength * (rand() * 0.6 + 0.7);
        const dz = (rand() * 2 - 1) * env * strength * (rand() * 0.6 + 0.7);
        posAttr.setXYZ(i, px + dx, py + dy, pz + dz);
    }
    posAttr.needsUpdate = true;
    // Flat shading re-derives normals per triangle, so we only need to
    // recompute vertex normals when the geometry will also be smooth-shaded.
    // We leave recompute to the caller — wobble is always paired with flatShade.
}
/**
 * Enables flat shading on a `MeshPhysicalMaterial` and marks it for re-upload.
 * Returns the same material (mutates in place) for easy chaining.
 *
 * Flat shading calculates normals per triangle → clean, faceted low-poly look.
 */
export function flatShade(mat) {
    mat.flatShading = true;
    mat.needsUpdate = true;
    return mat;
}
