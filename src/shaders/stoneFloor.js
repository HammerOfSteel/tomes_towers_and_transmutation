/** GLSL for the procedural stone floor.
 *  Inline template literals — no .glsl files needed (avoids Vite plugin dep). */
export const stoneFloorVert = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
export const stoneFloorFrag = /* glsl */ `
varying vec2 vUv;

// ── Value noise ──────────────────────────────────────────────────────────────

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep
  return mix(
    mix(hash(i),               hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // ── Stone surface texture ─────────────────────────────────────────────────
  vec2 uv = vUv;
  float n = noise(uv * 9.0)  * 0.50
          + noise(uv * 18.0) * 0.30
          + noise(uv * 36.0) * 0.20;

  // ── Tile grout lines ──────────────────────────────────────────────────────
  // 10 tiles across the surface; 4% of each tile width is grout
  vec2 tile = fract(uv * 10.0);
  float groutX = step(0.04, tile.x) * step(tile.x, 0.96);
  float groutZ = step(0.04, tile.y) * step(tile.y, 0.96);
  float isStone = groutX * groutZ;

  // ── Color blend ───────────────────────────────────────────────────────────
  vec3 darkStone  = vec3(0.165, 0.165, 0.227); // #2a2a3a
  vec3 midStone   = vec3(0.239, 0.239, 0.322); // #3d3d52
  vec3 groutColor = vec3(0.090, 0.090, 0.120); // darker than stone

  vec3 stoneColor = mix(darkStone, midStone, n);
  vec3 color      = mix(groutColor, stoneColor, isStone);

  gl_FragColor = vec4(color, 1.0);
}
`;
