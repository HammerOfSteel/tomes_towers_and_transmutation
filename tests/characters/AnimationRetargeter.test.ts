/**
 * Tests for AnimationRetargeter — Phase 1
 */
import { describe, it, expect } from 'vitest';
import * as THREE               from 'three';
import {
  normaliseTrackNames,
  prepareKayKitClips,
  countMatchingTracks,
} from '@/characters/AnimationRetargeter';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeClip(name: string, tracks: { trackName: string }[]): THREE.AnimationClip {
  const threeTrack = tracks.map(
    ({ trackName }) => new THREE.QuaternionKeyframeTrack(trackName, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  );
  return new THREE.AnimationClip(name, -1, threeTrack);
}

function makeBoneScene(boneNames: string[]): THREE.Group {
  const root = new THREE.Group();
  for (const name of boneNames) {
    const bone = new THREE.Bone();
    bone.name = name;
    root.add(bone);
  }
  return root;
}

// ── normaliseTrackNames ────────────────────────────────────────────────────────

describe('normaliseTrackNames', () => {
  it('strips armature prefix from track names', () => {
    const clip    = makeClip('Idle', [{ trackName: 'Armature|Spine.quaternion' }]);
    const normed  = normaliseTrackNames(clip);
    expect(normed.tracks[0].name).toBe('Spine.quaternion');
  });

  it('leaves tracks without pipe prefix unchanged', () => {
    const clip   = makeClip('Walk', [{ trackName: 'Root.quaternion' }]);
    const normed = normaliseTrackNames(clip);
    expect(normed.tracks[0].name).toBe('Root.quaternion');
  });

  it('does not mutate the original clip', () => {
    const clip   = makeClip('Run', [{ trackName: 'Rig|Hips.quaternion' }]);
    normaliseTrackNames(clip);
    expect(clip.tracks[0].name).toBe('Rig|Hips.quaternion');
  });

  it('preserves the clip name', () => {
    const clip   = makeClip('Death', [{ trackName: 'Rig|Hips.quaternion' }]);
    const normed = normaliseTrackNames(clip);
    expect(normed.name).toBe('Death');
  });

  it('handles multiple tracks in one clip', () => {
    const clip = makeClip('Attack', [
      { trackName: 'Rig|Spine.quaternion' },
      { trackName: 'Root.position' },
      { trackName: 'Rig|UpperArm_L.quaternion' },
    ]);
    const normed = normaliseTrackNames(clip);
    expect(normed.tracks[0].name).toBe('Spine.quaternion');
    expect(normed.tracks[1].name).toBe('Root.position');
    expect(normed.tracks[2].name).toBe('UpperArm_L.quaternion');
  });
});

// ── prepareKayKitClips ────────────────────────────────────────────────────────

describe('prepareKayKitClips', () => {
  it('normalises all clips in a batch', () => {
    const clips = [
      makeClip('Idle', [{ trackName: 'Rig|Spine.quaternion' }]),
      makeClip('Walk', [{ trackName: 'Rig|Hips.quaternion' }]),
    ];
    const prepared = prepareKayKitClips(clips);
    expect(prepared[0].tracks[0].name).toBe('Spine.quaternion');
    expect(prepared[1].tracks[0].name).toBe('Hips.quaternion');
  });

  it('returns the same number of clips as input', () => {
    const clips = [makeClip('A', [{ trackName: 'X.position' }]), makeClip('B', [{ trackName: 'Y.quaternion' }])];
    expect(prepareKayKitClips(clips)).toHaveLength(2);
  });
});

// ── countMatchingTracks ───────────────────────────────────────────────────────

describe('countMatchingTracks', () => {
  it('counts tracks whose target bone exists in the scene', () => {
    const scene = makeBoneScene(['Spine', 'UpperArm_L']);
    const clip  = makeClip('Idle', [
      { trackName: 'Spine.quaternion' },
      { trackName: 'UpperArm_L.quaternion' },
      { trackName: 'UnknownBone.quaternion' },
    ]);
    expect(countMatchingTracks(scene, [clip])).toBe(2);
  });

  it('returns 0 when no bones match', () => {
    const scene = makeBoneScene(['Spine']);
    const clip  = makeClip('Walk', [{ trackName: 'Hips.quaternion' }]);
    expect(countMatchingTracks(scene, [clip])).toBe(0);
  });

  it('handles armature-prefixed track names', () => {
    const scene = makeBoneScene(['Spine']);
    // Track still has pipe prefix — countMatchingTracks must strip it
    const clip  = makeClip('Run', [{ trackName: 'Rig|Spine.quaternion' }]);
    expect(countMatchingTracks(scene, [clip])).toBe(1);
  });

  it('returns 0 for empty clip list', () => {
    const scene = makeBoneScene(['Spine']);
    expect(countMatchingTracks(scene, [])).toBe(0);
  });
});
