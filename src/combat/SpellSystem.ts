import * as THREE from 'three';
import type { Damageable } from './Health';

// ── Constants ─────────────────────────────────────────────────────────────

const PROJECTILE_SPEED = 14;
const PROJECTILE_RADIUS = 0.18;
const PROJECTILE_DAMAGE = 3;
const PROJECTILE_LIFETIME = 3.0;
const PROJECTILE_COLOR = 0x44ddff;
const PROJECTILE_EMISSIVE = 0x0088bb;

// ── Projectile ────────────────────────────────────────────────────────────

/** A single fired projectile.  Add `proj.mesh` to the scene. */
class Projectile {
  readonly mesh: THREE.Mesh;
  private timer = PROJECTILE_LIFETIME;
  private hit = false;

  constructor(
    private readonly pos: THREE.Vector3,
    private readonly dir: THREE.Vector3,
    private readonly targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    private readonly onHit?: (target: Damageable, damage: number) => void,
  ) {
    this.mesh = Projectile.buildMesh();
    this.mesh.position.copy(pos);
  }

  get expired(): boolean {
    return this.timer <= 0 || this.hit;
  }

  update(dt: number): void {
    if (this.expired) return;

    this.timer -= dt;

    // Move
    this.pos.addScaledVector(this.dir, PROJECTILE_SPEED * dt);
    this.mesh.position.copy(this.pos);

    // Pulse emissive
    const pulse = 0.6 + 0.4 * Math.sin(this.timer * 20);
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

    // Hit test against each target
    for (const target of this.targets) {
      if (target.isDead || !target.worldPosition) continue;
      const dist = this.pos.distanceTo(target.worldPosition);
      if (dist < PROJECTILE_RADIUS + 0.45 /* enemy radius */) {
        const applied = target.takeDamage(PROJECTILE_DAMAGE);
        if (applied > 0) this.onHit?.(target, applied);
        this.hit = true;
        return;
      }
    }
  }

  private static buildMesh(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: PROJECTILE_COLOR,
      emissive: new THREE.Color(PROJECTILE_EMISSIVE),
      emissiveIntensity: 1.0,
      roughness: 0.2,
      metalness: 0.0,
    });
    return new THREE.Mesh(geo, mat);
  }
}

// ── SpellSystem ───────────────────────────────────────────────────────────

/** Manages active projectiles.
 *
 *  Call `fire(...)` on mouse click, `update(dt, scene)` each frame. */
export class SpellSystem {
  private readonly projectiles: Projectile[] = [];

  /** Fire a projectile from `origin` aimed at the mouse world position. */
  fire(
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    scene: THREE.Scene,
    onHit?: (target: Damageable, damage: number) => void,
  ): void {
    const dir = new THREE.Vector3()
      .subVectors(aimTarget, origin)
      .setY(0)
      .normalize();

    const spawnPos = origin.clone().addScaledVector(dir, 0.6); // slight offset ahead
    spawnPos.y = origin.y + 0.5; // chest height

    const proj = new Projectile(spawnPos, dir, targets, onHit);
    scene.add(proj.mesh);
    this.projectiles.push(proj);
  }

  update(dt: number, scene: THREE.Scene): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(dt);
      if (proj.expired) {
        scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        (proj.mesh.material as THREE.MeshStandardMaterial).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
