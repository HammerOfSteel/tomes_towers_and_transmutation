import * as THREE from 'three';
import { mulberry32 } from '../../../core/prng';
import { depthFor } from './DepthLadder';

/**
 * CorbelledChimneyStack.ts — dwarven roofline kit module. A rectangular,
 * corbel-coursed chimney stack (never a bare cylinder/box primitive): a
 * flared base, several slightly-jittered corbelled courses, one or two
 * metal collar bands, a flared cap, and a genuinely recessed flue mouth on
 * one face. All geometry uses stock `THREE.BoxGeometry` so every mesh in a
 * shared-material merge bucket carries UVs (see `MeshMergeUtils.ts`).
 */
export type ChimneyFlueOrientation = 'north' | 'south' | 'east' | 'west';

export interface CorbelledChimneyStackOptions {
  width?: number;
  depth?: number;
  height: number;
  courseCount?: number;
  material: THREE.Material;
  collarMaterial?: THREE.Material;
  capMaterial?: THREE.Material;
  flueMaterial?: THREE.Material;
  seed?: number;
  collarBands?: number;
  flueOrientation?: ChimneyFlueOrientation;
}

function orientationNormal(orientation: ChimneyFlueOrientation): [number, number] {
  switch (orientation) {
    case 'north': return [0, -1];
    case 'south': return [0, 1];
    case 'east': return [1, 0];
    case 'west': return [-1, 0];
  }
}

export function buildCorbelledChimneyStack(options: CorbelledChimneyStackOptions): THREE.Group {
  const {
    width = 0.7,
    depth = 0.85,
    height,
    courseCount = 6,
    material,
    collarMaterial = material,
    capMaterial = material,
    flueMaterial = material,
    seed = 0,
    collarBands = 2,
    flueOrientation = 'north',
  } = options;

  const group = new THREE.Group();
  group.name = 'corbelled-chimney-stack';
  const rand = mulberry32((seed ^ 0x4348_494d) >>> 0);

  const baseHeight = Math.max(0.12, height * 0.14);
  const capHeight = Math.max(0.14, height * 0.12);
  const courseTotalHeight = Math.max(0.1, height - baseHeight - capHeight);
  const courseHeight = courseTotalHeight / courseCount;

  // Flared base — slightly wider than the shaft, sits proud of the roof plane.
  const baseW = width * 1.22;
  const baseD = depth * 1.22;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseHeight, baseD), material);
  base.name = 'chimney-base';
  base.position.y = baseHeight / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  let y = baseHeight;
  for (let i = 0; i < courseCount; i++) {
    // Small alternating corbel jitter — genuine relief, not scale-only.
    const jitter = 1 + (rand() - 0.5) * 0.06;
    const w = width * jitter;
    const d = depth * jitter;
    const course = new THREE.Mesh(new THREE.BoxGeometry(w, courseHeight, d), material);
    course.name = `chimney-course-${i}`;
    course.position.y = y + courseHeight / 2;
    course.castShadow = true;
    course.receiveShadow = true;
    group.add(course);
    y += courseHeight;
  }

  for (let i = 0; i < collarBands; i++) {
    const bandHeight = Math.max(0.05, courseHeight * 0.4);
    const bandY = baseHeight + courseTotalHeight * ((i + 1) / (collarBands + 1));
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.08, bandHeight, depth * 1.08),
      collarMaterial,
    );
    collar.name = `chimney-collar-${i}`;
    collar.position.y = bandY;
    collar.castShadow = true;
    collar.receiveShadow = true;
    group.add(collar);
  }

  const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 1.35, capHeight, depth * 1.35), capMaterial);
  cap.name = 'chimney-cap';
  cap.position.y = y + capHeight / 2;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const [nx, nz] = orientationNormal(flueOrientation);
  const flueRecess = Math.abs(depthFor('RECESS'));
  const flueW = width * 0.55;
  const flueH = courseHeight * 1.6;
  const flueD = 0.05;
  const flue = new THREE.Mesh(new THREE.BoxGeometry(flueW, flueH, flueD), flueMaterial);
  flue.name = 'chimney-flue';
  const faceOffsetX = nx * (width / 2 - flueRecess);
  const faceOffsetZ = nz * (depth / 2 - flueRecess);
  flue.position.set(faceOffsetX, baseHeight + courseHeight * 1.1, faceOffsetZ);
  flue.castShadow = false;
  flue.receiveShadow = true;
  group.add(flue);

  return group;
}
