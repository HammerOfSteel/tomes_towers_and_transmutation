/**
 * AmbientWildlife.ts — peaceful, chunk-scoped ambient creatures (rabbits, goats) for the live
 * OverworldScene (Phase 9 batch 1 — 2 ground-based species; birds/flight deferred to a
 * follow-up batch; see docs/superpowers/specs/2026-08-31-ambient-wildlife-design.md).
 *
 * Purely cosmetic: no health, no damage, no death, no combat, no player interaction beyond
 * fleeing when approached. Reuses the same procedural creature-rig system
 * (CreatureDNA/buildCreature/animateCreature) already used for the player, enemies, and NPCs.
 */
import * as THREE from 'three';
import { dnaForArchetype, type CreatureDNA } from '@/creatures/CreatureDNA';
import { buildCreature, computeQuadNaturalFootY, type CreatureRig } from '@/creatures/CreatureBuilder';
import { animateCreature } from '@/creatures/CreatureAnimator';
import { mulberry32 } from '@/core/prng';
import { poissonDisk } from '@/core/poissonDisk';
import { isScatterAllowed } from '@/world/ScatterRules';
import type { WorldGrid, BiomeId } from '@/world/WorldGrid';

// ── Species ───────────────────────────────────────────────────────────────

export type AmbientSpecies = 'rabbit' | 'goat';

export interface AmbientSpeciesDef {
  species: AmbientSpecies;
  dna: CreatureDNA;
}

function _rabbitDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.4;
  dna.face = {
    type: 'cute', eyeColor: 0x2a1a0a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x8a7a5c, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xc9b896, secondary: 0x8a7a5c, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x8a7a5c, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

function _goatDNA(): CreatureDNA {
  const dna = dnaForArchetype('quadruped');
  dna.proportions.global = 0.75;
  dna.face = {
    type: 'blank', eyeColor: 0x3a2a1a, mouthType: 'none', expression: 'neutral',
    eyeShape: 'round', skinPattern: 'none', markColor: 0x9a8a70, browStyle: 'none',
  };
  dna.colors = {
    primary: 0xe8e0d0, secondary: 0x9a8a70, emissive: 0x000000, emissiveIntensity: 0,
    pattern: 'none', patternColor: 0x9a8a70, patternScale: 1.0, patternOpacity: 0.35,
  };
  return dna;
}

export const AMBIENT_SPECIES: Record<AmbientSpecies, AmbientSpeciesDef> = {
  rabbit: { species: 'rabbit', dna: _rabbitDNA() },
  goat:   { species: 'goat',   dna: _goatDNA() },
};

// ── Per-biome density rules ─────────────────────────────────────────────────

export interface AmbientBiomeRule {
  species: AmbientSpecies;
  /** Relative spawn density vs. AMBIENT_BASE_SPACING's single Poisson-disk pass — see this
   *  plan's Global Constraints for the (spacing_base/spacing_desired)² derivation. */
  keepProbability: number;
}

export const AMBIENT_BIOME_RULES: Partial<Record<BiomeId, AmbientBiomeRule>> = {
  forest:    { species: 'rabbit', keepProbability: 1.0 },
  grassland: { species: 'rabbit', keepProbability: 1.0 },
  taiga:     { species: 'rabbit', keepProbability: 0.327 },
  mountain:  { species: 'goat',   keepProbability: 0.529 },
};

// ── Tunables (see design spec §3/§4) ────────────────────────────────────────

export const WANDER_RADIUS = 8;              // world units from spawn point
export const FLEE_TRIGGER_RADIUS = 6;        // world units from player
export const FLEE_EXIT_RADIUS = FLEE_TRIGGER_RADIUS * 1.5; // hysteresis band
export const WANDER_SPEED = 1.2;             // world units / second
export const FLEE_SPEED = 4.0;               // world units / second
export const IDLE_MIN_DWELL = 2;             // seconds
export const IDLE_MAX_DWELL = 5;             // seconds
export const MAX_ACTIVE_AMBIENT_CREATURES = 24;
export const AMBIENT_BASE_SPACING = 40;      // world units, single per-chunk Poisson-disk pass

// ── Placement ─────────────────────────────────────────────────────────────

export interface AmbientSpawnPoint {
  x: number;
  z: number;
  species: AmbientSpecies;
}

/**
 * Scatter ambient-wildlife spawn points within a `chunkWorldSize`×`chunkWorldSize` WU square
 * whose corner is at world `(originX, originZ)` — mirrors `OverworldScene.ts`'s
 * `_buildChunkScatter()` tree/rock loop structure exactly (same Poisson-disk + per-candidate
 * biome/isScatterAllowed gating), but at a single `AMBIENT_BASE_SPACING` and with an additional
 * per-biome probability-thinning step (see this plan's Global Constraints) instead of scatter's
 * per-kind fixed spacing. Deterministic for a fixed `seed`.
 */
export function selectAmbientSpawnPoints(
  wg: WorldGrid,
  originX: number,
  originZ: number,
  chunkWorldSize: number,
  seed: number,
): AmbientSpawnPoint[] {
  const rand = mulberry32(seed);
  const halfW = (wg.width - 1) / 2;
  const halfH = (wg.height - 1) / 2;
  const points: AmbientSpawnPoint[] = [];

  const candidates = poissonDisk(chunkWorldSize, chunkWorldSize, AMBIENT_BASE_SPACING, rand);
  for (const [px, pz] of candidates) {
    const x = originX + px;
    const z = originZ + pz;

    const col = Math.floor(x / wg.tileUnit + halfW);
    const row = Math.floor(z / wg.tileUnit + halfH);
    if (col < 0 || col >= wg.width || row < 0 || row >= wg.height) continue;

    const cell = wg.get(col, row);
    const rule = AMBIENT_BIOME_RULES[cell.biome];
    if (!rule) continue;
    if (!isScatterAllowed(cell, 'ambient')) continue;
    if (rand() > rule.keepProbability) continue;

    points.push({ x, z, species: rule.species });
  }
  return points;
}

// ── Behavior FSM ──────────────────────────────────────────────────────────

export type AmbientState = 'idle' | 'wander' | 'flee';

export interface AmbientBehaviorState {
  state: AmbientState;
  targetX: number;
  targetZ: number;
  /** Only meaningful while state === 'idle' — counts down to the next wander transition. */
  dwellTimer: number;
}

const ARRIVAL_THRESHOLD = 0.3; // world units — "close enough" to a wander/flee target
const FLEE_TARGET_DISTANCE = 10; // world units to flee away from the player, in the away direction

/**
 * Pure idle/wander/flee state transition — no THREE.js dependency, so it's fully testable with
 * plain numbers. The caller (AmbientCreature, Task 4) is responsible for actually moving
 * (ownX, ownZ) toward (targetX, targetZ) each frame at a state-appropriate speed and for
 * selecting the matching animation state; this function only decides WHAT the next state/target
 * should be, not how movement happens.
 */
export function tickAmbientBehavior(
  prev: AmbientBehaviorState,
  ownX: number, ownZ: number,
  spawnX: number, spawnZ: number,
  playerX: number, playerZ: number,
  dt: number,
  rand: () => number,
): AmbientBehaviorState {
  const dxPlayer = ownX - playerX;
  const dzPlayer = ownZ - playerZ;
  const playerDist = Math.sqrt(dxPlayer * dxPlayer + dzPlayer * dzPlayer);

  if (prev.state === 'flee') {
    if (playerDist > FLEE_EXIT_RADIUS) {
      return {
        state: 'idle', targetX: prev.targetX, targetZ: prev.targetZ,
        dwellTimer: IDLE_MIN_DWELL + rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
      };
    }
    return prev; // still within the hysteresis band — keep fleeing toward the existing target
  }

  if (playerDist < FLEE_TRIGGER_RADIUS) {
    // Flee directly away from the player's current position.
    const awayLen = playerDist > 1e-6 ? playerDist : 1;
    const awayX = dxPlayer / awayLen;
    const awayZ = dzPlayer / awayLen;
    return {
      state: 'flee',
      targetX: ownX + awayX * FLEE_TARGET_DISTANCE,
      targetZ: ownZ + awayZ * FLEE_TARGET_DISTANCE,
      dwellTimer: 0,
    };
  }

  if (prev.state === 'idle') {
    const dwellTimer = prev.dwellTimer - dt;
    if (dwellTimer > 0) return { ...prev, dwellTimer };
    // Dwell expired — pick a new wander target within WANDER_RADIUS of the spawn point.
    const angle = rand() * Math.PI * 2;
    const dist = rand() * WANDER_RADIUS;
    return {
      state: 'wander',
      targetX: spawnX + Math.cos(angle) * dist,
      targetZ: spawnZ + Math.sin(angle) * dist,
      dwellTimer: 0,
    };
  }

  // prev.state === 'wander'
  const dxTarget = prev.targetX - ownX;
  const dzTarget = prev.targetZ - ownZ;
  const targetDist = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);
  if (targetDist <= ARRIVAL_THRESHOLD) {
    return {
      state: 'idle', targetX: prev.targetX, targetZ: prev.targetZ,
      dwellTimer: IDLE_MIN_DWELL + rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
    };
  }
  return prev; // still en route — keep the same target
}

// ── AmbientCreature ───────────────────────────────────────────────────────

/**
 * One peaceful, wandering ambient creature — owns a CreatureRig, a pure AmbientBehaviorState,
 * and its own seeded PRNG (for wander-target/dwell-timer randomness, deterministic per
 * creature). No physics body, no collider, no health — purely decorative.
 */
export class AmbientCreature {
  readonly root: THREE.Group;
  private readonly _rig: CreatureRig;
  private readonly _rand: () => number;
  private readonly _spawnX: number;
  private readonly _spawnZ: number;
  private _behavior: AmbientBehaviorState;
  private _animTime = 0;

  constructor(species: AmbientSpecies, spawnPosition: THREE.Vector3, seed: number) {
    const def = AMBIENT_SPECIES[species];
    this._rig = buildCreature(def.dna);
    this._rig.root.scale.setScalar(def.dna.proportions.global);

    // Foot-grounding: computeQuadNaturalFootY() returns an UNSCALED local offset (see this
    // task's plan-level rationale comment) — must be multiplied by the same global scale
    // applied above, unlike PlayerController.ts's usage (safe there only because the player's
    // own scale sits at/near 1.0).
    const footY = computeQuadNaturalFootY(this._rig) * def.dna.proportions.global;
    this._rig.root.position.y = -footY;

    this.root = new THREE.Group();
    this.root.add(this._rig.root);
    this.root.position.set(spawnPosition.x, spawnPosition.y, spawnPosition.z);

    this._spawnX = spawnPosition.x;
    this._spawnZ = spawnPosition.z;
    this._rand = mulberry32(seed);
    this._behavior = {
      state: 'idle', targetX: spawnPosition.x, targetZ: spawnPosition.z,
      dwellTimer: IDLE_MIN_DWELL + this._rand() * (IDLE_MAX_DWELL - IDLE_MIN_DWELL),
    };
  }

  update(playerPos: THREE.Vector3, dt: number): void {
    const dxLOD = this.root.position.x - playerPos.x;
    const dzLOD = this.root.position.z - playerPos.z;
    const distanceToPlayer = Math.sqrt(dxLOD * dxLOD + dzLOD * dzLOD);
    if (computeAmbientLOD(distanceToPlayer) === 'far') {
      // Frozen — skip the behavior tick and animation entirely. Position,
      // rotation, and _behavior are left untouched so the creature resumes
      // exactly where it was once the player is back in range (see design
      // spec §3's accepted flee-state edge case for why this is safe).
      return;
    }

    this._behavior = tickAmbientBehavior(
      this._behavior,
      this.root.position.x, this.root.position.z,
      this._spawnX, this._spawnZ,
      playerPos.x, playerPos.z,
      dt, this._rand,
    );

    const speed = this._behavior.state === 'flee' ? FLEE_SPEED
      : this._behavior.state === 'wander' ? WANDER_SPEED
      : 0;

    if (speed > 0) {
      const dx = this._behavior.targetX - this.root.position.x;
      const dz = this._behavior.targetZ - this.root.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 1e-6) {
        const step = Math.min(speed * dt, dist);
        this.root.position.x += (dx / dist) * step;
        this.root.position.z += (dz / dist) * step;
        this.root.rotation.y = Math.atan2(dx, dz);
      }
    }

    this._animTime += dt;
    animateCreature(this._rig, {
      state: this._behavior.state === 'idle' ? 'idle' : 'walk',
      time: this._animTime,
      velocity: speed,
    });
  }

  dispose(): void {
    this._rig.dispose();
  }
}

// ── Distance LOD ──────────────────────────────────────────────────────────

export type AmbientLODTier = 'near' | 'far';

/**
 * Distance (world units) beyond which an ambient creature is frozen (its
 * behavior-FSM tick and skeletal animation are both skipped) instead of
 * fully simulated. See docs/superpowers/specs/2026-08-31-ambient-wildlife-
 * lod-design.md §3 for the exact rationale — comfortably past this game's
 * tight isometric-camera view radius, and well outside FLEE_EXIT_RADIUS
 * (9) so a fleeing creature always exits flee under normal player
 * movement before ever reaching this threshold.
 */
export const LOD_FAR_DISTANCE_WU = 45;

/** Pure distance -> LOD tier classification. No THREE.js dependency. */
export function computeAmbientLOD(distanceToPlayer: number): AmbientLODTier {
  return distanceToPlayer > LOD_FAR_DISTANCE_WU ? 'far' : 'near';
}
