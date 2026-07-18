/**
 * RoundedBoxGeometry — Phase 7.5b
 *
 * A bevelled `BufferGeometry` box.  Eliminates the sharp digital-edge look
 * that makes procedural primitives read as computer graphics rather than toy
 * miniatures.
 *
 * Algorithm:
 *   Each of the 6 faces is subdivided into a grid.  Corner and edge vertices
 *   are pushed toward the nearest corner/edge of the box by `bevelRadius`,
 *   creating a smooth fillet.  The result is a single contiguous mesh with
 *   correct normals — no seams.
 *
 * Usage:
 *   import { RoundedBoxGeometry } from '@/rendering/RoundedBoxGeometry';
 *   const geo = new RoundedBoxGeometry(1, 1, 1, 0.12, 3);
 *
 *   // Or via GeometryCache for shared instances:
 *   const key = `rounded_box_1x1x1_r0.12` as const;
 *   const geo = GeometryCache.get(key, () => new RoundedBoxGeometry(1,1,1,0.12,3));
 *
 * @param width          Overall X extent (default 1).
 * @param height         Overall Y extent (default 1).
 * @param depth          Overall Z extent (default 1).
 * @param bevelRadius    Fillet radius in world units (default 0.1).
 *                       Clamped to half the shortest side so the box stays convex.
 * @param bevelSegments  Subdivisions on each bevel arc (default 2, range 1–5).
 *                       Higher values are smoother but costlier.
 */
import * as THREE from 'three';
export class RoundedBoxGeometry extends THREE.BufferGeometry {
    constructor(width = 1, height = 1, depth = 1, bevelRadius = 0.1, bevelSegments = 2) {
        super();
        // Clamp bevel so the box remains convex
        const maxR = Math.min(width, height, depth) * 0.5 - 1e-5;
        const r = Math.min(Math.max(bevelRadius, 0), maxR);
        const segs = Math.max(1, Math.round(bevelSegments));
        // Inner half-extents (bevel origin sits on these edges)
        const hx = width * 0.5 - r;
        const hy = height * 0.5 - r;
        const hz = depth * 0.5 - r;
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        // segs+1 steps per bevel arc quarter, same across all faces
        /** Push one vertex onto all arrays. */
        function addVertex(px, py, pz, nx, ny, nz, u, v) {
            positions.push(px, py, pz);
            normals.push(nx, ny, nz);
            uvs.push(u, v);
        }
        /** Add a quad between four vertex indices (two triangles). */
        function addQuad(a, b, c, d) {
            indices.push(a, b, d, b, c, d);
        }
        /**
         * Build one face of the rounded box.
         *
         * `u`, `v` are the two tangent axes; `n` is the outward normal axis.
         * `uHalf`, `vHalf` are the inner half-extents in u/v; `nOff` is the
         * face offset along the normal axis.
         */
        function buildFace(uAxis, vAxis, nAxis, uHalf, vHalf, nOff, uvFlip) {
            // The face grid has (segs+2) × (segs+2) vertices.
            // The inner region is flat; the border is the bevel arc.
            const rows = segs + 2; // total columns/rows per face
            const base = positions.length / 3;
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < rows; i++) {
                    // Normalised coords in [-1, +1] for this face
                    // Outer strip: 0 or rows-1 → bevel region
                    // Inner region: 1..rows-2 → flat quad
                    const edgeU = (i === 0 || i === rows - 1);
                    const edgeV = (j === 0 || j === rows - 1);
                    const cornerU = i === 0 ? -1 : 1;
                    const cornerV = j === 0 ? -1 : 1;
                    // Arc parameter on the bevel quarter-circle [0, π/2]
                    const arcU = i === 0 ? 0 : (i === rows - 1 ? Math.PI * 0.5 : ((i - 0.5) / (rows - 2)) * Math.PI * 0.5);
                    const arcV = j === 0 ? 0 : (j === rows - 1 ? Math.PI * 0.5 : ((j - 0.5) / (rows - 2)) * Math.PI * 0.5);
                    let pu, pv, pn;
                    let nu, nv, nn;
                    if (!edgeU && !edgeV) {
                        // Flat inner region
                        const fu = -uHalf + (uHalf * 2) * (i - 0.5) / (rows - 2);
                        const fv = -vHalf + (vHalf * 2) * (j - 0.5) / (rows - 2);
                        pu = fu;
                        pv = fv;
                        pn = nOff;
                        nu = 0;
                        nv = 0;
                        nn = nOff > 0 ? 1 : -1;
                    }
                    else {
                        // Bevel region — compute from nearest corner/edge
                        // Which corner does this vertex belong to?
                        const cu = edgeU ? cornerU * uHalf : (i < rows * 0.5 ? -uHalf : uHalf);
                        const cv = edgeV ? cornerV * vHalf : (j < rows * 0.5 ? -vHalf : vHalf);
                        const tuAngle = edgeU ? (cornerU < 0 ? Math.PI * 0.5 : 0) :
                            (i < rows * 0.5 ? Math.PI * 0.5 - arcU : arcU);
                        const tvAngle = edgeV ? (cornerV < 0 ? Math.PI * 0.5 : 0) :
                            (j < rows * 0.5 ? Math.PI * 0.5 - arcV : arcV);
                        // Direction from corner-origin along arc
                        // On each edge, only the bevel in that direction matters
                        const duN = edgeU ? (cornerU < 0 ? -Math.sin(tuAngle) : Math.sin(tuAngle)) : 0;
                        const dvN = edgeV ? (cornerV < 0 ? -Math.sin(tvAngle) : Math.sin(tvAngle)) : 0;
                        const dnVal = (!edgeU || !edgeV)
                            ? Math.cos(Math.min(tuAngle, tvAngle))
                            : Math.cos(tuAngle) * Math.cos(tvAngle); // double bevel at corners
                        nu = duN;
                        nv = dvN;
                        nn = dnVal * (nOff > 0 ? 1 : -1);
                        const len = Math.sqrt(nu * nu + nv * nv + nn * nn) || 1;
                        nu /= len;
                        nv /= len;
                        nn /= len;
                        pu = cu + nu * r;
                        pv = cv + nv * r;
                        pn = nOff + nn * r * (nOff > 0 ? 1 : -1);
                    }
                    const wu = uvFlip ? 1 - i / (rows - 1) : i / (rows - 1);
                    const wv = j / (rows - 1);
                    const px = uAxis.x * pu + vAxis.x * pv + nAxis.x * pn;
                    const py = uAxis.y * pu + vAxis.y * pv + nAxis.y * pn;
                    const pz = uAxis.z * pu + vAxis.z * pv + nAxis.z * pn;
                    const nx2 = uAxis.x * nu + vAxis.x * nv + nAxis.x * nn;
                    const ny2 = uAxis.y * nu + vAxis.y * nv + nAxis.y * nn;
                    const nz2 = uAxis.z * nu + vAxis.z * nv + nAxis.z * nn;
                    addVertex(px, py, pz, nx2, ny2, nz2, wu, wv);
                }
            }
            // Quads
            for (let j = 0; j < rows - 1; j++) {
                for (let i = 0; i < rows - 1; i++) {
                    const a = base + j * rows + i;
                    const b = base + j * rows + i + 1;
                    const c = base + (j + 1) * rows + i + 1;
                    const d = base + (j + 1) * rows + i;
                    addQuad(a, b, c, d);
                }
            }
        }
        const X = new THREE.Vector3(1, 0, 0);
        const Y = new THREE.Vector3(0, 1, 0);
        const Z = new THREE.Vector3(0, 0, 1);
        // +X face
        buildFace(Z, Y, X, hz, hy, hx + r, false);
        // -X face
        buildFace(Z, Y, X, hz, hy, -(hx + r), true);
        // +Y face
        buildFace(X, Z, Y, hx, hz, hy + r, false);
        // -Y face
        buildFace(X, Z, Y, hx, hz, -(hy + r), true);
        // +Z face
        buildFace(X, Y, Z, hx, hy, hz + r, false);
        // -Z face
        buildFace(X, Y, Z, hx, hy, -(hz + r), true);
        this.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        this.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        this.setIndex(indices);
        this.computeBoundingSphere();
    }
}
