import * as THREE from 'three';

/**
 * AngularOrnament.ts — dwarven ornament kit module (doctrine Tier 3: the
 * "angular chevron variant" the doctrine's interlace table describes for
 * dwarven use — `Interlace.ts` only ships `straight`/`gableVerge` flowing
 * variants today, so this module supplies the angular/geometric family
 * directly). Every shape here is a real extruded/boxed volume with depth
 * relief; nothing is a flat decal or texture swap.
 */
export interface ChevronBeltOptions {
  width: number;
  height?: number;
  segments?: number;
  material: THREE.Material;
  depth?: number;
}

export function buildChevronBelt(options: ChevronBeltOptions): THREE.Group {
  const {
    width,
    height = 0.22,
    segments = Math.max(4, Math.round(width / 0.4)),
    material,
    depth = 0.06,
  } = options;

  const group = new THREE.Group();
  group.name = 'chevron-belt';
  const segWidth = width / segments;
  const halfWidth = width / 2;

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(segWidth / 2, height);
  shape.lineTo(segWidth, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });

  for (let i = 0; i < segments; i++) {
    const mesh = new THREE.Mesh(geometry.clone(), material);
    mesh.name = `chevron-segment-${i}`;
    // Alternate proud/recessed so the belt reads as real zigzag relief
    // rather than a coplanar decorative texture.
    const proud = i % 2 === 0;
    mesh.position.set(-halfWidth + i * segWidth, 0, proud ? 0 : -depth * 0.6);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

export interface XLatticePanelOptions {
  width: number;
  height: number;
  material: THREE.Material;
  strandThickness?: number;
  strandDepth?: number;
}

export function buildXLatticePanel(options: XLatticePanelOptions): THREE.Group {
  const { width, height, material, strandThickness = 0.06, strandDepth = 0.05 } = options;
  const group = new THREE.Group();
  group.name = 'x-lattice-panel';
  const length = Math.hypot(width, height);
  const angle = Math.atan2(height, width);

  const strandA = new THREE.Mesh(new THREE.BoxGeometry(length, strandThickness, strandDepth), material);
  strandA.name = 'strand-a';
  strandA.rotation.z = angle;
  strandA.position.z = strandDepth * 0.3;
  strandA.castShadow = true;
  strandA.receiveShadow = true;

  const strandB = new THREE.Mesh(new THREE.BoxGeometry(length, strandThickness, strandDepth), material);
  strandB.name = 'strand-b';
  strandB.rotation.z = -angle;
  strandB.position.z = -strandDepth * 0.3;
  strandB.castShadow = true;
  strandB.receiveShadow = true;

  group.add(strandA, strandB);
  return group;
}

export interface ShieldPlaqueOptions {
  width: number;
  height: number;
  material: THREE.Material;
  depth?: number;
  motif?: 'hammer' | 'anvil' | 'plain';
}

export function buildShieldPlaque(options: ShieldPlaqueOptions): THREE.Group {
  const { width, height, material, depth = 0.08, motif = 'plain' } = options;
  const group = new THREE.Group();
  group.name = 'shield-plaque';
  const halfW = width / 2;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, height * 0.55);
  shape.lineTo(halfW, height * 0.55);
  shape.lineTo(halfW, 0);
  shape.quadraticCurveTo(halfW, -height * 0.35, 0, -height * 0.5);
  shape.quadraticCurveTo(-halfW, -height * 0.35, -halfW, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: Math.min(width, height) * 0.05,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geometry.translate(0, height * 0.25, 0);

  const body = new THREE.Mesh(geometry, material);
  body.name = 'plaque-body';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (motif !== 'plain') {
    const bossSize = Math.min(width, height) * 0.28;
    const boss = new THREE.Mesh(new THREE.BoxGeometry(bossSize, bossSize, depth * 0.6), material);
    boss.name = 'plaque-motif';
    boss.position.set(0, height * 0.05, depth + depth * 0.3);
    boss.rotation.z = motif === 'hammer' ? Math.PI / 4 : 0;
    boss.castShadow = true;
    boss.receiveShadow = true;
    group.add(boss);
  }

  return group;
}

export interface CorbelRowOptions {
  count: number;
  spacing: number;
  material: THREE.Material;
  blockWidth?: number;
  blockHeight?: number;
  blockDepth?: number;
}

export function buildCorbelRow(options: CorbelRowOptions): THREE.Group {
  const { count, spacing, material, blockWidth = 0.18, blockHeight = 0.14, blockDepth = 0.16 } = options;
  const group = new THREE.Group();
  group.name = 'corbel-row';
  const totalWidth = spacing * Math.max(0, count - 1);

  for (let i = 0; i < count; i++) {
    const corbel = new THREE.Group();
    corbel.name = `corbel-${i}`;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, blockHeight * 0.5, blockDepth), material);
    lower.position.y = blockHeight * 0.25;
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(blockWidth * 0.7, blockHeight * 0.5, blockDepth * 0.7),
      material,
    );
    upper.position.set(0, blockHeight * 0.75, blockDepth * 0.15);
    lower.castShadow = true;
    lower.receiveShadow = true;
    upper.castShadow = true;
    upper.receiveShadow = true;
    corbel.add(lower, upper);
    corbel.position.x = -totalWidth / 2 + i * spacing;
    group.add(corbel);
  }

  return group;
}
