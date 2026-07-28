/**
 * GladeEntranceBuilder.ts — 02-game-world-integration (CG-2)
 *
 * Procedural glade entrance prop builder — a mossy stone arch with a
 * fairy-ring of mushrooms and a soft light shaft, plus a lightweight
 * ambient particle system (fireflies / floating spores). Same
 * flat-primitive, no-texture-GLB style as `CaveEntranceBuilder.ts`.
 *
 * Unlike cave/dungeon entrances, glades have no biome/faction variant in
 * the spec (CG-2 is a single fixed look) — `buildGladeEntrance()` takes no
 * parameters.
 */

import * as THREE from 'three';

/** World-unit radius for the "[E] Enter Glade" interaction trigger. */
export const GLADE_ENTRANCE_TRIGGER_RADIUS = 2;

/** Number of mushrooms in the fairy ring. */
export const GLADE_MUSHROOM_COUNT = 8;

/** Number of ambient particles (fireflies / floating spores). */
export const GLADE_PARTICLE_COUNT = 24;

export interface BuiltGladeEntrance {
  /** Three.js root group — add to scene with `scene.add(entrance.root)`. */
  root: THREE.Group;
  /** Ambient particle system — animate by calling `update(deltaSeconds)` each frame. */
  particles: THREE.Points;
  /** Advance the particle drift animation. */
  update(deltaSeconds: number): void;
  /** Release GPU resources. */
  dispose(): void;
}

/**
 * CG-2 — build the glade entrance prop: two mossy stone pillars, a ring of
 * `GLADE_MUSHROOM_COUNT` mushrooms around the opening, a translucent light
 * shaft, and a drifting particle system for ambience. Deterministic (fixed
 * geometry) aside from THREE.js object allocation.
 */
export function buildGladeEntrance(): BuiltGladeEntrance {
  const root = new THREE.Group();

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const mossyStoneMat = new THREE.MeshStandardMaterial({ color: '#7a8868', roughness: 0.95 });
  materials.push(mossyStoneMat);
  const mushroomCapMat = new THREE.MeshStandardMaterial({ color: '#d84870', roughness: 0.6 });
  materials.push(mushroomCapMat);
  const mushroomStemMat = new THREE.MeshStandardMaterial({ color: '#f0e8d0', roughness: 0.8 });
  materials.push(mushroomStemMat);
  const lightShaftMat = new THREE.MeshBasicMaterial({
    color: '#fff8d0', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false,
  });
  materials.push(lightShaftMat);

  // Two mossy stone pillars framing the opening.
  const pillarGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.4, 8);
  const left = new THREE.Mesh(pillarGeo, mossyStoneMat);
  geometries.push(left.geometry);
  left.position.set(-1.1, 1.2, 0);
  const right = new THREE.Mesh(pillarGeo.clone(), mossyStoneMat);
  geometries.push(right.geometry);
  right.position.set(1.1, 1.2, 0);
  pillarGeo.dispose();

  // Fairy-ring mushrooms around a central point in front of the pillars.
  const mushrooms: THREE.Group[] = [];
  const ringRadius = 1.6;
  for (let i = 0; i < GLADE_MUSHROOM_COUNT; i++) {
    const angle = (i / GLADE_MUSHROOM_COUNT) * Math.PI * 2;
    const mushroom = new THREE.Group();
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6);
    const stem = new THREE.Mesh(stemGeo, mushroomStemMat);
    geometries.push(stem.geometry);
    stem.position.y = 0.125;
    const capGeo = new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, mushroomCapMat);
    geometries.push(cap.geometry);
    cap.position.y = 0.25;
    mushroom.add(stem, cap);
    mushroom.position.set(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius + 1.5);
    mushrooms.push(mushroom);
  }

  // Soft vertical light shaft through the opening.
  const shaftGeo = new THREE.CylinderGeometry(0.9, 0.5, 3, 12, 1, true);
  const shaft = new THREE.Mesh(shaftGeo, lightShaftMat);
  geometries.push(shaft.geometry);
  shaft.position.set(0, 1.5, 0);

  root.add(left, right, shaft, ...mushrooms);

  // Ambient drifting particles (fireflies / floating spores).
  const positions = new Float32Array(GLADE_PARTICLE_COUNT * 3);
  const speeds = new Float32Array(GLADE_PARTICLE_COUNT);
  for (let i = 0; i < GLADE_PARTICLE_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 1] = Math.random() * 2.4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3;
    speeds[i] = 0.1 + Math.random() * 0.2;
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometries.push(particleGeo);
  const particleMat = new THREE.PointsMaterial({
    color: '#fff2b0', size: 0.05, transparent: true, opacity: 0.85, depthWrite: false,
  });
  materials.push(particleMat);
  const particles = new THREE.Points(particleGeo, particleMat);
  root.add(particles);

  const update = (deltaSeconds: number): void => {
    const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < GLADE_PARTICLE_COUNT; i++) {
      const y = posAttr.getY(i) + speeds[i]! * deltaSeconds;
      posAttr.setY(i, y > 2.4 ? 0 : y);
    }
    posAttr.needsUpdate = true;
  };

  return {
    root,
    particles,
    update,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** CG-2 — is a world-space (x, z) position within the glade entrance's interaction trigger radius? */
export function isNearGladeEntrance(
  position: { x: number; z: number },
  entrancePosition: { x: number; z: number },
  radius: number = GLADE_ENTRANCE_TRIGGER_RADIUS,
): boolean {
  return Math.hypot(position.x - entrancePosition.x, position.z - entrancePosition.z) <= radius;
}
