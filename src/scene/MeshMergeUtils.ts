import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeGroupMeshesByMaterial(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();

  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshesToRemove: THREE.Mesh[] = [];

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material;
    if (Array.isArray(mat)) return; // scatter builders never use multi-material meshes; skip defensively
    const local = new THREE.Matrix4().multiplyMatrices(groupInverse, obj.matrixWorld);
    let geo = obj.geometry.clone().applyMatrix4(local);
    // Normalize indexing before bucketing: some primitives used here
    // (Icosahedron/DodecahedronGeometry, e.g. tree canopy blobs, rock
    // boulders/pebbles) are non-indexed by default while others
    // (Cylinder/Cone/BoxGeometry, e.g. trunks, slab rocks) are indexed —
    // and a single pooled material (e.g. 'rock') can be shared across
    // both. mergeGeometries() requires every geometry in a merge to be
    // uniformly indexed or non-indexed, so force non-indexed here to
    // guarantee that regardless of which primitives land in a bucket.
    if (geo.index) geo = geo.toNonIndexed();
    let bucket = buckets.get(mat);
    if (!bucket) { bucket = []; buckets.set(mat, bucket); }
    bucket.push(geo);
    meshesToRemove.push(obj);
  });

  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose(); // dispose the transformed clones — only the merged result is kept
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    // Distinguishes this aggregate render-batch mesh from a real
    // per-instance scatter anchor (`userData.scatterKind`) — its own
    // `.position` is always (0,0,0) since world transforms are already
    // baked into its merged vertices, so any consumer that expects
    // `scatter.children[i].position` to be one tree/rock/bush/decor's
    // world location (e.g. the collider loop in `_loadTerrainChunk()`,
    // or chunk-scatter-alignment.test.ts) must skip nodes carrying this
    // flag rather than treating every `scatter.children` entry as such.
    mesh.userData.isMergedScatterBatch = true;
    group.add(mesh);
  }

  // Prune the original per-primitive meshes now that their visual
  // contribution lives in the merged meshes above. Their parent wrapper
  // (the tree/rock/bush/decor anchor) stays in `group` untouched.
  for (const m of meshesToRemove) {
    m.geometry.dispose();
    m.parent?.remove(m);
  }
}
