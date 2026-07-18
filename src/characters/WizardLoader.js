/**
 * WizardLoader — loads one of the three old-wizard GLB packs.
 *
 * Each wizard is stored as two GLBs:
 *   mesh.glb  — rigged T-pose character mesh
 *   anims.glb — same rig with Walk / Idle / Running clips merged in
 *
 * Strategy: load anims.glb (it contains the full mesh too) and clone it.
 * Mesh.glb is preloaded alongside for fast first-frame display if the
 * animations file is still streaming — we always end up using anims.glb.
 *
 * Clips are cached; each call returns a fresh SkeletonUtils clone + mixer.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
const _cache = new Map();
const _pending = new Map();
const _loader = new GLTFLoader();
function _loadGLB(path) {
    const hit = _cache.get(path);
    if (hit)
        return Promise.resolve(hit);
    const inf = _pending.get(path);
    if (inf)
        return inf;
    const p = new Promise((resolve, reject) => {
        _loader.load(path, (gltf) => {
            const entry = {
                scene: gltf.scene,
                clips: gltf.animations ?? [],
            };
            _cache.set(path, entry);
            _pending.delete(path);
            resolve(entry);
        }, undefined, (err) => {
            _pending.delete(path);
            reject(new Error(`WizardLoader: failed "${path}" — ${String(err)}`));
        });
    });
    _pending.set(path, p);
    return p;
}
function _find(clips, name) {
    // Exact match first, then prefix match, then case-insensitive contains
    return (clips.find(c => c.name === name) ??
        clips.find(c => c.name.toLowerCase().startsWith(name.toLowerCase())) ??
        clips.find(c => c.name.toLowerCase().includes(name.toLowerCase())) ??
        null);
}
// ── public API ────────────────────────────────────────────────────────────────
/**
 * Load a wizard and return a clone ready to add to a Three.js scene.
 * The anims GLB is used as the authoritative source (contains mesh + clips).
 */
export async function loadWizard(def) {
    const entry = await _loadGLB(def.animPath);
    const group = skeletonClone(entry.scene);
    // Enable shadows
    group.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    const allClips = entry.clips;
    const walkClip = _find(allClips, def.clipWalk) ?? _find(allClips, 'Walk');
    const idleClip = _find(allClips, def.clipIdle) ?? _find(allClips, 'Idle');
    if (!walkClip)
        throw new Error(`WizardLoader: no walk clip "${def.clipWalk}" in ${def.animPath}`);
    if (!idleClip)
        throw new Error(`WizardLoader: no idle clip "${def.clipIdle}" in ${def.animPath}`);
    const mixer = new THREE.AnimationMixer(group);
    return { group, mixer, walkClip, idleClip, allClips };
}
