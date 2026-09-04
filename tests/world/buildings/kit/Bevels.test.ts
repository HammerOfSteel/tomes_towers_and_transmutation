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
});
