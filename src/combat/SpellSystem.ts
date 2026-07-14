import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import type { Damageable } from './Health';
import type { PartyManager } from './PartyManager';

// ── VFX PRNG — deterministic, never Math.random() ────────────────────────────
const _vfxRand = mulberry32(0xF00DCAFE);

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

// ── Projectile — comet with glowing core + additive trail ─────────────────────

class Projectile {
  readonly mesh: THREE.Group;
  private readonly _sphere: THREE.Mesh;
  private readonly _trailAttr: THREE.BufferAttribute;
  private readonly _posHist: THREE.Vector3[] = [];
  private static readonly TRAIL_N = 5;
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
    this.mesh = new THREE.Group();

    // Outer glow sphere
    const outerGeo = new THREE.SphereGeometry(def.radius, 8, 8);
    const outerMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._sphere = new THREE.Mesh(outerGeo, outerMat);
    this.mesh.add(this._sphere);

    // Bright white inner core
    const coreGeo = new THREE.SphereGeometry(def.radius * 0.45, 6, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh.add(new THREE.Mesh(coreGeo, coreMat));

    // Comet trail — Points, positions stored as offsets behind the projectile
    const trailPos = new Float32Array(Projectile.TRAIL_N * 3);
    const trailGeo = new THREE.BufferGeometry();
    this._trailAttr = new THREE.BufferAttribute(trailPos, 3);
    trailGeo.setAttribute('position', this._trailAttr);
    const trailMat = new THREE.PointsMaterial({
      color: def.color,
      size: def.radius * 2.8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.mesh.add(new THREE.Points(trailGeo, trailMat));

    this.mesh.position.copy(pos);
  }

  get expired(): boolean { return this._hit || this.timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this.timer -= dt;

    this.pos.addScaledVector(this.dir, this.def.speed * dt);
    this.mesh.position.copy(this.pos);

    // Roll position history; write trail as local offsets from current pos
    this._posHist.unshift(this.pos.clone());
    if (this._posHist.length > Projectile.TRAIL_N + 1) this._posHist.pop();
    for (let i = 0; i < Projectile.TRAIL_N; i++) {
      const h = this._posHist[i + 1] ?? this.pos;
      this._trailAttr.setXYZ(i, h.x - this.pos.x, h.y - this.pos.y, h.z - this.pos.z);
    }
    this._trailAttr.needsUpdate = true;

    // Pulsing glow
    const pulse = 0.65 + 0.35 * Math.sin(this.timer * 22);
    (this._sphere.material as THREE.MeshBasicMaterial).opacity = pulse;

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

  dispose(): void {
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

// ── AoeVfx — expanding torus ring + ground flash disc ────────────────────────

class AoeVfx {
  readonly mesh: THREE.Group;
  private readonly _ring: THREE.Mesh;
  private readonly _flash: THREE.Mesh;
  private _timer: number;

  constructor(
    pos: THREE.Vector3,
    radius: number,
    color: number,
    readonly duration: number,
  ) {
    this._timer = duration;
    this.mesh = new THREE.Group();
    this.mesh.position.set(pos.x, 0.05, pos.z);

    // Expanding ring torus — starts tiny, grows to full radius
    const ringGeo = new THREE.TorusGeometry(radius, Math.max(0.1, radius * 0.04), 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._ring = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.scale.setScalar(0.01);
    this.mesh.add(this._ring);

    // Ground flash disc — bright, fades out in first ~20% of lifetime
    const flashGeo = new THREE.CircleGeometry(radius, 48);
    const flashMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._flash = new THREE.Mesh(flashGeo, flashMat);
    this._flash.rotation.x = -Math.PI / 2;
    this.mesh.add(this._flash);
  }

  get expired(): boolean { return this._timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this._timer -= dt;
    const t = 1 - this._timer / this.duration; // 0→1

    // Ring expands and fades near end
    this._ring.scale.setScalar(Math.max(0.01, t));
    const ringMat = this._ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = t < 0.75 ? 1.0 : 1.0 - (t - 0.75) / 0.25;

    // Flash fades out quickly
    const flashMat = this._flash.material as THREE.MeshBasicMaterial;
    flashMat.opacity = Math.max(0, 0.55 * (1 - t * 5));
  }

  dispose(): void {
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

// ── LightningBolt — jagged midpoint-displaced tube with crawling flicker ──────
//    Replaces the old straight CylinderGeometry ChainSegment

class LightningBolt {
  readonly mesh: THREE.Group;
  private readonly _coreMesh: THREE.Mesh;
  private readonly _glowMesh: THREE.Mesh;
  private _timer = 0.45;
  private _flickerTimer = 0;
  private readonly _from: THREE.Vector3;
  private readonly _to: THREE.Vector3;
  private readonly _color: number;

  constructor(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    this._from = from.clone();
    this._to   = to.clone();
    this._color = color;
    this.mesh = new THREE.Group();

    const { curve, segs } = this._buildCurve();

    // Thin white core — bright centre of the bolt
    this._coreMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs, 0.012, 4, false),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    // Wider coloured glow layer
    this._glowMesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs, 0.065, 5, false),
      new THREE.MeshBasicMaterial({
        color: this._color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.mesh.add(this._coreMesh);
    this.mesh.add(this._glowMesh);
  }

  get expired(): boolean { return this._timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this._timer -= dt;
    this._flickerTimer -= dt;

    // Fade at very end + instant random flicker
    const fade    = Math.min(1, this._timer / 0.08);
    const flicker = _vfxRand() < 0.25 ? 0.3 : 1.0;
    (this._coreMesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade * flicker;
    (this._glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.60 * fade * flicker;

    // Regenerate jagged path every 40–70 ms for crawling electricity
    if (this._flickerTimer <= 0) {
      this._flickerTimer = 0.04 + _vfxRand() * 0.03;
      this._regen();
    }
  }

  private _buildCurve(): { curve: THREE.CatmullRomCurve3; segs: number } {
    const pts   = this._displace(this._from, this._to, 4, 0.42);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.05);
    return { curve, segs: Math.max(16, pts.length * 3) };
  }

  private _regen(): void {
    const { curve, segs } = this._buildCurve();
    this._coreMesh.geometry.dispose();
    this._coreMesh.geometry = new THREE.TubeGeometry(curve, segs, 0.012, 4, false);
    this._glowMesh.geometry.dispose();
    this._glowMesh.geometry = new THREE.TubeGeometry(curve, segs, 0.065, 5, false);
  }

  /** Recursive midpoint displacement — turns a line into jagged lightning */
  private _displace(
    a: THREE.Vector3,
    b: THREE.Vector3,
    depth: number,
    spread: number,
  ): THREE.Vector3[] {
    if (depth === 0) return [a.clone(), b.clone()];
    const dir  = new THREE.Vector3().subVectors(b, a);
    const mid  = a.clone().addScaledVector(dir, 0.4 + _vfxRand() * 0.2);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    if (perp.lengthSq() > 0.0001) perp.normalize();
    mid.addScaledVector(perp, (_vfxRand() - 0.5) * 2 * spread * dir.length());
    mid.y += (_vfxRand() - 0.5) * 0.45;
    const L = this._displace(a,   mid, depth - 1, spread * 0.55);
    const R = this._displace(mid, b,   depth - 1, spread * 0.55);
    return [...L.slice(0, -1), ...R];
  }

  dispose(): void {
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

// ── SparkBurst — radial explosion of additive point particles ─────────────────

class SparkBurst {
  readonly mesh: THREE.Points;
  private static readonly COUNT = 22;
  private static readonly DUR   = 0.55;
  private _timer = SparkBurst.DUR;
  private readonly _vel: THREE.Vector3[];
  private readonly _posAttr: THREE.BufferAttribute;

  constructor(pos: THREE.Vector3, color: number, speed = 5.5) {
    const positions = new Float32Array(SparkBurst.COUNT * 3);
    this._vel = [];

    for (let i = 0; i < SparkBurst.COUNT; i++) {
      positions[i * 3]     = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const theta = _vfxRand() * Math.PI * 2;
      const phi   = _vfxRand() * Math.PI;
      const spd   = speed * (0.3 + _vfxRand() * 0.7);
      this._vel.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.abs(Math.cos(phi)) * spd * 0.55 + 1.5,
        Math.sin(phi) * Math.sin(theta) * spd,
      ));
    }

    const geo = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute('position', this._posAttr);
    this.mesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color,
      size: 0.22,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }));
  }

  get expired(): boolean { return this._timer <= 0; }

  update(dt: number): void {
    if (this.expired) return;
    this._timer -= dt;
    for (let i = 0; i < SparkBurst.COUNT; i++) {
      const v = this._vel[i];
      v.y -= 11 * dt; // gravity
      this._posAttr.setXYZ(
        i,
        this._posAttr.getX(i) + v.x * dt,
        this._posAttr.getY(i) + v.y * dt,
        this._posAttr.getZ(i) + v.z * dt,
      );
    }
    this._posAttr.needsUpdate = true;
    const t = this._timer / SparkBurst.DUR;
    (this.mesh.material as THREE.PointsMaterial).opacity = t * t;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.PointsMaterial).dispose();
  }
}

// ── ZoneEntity — void rift DoT disc + rising mist wisps ──────────────────────

class ZoneEntity {
  readonly mesh: THREE.Group;
  private readonly _disc: THREE.Mesh;
  private readonly _wispAttr: THREE.BufferAttribute;
  private readonly _wispMat: THREE.PointsMaterial;
  private static readonly WISP_N = 24;
  private readonly _wispVels: THREE.Vector3[];
  private _timer: number;
  private _dotTimer = 1.0;
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
    this._timer = dotDuration;
    this.mesh = new THREE.Group();
    this.mesh.position.set(pos.x, 0, pos.z);

    // Base flat disc
    const discGeo = new THREE.CylinderGeometry(radius, radius, 0.06, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._disc = new THREE.Mesh(discGeo, discMat);
    this._disc.position.y = 0.04;
    this.mesh.add(this._disc);

    // Glowing edge ring
    const edgeGeo = new THREE.TorusGeometry(radius, 0.07, 5, 48);
    const edgeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.rotation.x = -Math.PI / 2;
    edgeMesh.position.y = 0.04;
    this.mesh.add(edgeMesh);

    // Rising mist wisps — Points that loop from floor upward
    const wispPos = new Float32Array(ZoneEntity.WISP_N * 3);
    this._wispVels = [];
    for (let i = 0; i < ZoneEntity.WISP_N; i++) {
      const angle = _vfxRand() * Math.PI * 2;
      const r     = _vfxRand() * radius * 0.88;
      wispPos[i * 3]     = Math.cos(angle) * r;
      wispPos[i * 3 + 1] = _vfxRand() * 2.0;
      wispPos[i * 3 + 2] = Math.sin(angle) * r;
      this._wispVels.push(new THREE.Vector3(
        (_vfxRand() - 0.5) * 0.35,
        0.45 + _vfxRand() * 0.55,
        (_vfxRand() - 0.5) * 0.35,
      ));
    }
    const wispGeo = new THREE.BufferGeometry();
    this._wispAttr = new THREE.BufferAttribute(wispPos, 3);
    wispGeo.setAttribute('position', this._wispAttr);
    this._wispMat = new THREE.PointsMaterial({
      color: 0xbb88ff,
      size: 0.21,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.mesh.add(new THREE.Points(wispGeo, this._wispMat));
  }

  get expired(): boolean { return this._timer <= 0; }

  update(dt: number, targets: (Damageable & { worldPosition?: THREE.Vector3 })[]): void {
    if (this.expired) return;
    this._timer -= dt;
    this._t += dt;

    // Pulsing disc
    const pulse = 0.25 + 0.15 * Math.abs(Math.sin(this._t * 2.5));
    const fade  = this._timer < 1.5 ? this._timer / 1.5 : 1;
    (this._disc.material as THREE.MeshBasicMaterial).opacity = pulse * fade;

    // Animate wisps — rise and loop back to floor
    for (let i = 0; i < ZoneEntity.WISP_N; i++) {
      const v = this._wispVels[i];
      let x = this._wispAttr.getX(i) + v.x * dt;
      let y = this._wispAttr.getY(i) + v.y * dt;
      let z = this._wispAttr.getZ(i) + v.z * dt;
      if (y > 2.8) {
        const angle = _vfxRand() * Math.PI * 2;
        const r     = _vfxRand() * this.radius * 0.88;
        x = Math.cos(angle) * r;
        y = 0;
        z = Math.sin(angle) * r;
      }
      this._wispAttr.setXYZ(i, x, y, z);
    }
    this._wispAttr.needsUpdate = true;
    this._wispMat.opacity = 0.65 * fade;

    // DoT tick (once per second)
    this._dotTimer -= dt;
    if (this._dotTimer <= 0) {
      this._dotTimer = 1.0;
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
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

// ── HymnAura — gold ring + orbiting spark particles ──────────────────────────

class HymnAura {
  readonly mesh: THREE.Group;
  private readonly _ring: THREE.Mesh;
  private readonly _sparkAttr: THREE.BufferAttribute;
  private readonly _sparkMat: THREE.PointsMaterial;
  private static readonly SPARK_N = 10;
  private readonly _orbits: { radius: number; speed: number; phase: number; height: number }[];
  private _timer: number;
  private _t = 0;

  constructor(duration: number) {
    this._timer = duration;
    this.mesh = new THREE.Group();

    // Outer ring torus
    const geo = new THREE.TorusGeometry(2.8, 0.1, 6, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this._ring = new THREE.Mesh(geo, mat);
    this._ring.rotation.x = -Math.PI / 2;
    this.mesh.add(this._ring);

    // Inner narrower ring for depth
    const innerGeo = new THREE.TorusGeometry(1.5, 0.06, 5, 48);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    innerRing.rotation.x = -Math.PI / 2;
    this.mesh.add(innerRing);

    // Orbiting sparks in group-local space (group = player pos)
    const sparkPos = new Float32Array(HymnAura.SPARK_N * 3);
    this._orbits = Array.from({ length: HymnAura.SPARK_N }, (_, i) => ({
      radius: 1.3 + _vfxRand() * 2.0,
      speed:  0.65 + _vfxRand() * 0.85,
      phase:  (i / HymnAura.SPARK_N) * Math.PI * 2 + _vfxRand() * 0.6,
      height: 0.2 + _vfxRand() * 1.6,
    }));
    const sparkGeo = new THREE.BufferGeometry();
    this._sparkAttr = new THREE.BufferAttribute(sparkPos, 3);
    sparkGeo.setAttribute('position', this._sparkAttr);
    this._sparkMat = new THREE.PointsMaterial({
      color: 0xffdd55,
      size: 0.28,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.mesh.add(new THREE.Points(sparkGeo, this._sparkMat));
  }

  get expired(): boolean { return this._timer <= 0; }
  get remaining(): number { return this._timer; }

  update(dt: number, playerPos: THREE.Vector3): void {
    if (this.expired) return;
    this._timer -= dt;
    this._t += dt;
    this.mesh.position.set(playerPos.x, 0.12, playerPos.z);
    this._ring.rotation.z += dt * 0.55;

    // Orbiting sparks in local space — group is at playerPos so sparks orbit player
    for (let i = 0; i < HymnAura.SPARK_N; i++) {
      const o     = this._orbits[i];
      const angle = o.phase + this._t * o.speed;
      this._sparkAttr.setXYZ(
        i,
        Math.cos(angle) * o.radius,
        o.height + Math.sin(this._t * 2.2 + o.phase) * 0.28,
        Math.sin(angle) * o.radius,
      );
    }
    this._sparkAttr.needsUpdate = true;

    const fade    = this._timer < 2 ? this._timer / 2 : 1;
    const twinkle = 0.42 + 0.28 * Math.sin(this._t * 3);
    (this._ring.material as THREE.MeshBasicMaterial).opacity = twinkle * fade;
    this._sparkMat.opacity = fade * (0.6 + 0.4 * Math.sin(this._t * 7.5));
    if (this._timer < 2) this._sparkMat.opacity *= this._timer / 2;
  }

  dispose(): void {
    this.mesh.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}

// ── Cooldown tracker ──────────────────────────────────────────────────────────

interface CooldownEntry { remaining: number; duration: number; }

// ── SpellSystem ───────────────────────────────────────────────────────────────

export class SpellSystem {
  private readonly _projectiles: Projectile[]  = [];
  private readonly _aoeVfx: AoeVfx[]           = [];
  private readonly _bolts: LightningBolt[]      = [];
  private readonly _sparks: SparkBurst[]        = [];
  private readonly _zones: ZoneEntity[]         = [];
  private _hymn: HymnAura | null               = null;
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

    // Lightning bolts
    for (let i = this._bolts.length - 1; i >= 0; i--) {
      const b = this._bolts[i];
      b.update(dt);
      if (b.expired) {
        scene.remove(b.mesh);
        b.dispose();
        this._bolts.splice(i, 1);
      }
    }

    // Spark bursts
    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const s = this._sparks[i];
      s.update(dt);
      if (s.expired) {
        scene.remove(s.mesh);
        s.dispose();
        this._sparks.splice(i, 1);
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

  private _addSpark(pos: THREE.Vector3, color: number, speed: number, scene: THREE.Scene): void {
    const burst = new SparkBurst(pos, color, speed);
    scene.add(burst.mesh);
    this._sparks.push(burst);
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
    const bounces  = def.bounces ?? 0;
    const dir      = new THREE.Vector3().subVectors(aimTarget, origin).setY(0).normalize();
    const spawnPos = origin.clone().addScaledVector(dir, 0.6);
    spawnPos.y     = origin.y + 0.5;

    // Origin conjuring spark
    this._addSpark(spawnPos, def.color, 3.5, scene);

    // Initial bolt flash from caster outward
    const boltEnd  = spawnPos.clone().addScaledVector(dir, 1.8);
    const initBolt = new LightningBolt(spawnPos, boltEnd, def.color);
    scene.add(initBolt.mesh);
    this._bolts.push(initBolt);

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

    // Jagged lightning bolt between bounce points
    const boltTo = nearest.worldPosition.clone().setY(from.y);
    const bolt   = new LightningBolt(from, boltTo, def.color);
    scene.add(bolt.mesh);
    this._bolts.push(bolt);

    // Spark burst at impact point
    this._addSpark(from, def.color, 4.0, scene);

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
      // Shockwave burst + force flee
      this._addSpark(origin, def.color, 6.5, scene);
      for (const t of targets) {
        if (t.isDead || !t.worldPosition) continue;
        if (origin.distanceTo(t.worldPosition) < radius) {
          t.forceFlee?.();
          opts.onForceFlee?.([t]);
        }
      }
      return;
    }

    if (spellId === 'nova_burst') {
      // Two overlapping spark bursts — gold + white for bright explosion
      this._addSpark(origin, def.color, 8.5, scene);
      this._addSpark(origin, 0xffffff, 6.0, scene);
    }

    if (spellId === 'mass_animate') {
      this._addSpark(origin, def.color, 5.0, scene);
      return; // visual only
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
    // Portal-opening burst
    this._addSpark(pos, def.color, 3.5, scene);
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
    this._hymn.mesh.position.set(origin.x, 0.12, origin.z);
    scene.add(this._hymn.mesh);

    // Cast burst
    this._addSpark(origin, def.color, 4.5, scene);

    opts.onBattleHymn?.(duration);

    if (opts.party) {
      opts.party.followerDamageMult = 1.5;
    }
  }
}
