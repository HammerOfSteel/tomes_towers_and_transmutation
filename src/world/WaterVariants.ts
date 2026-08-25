/**
 * WaterVariants — factory functions for the Water Lab's two selectable
 * higher-fidelity water-surface visuals, both built on three.js's official
 * example objects:
 *
 *   - createReflectiveWater()     → Water.js:    full planar reflection,
 *                                    tinted by sunDirection/waterColor.
 *   - createFlowRefractiveWater() → Water2.js:   flow-map-driven refraction
 *                                    and normal distortion, no separate
 *                                    reflection render target — cheaper,
 *                                    different look.
 *
 * IMPORTANT: both Water.js and Water2.js export their class under the same
 * name, `Water` — Water2.js's export is aliased below to avoid a collision.
 *
 * Both share a single lazily-loaded, cached normal-map texture (tiled via
 * RepeatWrapping) rather than loading it twice.
 */
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Water as Water2 } from 'three/examples/jsm/objects/Water2.js';

const NORMAL_MAP_URL = '/assets/textures/water/waternormals.jpg';

export type WaterVariantKind = 'stylized' | 'reflective' | 'flow-refractive';

let _loader: THREE.TextureLoader | null = null;
let _normalMapCache: THREE.Texture | null = null;

/** Lazily loads and caches the shared water normal-map texture, tiling via
 *  RepeatWrapping on both axes so it repeats across the basin's footprint. */
function loadNormalMap(): THREE.Texture {
  if (_normalMapCache) return _normalMapCache;
  _loader ??= new THREE.TextureLoader();
  const tex = _loader.load(NORMAL_MAP_URL);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  _normalMapCache = tex;
  return tex;
}

/** three.js Water: full planar-reflection water with wave normal distortion.
 *  `size` is the plane's width/depth in world units (square footprint). */
export function createReflectiveWater(size: number): Water {
  const geometry = new THREE.PlaneGeometry(size, size);
  return new Water(geometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: loadNormalMap(),
    sunDirection: new THREE.Vector3(0.70707, 0.70707, 0),
    sunColor: 0xffffff,
    waterColor: 0x1a3a4a,
    distortionScale: 2.0,
    fog: false,
  });
}

/** three.js Water2: flow-map-driven refraction/normal distortion — cheaper,
 *  no separate reflection render target. `size` is the plane's width/depth
 *  in world units (square footprint). */
export function createFlowRefractiveWater(size: number): Water2 {
  const geometry = new THREE.PlaneGeometry(size, size);
  return new Water2(geometry, {
    color: 0x1a3a4a,
    scale: 2,
    textureWidth: 512,
    textureHeight: 512,
    flowDirection: new THREE.Vector2(1, 0),
    flowSpeed: 0.15,
    reflectivity: 0.3,
    normalMap0: loadNormalMap(),
    normalMap1: loadNormalMap(),
  });
}
