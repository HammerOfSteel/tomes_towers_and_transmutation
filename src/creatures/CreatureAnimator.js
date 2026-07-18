// ── CreatureAnimator ─────────────────────────────────────────────────────────
//
//  Drives CreatureRig bones using pure Forward Kinematics math.
//  All motion is procedural sine/cosine — no keyframe assets.
//  Dispatches to archetype-specific functions based on bone presence.
//  Call animateCreature(rig, ctx) every frame.
const _isSerpent = (b) => (b.segments?.length ?? 0) > 0;
const _isAmoeba = (b) => (b.blobs?.length ?? 0) > 0;
const _isAvian = (b) => b.wingL != null && b.armL == null;
const _isQuad = (b) => b.frontLegL != null;
// ── Entry ─────────────────────────────────────────────────────────────────────
export function animateCreature(rig, ctx) {
    const b = rig.bones;
    const t = ctx.time;
    switch (ctx.state) {
        case 'idle':
            _idle(b, t);
            break;
        case 'walk':
            _walk(b, t, ctx.velocity ?? 0.5, false);
            break;
        case 'run':
            _walk(b, t, ctx.velocity ?? 1.0, true);
            break;
        case 'hit':
            _hit(b, ctx.timeSinceHit ?? 0);
            break;
        case 'hypnotized':
            _hypno(b, t);
            break;
        case 'death':
            _death(b, t);
            break;
    }
}
// ── Idle ──────────────────────────────────────────────────────────────────────
function _idle(b, t) {
    if (_isSerpent(b)) {
        _idleSerpent(b, t);
        return;
    }
    if (_isAmoeba(b)) {
        _idleAmoeba(b, t);
        return;
    }
    if (_isAvian(b)) {
        _idleAvian(b, t);
        return;
    }
    _idleDefault(b, t);
}
function _idleDefault(b, t) {
    const br = Math.sin(t * 2.4) * 0.028;
    if (b.torso) {
        b.torso.scale.y = 1 + br;
        b.torso.position.y = br * 4;
    }
    if (b.head) {
        b.head.rotation.y = Math.sin(t * 0.7) * 0.055;
        b.head.rotation.z = Math.sin(t * 1.1) * 0.022;
    }
    if (b.armL)
        b.armL.rotation.x = Math.sin(t * 2.2) * 0.04 + 0.06;
    if (b.armR)
        b.armR.rotation.x = Math.sin(t * 2.2 + 1.0) * 0.04 + 0.06;
    if (b.tail)
        b.tail.rotation.x = -1.0 + Math.sin(t * 1.3) * 0.12;
}
function _idleSerpent(b, t) {
    // bones.head is a deep sub-group of segment[0] — safe to set directly.
    if (b.head) {
        b.head.rotation.y = Math.sin(t * 0.9) * 0.22;
        b.head.rotation.x = Math.sin(t * 1.4) * 0.04;
    }
    // segments[] orientations are owned by SnakeLocomotion.update() (lookAt).
    // Use += so the sway layers on top without overriding the base orientation.
    if (b.segments)
        b.segments.forEach((sg, i) => {
            sg.rotation.z += Math.sin(t * 1.1 + i * 0.5) * (0.04 + i * 0.006);
        });
}
function _idleAmoeba(b, t) {
    if (b.torso) {
        const p = 1 + Math.sin(t * 2.2) * 0.09;
        b.torso.scale.set(p, 1 / p, p);
    }
    if (b.head)
        b.head.rotation.y = Math.sin(t * 0.6) * 0.12;
    if (b.blobs)
        b.blobs.forEach((g, i) => {
            const ph = (i / b.blobs.length) * Math.PI * 2, r = 0.58 + (i % 2) * 0.12;
            g.position.x = Math.cos(t * 0.75 + ph) * r;
            g.position.z = Math.sin(t * 0.75 + ph) * r;
            g.position.y = Math.sin(t * 2.0 + ph) * 0.18 + 0.05;
            g.scale.setScalar(1 + Math.sin(t * 2.4 + ph) * 0.14);
        });
}
function _idleAvian(b, t) {
    if (b.torso) {
        b.torso.position.y = Math.sin(t * 4.8) * 0.028;
        b.torso.rotation.z = Math.sin(t * 1.0) * 0.025;
    }
    if (b.head) {
        b.head.rotation.y = Math.sin(t * 0.6) * 0.08;
        b.head.rotation.x = Math.sin(t * 1.5) * 0.025;
    }
    if (b.wingL)
        b.wingL.rotation.z = Math.sin(t * 7.0) * 0.10 + 0.06;
    if (b.wingR)
        b.wingR.rotation.z = -Math.sin(t * 7.0) * 0.10 - 0.06;
    if (b.legL)
        b.legL.rotation.x = 0.36;
    if (b.legR)
        b.legR.rotation.x = 0.36;
}
// ── Walk / Run ────────────────────────────────────────────────────────────────
function _walk(b, t, vel, run) {
    if (_isSerpent(b)) {
        _walkSerpent(b, t, run);
        return;
    }
    if (_isAmoeba(b)) {
        _walkAmoeba(b, t, run);
        return;
    }
    if (_isAvian(b)) {
        _walkAvian(b, t, run);
        return;
    }
    if (_isQuad(b)) {
        _walkQuad(b, t, run);
        return;
    }
    _walkBiped(b, t, run);
    void vel;
}
function _walkBiped(b, t, run) {
    const sp = run ? 9 : 5, str = run ? 0.7 : 0.38;
    const ph = t * sp, bob = Math.sin(ph * 2) * (run ? 0.045 : 0.022);
    if (b.torso)
        b.torso.position.y = bob;
    if (b.armL)
        b.armL.rotation.x = Math.cos(ph) * str;
    if (b.armR)
        b.armR.rotation.x = -Math.cos(ph) * str;
    if (b.legL)
        b.legL.rotation.x = -Math.cos(ph) * str;
    if (b.legR)
        b.legR.rotation.x = Math.cos(ph) * str;
    // Knee bends on the forward swing — shin pulls back naturally during foot clearance
    if (b.legLKnee)
        b.legLKnee.rotation.x = Math.min(0, -Math.cos(ph)) * str * 0.48;
    if (b.legRKnee)
        b.legRKnee.rotation.x = Math.min(0, Math.cos(ph)) * str * 0.48;
    if (b.wingL)
        b.wingL.rotation.z = Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
    if (b.wingR)
        b.wingR.rotation.z = -Math.cos(ph * 1.5) * (run ? 0.6 : 0.25);
    if (b.head)
        b.head.rotation.x = -bob * 3;
}
function _walkQuad(b, t, run) {
    const sp = run ? 10 : 5.5, str = run ? 0.50 : 0.28;
    const ph = t * sp, bob = Math.sin(ph * 2) * (run ? 0.04 : 0.02);
    if (b.torso) {
        b.torso.position.y = bob;
        b.torso.rotation.x = bob * 0.35;
    }
    if (b.frontLegL)
        b.frontLegL.rotation.x = Math.cos(ph) * str;
    if (b.frontLegR)
        b.frontLegR.rotation.x = -Math.cos(ph) * str;
    if (b.backLegL)
        b.backLegL.rotation.x = -Math.cos(ph) * str;
    if (b.backLegR)
        b.backLegR.rotation.x = Math.cos(ph) * str;
    if (b.head)
        b.head.rotation.x = -bob * 1.5;
    if (b.tail)
        b.tail.rotation.x = -1.0 + Math.sin(ph * 1.3) * 0.28;
}
function _walkSerpent(b, t, run) {
    // SnakeLocomotion.update() drives segment positions + base Y-orientation (lookAt).
    // We add a lateral Z-sway overlay only — using += so the lookAt base survives.
    const sp = run ? 8 : 5;
    const amp = run ? 0.08 : 0.050;
    if (b.head) {
        b.head.rotation.z += Math.sin(t * sp) * amp * 1.5;
        b.head.rotation.x += Math.sin(t * sp * 0.45) * 0.025;
    }
    if (b.torso)
        b.torso.position.y = Math.abs(Math.sin(t * sp)) * 0.018;
    if (b.segments)
        b.segments.forEach((sg, i) => {
            sg.rotation.z += Math.sin(t * sp - i * 0.55) * (amp * Math.max(0.18, 1 - i * 0.09));
        });
}
function _walkAmoeba(b, t, run) {
    const ph = t * (run ? 4.5 : 2.8);
    const sx = 1 + Math.abs(Math.sin(ph)) * (run ? 0.22 : 0.14);
    if (b.torso) {
        b.torso.scale.set(1 / sx, 1 / (sx * 0.92), sx);
        b.torso.position.y = Math.abs(Math.sin(ph)) * (run ? 0.05 : 0.03);
    }
    if (b.head)
        b.head.rotation.y = Math.sin(ph) * 0.14;
    if (b.blobs)
        b.blobs.forEach((g, i) => {
            const ph2 = (i / b.blobs.length) * Math.PI * 2, r = 0.58 + (i % 2) * 0.12;
            g.position.x = Math.cos(t * 0.75 + ph2) * r;
            g.position.z = Math.sin(t * 0.75 + ph2) * r + Math.sin(ph - ph2 * 0.3) * 0.08;
            g.position.y = Math.sin(ph + i * 0.35) * 0.12;
            g.scale.setScalar(1 + Math.sin(ph + ph2) * 0.10);
        });
}
function _walkAvian(b, t, run) {
    const ph = t * (run ? 22 : 14);
    if (b.torso) {
        b.torso.position.y = Math.sin(t * (run ? 6 : 4.8)) * (run ? 0.046 : 0.028);
        b.torso.rotation.x = run ? -0.14 : -0.05;
    }
    if (b.head)
        b.head.rotation.x = run ? 0.10 : 0.0;
    if (b.wingL)
        b.wingL.rotation.z = Math.sin(ph) * (run ? 0.56 : 0.38);
    if (b.wingR)
        b.wingR.rotation.z = -Math.sin(ph) * (run ? 0.56 : 0.38);
    if (b.legL)
        b.legL.rotation.x = 0.55;
    if (b.legR)
        b.legR.rotation.x = 0.55;
}
// ── Hit ───────────────────────────────────────────────────────────────────────
function _hit(b, tsh) {
    const d = Math.exp(-tsh * 9) * Math.sin(tsh * 28);
    if (b.torso) {
        b.torso.rotation.x = d * 0.35;
        const s = 1 + d * 0.1;
        b.torso.scale.set(1 / s, s, 1 / s);
    }
    if (b.head)
        b.head.rotation.x = d * 0.25;
}
// ── Hypnotized ────────────────────────────────────────────────────────────────
function _hypno(b, t) {
    if (b.head) {
        b.head.rotation.z = Math.sin(t * 14) * 0.22;
        b.head.rotation.y = Math.cos(t * 9) * 0.3;
    }
    if (b.torso) {
        b.torso.rotation.z = Math.sin(t * 5) * 0.08;
        b.torso.position.y = Math.abs(Math.sin(t * 6)) * 0.06;
    }
    if (b.armL)
        b.armL.rotation.z = Math.sin(t * 7) * 0.5;
    if (b.armR)
        b.armR.rotation.z = -Math.sin(t * 7) * 0.5;
}
// ── Death ─────────────────────────────────────────────────────────────────────
function _death(b, t) {
    const fall = Math.min(1, t * 2.5);
    if (b.torso) {
        b.torso.rotation.z = fall * (Math.PI / 2.1);
        b.torso.position.y = fall * -0.4;
    }
}
