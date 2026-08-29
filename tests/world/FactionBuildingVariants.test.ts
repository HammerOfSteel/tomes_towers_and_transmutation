/**
 * FactionBuildingVariants.test.ts — Phase 2b of the settlement visual
 * fidelity plan. Verifies faction-specific building variants build without
 * error, are dispatched correctly by buildBuilding(), and are geometrically
 * distinct from both each other and the generic shared-shape fallback.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildBuilding } from '@/world/buildings/BuildingBuilder';
import { FACTION_BUILDING_VARIANTS, getFactionBuildingVariant } from '@/world/buildings/FactionBuildingVariants';
import type { BuildingDNA, BuildingKind, Faction } from '@/world/buildings/BuildingDNA';
import { STYLE_COLORS } from '@/world/buildings/BuildingDNA';
import { buildVulperiaDenMoundGrid, buildDwarvenHallGrid, buildElvenTrunkGrid, buildVampireSpireGrid } from '@/world/buildings/FactionBlockProfiles';
import { BLOCK_UNIT, hasBlock, getMaterialKey } from '@/world/buildings/BlockKit';

function makeDna(kind: BuildingKind, faction: Faction | undefined, seed = 99): BuildingDNA {
  return {
    v: 1, kind: 'building', name: `test ${kind}`, seed,
    buildingKind: kind, size: 'small', floors: 1,
    style: 'thatched', condition: 'weathered',
    hasInterior: true, interiorLayout: 'single_room',
    colors: STYLE_COLORS['thatched'], rotation: 0,
    terrace: 'none', features: [], faction,
  };
}

function countMeshes(g: THREE.Group): number {
  let n = 0;
  g.traverse(o => { if (o instanceof THREE.Mesh) n++; });
  return n;
}

function findBiggestMesh(g: THREE.Group): THREE.Mesh {
  let biggest: THREE.Mesh | null = null;
  let biggestCount = 0;
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      const count = (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      if (count > biggestCount) { biggestCount = count; biggest = o; }
    }
  });
  expect(biggest).not.toBeNull();
  return biggest!;
}

/**
 * Like findBiggestMesh, but restricted to CylinderGeometry meshes. Some
 * faction builders (e.g. undead's floating orb, an IcosahedronGeometry)
 * include non-indexed geometries whose raw vertex-array length is inflated
 * well past any indexed cylinder/cone mesh's — this avoids accidentally
 * grabbing a fixed, seed-independent decorative shape when the intent is
 * to inspect the noise-perturbed tapered body.
 */
function findBiggestCylinderMesh(g: THREE.Group): THREE.Mesh {
  let biggest: THREE.Mesh | null = null;
  let biggestCount = 0;
  g.traverse(o => {
    if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') {
      const count = (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      if (count > biggestCount) { biggestCount = count; biggest = o; }
    }
  });
  expect(biggest).not.toBeNull();
  return biggest!;
}

function expectAllVerticesFinite(g: THREE.Group): void {
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      const attr = o.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.array.length; i++) {
        expect(Number.isFinite(attr.array[i])).toBe(true);
      }
    }
  });
}

describe('FACTION_BUILDING_VARIANTS registry', () => {
  const covered: Array<[Faction, BuildingKind]> = [
    ['vulperia', 'villa'], ['vulperia', 'chapel'], ['vulperia', 'shop'],
    ['slime', 'villa'], ['slime', 'chapel'], ['slime', 'shop'],
    ['undead_common', 'villa'], ['undead_common', 'chapel'], ['undead_common', 'shop'],
    ['elven', 'villa'], ['elven', 'chapel'], ['elven', 'shop'],
    ['dwarven', 'villa'], ['dwarven', 'chapel'], ['dwarven', 'shop'],
    ['orcish', 'villa'], ['orcish', 'chapel'], ['orcish', 'shop'],
    ['vampire', 'villa'], ['vampire', 'chapel'], ['vampire', 'shop'],
    ['fae', 'villa'], ['fae', 'chapel'], ['fae', 'shop'],
  ];

  for (const [faction, kind] of covered) {
    it(`${faction}/${kind} builds a non-empty group without throwing`, () => {
      const builder = getFactionBuildingVariant(faction, kind);
      expect(builder).not.toBeNull();
      const g = builder!(makeDna(kind, faction));
      expect(g).toBeInstanceOf(THREE.Group);
      expect(countMeshes(g)).toBeGreaterThan(0);
    });
  }

  it('returns null for an uncovered (faction, kind) pair', () => {
    expect(getFactionBuildingVariant('human_town', 'villa')).toBeNull();
    expect(getFactionBuildingVariant('vulperia', 'watchtower')).toBeNull();
  });

  it('returns null when faction is undefined', () => {
    expect(getFactionBuildingVariant(undefined, 'villa')).toBeNull();
  });

  it('is deterministic for the same faction/kind/seed', () => {
    const a = FACTION_BUILDING_VARIANTS.slime!.villa!(makeDna('villa', 'slime', 42));
    const b = FACTION_BUILDING_VARIANTS.slime!.villa!(makeDna('villa', 'slime', 42));
    expect(countMeshes(a)).toBe(countMeshes(b));
  });

  it('produces geometrically distinct mesh counts across all covered factions for the same kind', () => {
    const counts = new Set(
      (['vulperia', 'slime', 'undead_common', 'elven', 'dwarven', 'orcish', 'vampire', 'fae'] as Faction[]).map(f =>
        countMeshes(FACTION_BUILDING_VARIANTS[f]!.villa!(makeDna('villa', f, 7))),
      ),
    );
    // Not a strict requirement that all eight differ, but they should not
    // all collapse to one identical count (which would suggest they're
    // secretly sharing the same builder).
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('buildBuilding() dispatch — faction variant precedence', () => {
  it('uses the faction variant builder when one exists for (faction, kind)', () => {
    const withVariant = buildBuilding(makeDna('villa', 'slime', 5));
    const withoutVariant = buildBuilding(makeDna('villa', 'elven', 5));
    // Same seed/kind, different faction -> different builder path -> should
    // not produce an identical mesh count (elven falls back to the shared
    // villa shape + style overlay; slime uses the bespoke blob builder).
    expect(countMeshes(withVariant.exteriorGroup)).not.toBe(countMeshes(withoutVariant.exteriorGroup));
  });

  it('falls back to the shared shape + style overlay when faction has no variant for this kind', () => {
    // vulperia has no 'watchtower' variant -> falls back to buildWatchtower().
    const inst = buildBuilding(makeDna('watchtower', 'vulperia', 5));
    expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(countMeshes(inst.exteriorGroup)).toBeGreaterThan(0);
  });

  it('falls back to the shared shape + style overlay when faction is undefined (back-compat)', () => {
    const inst = buildBuilding(makeDna('villa', undefined, 5));
    expect(inst.exteriorGroup).toBeInstanceOf(THREE.Group);
    expect(countMeshes(inst.exteriorGroup)).toBeGreaterThan(0);
  });
});

// ── Vulperia deep-quality pass (settlement visual fidelity follow-up) ──────
// Phase 2e §2e.3: regression guards for the grounded BlockKit heightfield
// den mound (small earth/grass/facade blocks with marching-squares-style
// corner rounding) that replaced the earlier noise-perturbed deformed-
// sphere ("organic mound") body, plus the timber-stave round door/window
// kit (unchanged/reused across both mound implementations).
describe('Vulperia — BlockKit heightfield den mound (not a deformed sphere blob)', () => {
  it('produces only finite (non-NaN/non-infinite) vertices for the block mound + props', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.vulperia![kind]!(makeDna(kind, 'vulperia', 123)));
    }
  });

  it('builds the mound from many discrete block meshes (a Lego-style assembly, not one smooth primitive)', () => {
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 7));
    // No large SphereGeometry mound body anywhere (the old deformed-
    // hemisphere body is gone) -- small decorative spheres (door handle,
    // chimney smoke puff, flower/plant heads) are fine and expected.
    let hasLargeSphere = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') {
        const params = (o.geometry as THREE.SphereGeometry).parameters;
        if (params.radius > 0.5) hasLargeSphere = true;
      }
    });
    expect(hasLargeSphere).toBe(false);
    // A block mound's merged geometry has far more vertices than a single
    // low-poly primitive would, reflecting many individually-culled block
    // faces assembled together.
    const mound = findBiggestMesh(g);
    const pos = mound.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('produces a different mound silhouette per seed (deterministic but seed-varied)', () => {
    const countBlockVerts = (g: THREE.Group): number => {
      let total = 0;
      g.traverse(o => {
        if (o instanceof THREE.Mesh) total += (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      });
      return total;
    };
    const gA = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    const gB = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 1));
    expect(countBlockVerts(gA)).toBe(countBlockVerts(gA2)); // deterministic for the same seed
    expect(countBlockVerts(gA)).not.toBe(countBlockVerts(gB)); // varies across seeds
  });

  // ── v2 fix, still honoured by the block mound: a real flat facade so the
  // door sits on a genuinely "built" surface, not a bare curved bank. The
  // block system achieves this via a carved notch framed by dedicated
  // `'facade'`-material post/lintel blocks rather than a separate bolted-on
  // BoxGeometry panel.
  it('gives the mound a dedicated facade-material block group (a genuinely built surface around the door), distinct from the earth/grass body', () => {
    const dna = makeDna('villa', 'vulperia', 5);
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(dna);
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    // Earth (dna.colors.walls), grass (#3d6b35) and facade (#4a3520) block
    // materials should all be present as distinct merged meshes.
    expect(materialColors.has(new THREE.Color(dna.colors.walls).getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color('#3d6b35').getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color('#4a3520').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block mound at the front (a genuine hole, not just an applied surface)', () => {
    // The block occupancy grid itself (which the mound mesh is built from)
    // must have an actual notch carved into the front face so the round
    // door prop sits in a real recess rather than floating in front of a
    // solid bank.
    const grid = buildVulperiaDenMoundGrid(5, 6, 5, 3, { facade: true });
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('gives the door a colour that genuinely contrasts against the wall colour (not a same-hue near-match)', () => {
    const g = FACTION_BUILDING_VARIANTS.vulperia!.villa!(makeDna('villa', 'vulperia', 5));
    const wallColor = new THREE.Color('#d4a060'); // vulperia's FACTION_PRESETS wall colour
    const colorDistance = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    let maxDoorDistance = 0;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CircleGeometry' && o.material instanceof THREE.MeshStandardMaterial) {
        const dist = colorDistance(o.material.color, wallColor);
        if (dist > maxDoorDistance) maxDoorDistance = dist;
      }
    });
    // A same-hue near-match (the original #6a3810 door vs #d4a060 wall) is
    // only ~0.5 apart in this RGB colour-distance metric; a genuinely
    // contrasting accent colour should be well clear of that.
    expect(maxDoorDistance).toBeGreaterThan(0.6);
  });
});

// ── Orcish deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the palisade-wall + rough-cone-roof rework that
// replaced the original single tapered-cylinder "tent" standing in for a
// whole hut.
describe('Orcish — palisade wall + rough hide roof (not one tapered cylinder)', () => {
  it('produces only finite vertices for the noise-perturbed roof after displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.orcish![kind]!(makeDna(kind, 'orcish', 55)));
    }
  });

  it('builds the villa (Warlord Hall) from many individually-solid log pieces, not one primitive', () => {
    const g = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    // The palisade wall alone contributes 16 individual log cylinders, plus
    // the roof cone, crossed poles, door posts/lintel, doorway and totems --
    // a real multi-part assembly rather than a single tapered-cylinder "hut".
    expect(countMeshes(g)).toBeGreaterThanOrEqual(16 + 8);
  });

  it('perturbs the rough-cone roof off a perfect cone radius (ragged hide flaps, not a tidy cone)', () => {
    const g = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 9));
    const roof = findBiggestMesh(g);
    const pos = roof.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    // A perfect cone has a small, fixed set of ring radii (one per height
    // segment); noise perturbation should spread this out into many distinct
    // values.
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('produces a different roof silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    const gB = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.orcish!.villa!(makeDna('villa', 'orcish', 1));
    const sumXZ = (g: THREE.Group): number => {
      const pos = findBiggestMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getZ(i));
      return sum;
    };
    expect(sumXZ(gA)).toBe(sumXZ(gA2));
    expect(sumXZ(gA)).not.toBe(sumXZ(gB));
  });
});

// ── Undead deep-quality pass (settlement visual fidelity follow-up) ────────
// Regression guards for the tiered weathered-stone spire + carved
// gothic-arch doorway rework that replaced the original single
// tapered-cylinder "spire" standing in for a whole crypt tower.
describe('Undead — tiered weathered spire + stone arch doorway (not one tapered cylinder)', () => {
  it('produces only finite vertices for the noise-perturbed tiers after displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.undead_common![kind]!(makeDna(kind, 'undead_common', 42)));
    }
  });

  it('builds the villa (Lich Tower) from three distinct stone tiers plus arch/crown/orb/rubble, not one primitive', () => {
    const g = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 3));
    // 3 tiers + 6 crenellations + 1 orb + 3 arrow slits + (7 voussoirs + 2
    // jambs + 1 void panel for the arch) + 2 ribs + 3 rubble chunks.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(3 + 6 + 1 + 3 + 10 + 2 + 3);
  });

  it('perturbs a tower tier off a perfect cylinder radius (crumbling ancient stone, not smooth taper)', () => {
    const g = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 3));
    const tier = findBiggestCylinderMesh(g);
    const pos = tier.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    // A perfect cylinder/cone tier has a small, fixed set of ring radii;
    // noise perturbation should spread this out into many distinct values.
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('produces a different tower silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    const gB = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.undead_common!.villa!(makeDna('villa', 'undead_common', 1));
    const sumXZ = (g: THREE.Group): number => {
      const pos = findBiggestCylinderMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getZ(i));
      return sum;
    };
    expect(sumXZ(gA)).toBe(sumXZ(gA2));
    expect(sumXZ(gA)).not.toBe(sumXZ(gB));
  });
});

// ── Dwarven deep-quality pass (settlement visual fidelity follow-up) ───────
// Phase 2e §2e.4: regression guards for the stepped-tier BlockKit hall
// (`buildDwarvenHallGrid()`) that replaced the earlier smooth-coursed-box
// stacking — the deliberate *contrast case* proving the block-kit engine
// generalises to crisp, monumental masonry with intentionally
// un-chamfered "buttress" corners, not just vulperia's organic mound.
describe('Dwarven — stepped-tier BlockKit hall with hard-edged buttress corners (not smooth coursed boxes)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.dwarven![kind]!(makeDna(kind, 'dwarven', 8)));
    }
  });

  it('builds the tower from many discrete block meshes (a Lego-style assembly, not one smooth box)', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const totalBox = new THREE.Box3().setFromObject(g);
    const totalHeight = totalBox.max.y - totalBox.min.y;
    let anyBoxSpansMostOfHeight = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        const meshHeight = (bb.max.y - bb.min.y) * o.scale.y;
        if (meshHeight > totalHeight * 0.6) anyBoxSpansMostOfHeight = true;
      }
    });
    // The old version had a full-height coursed-box stack; the block hall's
    // merged mesh is many small unit blocks, so no single box primitive
    // should span most of the building's height.
    expect(anyBoxSpansMostOfHeight).toBe(false);
    const mound = findBiggestMesh(g);
    const pos = mound.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('produces a different tower silhouette per seed (deterministic but seed-varied, via weathering chips)', () => {
    const countBlockVerts = (g: THREE.Group): number => {
      let total = 0;
      g.traverse(o => {
        if (o instanceof THREE.Mesh) total += (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      });
      return total;
    };
    const gA = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 1));
    const gB = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 1));
    expect(countBlockVerts(gA)).toBe(countBlockVerts(gA2)); // deterministic for the same seed
    expect(countBlockVerts(gA)).not.toBe(countBlockVerts(gB)); // varies across seeds
  });

  it('gives the tower a genuine stepped-tier profile: a real inset step from the base grid', () => {
    const grid = buildDwarvenHallGrid(3, 8, 6, 4.5, { tiers: 3 });
    const bh = Math.round(4.5 / BLOCK_UNIT);
    // Base-tier corner is occupied near the ground...
    expect(hasBlock(grid, 0, 0, 0)).toBe(true);
    // ...but the same column has stepped inward by the top tier.
    expect(hasBlock(grid, 0, bh - 1, 0)).toBe(false);
  });

  it('marks corner columns with a distinct un-chamfered "buttress" material, not plain stone', () => {
    const grid = buildDwarvenHallGrid(3, 8, 6, 4.5, { tiers: 3 });
    expect(getMaterialKey(grid, 0, 0, 0)).toBe('buttress');
  });

  it('gives the tower a genuinely distinct buttress material colour, not the same stone hue with sharp edges', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    // The iron-grey buttress colour (#4a4a48) must appear as its own
    // merged material group, distinct from the warm stone body colour.
    expect(materialColors.has(new THREE.Color('#4a4a48').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block hall at the front (a genuine hole, not just an applied surface)', () => {
    const grid = buildDwarvenHallGrid(5, 8, 6, 4.5, { tiers: 3, facade: true });
    const bw = Math.round(8 / BLOCK_UNIT);
    const bd = Math.round(6 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('retains the praised iron-banded vault door + wheel mechanism', () => {
    const g = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    let hubCount = 0;
    let spokeCount = 0;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') hubCount++;
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        const p = (o.geometry as THREE.BoxGeometry).parameters;
        // Spokes are long, thin, flat boxes distinguishable from block-kit
        // unit cubes by their aspect ratio.
        if (p.width > p.height * 3 && p.height > 0) spokeCount++;
      }
    });
    expect(hubCount).toBeGreaterThan(0);
    expect(spokeCount).toBeGreaterThanOrEqual(6);
  });

  it('is deterministic for the same seed', () => {
    const gA = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    const gB = FACTION_BUILDING_VARIANTS.dwarven!.villa!(makeDna('villa', 'dwarven', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });
});

// ── Elven deep-quality pass (settlement visual fidelity follow-up) ─────────
// Regression guards for the gnarled-bark trunk + leaf-cluster canopy
// rework that replaced a perfectly smooth tapered cylinder trunk and a
// single smooth dome standing in for an entire tree canopy.
describe('Elven — BlockKit tapering living-tree trunk + canopy (not a smooth cylinder + sphere-cluster dome)', () => {
  it('produces only finite (non-NaN/non-infinite) vertices for the trunk/canopy grid + props', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.elven![kind]!(makeDna(kind, 'elven', 21)));
    }
  });

  it('builds the trunk from many discrete block meshes (a Lego-style assembly, not one smooth cylinder + sphere-cluster canopy)', () => {
    const g = FACTION_BUILDING_VARIANTS.elven!.villa!(makeDna('villa', 'elven', 7));
    // No CylinderGeometry standing in for the whole trunk, and no large
    // SphereGeometry standing in for the whole canopy (the old
    // noise-crumbled-cylinder-plus-foliage-blob body is gone) — small
    // decorative spheres (glow motes) are fine and expected.
    let hasCylinderTrunk = false;
    let hasLargeSphere = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CylinderGeometry') {
        const p = (o.geometry as THREE.CylinderGeometry).parameters;
        if (p.height > 0.8) hasCylinderTrunk = true; // a real trunk body, not a small platform post
      }
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') {
        const p = (o.geometry as THREE.SphereGeometry).parameters;
        if (p.radius > 0.15) hasLargeSphere = true;
      }
    });
    expect(hasCylinderTrunk).toBe(false);
    expect(hasLargeSphere).toBe(false);
    // A block trunk's merged geometry has far more vertices than a single
    // low-poly primitive would, reflecting many individually-culled block
    // faces assembled together.
    const trunk = findBiggestMesh(g);
    const pos = trunk.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('produces a different trunk/canopy silhouette per seed (deterministic but seed-varied)', () => {
    const countBlockVerts = (g: THREE.Group): number => {
      let total = 0;
      g.traverse(o => {
        if (o instanceof THREE.Mesh) total += (o.geometry.getAttribute('position') as THREE.BufferAttribute).count;
      });
      return total;
    };
    const gA = FACTION_BUILDING_VARIANTS.elven!.villa!(makeDna('villa', 'elven', 1));
    const gB = FACTION_BUILDING_VARIANTS.elven!.villa!(makeDna('villa', 'elven', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.elven!.villa!(makeDna('villa', 'elven', 1));
    expect(countBlockVerts(gA)).toBe(countBlockVerts(gA2)); // deterministic for the same seed
    expect(countBlockVerts(gA)).not.toBe(countBlockVerts(gB)); // varies across seeds
  });

  it('carves a real arched doorway gap in the trunk grid at the front (a genuine hole, not just an applied surface)', () => {
    const grid = buildElvenTrunkGrid(5, 6, 5, 5, { facade: true });
    const bw = Math.round(6 / BLOCK_UNIT);
    const bd = Math.round(5 / BLOCK_UNIT);
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('gives the trunk a dedicated facade-material block group around the door, distinct from the bark body', () => {
    const dna = makeDna('villa', 'elven', 5);
    const g = FACTION_BUILDING_VARIANTS.elven!.villa!(dna);
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    // Bark (dna.colors.walls), leaf-canopy (dna.colors.roof) and facade
    // (dna.colors.trim) block materials should all be present as distinct
    // merged meshes.
    expect(materialColors.has(new THREE.Color(dna.colors.walls).getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color(dna.colors.roof).getHexString())).toBe(true);
    expect(materialColors.has(new THREE.Color(dna.colors.trim).getHexString())).toBe(true);
  });

  it('builds the balcony from a ring of small plank blocks, not one smooth torus', () => {
    const g = FACTION_BUILDING_VARIANTS.elven!.villa!(makeDna('villa', 'elven', 9));
    let hasTorus = false;
    let boxCount = 0;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'TorusGeometry') hasTorus = true;
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') boxCount++;
    });
    expect(hasTorus).toBe(false);
    expect(boxCount).toBeGreaterThanOrEqual(14); // the plank ring alone is 14 planks
  });
});

// ── Vampire deep-quality pass (settlement visual fidelity follow-up) ───────
// Regression guards for the stepped gothic buttress + rose-window tracery
// rework that replaced flat slab buttresses and a flat-disc "rose window".
describe('Vampire — BlockKit tapering gothic spire with crenellated iron parapet (not flat slabs/cones)', () => {
  it('produces only finite vertices across villa/chapel/shop', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.vampire![kind]!(makeDna(kind, 'vampire', 12)));
    }
  });

  it("builds the villa (Count's Tower) from many discrete block meshes (a Lego-style assembly, not one flat slab + cone roof), plus companion turret and gargoyle/balcony accents", () => {
    const g = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const totalBox = new THREE.Box3().setFromObject(g);
    const totalHeight = totalBox.max.y - totalBox.min.y;
    let anyBoxSpansMostOfHeight = false;
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'BoxGeometry') {
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        const meshHeight = (bb.max.y - bb.min.y) * o.scale.y;
        if (meshHeight > totalHeight * 0.6) anyBoxSpansMostOfHeight = true;
      }
    });
    // The old version had a full-height flat wall slab; the block spire's
    // merged mesh is many small unit blocks, so no single box primitive
    // should span most of the building's height.
    expect(anyBoxSpansMostOfHeight).toBe(false);
    const spire = findBiggestMesh(g);
    const pos = spire.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(60);
  });

  it('does not flare back out into a canopy: unlike elven, the spire narrows monotonically up to the flat parapet deck', () => {
    const grid = buildVampireSpireGrid(3, 6, 6, 10, {});
    const bh = Math.max(8, Math.round(10 / BLOCK_UNIT));
    function rowSpan(by: number): number {
      const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
      const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
      const cz = Math.round((bd - 1) / 2);
      let min = Infinity, max = -Infinity;
      for (let bx = 0; bx < bw; bx++) {
        if (hasBlock(grid, bx, by, cz)) { min = Math.min(min, bx); max = Math.max(max, bx); }
      }
      return max >= min ? max - min : 0;
    }
    expect(rowSpan(bh - 2)).toBeLessThanOrEqual(rowSpan(Math.round(bh * 0.4)));
  });

  it('marks the crenellations with a distinct un-chamfered "iron" material, not plain obsidian', () => {
    const grid = buildVampireSpireGrid(3, 6, 6, 10, {});
    let sawIron = false;
    for (const matKey of grid.cells.values()) {
      if (matKey === 'iron') { sawIron = true; break; }
    }
    expect(sawIron).toBe(true);
  });

  it('gives the tower a genuinely distinct iron material colour, not the same obsidian hue with sharp edges', () => {
    const g = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const materialColors = new Set<string>();
    g.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        materialColors.add(o.material.color.getHexString());
      }
    });
    expect(materialColors.has(new THREE.Color('#3a3a42').getHexString())).toBe(true);
  });

  it('carves a real doorway-sized gap in the block spire at the front (a genuine hole, not just an applied surface)', () => {
    const grid = buildVampireSpireGrid(5, 6, 6, 10, { facade: true });
    const bw = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const bd = Math.max(3, Math.round(6 / BLOCK_UNIT));
    const cx = Math.round(bw / 2);
    expect(hasBlock(grid, cx, 0, bd - 1)).toBe(false);
  });

  it('retains the praised rose window + blood-orb + candelabra small accent props', () => {
    const chapel = FACTION_BUILDING_VARIANTS.vampire!.chapel!(makeDna('chapel', 'vampire', 5));
    let sawCircle = false, sawSphere = false;
    chapel.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry.type === 'CircleGeometry') sawCircle = true;
      if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sawSphere = true;
    });
    expect(sawCircle).toBe(true); // rose window glass disc
    expect(sawSphere).toBe(true); // blood orb
  });

  it('is deterministic for the same seed', () => {
    const gA = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    const gB = FACTION_BUILDING_VARIANTS.vampire!.villa!(makeDna('villa', 'vampire', 5));
    expect(countMeshes(gA)).toBe(countMeshes(gB));
  });
});

// ── Fae deep-quality pass (settlement visual fidelity follow-up) ───────────
// Regression guards for the twisted-stalk + scalloped-cap + gill/wart
// rework that replaced a smooth cylinder stem and a perfectly circular
// dome cap standing in for an entire mushroom.
describe('Fae — twisted stalk + scalloped cap + gills/warts (not a smooth cylinder + dome)', () => {
  it('produces only finite vertices for the noise-perturbed stalk and cap after displacement', () => {
    for (const kind of ['villa', 'chapel', 'shop'] as BuildingKind[]) {
      expectAllVerticesFinite(FACTION_BUILDING_VARIANTS.fae![kind]!(makeDna(kind, 'fae', 33)));
    }
  });

  it('perturbs the stalk off a perfect cylinder radius (twisted, not smooth taper)', () => {
    const g = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 5));
    const stalk = findBiggestCylinderMesh(g);
    const pos = stalk.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('scallops the cap rim off a perfect circle (wavy toadstool edge, not a smooth dome)', () => {
    const g = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 5));
    // The cap is the biggest SphereGeometry mesh (bigger than the small
    // wart bumps, which use the same geometry type at a much smaller scale).
    const sphereMeshes: THREE.Mesh[] = [];
    g.traverse(o => { if (o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') sphereMeshes.push(o); });
    expect(sphereMeshes.length).toBeGreaterThan(0);
    let cap = sphereMeshes[0];
    let biggestRadius = 0;
    for (const m of sphereMeshes) {
      m.geometry.computeBoundingSphere();
      const radius = m.geometry.boundingSphere!.radius;
      if (radius > biggestRadius) { biggestRadius = radius; cap = m; }
    }
    const pos = cap.geometry.getAttribute('position') as THREE.BufferAttribute;
    const xzRadii = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xzRadii.add(+Math.hypot(pos.getX(i), pos.getZ(i)).toFixed(4));
    }
    expect(xzRadii.size).toBeGreaterThan(6);
  });

  it('builds the villa (Fae Court) from many parts (stalk, scalloped cap, gills, warts, doorway, fireflies), not a handful of primitives', () => {
    const g = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 5));
    // Stalk tier + cap + 14 gill fins + 5 wart bumps + doorway + 3
    // fireflies + 3 small toadstools (stem+cap each) = well over 25.
    expect(countMeshes(g)).toBeGreaterThanOrEqual(25);
  });

  it('produces a different stalk/cap silhouette per seed (deterministic but seed-varied)', () => {
    const gA = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 1));
    const gB = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 2));
    const gA2 = FACTION_BUILDING_VARIANTS.fae!.villa!(makeDna('villa', 'fae', 1));
    const sumXZ = (g: THREE.Group): number => {
      const pos = findBiggestCylinderMesh(g).geometry.getAttribute('position') as THREE.BufferAttribute;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) sum += Math.hypot(pos.getX(i), pos.getZ(i));
      return sum;
    };
    expect(sumXZ(gA)).toBe(sumXZ(gA2));
    expect(sumXZ(gA)).not.toBe(sumXZ(gB));
  });
});
