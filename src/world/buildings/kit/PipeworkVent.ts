import * as THREE from 'three';

/**
 * PipeworkVent.ts — dwarven forge/workshop plumbing kit module: jointed
 * pipe runs (segments + elbows + mounting brackets), louvred vents with
 * genuinely angled slats, and banded storage tanks. Every "bare cylinder"
 * risk case (a lone unadorned pipe or tank) is always wrapped with at
 * least one bracket/band/cap/base sibling so nothing reads as a raw
 * placeholder primitive.
 */
export type PipeDirection = 'up' | 'down' | 'left' | 'right' | 'forward' | 'back';

export interface PipeSegmentSpec {
  dir: PipeDirection;
  length: number;
}

export interface PipeRunOptions {
  segments: PipeSegmentSpec[];
  radius?: number;
  material: THREE.Material;
  bracketEvery?: number;
  start?: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);

function dirVector(dir: PipeDirection): THREE.Vector3 {
  switch (dir) {
    case 'up': return new THREE.Vector3(0, 1, 0);
    case 'down': return new THREE.Vector3(0, -1, 0);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
    case 'forward': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
  }
}

export function buildPipeRun(options: PipeRunOptions): THREE.Group {
  const { segments, radius = 0.05, material, bracketEvery = 0.4, start = new THREE.Vector3(0, 0, 0) } = options;
  const group = new THREE.Group();
  group.name = 'pipe-run';
  let cursor = start.clone();
  let bracketIndex = 0;

  segments.forEach((seg, i) => {
    const dir = dirVector(seg.dir);
    const length = Math.max(0.02, seg.length);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
    mesh.name = `pipe-segment-${i}`;
    const mid = cursor.clone().add(dir.clone().multiplyScalar(length / 2));
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(UP, dir);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const bracketCount = Math.max(1, Math.floor(length / bracketEvery));
    for (let b = 0; b < bracketCount; b++) {
      const t = (b + 0.5) / bracketCount;
      const bracketPos = cursor.clone().add(dir.clone().multiplyScalar(length * t));
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 3.2, radius * 1.6, radius * 3.2),
        material,
      );
      bracket.name = `pipe-bracket-${bracketIndex++}`;
      bracket.position.copy(bracketPos);
      bracket.castShadow = true;
      bracket.receiveShadow = true;
      group.add(bracket);
    }

    cursor = cursor.add(dir.clone().multiplyScalar(length));

    if (i < segments.length - 1) {
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 10, 8), material);
      elbow.name = `pipe-elbow-${i}`;
      elbow.position.copy(cursor);
      elbow.castShadow = true;
      elbow.receiveShadow = true;
      group.add(elbow);
    }
  });

  return group;
}

export interface LouvredVentOptions {
  width: number;
  height: number;
  material: THREE.Material;
  frameMaterial?: THREE.Material;
  louvreCount?: number;
  frameDepth?: number;
  louvreAngleDeg?: number;
}

export function buildLouvredVent(options: LouvredVentOptions): THREE.Group {
  const {
    width,
    height,
    material,
    frameMaterial = material,
    frameDepth = 0.05,
    louvreAngleDeg = 30,
  } = options;
  const louvreCount = Math.max(3, options.louvreCount ?? Math.round(height / 0.12));

  const group = new THREE.Group();
  group.name = 'louvred-vent';

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, frameDepth), frameMaterial);
  frame.name = 'vent-frame';
  frame.position.z = -frameDepth / 2;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const spacing = height / louvreCount;
  const louvreThickness = Math.max(0.015, spacing * 0.18);
  for (let i = 0; i < louvreCount; i++) {
    const y = -height / 2 + spacing * (i + 0.5);
    const louvre = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, louvreThickness, spacing * 0.9),
      material,
    );
    louvre.name = `vent-louvre-${i}`;
    louvre.position.set(0, y, -frameDepth * 0.4);
    louvre.rotation.x = THREE.MathUtils.degToRad(louvreAngleDeg);
    louvre.castShadow = true;
    louvre.receiveShadow = true;
    group.add(louvre);
  }

  return group;
}

export interface StorageTankOptions {
  radius: number;
  height: number;
  material: THREE.Material;
  capMaterial?: THREE.Material;
  rivetBands?: number;
}

export function buildStorageTank(options: StorageTankOptions): THREE.Group {
  const { radius, height, material, capMaterial = material, rivetBands = 2 } = options;
  const group = new THREE.Group();
  group.name = 'storage-tank';

  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material);
  body.name = 'tank-body';
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.08, radius * 1.12, height * 0.08, 16),
    material,
  );
  base.name = 'tank-base';
  base.position.y = height * 0.04;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.02, height * 0.18, 16), capMaterial);
  cap.name = 'tank-cap';
  cap.position.y = height + height * 0.09;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  for (let i = 0; i < rivetBands; i++) {
    const bandY = height * ((i + 1) / (rivetBands + 1));
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, height * 0.05, 16),
      material,
    );
    band.name = `tank-rivet-band-${i}`;
    band.position.y = bandY;
    band.castShadow = true;
    band.receiveShadow = true;
    group.add(band);
  }

  return group;
}
