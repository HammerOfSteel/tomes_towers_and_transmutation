import * as THREE from 'three';

/**
 * MetalBanding.ts — dwarven ironwork kit module: reusable metal strap
 * bands (chimney collars, roof ridge bands, barrel hoops), bolted plates,
 * and standalone strap sets for shutters/hatches (door leaves already get
 * their own straps from `OpeningParts.ts`'s `buildDoorOpening`; this is for
 * every *other* place strap ironwork is needed). All boxes, so every mesh
 * carries UVs for safe merging.
 */
export interface MetalBandOptions {
  width: number;
  depth: number;
  material: THREE.Material;
  thickness?: number;
  bandHeight?: number;
}

export function buildMetalBand(options: MetalBandOptions): THREE.Group {
  const { width, depth, material, thickness = 0.03, bandHeight = 0.08 } = options;
  const group = new THREE.Group();
  group.name = 'metal-band';

  const front = new THREE.Mesh(new THREE.BoxGeometry(width + thickness * 2, bandHeight, thickness), material);
  front.name = 'band-front';
  front.position.z = depth / 2;

  const back = front.clone();
  back.name = 'band-back';
  back.position.z = -depth / 2;

  const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, bandHeight, depth + thickness * 2), material);
  left.name = 'band-left';
  left.position.x = -width / 2;

  const right = left.clone();
  right.name = 'band-right';
  right.position.x = width / 2;

  for (const mesh of [front, back, left, right]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  group.add(front, back, left, right);
  return group;
}

export interface BoltPlateOptions {
  width: number;
  height: number;
  material: THREE.Material;
  plateDepth?: number;
  boltCount?: number;
}

export function buildBoltPlate(options: BoltPlateOptions): THREE.Group {
  const { width, height, material, plateDepth = 0.02, boltCount = 4 } = options;
  const group = new THREE.Group();
  group.name = 'bolt-plate';

  const plate = new THREE.Mesh(new THREE.BoxGeometry(width, height, plateDepth), material);
  plate.name = 'plate-body';
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  const clampedCount = Math.min(4, Math.max(2, boltCount));
  const boltSize = Math.min(width, height) * 0.16;
  const margin = boltSize * 1.2;
  const positions: Array<[number, number]> =
    clampedCount <= 2
      ? [
          [-width / 2 + margin, 0],
          [width / 2 - margin, 0],
        ]
      : [
          [-width / 2 + margin, height / 2 - margin],
          [width / 2 - margin, height / 2 - margin],
          [-width / 2 + margin, -height / 2 + margin],
          [width / 2 - margin, -height / 2 + margin],
        ];

  for (let i = 0; i < clampedCount; i++) {
    const [x, y] = positions[i]!;
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(boltSize, boltSize, plateDepth * 2.4), material);
    bolt.name = `bolt-${i}`;
    bolt.position.set(x, y, plateDepth * 1.6);
    bolt.castShadow = true;
    bolt.receiveShadow = true;
    group.add(bolt);
  }

  return group;
}

export interface StrapSetOptions {
  leafWidth: number;
  leafHeight: number;
  material: THREE.Material;
  strapCount?: number;
  strapThickness?: number;
  strapProud?: number;
}

export function buildStrapSet(options: StrapSetOptions): THREE.Group {
  const { leafWidth, leafHeight, material, strapThickness = 0.035, strapProud = 0.018 } = options;
  const group = new THREE.Group();
  group.name = 'strap-set';

  const strapCount = Math.min(5, Math.max(3, options.strapCount ?? Math.round(leafHeight / 0.55)));
  for (let i = 0; i < strapCount; i++) {
    const t = strapCount === 1 ? 0.5 : i / (strapCount - 1);
    const y = -leafHeight / 2 + t * leafHeight;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(leafWidth * 0.94, strapThickness, strapProud * 2), material);
    strap.name = `strap-${i}`;
    strap.position.set(0, y, strapProud);
    strap.castShadow = true;
    strap.receiveShadow = true;
    group.add(strap);
  }

  return group;
}
