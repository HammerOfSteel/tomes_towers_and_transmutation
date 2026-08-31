/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene
 * (batch 1 — grassland biome only; see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md).
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid } from '@/world/WorldGrid';

// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild
const DENSITY_PER_UNIT2 = 35;            // meadow preset — blades per world-unit²

// ── Placement ─────────────────────────────────────────────────────────────

export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
}

/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to `grassland`-biome tiles that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 */
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(DENSITY_PER_UNIT2);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const placements: GrassPlacement[] = [];

  for (let gx = centerX - radius; gx < centerX + radius; gx += gridStep) {
    for (let gz = centerZ - radius; gz < centerZ + radius; gz += gridStep) {
      const x = gx + (rand() - 0.5) * gridStep;
      const z = gz + (rand() - 0.5) * gridStep;

      const col = Math.floor(x / wg.tileUnit + halfW);
      const row = Math.floor(z / wg.tileUnit + halfH);
      if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

      const cell = wg.get(col, row);
      if (cell.biome !== 'grassland') continue;
      if (!isScatterAllowed(cell, 'grass')) continue;

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
      });
    }
  }
  return placements;
}

// ── Instance-buffer packing ──────────────────────────────────────────────

export interface GrassInstanceBuffers {
  positionRotation: Float32Array;
  scaleAndVariation: Float32Array;
}

/** Pack placements into the Float32Arrays the shader's instanced attributes expect. */
export function packGrassInstanceBuffers(placements: GrassPlacement[]): GrassInstanceBuffers {
  const count = placements.length;
  const positionRotation = new Float32Array(count * 4);
  const scaleAndVariation = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = placements[i]!;
    positionRotation[i * 4]     = p.x;
    positionRotation[i * 4 + 1] = p.y;
    positionRotation[i * 4 + 2] = p.z;
    positionRotation[i * 4 + 3] = p.rotation;
    scaleAndVariation[i * 4]     = p.scaleX;
    scaleAndVariation[i * 4 + 1] = p.scaleY;
    scaleAndVariation[i * 4 + 2] = p.tilt;
    scaleAndVariation[i * 4 + 3] = p.colorVar;
  }
  return { positionRotation, scaleAndVariation };
}

// ── Blade geometry ────────────────────────────────────────────────────────

const BLADE_SEGMENTS  = 4;
const BLADE_WIDTH      = 0.06;
const BLADE_HEIGHT     = 0.9;
const BLADE_CURVATURE  = 0.28;
const FADE_START = GRASS_RADIUS - 10;
const FADE_END   = GRASS_RADIUS - 2;

/** Tapered, bezier-curved triangle-strip blade (see procedural-grass-threejs skill). */
export function createGrassBladeGeometry(
  segments = BLADE_SEGMENTS,
  width = BLADE_WIDTH,
  height = BLADE_HEIGHT,
  curvature = BLADE_CURVATURE,
): THREE.BufferGeometry {
  const vertCount = (segments + 1) * 2 + 1;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = 2 * (1 - t) * t * curvature;
    const y = t * height;
    const w = width * (1 - t * 0.8);

    const vi = i * 2;
    positions[vi * 3]     = x - w * 0.5;
    positions[vi * 3 + 1] = y;
    positions[vi * 3 + 2] = 0;
    uvs[vi * 2] = 0;
    uvs[vi * 2 + 1] = t;

    positions[(vi + 1) * 3]     = x + w * 0.5;
    positions[(vi + 1) * 3 + 1] = y;
    positions[(vi + 1) * 3 + 2] = 0;
    uvs[(vi + 1) * 2] = 1;
    uvs[(vi + 1) * 2 + 1] = t;
  }

  const tipIdx = (segments + 1) * 2;
  positions[tipIdx * 3]     = curvature * 0.5;
  positions[tipIdx * 3 + 1] = height;
  positions[tipIdx * 3 + 2] = 0;
  uvs[tipIdx * 2] = 0.5;
  uvs[tipIdx * 2 + 1] = 1.0;

  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const lastL = segments * 2, lastR = segments * 2 + 1;
  indices.push(lastL, lastR, tipIdx);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ── Shader material ───────────────────────────────────────────────────────

/**
 * Wind-animated grass blade material. Uses Three.js's automatically-injected
 * built-ins (`position`, `normal`, `uv`, `modelMatrix`, `projectionMatrix`,
 * `viewMatrix`, `cameraPosition`) directly without redeclaring them — the
 * same convention already used by this project's `WaterMaterial.ts`
 * (confirmed working there: redeclaring these causes a GLSL "redefinition"
 * compile error, since `THREE.ShaderMaterial` always prepends them).
 */
export function createGrassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor:    { value: new THREE.Color(0x3a7d2c) },
      uTipColor:     { value: new THREE.Color(0x8bbf40) },
      uDryColor:     { value: new THREE.Color(0xc4a84b) },
      uDryAmount:    { value: 0 },
      uSssStrength:  { value: 0.5 },
      uAoStrength:   { value: 0.6 },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor:     { value: new THREE.Color(0xfff4e5) },
      uAmbientColor: { value: new THREE.Color(0x4488aa) },
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: 0.4 },
      uWindGust:     { value: 0.8 },
      uWindGustFreq: { value: 0.3 },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPositionRotation; // xyz = world pos, w = Y rotation
      attribute vec4 aScaleVariation;   // x = scaleX, y = scaleY, z = tilt, w = colorVar

      uniform float uWindTime;
      uniform vec2  uWindDir;
      uniform float uWindBase;
      uniform float uWindGust;
      uniform float uWindGustFreq;
      uniform float uFadeStart;
      uniform float uFadeEnd;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      vec2 computeWind(vec3 worldPos, float heightFactor) {
        float globalPhase = dot(worldPos.xz, uWindDir) * 0.5 + uWindTime * 1.2;
        vec2 globalSway = uWindDir * sin(globalPhase) * uWindBase;

        float gustPhase = dot(worldPos.xz, uWindDir) * uWindGustFreq + uWindTime * 2.5;
        float gustEnvelope = smoothstep(0.3, 0.7, noise2D(worldPos.xz * 0.02 + uWindTime * 0.3));
        vec2 gustSway = uWindDir * sin(gustPhase) * uWindGust * gustEnvelope;

        float bladeHash = hash(worldPos.xz * 10.0);
        float turbPhase = uWindTime * 3.0 + bladeHash * 6.28;
        vec2 turbulence = vec2(sin(turbPhase), cos(turbPhase * 0.7)) * 0.1;

        float h2 = heightFactor * heightFactor;
        return (globalSway + gustSway + turbulence) * h2;
      }

      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;

        vec3 pos = position;
        pos.x *= aScaleVariation.x;
        pos.y *= aScaleVariation.y;

        float tilt = aScaleVariation.z;
        float cosT = cos(tilt);
        float sinT = sin(tilt);
        float tiltedY = pos.y * cosT - pos.z * sinT;
        float tiltedZ = pos.y * sinT + pos.z * cosT;
        pos.y = tiltedY;
        pos.z = tiltedZ;

        float rot = aPositionRotation.w;
        float cosR = cos(rot);
        float sinR = sin(rot);
        vec3 rotated;
        rotated.x = pos.x * cosR - pos.z * sinR;
        rotated.y = pos.y;
        rotated.z = pos.x * sinR + pos.z * cosR;

        vec3 worldPos = rotated + aPositionRotation.xyz;

        float heightFactor = uv.y;
        vec2 windOffsetXZ = computeWind(worldPos, heightFactor);
        worldPos.x += windOffsetXZ.x;
        worldPos.z += windOffsetXZ.y;

        vWorldPos = worldPos;
        vNormal = normalize(normal);
        vNormal.xz += windOffsetXZ * 0.3;
        vNormal = normalize(vNormal);

        float dist = distance(cameraPosition, worldPos);
        vFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3  uBaseColor;
      uniform vec3  uTipColor;
      uniform vec3  uDryColor;
      uniform float uDryAmount;
      uniform float uSssStrength;
      uniform float uAoStrength;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uAmbientColor;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;

      void main() {
        if (vFade < 0.01) discard;

        float heightT = vUv.y;
        vec3 color = mix(uBaseColor, uTipColor, heightT);
        color = mix(color, uDryColor, vColorVar * uDryAmount);
        color *= 1.0 + (vColorVar - 0.5) * 0.15;

        float ao = mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, 0.3, heightT));
        color *= ao;

        vec3 N = normalize(vNormal);
        vec3 L = normalize(uSunDir);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float diffuse = max(dot(N, L) * 0.5 + 0.5, 0.0);

        // Subsurface-scattering approximation: light passing through the
        // blade from behind (relative to the viewer) makes it glow.
        float sss = pow(max(dot(-V, L), 0.0), 3.0) * uSssStrength * heightT;

        vec3 lit = color * (uSunColor * diffuse + uAmbientColor * 0.5) + uSunColor * sss;

        gl_FragColor = vec4(lit, vFade);
      }
    `,
  });
}
