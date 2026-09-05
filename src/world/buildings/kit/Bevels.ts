import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Extrude settings for trim pieces with chamfered edges.
 * Returns THREE.ExtrudeGeometryOptions with bevel enabled.
 */
export function trimExtrudeSettings(width: number): THREE.ExtrudeGeometryOptions {
  return {
    depth: width * 2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: width * 0.25,
    bevelThickness: width * 0.25,
  };
}

/**
 * Finishes architectural geometry by merging vertices and baking creased normals.
 * This ensures beveled geometry shades correctly after being merged into a batch.
 */
export function finishArchitecturalGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Clone to avoid mutating the input
  const cloned = geometry.clone();
  
  // Merge duplicate vertices
  const merged = mergeVertices(cloned);
  
  // Bake creased normals for proper shading of beveled edges
  // Note: toCreasedNormals returns a new geometry (converts indexed to non-indexed)
  return toCreasedNormals(merged);
}
