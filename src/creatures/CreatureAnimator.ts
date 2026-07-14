// ── CreatureAnimator ─────────────────────────────────────────────────────────
//
//  Drives CreatureRig bones using pure Forward Kinematics math.
//  No keyframe files — all motion is procedural time-based sine/cosine.
//  Call animateCreature(rig, ctx) every frame inside the render loop.

import type { CreatureRig } from './CreatureBuilder';

export type AnimState = 'idle' | 'walk' | 'run' | 'hit' | 'hypnotized' | 'death';

export interface AnimContext {
  state:         AnimState;
  time:          number;
  timeSinceHit?: number;
  velocity?:     number;
}

export function animateCreature(rig: CreatureRig, ctx: AnimContext): void {
  const { bones } = rig;
  const t = ctx.time;
  switch (ctx.state) {
    case 'idle':       _idle(bones, t);                         break;
    case 'walk':       _walk(bones, t, ctx.velocity ?? 0.5, false); break;
    case 'run':        _walk(bones, t, ctx.velocity ?? 1.0, true);  break;
    case 'hit':        _hit(bones, ctx.timeSinceHit ?? 0);      break;
    case 'hypnotized': _hypno(bones, t);                        break;
    case 'death':      _death(bones, t);                        break;
  }
}

// ── Idle — breathing + micro-sway ─────────────────────────────────────────────

function _idle(b: CreatureRig['bones'], t: number): void {
  const br = Math.sin(t * 2.4) * 0.028;
  if (b.torso) { b.torso.scale.y = 1 + br; b.torso.position.y = br * 4; }
  if (b.head)  { b.head.rotation.y = Math.sin(t * 0.7) * 0.055; b.head.rotation.z = Math.sin(t * 1.1) * 0.022; }
  if (b.armL)  b.armL.rotation.x  =  Math.sin(t * 2.2) * 0.04 + 0.06;
  if (b.armR)  b.armR.rotation.x  =  Math.sin(t * 2.2 + 1.0) * 0.04 + 0.06;
  if (b.wingL) b.wingL.rotation.z =  Math.sin(t * 1.8) * 0.06;
  if (b.wingR) b.wingR.rotation.z = -Math.sin(t * 1.8) * 0.06;
  if (b.blobs) {
    b.blobs.forEach((g, i) => {
      const ph = (i / b.blobs!.length) * Math.PI * 2;
      g.position.x = Math.cos(t * 0.9 + ph) * 0.6;
      g.position.z = Math.sin(t * 0.9 + ph) * 0.6;
      g.position.y = Math.sin(t * 1.4 + ph) * 0.2;
    });
  }
  if (b.segments) b.segments.forEach((sg, i) => { sg.rotation.z = Math.sin(t * 1.2 + i * 0.5) * 0.08; });
}

// ── Walk / Run — opposing sine-wave limbs ─────────────────────────────────────

function _walk(b: CreatureRig['bones'], t: number, vel: number, run: boolean): void {
  const sp  = run ? 9  : 5;
  const str = run ? 0.7 : 0.38;
  const bob = Math.sin(t * sp * 2) * (run ? 0.045 : 0.022);
  const ph  = t * sp;
  if (b.torso)     b.torso.position.y = bob;
  if (b.armL)      b.armL.rotation.x     =  Math.cos(ph) * str;
  if (b.armR)      b.armR.rotation.x     = -Math.cos(ph) * str;
  if (b.legL)      b.legL.rotation.x     = -Math.cos(ph) * str;
  if (b.legR)      b.legR.rotation.x     =  Math.cos(ph) * str;
  if (b.frontLegL) b.frontLegL.rotation.x =  Math.cos(ph) * str;
  if (b.frontLegR) b.frontLegR.rotation.x = -Math.cos(ph) * str;
  if (b.backLegL)  b.backLegL.rotation.x  = -Math.cos(ph) * str;
  if (b.backLegR)  b.backLegR.rotation.x  =  Math.cos(ph) * str;
  if (b.wingL)     b.wingL.rotation.z     =  Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
  if (b.wingR)     b.wingR.rotation.z     = -Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
  if (b.head)      b.head.rotation.x      = -bob * 3;
  if (b.segments)  b.segments.forEach((sg, i) => { sg.rotation.z = Math.sin(ph + i * 0.6) * str * 0.7; });
  void vel;
}

// ── Hit — exponential decay recoil ────────────────────────────────────────────

function _hit(b: CreatureRig['bones'], tsh: number): void {
  const d = Math.exp(-tsh * 9) * Math.sin(tsh * 28);
  if (b.torso) { b.torso.rotation.x = d * 0.35; const s = 1 + d * 0.1; b.torso.scale.set(1 / s, s, 1 / s); }
  if (b.head)  b.head.rotation.x = d * 0.25;
}

// ── Hypnotized — swirling confusion ───────────────────────────────────────────

function _hypno(b: CreatureRig['bones'], t: number): void {
  if (b.head)  { b.head.rotation.z = Math.sin(t * 14) * 0.22; b.head.rotation.y = Math.cos(t * 9) * 0.3; }
  if (b.torso) { b.torso.rotation.z = Math.sin(t * 5) * 0.08; b.torso.position.y = Math.abs(Math.sin(t * 6)) * 0.06; }
  if (b.armL)  b.armL.rotation.z =  Math.sin(t * 7) * 0.5;
  if (b.armR)  b.armR.rotation.z = -Math.sin(t * 7) * 0.5;
}

// ── Death — fall over ─────────────────────────────────────────────────────────

function _death(b: CreatureRig['bones'], t: number): void {
  const fall = Math.min(1, t * 2.5);
  if (b.torso) { b.torso.rotation.z = fall * (Math.PI / 2.1); b.torso.position.y = fall * -0.4; }
}
