import * as THREE from 'three';
import type { Damageable } from './Health';

// ── Constants ─────────────────────────────────────────────────────────────

/** Full arc angle of the melee sweep (radians). */
const SWEEP_ANGLE = Math.PI * 0.7; // ~126°
/** Reach of the melee hit in world units. */
const SWEEP_RADIUS = 1.4;
/** Half-height of the hit cylinder (checks enemies at any height near player). */
const SWEEP_HEIGHT = 1.0;
/** How long the visual arc lingers (seconds). */
const SWEEP_LIFETIME = 0.18;
/** Base melee damage. */
const MELEE_DAMAGE = 2;

// Visual colours
const ARC_COLOR = 0x88ddff;

// ── MeleeArc ──────────────────────────────────────────────────────────────

/** Short-lived sweep arc that checks for Damageable targets in its sector.
 *
 *  Add `arc.mesh` to the scene.  Call `arc.update(dt)` each frame.
 *  When `arc.expired` is true, remove `arc.mesh` from the scene and discard.
 */
export class MeleeArc {
  readonly mesh: THREE.Mesh;
  private timer = SWEEP_LIFETIME;

  constructor(
    originPos: THREE.Vector3,
    facingAngle: number,
    targets: Damageable[],
    onHit?: (target: Damageable, damage: number) => void,
  ) {
    // Damage is applied immediately on creation
    this.applyDamage(originPos, facingAngle, targets, onHit);
    this.mesh = MeleeArc.buildMesh(facingAngle);
    this.mesh.position.copy(originPos);
    this.mesh.position.y = 0.5; // float at mid-body height
  }

  get expired(): boolean {
    return this.timer <= 0;
  }

  update(dt: number): void {
    this.timer -= dt;
    // Fade out as it expires
    const t = Math.max(0, this.timer / SWEEP_LIFETIME);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.55;
    this.mesh.scale.setScalar(1 + (1 - t) * 0.25);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private applyDamage(
    origin: THREE.Vector3,
    facingAngle: number,
    targets: Damageable[],
    onHit?: (target: Damageable, damage: number) => void,
  ): void {
    // Forward direction the attacker is facing
    const fwd = new THREE.Vector3(Math.sin(facingAngle), 0, Math.cos(facingAngle));

    for (const target of targets) {
      if (target.isDead) continue;

      // Position check — requires targets to expose a worldPosition getter
      const t = target as Damageable & { worldPosition?: THREE.Vector3 };
      if (!t.worldPosition) continue;

      const delta = new THREE.Vector3().subVectors(t.worldPosition, origin);
      // Vertical range check
      if (Math.abs(delta.y) > SWEEP_HEIGHT) continue;

      const flat = new THREE.Vector3(delta.x, 0, delta.z);
      const dist = flat.length();
      if (dist > SWEEP_RADIUS) continue;

      // Angle check — is the target within the sweep cone?
      flat.normalize();
      const dot = flat.dot(fwd);
      if (dot < Math.cos(SWEEP_ANGLE / 2)) continue;

      const applied = target.takeDamage(MELEE_DAMAGE);
      if (applied > 0) onHit?.(target, applied);
    }
  }

  private static buildMesh(facingAngle: number): THREE.Mesh {
    // Partial torus arc centred on the attacker's facing direction
    const geo = new THREE.TorusGeometry(
      SWEEP_RADIUS * 0.85,
      0.12,
      4,
      16,
      SWEEP_ANGLE,
    );
    const mat = new THREE.MeshBasicMaterial({
      color: ARC_COLOR,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Rotate the torus so it faces the attacker's direction
    // Torus starts at +X; offset so it's centred on facingAngle
    mesh.rotation.x = Math.PI / 2; // lay flat
    mesh.rotation.z = -(facingAngle + Math.PI / 2) + SWEEP_ANGLE / 2;

    // Subtle emissive via a second pass would require MeshStandardMaterial;
    // MeshBasicMaterial + bright colour is sufficient for a lightweight arc.
    mesh.renderOrder = 2;
    return mesh;
  }
}

// ── CombatSystem ──────────────────────────────────────────────────────────

/** Manages active melee arcs — call `update(dt)` each frame and wire
 *  `triggerMelee(...)` to the player's attack input. */
export class CombatSystem {
  private readonly arcs: MeleeArc[] = [];

  /** Fire a new melee attack from `origin` facing `facingAngle`. */
  triggerMelee(
    origin: THREE.Vector3,
    facingAngle: number,
    targets: Damageable[],
    scene: THREE.Scene,
    onHit?: (target: Damageable, damage: number) => void,
  ): void {
    const arc = new MeleeArc(origin, facingAngle, targets, onHit);
    scene.add(arc.mesh);
    this.arcs.push(arc);
  }

  update(dt: number, scene: THREE.Scene): void {
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const arc = this.arcs[i];
      arc.update(dt);
      if (arc.expired) {
        scene.remove(arc.mesh);
        arc.mesh.geometry.dispose();
        (arc.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.arcs.splice(i, 1);
      }
    }
  }
}
