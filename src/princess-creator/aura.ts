// ── Aura: motes, cold light, warm glow — "colour communicates story" ────────
//
//  Celestial glows warm, undead is cold, high elves shed drifting motes.
//  Auras parent to the rig (they follow bobs and twirls) and register their
//  tick + cleanup on the BuildResult hooks.

import * as THREE from 'three';
import type { PrincessDNA } from './types';
import type { MaterialKit } from './materials';
import type { BuildResult } from './synth/contracts';

export function attachAura(result: BuildResult, dna: PrincessDNA, kit: MaterialKit): void {
  const { style, intensity } = dna.aura;
  if (style === 'none' || intensity < 0.02) return;
  const p = result.proportions;

  // Shared glow-mote material — tracks the kit's glow Color instance so
  // palette retints recolor the aura live.
  const moteMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.5 + intensity * 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  moteMat.color = kit.glow.color;
  result.hooks.disposers.push(() => moteMat.dispose());

  // ── Drifting motes (motes & warm) ──
  if (style === 'motes' || style === 'warm') {
    const count = style === 'warm' ? 5 : Math.round(5 + intensity * 5);
    const motes: Array<{ mesh: THREE.Mesh; phase: number; r: number; h: number; speed: number }> = [];
    const moteGeo = new THREE.SphereGeometry(0.11 + intensity * 0.07, 8, 6);
    result.hooks.disposers.push(() => moteGeo.dispose());
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(moteGeo, moteMat);
      const phase = (i / count) * Math.PI * 2;
      const entry = {
        mesh,
        phase,
        r: p.topR + 1.6 + (i % 3) * 0.8,
        h: 1.5 + ((i * 37) % 100) / 100 * (p.headCY + p.headR),
        speed: 0.5 + ((i * 53) % 100) / 100 * 0.5,
      };
      mesh.position.set(Math.cos(phase) * entry.r, entry.h, Math.sin(phase) * entry.r);
      result.rig.root.add(mesh);
      motes.push(entry);
    }
    result.hooks.tick.push((t) => {
      for (const m of motes) {
        const a = m.phase + t * m.speed;
        m.mesh.position.set(
          Math.cos(a) * m.r,
          m.h + Math.sin(t * 1.3 + m.phase * 2) * 0.35,
          Math.sin(a) * m.r,
        );
        const s = 1 + Math.sin(t * 2.2 + m.phase * 3) * 0.3;
        m.mesh.scale.setScalar(s);
      }
    });
  }

  // ── Ambient light + soft shell (cold & warm) ──
  if (style === 'cold' || style === 'warm') {
    const light = new THREE.PointLight(0xffffff, (style === 'cold' ? 0.5 : 0.8) * intensity, 14);
    light.color = kit.glow.color; // shared instance → follows palette
    light.position.y = 1;
    result.rig.torso.add(light);

    const shellMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.035 + intensity * 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    shellMat.color = kit.glow.color;
    result.hooks.disposers.push(() => shellMat.dispose());
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(p.hemR + 2.2, 20, 14),
      shellMat,
    );
    shell.position.y = 1.5;
    result.rig.root.add(shell);
    result.hooks.tick.push((t) => {
      const s = 1 + Math.sin(t * 1.6) * 0.05;
      shell.scale.set(s, 1.15 * s, s);
      light.intensity = (style === 'cold' ? 0.5 : 0.8) * intensity * (0.85 + Math.sin(t * 2.1) * 0.15);
    });
  }
}
