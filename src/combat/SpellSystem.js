import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
// ── VFX PRNG — deterministic, never Math.random() ────────────────────────────
const _vfxRand = mulberry32(0xF00DCAFE);
/** Phase 7h.4 — max 512 active particles across all SparkBursts.
 *  Each burst holds SparkBurst.COUNT=22 points, so cap = floor(512/22) = 23 bursts.
 *  Oldest burst is evicted (removed from scene) when the cap is hit. */
const MAX_SPARK_BURSTS = Math.floor(512 / 22); // 23
const SPELL_DEFS = {
    magic_bolt: { type: 'projectile', color: 0x44ddff, emissive: 0x0088bb, damage: 3, speed: 14, radius: 0.18, cooldown: 0.5 },
    flame_dart: { type: 'projectile', color: 0xff6600, emissive: 0xcc2200, damage: 5, speed: 18, radius: 0.15, cooldown: 0.5 },
    intimidate: { type: 'aoe', color: 0xff3300, emissive: 0x991100, damage: 0, speed: 0, radius: 10, cooldown: 8, aoeVfxDuration: 0.6 },
    nova_burst: { type: 'aoe', color: 0xffd700, emissive: 0x996600, damage: 8, speed: 0, radius: 12, cooldown: 15, aoeVfxDuration: 1.2 },
    chain_arc: { type: 'chain', color: 0x88eeff, emissive: 0x224488, damage: 6, speed: 22, radius: 0.22, cooldown: 5, bounces: 3 },
    void_rift: { type: 'zone', color: 0x7733cc, emissive: 0x330066, damage: 3, speed: 0, radius: 2, cooldown: 12, dotDuration: 8 },
    battle_hymn: { type: 'buff', color: 0xffcc44, emissive: 0xaa7700, damage: 0, speed: 0, radius: 0, cooldown: 20, buffDuration: 12 },
    mass_animate: { type: 'aoe', color: 0x88aa77, emissive: 0x334422, damage: 0, speed: 0, radius: 6, cooldown: 30, aoeVfxDuration: 1.5 },
    // ── Movement spells ──────────────────────────────────────────────────────
    blink: { type: 'movement', color: 0xaa44ff, emissive: 0x660099, damage: 0, speed: 0, radius: 0, cooldown: 8 },
    levitate: { type: 'movement', color: 0x88ddff, emissive: 0x224455, damage: 0, speed: 0, radius: 0, cooldown: 1 },
    fly: { type: 'movement', color: 0xffdd44, emissive: 0x886600, damage: 0, speed: 0, radius: 0, cooldown: 12 },
};
const FALLBACK_DEF = SPELL_DEFS.magic_bolt;
const PROJECTILE_LIFETIME = 3.0;
/** Blend two hex colours by averaging each RGB channel. */
function _blendColor(a, b) {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    return (((ar + br) >> 1) << 16) | (((ag + bg) >> 1) << 8) | ((ab + bb) >> 1);
}
// ── Projectile — comet with glowing core + additive trail ─────────────────────
class Projectile {
    pos;
    dir;
    targets;
    def;
    damageMult;
    onHit;
    mesh;
    _sphere;
    _trailAttr;
    _posHist = [];
    static TRAIL_N = 5;
    timer = PROJECTILE_LIFETIME;
    _hit = false;
    _hitPos = null;
    constructor(pos, dir, targets, def, damageMult, onHit) {
        this.pos = pos;
        this.dir = dir;
        this.targets = targets;
        this.def = def;
        this.damageMult = damageMult;
        this.onHit = onHit;
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
    get expired() { return this._hit || this.timer <= 0; }
    /** World position where the projectile struck an enemy (null if it timed out). */
    get hitPos() { return this._hitPos; }
    /** The spell's primary colour, used for impact VFX. */
    get spellColor() { return this.def.color; }
    update(dt, physics) {
        if (this.expired)
            return;
        this.timer -= dt;
        // Wall collision: cast a ray ahead this frame; explode if wall is within reach
        if (physics) {
            const moveDistance = this.def.speed * dt;
            const wallDist = physics.castRayVsWalls(this.pos, this.dir, moveDistance + 0.35);
            if (wallDist !== null && wallDist <= moveDistance + 0.15) {
                this.pos.addScaledVector(this.dir, wallDist);
                this.mesh.position.copy(this.pos);
                // _hitPos stays null → SpellSystem treats this as a wall fizzle
                this.timer = -1;
                return;
            }
        }
        this.pos.addScaledVector(this.dir, this.def.speed * dt);
        this.mesh.position.copy(this.pos);
        // Roll position history; write trail as local offsets from current pos
        this._posHist.unshift(this.pos.clone());
        if (this._posHist.length > Projectile.TRAIL_N + 1)
            this._posHist.pop();
        for (let i = 0; i < Projectile.TRAIL_N; i++) {
            const h = this._posHist[i + 1] ?? this.pos;
            this._trailAttr.setXYZ(i, h.x - this.pos.x, h.y - this.pos.y, h.z - this.pos.z);
        }
        this._trailAttr.needsUpdate = true;
        // Pulsing glow
        const pulse = 0.65 + 0.35 * Math.sin(this.timer * 22);
        this._sphere.material.opacity = pulse;
        for (const target of this.targets) {
            if (target.isDead || !target.worldPosition)
                continue;
            const dx = this.pos.x - target.worldPosition.x;
            const dz = this.pos.z - target.worldPosition.z;
            if (Math.sqrt(dx * dx + dz * dz) < this.def.radius + 0.45) {
                const dmg = Math.round(this.def.damage * this.damageMult);
                const applied = target.takeDamage(dmg);
                if (applied > 0)
                    this.onHit?.(target, applied);
                this._hitPos = this.pos.clone();
                this._hit = true;
                return;
            }
        }
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── AoeVfx — expanding torus ring + ground flash disc ────────────────────────
class AoeVfx {
    duration;
    mesh;
    _ring;
    _flash;
    _timer;
    constructor(pos, radius, color, duration) {
        this.duration = duration;
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
    get expired() { return this._timer <= 0; }
    update(dt) {
        if (this.expired)
            return;
        this._timer -= dt;
        const t = 1 - this._timer / this.duration; // 0→1
        // Ring expands and fades near end
        this._ring.scale.setScalar(Math.max(0.01, t));
        const ringMat = this._ring.material;
        ringMat.opacity = t < 0.75 ? 1.0 : 1.0 - (t - 0.75) / 0.25;
        // Flash fades out quickly
        const flashMat = this._flash.material;
        flashMat.opacity = Math.max(0, 0.55 * (1 - t * 5));
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── NovaWave — shader-driven "pebble in pond" ripple effect for nova_burst ────
//
//  A single PlaneGeometry with a ShaderMaterial replaces the old torus-ring
//  approach.  The vertex shader displaces geometry along Y using a Gaussian-
//  masked damped sine wave that travels outward from the cast origin.
//  24 Rapier raycasts (pre-computed at cast time) are passed as uWallDists[24]
//  so the shader discards fragments beyond each wall boundary — the wave visually
//  stops at pillars and walls in the dungeon/overworld.
//
//  Damage is deferred: enemies take damage only when the expanding wave front
//  sweeps past their snapshotted XZ position, matching the visual timing.
// ── GLSL — shared between vertex and fragment ─────────────────────────────────
const _NOVA_VERT = /* glsl */ `
  #define NUM_SECTORS 24
  #define PI 3.14159265358979

  uniform float uProgress;    // wave-front radius (0 → maxR)
  uniform float uMaxR;
  uniform float uBandHalf;    // Gaussian sigma for the pulse width
  uniform float uWallDists[NUM_SECTORS];

  varying float vWaveHeight;
  varying float vDist;
  varying vec2  vLocalXY;     // local-plane XY, needed in fragment for wall test

  void main() {
    // position.xy are the local XZ offsets (PlaneGeometry lies in XY, then
    // rotation.x = -PI/2 maps local-Y → world-Z, local-X → world-X).
    float dist = length(position.xy);
    // World-XZ angle: worldZ = -localY  →  atan(worldZ, worldX) = atan(-localY, localX)
    float worldAngle = atan(-position.y, position.x);

    // Find wall distance for this angular sector
    int sector = int(floor((worldAngle + PI) / (2.0 * PI / float(NUM_SECTORS))));
    sector = clamp(sector, 0, NUM_SECTORS - 1);
    float wallDist = uMaxR;
    for (int i = 0; i < NUM_SECTORS; i++) {
      if (i == sector) { wallDist = uWallDists[i]; }
    }

    // Gaussian pulse centred on the current wave front
    float fromFront = dist - uProgress;
    float pulse = exp(-(fromFront * fromFront) / (uBandHalf * uBandHalf));

    // Dampening: amplitude decays away from origin
    float damp = exp(-dist * 0.055);

    // Mask: no displacement beyond walls or max radius
    float wallMask = step(dist, min(wallDist - 0.08, uMaxR));

    // Damped sine gives the water-ripple "teeth" within the Gaussian pulse
    float wave = sin(dist * 3.8 - uProgress * 2.2) * pulse * damp * wallMask;

    vWaveHeight = wave;
    vDist       = dist;
    vLocalXY    = position.xy;

    // Displace in local-Z (= world-Y after rotation.x = -PI/2 → crest rises)
    vec3 displaced = vec3(position.x, position.y, position.z + wave * 0.42);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
const _NOVA_FRAG = /* glsl */ `
  #define NUM_SECTORS 24
  #define PI 3.14159265358979

  uniform vec3  uColor;
  uniform float uMaxR;
  uniform float uAlpha;
  uniform float uWallDists[NUM_SECTORS];

  varying float vWaveHeight;
  varying float vDist;
  varying vec2  vLocalXY;

  void main() {
    // Discard outside max radius
    if (vDist > uMaxR) discard;

    // Wall occlusion — same sector logic as vertex shader
    float worldAngle = atan(-vLocalXY.y, vLocalXY.x);
    int sector = int(floor((worldAngle + PI) / (2.0 * PI / float(NUM_SECTORS))));
    sector = clamp(sector, 0, NUM_SECTORS - 1);
    float wallDist = uMaxR;
    for (int i = 0; i < NUM_SECTORS; i++) {
      if (i == sector) { wallDist = uWallDists[i]; }
    }
    if (vDist > wallDist - 0.05) discard;

    // Brightness: wave crest glows, trough is dim
    float waveAbs   = abs(vWaveHeight);
    float brightness = waveAbs * 3.2 * uAlpha;

    // Soft fade near max radius
    float edgeFade = 1.0 - smoothstep(uMaxR * 0.85, uMaxR, vDist);
    brightness *= edgeFade;

    if (brightness < 0.005) discard;

    gl_FragColor = vec4(uColor * brightness, brightness * 0.88);
  }
`;
class NovaWave {
    _maxR;
    duration;
    onSplash;
    onWallImpact;
    mesh;
    _mat;
    _flashMat;
    _elapsed = 0;
    _remaining;
    _prevWaveFront = 0;
    _deferredTargets;
    _wallSparks;
    constructor(pos, _maxR, color, duration, deferredTargets, wallSparks, wallDists, // 24 Rapier wall distances, one per 15° sector
    onSplash, onWallImpact) {
        this._maxR = _maxR;
        this.duration = duration;
        this.onSplash = onSplash;
        this.onWallImpact = onWallImpact;
        this._remaining = duration + 0.4;
        this._deferredTargets = deferredTargets;
        this._wallSparks = wallSparks;
        this.mesh = new THREE.Group();
        // Place the Group at the caster's actual height so the wave sits on the
        // terrain surface rather than always at Y=0 (overworld fix).
        this.mesh.position.set(pos.x, pos.y + 0.01, pos.z);
        // ── Shader-driven displacement plane ─────────────────────────────────
        const geo = new THREE.PlaneGeometry(_maxR * 2, _maxR * 2, 80, 80);
        const colorObj = new THREE.Color(color);
        this._mat = new THREE.ShaderMaterial({
            uniforms: {
                uProgress: { value: 0 },
                uMaxR: { value: _maxR },
                uBandHalf: { value: _maxR * 0.13 },
                uColor: { value: colorObj },
                uAlpha: { value: 1.0 },
                uWallDists: { value: wallDists },
            },
            vertexShader: _NOVA_VERT,
            fragmentShader: _NOVA_FRAG,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const planeMesh = new THREE.Mesh(geo, this._mat);
        planeMesh.rotation.x = -Math.PI / 2;
        this.mesh.add(planeMesh);
        // ── Central blast flash (white disc, fades in ~0.22s) ─────────────────
        const flashGeo = new THREE.CircleGeometry(_maxR * 0.38, 40);
        this._flashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const flashMesh = new THREE.Mesh(flashGeo, this._flashMat);
        flashMesh.rotation.x = -Math.PI / 2;
        this.mesh.add(flashMesh);
    }
    get expired() { return this._remaining <= 0; }
    update(dt) {
        if (this.expired)
            return;
        this._remaining -= dt;
        this._elapsed += dt;
        // Wave front expands from 0 → maxR over `duration` seconds
        const waveFront = Math.min(this._maxR, (this._elapsed / this.duration) * this._maxR);
        this._mat.uniforms.uProgress.value = waveFront;
        // Fade alpha near end of lifetime
        this._mat.uniforms.uAlpha.value = Math.min(1.0, this._remaining / 0.3);
        // ── Deferred damage: fires as wave front reaches each enemy ────────────
        for (const t of this._deferredTargets) {
            if (t.fired)
                continue;
            const dx = t.pos.x - this.mesh.position.x;
            const dz = t.pos.z - this.mesh.position.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d > this._prevWaveFront && d <= waveFront) {
                t.fired = true;
                if (t.damage > 0) {
                    const applied = t.entity.takeDamage(t.damage);
                    if (applied > 0)
                        t.onHit?.(t.entity, applied);
                }
                this.onSplash(new THREE.Vector3(t.pos.x, this.mesh.position.y + 0.5, t.pos.z));
            }
        }
        // ── Wall impact sparks: fire when wave front reaches each wall hit ─────
        for (const ws of this._wallSparks) {
            if (ws.fired)
                continue;
            if (ws.dist > this._prevWaveFront && ws.dist <= waveFront) {
                ws.fired = true;
                this.onWallImpact(ws.pos.clone());
            }
        }
        this._prevWaveFront = waveFront;
        // ── Central flash fades quickly ────────────────────────────────────────
        this._flashMat.opacity = Math.max(0, 0.7 * (1 - this._elapsed * 4.5));
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── LightningBolt — jagged midpoint-displaced tube with crawling flicker ──────
//    Replaces the old straight CylinderGeometry ChainSegment
class LightningBolt {
    mesh;
    _coreMesh;
    _glowMesh;
    _timer = 0.45;
    _flickerTimer = 0;
    _from;
    _to;
    _color;
    constructor(from, to, color) {
        this._from = from.clone();
        this._to = to.clone();
        this._color = color;
        this.mesh = new THREE.Group();
        const { curve, segs } = this._buildCurve();
        // Thin white core — bright centre of the bolt
        this._coreMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.012, 4, false), new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        // Wider coloured glow layer
        this._glowMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.065, 5, false), new THREE.MeshBasicMaterial({
            color: this._color,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        }));
        this.mesh.add(this._coreMesh);
        this.mesh.add(this._glowMesh);
    }
    get expired() { return this._timer <= 0; }
    /** Update the far endpoint so the bolt stretches to follow a moving projectile. */
    setEndpoint(to) {
        this._to.copy(to);
    }
    /** Prevent the bolt from expiring — call each frame while a live projectile trails it. */
    keepAlive() {
        this._timer = 0.45;
    }
    update(dt) {
        if (this.expired)
            return;
        this._timer -= dt;
        this._flickerTimer -= dt;
        // Fade at very end + instant random flicker
        const fade = Math.min(1, this._timer / 0.08);
        const flicker = _vfxRand() < 0.25 ? 0.3 : 1.0;
        this._coreMesh.material.opacity = 0.95 * fade * flicker;
        this._glowMesh.material.opacity = 0.60 * fade * flicker;
        // Regenerate jagged path every 40–70 ms for crawling electricity
        if (this._flickerTimer <= 0) {
            this._flickerTimer = 0.04 + _vfxRand() * 0.03;
            this._regen();
        }
    }
    _buildCurve() {
        const pts = this._displace(this._from, this._to, 4, 0.42);
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.05);
        return { curve, segs: Math.max(16, pts.length * 3) };
    }
    _regen() {
        const { curve, segs } = this._buildCurve();
        this._coreMesh.geometry.dispose();
        this._coreMesh.geometry = new THREE.TubeGeometry(curve, segs, 0.012, 4, false);
        this._glowMesh.geometry.dispose();
        this._glowMesh.geometry = new THREE.TubeGeometry(curve, segs, 0.065, 5, false);
    }
    /** Recursive midpoint displacement — turns a line into jagged lightning */
    _displace(a, b, depth, spread) {
        if (depth === 0)
            return [a.clone(), b.clone()];
        const dir = new THREE.Vector3().subVectors(b, a);
        const mid = a.clone().addScaledVector(dir, 0.4 + _vfxRand() * 0.2);
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);
        if (perp.lengthSq() > 0.0001)
            perp.normalize();
        mid.addScaledVector(perp, (_vfxRand() - 0.5) * 2 * spread * dir.length());
        mid.y += (_vfxRand() - 0.5) * 0.45;
        const L = this._displace(a, mid, depth - 1, spread * 0.55);
        const R = this._displace(mid, b, depth - 1, spread * 0.55);
        return [...L.slice(0, -1), ...R];
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── SparkBurst — radial explosion of additive point particles ─────────────────
class SparkBurst {
    mesh;
    static COUNT = 22;
    static DUR = 0.55;
    _timer = SparkBurst.DUR;
    _vel;
    _posAttr;
    constructor(pos, color, speed = 5.5) {
        const positions = new Float32Array(SparkBurst.COUNT * 3);
        this._vel = [];
        for (let i = 0; i < SparkBurst.COUNT; i++) {
            positions[i * 3] = pos.x;
            positions[i * 3 + 1] = pos.y;
            positions[i * 3 + 2] = pos.z;
            const theta = _vfxRand() * Math.PI * 2;
            const phi = _vfxRand() * Math.PI;
            const spd = speed * (0.3 + _vfxRand() * 0.7);
            this._vel.push(new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * spd, Math.abs(Math.cos(phi)) * spd * 0.55 + 1.5, Math.sin(phi) * Math.sin(theta) * spd));
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
    get expired() { return this._timer <= 0; }
    update(dt) {
        if (this.expired)
            return;
        this._timer -= dt;
        for (let i = 0; i < SparkBurst.COUNT; i++) {
            const v = this._vel[i];
            v.y -= 11 * dt; // gravity
            this._posAttr.setXYZ(i, this._posAttr.getX(i) + v.x * dt, this._posAttr.getY(i) + v.y * dt, this._posAttr.getZ(i) + v.z * dt);
        }
        this._posAttr.needsUpdate = true;
        const t = this._timer / SparkBurst.DUR;
        this.mesh.material.opacity = t * t;
    }
    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
// ── ZoneEntity — void rift DoT disc + rising mist wisps ──────────────────────
class ZoneEntity {
    radius;
    damagePerSecond;
    damageMult;
    onHit;
    mesh;
    _disc;
    _wispAttr;
    _wispMat;
    static WISP_N = 24;
    _wispVels;
    _timer;
    _dotTimer = 1.0;
    _t = 0;
    constructor(pos, radius, color, dotDuration, damagePerSecond, damageMult, onHit) {
        this.radius = radius;
        this.damagePerSecond = damagePerSecond;
        this.damageMult = damageMult;
        this.onHit = onHit;
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
            const r = _vfxRand() * radius * 0.88;
            wispPos[i * 3] = Math.cos(angle) * r;
            wispPos[i * 3 + 1] = _vfxRand() * 2.0;
            wispPos[i * 3 + 2] = Math.sin(angle) * r;
            this._wispVels.push(new THREE.Vector3((_vfxRand() - 0.5) * 0.35, 0.45 + _vfxRand() * 0.55, (_vfxRand() - 0.5) * 0.35));
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
    get expired() { return this._timer <= 0; }
    update(dt, targets) {
        if (this.expired)
            return;
        this._timer -= dt;
        this._t += dt;
        // Pulsing disc
        const pulse = 0.25 + 0.15 * Math.abs(Math.sin(this._t * 2.5));
        const fade = this._timer < 1.5 ? this._timer / 1.5 : 1;
        this._disc.material.opacity = pulse * fade;
        // Animate wisps — rise and loop back to floor
        for (let i = 0; i < ZoneEntity.WISP_N; i++) {
            const v = this._wispVels[i];
            let x = this._wispAttr.getX(i) + v.x * dt;
            let y = this._wispAttr.getY(i) + v.y * dt;
            let z = this._wispAttr.getZ(i) + v.z * dt;
            if (y > 2.8) {
                const angle = _vfxRand() * Math.PI * 2;
                const r = _vfxRand() * this.radius * 0.88;
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
                if (target.isDead || !target.worldPosition)
                    continue;
                const dx = this.mesh.position.x - target.worldPosition.x;
                const dz = this.mesh.position.z - target.worldPosition.z;
                if (Math.sqrt(dx * dx + dz * dz) < this.radius + 0.4) {
                    const applied = target.takeDamage(dmg);
                    if (applied > 0)
                        this.onHit?.(target, applied);
                }
            }
        }
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── HymnAura — gold ring + orbiting spark particles ──────────────────────────
class HymnAura {
    mesh;
    _ring;
    _sparkAttr;
    _sparkMat;
    static SPARK_N = 10;
    _orbits;
    _timer;
    _t = 0;
    constructor(duration) {
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
            speed: 0.65 + _vfxRand() * 0.85,
            phase: (i / HymnAura.SPARK_N) * Math.PI * 2 + _vfxRand() * 0.6,
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
    get expired() { return this._timer <= 0; }
    get remaining() { return this._timer; }
    update(dt, playerPos) {
        if (this.expired)
            return;
        this._timer -= dt;
        this._t += dt;
        this.mesh.position.set(playerPos.x, 0.12, playerPos.z);
        this._ring.rotation.z += dt * 0.55;
        // Orbiting sparks in local space — group is at playerPos so sparks orbit player
        for (let i = 0; i < HymnAura.SPARK_N; i++) {
            const o = this._orbits[i];
            const angle = o.phase + this._t * o.speed;
            this._sparkAttr.setXYZ(i, Math.cos(angle) * o.radius, o.height + Math.sin(this._t * 2.2 + o.phase) * 0.28, Math.sin(angle) * o.radius);
        }
        this._sparkAttr.needsUpdate = true;
        const fade = this._timer < 2 ? this._timer / 2 : 1;
        const twinkle = 0.42 + 0.28 * Math.sin(this._t * 3);
        this._ring.material.opacity = twinkle * fade;
        this._sparkMat.opacity = fade * (0.6 + 0.4 * Math.sin(this._t * 7.5));
        if (this._timer < 2)
            this._sparkMat.opacity *= this._timer / 2;
    }
    dispose() {
        this.mesh.traverse(child => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
    }
}
// ── SpellSystem ───────────────────────────────────────────────────────────────
export class SpellSystem {
    _projectiles = [];
    _aoeVfx = [];
    _novaWaves = [];
    _bolts = [];
    _sparks = [];
    _zones = [];
    _hymn = null;
    _cooldowns = new Map();
    /** When true all cooldowns are skipped — set by the dev panel. */
    instantCooldowns = false;
    /**
     * Register a hybrid spell blended from two base spells.
     * Called by SpellForge when the player fuses two spells at a cauldron.
     */
    _registerHybridSpell(id, _name, baseA, baseB) {
        const a = (SPELL_DEFS[baseA] ?? FALLBACK_DEF);
        const b = (SPELL_DEFS[baseB] ?? FALLBACK_DEF);
        // Blend properties; type is taken from baseA for behaviour consistency
        SPELL_DEFS[id] = {
            type: a.type,
            color: _blendColor(a.color, b.color),
            emissive: _blendColor(a.emissive, b.emissive),
            damage: Math.round((a.damage + b.damage) * 0.7),
            speed: (a.speed + b.speed) / 2,
            radius: (a.radius + b.radius) / 2,
            cooldown: (a.cooldown + b.cooldown) / 2,
            bounces: a.bounces !== undefined ? Math.ceil((a.bounces + (b.bounces ?? 0)) / 2) : undefined,
            dotDuration: a.dotDuration !== undefined ? (a.dotDuration + (b.dotDuration ?? 0)) / 2 : undefined,
            aoeVfxDuration: a.aoeVfxDuration !== undefined ? (a.aoeVfxDuration + (b.aoeVfxDuration ?? 0)) / 2 : undefined,
            buffDuration: a.buffDuration !== undefined ? (a.buffDuration + (b.buffDuration ?? 0)) / 2 : undefined,
        };
    }
    /** Latest PhysicsWorld reference, stored each update() for use in _fireAoe. */
    _physics;
    // ── Public query ─────────────────────────────────────────────────────────
    /** 0 = ready, 1 = just cast; decreases to 0 over cooldown duration. */
    cooldownFraction(spellId) {
        const cd = this._cooldowns.get(spellId);
        if (!cd || cd.remaining <= 0)
            return 0;
        return cd.remaining / cd.duration;
    }
    /** Returns remaining cooldown in seconds (0 when ready). */
    cooldownRemaining(spellId) {
        if (this.instantCooldowns)
            return 0;
        const cd = this._cooldowns.get(spellId);
        if (!cd || cd.remaining <= 0)
            return 0;
        return cd.remaining;
    }
    isReady(spellId) {
        if (this.instantCooldowns)
            return true;
        const cd = this._cooldowns.get(spellId);
        return !cd || cd.remaining <= 0;
    }
    /** Whether Battle Hymn aura is currently active. */
    get battleHymnActive() { return !!this._hymn && !this._hymn.expired; }
    /**
     * Returns the primary visual hex colour for a spell (0xRRGGBB).
     * Useful for creating matching light pulses on cast.
     */
    getSpellColor(spellId) {
        return SPELL_DEFS[spellId]?.color ?? 0xffffff;
    }
    // ── Cast ─────────────────────────────────────────────────────────────────
    /**
     * Attempt to cast a spell.  Returns false if the spell is on cooldown.
     * Routes by SpellType and handles all VFX internally.
     */
    cast(spellId, origin, aimTarget, targets, scene, onHit, opts = {}) {
        if (!this.isReady(spellId))
            return false;
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
            case 'movement':
                this._fireMovement(spellId, origin, def, scene, opts);
                break;
        }
        return true;
    }
    // ── Legacy fire() — kept for backwards compat ─────────────────────────────
    fire(origin, aimTarget, targets, scene, onHit, spellId = 'magic_bolt') {
        this.cast(spellId, origin, aimTarget, targets, scene, onHit);
    }
    // ── Update ────────────────────────────────────────────────────────────────
    update(dt, scene, targets, playerPos, physics) {
        if (physics)
            this._physics = physics;
        // Cooldown timers
        for (const [, cd] of this._cooldowns) {
            cd.remaining = Math.max(0, cd.remaining - dt);
        }
        // Projectiles — wall collision + impact VFX on expire
        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            const p = this._projectiles[i];
            p.update(dt, physics);
            if (p.expired) {
                // Impact or wall-fizzle spark burst
                const impactPos = p.hitPos ?? p.mesh.position;
                this._addSpark(impactPos, p.spellColor, p.hitPos ? 7.0 : 4.0, scene);
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
        // Nova burst wave ripples (splash points snapshotted at cast time)
        for (let i = this._novaWaves.length - 1; i >= 0; i--) {
            const w = this._novaWaves[i];
            w.update(dt);
            if (w.expired) {
                scene.remove(w.mesh);
                w.dispose();
                this._novaWaves.splice(i, 1);
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
    _setCooldown(spellId, duration) {
        if (this.instantCooldowns)
            return; // dev: skip all cooldowns
        this._cooldowns.set(spellId, { remaining: duration, duration });
    }
    _addSpark(pos, color, speed, scene) {
        // Phase 7h.4: evict oldest burst if we'd exceed the 512-particle budget
        if (this._sparks.length >= MAX_SPARK_BURSTS) {
            const oldest = this._sparks.shift();
            scene.remove(oldest.mesh);
            oldest.dispose();
        }
        const burst = new SparkBurst(pos, color, speed);
        scene.add(burst.mesh);
        this._sparks.push(burst);
    }
    _fireProjectile(origin, aimTarget, targets, def, dmgMult, scene, onHit) {
        const dir = new THREE.Vector3().subVectors(aimTarget, origin).setY(0).normalize();
        const spawnPos = origin.clone().addScaledVector(dir, 0.6);
        spawnPos.y = origin.y + 0.5;
        const proj = new Projectile(spawnPos, dir, targets, def, dmgMult, onHit);
        scene.add(proj.mesh);
        this._projectiles.push(proj);
    }
    /**
     * Chain Arc — instant lightning strike from player to cursor.
     * If an enemy is near the cursor, chains to adjacent enemies up to `bounces` times.
     * No projectile is fired; all bolts and damage are resolved immediately.
     */
    _fireChain(origin, aimTarget, targets, def, dmgMult, scene, onHit) {
        const bounces = def.bounces ?? 0;
        const strikeY = origin.y + 0.7; // chest-height for the bolt
        const originPt = new THREE.Vector3(origin.x, strikeY, origin.z);
        const cursorPt = new THREE.Vector3(aimTarget.x, strikeY, aimTarget.z);
        // Conjuring spark at player's position
        this._addSpark(originPt, def.color, 3.5, scene);
        // Primary bolt: player → cursor (always drawn, regardless of enemy)
        const primaryBolt = new LightningBolt(originPt, cursorPt, def.color);
        scene.add(primaryBolt.mesh);
        this._bolts.push(primaryBolt);
        // Hit detection: nearest enemy within 2.8u of cursor (XZ only — ignores
        // terrain height differences which would skew 3D distance in the overworld).
        const hitTargets = new Set();
        let initialHit = null;
        let bestDist = 2.8;
        for (const t of targets) {
            if (t.isDead || !t.worldPosition)
                continue;
            const dx = aimTarget.x - t.worldPosition.x;
            const dz = aimTarget.z - t.worldPosition.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < bestDist) {
                bestDist = d;
                initialHit = t;
            }
        }
        if (!initialHit) {
            // No enemy at cursor — fizzle spark and done
            this._addSpark(cursorPt, def.color, 3.0, scene);
            return;
        }
        // Strike the initial target
        this._addSpark(cursorPt, def.color, 6.0, scene);
        const dmg = Math.round(def.damage * dmgMult);
        const applied = initialHit.takeDamage(dmg);
        if (applied > 0)
            onHit?.(initialHit, applied);
        hitTargets.add(initialHit);
        let chainFrom = new THREE.Vector3(initialHit.worldPosition.x, strikeY, initialHit.worldPosition.z);
        // Chain bounces — each bolt jumps to the nearest unhit enemy within 6u
        let bounceMult = dmgMult * 0.85;
        for (let b = 0; b < bounces; b++) {
            let nextTarget = null;
            let nextDist = 6.0;
            for (const t of targets) {
                if (hitTargets.has(t) || t.isDead || !t.worldPosition)
                    continue;
                const d = new THREE.Vector3(t.worldPosition.x, strikeY, t.worldPosition.z)
                    .distanceTo(chainFrom);
                if (d < nextDist) {
                    nextDist = d;
                    nextTarget = t;
                }
            }
            if (!nextTarget?.worldPosition)
                break;
            const nextPt = new THREE.Vector3(nextTarget.worldPosition.x, strikeY, nextTarget.worldPosition.z);
            // Chain bolt + arrival spark
            const chainBolt = new LightningBolt(chainFrom, nextPt, def.color);
            scene.add(chainBolt.mesh);
            this._bolts.push(chainBolt);
            this._addSpark(chainFrom, def.color, 4.5, scene);
            // Chain damage (diminishes per bounce)
            const chainDmg = Math.round(def.damage * bounceMult);
            const chainApplied = nextTarget.takeDamage(chainDmg);
            if (chainApplied > 0)
                onHit?.(nextTarget, chainApplied);
            hitTargets.add(nextTarget);
            chainFrom = nextPt;
            bounceMult *= 0.85;
        }
        // Final impact spark at last chain point
        this._addSpark(chainFrom, def.color, 4.5, scene);
    }
    _fireAoe(origin, targets, def, dmgMult, aoeRMult, scene, onHit, opts = {}, spellId = '') {
        const radius = def.radius * aoeRMult;
        const vfxDur = def.aoeVfxDuration ?? 0.8;
        if (spellId === 'nova_burst') {
            // ── Nova Burst: shader-driven ripple wave ─────────────────────────────
            // 1. Pre-cast 24 Rapier wall rays (one every 15°) to fill the wall-distance
            //    uniform used by the shader for geometry-level wall clipping.
            const NUM_SECTORS = 24;
            const wallDists = new Float32Array(NUM_SECTORS).fill(radius);
            const rayOrigin = new THREE.Vector3(origin.x, origin.y + 0.5, origin.z);
            const wallSparks = [];
            for (let i = 0; i < NUM_SECTORS; i++) {
                // Angle sector i covers [-PI + i*dA, -PI + (i+1)*dA)
                const angle = -Math.PI + i * (2 * Math.PI / NUM_SECTORS);
                const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                const hit = this._physics?.castRayVsWalls(rayOrigin, dir, radius + 0.5) ?? null;
                if (hit !== null && hit < radius) {
                    wallDists[i] = hit;
                    const hitPos = new THREE.Vector3(origin.x + Math.cos(angle) * hit, origin.y, origin.z + Math.sin(angle) * hit);
                    wallSparks.push({ pos: hitPos, dist: hit, fired: false });
                }
            }
            // 2. Snapshot target positions + snapshot damage for deferred application.
            //    Damage fires as the wave front reaches each enemy — no instant kills.
            const novaDmg = Math.round(def.damage * dmgMult);
            const deferredTargets = [];
            for (const t of targets) {
                if (t.isDead || !t.worldPosition)
                    continue;
                if (origin.distanceTo(t.worldPosition) < radius + 0.4) {
                    deferredTargets.push({
                        pos: t.worldPosition.clone(),
                        entity: t,
                        damage: novaDmg,
                        onHit,
                        fired: false,
                    });
                }
            }
            // 3. Create wave — ShaderMaterial plane with Rapier wall data baked in.
            const wave = new NovaWave(origin, radius, def.color, vfxDur, deferredTargets, wallSparks, wallDists, (splashPos) => this._addSpark(splashPos, def.color, 5.0, scene), (impactPos) => this._addSpark(impactPos, 0xffffff, 3.5, scene));
            scene.add(wave.mesh);
            this._novaWaves.push(wave);
            // Central detonation sparks
            this._addSpark(origin, def.color, 9.0, scene);
            this._addSpark(origin, 0xffffff, 6.5, scene);
            return;
        }
        // ── Generic AOE ring VFX (intimidate, mass_animate) ──────────────────
        const vfx = new AoeVfx(origin, radius, def.color, vfxDur);
        scene.add(vfx.mesh);
        this._aoeVfx.push(vfx);
        if (spellId === 'intimidate') {
            // Shockwave burst + force flee
            this._addSpark(origin, def.color, 6.5, scene);
            for (const t of targets) {
                if (t.isDead || !t.worldPosition)
                    continue;
                if (origin.distanceTo(t.worldPosition) < radius) {
                    t.forceFlee?.();
                    opts.onForceFlee?.([t]);
                }
            }
            return;
        }
        if (spellId === 'mass_animate') {
            this._addSpark(origin, def.color, 5.0, scene);
            return; // visual only
        }
        // Standard AOE damage
        const dmg = Math.round(def.damage * dmgMult);
        if (dmg > 0) {
            for (const t of targets) {
                if (t.isDead || !t.worldPosition)
                    continue;
                if (origin.distanceTo(t.worldPosition) < radius + 0.4) {
                    const applied = t.takeDamage(dmg);
                    if (applied > 0)
                        onHit?.(t, applied);
                }
            }
        }
    }
    _fireZone(pos, _targets, def, dmgMult, scene, onHit) {
        const zone = new ZoneEntity(pos, def.radius, def.color, def.dotDuration ?? 8, def.damage, dmgMult, onHit);
        scene.add(zone.mesh);
        this._zones.push(zone);
        // Portal-opening burst
        this._addSpark(pos, def.color, 3.5, scene);
    }
    _fireBuff(origin, def, scene, opts) {
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
    // ── Movement spells ─────────────────────────────────────────────────────
    _fireMovement(spellId, origin, def, scene, opts) {
        if (spellId === 'blink') {
            // VFX at origin; destination computed + wall-checked by caller via onBlink
            this._blinkVfx(origin, def.color, scene);
            opts.onBlink?.(origin); // caller receives origin, calculates dest from mouseWorld
        }
        else if (spellId === 'levitate') {
            // Toggle levitation — player floats up and holds height
            this._addSpark(origin, def.color, 3.0, scene);
            opts.onLevitateToggle?.();
        }
        else if (spellId === 'fly') {
            // Burst of speed in facing direction
            this._addSpark(origin, def.color, 5.0, scene);
            opts.onFlyBurst?.(0 /* facingAngle from player */);
        }
    }
    /** Blink VFX: fading ring at origin + flash sphere at destination offset. */
    /** Shadow smoke at the blink origin — dark wisps that rise and dissolve. */
    _blinkVfx(origin, _color, scene) {
        // 4 dark shadow wisps rising from origin — no bright colors, no arcane ring
        for (let i = 0; i < 4; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x110016,
                transparent: true,
                opacity: 0.7 - i * 0.12,
            });
            const geo = new THREE.SphereGeometry(0.18 + i * 0.06, 6, 4);
            const mesh = new THREE.Mesh(geo, mat);
            const angle = (i / 4) * Math.PI * 2;
            mesh.position.set(origin.x + Math.cos(angle) * 0.3, origin.y + 0.4, origin.z + Math.sin(angle) * 0.3);
            scene.add(mesh);
            const startT = performance.now();
            const riseSpeed = 1.2 + i * 0.3;
            const animate = () => {
                const t = (performance.now() - startT) / 550;
                if (t >= 1) {
                    scene.remove(mesh);
                    geo.dispose();
                    mat.dispose();
                    return;
                }
                // Wavy upward drift — each wisp wobbles slightly sideways
                mesh.position.y = origin.y + 0.4 + t * riseSpeed;
                mesh.position.x = origin.x + Math.cos(angle) * 0.3 + Math.sin(t * 6 + i) * 0.1;
                mesh.position.z = origin.z + Math.sin(angle) * 0.3 + Math.cos(t * 6 + i) * 0.1;
                mat.opacity = (0.7 - i * 0.12) * (1 - t);
                mesh.scale.setScalar(1 + t * 0.6);
                requestAnimationFrame(animate);
            };
            requestAnimationFrame(animate);
        }
        // Dark shadow disc on the ground
        const discGeo = new THREE.CircleGeometry(0.7, 20);
        discGeo.rotateX(-Math.PI / 2);
        const discMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(origin.x, origin.y + 0.02, origin.z);
        scene.add(disc);
        const discStart = performance.now();
        const animDisc = () => {
            const t = (performance.now() - discStart) / 400;
            if (t >= 1) {
                scene.remove(disc);
                discGeo.dispose();
                discMat.dispose();
                return;
            }
            discMat.opacity = 0.55 * (1 - t * t);
            disc.scale.setScalar(1 + t * 1.2);
            requestAnimationFrame(animDisc);
        };
        requestAnimationFrame(animDisc);
    }
}
