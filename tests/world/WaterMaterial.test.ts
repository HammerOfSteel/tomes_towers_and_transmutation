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

  it('uses a fragment shader alpha low enough for underwater visibility (<= 0.55)', () => {
    const mat = createWaterMaterial();
    // The fragment shader writes gl_FragColor's alpha as a literal float
    // (e.g. "gl_FragColor = vec4(color, 0.45);"). Extract that literal and
    // assert it's been tuned down from the old opaque-ish 0.78.
    const match = mat.fragmentShader.match(/gl_FragColor\s*=\s*vec4\([^,]+,\s*([\d.]+)\s*\)/);
    expect(match).not.toBeNull();
    const alpha = parseFloat(match![1]!);
    expect(alpha).toBeLessThanOrEqual(0.55);
    expect(alpha).toBeGreaterThan(0); // still visible as water, not fully invisible
  });
});
