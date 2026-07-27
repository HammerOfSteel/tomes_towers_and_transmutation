// ── ClipPlayer: samples baked clips, crossfades, fires game events ──────────
import { JOINT_IDS, NEUTRAL } from './clips';
export function neutralPose() {
    return {
        joints: { ...NEUTRAL.joints },
        rootY: 0,
        rootRot: [0, 0, 0],
        torsoScale: 1,
    };
}
function applyEase(x, ease) {
    switch (ease) {
        case 'linear': return x;
        case 'snap': return 1 - Math.pow(1 - x, 3);
        case 'hold': return x >= 1 ? 1 : 0;
        default: return x * x * (3 - 2 * x); // smooth
    }
}
const lerp = (a, b, u) => a + (b - a) * u;
const lerpV3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
/** Sample a clip at `time` seconds (clamped or looped per the clip). */
export function sampleClip(clip, time) {
    const raw = time / clip.duration;
    const u = clip.loop ? ((raw % 1) + 1) % 1 : Math.min(Math.max(raw, 0), 1);
    const keys = clip.keys;
    let b = keys.length - 1;
    for (let i = 1; i < keys.length; i++) {
        if (keys[i].t >= u) {
            b = i;
            break;
        }
    }
    const a = Math.max(0, b - 1);
    const ka = keys[a], kb = keys[b];
    const span = kb.t - ka.t || 1;
    const x = applyEase(Math.min(Math.max((u - ka.t) / span, 0), 1), kb.ease);
    const joints = {};
    for (const j of JOINT_IDS)
        joints[j] = lerpV3(ka.joints[j], kb.joints[j], x);
    return {
        joints,
        rootY: lerp(ka.rootY, kb.rootY, x),
        rootRot: lerpV3(ka.rootRot, kb.rootRot, x),
        torsoScale: lerp(ka.torsoScale, kb.torsoScale, x),
    };
}
export function blendPoses(from, to, u) {
    const joints = {};
    for (const j of JOINT_IDS)
        joints[j] = lerpV3(from.joints[j], to.joints[j], u);
    return {
        joints,
        rootY: lerp(from.rootY, to.rootY, u),
        rootRot: lerpV3(from.rootRot, to.rootRot, u),
        torsoScale: lerp(from.torsoScale, to.torsoScale, u),
    };
}
const FADE = 0.14;
/**
 * Plays one clip at a time with pose-freeze crossfades. Loop clips run
 * forever; one-shots report completion; holdLast clips freeze on their
 * final frame (defeat poses).
 */
export class ClipPlayer {
    clip = null;
    startTime = 0;
    fadeFrom = null;
    fadeStart = 0;
    lastU = 0;
    lastPose = neutralPose();
    finished = false;
    onEvent = null;
    get current() { return this.clip; }
    get isFinished() { return this.finished; }
    play(clip, now) {
        if (this.clip)
            this.fadeFrom = { ...this.lastPose, joints: { ...this.lastPose.joints } };
        this.fadeStart = now;
        this.clip = clip;
        this.startTime = now;
        this.lastU = 0;
        this.finished = false;
    }
    sample(now) {
        if (!this.clip)
            return neutralPose();
        const clip = this.clip;
        let local = now - this.startTime;
        if (!clip.loop && local >= clip.duration) {
            local = clip.duration;
            this.finished = true;
        }
        // Fire events crossed since the last sample (loop-aware).
        if (this.onEvent && clip.events.length > 0) {
            const u = clip.loop
                ? ((local / clip.duration) % 1 + 1) % 1
                : Math.min(local / clip.duration, 1);
            for (const ev of clip.events) {
                const crossed = this.lastU <= u
                    ? ev.t > this.lastU && ev.t <= u
                    : ev.t > this.lastU || ev.t <= u; // wrapped around the loop
                if (crossed)
                    this.onEvent(ev.id);
            }
            this.lastU = u;
        }
        let pose = sampleClip(clip, local);
        if (this.fadeFrom) {
            const f = (now - this.fadeStart) / FADE;
            if (f >= 1)
                this.fadeFrom = null;
            else
                pose = blendPoses(this.fadeFrom, pose, f * f * (3 - 2 * f));
        }
        this.lastPose = pose;
        return pose;
    }
}
