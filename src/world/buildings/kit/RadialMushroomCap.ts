import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { finishArchitecturalGeometry } from './Bevels';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';

/**
 * RadialMushroomCap.ts — [SHARED KIT] fae-driven mushroom-cap roof module
 * (docs/superpowers/specs/2026-09-04-fae-buildings-design.md §5/§2.3:
 * "A cap is a radial frame: gill ribs below, radial cap ribs above,
 * shingle/scales/petal courses between ribs, thick scalloped rim, spots
 * as raised inlaid caps/spore plaques -- never a bare
 * SphereGeometry/lathe blob."). Doctrine Rule 3 explicitly bans
 * voxel-grid blobs and smooth domes standing in for organic roof forms
 * (`docs/superpowers/specs/2026-09-04-modular-building-kit-doctrine.md`
 * Part 2); this module replaces the fae `buildFaeStalkGrid()` block-grid
 * cap and the generic `buildLivingRoofCap()` BlockKit voxel blob with a
 * real constructed cap: radial ribs from a small apex boss to the rim,
 * concentric shingle/scale bands riding on top of the ribs (reusing the
 * same "many small overlapping tiles, not a smooth shell" discipline as
 * `ShingleSurface.ts`), underside gill fins, and a thick scalloped rim
 * band.
 *
 * Every mesh is a stock `THREE.CylinderGeometry`/`THREE.BoxGeometry` or a
 * `finishArchitecturalGeometry`-baked `THREE.ExtrudeGeometry` (both
 * always carry a `uv` attribute), deliberately avoiding the hand-rolled-
 * `BufferGeometry`-without-`uv` merge-drop bug class documented in
 * `MeshMergeUtils.ts` (doctrine Part 9 / StoneTowerFloorCap.ts /
 * SlimeAccretionKit.ts / Ruinate.ts history).
 *
 * Coordinate model: the cap's local origin sits at the rib springing
 * line (y=0, the wall's eave), with ribs rising from radius `radius` at
 * t=0 to a small `apexRadius` boss at t=1, climbing `rise` world units.
 * `apexLean` optionally offsets the apex boss sideways (a leaning
 * storybook cap), which every rib/band bends toward smoothly via a `t^2`
 * weighting so the rim stays circular while the crown leans.
 */

export interface RadialMushroomCapPalette {
  /** Radial structural ribs + apex boss. */
  rib: THREE.Material;
  /** Shingle/scale course tiles between ribs. */
  shingle: THREE.Material;
  /** Thick scalloped rim band. */
  rim: THREE.Material;
  /** Underside gill fins. */
  gill: THREE.Material;
  /** Optional raised spore/spot plaques. Defaults to `shingle`. */
  plaque?: THREE.Material;
}

export interface RadialMushroomCapOptions {
  /** Outer rim radius along local X. */
  radius: number;
  /** Outer rim radius along local Z. Defaults to `radius` (circular cap). Set below/above `radius` for an oval/elongated cap (e.g. a chapel nave). */
  radiusZ?: number;
  /** World-unit rise from the rib springing line to the apex boss. */
  rise: number;
  /** Radial rib count. Clamped to 12-20 per the design spec. Default 14. */
  ribCount?: number;
  /** Concentric shingle/scale band count. Clamped to 3-7. Default 4. */
  shingleBands?: number;
  /** Underside gill fin count. Default equals `ribCount`. */
  gillCount?: number;
  /** Scalloped rim band thickness (world units, downward from the rib springing line). Default 0.09. */
  rimThickness?: number;
  /** Raised spore/spot plaque count. Default 0 (none). */
  plaqueCount?: number;
  /** Lateral apex boss offset (world units) for a leaning storybook crown. */
  apexLean?: { x?: number; z?: number };
  /** Shingle tile silhouette, forwarded to the same kick/overlap language as `ShingleSurface.ts`. Default 'fishscale'. */
  tileSilhouette?: 'rectangular' | 'scallop';
  seed?: number;
  palette: RadialMushroomCapPalette;
}

interface ProfileSample {
  radiusX: number;
  radiusZ: number;
  y: number;
  leanX: number;
  leanZ: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Samples the cap's rib profile at `t` in [0 (rim), 1 (apex boss)]. */
function sampleProfile(t: number, opts: Required<Pick<RadialMushroomCapOptions, 'radius' | 'rise'>> & { radiusZ: number; apexRadiusFrac: number; leanX: number; leanZ: number }): ProfileSample {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  // Ease-out rise: climbs quickly near the rim, flattens near the boss --
  // the classic convex mushroom-cap curve, not a linear cone.
  const easedY = 1 - (1 - clampedT) * (1 - clampedT);
  const radiusFrac = 1 - clampedT * (1 - opts.apexRadiusFrac);
  const leanWeight = clampedT * clampedT;
  return {
    radiusX: opts.radius * radiusFrac,
    radiusZ: opts.radiusZ * radiusFrac,
    y: opts.rise * easedY,
    leanX: opts.leanX * leanWeight,
    leanZ: opts.leanZ * leanWeight,
  };
}

function profilePoint(sample: ProfileSample, angle: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.cos(angle) * sample.radiusX + sample.leanX,
    sample.y,
    Math.sin(angle) * sample.radiusZ + sample.leanZ,
  );
}

/** A single tapered straight segment between two rib sample points, built from a stock cylinder so it always carries a `uv` attribute. */
function buildRibSegment(a: THREE.Vector3, b: THREE.Vector3, radiusA: number, radiusB: number, material: THREE.Material): THREE.Mesh {
  const length = a.distanceTo(b);
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, Math.max(length, 1e-4), 6, 1);
  const mesh = new THREE.Mesh(geometry, material);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function markMergedMeshesForLighting(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = child.receiveShadow = true;
  });
}

function buildRibs(
  ribCount: number,
  segments: number,
  profileOpts: Parameters<typeof sampleProfile>[1],
  baseRadius: number,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cap-ribs';
  for (let i = 0; i < ribCount; i++) {
    const angle = (i / ribCount) * Math.PI * 2;
    for (let s = 0; s < segments; s++) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const p0 = profilePoint(sampleProfile(t0, profileOpts), angle);
      const p1 = profilePoint(sampleProfile(t1, profileOpts), angle);
      const thickness0 = THREE.MathUtils.lerp(baseRadius, baseRadius * 0.35, t0);
      const thickness1 = THREE.MathUtils.lerp(baseRadius, baseRadius * 0.35, t1);
      group.add(buildRibSegment(p0, p1, thickness0, thickness1, material));
    }
  }
  mergeGroupMeshesByMaterial(group);
  markMergedMeshesForLighting(group);
  return group;
}

function buildApexBoss(profileOpts: Parameters<typeof sampleProfile>[1], baseRadius: number, material: THREE.Material): THREE.Mesh {
  const apex = sampleProfile(1, profileOpts);
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius * 0.55, baseRadius * 0.7, baseRadius * 0.9, 8), material);
  boss.name = 'apex-boss';
  boss.position.set(apex.leanX, apex.y, apex.leanZ);
  boss.castShadow = boss.receiveShadow = true;
  return boss;
}

/** Underside gill fins radiating from near the apex out to the rim, hanging just below the rib plane -- the classic toadstool detail. */
function buildGills(
  gillCount: number,
  profileOpts: Parameters<typeof sampleProfile>[1],
  radius: number,
  material: THREE.Material,
  seed: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cap-gills';
  const rand = mulberry32((seed ^ 0x6711_1105) >>> 0);
  for (let i = 0; i < gillCount; i++) {
    const angle = (i / gillCount) * Math.PI * 2 + (rand() - 0.5) * 0.05;
    const rimSample = sampleProfile(0, profileOpts);
    const gillLength = radius * (0.86 + rand() * 0.08);
    const gill = new THREE.Mesh(new THREE.BoxGeometry(gillLength, radius * 0.012, radius * 0.05), material);
    gill.name = `gill-${i}`;
    gill.position.set(Math.cos(angle) * gillLength * 0.5, rimSample.y - radius * 0.01, Math.sin(angle) * gillLength * 0.5);
    gill.rotation.y = -angle;
    gill.castShadow = gill.receiveShadow = true;
    group.add(gill);
  }
  mergeGroupMeshesByMaterial(group);
  markMergedMeshesForLighting(group);
  return group;
}

function buildTileShape(width: number, height: number, silhouette: 'rectangular' | 'scallop'): THREE.Shape {
  const halfW = width / 2;
  const shape = new THREE.Shape();
  if (silhouette === 'scallop') {
    const shoulderY = height * 0.32;
    shape.moveTo(-halfW, height);
    shape.lineTo(halfW, height);
    shape.lineTo(halfW, shoulderY);
    shape.quadraticCurveTo(halfW * 0.5, -height * 0.12, 0, -height * 0.05);
    shape.quadraticCurveTo(-halfW * 0.5, -height * 0.12, -halfW, shoulderY);
  } else {
    shape.moveTo(-halfW, height);
    shape.lineTo(halfW, height);
    shape.lineTo(halfW, 0);
    shape.lineTo(-halfW, 0);
  }
  shape.closePath();
  return shape;
}

/**
 * Computes the orientation for a single shingle tile bridging `base` (the
 * outer/lower sample point on the cap profile) to `top` (the inner/upper
 * sample point) at radial angle `angle`. Local X (the tile shape's WIDTH
 * axis) must map to the circumferential/band-tangent direction so each
 * tile's flat wide face runs along the ring, tiling edge-to-edge with its
 * neighbors; local Y (the tile shape's HEIGHT axis) maps to the slope
 * direction (base -> top); local Z (the small extrude DEPTH axis) must
 * map to the outward-facing surface normal, giving only a slight physical
 * relief bump -- never the reverse, which turns every tile into a thin
 * spike poking straight out of the roof with gaps between them (the
 * "shard explosion" bug fixed here: swapping which axis got the tile's
 * large width vs. its tiny extrude depth).
 */
export function computeTileOrientation(base: THREE.Vector3, top: THREE.Vector3, angle: number): THREE.Quaternion {
  const slopeDir = top.clone().sub(base).normalize();
  const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  // Purely circumferential (always exactly horizontal: base and top share
  // the same angle, so slopeDir and outward both lie in the vertical-radial
  // plane at this angle, and their cross product is perpendicular to it).
  const bandTangent = new THREE.Vector3().crossVectors(slopeDir, outward).normalize();
  // Perpendicular to both slopeDir and bandTangent -- the true outward-and-
  // up-facing surface normal.
  const faceNormal = new THREE.Vector3().crossVectors(bandTangent, slopeDir).normalize();
  const basis = new THREE.Matrix4().makeBasis(bandTangent, slopeDir, faceNormal);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

/** Concentric bands of discrete overlapping tiles riding on top of the ribs -- the same "individually readable pieces forming a curve" discipline `ShingleSurface.ts` uses for pitched roofs, wrapped circularly here. */
function buildShingleBands(
  bandCount: number,
  tilesPerBand: number,
  profileOpts: Parameters<typeof sampleProfile>[1],
  radius: number,
  silhouette: 'rectangular' | 'scallop',
  material: THREE.Material,
  seed: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cap-shingle-bands';
  const rand = mulberry32((seed ^ 0x5348_4e47) >>> 0);
  for (let band = 0; band < bandCount; band++) {
    const bandGroup = new THREE.Group();
    bandGroup.name = `shingle-band-${band}`;
    // Band 0 is the outermost/lowest ring (nearest the rim); each higher
    // band sits further up-slope, overlapping the band below it.
    const tOuter = band / bandCount;
    const tInner = (band + 1.35) / bandCount; // overlap: this band's top edge reaches slightly past the next band's own base
    const outer = sampleProfile(tOuter, profileOpts);
    const inner = sampleProfile(Math.min(tInner, 1), profileOpts);
    const bandRadius = (outer.radiusX + outer.radiusZ) / 2;
    const tileWidth = (2 * Math.PI * bandRadius) / tilesPerBand;
    const tileDepth = Math.max(0.02, radius * 0.02);

    for (let i = 0; i < tilesPerBand; i++) {
      const jitter = (rand() - 0.5) * 0.1;
      const angle = (i / tilesPerBand) * Math.PI * 2 + jitter;
      const base = profilePoint(outer, angle);
      const top = profilePoint(inner, angle);
      const tileGeom = finishArchitecturalGeometry(new THREE.ExtrudeGeometry(
        buildTileShape(tileWidth * (0.92 + rand() * 0.12), top.distanceTo(base) * 1.05, silhouette),
        { depth: tileDepth, bevelEnabled: false, curveSegments: 4, steps: 1 },
      ));
      const tile = new THREE.Mesh(tileGeom, material);
      tile.name = `tile-${band}-${i}`;
      tile.position.copy(base);
      // Orient the tile so its width runs along the ring (circumferential),
      // its height climbs the local slope (base -> top), and only its thin
      // extrude depth faces outward -- matching ShingleSurface's per-tile
      // "kick", never a spike poking straight out of the roof.
      tile.quaternion.copy(computeTileOrientation(base, top, angle));
      tile.castShadow = tile.receiveShadow = true;
      bandGroup.add(tile);
    }
    mergeGroupMeshesByMaterial(bandGroup);
    markMergedMeshesForLighting(bandGroup);
    group.add(bandGroup);
  }
  return group;
}

/** A thick scalloped rim ring at the cap's outer edge -- individual overlapping trapezoidal blocks with a downward drip curve, not a smooth torus. */
function buildScallopedRim(
  profileOpts: Parameters<typeof sampleProfile>[1],
  rimThickness: number,
  material: THREE.Material,
  segmentCount: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cap-rim';
  const rim = sampleProfile(0, profileOpts);
  const bandRadius = (rim.radiusX + rim.radiusZ) / 2;
  const segWidth = (2 * Math.PI * bandRadius) / segmentCount * 1.12;

  for (let i = 0; i < segmentCount; i++) {
    const angle = (i / segmentCount) * Math.PI * 2;
    const scallop = new THREE.Mesh(
      finishArchitecturalGeometry(new THREE.ExtrudeGeometry(
        buildTileShape(segWidth, rimThickness, 'scallop'),
        { depth: rimThickness * 0.7, bevelEnabled: false, curveSegments: 4, steps: 1 },
      )),
      material,
    );
    scallop.name = `rim-scallop-${i}`;
    const pos = profilePoint(rim, angle);
    scallop.position.set(pos.x, pos.y - rimThickness, pos.z);
    scallop.rotation.x = Math.PI;
    scallop.rotation.y = -angle + Math.PI / 2;
    scallop.castShadow = scallop.receiveShadow = true;
    group.add(scallop);
  }
  mergeGroupMeshesByMaterial(group);
  markMergedMeshesForLighting(group);
  return group;
}

function buildPlaques(
  count: number,
  bandCount: number,
  profileOpts: Parameters<typeof sampleProfile>[1],
  radius: number,
  material: THREE.Material,
  seed: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'mushroom-cap-plaques';
  const rand = mulberry32((seed ^ 0x504c_4151) >>> 0);
  for (let i = 0; i < count; i++) {
    const t = rand() * (bandCount / (bandCount + 1));
    const angle = rand() * Math.PI * 2;
    const sample = sampleProfile(t, profileOpts);
    const pos = profilePoint(sample, angle);
    const plaqueRadius = radius * (0.045 + rand() * 0.03);
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(plaqueRadius, plaqueRadius * 0.9, plaqueRadius * 0.6, 7), material);
    plaque.name = `plaque-${i}`;
    plaque.position.set(pos.x, pos.y + plaqueRadius * 0.25, pos.z);
    plaque.castShadow = plaque.receiveShadow = true;
    group.add(plaque);
  }
  mergeGroupMeshesByMaterial(group);
  markMergedMeshesForLighting(group);
  return group;
}

export function buildRadialMushroomCap(options: RadialMushroomCapOptions): THREE.Group {
  const radiusZ = options.radiusZ ?? options.radius;
  const ribCount = clampInt(options.ribCount ?? 14, 12, 20);
  const shingleBands = clampInt(options.shingleBands ?? 4, 3, 7);
  const gillCount = clampInt(options.gillCount ?? ribCount, 8, 24);
  const rimThickness = options.rimThickness ?? Math.max(0.06, options.radius * 0.05);
  const plaqueCount = Math.max(0, Math.round(options.plaqueCount ?? 0));
  const seed = options.seed ?? 0;
  const silhouette = options.tileSilhouette ?? 'scallop';
  const apexLeanX = options.apexLean?.x ?? 0;
  const apexLeanZ = options.apexLean?.z ?? 0;

  const profileOpts = {
    radius: options.radius,
    radiusZ,
    rise: options.rise,
    apexRadiusFrac: 0.1,
    leanX: apexLeanX,
    leanZ: apexLeanZ,
  };
  const baseRibRadius = Math.max(0.02, Math.min(options.radius, radiusZ) * 0.035);

  const group = new THREE.Group();
  group.name = 'radial-mushroom-cap';
  group.userData.ribCount = ribCount;
  group.userData.shingleBands = shingleBands;

  group.add(buildRibs(ribCount, 4, profileOpts, baseRibRadius, options.palette.rib));
  group.add(buildApexBoss(profileOpts, baseRibRadius, options.palette.rib));
  group.add(buildGills(gillCount, profileOpts, Math.min(options.radius, radiusZ), options.palette.gill, seed));
  group.add(buildShingleBands(shingleBands, Math.max(10, ribCount), profileOpts, Math.min(options.radius, radiusZ), silhouette, options.palette.shingle, seed));
  group.add(buildScallopedRim(profileOpts, rimThickness, options.palette.rim, Math.max(14, Math.round(ribCount * 1.4))));
  if (plaqueCount > 0) {
    group.add(buildPlaques(plaqueCount, shingleBands, profileOpts, Math.min(options.radius, radiusZ), options.palette.plaque ?? options.palette.shingle, seed));
  }

  return group;
}
