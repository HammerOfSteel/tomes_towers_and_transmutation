/**
 * Regression test for a severe, pervasive placement bug found in a
 * post-merge geometry audit of the human building kit: `placeOnFace(obj,
 * face, t)` alone only sets rotation plus an along-face offset computed
 * relative to the face's own midpoint — it never adds the face's own
 * absolute midpoint back in. For any depth-agnostic prop (one whose own
 * local geometry does NOT bake in a `wallZ` construction offset, unlike
 * `buildHumanWindow`/`Door`/`Oculus`/`buildShutterPair`/`buildArrowLoop`),
 * this left the prop sitting at the building's own centre axis (or, for
 * an off-centre/composed face such as a villa wing, at the world origin)
 * instead of flush against the wall it was meant to decorate.
 *
 * This affected ~30 call sites across every one of the 8 human building
 * kinds, including already-shipped/merged geometry (villa cornice/
 * lantern, chapel buttresses) — not just newly authored watchtower code.
 * The fix (`placeOnFaceAtDepth()` in HumanBuildingsKit.ts) re-adds the
 * face's own absolute midpoint plus a small proud/recessed `depth` delta.
 *
 * This test asserts, for a representative sample of the fixed props
 * across every human building kind, that the WORLD-SPACE distance from
 * the building's own vertical (Y) axis is large enough to be flush
 * against a wall (not buried near the centreline, which is what the bug
 * produced). It intentionally uses a generous lower bound rather than
 * exact expected coordinates, so it stays robust to future tuning of
 * exact proportions/tiers while still catching a reintroduction of the
 * "prop lands at world X=0/Z=0" bug class.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { factionBuildingDna } from '@/world/buildings/BuildingDNA';
import {
  buildHumanHouse,
  buildHumanTerraced,
  buildHumanVilla,
  buildHumanInn,
  buildHumanShop,
  buildHumanBlacksmith,
  buildHumanChapel,
  buildHumanWatchtower,
} from '@/world/buildings/human/HumanBuildingsKit';

/** Collects the world-space horizontal (XZ-plane) distance from the
 * vertical axis for every descendant whose `name` matches (exactly or as
 * a prefix) any of the given names. */
function radialDistancesByName(group: THREE.Object3D, names: string[]): Map<string, number[]> {
  group.updateMatrixWorld(true);
  const found = new Map<string, number[]>();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  group.traverse((obj) => {
    const match = names.find((n) => obj.name === n || obj.name.startsWith(n));
    if (!match) return;
    box.setFromObject(obj);
    box.getCenter(center);
    const radial = Math.hypot(center.x, center.z);
    const list = found.get(match) ?? [];
    list.push(radial);
    found.set(match, list);
  });
  return found;
}

/** Fails with a clear message if any named prop was not found, or if any
 * instance sits closer to the vertical axis than `minRadial` (which
 * would indicate it's stuck near the building's own centreline instead
 * of flush against a wall). */
function expectAllFlush(group: THREE.Object3D, names: string[], minRadial: number) {
  const byName = radialDistancesByName(group, names);
  for (const name of names) {
    const radii = byName.get(name);
    expect(radii, `expected to find at least one "${name}" prop`).toBeDefined();
    expect(radii!.length).toBeGreaterThan(0);
    for (const r of radii!) {
      expect(r, `"${name}" prop landed too close to the building's centre axis (radial=${r.toFixed(3)}), expected >= ${minRadial}`).toBeGreaterThanOrEqual(minRadial);
    }
  }
}

describe('human building kit — wall-flush placement regression', () => {
  it('house lantern sits flush against the front wall', () => {
    const house = buildHumanHouse(factionBuildingDna('house', 'human_town', 7));
    expectAllFlush(house, ['human-lantern'], 1.0);
  });

  it('terraced jetty/oriel/window sit flush against their walls', () => {
    // Jetty is probabilistic (~70% chance); seed 0 is confirmed to roll a jetty.
    const terraced = buildHumanTerraced(factionBuildingDna('terraced', 'human_town', 0));
    expectAllFlush(terraced, ['human-jetty', 'human-door'], 1.0);
  });

  it('villa cornice/lantern sit flush against the front wall (not the centreline)', () => {
    const villa = buildHumanVilla(factionBuildingDna('villa', 'human_noble', 42));
    expectAllFlush(villa, ['human-villa-cornice', 'human-lantern', 'human-door'], 1.5);
  });

  it('inn jetty/lantern/door sit flush against their walls', () => {
    const inn = buildHumanInn(factionBuildingDna('inn', 'human_town', 3));
    expectAllFlush(inn, ['human-jetty', 'human-lantern', 'human-door'], 1.0);
  });

  it('shop awning/jetty/lantern sit flush against the front wall', () => {
    // Jetty is probabilistic (~35% chance); seed 6 is confirmed to roll a jetty.
    const shop = buildHumanShop(factionBuildingDna('shop', 'human_town', 6));
    expectAllFlush(shop, ['human-awning', 'human-jetty', 'human-lantern'], 1.0);
  });

  it('blacksmith tool rack sits flush against its wall', () => {
    const smith = buildHumanBlacksmith(factionBuildingDna('blacksmith', 'human_town', 9));
    expectAllFlush(smith, ['human-tool-rack'], 1.0);
  });

  it('chapel buttresses sit flush against the long nave walls (not buried near centre)', () => {
    const chapel = buildHumanChapel(factionBuildingDna('chapel', 'human_town', 42));
    expectAllFlush(chapel, ['human-buttress', 'human-door'], 1.5);
  });

  it('watchtower buttresses/corbels sit flush against the tower walls', () => {
    // Corbel rows only appear at tier transitions (i > 0); seed 13 gives
    // multiple tiers so 'human-watchtower-corbel-row-1-*' is present.
    const tower = buildHumanWatchtower(factionBuildingDna('watchtower', 'human_town', 13));
    expectAllFlush(tower, ['human-watchtower-buttress-0', 'human-watchtower-corbel-row-1', 'human-door'], 0.7);
  });
});
