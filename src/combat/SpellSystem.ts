import * as THREE from 'three';
import type { Damageable } from './Health';

// ── Spell definitions ─────────────────────────────────────────────────────

interface SpellDef {
  color: number;
  emissive: number;
  damage: number;
  speed: number;
  radius: number;
}

const SPELL_DEFS: Record<string, SpellDef> = {
  magic_bolt: { color: 0x44ddff, emissive: 0x0088bb, damage: 3, speed: 14, radius: 0.18 },
  flame_dart:  { color: 0xff6600, emissive: 0xcc2200, damage: 5, speed: 18, radius: 0.15 },
};
const FALLBACK_DEF = SPELL_DEFS.magic_bolt;
const PROJECTILE_LIFETIME = 3.0;

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
    private readonly def: SpellDef,
    private readonly onHit?: (target: Damageable, damage: number) => void,
  ) {
    this.mesh = this._buildMesh();
    this.mesh.position.copy(pos);
  }

  get expired(): boolean {
    return this.timer <= 0 || this.hit;
  }

  update(dt: number): void {
    if (this.expired) return;

    this.timer -= dt;

    // Move
    this.pos.addScaledVector(this.dir, this.def.speed * dt);
    this.mesh.position.copy(this.pos);

    // Pulse emissive
    const pulse = 0.6 + 0.4 * Math.sin(this.timer * 20);
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

    // Hit test — XZ-only distance so height difference doesn't cause misses
    for (const target of this.targets) {
      if (target.isDead || !target.worldPosition) continue;
      const dx = this.pos.x - target.worldPosition.x;
      const dz = this.pos.z - target.worldPosition.z;
      const distXZ = Math.sqrt(dx * dx + dz * dz);
      if (distXZ < this.def.radius + 0.45) {
        const applied = target.takeDamage(this.def.damage);
        if (applied > 0) this.onHit?.(target, applied);
        this.hit = true;
        return;
      }
    }
  }

  private _buildMesh(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(this.def.radius, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: this.def.color,
      emissive: new THREE.Color(this.def.emissive),
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
 *  Call `fire(...)` on right-click, `update(dt, scene)` each frame. */
export class SpellSystem {
  private readonly projectiles: Projectile[] = [];

  /** Fire a projectile from `origin` aimed at the mouse world position.
   *  @param spellId Spell key from SPELL_DEFS (defaults to 'magic_bolt'). */
  fire(
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    scene: THREE.Scene,
    onHit?: (target: Damageable, damage: number) => void,
    spellId = 'magic_bolt',
  ): void {
    const def = SPELL_DEFS[spellId] ?? FALLBACK_DEF;

    const dir = new THREE.Vector3()
      .subVectors(aimTarget, origin)
      .setY(0)
      .normalize();

    const spawnPos = origin.clone().addScaledVector(dir, 0.6); // slight offset ahead
    spawnPos.y = origin.y + 0.5; // chest height

    const proj = new Projectile(spawnPos, dir, targets, def, onHit);
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
