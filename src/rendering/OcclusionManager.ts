/**
 * OcclusionManager.ts — scene-wide wall/tree/building occlusion fade.
 *
 * Modes:
 *   setMeshes(list)  – explicit list (building interiors, fast)
 *   setScene(scene)  – auto-detect from scene every 2s (overworld, dungeon, tower)
 */
import * as THREE from 'three';

const FADE_OPACITY   = 0.12;
const FADE_SPEED     = 0.18;
const RESTORE_SPEED  = 0.10;
const EPSILON        = 0.005;
const CACHE_INTERVAL = 2.0;

interface MatLike {
  opacity:number; transparent:boolean; depthWrite:boolean; needsUpdate:boolean;
  isMeshBasicMaterial?:boolean; isLineBasicMaterial?:boolean;
  clone?: () => MatLike; dispose?: () => void;
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

function _isCandidate(obj: THREE.Object3D): boolean {
  if (!(obj as THREE.Mesh).isMesh) return false;
  if ((obj as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (!obj.visible) return false;
  if (obj.userData.isNotOccluder) return false;
  const mat = (obj as THREE.Mesh).material as MatLike | undefined;
  if (!mat || mat.isMeshBasicMaterial || mat.isLineBasicMaterial) return false;
  if (mat.transparent && (mat.opacity ?? 1) < 0.3) return false;
  const m = obj as THREE.Mesh;
  if (m.geometry) {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (bb) {
      const h = bb.max.y - bb.min.y;
      if (h < 0.35) return false;
      _v.set((bb.min.x+bb.max.x)*0.5,(bb.min.y+bb.max.y)*0.5,(bb.min.z+bb.max.z)*0.5);
      m.localToWorld(_v);
      if (_v.y < 0.3 && h < 0.8) return false;
    }
  }
  return true;
}

export class OcclusionManager {
  private _mode: 'meshes'|'scene' = 'meshes';
  private _meshList: THREE.Mesh[] = [];
  private _scene: THREE.Scene | null = null;
  private _cache: THREE.Mesh[] = [];
  private _cacheAge = Infinity;
  // Materials are frequently POOLED/SHARED across many scatter meshes (trees,
  // rocks — see OverworldScene's `_pooledMaterial()`), so this manager must
  // never mutate `mesh.material` in place: doing so would visually fade every
  // OTHER mesh sharing that same material instance, and — worse — a second
  // mesh starting to fade while the first is still faded would record the
  // already-dimmed opacity as its "original", permanently corrupting the
  // shared material. Instead, the first time a mesh needs to fade we clone
  // its (possibly shared) material once and swap `mesh.material` to that
  // per-mesh clone; `_origMaterial` remembers the true shared material so it
  // can be restored (not just its opacity) once the fade completes.
  private readonly _faded = new Map<THREE.Mesh, number>();
  private readonly _origMaterial = new Map<THREE.Mesh, MatLike>();
  private readonly _rc = new THREE.Raycaster();

  setMeshes(meshes: THREE.Mesh[]): void {
    this._restoreAll(); this._mode='meshes'; this._scene=null; this._meshList=meshes;
  }
  setScene(scene: THREE.Scene): void {
    this._restoreAll(); this._mode='scene'; this._scene=scene; this._cache=[]; this._cacheAge=Infinity;
  }
  dispose(): void {
    this._restoreAll(); this._meshList=[]; this._scene=null; this._cache=[];
  }

  update(camera: THREE.Camera, playerPos: THREE.Vector3, dt = 0.016): void {
    let candidates: THREE.Mesh[];
    if (this._mode === 'meshes') {
      candidates = this._meshList;
    } else {
      this._cacheAge += dt;
      if (this._cacheAge >= CACHE_INTERVAL) { this._rebuild(); this._cacheAge=0; }
      candidates = this._cache;
    }
    if (!candidates.length) return;

    const origin = camera.getWorldPosition(_v.set(0,0,0));
    const dir = _d.subVectors(playerPos, origin);
    const dist = dir.length();
    if (dist < 0.3) return;
    dir.normalize();
    this._rc.set(origin, dir);
    this._rc.near = 0.5;
    // Stop 1 unit before the player's centroid so the ray never intersects
    // the character's own hat/accessories/orb even if isNotOccluder is missing.
    this._rc.far  = dist - 1.0;

    const hits = this._rc.intersectObjects(candidates, false);
    const hitSet = new Set(hits.map(h => h.object as THREE.Mesh));

    for (const mesh of hitSet) {
      if (!this._faded.has(mesh)) {
        const sharedMat = mesh.material as MatLike;
        this._origMaterial.set(mesh, sharedMat);
        this._faded.set(mesh, sharedMat.opacity ?? 1);
        // Clone so subsequent opacity mutations only ever touch this mesh's
        // own material instance, never the shared/pooled one other meshes
        // still reference.
        const clone = (sharedMat.clone ? sharedMat.clone() : sharedMat) as MatLike;
        clone.transparent = true; clone.needsUpdate = true;
        (mesh as THREE.Mesh).material = clone as unknown as THREE.Material;
      }
    }
    for (const [mesh, orig] of this._faded) {
      const mat  = mesh.material as MatLike;
      const tgt  = hitSet.has(mesh) ? FADE_OPACITY : orig;
      const curr = mat.opacity ?? 1;
      const gap  = tgt - curr;
      if (Math.abs(gap) < EPSILON) {
        mat.opacity=tgt; mat.transparent=tgt<0.99; mat.depthWrite=tgt>=0.5; mat.needsUpdate=true;
        if (!hitSet.has(mesh)) this._restoreMesh(mesh);
        continue;
      }
      const next = curr + gap * (gap < 0 ? FADE_SPEED : RESTORE_SPEED);
      mat.opacity=next; mat.transparent=next<0.99; mat.depthWrite=next>=0.5; mat.needsUpdate=true;
    }
  }

  /** Restores `mesh.material` to the original (possibly shared/pooled)
   *  material reference it had before fading started, and disposes the
   *  per-mesh clone created to fade it — never mutates the shared material. */
  private _restoreMesh(mesh: THREE.Mesh): void {
    const origMat = this._origMaterial.get(mesh);
    const clone = mesh.material as MatLike;
    if (origMat) {
      if (clone !== (origMat as unknown as MatLike) && clone.dispose) clone.dispose();
      mesh.material = origMat as unknown as THREE.Material;
    }
    this._faded.delete(mesh);
    this._origMaterial.delete(mesh);
  }

  private _restoreAll(): void {
    for (const mesh of Array.from(this._faded.keys())) {
      this._restoreMesh(mesh);
    }
    this._faded.clear();
    this._origMaterial.clear();
  }
  private _rebuild(): void {
    if (!this._scene) return;
    const out: THREE.Mesh[] = [];
    this._scene.traverse(o => { if (_isCandidate(o)) out.push(o as THREE.Mesh); });
    for (const m of Array.from(this._faded.keys())) {
      if (!out.includes(m)) {
        this._restoreMesh(m);
      }
    }
    this._cache = out;
  }
}
