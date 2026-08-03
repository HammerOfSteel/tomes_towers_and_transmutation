import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWaterMaterial } from '@/world/WaterMaterial';

describe('createWaterMaterial', () => {
  it('returns a ShaderMaterial with a uTime uniform initialized to 0', () => {
    const mat = createWaterMaterial();
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.uniforms.uTime).toBeDefined();
    expect(mat.uniforms.uTime.value).toBe(0);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('returns a distinct instance on each call (not a shared singleton)', () => {
    const a = createWaterMaterial();
    const b = createWaterMaterial();
    expect(a).not.toBe(b);
    a.uniforms.uTime.value = 5;
    expect(b.uniforms.uTime.value).toBe(0);
  });
});
