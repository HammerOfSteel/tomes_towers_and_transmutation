/**
 * ProceduralSkybox — inverted sphere with canvas-drawn starfield.
 *
 * Stars are seeded via mulberry32 for determinism.
 * Each star twinkles independently via sin(t * freq + phase).
 * Moon is a PlaneGeometry billboard that faces the camera each frame.
 *
 * Usage:
 *   const sky = new ProceduralSkybox(scene, seed);
 *   // in render loop:
 *   sky.update(t, camera);
 *   // on dispose:
 *   sky.dispose();
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';

const STAR_COUNT   = 800;
const SKY_RADIUS   = 450;

interface StarData {
  freq:  number;  // twinkle frequency (rad/s)
  phase: number;  // initial phase offset
  base:  number;  // base brightness [0, 1]
}

export class ProceduralSkybox {
  private readonly _dome:     THREE.Mesh;
  private readonly _starMesh: THREE.Points;
  private readonly _moon:     THREE.Mesh;
  private readonly _starData: StarData[] = [];
  private readonly _starMat:  THREE.PointsMaterial;

  constructor(
    private readonly _scene: THREE.Scene,
    seed = 0x5a7c_f001,
  ) {
    const rng = mulberry32(seed);

    // ── Sky dome — large inverted sphere with canvas gradient ─────────────────
    const domeTex = this._buildSkyCanvas();
    const domeGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const domeMat = new THREE.MeshBasicMaterial({
      map: domeTex,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this._dome = new THREE.Mesh(domeGeo, domeMat);
    this._dome.renderOrder = -2;
    _scene.add(this._dome);

    // ── Stars — Points with per-star brightness controlled via vertex colours ─
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors    = new Float32Array(STAR_COUNT * 3);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Distribute uniformly over upper hemisphere
      const theta = rng() * Math.PI * 2;
      const phi   = Math.acos(1 - rng());   // biased toward equator — looks natural
      const r     = SKY_RADIUS * 0.97;

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.5 + r * 0.5; // upper hemisphere
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const brightness = 0.4 + rng() * 0.6;
      colors[i * 3]     = brightness;
      colors[i * 3 + 1] = brightness * (0.9 + rng() * 0.1);  // slight warm/cool variance
      colors[i * 3 + 2] = brightness * (0.9 + rng() * 0.1);

      this._starData.push({
        freq:  0.3 + rng() * 2.2,
        phase: rng() * Math.PI * 2,
        base:  brightness,
      });
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

    this._starMat = new THREE.PointsMaterial({
      size:              0.8,
      vertexColors:      true,
      transparent:       true,
      opacity:           1.0,
      depthWrite:        false,
      sizeAttenuation:   true,
    });

    this._starMesh = new THREE.Points(starGeo, this._starMat);
    this._starMesh.renderOrder = -1;
    _scene.add(this._starMesh);

    // ── Moon billboard ─────────────────────────────────────────────────────────
    const moonTex = this._buildMoonCanvas();
    const moonGeo = new THREE.PlaneGeometry(28, 28);
    const moonMat = new THREE.MeshBasicMaterial({
      map:         moonTex,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });
    this._moon = new THREE.Mesh(moonGeo, moonMat);
    this._moon.position.set(-180, 220, -300);
    this._moon.renderOrder = -1;
    _scene.add(this._moon);
  }

  /** Call each frame. `t` is elapsed time in seconds; `camera` for billboard. */
  update(t: number, camera: THREE.Camera): void {
    // Twinkle stars by updating vertex colours
    const colAttr = this._starMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < STAR_COUNT; i++) {
      const d = this._starData[i];
      const b = d.base * (0.6 + 0.4 * (Math.sin(t * d.freq + d.phase) * 0.5 + 0.5));
      colAttr.setXYZ(i, b, b * 0.97, b * 0.95);
    }
    colAttr.needsUpdate = true;

    // Moon faces camera
    this._moon.lookAt(camera.position);

    // Dome follows camera so it never clips
    this._dome.position.copy(camera.position);
    this._starMesh.position.copy(camera.position);
  }

  dispose(): void {
    this._scene.remove(this._dome, this._starMesh, this._moon);
    this._dome.geometry.dispose();
    (this._dome.material as THREE.Material).dispose();
    this._starMesh.geometry.dispose();
    this._starMat.dispose();
    this._moon.geometry.dispose();
    (this._moon.material as THREE.Material).dispose();
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private _buildSkyCanvas(): THREE.CanvasTexture {
    const W = 512, H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Gradient: horizon (#0a0820) → zenith (#000008)
    const grad = ctx.createLinearGradient(0, H, 0, 0);
    grad.addColorStop(0.0, '#100818');  // horizon — slightly lighter purple-blue
    grad.addColorStop(0.3, '#060412');
    grad.addColorStop(1.0, '#000008');  // zenith — near black
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1; // flip for inside-out sphere
    return tex;
  }

  private _buildMoonCanvas(): THREE.CanvasTexture {
    const S = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    // Base circle
    const cx = S / 2, cy = S / 2, r = S * 0.44;
    const grad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
    grad.addColorStop(0, '#f0eedc');
    grad.addColorStop(0.7, '#c8c4a8');
    grad.addColorStop(1,  '#a89e80');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Crater pockmarks (dark arcs)
    const craters: Array<[number, number, number]> = [
      [0.3, 0.35, 0.07], [0.55, 0.45, 0.05], [0.4, 0.6, 0.08],
      [0.6, 0.3, 0.04],  [0.25, 0.55, 0.05], [0.5, 0.65, 0.06],
    ];
    for (const [fx, fy, fr] of craters) {
      const x = cx + (fx - 0.5) * r * 2;
      const y = cy + (fy - 0.5) * r * 2;
      const cr = fr * S;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist + cr > r * 0.9) continue; // skip craters near edge
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,50,30,0.35)';
      ctx.fill();
      // Rim highlight
      ctx.beginPath();
      ctx.arc(x - cr * 0.3, y - cr * 0.3, cr * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(220,210,180,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }
}