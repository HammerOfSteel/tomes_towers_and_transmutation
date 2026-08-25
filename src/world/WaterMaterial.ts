import * as THREE from 'three';

/**
 * Animated, stylized water shader (Link's Awakening-remake-inspired look):
 * gentle sine-wave vertex displacement (two overlapping directional waves)
 * plus a two-tone deep/shimmer color blend and a cheap fresnel-ish edge
 * highlight in the fragment shader. No texture lookups — fully procedural,
 * consistent with the project's zero-external-asset policy.
 *
 * Alpha is intentionally low (0.45 at grazing angles, down to 0.28 looking
 * straight down) so the player and basin floor read clearly through the
 * surface from any camera angle (OOT/SM64-style see-through water) — more
 * transparent from top-down/isometric views specifically, since that's the
 * hardest angle to read a submerged player from (the fresnel rim highlight
 * below is nearly invisible looking straight down, so alpha itself has to
 * compensate).
 *
 * Shared between OverworldScene and WaterLabScene so both use the exact
 * same visual material without duplicating shader source. Returns a new
 * instance every call — each owning scene is responsible for disposing
 * its own material.
 */
export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite:  false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      void main() {
        vec3 pos = position;
        float wave1 = sin(pos.x * 0.35 + uTime * 1.1) * 0.06;
        float wave2 = sin(pos.z * 0.5  - uTime * 0.7) * 0.045;
        pos.y += wave1 + wave2;
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vec3 deep    = vec3(0.100, 0.210, 0.340);
        vec3 shimmer = vec3(0.260, 0.430, 0.520);

        float shimmerPattern =
          sin(vWorldPosition.x * 0.6 + uTime * 1.6) *
          sin(vWorldPosition.z * 0.6 - uTime * 1.3);
        float t = smoothstep(-1.0, 1.0, shimmerPattern);
        vec3 color = mix(deep, shimmer, t * 0.5 + 0.15);

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0);
        color += vec3(0.35, 0.50, 0.60) * pow(rim, 3.0) * 0.20;

        // Angle-aware alpha: looking straight down through the surface (top-down/
        // isometric cameras) is the hardest case for reading a submerged player, so
        // make the water progressively MORE see-through the more top-down the view
        // is, while keeping the original 0.45 alpha at grazing/near-horizontal
        // angles where the surface itself needs to read as water.
        float steepness = clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0);
        float alpha = mix(0.45, 0.28, steepness);

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}
