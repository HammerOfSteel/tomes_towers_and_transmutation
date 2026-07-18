/**
 * WeatherSystem — exterior weather FSM: Clear → Cloudy → Rain → Storm → Clear
 *
 * Transitions are seeded from the in-game day number so weather is consistent
 * within a day but changes between days.
 *
 * Usage:
 *   const wx = new WeatherSystem(scene, camera);
 *   // exterior tick:
 *   wx.update(dt, playerPos, hour, dayNumber);
 *   // exterior exit:
 *   wx.setActive(false);
 */
import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
const TRANSITION_HOURS = {
    clear: 6, // clear lasts ~6 hours before possible change
    cloudy: 3,
    rain: 2,
    storm: 1.5,
};
const NEXT_STATE = {
    clear: ['clear', 'clear', 'cloudy'],
    cloudy: ['clear', 'cloudy', 'rain'],
    rain: ['cloudy', 'rain', 'storm'],
    storm: ['rain', 'clear'],
};
const RAIN_COUNT = 1600;
const RAIN_RADIUS = 28;
const RAIN_HEIGHT = 14;
export class WeatherSystem {
    _scene;
    _state = 'clear';
    _transitionTimer = 0;
    _active = false;
    // Rain geometry
    _rainPoints;
    _rainAttr;
    _rainVels;
    _rainOpacity = 0;
    // Lightning flash
    _lightningTimer = 0;
    _lightningLight;
    _lightningOverlay;
    constructor(_scene, _camera) {
        this._scene = _scene;
        // ── Rain particles ─────────────────────────────────────────────────────
        const positions = new Float32Array(RAIN_COUNT * 3);
        this._rainVels = new Float32Array(RAIN_COUNT);
        const rng = mulberry32(0xA1_B2_C3);
        for (let i = 0; i < RAIN_COUNT; i++) {
            const theta = rng() * Math.PI * 2;
            const r = rng() * RAIN_RADIUS;
            positions[i * 3] = Math.cos(theta) * r;
            positions[i * 3 + 1] = rng() * RAIN_HEIGHT;
            positions[i * 3 + 2] = Math.sin(theta) * r;
            this._rainVels[i] = 8 + rng() * 6; // downward speed (u/s)
        }
        const geo = new THREE.BufferGeometry();
        this._rainAttr = new THREE.BufferAttribute(positions, 3);
        geo.setAttribute('position', this._rainAttr);
        this._rainPoints = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xaaccee,
            size: 0.06,
            transparent: true,
            opacity: 0,
            sizeAttenuation: false,
            depthWrite: false,
        }));
        this._rainPoints.renderOrder = 99;
        this._rainPoints.visible = false;
        // ── Lightning light ────────────────────────────────────────────────────
        this._lightningLight = new THREE.DirectionalLight(0xffffff, 0);
        this._lightningLight.position.set(0, 30, 0);
        _scene.add(this._lightningLight);
        // ── Lightning overlay ──────────────────────────────────────────────────
        this._lightningOverlay = document.createElement('div');
        Object.assign(this._lightningOverlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(220,240,255,0.55)',
            pointerEvents: 'none',
            zIndex: '800',
            opacity: '0',
            transition: 'opacity 0.04s',
            display: 'none',
        });
        document.body.appendChild(this._lightningOverlay);
    }
    get state() { return this._state; }
    get isRaining() { return this._state === 'rain' || this._state === 'storm'; }
    /** Call when entering/leaving exterior mode. */
    setActive(active) {
        this._active = active;
        if (!active) {
            this._rainPoints.visible = false;
            this._scene.remove(this._rainPoints);
            this._lightningOverlay.style.display = 'none';
            this._lightningLight.intensity = 0;
        }
        else {
            this._scene.add(this._rainPoints);
        }
    }
    /** Call each exterior frame. hour is 0–24, dayNumber is integer day count. */
    update(dt, playerPos, hour, dayNumber) {
        if (!this._active)
            return;
        // ── State transitions ──────────────────────────────────────────────────
        this._transitionTimer -= dt / 3600; // dt is seconds, timer in hours
        if (this._transitionTimer <= 0) {
            const rng = mulberry32((dayNumber * 1337) ^ Math.floor(hour));
            const nexts = NEXT_STATE[this._state];
            this._state = nexts[Math.floor(rng() * nexts.length)];
            this._transitionTimer = TRANSITION_HOURS[this._state] * (0.8 + rng() * 0.4);
        }
        // ── Rain particle animation ────────────────────────────────────────────
        const targetOpacity = this._state === 'rain' ? 0.55 : this._state === 'storm' ? 0.85 : 0;
        this._rainOpacity += (targetOpacity - this._rainOpacity) * Math.min(1, dt * 1.5);
        const mat = this._rainPoints.material;
        if (this._rainOpacity > 0.01) {
            this._rainPoints.visible = true;
            mat.opacity = this._rainOpacity;
            // Move rain with camera (cylinder around player)
            for (let i = 0; i < RAIN_COUNT; i++) {
                let y = this._rainAttr.getY(i) - this._rainVels[i] * dt;
                if (y < 0)
                    y += RAIN_HEIGHT;
                // Drift X slightly with storm wind
                let x = this._rainAttr.getX(i);
                if (this._state === 'storm')
                    x += 2.5 * dt;
                // Keep within cylinder radius around player
                const dx = x - 0;
                const dz = this._rainAttr.getZ(i) - 0;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > RAIN_RADIUS) {
                    const angle = Math.atan2(dz, dx) + Math.PI;
                    x = Math.cos(angle) * (RAIN_RADIUS * 0.95);
                    this._rainAttr.setZ(i, Math.sin(angle) * (RAIN_RADIUS * 0.95));
                }
                this._rainAttr.setXYZ(i, playerPos.x + x - 0, playerPos.y + y, playerPos.z + (this._rainAttr.getZ(i) - 0));
            }
            this._rainAttr.needsUpdate = true;
        }
        else {
            this._rainPoints.visible = false;
        }
        // ── Lightning (storm only) ─────────────────────────────────────────────
        if (this._state === 'storm') {
            this._lightningTimer -= dt;
            if (this._lightningTimer <= 0) {
                // Random delay 1–5s between flashes
                this._lightningTimer = 1 + Math.random() * 4;
                this._lightningLight.intensity = 3;
                this._lightningOverlay.style.display = 'block';
                this._lightningOverlay.style.opacity = '1';
                // Thunder delay 0.5–3s after flash
                // Flash off after 80ms
                setTimeout(() => {
                    this._lightningLight.intensity = 0;
                    this._lightningOverlay.style.opacity = '0';
                    setTimeout(() => { this._lightningOverlay.style.display = 'none'; }, 80);
                }, 80);
            }
        }
        else {
            this._lightningLight.intensity = 0;
            this._lightningOverlay.style.display = 'none';
        }
    }
    dispose() {
        this.setActive(false);
        this._scene.remove(this._rainPoints);
        this._scene.remove(this._lightningLight);
        this._rainPoints.geometry.dispose();
        this._rainPoints.material.dispose();
        this._lightningOverlay.remove();
    }
}
