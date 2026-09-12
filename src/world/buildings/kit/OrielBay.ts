import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { finishArchitecturalGeometry } from './Bevels';
import { buildWindowOpening } from './OpeningParts';

/**
 * OrielBay.ts — shared kit module for a projecting bay window carried on
 * corbels (docs/superpowers/specs/2026-09-04-vampire-buildings-design.md's
 * "[SHARED KIT] OrielBay" requirement — the vampire villa/townhouse
 * signature upper-floor bay). A genuine three-face canted bay (left/front/
 * right), each with its own real five-piece window opening, sitting on a
 * corbel course and capped top and bottom -- never a single flat panel
 * glued to the wall.
 *
 * All custom geometry uses `THREE.BoxGeometry`/`THREE.ExtrudeGeometry`
 * (both always carry a `uv` attribute), so a bay never trips the
 * uv-attribute merge-drop bug class in `MeshMergeUtils.ts`.
 */
export interface OrielBayOptions {
  /** Width of the bay along the wall it projects from (the open/back edge). */
  width: number;
  /** Width of the projecting front face. Defaults to width * 0.62 (canted/splayed sides). */
  frontWidth?: number;
  /** How far the bay projects from the wall face. */
  projection: number;
  /** Vertical height of this bay storey. */
  height: number;
  wallMaterial: THREE.Material;
  roofMaterial: THREE.Material;
  corbelMaterial: THREE.Material;
  stoneMaterial: THREE.Material;
  glazingMaterial: THREE.Material;
  recessMaterial?: THREE.Material;
  wallThickness?: number;
  corbelCount?: number;
  seed?: number;
}

interface Point2 { x: number; z: number; }

interface FaceSpec {
  name: string;
  start: Point2;
  end: Point2;
}

function computeFootprint(width: number, frontWidth: number, projection: number): FaceSpec[] {
  const p0: Point2 = { x: -width / 2, z: 0 };
  const p1: Point2 = { x: -frontWidth / 2, z: projection };
  const p2: Point2 = { x: frontWidth / 2, z: projection };
  const p3: Point2 = { x: width / 2, z: 0 };
  return [
    { name: 'left', start: p0, end: p1 },
    { name: 'front', start: p1, end: p2 },
    { name: 'right', start: p2, end: p3 },
  ];
}

function faceTransform(face: FaceSpec, centroid: Point2): { length: number; angle: number; mid: Point2 } {
  const dx = face.end.x - face.start.x;
  const dz = face.end.z - face.start.z;
  const length = Math.hypot(dx, dz) || 1e-6;
  const mid: Point2 = { x: (face.start.x + face.end.x) / 2, z: (face.start.z + face.end.z) / 2 };

  // Candidate outward normal: the face direction rotated -90 degrees in the
  // XZ plane. Flip it if it happens to point back toward the footprint's own
  // centroid (i.e. inward) rather than away from it.
  let nx = dz;
  let nz = -dx;
  const nLen = Math.hypot(nx, nz) || 1e-6;
  nx /= nLen;
  nz /= nLen;
  const toMid = { x: mid.x - centroid.x, z: mid.z - centroid.z };
  if (nx * toMid.x + nz * toMid.z < 0) {
    nx = -nx;
    nz = -nz;
  }
  // For a Y-axis rotation `angle`, local +Z maps to (sin(angle), cos(angle))
  // in (x, z) -- solve for the angle whose local +Z is this outward normal.
  const angle = Math.atan2(nx, nz);
  return { length, angle, mid };
}

function buildFootprintShape(points: Point2[]): THREE.Shape {
  // ExtrudeGeometry builds in the shape's local XY plane and extrudes along
  // +Z; `buildCap()` then rotates that geometry so the extrusion axis
  // becomes world Y (thickness) and the shape plane becomes world XZ. Under
  // rotateX(-Math.PI / 2) the shape's Y axis maps to *negative* world Z, so
  // we pre-negate the footprint's z coordinate here to compensate and land
  // back on the true (unmirrored) footprint in world space.
  const shape = new THREE.Shape();
  shape.moveTo(points[0]!.x, -points[0]!.z);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]!.x, -points[i]!.z);
  shape.closePath();
  return shape;
}

function buildCap(points: Point2[], thickness: number, material: THREE.Material, name: string): THREE.Mesh {
  const shape = buildFootprintShape(points);
  const geometry = finishArchitecturalGeometry(new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  }));
  // ExtrudeGeometry builds in the XY plane and extrudes along +Z; rotate so
  // the shape's (x, z) plan lies flat and the extrusion runs along -Y (down)
  // for the floor cap or +Y is handled by the caller via mesh rotation/flip.
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function buildCorbel(width: number, material: THREE.Material, variant: 0 | 1): THREE.Group {
  const corbel = new THREE.Group();
  const stepCount = variant === 1 ? 3 : 2;
  const totalDepth = 0.22;
  const totalDrop = 0.16;
  for (let i = 0; i < stepCount; i++) {
    const t = i / (stepCount - 1 || 1);
    const stepWidth = width * (0.55 + 0.25 * t);
    const stepDepth = totalDepth * (0.5 + 0.5 * t);
    const stepHeight = totalDrop / stepCount;
    const box = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth), material);
    box.position.set(0, -totalDrop + stepHeight * (i + 0.5), stepDepth / 2 - 0.02);
    box.castShadow = box.receiveShadow = true;
    corbel.add(box);
  }
  return corbel;
}

export function buildOrielBay(options: OrielBayOptions): THREE.Group {
  const {
    width,
    frontWidth = width * 0.62,
    projection,
    height,
    wallMaterial,
    roofMaterial,
    corbelMaterial,
    stoneMaterial,
    glazingMaterial,
    recessMaterial,
    wallThickness = 0.16,
    corbelCount = Math.max(2, Math.round(width / 0.55)),
    seed = 0,
  } = options;

  const rng = mulberry32(seed >>> 0);
  const bay = new THREE.Group();
  bay.name = 'oriel-bay';

  const faces = computeFootprint(width, frontWidth, projection);
  const centroid: Point2 = { x: 0, z: projection / 2 };
  const capThickness = 0.07;

  const floorCap = buildCap([faces[0]!.start, faces[0]!.end, faces[1]!.end, faces[2]!.end], capThickness, roofMaterial, 'floor-cap');
  floorCap.position.y = -capThickness;
  bay.add(floorCap);

  const roofCap = buildCap([faces[0]!.start, faces[0]!.end, faces[1]!.end, faces[2]!.end], capThickness, roofMaterial, 'roof-cap');
  roofCap.position.y = height;
  bay.add(roofCap);

  // Small cresting lip on the roof cap so the bay's top reads as a real
  // capped roof rather than a bare flat slab (doctrine Rule 5: silhouette).
  const cresting = new THREE.Mesh(new THREE.BoxGeometry(frontWidth * 0.5, 0.1, projection * 0.5), roofMaterial);
  cresting.position.set(0, height + capThickness + 0.05, projection * 0.55);
  cresting.castShadow = cresting.receiveShadow = true;
  bay.add(cresting);

  for (const face of faces) {
    const { length, angle, mid } = faceTransform(face, centroid);
    const faceGroup = new THREE.Group();
    faceGroup.name = `wall-${face.name}`;
    faceGroup.position.set(mid.x, 0, mid.z);
    faceGroup.rotation.y = angle;

    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, wallThickness), wallMaterial);
    wallMesh.position.y = height / 2;
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    faceGroup.add(wallMesh);

    const winWidth = length * 0.58;
    const opening = buildWindowOpening({
      width: winWidth,
      straightHeight: height * 0.42,
      pointHeight: winWidth * 0.7,
      recessDepth: 0.12,
      frameWidth: winWidth * 0.16,
      frameProud: 0.05,
      wallZ: wallThickness / 2,
      stoneMaterial,
      glazingMaterial,
      recessMaterial,
      openingShape: 'arch',
    });
    opening.position.y = height * 0.5;
    faceGroup.add(opening);

    bay.add(faceGroup);
  }

  const corbelSpacing = width / (corbelCount + 1);
  for (let i = 0; i < corbelCount; i++) {
    const variant = rng() > 0.5 ? 1 : 0;
    const corbel = buildCorbel(Math.min(0.34, corbelSpacing * 0.7), corbelMaterial, variant as 0 | 1);
    corbel.name = `corbel-${i}`;
    corbel.position.set(-width / 2 + corbelSpacing * (i + 1), 0, 0.05);
    bay.add(corbel);
  }

  return bay;
}
