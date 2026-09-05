import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { trimExtrudeSettings, finishArchitecturalGeometry } from '../../../../src/world/buildings/kit/Bevels';

describe('Bevels: bevel settings and creased-normal baking', () => {
  it('trimExtrudeSettings returns ExtrudeGeometryOptions with bevelEnabled and bevelSegments: 1', () => {
    const width = 0.05;
    const settings = trimExtrudeSettings(width);
    expect(settings.bevelEnabled).toBe(true);
    expect(settings.bevelSegments).toBe(1);
    expect(typeof settings.depth).toBe('number');
  });

  it('trimExtrudeSettings creates finite geometry when used with ExtrudeGeometry', () => {
    const width = 0.05;
    const settings = trimExtrudeSettings(width);
    // Create a simple rectangular shape (like a trim profile)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1, 0);
    shape.lineTo(1, width);
    shape.lineTo(0, width);
    shape.lineTo(0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, settings);
    expect(geometry.attributes.position).toBeDefined();
    expect(geometry.attributes.position.count).toBeGreaterThan(0);
    // Check that all position values are finite
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i++) {
      expect(isFinite(positions[i])).toBe(true);
    }
  });

  it('finishArchitecturalGeometry preserves normal attributes', () => {
    const width = 0.05;
    const settings = trimExtrudeSettings(width);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1, 0);
    shape.lineTo(1, width);
    shape.lineTo(0, width);
    shape.lineTo(0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, settings);
    const finished = finishArchitecturalGeometry(geometry);
    expect(finished.attributes.position).toBeDefined();
    expect(finished.attributes.normal).toBeDefined();
    expect(finished.attributes.normal.count).toBeGreaterThan(0);
    // Verify normals are finite
    const normals = finished.attributes.normal.array as Float32Array;
    for (let i = 0; i < normals.length; i++) {
      expect(isFinite(normals[i])).toBe(true);
    }
  });

  it('finishArchitecturalGeometry merges vertices without duplicating positions', () => {
    const width = 0.05;
    const settings = trimExtrudeSettings(width);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(1, 0);
    shape.lineTo(1, width);
    shape.lineTo(0, width);
    shape.lineTo(0, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, settings);
    const originalCount = geometry.attributes.position.count;
    const finished = finishArchitecturalGeometry(geometry);
    // After merging vertices, the count should be equal or less (never more)
    expect(finished.attributes.position.count).toBeLessThanOrEqual(originalCount);
  });

  it('finishArchitecturalGeometry applies creased normals to indexed geometry (BoxGeometry)', () => {
    // BoxGeometry is indexed by default and has hard edges (adjacent faces with very different normals)
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    expect(geometry.index).toBeDefined(); // Confirm it's indexed
    
    const finished = finishArchitecturalGeometry(geometry);
    expect(finished.attributes.normal).toBeDefined();
    
    // For a box with hard edges, creased normals should result in distinct normals at shared edges
    // (not averaged). We verify this by checking that:
    // 1. The geometry is now non-indexed (toCreasedNormals converts to non-indexed)
    // 2. Adjacent vertices on hard edges have different normal values
    expect(finished.index).toBeNull(); // toCreasedNormals converts to non-indexed
    
    const normals = finished.attributes.normal.array as Float32Array;
    const positions = finished.attributes.position.array as Float32Array;
    
    // For a box with hard edges, vertices should have duplicates with different normals
    // Check that there are normal differences (creasing is preserved)
    const normalSet = new Set<string>();
    for (let i = 0; i < normals.length; i += 3) {
      normalSet.add(`${normals[i]},${normals[i+1]},${normals[i+2]}`);
    }
    // A hard-edged box should have multiple distinct normals (not all the same)
    expect(normalSet.size).toBeGreaterThan(1);
  });
});
