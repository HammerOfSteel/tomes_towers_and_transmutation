/**
 * PickupVFX — world-space scale-pop + glow ring when an item is picked up.
 *
 * Usage (from wherever items are collected):
 *   import { spawnPickupVFX } from '@/ui/PickupVFX';
 *   spawnPickupVFX(scene, itemWorldPosition);
 */

import * as THREE from 'three';

/** Spawn a brief pop/glow animation at `pos`, then self-remove. */
export function spawnPickupVFX(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  color = 0xffd966,
): void {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.position.y += 0.5;

  // Core burst sphere
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
  );
  group.add(burst);

  // Expanding ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.025, 6, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Point light flash
  const light = new THREE.PointLight(color, 1.5, 4);
  group.add(light);

  scene.add(group);

  // Animation: 0–120ms expand, 120–300ms fade out
  const start = performance.now();
  const EXPAND = 120;
  const TOTAL  = 300;

  const mat  = burst.material as THREE.MeshBasicMaterial;
  const rMat = ring.material  as THREE.MeshBasicMaterial;

  function tick() {
    const age = performance.now() - start;
    const t   = Math.min(1, age / TOTAL);

    if (age < EXPAND) {
      // Scale up: 0 → 1.8 on burst, 0 → 2.5 on ring
      const e = age / EXPAND;
      burst.scale.setScalar(1.8 * e);
      ring.scale.setScalar(2.5 * e);
    } else {
      // Fade out
      const f = 1 - (age - EXPAND) / (TOTAL - EXPAND);
      mat.opacity  = f;
      rMat.opacity = f * 0.7;
      light.intensity = f * 1.5;
    }

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      scene.remove(group);
    }
  }

  requestAnimationFrame(tick);
}
