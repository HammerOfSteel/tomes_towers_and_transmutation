/**
 * StoneTowerKit.ts — top-level orchestrator for the elven stone-tower
 * kit POC (docs/superpowers/specs/
 * 2026-09-02-elven-stone-tower-kit-design.md): stacks a base/plinth,
 * N wall rings, and a roof cap into a complete tower, all driven from
 * `dna.seed`. Wired in as elven's `watchtower`/`tower` building-kind
 * override (both currently unstyled, so purely additive).
 */

import * as THREE from 'three';
import { mulberry32 } from '@/core/prng';
import { WALL_STRATEGY, buildWallSurface } from './StoneTowerWallSurface';

/** Local material helper -- mirrors FactionBuildingVariants.ts's own
 * `mat()` (not imported directly to avoid a circular import, since that
 * file will import buildElvenStoneTower from this one). */
function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...opts });
}

/** Shared materials passed through every piece of one tower. */
export interface StoneTowerPalette {
  stone: THREE.Material;
  shingle: THREE.Material;
  leaf: THREE.Material;
  bark: THREE.Material;
  moonstone: THREE.Material;
}

/**
 * Base/plinth ring: wider than the shaft above it (a "battered," flared
 * base, matching real tower construction for stability), plus rock
 * outcropping and tree-root tendrils blended in -- the base is where
 * the "complement, don't replace" hybrid stone+living-tree direction
 * reads most clearly at ground level.
 */
export function buildTowerBase(radius: number, plinthHeight: number, seed: number, palette: StoneTowerPalette): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(seed);

  const plinth = buildWallSurface(WALL_STRATEGY, radius * 1.2, plinthHeight, seed ^ 0xB453, palette.stone);
  g.add(plinth);

  const rootCount = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < rootCount; i++) {
    const ang = (i / rootCount) * Math.PI * 2 + rand() * 0.4;
    const len = radius * (0.5 + rand() * 0.4);
    const rx = Math.sin(ang) * radius * 0.9;
    const rz = Math.cos(ang) * radius * 0.9;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.12 + rand() * 0.06, len, 5), palette.bark);
    root.position.set(rx, len * 0.4, rz);
    root.rotation.x = Math.PI / 2 - 0.5;
    root.rotation.y = ang;
    root.castShadow = true;
    g.add(root);
  }

  for (let i = 0; i < 3; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = radius * (1.0 + rand() * 0.3);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rand() * 0.2, 0), palette.stone);
    rock.position.set(Math.sin(ang) * rr, 0.15, Math.cos(ang) * rr);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }

  return g;
}

/**
 * One floor's wall ring: the shaft surface (whichever strategy is
 * active) plus an optional pointed-arch window insert (with a small
 * moonstone accent at its point, matching elven's existing palette
 * conventions) and sparse seed-driven vine growth -- kept sparse so the
 * stone still reads as the primary material, not overwhelmed by
 * foliage.
 */
export function buildTowerWallRing(
  radius: number, ringHeight: number, seed: number, palette: StoneTowerPalette, hasWindow: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const wall = buildWallSurface(WALL_STRATEGY, radius, ringHeight, seed, palette.stone);
  g.add(wall);

  const rand = mulberry32(seed ^ 0x714D0);

  if (hasWindow) {
    const archBodyH = ringHeight * 0.35;
    const archBodyW = radius * 0.3;
    const archPointH = archBodyH * 0.5;
    const glassMat = new THREE.MeshStandardMaterial({ color: '#1a2a1a', roughness: 0.4 });
    const archBody = new THREE.Mesh(new THREE.BoxGeometry(archBodyW, archBodyH, 0.06), glassMat);
    archBody.position.set(0, ringHeight * 0.5, radius * 0.99);
    g.add(archBody);
    const archPoint = new THREE.Mesh(new THREE.ConeGeometry(archBodyW * 0.5, archPointH, 3), palette.moonstone);
    archPoint.position.set(0, ringHeight * 0.5 + archBodyH / 2 + archPointH / 2, radius * 0.99);
    archPoint.rotation.y = Math.PI / 4;
    g.add(archPoint);
  }

  if (rand() < 0.5) {
    const vineAng = rand() * Math.PI * 2;
    const vineLen = ringHeight * (0.4 + rand() * 0.4);
    const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, vineLen, 5), palette.bark);
    vine.position.set(Math.sin(vineAng) * radius * 1.01, vineLen / 2, Math.cos(vineAng) * radius * 1.01);
    vine.rotation.y = vineAng;
    vine.castShadow = true;
    g.add(vine);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08 + rand() * 0.04, 6, 5), palette.leaf);
      leaf.position.set(
        Math.sin(vineAng) * radius * 1.05,
        vineLen * (0.3 + i * 0.3),
        Math.cos(vineAng) * radius * 1.05,
      );
      g.add(leaf);
    }
  }

  return g;
}
