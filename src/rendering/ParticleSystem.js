/**
 * ParticleSystem — Phase 7.5d
 *
 * Pooled CPU particle system using a single THREE.Points object per scene.
 * Particles are stored in flat TypedArrays for fast per-frame updates.
 * Dead particles are moved to y=-10000 so they are invisible without needing
 * per-particle alpha (which THREE.PointsMaterial doesn't support natively).
 * AdditiveBlending makes fading-to-black equivalent to fading-to-transparent.
 *
 * API:
 *   burst(pos, color, count?, speed?, lifetime?)  — one-shot explosion
 *   emit(pos, color, vx?, vy?, vz?, lifetime?)    — single particle (trails)
 *   addEmitter(pos, cfg)                          — continuous emitter
 *   addTorchFire(pos)                             — convenience: warm orange fire
 *   addAmbientDust(region, color)                 — slow-drifting room dust
 *   update(dt)                                    — call every frame
 *   dispose()                                     — remove from scene + free GPU
 */
import * as THREE from 'three';
// ── Constants ─────────────────────────────────────────────────────────────────
/** Maximum number of simultaneous particles. Increase if effects feel sparse. */
const MAX = 1500;
const GRAVITY = 4.5; // world units per second²
const EMITTER_DEFAULTS = {
    color: 0xffffff,
    rate: 20,
    speed: 1.0,
    lifetime: 0.6,
    upBias: 0,
    spread: Math.PI,
    gravity: true,
};
// ── ParticleSystem ────────────────────────────────────────────────────────────
export class ParticleSystem {
    // ── Flat TypedArray particle pool ─────────────────────────────────────────
    //   Positions written to geometry each frame.
    //   Start colours are stored separately so we can fade without recalculating.
    _pos = new Float32Array(MAX * 3);
    _vel = new Float32Array(MAX * 3);
    _startCol = new Float32Array(MAX * 3);
    _colBuf = new Float32Array(MAX * 3);
    _age = new Float32Array(MAX);
    _life = new Float32Array(MAX);
    _alive = new Uint8Array(MAX);
    _hasGrav = new Uint8Array(MAX);
    _free = Array.from({ length: MAX }, (_, i) => MAX - 1 - i);
    _liveCount = 0;
    // ── THREE objects ──────────────────────────────────────────────────────────
    _geo;
    _mat;
    _points;
    _scene;
    // ── Continuous emitters ────────────────────────────────────────────────────
    _emitters = [];
    // ── Reusable scratch colour ────────────────────────────────────────────────
    _scratch = new THREE.Color();
    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(scene) {
        this._scene = scene;
        // All dead particles start off-screen
        for (let i = 0; i < MAX; i++) {
            this._pos[i * 3 + 1] = -10000;
        }
        this._geo = new THREE.BufferGeometry();
        this._geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
        this._geo.setAttribute('color', new THREE.BufferAttribute(this._colBuf, 3));
        this._geo.setDrawRange(0, MAX);
        this._mat = new THREE.PointsMaterial({
            size: 0.14,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            sizeAttenuation: true,
        });
        this._points = new THREE.Points(this._geo, this._mat);
        this._points.frustumCulled = false;
        scene.add(this._points);
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    /** Live particle count (diagnostic). */
    get liveCount() { return this._liveCount; }
    /**
     * Emit a one-shot burst of `count` particles at `pos`.
     *
     * @param pos       World-space origin.
     * @param color     Hex colour.
     * @param count     Number of particles (default 20).
     * @param speed     Speed in WU/s (default 3.5).
     * @param lifetime  Seconds alive (default 0.55).
     */
    burst(pos, color, count = 20, speed = 3.5, lifetime = 0.55) {
        this._scratch.setHex(color);
        for (let n = 0; n < count; n++) {
            const slot = this._alloc();
            if (slot < 0)
                return;
            this._pos[slot * 3] = pos.x;
            this._pos[slot * 3 + 1] = pos.y;
            this._pos[slot * 3 + 2] = pos.z;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const s = speed * (0.5 + Math.random() * 0.5);
            this._vel[slot * 3] = s * Math.sin(phi) * Math.cos(theta);
            this._vel[slot * 3 + 1] = s * Math.cos(phi) + 1.2;
            this._vel[slot * 3 + 2] = s * Math.sin(phi) * Math.sin(theta);
            this._setColor(slot, this._scratch);
            this._age[slot] = 0;
            this._life[slot] = lifetime * (0.7 + Math.random() * 0.6);
            this._hasGrav[slot] = 1;
        }
    }
    /**
     * Emit a single particle (useful for per-frame trails).
     *
     * @param pos      Origin.
     * @param color    Hex colour.
     * @param vx,vy,vz  Velocity (WU/s). Default: random sphere direction.
     * @param lifetime  Seconds alive (default 0.45).
     * @param gravity   Whether gravity applies (default true).
     */
    emit(pos, color, vx = (Math.random() - 0.5) * 2, vy = Math.random() * 2, vz = (Math.random() - 0.5) * 2, lifetime = 0.45, gravity = true) {
        const slot = this._alloc();
        if (slot < 0)
            return;
        this._pos[slot * 3] = pos.x;
        this._pos[slot * 3 + 1] = pos.y;
        this._pos[slot * 3 + 2] = pos.z;
        this._vel[slot * 3] = vx;
        this._vel[slot * 3 + 1] = vy;
        this._vel[slot * 3 + 2] = vz;
        this._scratch.setHex(color);
        this._setColor(slot, this._scratch);
        this._age[slot] = 0;
        this._life[slot] = lifetime;
        this._hasGrav[slot] = gravity ? 1 : 0;
    }
    /**
     * Add a continuous emitter at `pos`.
     * Returns a handle to reposition or stop it.
     */
    addEmitter(pos, cfg = {}) {
        const e = {
            ...EMITTER_DEFAULTS,
            ...cfg,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            timer: 0,
            active: true,
        };
        this._emitters.push(e);
        return {
            setPos(x, y, z) { e.x = x; e.y = y; e.z = z; },
            stop() { e.active = false; },
            get active() { return e.active; },
        };
    }
    /**
     * Convenience: warm orange torch-fire particles drifting upward.
     * Place at the torch world position.
     */
    addTorchFire(pos) {
        return this.addEmitter(pos, {
            color: 0xff7722,
            rate: 22,
            speed: 0.5,
            lifetime: 0.55,
            upBias: 1.8,
            spread: 0.4,
            gravity: false,
        });
    }
    /**
     * Convenience: slow-drifting ambient dust motes for dungeon atmosphere.
     *
     * @param center  Centre of the dust region.
     * @param radius  XZ scatter radius (WU).
     * @param color   Hex colour (default pale blue-grey).
     */
    addAmbientDust(center, radius = 6.0, color = 0x8899bb) {
        // We override emitParticle to scatter randomly in the region.
        // Use a low-rate standard emitter but override x/z in update.
        const handle = this.addEmitter(center, {
            color,
            rate: 6,
            speed: 0.15,
            lifetime: 3.0,
            upBias: 0.08,
            spread: Math.PI,
            gravity: false,
        });
        // Store radius as a tag on the emitter (last one added)
        const e = this._emitters[this._emitters.length - 1];
        e.dustRadius = radius;
        return handle;
    }
    /**
     * Per-frame update. Call once per animation frame.
     * @param dt  Delta time in seconds.
     */
    update(dt) {
        if (dt <= 0)
            return;
        // ── Tick continuous emitters ────────────────────────────────────────────
        for (const e of this._emitters) {
            if (!e.active)
                continue;
            e.timer += dt;
            const interval = 1 / e.rate;
            while (e.timer >= interval) {
                e.timer -= interval;
                this._emitFromContinuous(e);
            }
        }
        // ── Cull dead emitters ──────────────────────────────────────────────────
        if (this._emitters.length > 50) {
            for (let i = this._emitters.length - 1; i >= 0; i--) {
                if (!this._emitters[i].active)
                    this._emitters.splice(i, 1);
            }
        }
        // ── Tick live particles ─────────────────────────────────────────────────
        let dirty = false;
        for (let s = 0; s < MAX; s++) {
            if (!this._alive[s])
                continue;
            dirty = true;
            this._age[s] += dt;
            const age = this._age[s];
            const life = this._life[s];
            if (age >= life) {
                this._free_slot(s);
                continue;
            }
            const i3 = s * 3;
            // Gravity
            if (this._hasGrav[s]) {
                this._vel[i3 + 1] -= GRAVITY * dt;
            }
            // Integrate position
            this._pos[i3] += this._vel[i3] * dt;
            this._pos[i3 + 1] += this._vel[i3 + 1] * dt;
            this._pos[i3 + 2] += this._vel[i3 + 2] * dt;
            // Fade colour to black (with AdditiveBlending this = fade-to-transparent)
            const fade = Math.max(0, 1 - (age / life) ** 1.5);
            this._colBuf[i3] = this._startCol[i3] * fade;
            this._colBuf[i3 + 1] = this._startCol[i3 + 1] * fade;
            this._colBuf[i3 + 2] = this._startCol[i3 + 2] * fade;
        }
        if (dirty || this._liveCount > 0) {
            this._geo.attributes['position'].needsUpdate = true;
            this._geo.attributes['color'].needsUpdate = true;
        }
    }
    /** Remove from scene and free GPU memory. */
    dispose() {
        this._scene.remove(this._points);
        this._geo.dispose();
        this._mat.dispose();
        this._emitters.length = 0;
    }
    // ── Private helpers ────────────────────────────────────────────────────────
    _alloc() {
        if (this._free.length === 0)
            return -1;
        const slot = this._free.pop();
        this._alive[slot] = 1;
        this._liveCount++;
        return slot;
    }
    _free_slot(slot) {
        this._pos[slot * 3 + 1] = -10000;
        this._alive[slot] = 0;
        this._free.push(slot);
        this._liveCount = Math.max(0, this._liveCount - 1);
    }
    _setColor(slot, col) {
        const i3 = slot * 3;
        this._startCol[i3] = col.r;
        this._startCol[i3 + 1] = col.g;
        this._startCol[i3 + 2] = col.b;
        // Initially at full brightness
        this._colBuf[i3] = col.r;
        this._colBuf[i3 + 1] = col.g;
        this._colBuf[i3 + 2] = col.b;
    }
    _emitFromContinuous(e) {
        const slot = this._alloc();
        if (slot < 0)
            return;
        // Scatter position (for dust, _dustRadius is set)
        const dustR = e.dustRadius ?? 0;
        const px = e.x + (dustR > 0 ? (Math.random() - 0.5) * 2 * dustR : 0);
        const py = e.y + (Math.random() - 0.5) * 0.4;
        const pz = e.z + (dustR > 0 ? (Math.random() - 0.5) * 2 * dustR : 0);
        this._pos[slot * 3] = px;
        this._pos[slot * 3 + 1] = py;
        this._pos[slot * 3 + 2] = pz;
        // Cone direction
        const spread = Math.min(e.spread, Math.PI);
        const phi = Math.random() * spread; // 0 = straight up, π = sphere
        const theta = Math.random() * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const s = e.speed * (0.5 + Math.random() * 0.5);
        this._vel[slot * 3] = s * sinPhi * Math.cos(theta);
        this._vel[slot * 3 + 1] = s * Math.cos(phi) + e.upBias;
        this._vel[slot * 3 + 2] = s * sinPhi * Math.sin(theta);
        this._scratch.setHex(e.color);
        this._setColor(slot, this._scratch);
        this._age[slot] = 0;
        this._life[slot] = e.lifetime * (0.7 + Math.random() * 0.6);
        this._hasGrav[slot] = e.gravity ? 1 : 0;
    }
}
