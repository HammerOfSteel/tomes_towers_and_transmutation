/**
 * GrassField.ts — procedural 3D grass blades for the live OverworldScene.
 * Batch 1 shipped `grassland` only (see
 * docs/superpowers/specs/2026-08-31-procedural-grass-grassland-design.md); batch 2 generalized
 * every function here to take a `GrassPreset`, extending coverage to `savanna`/`forest`/
 * `taiga`/`tundra` too (see
 * docs/superpowers/specs/2026-08-31-procedural-grass-batch2-design.md). `OverworldScene` owns
 * one `GrassField` instance per `GRASS_PRESETS` entry.
 *
 * Renders wind-animated instanced grass blades within a small player-
 * centered radius (NOT tied to the ChunkManager's much larger terrain-
 * streaming radius — see the batch 1 design spec's "Placement Radius" section for
 * why: grass density is 1-2 orders of magnitude higher per unit area than
 * tree/rock scatter, so applying it across the full streamed terrain area
 * would blow the desktop instanced-mesh budget).
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { LEVEL_HEIGHT } from '@/world/WaterDepthConfig';
import { isScatterAllowed } from '@/world/ScatterRules';
import { MAX_TRAMPLE_STAMPS, TRAMPLE_STAMP_RADIUS, TRAMPLE_DECAY_HALF_LIFE_S, FALLBACK_STAMP_POSITIONS, FALLBACK_STAMP_AGES, type TrampleMap } from '@/world/GrassTrample';
import type { WorldGrid } from '@/world/WorldGrid';

// ── Tunables (see design spec §4/§6) ────────────────────────────────────────
export const GRASS_RADIUS = 24;          // world units, player-centered
export const REBUILD_HYSTERESIS = 8;     // world units of player movement before rebuild

// ── Per-biome presets (batch 2 — see design spec §3) ────────────────────────

/** The 5 biomes this system places grass on. Other `BiomeId` values never get grass. */
export type GrassBiome = 'grassland' | 'savanna' | 'tundra' | 'forest' | 'taiga';

export interface GrassPreset {
  biome: GrassBiome;
  segments: number; width: number; height: number; curvature: number;
  baseColor: number; tipColor: number; dryColor: number; dryAmount: number;
  densityPerUnit2: number;
  /** windBase/windGust are fractions of this preset's own `height` (not absolute world
   *  units) — the shader multiplies the final wind offset by `height` itself (see
   *  `uBladeHeight` in `createGrassMaterial()`), so a blade's sway always scales with its
   *  own size instead of being a fixed WU displacement that could dwarf a short blade. */
  windBase: number; windGust: number; windGustFreq: number;
  maxBlades: number; // see design spec §3's "maxBlades sizing" formula
}

export const GRASS_PRESETS: Record<GrassBiome, GrassPreset> = {
  grassland: {
    biome: 'grassland', segments: 4, width: 0.06, height: 0.45, curvature: 0.14,
    baseColor: 0x3a7d2c, tipColor: 0x8bbf40, dryColor: 0xc4a84b, dryAmount: 0,
    densityPerUnit2: 35, windBase: 0.12, windGust: 0.22, windGustFreq: 0.3, maxBlades: 100_000,
  },
  savanna: {
    biome: 'savanna', segments: 4, width: 0.05, height: 0.4, curvature: 0.1,
    baseColor: 0x9b8b4a, tipColor: 0xd4c078, dryColor: 0xc4a84b, dryAmount: 0.6,
    densityPerUnit2: 15, windBase: 0.14, windGust: 0.24, windGustFreq: 0.3, maxBlades: 44_000,
  },
  tundra: {
    biome: 'tundra', segments: 2, width: 0.04, height: 0.1, curvature: 0.025,
    baseColor: 0x6b7d4a, tipColor: 0x8b9d5a, dryColor: 0xc4a84b, dryAmount: 0.3,
    densityPerUnit2: 25, windBase: 0.2, windGust: 0.3, windGustFreq: 0.3, maxBlades: 72_000,
  },
  forest: {
    biome: 'forest', segments: 4, width: 0.05, height: 0.3, curvature: 0.11,
    baseColor: 0x2e4a22, tipColor: 0x5a7d3a, dryColor: 0xc4a84b, dryAmount: 0.1,
    densityPerUnit2: 12, windBase: 0.08, windGust: 0.15, windGustFreq: 0.25, maxBlades: 35_000,
  },
  taiga: {
    biome: 'taiga', segments: 3, width: 0.04, height: 0.175, curvature: 0.075,
    baseColor: 0x2f3d2c, tipColor: 0x4a5d42, dryColor: 0xc4a84b, dryAmount: 0.15,
    densityPerUnit2: 8, windBase: 0.1, windGust: 0.18, windGustFreq: 0.25, maxBlades: 24_000,
  },
};

// ── Placement ─────────────────────────────────────────────────────────────

export interface GrassPlacement {
  x: number; y: number; z: number;
  rotation: number; scaleX: number; scaleY: number; tilt: number; colorVar: number;
  /** 0 (deep in this biome's interior) to 1 (right at a boundary with another biome)
   *  — see computeEdgeBlend(). Drives both this function's own density-fade thinning
   *  below AND the shader's dry-tint color blend (GrassField class, further down). */
  edgeBlend: number;
}

/**
 * Scatter grass blade placements within a `radius`-WU square window centered
 * on `(centerX, centerZ)`, restricted to tiles matching `biome` that pass
 * `isScatterAllowed(cell, 'grass')`. Deterministic for a fixed `seed`.
 *
 * Map-edge guard: `WorldGrid.get()` returns a default cell (which reports
 * `biome: 'grassland'`!) for out-of-bounds col/row — so this function checks
 * bounds itself before calling `.get()`, rather than trusting that fallback.
 * This guard matters for every `biome` value, not just `'grassland'` — an
 * out-of-bounds candidate must never be treated as a match for ANY biome.
 */
export function selectGrassPlacements(
  wg: WorldGrid,
  centerX: number,
  centerZ: number,
  radius: number,
  seed: number,
  biome: GrassBiome,
  densityPerUnit2: number,
): GrassPlacement[] {
  const rand = mulberry32(seed);
  const gridStep = 1 / Math.sqrt(densityPerUnit2);
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
      if (cell.biome !== biome) continue;
      if (!isScatterAllowed(cell, 'grass')) continue;

      const edgeBlend = computeEdgeBlend(wg, x, z, biome, EDGE_BAND_WU);
      // Density fade: thin placements near a boundary instead of a hard second cutoff
      // line — never fully to 0 (a thin residual chance keeps a few sparse blades
      // right at the seam) — see design spec §2, point 1.
      if (edgeBlend > 0 && rand() > 1 - edgeBlend * 0.85) continue;

      placements.push({
        x, y: cell.elevation * LEVEL_HEIGHT, z,
        rotation: rand() * Math.PI * 2,
        scaleX: 0.7 + rand() * 0.6,
        scaleY: 0.6 + rand() * 0.8,
        tilt: (rand() - 0.5) * 0.3,
        colorVar: rand(),
        edgeBlend,
      });
    }
  }
  return placements;
}

/** World-unit radius `computeEdgeBlend()` samples at, to decide whether a grass
 *  placement candidate sits near a biome boundary. ~1 tile — a modest transition
 *  band, so only the outermost ring of a biome's footprint is affected. See design
 *  spec docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md §2. */
export const EDGE_BAND_WU = 2.5;

const EDGE_SAMPLE_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Samples 8 neighbor points around (x, z) at `bandWidthWU` distance (N/S/E/W and the
 * 4 diagonals) and returns the fraction (0..1) that resolve to a DIFFERENT biome than
 * `biome` — 0 deep inside a uniform biome, up to 1 if completely surrounded by
 * something else (e.g. a thin sliver or a corner). Out-of-grid-bounds samples are
 * skipped entirely (not counted as "different"), so the map's outer edge never falsely
 * reads as a biome transition.
 */
export function computeEdgeBlend(
  wg: WorldGrid, x: number, z: number, biome: GrassBiome, bandWidthWU: number,
): number {
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  let different = 0;
  for (const [dx, dz] of EDGE_SAMPLE_DIRECTIONS) {
    const sx = x + dx * bandWidthWU;
    const sz = z + dz * bandWidthWU;
    const col = Math.floor(sx / wg.tileUnit + halfW);
    const row = Math.floor(sz / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;
    if (wg.get(col, row).biome !== biome) different++;
  }
  return different / EDGE_SAMPLE_DIRECTIONS.length;
}

// ── Instance-buffer packing ──────────────────────────────────────────────

export interface GrassInstanceBuffers {
  positionRotation: Float32Array;
  scaleAndVariation: Float32Array;
  /** 1 component per blade — see GrassPlacement.edgeBlend's doc comment. Its own typed
   *  array (not packed into an unused positionRotation/scaleAndVariation channel — all
   *  8 of those are already spoken for) since it's a new, independent per-instance value. */
  edgeBlend: Float32Array;
}

/** Pack placements into the Float32Arrays the shader's instanced attributes expect. */
export function packGrassInstanceBuffers(placements: GrassPlacement[]): GrassInstanceBuffers {
  const count = placements.length;
  const positionRotation = new Float32Array(count * 4);
  const scaleAndVariation = new Float32Array(count * 4);
  const edgeBlend = new Float32Array(count);
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
    edgeBlend[i] = p.edgeBlend;
  }
  return { positionRotation, scaleAndVariation, edgeBlend };
}

// ── Blade geometry ────────────────────────────────────────────────────────

const FADE_START = GRASS_RADIUS - 10;
const FADE_END   = GRASS_RADIUS - 2;

/** Tapered, bezier-curved triangle-strip blade (see procedural-grass-threejs skill). */
export function createGrassBladeGeometry(preset: GrassPreset): THREE.BufferGeometry {
  const { segments, width, height, curvature } = preset;
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
 * Wind-animated grass blade material, tuned per `preset` (colors, dry-tint amount, wind
 * response). Uses Three.js's automatically-injected built-ins (`position`, `normal`, `uv`,
 * `modelMatrix`, `projectionMatrix`, `viewMatrix`, `cameraPosition`) directly without
 * redeclaring them — the same convention already used by this project's `WaterMaterial.ts`
 * (confirmed working there: redeclaring these causes a GLSL "redefinition" compile error,
 * since `THREE.ShaderMaterial` always prepends them).
 */
export function createGrassMaterial(preset: GrassPreset): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor:    { value: new THREE.Color(preset.baseColor) },
      uTipColor:     { value: new THREE.Color(preset.tipColor) },
      uDryColor:     { value: new THREE.Color(preset.dryColor) },
      uDryAmount:    { value: preset.dryAmount },
      uSssStrength:  { value: 0.5 },
      uAoStrength:   { value: 0.6 },
      uSunDir:       { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      uSunColor:     { value: new THREE.Color(0xfff4e5) },
      uAmbientColor: { value: new THREE.Color(0x4488aa) },
      uWindTime:     { value: 0 },
      uWindDir:      { value: new THREE.Vector2(1, 0.3).normalize() },
      uWindBase:     { value: preset.windBase },
      uWindGust:     { value: preset.windGust },
      uWindGustFreq: { value: preset.windGustFreq },
      uBladeHeight:  { value: preset.height },
      uFadeStart:    { value: FADE_START },
      uFadeEnd:      { value: FADE_END },
      uFadeCenter:   { value: new THREE.Vector2(0, 0) },
      uTrampleStampPos: { value: FALLBACK_STAMP_POSITIONS },
      uTrampleStampAge: { value: FALLBACK_STAMP_AGES },
      uTrampleRadius:   { value: TRAMPLE_STAMP_RADIUS },
      uTrampleHalfLife: { value: TRAMPLE_DECAY_HALF_LIFE_S },
    },
    vertexShader: /* glsl */ `
      attribute vec4  aPositionRotation; // xyz = world pos, w = Y rotation
      attribute vec4  aScaleVariation;   // x = scaleX, y = scaleY, z = tilt, w = colorVar
      attribute float aEdgeBlend;        // 0 = interior, 1 = at a biome boundary — see
                                          // GrassPlacement.edgeBlend's doc comment.

      uniform float uWindTime;
      uniform vec2  uWindDir;
      uniform float uWindBase;
      uniform float uWindGust;
      uniform float uWindGustFreq;
      uniform float uBladeHeight; // world units — see GrassPreset.windBase/windGust doc:
                                    // wind offset is computed as a fraction of this blade's
                                    // own height, not a fixed absolute displacement.
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform vec2  uFadeCenter; // world XZ position to fade distance from (the player,
                                  // NOT cameraPosition — this game's fixed isometric camera
                                  // sits ~28 WU from the player (see CameraRig.ts's
                                  // ISO_OFFSET), so fading by camera distance made grass
                                  // right at the player's feet always fully discard).
      // Trampled-grass trail: a small fixed-size array of recent footstep "stamps"
      // (world position + age), evaluated via plain ALU math below — deliberately NOT a
      // sampler2D texture. An earlier version of this feature sampled a spatial texture
      // here in the VERTEX shader (a "vertex texture fetch" / VTF) — a well-known real-
      // GPU performance trap, since far fewer texture units typically serve the vertex
      // stage than the fragment stage. With up to ~100,000 blade instances × ~11
      // vertices each, that meant millions of VTF calls per frame, causing a severe FPS
      // regression on real hardware (invisible in this project's software-rendered test
      // environment). See docs/superpowers/specs/2026-09-01-trample-vtf-perf-fix.md.
      uniform vec2  uTrampleStampPos[${MAX_TRAMPLE_STAMPS}];
      uniform float uTrampleStampAge[${MAX_TRAMPLE_STAMPS}];
      uniform float uTrampleRadius;
      uniform float uTrampleHalfLife;

      varying vec2  vUv;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      varying float vColorVar;
      varying float vFade;
      varying float vEdgeBlend;

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
        vec2 turbulence = vec2(sin(turbPhase), cos(turbPhase * 0.7)) * 0.05;

        float h2 = heightFactor * heightFactor;
        // windBase/windGust/turbulence above are fractions of the blade's own height (see
        // GrassPreset doc) — multiplying by uBladeHeight converts to an absolute world-unit
        // offset, so sway always scales with how tall THIS preset's blade actually is instead
        // of a fixed WU amount that would dwarf a short blade (e.g. tundra).
        return (globalSway + gustSway + turbulence) * h2 * uBladeHeight;
      }

      void main() {
        vUv = uv;
        vColorVar = aScaleVariation.w;
        vEdgeBlend = aEdgeBlend;

        // Trampled-grass trail crush amount for this blade — computed from its planted
        // ROOT position (aPositionRotation.xz, NOT the wind-swayed per-vertex worldPos
        // below) so every vertex of one blade agrees on how "crushed" it is. Pure ALU
        // (distance + pow), no texture — see this file's uTrampleStampPos doc comment
        // above and docs/superpowers/specs/2026-09-01-trample-vtf-perf-fix.md. Mirrors
        // GrassTrample.ts's computeCrushAt() exactly (kept in sync manually; that JS
        // function is the unit-tested reference this GLSL loop must match).
        float crush = 0.0;
        for (int i = 0; i < ${MAX_TRAMPLE_STAMPS}; i++) {
          vec2 stampPos = uTrampleStampPos[i];
          float dist = distance(aPositionRotation.xz, stampPos);
          float falloff = max(0.0, 1.0 - dist / uTrampleRadius);
          float decay = pow(0.5, uTrampleStampAge[i] / uTrampleHalfLife);
          crush = max(crush, falloff * decay);
        }

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

        // Flatten toward the ground proportional to how trampled this blade currently is
        // — the same VERTEX.y *= (1 - crush) formula verified in two independent real
        // Godot grass shaders (see the design spec's §2 research notes).
        rotated.y *= (1.0 - crush);

        vec3 worldPos = rotated + aPositionRotation.xyz;

        float heightFactor = uv.y;
        // A fully-crushed blade is pinned down and doesn't sway in the wind.
        vec2 windOffsetXZ = computeWind(worldPos, heightFactor) * (1.0 - crush);
        worldPos.x += windOffsetXZ.x;
        worldPos.z += windOffsetXZ.y;

        vWorldPos = worldPos;
        vNormal = normalize(normal);
        vNormal.xz += windOffsetXZ * 0.3;
        vNormal = normalize(vNormal);

        float dist = distance(worldPos.xz, uFadeCenter);
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
      varying float vEdgeBlend;

      void main() {
        if (vFade < 0.01) discard;

        float heightT = vUv.y;
        vec3 color = mix(uBaseColor, uTipColor, heightT);
        // Blades near a biome boundary (vEdgeBlend -> 1) are pulled toward the shared
        // uDryColor regardless of their own random vColorVar roll — max(), not a plain
        // multiply, so the boundary pull is reliable rather than only affecting blades
        // that also happened to roll a high vColorVar. See design spec
        // docs/superpowers/specs/2026-09-01-grass-biome-boundary-blending-design.md §2.
        color = mix(color, uDryColor, max(vColorVar * uDryAmount, vEdgeBlend));
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

// ── Wind system ───────────────────────────────────────────────────────────

/**
 * Drives the shared, time-varying parts of the grass shader's wind — the clock and the
 * global wind direction (both meant to be the SAME across every biome's GrassField so
 * they all sway in sync with one wind). Deliberately does NOT own baseStrength/gustStrength/
 * gustFrequency: those are genuinely per-preset (see `GrassPreset.windBase`/`windGust`/
 * `windGustFreq`), set once on the material in `createGrassMaterial()` and left untouched by
 * `tickWind()` — a prior version of this class duplicated fixed 0.4/0.8/0.3 defaults here and
 * `tickWind()` blindly overwrote every biome's own tuned uWindBase/uWindGust/uWindGustFreq with
 * them every frame, silently discarding all 5 presets' per-biome wind tuning after the very
 * first tick (bug found + fixed alongside the height/wind-scale tuning pass).
 */
export class WindSystem {
  direction = new THREE.Vector2(1, 0.3).normalize();
  time = 0;

  update(dt: number): void {
    this.time += dt;
  }
}

// ── GrassField ────────────────────────────────────────────────────────────

/**
 * Owns one persistent `THREE.InstancedMesh` of grass blades for ONE `GrassPreset`/biome,
 * rebuilt (in place — no reallocation) only when the player moves past `REBUILD_HYSTERESIS`
 * from the last build center. `OverworldScene` owns one `GrassField` per grass-bearing biome
 * (see `GRASS_PRESETS`), not one shared instance across biomes. Call `update()` once per frame
 * with the player's world position, and `tickWind()` once per frame to animate the shader
 * (cheap — uniform writes only, no CPU instance work).
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private readonly _material: THREE.ShaderMaterial;
  private readonly _wind = new WindSystem();
  private readonly _positionRotation: THREE.InstancedBufferAttribute;
  private readonly _scaleAndVariation: THREE.InstancedBufferAttribute;
  private readonly _edgeBlend: THREE.InstancedBufferAttribute;
  private _lastBuildX = Infinity;
  private _lastBuildZ = Infinity;

  constructor(
    private readonly _wg: WorldGrid,
    private readonly _seed: number,
    readonly preset: GrassPreset,
    trampleMap?: TrampleMap,
  ) {
    const geometry = createGrassBladeGeometry(preset);
    this._material = createGrassMaterial(preset);
    if (trampleMap) {
      // Assigned ONCE, by reference — TrampleMap mutates these same typed arrays in
      // place every update() call, so this GrassField automatically sees fresh stamp
      // data every frame without needing to refresh a uniform here itself (unlike the
      // old texture-based design's per-frame uTrampleCenter refresh, no longer needed).
      this._material.uniforms.uTrampleStampPos.value = trampleMap.stampPositions;
      this._material.uniforms.uTrampleStampAge.value = trampleMap.stampAges;
    }

    this._positionRotation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._positionRotation.setUsage(THREE.DynamicDrawUsage);
    this._scaleAndVariation = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades * 4), 4,
    );
    this._scaleAndVariation.setUsage(THREE.DynamicDrawUsage);
    this._edgeBlend = new THREE.InstancedBufferAttribute(
      new Float32Array(preset.maxBlades), 1,
    );
    this._edgeBlend.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPositionRotation', this._positionRotation);
    geometry.setAttribute('aScaleVariation', this._scaleAndVariation);
    geometry.setAttribute('aEdgeBlend', this._edgeBlend);

    this.mesh = new THREE.InstancedMesh(geometry, this._material, preset.maxBlades);
    this.mesh.frustumCulled = false; // wind displacement can push blades outside static bounds
    this.mesh.count = 0; // nothing placed until the first update()
  }

  /** Rebuild the instance buffer only once the player has moved past REBUILD_HYSTERESIS.
   *  Updates the fade-center uniform every call regardless (see uFadeCenter's shader doc
   *  comment) so the visual fade radius tracks the player continuously, not just at
   *  rebuild boundaries. */
  update(playerX: number, playerZ: number): void {
    (this._material.uniforms.uFadeCenter.value as THREE.Vector2).set(playerX, playerZ);

    const dx = playerX - this._lastBuildX;
    const dz = playerZ - this._lastBuildZ;
    if (Number.isFinite(this._lastBuildX) && Math.sqrt(dx * dx + dz * dz) < REBUILD_HYSTERESIS) {
      return;
    }
    this._lastBuildX = playerX;
    this._lastBuildZ = playerZ;

    const placements = selectGrassPlacements(
      this._wg, playerX, playerZ, GRASS_RADIUS, this._seed,
      this.preset.biome, this.preset.densityPerUnit2,
    );
    const count = Math.min(placements.length, this.preset.maxBlades);
    const { positionRotation, scaleAndVariation, edgeBlend } =
      packGrassInstanceBuffers(placements.slice(0, count));

    this._positionRotation.array.set(positionRotation);
    this._scaleAndVariation.array.set(scaleAndVariation);
    this._edgeBlend.array.set(edgeBlend);
    this._positionRotation.needsUpdate = true;
    this._scaleAndVariation.needsUpdate = true;
    this._edgeBlend.needsUpdate = true;
    this.mesh.count = count;
  }

  /** Per-frame, cheap — only updates shader uniforms, no CPU instance-data work.
   *  Only touches uWindTime/uWindDir (the shared wind clock/direction) — uWindBase/
   *  uWindGust/uWindGustFreq/uBladeHeight are per-preset and were already set once in
   *  createGrassMaterial()'s constructor call; they must NOT be overwritten here (see
   *  WindSystem's doc comment for the bug this used to cause). */
  tickWind(dt: number): void {
    this._wind.update(dt);
    const u = this._material.uniforms;
    u.uWindTime.value = this._wind.time;
    (u.uWindDir.value as THREE.Vector2).copy(this._wind.direction);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this._material.dispose();
  }
}
