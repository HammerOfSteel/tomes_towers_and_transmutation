import * as THREE from 'three';

/**
 * LanternKit.ts — shared cemetery lantern module (doctrine Tier 3; undead's
 * lot dressing per the design spec calls for wrought-iron lanterns on
 * gallows brackets or wall brackets, a small warm emissive accent among the
 * cold stone — mirroring vampire's wall-sconce role but built from cage +
 * pane parts rather than a single glowing blob). The emissive pane is
 * always a minority child of a real iron cage (bars, cap, base), never a
 * standalone glowing primitive.
 */

export interface LanternCageOptions {
  radius?: number;
  height?: number;
  barCount?: number;
  material: THREE.Material;
  paneMaterial: THREE.Material;
  /** Whether the pane is lit (emissive) or a dark/broken glass. Default true. */
  lit?: boolean;
}

export function buildLanternCage(options: LanternCageOptions): THREE.Group {
  const radius = options.radius ?? 0.12;
  const height = options.height ?? 0.26;
  const barCount = Math.max(4, options.barCount ?? 6);
  const material = options.material;
  const lit = options.lit ?? true;

  const group = new THREE.Group();
  group.name = 'lantern-cage';

  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.1, radius * 1.2, height * 0.14, 12), material);
  base.name = 'lantern-base';
  base.position.y = height * 0.07;
  base.castShadow = base.receiveShadow = true;
  group.add(base);

  const pane = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, height * 0.72, 12), options.paneMaterial);
  pane.name = 'lantern-pane';
  pane.position.y = height * 0.5;
  pane.castShadow = pane.receiveShadow = true;
  group.add(pane);

  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, height * 0.78, radius * 0.16), material);
    bar.name = `lantern-bar-${i}`;
    bar.position.set(Math.cos(angle) * radius, height * 0.5, Math.sin(angle) * radius);
    bar.castShadow = bar.receiveShadow = true;
    group.add(bar);
  }

  const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.15, height * 0.3, 8), material);
  cap.name = 'lantern-cap';
  cap.position.y = height * 0.86 + height * 0.15;
  cap.castShadow = cap.receiveShadow = true;
  group.add(cap);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.3, radius * 0.05, 6, 10), material);
  ring.name = 'lantern-ring';
  ring.position.y = height * 0.86 + height * 0.3 + radius * 0.3;
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = ring.receiveShadow = true;
  group.add(ring);

  group.userData.lit = lit;
  return group;
}

export interface GallowsBracketOptions {
  /** Horizontal reach from the wall to the hung lantern. Default 0.5. */
  reach?: number;
  /** Height of the vertical wall post. Default 0.4. */
  postHeight?: number;
  material: THREE.Material;
  paneMaterial: THREE.Material;
  lit?: boolean;
}

export function buildGallowsBracket(options: GallowsBracketOptions): THREE.Group {
  const reach = options.reach ?? 0.5;
  const postHeight = options.postHeight ?? 0.4;
  const material = options.material;

  const group = new THREE.Group();
  group.name = 'gallows-bracket';

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, postHeight, 0.05), material);
  post.name = 'bracket-post';
  post.position.y = postHeight / 2;
  post.castShadow = post.receiveShadow = true;
  group.add(post);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(reach, 0.045, 0.045), material);
  arm.name = 'bracket-arm';
  arm.position.set(reach / 2, postHeight, 0);
  arm.castShadow = arm.receiveShadow = true;
  group.add(arm);

  const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(reach, postHeight * 0.5), 0.03, 0.03), material);
  brace.name = 'bracket-brace';
  brace.position.set(reach * 0.4, postHeight * 0.72, 0);
  brace.rotation.z = -Math.atan2(postHeight * 0.5, reach);
  brace.castShadow = brace.receiveShadow = true;
  group.add(brace);

  const cage = buildLanternCage({ material, paneMaterial: options.paneMaterial, lit: options.lit });
  cage.name = 'lantern-cage';
  cage.position.set(reach, postHeight - 0.14, 0);
  group.add(cage);

  return group;
}

export interface WallBracketOptions {
  material: THREE.Material;
  paneMaterial: THREE.Material;
  lit?: boolean;
  /** Reach from the wall face. Default 0.22. */
  reach?: number;
}

export function buildWallBracket(options: WallBracketOptions): THREE.Group {
  const reach = options.reach ?? 0.22;
  const material = options.material;

  const group = new THREE.Group();
  group.name = 'wall-bracket';

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), material);
  plate.name = 'bracket-plate';
  plate.position.z = 0.015;
  plate.castShadow = plate.receiveShadow = true;
  group.add(plate);

  const scroll = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, reach), material);
  scroll.name = 'bracket-scroll';
  scroll.position.z = reach / 2 + 0.03;
  scroll.castShadow = scroll.receiveShadow = true;
  group.add(scroll);

  const cage = buildLanternCage({ material, paneMaterial: options.paneMaterial, lit: options.lit, radius: 0.09, height: 0.2 });
  cage.position.z = reach + 0.05;
  group.add(cage);

  return group;
}
