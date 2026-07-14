import * as THREE from 'three';
import type { Damageable } from './Health';
import type { PartyManager } from './PartyManager';

// ── Spell definitions ─────────────────────────────────────────────────────────

export type SpellType = 'projectile' | 'aoe' | 'chain' | 'zone' | 'buff';

interface SpellDef {
  type: SpellType;
  color: number;
  emissive: number;
  damage: number;
  speed: number;
  radius: number;
  cooldown: number;
  bounces?: number;       // chain: max extra hops after initial hit
  dotDuration?: number;   // zone: how long the zone persists (s)
  aoeVfxDuration?: number; // aoe: ring animation duration (s)
  buffDuration?: number;  // buff: effect duration (s)
}

const SPELL_DEFS: Record<string, SpellDef> = {
  magic_bolt:   { type: 'projectile', color: 0x44ddff, emissive: 0x0088bb, damage: 3, speed: 14, radius: 0.18, cooldown: 0.5 },
  flame_dart:   { type: 'projectile', color: 0xff6600, emissive: 0xcc2200, damage: 5, speed: 18, radius: 0.15, cooldown: 0.5 },
  intimidate:   { type: 'aoe',        color: 0xff3300, emissive: 0x991100, damage: 0, speed: 0,  radius: 10,   cooldown: 8,  aoeVfxDuration: 0.6 },
  nova_burst:   { type: 'aoe',        color: 0xffd700, emissive: 0x996600, damage: 8, speed: 0,  radius: 12,   cooldown: 15, aoeVfxDuration: 1.2 },
  chain_arc:    { type: 'chain',      color: 0x88eeff, emissive: 0x224488, damage: 6, speed: 22, radius: 0.22, cooldown: 5,  bounces: 3 },
  void_rift:    { type: 'zone',       color: 0x7733cc, emissive: 0x330066, damage: 3, speed: 0,  radius: 2,    cooldown: 12, dotDuration: 8 },
  battle_hymn:  { type: 'buff',       color: 0xffcc44, emissive: 0xaa7700, damage: 0, speed: 0,  radius: 0,    cooldown: 20, buffDuration: 12 },
  mass_animate: { type: 'aoe',        color: 0x88aa77, emissive: 0x334422, damage: 0, speed: 0,  radius: 6,    cooldown: 30, aoeVfxDuration: 1.5 },
};

const FALLBACK_DEF = SPELL_DEFS.magic_bolt;
const PROJECTILE_LIFETIME = 3.0;

// ── Cast options ──────────────────────────────────────────────────────────────

export interface CastOptions {
  spellDamageMult?: number;
  aoeRadiusMult?: number;
  party?: PartyManager;
  onForceFlee?: (enemies: (Damageable & { forceFlee?(): void })[]) => void;
  onBattleHymn?: (duration: number) => void;
}

// ── Projectile ────────────────────────────────────────────────────────────────

class Projectile {
  readonly mesh: THREE.Mesh;
  private timer = PROJECTILE_LIFETIME;
  private _hit = false;

  constructor(
    private readonly pos: THREE.Vector3,
    private readonly dir: THREE.Vector3,
    private readonly targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    private readonly def: SpellDef,
    private readonly damageMult: number,
    private readonly onHit?: (target: Damageable, damage: number) => void,
    private readonly onChain?: (hitPos: THREE.Vector3, hitTarget: Damageable, bouncesLeft: number) => void,
    private readonly bouncesLeft = 0,
  ) {
    this.mesh = this._buildMesh();
    this.mesh.position.copy(pos);
  }

  get expired(): boolean { return this._hit || this.timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this.timer -= dt;

    this.pos.addScaledVector(this.dir, this.def.speed * dt);
    this.mesh.position.copy(this.pos);

    const pulse = 0.6 + 0.4 * Math.sin(this.timer * 20);
    (this.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;

    for (const target of this.targets) {
      if (target.isDead || !target.worldPosition) continue;
      const dx = this.pos.x - target.worldPosition.x;
      const dz = this.pos.z - target.worldPosition.z;
      if (Math.sqrt(dx * dx + dz * dz) < this.def.radius + 0.45) {
        const dmg = Math.round(this.def.damage * this.damageMult);
        const applied = target.takeDamage(dmg);
        if (applied > 0) this.onHit?.(target, applied);
        if (this.bouncesLeft > 0) this.onChain?.(this.pos.clone(), target, this.bouncesLeft);
        this._hit = true;
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

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshStandardMaterial).dispose();
  }
}

// ── Expanding torus VFX (Nova Burst / intimidate / mass_animate) ──────────────

class AoeVfx {
  readonly mesh: THREE.Mesh;
  private timer: number;

  constructor(
    pos: THREE.Vector3,
    radius: number,
    color: number,
    readonly duration: number,
  ) {
    this.timer = duration;
    const geo = new THREE.TorusGeometry(radius, Math.max(0.1, radius * 0.035), 8, 48);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 1.0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(pos.x, 0.1, pos.z);
    this.mesh.scale.setScalar(0.01);
  }

  get expired(): boolean { return this.timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this.timer -= dt;
    const t = 1 - this.timer / this.duration; // 0→1
    this.mesh.scale.setScalar(t < 0.02 ? 0.02 : t);
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    mat.emissiveIntensity = 1.5 * (1 - t * 0.7);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshStandardMaterial).dispose();
  }
}

// ── Chain Arc segment VFX (lightning bolt between two points) ─────────────────

class ChainSegment {
  readonly mesh: THREE.Mesh;
  private timer = 0.25;

  constructor(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);

    const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(mid);
    this.mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.length() > 0.001 ? dir.normalize() : new THREE.Vector3(0, 1, 0),
    );
  }

  get expired(): boolean { return this.timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this.timer -= dt;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, this.timer / 0.25);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
  }
}

// ── Void Rift zone (stationary DoT circle on the floor) ───────────────────────

class ZoneEntity {
  readonly mesh: THREE.Mesh;
  private timer: number;
  private dotTimer = 1.0;
  private _t = 0;

  constructor(
    pos: THREE.Vector3,
    private readonly radius: number,
    color: number,
    dotDuration: number,
    private readonly damagePerSecond: number,
    private readonly damageMult: number,
    private readonly onHit?: (target: Damageable, damage: number) => void,
  ) {
    this.timer = dotDuration;
    const geo = new THREE.CylinderGeometry(radius, radius, 0.08, 32);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.45,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(pos.x, 0.04, pos.z);
  }

  get expired(): boolean { return this.timer <= 0; }

  update(dt: number, targets: (Damageable & { worldPosition?: THREE.Vector3 })[]): void {
    if (this.expired) return;
    this.timer -= dt;
    this._t += dt;

    // Pulsing opacity
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.opacity = 0.3 + 0.2 * Math.abs(Math.sin(this._t * 2.5));
    mat.emissiveIntensity = 0.6 + 0.4 * Math.abs(Math.sin(this._t * 2.5));

    // Fade out in last 1.5s
    if (this.timer < 1.5) mat.opacity *= this.timer / 1.5;

    // DoT tick (once per second)
    this.dotTimer -= dt;
    if (this.dotTimer <= 0) {
      this.dotTimer = 1.0;
      const dmg = Math.max(1, Math.round(this.damagePerSecond * this.damageMult));
      for (const target of targets) {
        if (target.isDead || !target.worldPosition) continue;
        const dx = this.mesh.position.x - target.worldPosition.x;
        const dz = this.mesh.position.z - target.worldPosition.z;
        if (Math.sqrt(dx * dx + dz * dz) < this.radius + 0.4) {
          const applied = target.takeDamage(dmg);
          if (applied > 0) this.onHit?.(target, applied);
        }
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshStandardMaterial).dispose();
  }
}

// ── Battle Hymn aura ring (follows player while active) ───────────────────────

class HymnAura {
  readonly mesh: THREE.Mesh;
  private timer: number;
  private _t = 0;

  constructor(duration: number) {
    this.timer = duration;
    const geo = new THREE.TorusGeometry(2.8, 0.12, 6, 36);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.6 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
  }

  get expired(): boolean { return this.timer <= 0; }
  get remaining(): number { return this.timer; }

  update(dt: number, playerPos: THREE.Vector3): void {
    if (this.expired) return;
    this.timer -= dt;
    this._t += dt;
    this.mesh.position.set(playerPos.x, 0.15, playerPos.z);
    this.mesh.rotation.z += dt * 0.6;
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 + 0.25 * Math.abs(Math.sin(this._t * 3));
    if (this.timer < 2) mat.opacity *= this.timer / 2;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).dispose();
  }
}

// ── Cooldown tracker ──────────────────────────────────────────────────────────

interface CooldownEntry { remaining: number; duration: number; }

// ── SpellSystem ───────────────────────────────────────────────────────────────

export class SpellSystem {
  private readonly _projectiles: Projectile[] = [];
  private readonly _aoeVfx: AoeVfx[] = [];
  private readonly _chainSegs: ChainSegment[] = [];
  private readonly _zones: ZoneEntity[] = [];
  private _hymn: HymnAura | null = null;
  private readonly _cooldowns = new Map<string, CooldownEntry>();

  // ── Public query ─────────────────────────────────────────────────────────

  /** 0 = ready, 1 = just cast; decreases to 0 over cooldown duration. */
  cooldownFraction(spellId: string): number {
    const cd = this._cooldowns.get(spellId);
    if (!cd || cd.remaining <= 0) return 0;
    return cd.remaining / cd.duration;
  }

  isReady(spellId: string): boolean {
    const cd = this._cooldowns.get(spellId);
    return !cd || cd.remaining <= 0;
  }

  /** Whether Battle Hymn aura is currently active. */
  get battleHymnActive(): boolean { return !!this._hymn && !this._hymn.expired; }

  // ── Cast ─────────────────────────────────────────────────────────────────

  /**
   * Attempt to cast a spell.  Returns false if the spell is on cooldown.
   * Routes by SpellType and handles all VFX internally.
   */
  cast(
    spellId: string,
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3; forceFlee?(): void })[],
    scene: THREE.Scene,
    onHit?: (target: Damageable, damage: number) => void,
    opts: CastOptions = {},
  ): boolean {
    if (!this.isReady(spellId)) return false;

    const def = SPELL_DEFS[spellId] ?? FALLBACK_DEF;
    const dmgMult = opts.spellDamageMult ?? 1;
    const aoeRMult = opts.aoeRadiusMult ?? 1;

    this._setCooldown(spellId, def.cooldown);

    switch (def.type) {
      case 'projectile':
        this._fireProjectile(origin, aimTarget, targets, def, dmgMult, scene, onHit);
        break;
      case 'chain':
        this._fireChain(origin, aimTarget, targets, def, dmgMult, scene, onHit);
        break;
      case 'aoe':
        this._fireAoe(origin, targets, def, dmgMult, aoeRMult, scene, onHit, opts, spellId);
        break;
      case 'zone':
        this._fireZone(aimTarget, targets, def, dmgMult, scene, onHit);
        break;
      case 'buff':
        this._fireBuff(origin, def, scene, opts);
        break;
    }

    return true;
  }

  // ── Legacy fire() — kept for backwards compat ─────────────────────────────

  fire(
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    scene: THREE.Scene,
    onHit?: (target: Damageable, damage: number) => void,
    spellId = 'magic_bolt',
  ): void {
    this.cast(spellId, origin, aimTarget, targets, scene, onHit);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(
    dt: number,
    scene: THREE.Scene,
    targets?: (Damageable & { worldPosition?: THREE.Vector3 })[],
    playerPos?: THREE.Vector3,
  ): void {
    // Cooldown timers
    for (const [, cd] of this._cooldowns) {
      cd.remaining = Math.max(0, cd.remaining - dt);
    }

    // Projectiles
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.update(dt);
      if (p.expired) {
        scene.remove(p.mesh);
        p.dispose();
        this._projectiles.splice(i, 1);
      }
    }

    // AOE VFX rings
    for (let i = this._aoeVfx.length - 1; i >= 0; i--) {
      const v = this._aoeVfx[i];
      v.update(dt);
      if (v.expired) {
        scene.remove(v.mesh);
        v.dispose();
        this._aoeVfx.splice(i, 1);
      }
    }

    // Chain arc segments
    for (let i = this._chainSegs.length - 1; i >= 0; i--) {
      const s = this._chainSegs[i];
      s.update(dt);
      if (s.expired) {
        scene.remove(s.mesh);
        s.dispose();
        this._chainSegs.splice(i, 1);
      }
    }

    // Zone DoT entities
    for (let i = this._zones.length - 1; i >= 0; i--) {
      const z = this._zones[i];
      z.update(dt, targets ?? []);
      if (z.expired) {
        scene.remove(z.mesh);
        z.dispose();
        this._zones.splice(i, 1);
      }
    }

    // Battle Hymn aura
    if (this._hymn) {
      this._hymn.update(dt, playerPos ?? new THREE.Vector3());
      if (this._hymn.expired) {
        scene.remove(this._hymn.mesh);
        this._hymn.dispose();
        this._hymn = null;
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _setCooldown(spellId: string, duration: number): void {
    this._cooldowns.set(spellId, { remaining: duration, duration });
  }

  private _fireProjectile(
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    def: SpellDef,
    dmgMult: number,
    scene: THREE.Scene,
    onHit?: (t: Damageable, d: number) => void,
    bouncesLeft = 0,
    excludeTarget?: Damageable,
  ): void {
    const dir = new THREE.Vector3().subVectors(aimTarget, origin).setY(0).normalize();
    const spawnPos = origin.clone().addScaledVector(dir, 0.6);
    spawnPos.y = origin.y + 0.5;

    const filteredTargets = excludeTarget
      ? targets.filter(t => t !== excludeTarget)
      : targets;

    const proj = new Projectile(spawnPos, dir, filteredTargets, def, dmgMult, onHit,
      (hitPos, hitTarget, bounces) => this._doChainBounce(hitPos, hitTarget, targets, def, dmgMult * 0.85, scene, onHit, bounces),
      bouncesLeft,
    );
    scene.add(proj.mesh);
    this._projectiles.push(proj);
  }

  private _fireChain(
    origin: THREE.Vector3,
    aimTarget: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    def: SpellDef,
    dmgMult: number,
    scene: THREE.Scene,
    onHit?: (t: Damageable, d: number) => void,
  ): void {
    const bounces = def.bounces ?? 0;
    const dir = new THREE.Vector3().subVectors(aimTarget, origin).setY(0).normalize();
    const spawnPos = origin.clone().addScaledVector(dir, 0.6);
    spawnPos.y = origin.y + 0.5;

    // Add initial chain-start segment from origin glow
    const chainSeg = new ChainSegment(spawnPos, spawnPos.clone().addScaledVector(dir, 1.5), def.color);
    scene.add(chainSeg.mesh);
    this._chainSegs.push(chainSeg);

    const proj = new Projectile(
      spawnPos, dir, targets, def, dmgMult, onHit,
      (hitPos, hitTarget, bouncesLeft) => this._doChainBounce(hitPos, hitTarget, targets, def, dmgMult * 0.85, scene, onHit, bouncesLeft),
      bounces,
    );
    scene.add(proj.mesh);
    this._projectiles.push(proj);
  }

  private _doChainBounce(
    from: THREE.Vector3,
    prevTarget: Damageable & { worldPosition?: THREE.Vector3 },
    allTargets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    def: SpellDef,
    dmgMult: number,
    scene: THREE.Scene,
    onHit?: (t: Damageable, d: number) => void,
    bouncesLeft = 0,
  ): void {
    // Find nearest non-dead target within 6u that isn't the one just hit
    let nearest: (Damageable & { worldPosition?: THREE.Vector3 }) | null = null;
    let nearestDist = 6.0;
    for (const t of allTargets) {
      if (t === prevTarget || t.isDead || !t.worldPosition) continue;
      const d = from.distanceTo(t.worldPosition);
      if (d < nearestDist) { nearestDist = d; nearest = t; }
    }
    if (!nearest?.worldPosition) return;

    // VFX segment
    const seg = new ChainSegment(from, nearest.worldPosition.clone().setY(from.y), def.color);
    scene.add(seg.mesh);
    this._chainSegs.push(seg);

    // Fire next projectile toward nearest target
    const nextDir = new THREE.Vector3().subVectors(nearest.worldPosition, from).setY(0).normalize();
    const nextProj = new Projectile(
      from.clone(), nextDir,
      allTargets.filter(t => t !== prevTarget),
      def, dmgMult, onHit,
      bouncesLeft > 1
        ? (hp, ht, bl) => this._doChainBounce(hp, ht, allTargets, def, dmgMult * 0.85, scene, onHit, bl)
        : undefined,
      bouncesLeft - 1,
    );
    scene.add(nextProj.mesh);
    this._projectiles.push(nextProj);
  }

  private _fireAoe(
    origin: THREE.Vector3,
    targets: (Damageable & { worldPosition?: THREE.Vector3; forceFlee?(): void })[],
    def: SpellDef,
    dmgMult: number,
    aoeRMult: number,
    scene: THREE.Scene,
    onHit?: (t: Damageable, d: number) => void,
    opts: CastOptions = {},
    spellId = '',
  ): void {
    const radius = def.radius * aoeRMult;
    const vfxDur = def.aoeVfxDuration ?? 0.8;

    // Expanding ring VFX
    const vfx = new AoeVfx(origin, radius, def.color, vfxDur);
    scene.add(vfx.mesh);
    this._aoeVfx.push(vfx);

    if (spellId === 'intimidate') {
      // Force all enemies in radius to flee
      for (const t of targets) {
        if (t.isDead || !t.worldPosition) continue;
        if (origin.distanceTo(t.worldPosition) < radius) {
          t.forceFlee?.();
          opts.onForceFlee?.([t]);
        }
      }
      return;
    }

    if (spellId === 'mass_animate') {
      // Stub — visual only; full implementation in Phase 7d.2
      return;
    }

    // Standard AOE damage
    const dmg = Math.round(def.damage * dmgMult);
    if (dmg > 0) {
      for (const t of targets) {
        if (t.isDead || !t.worldPosition) continue;
        if (origin.distanceTo(t.worldPosition) < radius + 0.4) {
          const applied = t.takeDamage(dmg);
          if (applied > 0) onHit?.(t, applied);
        }
      }
    }
  }

  private _fireZone(
    pos: THREE.Vector3,
    _targets: (Damageable & { worldPosition?: THREE.Vector3 })[],
    def: SpellDef,
    dmgMult: number,
    scene: THREE.Scene,
    onHit?: (t: Damageable, d: number) => void,
  ): void {
    const zone = new ZoneEntity(
      pos, def.radius, def.color, def.dotDuration ?? 8,
      def.damage, dmgMult, onHit,
    );
    scene.add(zone.mesh);
    this._zones.push(zone);
  }

  private _fireBuff(
    origin: THREE.Vector3,
    def: SpellDef,
    scene: THREE.Scene,
    opts: CastOptions,
  ): void {
    const duration = def.buffDuration ?? 12;

    // Remove old hymn if re-cast
    if (this._hymn) {
      scene.remove(this._hymn.mesh);
      this._hymn.dispose();
    }

    this._hymn = new HymnAura(duration);
    this._hymn.mesh.position.set(origin.x, 0.15, origin.z);
    scene.add(this._hymn.mesh);

    opts.onBattleHymn?.(duration);

    // Boost party followers
    if (opts.party) {
      opts.party.followerDamageMult = 1.5;
    }
  }
}
