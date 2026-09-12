/**
 * SalvageSpoils.test.ts — socketed salvage/spoils prop modules
 * (docs/superpowers/specs/2026-09-04-orcish-buildings-design.md section 5:
 * `[SHARED KIT] SalvageSpoils.ts`: "captured shields, tusk/bone finials,
 * banner strips, plank crates, weapon racks, and stave-built kegs as
 * socketable prop modules"). Doctrine Rule 3 explicitly bans "crate/
 * barrel/sign as one primitive" -- every prop here must assemble from
 * multiple named, distinctly-shaped parts, never a single bare box/
 * cylinder/sphere standing in for the whole object.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildTuskFinial,
  buildSkullTrophy,
  buildCapturedShield,
  buildBannerStrip,
  buildWeaponRack,
  buildCrossedBlades,
  buildPlankCrate,
  buildStaveKeg,
  buildFirewoodBundle,
  buildHideBundle,
  buildAnvil,
  buildCoalBin,
  buildSlagTrough,
  buildTotemPole,
} from '@/world/buildings/kit/SalvageSpoils';

function hasNaN(root: THREE.Object3D): boolean {
  let bad = false;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const pos = (o as THREE.Mesh).geometry.attributes.position;
      for (let i = 0; i < pos.count * 3; i++) if (!Number.isFinite(pos.array[i])) bad = true;
    }
  });
  return bad;
}

function meshCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
}

const bone = new THREE.MeshStandardMaterial({ color: '#d8c9a0' });
const wood = new THREE.MeshStandardMaterial({ color: '#4a3826' });
const iron = new THREE.MeshStandardMaterial({ color: '#5a5650' });
const cloth = new THREE.MeshStandardMaterial({ color: '#9b1515' });
const dark = new THREE.MeshStandardMaterial({ color: '#2a1810' });

type Builder = () => THREE.Group;

const builders: Array<[string, Builder, number]> = [
  ['buildTuskFinial', () => buildTuskFinial({ material: bone }), 2],
  ['buildSkullTrophy', () => buildSkullTrophy({ boneMaterial: bone, tuskMaterial: bone, darkMaterial: dark }), 3],
  ['buildCapturedShield (round)', () => buildCapturedShield({ kind: 'round', faceMaterial: iron, rimMaterial: wood, bossMaterial: iron }), 3],
  ['buildCapturedShield (kite)', () => buildCapturedShield({ kind: 'kite', faceMaterial: iron, rimMaterial: wood, bossMaterial: iron }), 3],
  ['buildBannerStrip', () => buildBannerStrip({ clothMaterial: cloth, poleMaterial: wood }), 3],
  ['buildWeaponRack', () => buildWeaponRack({ frameMaterial: wood, bladeMaterial: iron }), 4],
  ['buildCrossedBlades', () => buildCrossedBlades({ bladeMaterial: iron, bindingMaterial: wood }), 3],
  ['buildPlankCrate', () => buildPlankCrate({ material: wood, strapMaterial: iron }), 4],
  ['buildStaveKeg', () => buildStaveKeg({ material: wood, hoopMaterial: iron }), 5],
  ['buildFirewoodBundle', () => buildFirewoodBundle({ material: wood }), 3],
  ['buildHideBundle', () => buildHideBundle({ material: dark, tieMaterial: wood }), 2],
  ['buildAnvil', () => buildAnvil({ material: iron }), 3],
  ['buildCoalBin', () => buildCoalBin({ material: wood, chunkMaterial: dark }), 4],
  ['buildSlagTrough', () => buildSlagTrough({ material: dark }), 3],
  ['buildTotemPole', () => buildTotemPole({ material: wood, boneMaterial: bone }), 4],
];

describe('SalvageSpoils prop modules', () => {
  for (const [name, build, minParts] of builders) {
    describe(name, () => {
      it(`assembles from at least ${minParts} distinct mesh parts (never a bare single primitive)`, () => {
        expect(meshCount(build())).toBeGreaterThanOrEqual(minParts);
      });

      it('produces finite geometry', () => {
        expect(hasNaN(build())).toBe(false);
      });

      it('is deterministic across repeated builds with the same options', () => {
        const a = build();
        const b = build();
        expect(meshCount(a)).toBe(meshCount(b));
        const boxA = new THREE.Box3().setFromObject(a);
        const boxB = new THREE.Box3().setFromObject(b);
        expect(boxA.max.x).toBeCloseTo(boxB.max.x, 5);
        expect(boxA.max.y).toBeCloseTo(boxB.max.y, 5);
      });
    });
  }
});

describe('buildWeaponRack racked blade count', () => {
  it('honours a count option (more blades hanging)', () => {
    const few = buildWeaponRack({ frameMaterial: wood, bladeMaterial: iron, count: 2 });
    const many = buildWeaponRack({ frameMaterial: wood, bladeMaterial: iron, count: 5 });
    expect(meshCount(many)).toBeGreaterThan(meshCount(few));
  });
});

describe('buildStaveKeg stave construction (no bare cylinder primitive)', () => {
  it('is built from individual staves + hoop bands, not one cylinder mesh', () => {
    const keg = buildStaveKeg({ material: wood, hoopMaterial: iron, staveCount: 10 });
    let hasCylinder = false;
    keg.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'CylinderGeometry') hasCylinder = true;
    });
    expect(hasCylinder).toBe(false);
    expect(meshCount(keg)).toBeGreaterThanOrEqual(10 + 2); // staves + at least 2 hoops
  });
});
