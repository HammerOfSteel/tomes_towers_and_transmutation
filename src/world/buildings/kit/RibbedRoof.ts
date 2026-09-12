/**
 * RibbedRoof.ts — hide roof archetypes (docs/superpowers/specs/
 * 2026-09-04-orcish-buildings-design.md section 5:
 * `[SHARED KIT] RibbedRoof.ts`/`HideRoof.ts`: "yurt domes, conical hide
 * caps, longhouse gables, awnings, and smoke crowns built from ribs +
 * panels"). Consumes `LashedTimber` (ribs/rafters/posts) and `HidePanel`
 * (the sagging-skin displacement technique) rather than a bare smooth
 * cone/dome primitive, per doctrine Rule 3 ("no smooth cone roofs").
 *
 * Real yurts are not smooth cones: they have visible roof ribs/rafters
 * and a crown/compression ring where the ribs converge (design spec
 * section "Real-world basis"). Every builder here therefore emits real
 * rib/rafter meshes FIRST, then a curved hide-bay skin between them.
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { mergeGroupMeshesByMaterial } from '@/scene/MeshMergeUtils';
import { buildTaperedLog } from './LashedTimber';
import { buildSaggingSkin } from './HidePanel';

/** Builds one hide bay panel conforming to a cone/frustum shell between
 * two ribs at angles `thetaA`/`thetaB`, from radius `rBase` at `yBase` to
 * radius `rTop` at `yTop`. Starts from a stock `THREE.PlaneGeometry` (so
 * its `uv` attribute is never hand-rolled/dropped) and remaps every
 * vertex's local (x,y) into cone-shell world coordinates, with a small
 * inward sag bump peaking at the bay's angular midpoint -- the roof
 * sibling of `HidePanel.ts`'s flat sagging skin. */
function buildConeHideBay(
  thetaA: number,
  thetaB: number,
  rBase: number,
  rTop: number,
  yBase: number,
  yTop: number,
  sag: number,
  material: THREE.Material,
): THREE.Mesh {
  const segsU = 6;
  const segsV = 4;
  const geo = new THREE.PlaneGeometry(1, 1, segsU, segsV);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5; // 0..1 across the bay's angular span
    const v = pos.getY(i) + 0.5; // 0..1 from base to top
    const theta = thetaA + (thetaB - thetaA) * u;
    const radius = rBase + (rTop - rBase) * v;
    const y = yBase + (yTop - yBase) * v;
    const bump = Math.sin(Math.PI * u) * (1 - v * 0.35); // sags less near the apex, where bays are narrow
    const r = Math.max(0.001, radius - sag * bump);
    pos.setX(i, Math.sin(theta) * r);
    pos.setZ(i, Math.cos(theta) * r);
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'roof-hide-bay';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface ConicalHideRoofOptions {
  baseRadius: number;
  apexHeight: number;
  ribCount?: number;
  ribRadius?: number;
  sag?: number;
  seed: number;
  hideMaterial: THREE.Material;
  ribMaterial: THREE.Material;
}

/**
 * Builds a conical hide roof cap: `ribCount` tapered log ribs run from an
 * evenly-spaced base ring to a shared apex point, with a curved sagging
 * hide bay panel filling each gap between adjacent ribs (design spec:
 * "conical hide cap (8 ribs) 30%").
 */
export function buildConicalHideRoof(options: ConicalHideRoofOptions): THREE.Group {
  const { baseRadius, apexHeight, ribCount = 8, ribRadius = 0.06, sag = 0.05, seed, hideMaterial, ribMaterial } = options;
  const g = new THREE.Group();
  g.name = 'conical-hide-roof';
  const rand = mulberry32(seed >>> 0);

  const ribGroup = new THREE.Group();
  ribGroup.name = 'roof-ribs';
  const bayGroup = new THREE.Group();
  bayGroup.name = 'roof-hide-bays';

  const angles: number[] = [];
  for (let i = 0; i < ribCount; i++) angles.push((i / ribCount) * Math.PI * 2 + (rand() - 0.5) * 0.02);

  for (let i = 0; i < ribCount; i++) {
    const theta = angles[i];
    const bx = Math.sin(theta) * baseRadius;
    const bz = Math.cos(theta) * baseRadius;
    const length = Math.hypot(baseRadius, apexHeight);
    const rib = buildTaperedLog({ length, radiusBase: ribRadius, radiusTop: ribRadius * 0.5, material: ribMaterial });
    rib.name = 'roof-rib';
    rib.position.set(bx / 2, apexHeight / 2, bz / 2);
    const dir = new THREE.Vector3(0 - bx, apexHeight - 0, 0 - bz);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    ribGroup.add(rib);
  }

  for (let i = 0; i < ribCount; i++) {
    const thetaA = angles[i];
    const thetaB = angles[(i + 1) % ribCount];
    // Handle the wraparound bay's angular direction (last -> first) by
    // measuring the short way around the circle.
    let span = thetaB - thetaA;
    if (i === ribCount - 1) span = Math.PI * 2 - (thetaA - thetaB);
    const bay = buildConeHideBay(thetaA, thetaA + span, baseRadius, 0, 0, apexHeight, sag, hideMaterial);
    bayGroup.add(bay);
  }

  g.add(ribGroup);
  g.add(bayGroup);

  const socket = new THREE.Object3D();
  socket.name = 'crown-socket';
  socket.position.set(0, apexHeight, 0);
  g.add(socket);

  mergeGroupMeshesByMaterial(ribGroup);
  mergeGroupMeshesByMaterial(bayGroup);
  return g;
}

export interface DomedHideRoofOptions {
  baseRadius: number;
  height: number;
  ribCount?: number;
  crownRadiusRatio?: number;
  crownHeightRatio?: number;
  ribRadius?: number;
  sag?: number;
  seed: number;
  hideMaterial: THREE.Material;
  ribMaterial: THREE.Material;
}

/**
 * Builds a domed yurt-style hide roof cap: `ribCount` ribs run from the
 * base ring up to a crown/compression ring (a real `THREE.TorusGeometry`,
 * matching the design spec's yurt research: "a crown/compression ring
 * that keeps the wall from spreading"), with sagging hide bays filling
 * the gaps below the ring, plus a small rounded second-stage cap above
 * the ring and a named `crown-socket` anchor for a finial/spike prop
 * (design spec: "domed hide yurt cap (10-12 ribs + crown ring) 55%").
 */
export function buildDomedHideRoof(options: DomedHideRoofOptions): THREE.Group {
  const {
    baseRadius, height, ribCount = 11, crownRadiusRatio = 0.22, crownHeightRatio = 0.72,
    ribRadius = 0.06, sag = 0.05, seed, hideMaterial, ribMaterial,
  } = options;
  const g = new THREE.Group();
  g.name = 'domed-hide-roof';
  const rand = mulberry32(seed >>> 0);

  const crownRadius = baseRadius * crownRadiusRatio;
  const crownY = height * crownHeightRatio;

  const ribGroup = new THREE.Group();
  ribGroup.name = 'roof-ribs';
  const bayGroup = new THREE.Group();
  bayGroup.name = 'roof-hide-bays';

  const angles: number[] = [];
  for (let i = 0; i < ribCount; i++) angles.push((i / ribCount) * Math.PI * 2 + (rand() - 0.5) * 0.02);

  // Stage 1: base ring -> crown ring.
  for (let i = 0; i < ribCount; i++) {
    const theta = angles[i];
    const bx = Math.sin(theta) * baseRadius;
    const bz = Math.cos(theta) * baseRadius;
    const tx = Math.sin(theta) * crownRadius;
    const tz = Math.cos(theta) * crownRadius;
    const dir = new THREE.Vector3(tx - bx, crownY, tz - bz);
    const length = dir.length();
    const rib = buildTaperedLog({ length, radiusBase: ribRadius, radiusTop: ribRadius * 0.7, material: ribMaterial });
    rib.name = 'roof-rib';
    rib.position.set((bx + tx) / 2, crownY / 2, (bz + tz) / 2);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    ribGroup.add(rib);

    const thetaB = angles[(i + 1) % ribCount];
    let span = thetaB - theta;
    if (i === ribCount - 1) span = Math.PI * 2 - (theta - thetaB);
    bayGroup.add(buildConeHideBay(theta, theta + span, baseRadius, crownRadius, 0, crownY, sag, hideMaterial));
  }

  // Stage 2: crown ring -> apex (short, rounded cap above the ring).
  const apexY = height;
  for (let i = 0; i < ribCount; i++) {
    const theta = angles[i];
    const tx = Math.sin(theta) * crownRadius;
    const tz = Math.cos(theta) * crownRadius;
    const dir = new THREE.Vector3(0 - tx, apexY - crownY, 0 - tz);
    const length = dir.length();
    const rib = buildTaperedLog({ length, radiusBase: ribRadius * 0.7, radiusTop: ribRadius * 0.35, material: ribMaterial });
    rib.name = 'roof-rib';
    rib.position.set(tx / 2, crownY + (apexY - crownY) / 2, tz / 2);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    ribGroup.add(rib);

    const thetaB = angles[(i + 1) % ribCount];
    let span = thetaB - theta;
    if (i === ribCount - 1) span = Math.PI * 2 - (theta - thetaB);
    bayGroup.add(buildConeHideBay(theta, theta + span, crownRadius, 0, crownY, apexY, sag * 0.5, hideMaterial));
  }

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(crownRadius, ribRadius * 1.1, 8, 16),
    ribMaterial,
  );
  ring.name = 'crown-ring';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = crownY;
  ring.castShadow = true;
  ring.receiveShadow = true;
  g.add(ring);

  g.add(ribGroup);
  g.add(bayGroup);

  const socket = new THREE.Object3D();
  socket.name = 'crown-socket';
  socket.position.set(0, apexY, 0);
  g.add(socket);

  mergeGroupMeshesByMaterial(ribGroup);
  mergeGroupMeshesByMaterial(bayGroup);
  return g;
}

export interface LonghouseHideRoofOptions {
  /** Gable span (perpendicular to the ridge line), i.e. the building's own width. */
  width: number;
  /** Ridge length, i.e. the building's own depth/length along the ridge. */
  length: number;
  /** World Y of the wall top / eave line. */
  wallTopY: number;
  /** Additional height above `wallTopY` up to the ridge. */
  ridgeHeight: number;
  rafterCount?: number;
  /** How far rafter tails project past the eave/gable ends. Default 0.3. */
  overhang?: number;
  ribRadius?: number;
  sag?: number;
  seed: number;
  hideMaterial: THREE.Material;
  ribMaterial: THREE.Material;
}

/**
 * Builds a longhouse gable hide roof: two sloped hide panes meeting at a
 * ridge, with tapered-log rafters projecting past the eave on both
 * slopes (design spec: "rafter tails every 0.7-0.85 WU"), and a ridge
 * lash cap running the length of the roof. Origin is the building's own
 * local origin at ground level; the roof sits directly above `wallTopY`.
 */
export function buildLonghouseHideRoof(options: LonghouseHideRoofOptions): THREE.Group {
  const {
    width, length, wallTopY, ridgeHeight, rafterCount, overhang = 0.3,
    ribRadius = 0.06, sag = 0.04, seed, hideMaterial, ribMaterial,
  } = options;
  const g = new THREE.Group();
  g.name = 'longhouse-hide-roof';
  const rand = mulberry32(seed >>> 0);
  const count = rafterCount ?? Math.max(4, Math.round(length / 0.8) + 1);

  const halfW = width / 2;
  const halfL = length / 2;
  const ridgeY = wallTopY + ridgeHeight;
  const slopeLen = Math.hypot(halfW, ridgeHeight);

  const rafterGroup = new THREE.Group();
  rafterGroup.name = 'roof-rafters';

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = -halfL - overhang * 0.4 + t * (length + overhang * 0.8);
    for (const side of [-1, 1]) {
      const eaveX = side * (halfW + overhang);
      const ridgeX = 0;
      const rafter = buildTaperedLog({
        length: slopeLen + overhang,
        radiusBase: ribRadius * (0.9 + rand() * 0.2),
        radiusTop: ribRadius * 0.6,
        material: ribMaterial,
      });
      rafter.name = 'roof-rafter';
      rafter.position.set((eaveX + ridgeX) / 2, (wallTopY + ridgeY) / 2, z);
      const dir = new THREE.Vector3(ridgeX - eaveX, ridgeY - wallTopY, 0);
      rafter.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      rafterGroup.add(rafter);
    }
  }
  g.add(rafterGroup);

  // Two sloped hide panes, built as flat sagging skins then rotated onto
  // each roof slope (ribs = rafters already placed above).
  for (const side of [-1, 1]) {
    const pane = buildSaggingSkin(length + overhang * 1.6, slopeLen, count, sag, hideMaterial);
    pane.name = 'roof-hide-pane';
    const slopeAngle = Math.atan2(halfW, ridgeHeight); // angle from vertical
    pane.rotation.x = Math.PI / 2;
    pane.rotation.z = side > 0 ? -slopeAngle : slopeAngle;
    pane.rotation.y = Math.PI / 2;
    const midX = (side * (halfW + overhang)) / 2;
    const midY = (wallTopY + ridgeY) / 2;
    pane.position.set(midX, midY, 0);
    g.add(pane);
  }

  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, length + overhang * 1.4), ribMaterial);
  ridgeCap.name = 'ridge-cap';
  ridgeCap.position.set(0, ridgeY + 0.05, 0);
  ridgeCap.castShadow = true;
  ridgeCap.receiveShadow = true;
  g.add(ridgeCap);

  mergeGroupMeshesByMaterial(rafterGroup);
  return g;
}

export interface RibbedAwningOptions {
  width: number;
  depth: number;
  frontHeight: number;
  backHeight: number;
  ribCount?: number;
  ribRadius?: number;
  sag?: number;
  edgeThickness?: number;
  seed: number;
  hideMaterial: THREE.Material;
  ribMaterial: THREE.Material;
}

/**
 * Builds a single sloped stretched-hide awning over rib poles (design
 * spec: "red stretched-hide awning over rib poles, 4-6 panels, each panel
 * thickened at free edges and sagging between ribs" -- used for the
 * orcish shop's storefront canopy). `frontHeight`/`backHeight` let the
 * pane slope down toward the street (front lower than the wall-attached
 * back edge).
 */
export function buildRibbedAwning(options: RibbedAwningOptions): THREE.Group {
  const {
    width, depth, frontHeight, backHeight, ribCount = 4, ribRadius = 0.05,
    sag = 0.05, edgeThickness = 0.04, seed, hideMaterial, ribMaterial,
  } = options;
  const g = new THREE.Group();
  g.name = 'ribbed-awning';
  const rand = mulberry32(seed >>> 0);
  const halfW = width / 2;

  const ribGroup = new THREE.Group();
  ribGroup.name = 'awning-ribs';
  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
    const x = -halfW + t * width;
    const rib = buildTaperedLog({
      length: Math.hypot(depth, backHeight - frontHeight),
      radiusBase: ribRadius * (0.9 + rand() * 0.2),
      radiusTop: ribRadius * 0.6,
      material: ribMaterial,
    });
    rib.name = 'awning-rib';
    rib.position.set(x, (frontHeight + backHeight) / 2, depth / 2);
    const dir = new THREE.Vector3(0, backHeight - frontHeight, -depth);
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    ribGroup.add(rib);
  }
  g.add(ribGroup);

  const slopeLen = Math.hypot(depth, backHeight - frontHeight);
  const pane = buildSaggingSkin(width, slopeLen, ribCount, sag, hideMaterial);
  pane.name = 'awning-hide';
  const tiltAngle = Math.atan2(depth, backHeight - frontHeight);
  pane.rotation.x = Math.PI / 2 - tiltAngle;
  pane.position.set(0, (frontHeight + backHeight) / 2, depth / 2);
  g.add(pane);

  const frontEdge = new THREE.Mesh(new THREE.BoxGeometry(width + edgeThickness, edgeThickness, edgeThickness), ribMaterial);
  frontEdge.name = 'awning-edge-return';
  frontEdge.position.set(0, frontHeight, depth);
  frontEdge.castShadow = true;
  frontEdge.receiveShadow = true;
  g.add(frontEdge);

  mergeGroupMeshesByMaterial(ribGroup);
  return g;
}
