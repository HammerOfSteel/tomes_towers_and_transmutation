import * as THREE from 'three';

/**
 * Pediment.ts — shared classical pediment/gable-cap module (doctrine Tier 3;
 * first required by undead: mausoleum and chapel-shrine fronts in
 * `2026-09-04-undead-buildings-design.md` top out in a triangular or
 * segmental pediment, sometimes deliberately broken/collapsed to read as a
 * "retained ruin"). Every variant produces a real cornice band (proud of
 * the wall) plus a tympanum panel behind it (recessed, at wall depth or
 * slightly behind) — never a single coplanar triangle.
 */

export type PedimentVariant = 'triangular' | 'segmental' | 'broken' | 'gabled-slab';

export interface PedimentOptions {
  width: number;
  variant: PedimentVariant;
  /** Rise of the pediment above its base (apex height for triangular/gabled-slab). Default width*0.28. */
  rise?: number;
  cornice?: {
    /** Proud depth of the raking cornice band. Default 0.09. */
    proud?: number;
    /** Cornice band thickness. Default 0.1. */
    thickness?: number;
  };
  tympanumDepth?: number;
  material: THREE.Material;
  tympanumMaterial?: THREE.Material;
  /** Adds a circular medallion socket on the tympanum face. Default false. */
  medallion?: boolean;
  medallionMaterial?: THREE.Material;
}

function buildCorniceBar(length: number, thickness: number, proud: number, angle: number, material: THREE.Material, name: string): THREE.Mesh {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(length, thickness, proud), material);
  bar.name = name;
  bar.rotation.z = angle;
  bar.position.z = proud / 2;
  bar.castShadow = bar.receiveShadow = true;
  return bar;
}

function buildTympanum(shape: THREE.Shape, depth: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'tympanum';
  mesh.position.z = -depth;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function addMedallion(group: THREE.Group, radius: number, material: THREE.Material): void {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 16), material);
  disc.name = 'medallion';
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 0.06;
  disc.castShadow = disc.receiveShadow = true;
  group.add(disc);
}

export function buildPediment(options: PedimentOptions): THREE.Group {
  const width = Math.max(options.width, 0.1);
  const rise = options.rise ?? width * 0.28;
  const thickness = options.cornice?.thickness ?? 0.1;
  const proud = options.cornice?.proud ?? 0.09;
  const tympanumDepth = options.tympanumDepth ?? 0.04;
  const material = options.material;
  const tympanumMaterial = options.tympanumMaterial ?? material;
  const halfW = width / 2;

  const group = new THREE.Group();
  group.name = `pediment-${options.variant}`;
  group.userData.pedimentVariant = options.variant;

  if (options.variant === 'triangular' || options.variant === 'gabled-slab') {
    const raking = Math.hypot(halfW, rise);
    const angle = Math.atan2(rise, halfW);
    const left = buildCorniceBar(raking, thickness, proud, Math.PI / 2 - angle, material, 'cornice-left');
    left.position.x = -halfW / 2;
    left.position.y = rise / 2;
    const right = buildCorniceBar(raking, thickness, proud, -(Math.PI / 2 - angle), material, 'cornice-right');
    right.position.x = halfW / 2;
    right.position.y = rise / 2;
    const base = buildCorniceBar(width, thickness, proud, 0, material, 'cornice-base');
    base.position.y = 0;
    group.add(left, right, base);

    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(0, rise);
    shape.lineTo(halfW, 0);
    shape.closePath();
    group.add(buildTympanum(shape, tympanumDepth, tympanumMaterial));

    if (options.variant === 'gabled-slab') {
      // A single slab-like cap sitting proud of the tympanum, reading as a
      // heavy funerary lid rather than a light architectural gable.
      const slab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, rise * 0.18, proud * 1.6), material);
      slab.name = 'slab-cap';
      slab.position.set(0, rise * 0.55, proud * 0.8);
      slab.castShadow = slab.receiveShadow = true;
      group.add(slab);
    }
  } else if (options.variant === 'segmental') {
    const radius = (halfW * halfW + rise * rise) / (2 * rise);
    const archAngle = Math.asin(halfW / radius);
    const arcSegments = 12;
    const barLen = (2 * radius * Math.sin(archAngle / arcSegments)) * 1.05;
    for (let i = 0; i < arcSegments; i++) {
      const t0 = -archAngle + (i / arcSegments) * (2 * archAngle);
      const t1 = -archAngle + ((i + 1) / arcSegments) * (2 * archAngle);
      const mid = (t0 + t1) / 2;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(barLen, thickness, proud), material);
      seg.name = `cornice-arc-${i}`;
      seg.position.set(radius * Math.sin(mid), rise - radius * Math.cos(mid) + radius * Math.cos(archAngle), proud / 2);
      seg.rotation.z = mid;
      seg.castShadow = seg.receiveShadow = true;
      group.add(seg);
    }
    const base = buildCorniceBar(width, thickness, proud, 0, material, 'cornice-base');
    group.add(base);

    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.absarc(0, rise - radius + radius * Math.cos(archAngle), radius, Math.PI - (Math.PI / 2 - archAngle), Math.PI / 2 - archAngle, true);
    shape.lineTo(halfW, 0);
    shape.closePath();
    group.add(buildTympanum(shape, tympanumDepth, tympanumMaterial));
  } else {
    // 'broken': a classical pediment whose apex has collapsed, leaving the
    // two raking cornices standing but not meeting — real fractured
    // geometry (gap at the top), not a texture trick. The base survives
    // intact (per doctrine's "retained ruin" language: structure below
    // remains legible even where the crown has failed).
    const raking = Math.hypot(halfW, rise);
    const angle = Math.atan2(rise, halfW);
    const gapFraction = 0.32;
    const survivingFraction = 1 - gapFraction;
    const left = buildCorniceBar(raking * survivingFraction, thickness, proud, Math.PI / 2 - angle, material, 'cornice-left');
    left.position.x = -halfW + (halfW * survivingFraction) / 2;
    left.position.y = (rise * survivingFraction) / 2;
    const right = buildCorniceBar(raking * survivingFraction, thickness, proud, -(Math.PI / 2 - angle), material, 'cornice-right');
    right.position.x = halfW - (halfW * survivingFraction) / 2;
    right.position.y = (rise * survivingFraction) / 2;
    const base = buildCorniceBar(width, thickness, proud, 0, material, 'cornice-base');
    group.add(left, right, base);

    // Fallen fragment resting at the base — debris that reads as "this used
    // to be up there", not a deleted face.
    const fragment = new THREE.Mesh(new THREE.BoxGeometry(width * 0.22, thickness * 1.4, proud * 1.3), material);
    fragment.name = 'fallen-fragment';
    fragment.position.set(width * 0.12, thickness * 0.7, proud * 0.9);
    fragment.rotation.z = 0.35;
    fragment.castShadow = fragment.receiveShadow = true;
    group.add(fragment);

    const shape = new THREE.Shape();
    shape.moveTo(-halfW, 0);
    shape.lineTo(-halfW * gapFraction * 0.5, rise * survivingFraction);
    shape.lineTo(halfW * gapFraction * 0.5, rise * survivingFraction);
    shape.lineTo(halfW, 0);
    shape.closePath();
    group.add(buildTympanum(shape, tympanumDepth, tympanumMaterial));
  }

  if (options.medallion && options.variant !== 'broken') {
    addMedallion(group, Math.min(width, rise) * 0.14, options.medallionMaterial ?? material);
  }

  return group;
}
