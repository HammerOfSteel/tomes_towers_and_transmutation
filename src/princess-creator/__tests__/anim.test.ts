// ── Animation system: clip library, baking, resolution, playback, export ────

import { describe, it, expect } from 'vitest';
import {
  ANIM_IDS, STATE_IDS, JOINT_IDS, CLIPS, NEUTRAL,
  bakeClip, resolveClips, speciesAnimInfo,
  type AnimId, type V3,
} from '../anim/clips';
import { ClipPlayer, sampleClip, neutralPose } from '../anim/player';
import { buildAnimationExport, importAnimationExport, loadTweaks } from '../anim/tweaks';
import { SPECIES_IDS } from '../types';
import { defaultDna } from '../dna';
import { buildPrincess } from '../factory';

const finiteV3 = (v: V3): boolean => v.every((n) => Number.isFinite(n));

// ── Library validity ─────────────────────────────────────────────────────────

describe('clip library', () => {
  it('defines every ANIM_ID exactly', () => {
    expect(Object.keys(CLIPS).sort()).toEqual([...ANIM_IDS].sort());
  });

  it('covers the requested game set', () => {
    const required: AnimId[] = [
      'idle', 'idle_alt', 'walk', 'run',
      'attack_1', 'attack_2', 'cast_spell_1', 'cast_spell_2',
      'get_hit_1', 'get_hit_2', 'block_1', 'block_2',
      'jump_begin', 'jump_idle', 'jump_land', 'die_1', 'die_2',
    ];
    for (const id of required) expect(ANIM_IDS).toContain(id);
  });

  it('bakes every clip with sane keys and events', () => {
    for (const id of ANIM_IDS) {
      const baked = bakeClip(CLIPS[id]);
      expect(baked.duration).toBeGreaterThan(0);
      expect(baked.keys.length).toBeGreaterThanOrEqual(2);
      let prev = -1;
      for (const key of baked.keys) {
        expect(key.t).toBeGreaterThanOrEqual(0);
        expect(key.t).toBeLessThanOrEqual(1);
        expect(key.t).toBeGreaterThanOrEqual(prev);
        prev = key.t;
        for (const j of JOINT_IDS) expect(finiteV3(key.joints[j])).toBe(true);
        expect(Number.isFinite(key.rootY)).toBe(true);
        expect(Number.isFinite(key.torsoScale)).toBe(true);
      }
      for (const ev of baked.events) {
        expect(ev.t).toBeGreaterThanOrEqual(0);
        expect(ev.t).toBeLessThanOrEqual(1);
      }
    }
  });

  it('states are loops; deaths hold their last frame', () => {
    for (const id of STATE_IDS) expect(CLIPS[id].loop).toBe(true);
    for (const id of ['die_1', 'die_2'] as const) {
      expect(CLIPS[id].loop).toBe(false);
      expect(CLIPS[id].holdLast).toBe(true);
    }
  });

  it('combat clips carry gameplay events', () => {
    expect(CLIPS.attack_1.events?.some((e) => e.id === 'hit')).toBe(true);
    expect(CLIPS.attack_2.events?.some((e) => e.id === 'hit')).toBe(true);
    expect(CLIPS.cast_spell_1.events?.some((e) => e.id === 'cast_release')).toBe(true);
    expect(CLIPS.jump_begin.events?.some((e) => e.id === 'liftoff')).toBe(true);
    expect(CLIPS.jump_land.events?.some((e) => e.id === 'land')).toBe(true);
    expect(CLIPS.walk.events?.filter((e) => e.id === 'step').length).toBe(2);
  });

  it('bare bookend keys are full neutral anchors', () => {
    // attack_1: k(0) and k(1) carry no channels — she starts AND ends at rest,
    // instead of the windup/recovery pose bleeding out to the clip edges.
    const baked = bakeClip(CLIPS.attack_1);
    const first = baked.keys[0];
    const last = baked.keys[baked.keys.length - 1];
    for (const key of [first, last]) {
      expect(key.joints.shoulderR).toEqual(NEUTRAL.joints.shoulderR);
      expect(key.rootY).toBe(0);
    }
    // …while the strike frame is far from neutral
    const strike = baked.keys.find((key) => Math.abs(key.t - 0.48) < 0.01)!;
    expect(Math.abs(strike.joints.shoulderR[0] - NEUTRAL.joints.shoulderR![0])).toBeGreaterThan(0.5);
  });

  it('sparse channels interpolate between the keys that specify them', () => {
    const baked = bakeClip({
      id: 'idle', label: 'x', group: 'misc', duration: 1, loop: false,
      keys: [
        { t: 0, joints: { neck: [0, 0, 0] } },
        { t: 0.5, rootY: 0.1 },                  // partial key: neck unspecified
        { t: 1, joints: { neck: [1, 0, 0] } },
      ],
    });
    expect(baked.keys[1].joints.neck[0]).toBeCloseTo(0.5, 5);
    // unspecified joints sit at neutral
    expect(baked.keys[1].joints.elbowL).toEqual(NEUTRAL.joints.elbowL);
  });
});

// ── Resolution: species flavor + tweaks ──────────────────────────────────────

describe('resolveClips', () => {
  it('produces finite poses for every species × clip × time', () => {
    for (const species of SPECIES_IDS) {
      const set = resolveClips(defaultDna(species));
      for (const id of ANIM_IDS) {
        const clip = set[id];
        expect(clip.duration).toBeGreaterThan(0);
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          const pose = sampleClip(clip, u * clip.duration);
          for (const j of JOINT_IDS) expect(finiteV3(pose.joints[j])).toBe(true);
          expect(Number.isFinite(pose.rootY)).toBe(true);
          expect(Number.isFinite(pose.torsoScale)).toBe(true);
        }
      }
    }
  });

  it('lamia slithers instead of walking', () => {
    const set = resolveClips(defaultDna('lamia'));
    expect(set.walk.label).toBe('Slither');
    expect(set.run.label).toContain('Slither');
    expect(set.jump_begin.label).toBe('Coil Spring');
    // no leg swing in a slither — hips stay parked at the neutral stance
    const mid = sampleClip(set.walk, set.walk.duration * 0.25);
    expect(Math.abs(mid.joints.hipL[0] - NEUTRAL.joints.hipL![0])).toBeLessThan(0.01);
    const humanMid = sampleClip(resolveClips(defaultDna('human')).walk, 0.1);
    expect(Math.abs(humanMid.joints.hipL[0])).toBeGreaterThan(0.1);
  });

  it('slime melts and skeleton collapses on defeat', () => {
    const slime = resolveClips(defaultDna('slime'));
    const lastMelt = slime.die_1.keys[slime.die_1.keys.length - 1];
    expect(lastMelt.rootY).toBeLessThan(-3);
    expect(lastMelt.torsoScale).toBeGreaterThan(1.3);

    const bones = resolveClips(defaultDna('skeleton'));
    const pile = bones.die_2.keys[bones.die_2.keys.length - 1];
    expect(pile.rootY).toBeLessThan(-2);
    expect(bones.die_2.label).toContain('Collapse');
  });

  it('species speed scalars stretch/compress durations', () => {
    const troll = defaultDna('troll');
    const pixie = defaultDna('pixie');
    troll.motion.energy = 0.5;
    pixie.motion.energy = 0.5;
    const slow = resolveClips(troll).walk.duration;
    const fast = resolveClips(pixie).walk.duration;
    expect(slow).toBeGreaterThan(fast);
    expect(speciesAnimInfo('troll').speed).toBeLessThan(1);
    expect(speciesAnimInfo('pixie').speed).toBeGreaterThan(1);
  });

  it('energy trait nudges playback speed', () => {
    const calm = defaultDna('human');
    const hyper = defaultDna('human');
    calm.motion.energy = 0;
    hyper.motion.energy = 1;
    expect(resolveClips(calm).idle.duration)
      .toBeGreaterThan(resolveClips(hyper).idle.duration);
  });

  it('tweaks scale speed and amplitude', () => {
    const dna = defaultDna('human');
    const base = resolveClips(dna);
    const tweaked = resolveClips(dna, { attack_1: { speed: 2, amp: 1.5 } });
    expect(tweaked.attack_1.duration).toBeCloseTo(base.attack_1.duration / 2, 5);
    // amplitude: joint excursion from neutral grows 1.5×
    const neutralX = NEUTRAL.joints.shoulderR![0];
    const excursion = (set: typeof base): number => Math.max(
      ...set.attack_1.keys.map((key) => Math.abs(key.joints.shoulderR[0] - neutralX)),
    );
    expect(excursion(tweaked)).toBeCloseTo(excursion(base) * 1.5, 5);
    // untouched clips identical
    expect(tweaked.walk.duration).toBeCloseTo(base.walk.duration, 5);
  });
});

// ── Sampling & playback ──────────────────────────────────────────────────────

describe('sampleClip / ClipPlayer', () => {
  const set = resolveClips(defaultDna('human'));

  it('loops wrap seamlessly', () => {
    const walk = set.walk;
    const a = sampleClip(walk, walk.duration * 0.25);
    const b = sampleClip(walk, walk.duration * 1.25);
    expect(b.joints.hipL[0]).toBeCloseTo(a.joints.hipL[0], 5);
    expect(b.rootY).toBeCloseTo(a.rootY, 5);
  });

  it('one-shots clamp at their final key', () => {
    const die = set.die_1;
    const end = sampleClip(die, die.duration);
    const past = sampleClip(die, die.duration * 40);
    expect(past.rootY).toBeCloseTo(end.rootY, 5);
  });

  it('fires events once when crossed, loop-aware', () => {
    const player = new ClipPlayer();
    const fired: string[] = [];
    player.onEvent = (id) => fired.push(id);

    player.play(set.attack_1, 0);
    player.sample(0.01);
    player.sample(set.attack_1.duration * 0.3);   // before the hit frame
    expect(fired).not.toContain('hit');
    player.sample(set.attack_1.duration * 0.6);   // crossed 0.42
    expect(fired.filter((f) => f === 'hit')).toHaveLength(1);
    player.sample(set.attack_1.duration * 0.9);   // no re-fire
    expect(fired.filter((f) => f === 'hit')).toHaveLength(1);
  });

  it('re-fires loop events every cycle', () => {
    const player = new ClipPlayer();
    const fired: string[] = [];
    player.onEvent = (id) => fired.push(id);
    player.play(set.walk, 0);
    const d = set.walk.duration;
    for (let t = 0.001; t < d * 2.05; t += d / 20) player.sample(t);
    expect(fired.filter((f) => f === 'step').length).toBeGreaterThanOrEqual(4);
  });

  it('crossfades from the previous pose', () => {
    const player = new ClipPlayer();
    player.play(set.idle, 0);
    player.sample(0.5);
    player.play(set.attack_1, 0.5);
    const blended = player.sample(0.51);
    const pure = sampleClip(set.attack_1, 0.01);
    // Right after the switch the pose still carries idle — not the raw clip.
    const diff = Math.abs(blended.joints.shoulderR[0] - pure.joints.shoulderR[0])
      + Math.abs(blended.rootY - pure.rootY);
    expect(diff).toBeGreaterThan(0.0001);
    // Well past the fade window it matches the clip exactly.
    const settled = player.sample(0.5 + 0.3);
    const target = sampleClip(set.attack_1, 0.3);
    expect(settled.joints.shoulderR[0]).toBeCloseTo(target.joints.shoulderR[0], 4);
  });

  it('neutralPose is a fresh copy each call', () => {
    const a = neutralPose();
    a.rootY = 99;
    expect(neutralPose().rootY).toBe(0);
  });
});

// ── Animator through the game façade ─────────────────────────────────────────

describe('factory animation API', () => {
  it('exposes the resolved clip set and plays states', () => {
    const p = buildPrincess(defaultDna('human'));
    expect(p.clips).not.toBeNull();
    expect(Object.keys(p.clips!)).toHaveLength(ANIM_IDS.length);
    p.setState('walk');
    p.update(0.4, 0.016);
    // legs are swinging
    expect(Math.abs(p.rig.hips[0].rotation.x)).toBeGreaterThan(0.01);
    p.dispose();
  });

  it('deaths hold their final frame', () => {
    const p = buildPrincess(defaultDna('human'));
    p.update(0.1, 0.016);
    p.play('die_1');
    const d = p.clips!.die_1.duration;
    p.update(0.1 + d + 1, 0.016);
    // swooned into a seated slump: sunk well down, leaning back
    expect(p.rig.root.rotation.x).toBeLessThan(-0.15);
    expect(p.rig.root.position.y).toBeLessThan(p.rig.baseY - 0.7);
    const downedY = p.rig.root.position.y;
    const downedRot = p.rig.root.rotation.x;
    p.update(0.1 + d + 8, 0.016);
    expect(p.rig.root.position.y).toBeCloseTo(downedY, 3);
    expect(p.rig.root.rotation.x).toBeCloseTo(downedRot, 3);
    p.dispose();
  });

  it('surfaces gameplay events', () => {
    const p = buildPrincess(defaultDna('human'));
    const fired: string[] = [];
    p.onEvent((id) => fired.push(id));
    p.update(0.05, 0.016);
    p.play('attack_1');
    const d = p.clips!.attack_1.duration;
    for (let t = 0.06; t < 0.06 + d; t += d / 30) p.update(t, 0.016);
    expect(fired).toContain('hit');
    p.dispose();
  });

  it('accepts tweaks from an exported library', () => {
    const base = buildPrincess(defaultDna('human'));
    const quick = buildPrincess(defaultDna('human'), { tweaks: { walk: { speed: 1.5 } } });
    expect(quick.clips!.walk.duration).toBeCloseTo(base.clips!.walk.duration / 1.5, 5);
    base.dispose();
    quick.dispose();
  });

  it('animate:false still exposes a null-safe surface', () => {
    const p = buildPrincess(defaultDna('foxling'), { animate: false });
    expect(p.clips).toBeNull();
    p.play('attack_1');       // no-ops, no throw
    p.setState('run');
    p.update(0.5, 0.016);
    p.dispose();
  });
});

// ── Export / import ──────────────────────────────────────────────────────────

describe('animation export', () => {
  it('bundles every species with a full resolved clip set', () => {
    const data = buildAnimationExport({});
    expect(data.format).toBe('ttt-princess-anim');
    expect(data.v).toBe(1);
    expect(data.rig.joints).toEqual(JOINT_IDS);
    expect(Object.keys(data.species)).toHaveLength(SPECIES_IDS.length);
    for (const id of SPECIES_IDS) {
      const entry = data.species[id];
      expect(Object.keys(entry.clips)).toHaveLength(ANIM_IDS.length);
      expect(entry.speed).toBeGreaterThan(0);
    }
    expect(data.species.lamia.clips.walk.label).toBe('Slither');
  });

  it('round-trips through JSON intact', () => {
    const data = buildAnimationExport({ human: { walk: { speed: 1.2 } } });
    const parsed = JSON.parse(JSON.stringify(data)) as typeof data;
    expect(parsed).toEqual(data);
    expect(parsed.tweaks.human?.walk?.speed).toBe(1.2);
  });

  it('import validates format and clamps tweak ranges', () => {
    expect(importAnimationExport(null)).toBe(false);
    expect(importAnimationExport({ format: 'nope' })).toBe(false);
    expect(importAnimationExport({ format: 'ttt-princess-anim' })).toBe(false);

    const ok = importAnimationExport({
      format: 'ttt-princess-anim',
      tweaks: { human: { walk: { speed: 99, amp: 0.01 } }, bogus_species: { walk: { speed: 1 } } },
    });
    expect(ok).toBe(true);
    const stored = loadTweaks();
    expect(stored.human?.walk?.speed).toBe(2);      // clamped
    expect(stored.human?.walk?.amp).toBe(0.4);      // clamped
    expect((stored as Record<string, unknown>).bogus_species).toBeUndefined();
    localStorage.clear();
  });
});
