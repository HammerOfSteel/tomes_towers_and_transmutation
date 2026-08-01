/**
 * TileBuilder.ts — TV-3 (Procedural Tile Designer builder)
 *
 * `buildTile(dna): BuiltTile` — the mesh/material construction step deferred
 * by TV-1/TV-2 (`src/procedural/TileDNA.ts` / `TileColor.ts`). Synchronous,
 * pure THREE.js primitive geometry — no external assets required, mirroring
 * `prop-creator/builder.ts`'s approach.
 *
 * Geometry is intentionally simple (flat planes / boxes) since tiles are
 * repeatable ground/wall/feature units rendered many times per scene — the
 * goal here is a correct, inspectable *preview* + deterministic swatch, not
 * a final production mesh. `02-game-world-integration`'s terrain renderer
 * can swap in richer geometry/materials later while keeping the same
 * TileDNA → color/roughness contract.
 *
 * Called by BOTH:
 *   - The Tile Designer atelier (preview + "generate variations")
 *   - (future) the world generator's tile placement pass
 */

import * as THREE from 'three';
import type { TileDNA } from './TileDNA';
import { resolveTileColor } from './TileColor';

export interface BuiltTile {
  /** Three.js root group — add to scene with `scene.add(tile.root)`. */
  root: THREE.Group;
  /** The DNA this instance was built from. */
  dna: TileDNA;
  /** Per-frame update — tiles are static, so this is a no-op hook for parity with other builders. */
  update(t: number, dt: number): void;
  /** Release GPU resources. */
  dispose(): void;
}

const DEFAULT_ROUGHNESS = 0.85;

function makeMaterial(dna: TileDNA): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(resolveTileColor(dna)),
    roughness: dna.roughness ?? DEFAULT_ROUGHNESS,
    metalness: 0.05,
  });
}

// ── Category → geometry ───────────────────────────────────────────────────────

function buildGroundOrTransition(dna: TileDNA, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(dna.size, dna.size), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWall(dna: TileDNA, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(dna.size, dna.size * 1.4, dna.size * 0.15), mat);
  mesh.position.y = (dna.size * 1.4) / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCeiling(dna: TileDNA, mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(dna.size, dna.size), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = dna.size * 1.4;
  return mesh;
}

function buildFeature(dna: TileDNA, mat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const ground = buildGroundOrTransition(dna, mat.clone());
  const detail = new THREE.Mesh(
    new THREE.BoxGeometry(dna.size * 0.4, dna.size * 0.4, dna.size * 0.4),
    mat,
  );
  detail.position.y = (dna.size * 0.4) / 2;
  detail.castShadow = true;
  g.add(ground, detail);
  return g;
}

/**
 * Build a procedural tile from a DNA blueprint.
 * Synchronous — no async imports needed (pure THREE.js geometry).
 */
export function buildTile(dna: TileDNA): BuiltTile {
  const root = new THREE.Group();
  const mat = makeMaterial(dna);

  switch (dna.category) {
    case 'wall':
      root.add(buildWall(dna, mat));
      break;
    case 'ceiling':
      root.add(buildCeiling(dna, mat));
      break;
    case 'feature':
      root.add(buildFeature(dna, mat));
      break;
    case 'ground':
    case 'transition':
    default:
      root.add(buildGroundOrTransition(dna, mat));
      break;
  }

  root.userData['tileDna']      = dna;
  root.userData['tileCategory'] = dna.category;
  root.userData['tileBiome']    = dna.biome;

  return {
    root,
    dna,
    update: () => {},   // tiles are static; matches buildProp's convention
    dispose: () => {
      root.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else (obj.material as THREE.Material).dispose();
        }
      });
    },
  };
}
