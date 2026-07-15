/**
 * AnimationRetargeter — utilities for adapting animation clips from a shared
 * KayKit animation rig to individual character scenes.
 *
 * KayKit's character GLBs are T-pose skinned meshes; their animation clips
 * live in shared rig files (Rig_Medium_General.glb / Rig_Medium_MovementBasic.glb).
 * Both share the same bone naming convention, so the mixer can usually find
 * targets by name.  The helpers here handle the one common mismatch: some
 * exporters write tracks as "ArmatureName|BoneName.property" — the armature
 * prefix needs to be stripped before the mixer can resolve the bone.
 */

import * as THREE from 'three';

// ── Clip normalisation ────────────────────────────────────────────────────────

/**
 * Returns a clone of `clip` with any "ArmatureName|" prefix removed from
 * every track name, e.g. "Armature|Spine.quaternion" → "Spine.quaternion".
 *
 * Operates on a clone — the original clip is never mutated so it can be
 * cached and reused.
 */
export function normaliseTrackNames(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned  = clip.clone();
  cloned.tracks = cloned.tracks.map((track) => {
    const pipeIdx = track.name.indexOf('|');
    if (pipeIdx === -1) return track;

    // Build a new track with the armature prefix stripped
    const newName = track.name.slice(pipeIdx + 1);
    // Each KeyframeTrack subclass can be cloned via its typed constructor;
    // using the prototype trick handles all subclasses without a big switch.
    const newTrack = Object.assign(
      Object.create(Object.getPrototypeOf(track)) as THREE.KeyframeTrack,
      track,
    );
    newTrack.name = newName;
    return newTrack;
  });
  return cloned;
}

/**
 * Prepare a batch of animation clips from a KayKit rig for use on a character
 * scene.  Returns normalised copies — safe to pass to any AnimationMixer.
 */
export function prepareKayKitClips(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map(normaliseTrackNames);
}

// ── Compatibility check ───────────────────────────────────────────────────────

/**
 * Returns the count of clip tracks that can be resolved against bones in
 * `charScene`.  A count > 0 means the animation will at least partially play.
 */
export function countMatchingTracks(
  charScene: THREE.Group,
  clips:     THREE.AnimationClip[],
): number {
  const boneNames = new Set<string>();
  charScene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone || obj.type === 'Bone') boneNames.add(obj.name);
  });

  let count = 0;
  for (const clip of clips) {
    for (const track of clip.tracks) {
      // Track name format: "BoneName.property" or "ArmatureName|BoneName.property"
      const raw  = track.name.split('|').pop()!;       // strip armature prefix
      const bone = raw.slice(0, raw.lastIndexOf('.'));  // strip .property suffix
      if (boneNames.has(bone)) count++;
    }
  }
  return count;
}
