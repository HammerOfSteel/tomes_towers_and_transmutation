// ── Face module: eyes, mouths, blush, blink ──────────────────────────────────
//
//  Chibi grammar (see RESEARCH_SUPPLEMENT §5): eyes in the LOWER half of the
//  face (~45% head height), eye height ≈ 24% of head, spacing slightly wide.
//  All styles are built from kit slots so palette swaps retint them.

import * as THREE from 'three';
import type { PrincessDNA } from './types';
import type { MaterialKit } from './materials';
import { shadowed } from './synth/shared';

export interface FaceBuild {
  group: THREE.Group;
  setBlink(v: number): void;
}

/**
 * Builds the face into `socket` (positioned at head center by the scaffold).
 * `surfaceR` is the radius at which features sit (head or blob surface).
 */
export function buildFace(
  socket: THREE.Group,
  dna: PrincessDNA,
  kit: MaterialKit,
  surfaceR: number,
): FaceBuild {
  const g = new THREE.Group();
  g.name = 'face';
  socket.add(g);

  const f = dna.face;
  const R = surfaceR;
  const eh = 0.27 * R * f.eyeSize;          // eye height
  const r0 = eh * 0.5;                      // base eyeball radius
  const ex = 0.37 * R * f.eyeSpacing;       // eye x offset
  const ey = -0.1 * R;                      // eyes low on the face (chibi)
  const ez = R * 0.94;

  const blinkTargets: THREE.Object3D[] = [];

  const makeEye = (side: 1 | -1): THREE.Group => {
    const eye = new THREE.Group();
    eye.position.set(ex * side, ey, ez);
    eye.rotation.y = (Math.PI / 12) * side;
    eye.rotation.z = f.eyeTilt * side;

    switch (f.eyeStyle) {
      case 'sparkle':
      case 'lash': {
        const base = new THREE.Mesh(new THREE.SphereGeometry(r0, 24, 16), kit.dark);
        base.scale.set(0.8, 1.2, 0.3);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.8, 16, 12), kit.eyes);
        iris.scale.set(0.75, 1.05, 0.28);
        iris.position.set(0, -r0 * 0.15, r0 * 0.12);
        const hl1 = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.3, 10, 8), kit.white);
        hl1.position.set(-r0 * 0.2 * side, r0 * 0.4, r0 * 0.3);
        const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.16, 8, 6), kit.white);
        hl2.position.set(r0 * 0.3 * side, -r0 * 0.35, r0 * 0.3);
        eye.add(base, iris, hl1, hl2);
        if (f.eyeStyle === 'lash') {
          for (let i = 0; i < 3; i++) {
            const lash = new THREE.Mesh(new THREE.ConeGeometry(r0 * 0.09, r0 * 0.5, 4), kit.dark);
            lash.position.set((r0 * 0.35 + i * r0 * 0.28) * side, r0 * 0.95, 0);
            lash.rotation.z = (-0.5 - i * 0.35) * side;
            eye.add(lash);
          }
        }
        break;
      }
      case 'round': {
        const white = new THREE.Mesh(new THREE.SphereGeometry(r0 * 1.05, 24, 16), kit.white);
        white.scale.set(0.9, 1, 0.5);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.5, 14, 10), kit.eyes);
        pupil.position.z = r0 * 0.62;
        const hl = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.18, 8, 6), kit.white);
        hl.position.set(r0 * 0.18, r0 * 0.2, r0 * 0.95);
        eye.add(white, pupil, hl);
        break;
      }
      case 'sleepy': {
        const base = new THREE.Mesh(new THREE.SphereGeometry(r0, 24, 16), kit.dark);
        base.scale.set(0.85, 0.65, 0.3);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.75, 16, 12), kit.eyes);
        iris.scale.set(0.75, 0.55, 0.28);
        iris.position.z = r0 * 0.12;
        const lid = new THREE.Mesh(
          new THREE.SphereGeometry(r0 * 0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
          kit.skin,
        );
        lid.scale.set(0.95, 0.9, 0.55);
        lid.position.y = r0 * 0.28;
        eye.add(base, iris, lid);
        break;
      }
      case 'star': {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(r0 * 0.95), kit.glow);
        star.scale.set(0.9, 1.1, 0.35);
        star.rotation.z = Math.PI / 4;
        eye.add(star);
        break;
      }
      case 'glow': {
        const socketBox = new THREE.Mesh(new THREE.BoxGeometry(eh * 0.95, eh * 1.15, eh * 0.5), kit.dark);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.5, 14, 10), kit.glow);
        pupil.position.z = eh * 0.2;
        const intensity = 0.55 * dna.species.eyeGlowIntensity;
        if (intensity > 0.01) {
          const light = new THREE.PointLight(kit.glow.color, intensity, 6);
          // Share the kit's Color instance so palette retints recolor the light.
          light.color = kit.glow.color;
          light.position.z = 0.4;
          pupil.add(light);
        }
        eye.add(socketBox, pupil);
        break;
      }
      case 'void': {
        const base = new THREE.Mesh(new THREE.SphereGeometry(r0 * 0.95, 20, 14), kit.dark);
        base.scale.set(0.85, 1.15, 0.3);
        eye.add(base);
        break;
      }
      case 'button': {
        const bead = new THREE.Mesh(new THREE.BoxGeometry(eh * 0.6, eh, eh * 0.28), kit.dark);
        eye.add(bead);
        break;
      }
    }
    blinkTargets.push(eye);
    return eye;
  };

  g.add(makeEye(1), makeEye(-1));

  // ── Mouth ──
  const my = -0.46 * R;
  const mz = R * 0.94;
  const mouth = new THREE.Group();
  mouth.position.set(0, my, mz);
  switch (f.mouth) {
    case 'smile': {
      const geo = new THREE.TorusGeometry(0.095 * R, 0.022 * R, 8, 16, Math.PI);
      geo.rotateZ(Math.PI);
      mouth.add(new THREE.Mesh(geo, kit.dark));
      break;
    }
    case 'open': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08 * R, 14, 10), kit.dark);
      m.scale.set(1, 1.15, 0.4);
      mouth.add(m);
      break;
    }
    case 'cat': {
      for (const side of [-1, 1]) {
        const geo = new THREE.TorusGeometry(0.05 * R, 0.018 * R, 8, 12, Math.PI);
        geo.rotateZ(Math.PI);
        const half = new THREE.Mesh(geo, kit.dark);
        half.position.x = 0.05 * R * side;
        mouth.add(half);
      }
      break;
    }
    case 'pout': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 * R, 12, 8), kit.dark);
      m.scale.set(1.3, 0.7, 0.4);
      mouth.add(m);
      break;
    }
    case 'fang': {
      const geo = new THREE.TorusGeometry(0.095 * R, 0.02 * R, 8, 16, Math.PI);
      geo.rotateZ(Math.PI);
      mouth.add(new THREE.Mesh(geo, kit.dark));
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.028 * R, 0.09 * R, 4), kit.white);
      fang.rotation.x = Math.PI;
      fang.position.set(0.07 * R, -0.01 * R, 0.01 * R);
      mouth.add(fang);
      break;
    }
    case 'teeth': {
      for (let i = -2; i <= 2; i++) {
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.055 * R, 0.1 * R, 0.04 * R),
          kit.white,
        );
        const angle = i * 0.16;
        tooth.position.set(i * 0.065 * R, 0, -Math.abs(i) * 0.014 * R);
        tooth.rotation.y = angle;
        mouth.add(tooth);
      }
      break;
    }
    case 'none':
      break;
  }
  g.add(mouth);

  // ── Blush ──
  if (f.blush > 0.02) {
    const s = 0.6 + 0.5 * f.blush;
    for (const side of [-1, 1]) {
      const cheek = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.2 * R, 12, 8), kit.blush));
      cheek.scale.set(1.4 * s, 0.55 * s, 0.25);
      cheek.position.set(0.52 * R * side, -0.32 * R, R * 0.82);
      cheek.rotation.y = (Math.PI / 8) * side;
      g.add(cheek);
    }
  }

  return {
    group: g,
    setBlink(v: number): void {
      const s = 1 - 0.92 * Math.min(1, Math.max(0, v));
      for (const eye of blinkTargets) eye.scale.y = s;
    },
  };
}
