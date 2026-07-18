/**
 * DayNightSystem — smoothly lerps exterior lighting based on TimeSystem.hour.
 *
 * Transitions:
 *   Night  (0–5h):   deep blue-black sky, dark teal ground
 *   Dawn   (5–8h):   orange-pink sky, warm ground
 *   Day    (8–18h):  blue-white sky, green ground
 *   Dusk   (18–22h): coral-purple sky, amber ground
 *   Night  (22–24h): deep blue-black sky, dark teal ground
 *
 * Usage:
 *   const dns = new DayNightSystem(hemi, keyLight, scene);
 *   // in exterior update loop:
 *   dns.update(TimeSystem.instance.hour);
 */
import * as THREE from 'three';
const PHASES = {
    night: {
        skyHex: 0x0a0818, groundHex: 0x0a1208,
        keyHex: 0x2a3860, keyInt: 0.3,
        fogHex: 0x0a1408, fogNear: 60, fogFar: 180,
    },
    dawn: {
        skyHex: 0xff9966, groundHex: 0x7a4428,
        keyHex: 0xffc87a, keyInt: 0.7,
        fogHex: 0xcc7744, fogNear: 55, fogFar: 160,
    },
    day: {
        skyHex: 0xb8d4e8, groundHex: 0x4a6b3a,
        keyHex: 0xfff5e0, keyInt: 0.85,
        fogHex: 0x0a1408, fogNear: 60, fogFar: 180,
    },
    dusk: {
        skyHex: 0xcc6655, groundHex: 0x6a4020,
        keyHex: 0xffaa55, keyInt: 0.55,
        fogHex: 0x8a3322, fogNear: 50, fogFar: 150,
    },
};
/** Return [0, 1] blend factor between phaseA and phaseB for a given hour.
 *  startA → startA = 1.0 of A, endA → 0.0 of A. */
function _phaseAndBlend(hour) {
    // time ranges (hour)
    if (hour >= 22 || hour < 5) {
        // night
        return { a: PHASES.night, b: PHASES.night, t: 0 };
    }
    else if (hour < 8) {
        // dawn  5→8
        return { a: PHASES.night, b: PHASES.dawn, t: (hour - 5) / 3 };
    }
    else if (hour < 9) {
        // dawn→day  8→9
        return { a: PHASES.dawn, b: PHASES.day, t: hour - 8 };
    }
    else if (hour < 17) {
        // full day
        return { a: PHASES.day, b: PHASES.day, t: 0 };
    }
    else if (hour < 19) {
        // day→dusk  17→19
        return { a: PHASES.day, b: PHASES.dusk, t: (hour - 17) / 2 };
    }
    else {
        // dusk→night  19→22
        return { a: PHASES.dusk, b: PHASES.night, t: (hour - 19) / 3 };
    }
}
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function _lerpHex(a, b, t) {
    _ca.setHex(a);
    _cb.setHex(b);
    return _ca.lerp(_cb, t);
}
export class DayNightSystem {
    _hemi;
    _keyLight;
    _scene;
    constructor(_hemi, _keyLight, _scene) {
        this._hemi = _hemi;
        this._keyLight = _keyLight;
        this._scene = _scene;
    }
    /** Call each frame when in exterior mode. */
    update(hour) {
        const { a, b, t } = _phaseAndBlend(hour);
        this._hemi.color.copy(_lerpHex(a.skyHex, b.skyHex, t));
        this._hemi.groundColor.copy(_lerpHex(a.groundHex, b.groundHex, t));
        this._keyLight.color.copy(_lerpHex(a.keyHex, b.keyHex, t));
        this._keyLight.intensity = a.keyInt + (b.keyInt - a.keyInt) * t;
        const fogColor = _lerpHex(a.fogHex, b.fogHex, t);
        const fogNear = a.fogNear + (b.fogNear - a.fogNear) * t;
        const fogFar = a.fogFar + (b.fogFar - a.fogFar) * t;
        if (this._scene.fog instanceof THREE.Fog) {
            this._scene.fog.color.copy(fogColor);
            this._scene.fog.near = fogNear;
            this._scene.fog.far = fogFar;
        }
        if (this._scene.background instanceof THREE.Color) {
            this._scene.background.copy(fogColor);
        }
    }
}
