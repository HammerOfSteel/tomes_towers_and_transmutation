// ── Parts ("rigblocks"): socketed cosmetics with per-archetype adaptation ────
//
//  Parts only use MaterialKit slots → palette swaps restyle them for free.
//  Paired sockets mirror automatically (author LEFT, right gets scale.x = -1).
//  Secondary motion (tail swish, cape ripple, pigtail bounce, ear flicks,
//  halo bob) is registered as tick hooks on the BuildResult.

import * as THREE from 'three';
import type { PrincessDNA } from './types';
import type { MaterialKit } from './materials';
import type { BuildResult, Proportions } from './synth/contracts';
import { shadowed } from './synth/shared';

// ── Crowns ───────────────────────────────────────────────────────────────────

function buildCrown(
  dna: PrincessDNA, kit: MaterialKit, headR: number, totalLift: number,
): THREE.Group | null {
  const id = dna.parts.crown;
  if (id === 'none') return null;
  const g = new THREE.Group();
  g.name = `part:crown.${id}`;
  const flatSeg = kit.flat ? 4 : 12;

  if (id === 'halo') {
    const geo = new THREE.TorusGeometry(headR * 0.5, headR * 0.055, flatSeg, 24);
    geo.rotateX(Math.PI / 2);
    const halo = new THREE.Mesh(geo, kit.glow);
    halo.position.y = headR * 0.35;
    g.add(halo);
    g.userData.halo = halo;
  } else if (id === 'tiara') {
    // Headband arch hugging the scalp ear-to-ear (reference art: studded tiara).
    // The crown group sits `totalLift` above the scalp point (0.92·R above the
    // head center) — put the arc's center back at the head center so its
    // radius can follow the head/hair curvature.
    const centerY = -(headR * 0.92 + totalLift);
    const bandR = headR * 1.08;
    const arc = new THREE.TorusGeometry(bandR, headR * 0.055, flatSeg, 18, Math.PI);
    const band = shadowed(new THREE.Mesh(arc, kit.metal));
    band.position.y = centerY;
    g.add(band);
    for (let i = -1; i <= 1; i++) {
      const a = Math.PI / 2 + i * 0.42; // stud positions along the top of the arch
      const peak = shadowed(new THREE.Mesh(
        new THREE.ConeGeometry(headR * 0.055, headR * (i === 0 ? 0.22 : 0.14), 4), kit.metal,
      ));
      peak.position.set(Math.cos(a) * bandR, centerY + Math.sin(a) * bandR, 0);
      peak.rotation.z = -i * 0.42;
      g.add(peak);
    }
    const gem = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(headR * 0.07), kit.accent));
    gem.position.set(0, centerY + bandR + headR * 0.02, 0);
    g.add(gem);
  } else if (id === 'crescent') {
    // Moonborn: natural growth, not jewellery. Shape follows the lunar phase.
    const phase = dna.species === 'moonborn' && dna.subtype ? dna.subtype : 'crescent';
    const moon = new THREE.Group();
    if (phase === 'full') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(headR * 0.34, headR * 0.05, 8, 24), kit.glow,
      );
      const discGeo = new THREE.CylinderGeometry(headR * 0.3, headR * 0.3, headR * 0.03, 24);
      discGeo.rotateX(Math.PI / 2);
      moon.add(ring, new THREE.Mesh(discGeo, kit.glow));
    } else if (phase === 'eclipse') {
      // Something else entirely: a dark disc with a burning rim.
      const discGeo = new THREE.CylinderGeometry(headR * 0.3, headR * 0.3, headR * 0.04, 24);
      discGeo.rotateX(Math.PI / 2);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(headR * 0.31, headR * 0.035, 8, 20), kit.glow,
      );
      moon.add(new THREE.Mesh(discGeo, kit.dark), rim);
    } else {
      // A clear waxing "C": half-ring, horns tipped up-right, slightly tapered
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(headR * 0.3, headR * 0.05, 8, 24, Math.PI), kit.glow,
      );
      arc.rotation.z = Math.PI * 0.62;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.05, 8, 6), kit.glow);
      tip.position.set(Math.cos(Math.PI * 0.62) * headR * 0.3, Math.sin(Math.PI * 0.62) * headR * 0.3, 0);
      moon.add(arc, tip);
    }
    moon.position.y = headR * 0.42;
    g.add(moon);
    g.userData.halo = moon; // reuse the halo float/bob hook
  } else if (id === 'wreath') {
    // Verdant: a LIVING wreath — vine ring, leaves, small blooms.
    const vineGeo = new THREE.TorusGeometry(headR * 0.44, headR * 0.045, 6, 20);
    vineGeo.rotateX(Math.PI / 2);
    g.add(shadowed(new THREE.Mesh(vineGeo, kit.hair)));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i % 2 === 0) {
        const leafGeo = new THREE.ConeGeometry(headR * 0.09, headR * 0.3, 5);
        leafGeo.translate(0, headR * 0.15, 0);
        leafGeo.scale(1, 1, 0.35);
        const leaf = shadowed(new THREE.Mesh(leafGeo, kit.primary));
        leaf.position.set(Math.cos(a) * headR * 0.44, 0.02, Math.sin(a) * headR * 0.44);
        leaf.rotation.y = -a;
        leaf.rotation.z = 0.5;
        g.add(leaf);
      } else {
        const bloom = shadowed(new THREE.Mesh(new THREE.SphereGeometry(headR * 0.08, 8, 6), kit.accent));
        bloom.position.set(Math.cos(a) * headR * 0.44, headR * 0.05, Math.sin(a) * headR * 0.44);
        g.add(bloom);
      }
    }
  } else if (id === 'flower') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = shadowed(new THREE.Mesh(new THREE.SphereGeometry(headR * 0.11, 10, 8), kit.accent));
      petal.scale.set(1.3, 0.6, 1);
      petal.position.set(Math.cos(a) * headR * 0.38, 0, Math.sin(a) * headR * 0.38);
      petal.rotation.y = -a;
      g.add(petal);
    }
    const center = shadowed(new THREE.Mesh(new THREE.SphereGeometry(headR * 0.1, 10, 8), kit.metal));
    center.position.y = headR * 0.04;
    g.add(center);
  } else {
    // classic & crooked: band + spikes
    const spikes = id === 'crooked' ? 5 : 4;
    const bandGeo = new THREE.TorusGeometry(headR * 0.42, headR * 0.07, flatSeg, kit.flat ? 8 : 20);
    bandGeo.rotateX(Math.PI / 2);
    g.add(shadowed(new THREE.Mesh(bandGeo, kit.metal)));
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + Math.PI / spikes;
      const spike = shadowed(new THREE.Mesh(
        new THREE.ConeGeometry(headR * 0.1, headR * 0.3, 4), kit.metal,
      ));
      spike.position.set(Math.cos(a) * headR * 0.42, headR * 0.16, Math.sin(a) * headR * 0.42);
      spike.rotation.order = 'YXZ';
      spike.rotation.y = -a + Math.PI / 2;
      spike.rotation.x = 0.18;
      if (id === 'crooked' && i === 1) spike.rotation.z = 0.7; // the bent one
      g.add(spike);
    }
    if (id === 'classic') {
      const gem = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(headR * 0.07), kit.accent));
      gem.position.set(0, headR * 0.1, headR * 0.44);
      g.add(gem);
    }
  }

  g.rotation.z = dna.parts.crownTilt + (id === 'crooked' ? -0.12 : 0);
  g.rotation.x = id === 'tiara' ? 0 : -0.1;
  return g;
}

// ── Ears (left variant; right is auto-mirrored) ─────────────────────────────

function buildEarL(dna: PrincessDNA, kit: MaterialKit, headR: number): THREE.Group | null {
  const id = dna.parts.ears;
  if (id === 'none') return null;
  const g = new THREE.Group();
  g.name = `part:ears.${id}`;
  const s = dna.parts.earSize;

  if (id === 'fox' || id === 'cat' || id === 'long') {
    const dims = {
      fox: { r: 0.42, h: 1.3, tilt: -Math.PI / 6 },
      cat: { r: 0.46, h: 0.8, tilt: -Math.PI / 7 },
      long: { r: 0.2, h: 1.15, tilt: -Math.PI / 3.2 }, // elfin: splayed sideways
    }[id];
    const outerGeo = new THREE.ConeGeometry(dims.r * headR * s, dims.h * headR * s, 4);
    outerGeo.translate(0, dims.h * headR * s * 0.5, 0);
    const outer = shadowed(new THREE.Mesh(outerGeo, kit.skin));
    const innerGeo = new THREE.ConeGeometry(dims.r * 0.55 * headR * s, dims.h * 0.72 * headR * s, 3);
    innerGeo.translate(0, dims.h * 0.36 * headR * s, dims.r * 0.28 * headR * s);
    const inner = new THREE.Mesh(innerGeo, kit.secondary);
    g.add(outer, inner);
    g.rotation.z = dims.tilt;
    g.rotation.x = -Math.PI / 14;
  } else if (id === 'fin') {
    // Naiad: webbed temple fin — a translucent-reading fan swept back.
    const finGeo = new THREE.ConeGeometry(0.55 * headR * s, 0.9 * headR * s, 5, 1, false, -Math.PI / 2, Math.PI);
    finGeo.translate(0, 0.45 * headR * s, 0);
    finGeo.scale(1, 1, 0.12);
    const fin = shadowed(new THREE.Mesh(finGeo, kit.secondary));
    fin.rotation.z = -Math.PI / 3.2; // swept back-out from the temple
    fin.rotation.y = Math.PI / 7;
    g.add(fin);
    for (let i = 0; i < 3; i++) {
      const spineGeo = new THREE.ConeGeometry(0.035 * headR * s, (0.85 - i * 0.18) * headR * s, 4);
      spineGeo.translate(0, (0.42 - i * 0.09) * headR * s, 0);
      const spine = new THREE.Mesh(spineGeo, kit.skin);
      spine.rotation.z = -Math.PI / 3.2 + i * 0.28;
      spine.rotation.y = Math.PI / 7;
      g.add(spine);
    }
  } else if (id === 'horn_small' || id === 'horn_curved') {
    // Draconic horns (she doesn't hide them). kit.hair = dark tones in
    // draconic palettes, so horns read as keratin.
    if (id === 'horn_small') {
      const geo = new THREE.ConeGeometry(0.15 * headR * s, 0.6 * headR * s, 5);
      geo.translate(0, 0.3 * headR * s, 0);
      const horn = shadowed(new THREE.Mesh(geo, kit.hair));
      horn.rotation.x = -0.5;
      horn.rotation.z = -0.12;
      g.add(horn);
    } else {
      // three chained segments sweeping back
      let parent: THREE.Object3D = g;
      for (let i = 0; i < 3; i++) {
        const len = (0.34 - i * 0.06) * headR * s;
        const geo = new THREE.ConeGeometry((0.15 - i * 0.035) * headR * s, len, 5);
        geo.translate(0, len / 2, 0);
        const seg = shadowed(new THREE.Mesh(geo, kit.hair));
        seg.rotation.x = -0.45;
        const next = new THREE.Group();
        next.position.y = len * 0.85;
        seg.add(next);
        parent.add(seg);
        parent = next;
      }
    }
  } else {
    // round
    const outer = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42 * headR * s, 12, 10), kit.skin));
    outer.scale.set(1, 1, 0.45);
    outer.position.y = 0.25 * headR * s;
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.26 * headR * s, 10, 8), kit.secondary);
    inner.scale.set(1, 1, 0.3);
    inner.position.set(0, 0.25 * headR * s, 0.12 * headR * s);
    g.add(outer, inner);
  }
  return g;
}

// ── Tails ────────────────────────────────────────────────────────────────────

interface TailBuild { group: THREE.Group; chains: THREE.Group[][] }

/** Kitsune subtype → fluffy tail count (power level; she won't discuss it). */
function tailCountFor(dna: PrincessDNA): number {
  if (dna.species !== 'foxling' || dna.parts.tail !== 'fluffy') return 1;
  return { '1': 1, '3': 3, '9': 9 }[dna.subtype] ?? 1;
}

function buildFluffyChain(
  dna: PrincessDNA, kit: MaterialKit, size: number,
): { chain: THREE.Group; segments: THREE.Group[] } {
  const chain = new THREE.Group();
  const segments: THREE.Group[] = [];
  let parent: THREE.Object3D = chain;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const seg = new THREE.Group();
    const scale = (Math.sin((i / (n - 1)) * Math.PI) * 1.22 * dna.traits.fluff + 0.42) * size;
    const mesh = shadowed(new THREE.Mesh(
      new THREE.IcosahedronGeometry(scale, 1),
      i === n - 1 ? kit.hair : kit.skin,
    ));
    mesh.position.z = -scale;
    seg.add(mesh);
    const next = new THREE.Group();
    next.position.z = -scale * 1.5;
    seg.add(next);
    parent.add(seg);
    segments.push(seg);
    parent = next;
  }
  return { chain, segments };
}

function buildTail(dna: PrincessDNA, kit: MaterialKit): TailBuild | null {
  const id = dna.parts.tail;
  if (id === 'none') return null;
  const g = new THREE.Group();
  g.name = `part:tail.${id}`;
  const size = dna.parts.tailSize;
  const chains: THREE.Group[][] = [];
  const segments: THREE.Group[] = [];
  let parent: THREE.Object3D = g;

  if (id === 'fluffy') {
    const count = tailCountFor(dna);
    // More tails → each slightly slimmer so the fan stays readable.
    const per = size * (count === 1 ? 1 : count === 3 ? 0.78 : 0.55);
    for (let k = 0; k < count; k++) {
      const { chain, segments: segs } = buildFluffyChain(dna, kit, per);
      // Fan out around the vertical axis (nine tails = full peacock).
      const spreadIdx = k - (count - 1) / 2;
      const spread = count === 1 ? 0 : count === 3 ? 0.55 : 0.38;
      chain.rotation.y = spreadIdx * spread;
      chain.rotation.x = Math.abs(spreadIdx) * (count === 9 ? 0.16 : 0.08);
      g.add(chain);
      chains.push(segs);
    }
  } else if (id === 'thin' || id === 'bone') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      const len = 0.85 * size;
      const r = (0.16 - i * 0.025) * size;
      const geo = new THREE.CylinderGeometry(r * 0.75, r, len, id === 'bone' ? 5 : 8);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, -len / 2);
      const mesh = shadowed(new THREE.Mesh(geo, id === 'bone' ? kit.skin : kit.hair));
      seg.add(mesh);
      if (id === 'bone') {
        const knob = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.3, 0), kit.skin));
        seg.add(knob);
      }
      const next = new THREE.Group();
      next.position.z = -len;
      seg.add(next);
      parent.add(seg);
      segments.push(seg);
      parent = next;
    }
    const tip = id === 'bone'
      ? new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * size), kit.accent)
      : new THREE.Mesh(new THREE.SphereGeometry(0.24 * size, 10, 8), kit.hair);
    shadowed(tip as THREE.Mesh);
    parent.add(tip);
    chains.push(segments);
  } else {
    // wisp: fading emissive blobs
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      const r = (0.34 - i * 0.09) * size;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), kit.glow);
      orb.position.z = -0.2;
      seg.add(orb);
      const next = new THREE.Group();
      next.position.set(0, 0.12, -r * 2.2);
      seg.add(next);
      parent.add(seg);
      segments.push(seg);
      parent = next;
    }
    chains.push(segments);
  }
  // Lift enough that the tail crests above the hem in silhouette.
  g.rotation.x = id === 'fluffy' ? 0.3 : 0.18;
  return { group: g, chains };
}

// ── Back items ───────────────────────────────────────────────────────────────

interface BackBuild {
  group: THREE.Group;
  capeSegments?: THREE.Group[];
  wings?: THREE.Object3D[];
  grimoire?: THREE.Group;
}

function buildBack(dna: PrincessDNA, kit: MaterialKit, hemDrop: number): BackBuild | null {
  const id = dna.parts.back;
  if (id === 'none') return null;
  const g = new THREE.Group();
  g.name = `part:back.${id}`;

  if (id === 'bow') {
    const wingGeo = new THREE.SphereGeometry(0.62, kit.flat ? 8 : 16, kit.flat ? 6 : 12);
    wingGeo.scale(1.5, 0.8, 0.4);
    const l = shadowed(new THREE.Mesh(wingGeo, kit.accent));
    l.position.set(0.72, 0, -0.1);
    l.rotation.z = -0.2;
    const r = shadowed(new THREE.Mesh(wingGeo.clone(), kit.accent));
    r.position.set(-0.72, 0, -0.1);
    r.rotation.z = 0.2;
    const knot = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), kit.accent));
    g.add(l, r, knot);
  } else if (id === 'cape') {
    const segments: THREE.Group[] = [];
    let parent: THREE.Object3D = g;
    const n = 5;
    const segH = (hemDrop * 0.95) / n;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      const width = 2.1 + i * 0.45;
      const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, segH, 0.09), kit.accent));
      mesh.position.y = -segH / 2;
      seg.add(mesh);
      const next = new THREE.Group();
      next.position.y = -segH * 0.95;
      seg.add(next);
      parent.add(seg);
      segments.push(seg);
      parent = next;
    }
    return { group: g, capeSegments: segments };
  } else if (id === 'wings_butterfly') {
    // Pixie/fae: two-lobed patterned wings. They do not fold neatly.
    const wings: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      const upperGeo = new THREE.SphereGeometry(1.25, 14, 10);
      upperGeo.scale(1.5, 1.05, 0.08);
      const upper = shadowed(new THREE.Mesh(upperGeo, kit.secondary));
      upper.position.set(1.7 * side, 1.65, 0);
      upper.rotation.z = 0.5 * side;
      const lowerGeo = new THREE.SphereGeometry(0.9, 12, 9);
      lowerGeo.scale(1.25, 0.95, 0.08);
      const lower = shadowed(new THREE.Mesh(lowerGeo, kit.secondary));
      lower.position.set(1.2 * side, 0.25, 0);
      lower.rotation.z = -0.3 * side;
      wing.add(upper, lower);
      // Accent spots — the pattern
      for (const [sx, sy, r] of [[2.0, 1.85, 0.38], [1.2, 0.2, 0.25]] as const) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), kit.accent);
        spot.scale.set(1, 1, 0.3);
        spot.position.set(sx * side, sy, 0.06);
        wing.add(spot);
      }
      wing.rotation.y = -0.4 * side;
      g.add(wing);
      wings.push(wing);
    }
    return { group: g, wings };
  } else if (id === 'wings_feather') {
    // Celestial: three soft layered feathers per side.
    const wings: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const geo = new THREE.SphereGeometry(1.2, 14, 10);
        geo.scale(1.7 - i * 0.28, 0.52 - i * 0.08, 0.09);
        const feather = shadowed(new THREE.Mesh(geo, i === 0 ? kit.white : kit.secondary));
        feather.position.set((1.9 - i * 0.2) * side, 1.7 - i * 0.5, -0.05 * i);
        feather.rotation.z = (0.6 - i * 0.28) * side;
        wing.add(feather);
      }
      wing.rotation.y = -0.35 * side;
      g.add(wing);
      wings.push(wing);
    }
    return { group: g, wings };
  } else if (id === 'wings_leaf') {
    // Fae: large leaf-like wings, occasionally slightly translucent (doc).
    const wings: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      for (const [len, wid, px, py, rz] of [
        [3.4, 0.8, 2.1, 1.9, 1.2],     // big upper leaf — tips clear the hair
        [2.5, 0.62, 1.7, 0.55, 0.7],   // lower leaf
      ] as const) {
        const leafGeo = new THREE.ConeGeometry(wid, len, 6);
        leafGeo.translate(0, len / 2, 0);
        leafGeo.scale(1, 1, 0.09);
        const leaf = shadowed(new THREE.Mesh(leafGeo, kit.secondary));
        leaf.position.set(px * side, py, 0);
        leaf.rotation.z = -rz * side; // tips point up and outward
        // Center vein
        const vein = new THREE.Mesh(
          new THREE.BoxGeometry(wid * 0.12, len * 0.82, 0.05), kit.accent,
        );
        vein.position.y = len * 0.45;
        leaf.add(vein);
        wing.add(leaf);
      }
      wing.rotation.y = -0.35 * side;
      g.add(wing);
      wings.push(wing);
    }
    return { group: g, wings };
  } else if (id === 'grimoire') {
    // The mage's floating spellbook — orbits behind the shoulder.
    const book = new THREE.Group();
    const cover = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.3), kit.accent));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.98, 0.22), kit.white);
    pages.position.z = 0.02;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), kit.glow);
    gem.position.z = 0.2;
    book.add(cover, pages, gem);
    book.position.set(1.6, 1.2, -0.4);
    book.rotation.y = 0.5;
    g.add(book);
    return { group: g, grimoire: book };
  } else {
    // wings (bat/fairy generic)
    const wings: THREE.Object3D[] = [];
    for (const side of [1, -1]) {
      const geo = new THREE.SphereGeometry(1, kit.flat ? 8 : 16, kit.flat ? 6 : 12);
      geo.scale(1.7, 0.85, 0.12);
      const wing = shadowed(new THREE.Mesh(geo, kit.secondary));
      wing.position.set(1.35 * side, 0.3, -0.15);
      wing.rotation.z = 0.45 * side;
      wing.rotation.y = -0.35 * side;
      g.add(wing);
      wings.push(wing);
    }
    return { group: g, wings };
  }
  return { group: g }; // bow
}

// ── Hand items ───────────────────────────────────────────────────────────────

function buildHandItem(id: PrincessDNA['parts']['handL'], kit: MaterialKit): THREE.Group | null {
  if (id === 'none') return null;
  const g = new THREE.Group();
  g.name = `part:hand.${id}`;

  if (id === 'wand') {
    const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 8), kit.metal));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), kit.glow);
    star.position.y = 0.95;
    star.rotation.z = Math.PI / 4;
    g.add(rod, star);
    g.rotation.x = 2.3; // held pointing forward-down, tip clear of the sleeve
  } else if (id === 'staff') {
    const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), kit.metal));
    rod.position.y = 0.6;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), kit.glow);
    orb.position.y = 2.35;
    const ringGeo = new THREE.TorusGeometry(0.42, 0.045, 8, 18);
    const ring = shadowed(new THREE.Mesh(ringGeo, kit.metal));
    ring.position.y = 2.35;
    g.add(rod, orb, ring);
  } else if (id === 'fan') {
    const fanGeo = new THREE.ConeGeometry(0.85, 1.1, 9, 1, false, -Math.PI / 2, Math.PI);
    fanGeo.rotateX(Math.PI);
    fanGeo.scale(1, 1, 0.16);
    const fan = shadowed(new THREE.Mesh(fanGeo, kit.accent));
    fan.position.y = 0.5;
    g.add(fan);
    g.rotation.x = 1.9; // fanned outward, not up the arm
  } else {
    // tome — a little spellbook (very TTT)
    const cover = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 0.28), kit.accent));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.2), kit.white);
    pages.position.z = 0.02;
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.3), kit.metal);
    clasp.position.x = 0.34;
    g.add(cover, pages, clasp);
    g.rotation.x = -0.4;
  }
  return g;
}

// ── Hair (attached to the head pivot directly; slime hair is metaballs) ─────

interface HairBuild { group: THREE.Group; pigtails: THREE.Group[] }

function buildHair(dna: PrincessDNA, kit: MaterialKit, headR: number): HairBuild | null {
  const style = dna.hair.style;
  if (style === 'none') return null;
  const g = new THREE.Group();
  g.name = `hair:${style}`;
  const pigtails: THREE.Group[] = [];
  const seg = kit.flat ? 10 : 24;
  const len = dna.hair.length;

  // Cap (all styles): covers the top of the head, brow line stays clear
  const capGeo = new THREE.SphereGeometry(headR * 1.05, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const cap = shadowed(new THREE.Mesh(capGeo, kit.hair));
  cap.position.y = headR * 0.1;
  g.add(cap);

  // Bangs: a shallow fringe high on the forehead
  const bangGeo = new THREE.SphereGeometry(headR * 1.07, seg, Math.max(6, seg / 2), 0, Math.PI * 2, 0, Math.PI * 0.22);
  const bangs = shadowed(new THREE.Mesh(bangGeo, kit.hair));
  bangs.rotation.x = Math.PI * 0.24;
  bangs.position.set(0, headR * 0.12, headR * 0.02);
  g.add(bangs);

  if (style === 'bob') {
    // Side + back curtain to the jawline, OPEN at the front (reference-art bob)
    const curtainGeo = new THREE.CylinderGeometry(
      headR * 1.0, headR * 0.86, headR * 0.9 * len, seg, 1, true,
      Math.PI * 0.32, Math.PI * 1.36,
    );
    const curtain = shadowed(new THREE.Mesh(curtainGeo, kit.hair));
    curtain.position.y = -headR * 0.18;
    g.add(curtain);
  } else if (style === 'pigtails' || style === 'twintails') {
    const big = style === 'twintails';
    const tailLen = headR * (big ? 1.9 : 1.35) * len;
    const tailGeo = new THREE.ConeGeometry(headR * (big ? 0.42 : 0.32), tailLen, seg / 2);
    tailGeo.translate(0, -tailLen * 0.42, 0);
    for (const side of [1, -1]) {
      const tail = new THREE.Group();
      tail.position.set(headR * 0.92 * side, headR * (big ? 0.55 : 0.45), -headR * 0.2);
      const scrunchie = shadowed(new THREE.Mesh(new THREE.TorusGeometry(headR * 0.13, headR * 0.06, 8, 12), kit.accent));
      scrunchie.rotation.x = Math.PI / 2;
      tail.add(scrunchie);
      const mesh = shadowed(new THREE.Mesh(tailGeo.clone(), kit.hair));
      mesh.rotation.z = side * 0.42;
      tail.add(mesh);
      g.add(tail);
      pigtails.push(tail);
    }
  } else if (style === 'bun') {
    const bun = shadowed(new THREE.Mesh(new THREE.SphereGeometry(headR * 0.42 * len, seg / 2, seg / 2), kit.hair));
    bun.position.set(0, headR * 0.78, -headR * 0.45);
    const tie = shadowed(new THREE.Mesh(new THREE.TorusGeometry(headR * 0.2, headR * 0.05, 8, 12), kit.accent));
    tie.position.copy(bun.position).add(new THREE.Vector3(0, -headR * 0.28, headR * 0.12));
    tie.rotation.x = Math.PI / 2.4;
    g.add(bun, tie);
  } else if (style === 'long') {
    const eLen = Math.min(len, 1.25); // panel stays behind the torso, not a tower
    const backGeo = new THREE.SphereGeometry(headR * 0.95, seg, seg);
    backGeo.scale(0.85, 1.7 * eLen, 0.5);
    const back = shadowed(new THREE.Mesh(backGeo, kit.hair));
    back.position.set(0, -headR * 0.95 * eLen, -headR * 0.62);
    g.add(back);
  } else if (style === 'braided') {
    // One thick braid down the back: shrinking sphere chain + tie
    const n = 5;
    for (let i = 0; i < n; i++) {
      const r = headR * (0.3 - i * 0.035) * (0.8 + len * 0.3);
      const bead = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg / 2, seg / 2), kit.hair));
      bead.scale.set(1, 1.25, 1);
      bead.position.set(0, headR * 0.1 - i * r * 2.1 * 0.82, -headR * 0.72 - i * headR * 0.06);
      g.add(bead);
    }
    const tie = shadowed(new THREE.Mesh(new THREE.TorusGeometry(headR * 0.09, headR * 0.04, 6, 10), kit.accent));
    tie.position.set(0, headR * 0.1 - 4 * headR * 0.42, -headR * 0.95);
    g.add(tie);
  } else if (style === 'ponytail') {
    const tailLen = headR * 1.5 * len;
    const tailGeo = new THREE.ConeGeometry(headR * 0.34, tailLen, seg / 2);
    tailGeo.translate(0, -tailLen * 0.42, 0);
    const tail = new THREE.Group();
    tail.position.set(0, headR * 0.62, -headR * 0.75);
    const scrunchie = shadowed(new THREE.Mesh(new THREE.TorusGeometry(headR * 0.14, headR * 0.06, 8, 12), kit.accent));
    scrunchie.rotation.x = Math.PI / 2.5;
    tail.add(scrunchie);
    const mesh = shadowed(new THREE.Mesh(tailGeo, kit.hair));
    mesh.rotation.x = -0.55; // swings out behind
    tail.add(mesh);
    g.add(tail);
    pigtails.push(tail); // reuse the pigtail sway hook
  } else if (style === 'wild') {
    // Textured, voluminous, uncontrolled — deterministic spike crown
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const el = 0.35 + ((i * 31) % 7) / 7 * 0.5; // pseudo-random but stable
      const spikeLen = headR * (0.45 + ((i * 17) % 5) / 5 * 0.4) * len;
      const spike = shadowed(new THREE.Mesh(
        new THREE.ConeGeometry(headR * 0.16, spikeLen, 5), kit.hair,
      ));
      const dir = new THREE.Vector3(
        Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) - 0.25,
      ).normalize();
      spike.position.copy(dir.clone().multiplyScalar(headR * 0.92));
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.add(spike);
    }
  } else if (style === 'afro') {
    // A structural achievement (gnome signature)
    const main = shadowed(new THREE.Mesh(
      new THREE.SphereGeometry(headR * (0.85 + 0.35 * len), seg, seg), kit.hair,
    ));
    main.position.set(0, headR * 0.55, -headR * 0.12);
    g.add(main);
    for (const [ox, oy, r] of [
      [0.62, 0.25, 0.42], [-0.62, 0.25, 0.42], [0.35, 0.85, 0.38], [-0.35, 0.85, 0.38],
    ] as const) {
      const puff = shadowed(new THREE.Mesh(
        new THREE.SphereGeometry(headR * r * (0.8 + 0.3 * len), seg / 2, seg / 2), kit.hair,
      ));
      puff.position.set(headR * ox, headR * oy, -headR * 0.15);
      g.add(puff);
    }
  }

  return { group: g, pigtails };
}

// ── Species hair tech: flame (ignis) & mist (specter) ───────────────────────

interface FlameSpec { x: number; y: number; z: number; h: number; r: number }

/** Map a normal hair style onto a shaped-fire arrangement. */
function flameLayout(style: PrincessDNA['hair']['style'], R: number, len: number): FlameSpec[] {
  const crown = (n: number, h: number, ring = 0.55): FlameSpec[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + 0.4;
      return {
        x: Math.cos(a) * R * ring,
        y: R * (0.55 + 0.25 * Math.abs(Math.sin(a * 2))),
        z: Math.sin(a) * R * ring - R * 0.1,
        h: R * h * len * (0.8 + ((i * 29) % 5) / 10),
        r: R * 0.24,
      };
    });
  switch (style) {
    case 'twintails': return [
      ...crown(4, 0.7),
      { x: R * 0.95, y: R * 0.35, z: -R * 0.2, h: R * 1.7 * len, r: R * 0.32 },
      { x: -R * 0.95, y: R * 0.35, z: -R * 0.2, h: R * 1.7 * len, r: R * 0.32 },
    ];
    case 'ponytail': return [
      ...crown(5, 0.65),
      { x: 0, y: R * 0.6, z: -R * 0.8, h: R * 1.9 * len, r: R * 0.36 },
    ];
    case 'bun': return [
      ...crown(6, 0.5, 0.62),
      { x: 0, y: R * 0.85, z: -R * 0.25, h: R * 1.5 * len, r: R * 0.4 },
    ];
    case 'long': return crown(8, 1.25, 0.6);
    case 'bob': return crown(7, 0.7, 0.6);
    default: return crown(9, 0.95, 0.58); // wild & the rest: a proper blaze
  }
}

interface FlameHair { group: THREE.Group; tongues: Array<{ node: THREE.Group; phase: number }> }

/** Ignis: hair is literally flames — white-hot cores in glowing tongues. */
function buildFlameHair(dna: PrincessDNA, kit: MaterialKit, headR: number): FlameHair {
  const g = new THREE.Group();
  g.name = 'hair:flame';
  const tongues: FlameHair['tongues'] = [];
  const specs = flameLayout(dna.hair.style, headR, dna.hair.length);
  specs.forEach((spec, i) => {
    const node = new THREE.Group();
    node.position.set(spec.x, spec.y, spec.z);
    const outerGeo = new THREE.ConeGeometry(spec.r, spec.h, 6);
    outerGeo.translate(0, spec.h / 2, 0);
    const outer = new THREE.Mesh(outerGeo, kit.glow);
    const coreGeo = new THREE.ConeGeometry(spec.r * 0.45, spec.h * 0.62, 5);
    coreGeo.translate(0, spec.h * 0.31, 0);
    const core = new THREE.Mesh(coreGeo, kit.white);
    core.position.y = spec.h * 0.06;
    node.add(outer, core);
    // Lean slightly outward from the scalp center
    node.rotation.z = -spec.x / headR * 0.35;
    node.rotation.x = spec.z / headR * 0.3;
    g.add(node);
    tongues.push({ node, phase: i * 1.31 });
  });
  return { group: g, tongues };
}

interface MistHair { group: THREE.Group; trail: THREE.Group[] }

/** Specter: hair fades into mist at the ends and lags behind movement. */
function buildMistHair(
  dna: PrincessDNA, kit: MaterialKit, headR: number,
  disposers: Array<() => void>,
): MistHair {
  const g = new THREE.Group();
  g.name = 'hair:mist';
  const seg = 24;

  // Cap (ghosted kit.hair — specter's kit is translucent already)
  const capGeo = new THREE.SphereGeometry(headR * 1.05, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const cap = shadowed(new THREE.Mesh(capGeo, kit.hair));
  cap.position.y = headR * 0.1;
  g.add(cap);

  // Trailing mist chain: shrinking spheres with fading custom materials that
  // share the kit's hair Color instance (palette retints recolor the mist).
  const n = 5;
  const trail: THREE.Group[] = [];
  let parent: THREE.Object3D = g;
  const anchor = new THREE.Group();
  anchor.position.set(0, headR * 0.25, -headR * 0.75);
  g.add(anchor);
  parent = anchor;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.45 * (1 - t) + 0.05,
      depthWrite: false,
      roughness: 0.9,
    });
    mat.color = kit.hair.color; // shared instance → follows palette
    disposers.push(() => mat.dispose());
    const node = new THREE.Group();
    const r = headR * (0.55 - t * 0.3) * dna.hair.length;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.1, r), 14, 10), mat);
    puff.position.z = -r * 0.4;
    node.add(puff);
    const next = new THREE.Group();
    next.position.set(0, -r * 0.5, -r * 1.15);
    node.add(next);
    parent.add(node);
    trail.push(node);
    parent = next;
  }
  return { group: g, trail };
}

/** Fae/Verdant: leaves (and blooms) grow from the hair — simply there. */
function sprinkleGrowth(
  hairGroup: THREE.Group, headR: number, kit: MaterialKit, flowers = 0,
): void {
  const SPOTS: ReadonlyArray<readonly [number, number, number]> = [
    [0.3, 0.75, 0.5], [2.2, 0.6, 0.62], [4.1, 0.8, 0.45],
    [5.3, 0.55, 0.6], [1.3, 0.35, 0.72], [3.3, 0.4, 0.7], [5.9, 0.9, 0.35],
  ];
  for (const [a, el, ring] of SPOTS) {
    const leafGeo = new THREE.ConeGeometry(headR * 0.09, headR * 0.28, 5);
    leafGeo.translate(0, headR * 0.14, 0);
    leafGeo.scale(1, 1, 0.35);
    const leaf = new THREE.Mesh(leafGeo, kit.accent);
    const dir = new THREE.Vector3(
      Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) - 0.2,
    ).normalize();
    leaf.position.copy(dir.clone().multiplyScalar(headR * ring * 1.55));
    leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    leaf.rotation.z += (a * 7) % 1 - 0.5;
    hairGroup.add(leaf);
  }
  const BLOOM_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
    [1.0, 0.65, 0.6], [2.9, 0.5, 0.66], [4.7, 0.7, 0.52], [0.1, 0.4, 0.7],
  ];
  for (let i = 0; i < Math.min(flowers, BLOOM_SPOTS.length); i++) {
    const [a, el, ring] = BLOOM_SPOTS[i];
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.09, 8, 6), kit.accent);
    const dir = new THREE.Vector3(
      Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) - 0.2,
    ).normalize();
    bloom.position.copy(dir.clone().multiplyScalar(headR * ring * 1.6));
    const center = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.045, 6, 5), kit.metal);
    center.position.z = headR * 0.06;
    bloom.add(center);
    hairGroup.add(bloom);
  }
}

/** Naiad: a string of pearls at the collar (she makes them; don't ask). */
function addPearls(result: BuildResult, kit: MaterialKit, p: Proportions): void {
  const n = 9;
  const r = p.topR * 0.92;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1)) * Math.PI * 1.3 + Math.PI * 0.35; // front arc
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.13 + (i % 2) * 0.03, 10, 8), kit.white);
    pearl.position.set(
      Math.cos(a) * r,
      p.neckY - 0.25 - Math.sin(Math.abs(a - Math.PI / 2 - Math.PI * 0.35)) * 0.1,
      Math.sin(a) * r,
    );
    result.rig.torso.add(pearl);
  }
}

/** Moonborn silver arcs / Verdant vines wrapped around the limbs + hem. */
function addLimbBands(
  result: BuildResult, material: THREE.Material, p: Proportions, arcs: boolean,
): void {
  const bandArc = arcs ? Math.PI * 1.35 : Math.PI * 2;
  const mk = (radius: number): THREE.Mesh => {
    const geo = new THREE.TorusGeometry(radius, 0.045, 6, 14, bandArc);
    geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, material);
  };
  for (let i = 0; i < 2; i++) {
    const upper = mk(p.armThick * 1.18);
    upper.position.y = -p.armUpper * 0.55;
    upper.rotation.y = i * Math.PI * 0.5;
    result.rig.shoulders[i].add(upper);
    const lower = mk(p.armThick * 1.05);
    lower.position.y = -p.armLower * 0.5;
    lower.rotation.y = 0.8 + i;
    result.rig.elbows[i].add(lower);
  }
  // One pattern arc low on the dress
  const hem = mk(p.hemR * 0.55);
  hem.position.y = 0.9 - p.dressH * 0.72;
  result.rig.torso.add(hem);
}

// ── Glasses (scholar signature) ──────────────────────────────────────────────

function buildGlasses(dna: PrincessDNA, kit: MaterialKit, headR: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'part:glasses';
  const ex = 0.37 * headR * dna.face.eyeSpacing;
  const ey = -0.1 * headR;
  const ez = headR * 0.97;
  const rimR = 0.17 * headR * dna.face.eyeSize;
  for (const side of [1, -1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, rimR * 0.14, 6, 18), kit.metal);
    rim.position.set(ex * side, ey, ez);
    rim.rotation.y = (Math.PI / 14) * side;
    g.add(rim);
  }
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(rimR * 0.12, rimR * 0.12, ex * 2 - rimR * 1.8, 6),
    kit.metal,
  );
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, ey + rimR * 0.3, ez);
  g.add(bridge);
  return g;
}

// ── Attach pipeline ──────────────────────────────────────────────────────────

export function attachParts(result: BuildResult, dna: PrincessDNA, kit: MaterialKit): void {
  const p = result.proportions;
  const isSlime = dna.archetype === 'slime';
  const sink = isSlime ? -p.headR * 0.08 : 0;

  // Crown — lifted a touch so bands don't sink into the scalp, more when
  // hair adds volume under it (an afro is a structural achievement).
  const HAIR_LIFT: Partial<Record<PrincessDNA['hair']['style'], number>> = {
    afro: 0.45, wild: 0.22, bun: 0.18,
  };
  const hairLift = !isSlime && dna.hair.style !== 'none'
    ? p.headR * (HAIR_LIFT[dna.hair.style] ?? 0.12)
    : 0;
  const crownLift = p.headR * 0.07 + hairLift;
  const crown = buildCrown(dna, kit, p.headR, crownLift);
  if (crown) {
    crown.position.y = sink + crownLift;
    crown.scale.setScalar(dna.parts.crownSize);
    crown.userData.pick = 'crown';
    result.sockets.headTop.add(crown);
    const halo = crown.userData.halo as THREE.Mesh | undefined;
    if (halo) {
      const baseY = halo.position.y;
      result.hooks.tick.push((t) => {
        halo.position.y = baseY + Math.sin(t * 2.1) * 0.14;
        halo.rotation.z = Math.sin(t * 0.8) * 0.1;
      });
    }
  }

  // Ears — mirrored pair
  const earL = buildEarL(dna, kit, p.headR);
  if (earL) {
    earL.position.y = sink * 0.5;
    earL.userData.pick = 'ears';
    result.sockets.earL.add(earL);
    const earR = buildEarL(dna, kit, p.headR);
    if (earR) {
      earR.scale.x = -1;
      earR.position.y = sink * 0.5;
      earR.userData.pick = 'ears';
      result.sockets.earR.add(earR);
      // Occasional ear flicks (fox POC charm) — applies to any ear style.
      let flickL = 0;
      let flickR = 0;
      result.hooks.tick.push(() => {
        if (Math.random() > 0.992) flickL = 0.25 + Math.random() * 0.2;
        if (Math.random() > 0.992) flickR = 0.25 + Math.random() * 0.2;
        flickL *= 0.9;
        flickR *= 0.9;
        earL.rotation.y = flickL;
        earR.rotation.y = -flickR;
      });
    }
  }

  // Tail (slime renders wisp/bone as meshes too — jelly kit makes them gummy)
  const tail = buildTail(dna, kit);
  if (tail) {
    tail.group.userData.pick = 'tail';
    result.sockets.tail.add(tail.group);
    const chains = tail.chains;
    result.hooks.tick.push((t) => {
      const speed = dna.parts.tail === 'bone' ? 2.2 : 3.2;
      const amp = (dna.parts.tail === 'bone' ? 0.1 : 0.3) / Math.sqrt(chains.length);
      chains.forEach((segs, k) => {
        const phase = k * 1.1; // each kitsune tail sways on its own beat
        segs.forEach((seg, i) => {
          seg.rotation.y = Math.sin(t * speed - i * 0.55 + phase) * amp;
          seg.rotation.x = Math.sin(t * 1.8 + i + phase) * 0.04 + 0.025;
        });
      });
    });
  }

  // Back item
  const back = buildBack(dna, kit, p.dressH);
  if (back) {
    back.group.scale.setScalar(dna.parts.backSize);
    back.group.userData.pick = 'back';
    result.sockets.back.add(back.group);
    if (back.capeSegments) {
      const segs = back.capeSegments;
      result.hooks.tick.push((t) => {
        segs.forEach((seg, i) => {
          seg.rotation.x = Math.sin(t * 2.2 - i * 0.6) * 0.12 + 0.08;
          seg.rotation.y = Math.cos(t * 1.5 - i * 0.3) * 0.05;
        });
      });
    }
    if (back.wings) {
      const wings = back.wings;
      const baseZ = wings.map((w) => w.rotation.z);
      const speed = dna.parts.back === 'wings_butterfly' ? 5.5 : 2.6;
      result.hooks.tick.push((t) => {
        const flap = Math.sin(t * speed) * 0.22;
        wings[0].rotation.z = baseZ[0] + flap;
        wings[1].rotation.z = baseZ[1] - flap;
      });
    }
    if (back.grimoire) {
      const book = back.grimoire;
      result.hooks.tick.push((t) => {
        book.position.y = 1.2 + Math.sin(t * 1.8) * 0.25;
        book.rotation.y = 0.5 + Math.sin(t * 0.7) * 0.3;
        book.rotation.z = Math.sin(t * 1.3) * 0.08;
      });
    }
  }

  // Hand items
  const hs = dna.parts.handSize;
  const left = buildHandItem(dna.parts.handL, kit);
  if (left) {
    left.scale.setScalar(hs);
    left.userData.pick = 'handL';
    result.sockets.handL.add(left);
  }
  const right = buildHandItem(dna.parts.handR, kit);
  if (right) {
    right.scale.set(-hs, hs, hs);
    right.userData.pick = 'handR';
    result.sockets.handR.add(right);
  }

  // Glasses ride the head just off the face surface
  if (dna.parts.glasses) {
    const glasses = buildGlasses(dna, kit, p.headR);
    result.rig.head.add(glasses);
  }

  // Species extras (doc-signature accessories)
  if (dna.species === 'naiad') addPearls(result, kit, p);
  if (dna.species === 'moonborn') addLimbBands(result, kit.metal, p, true);
  if (dna.species === 'verdant') addLimbBands(result, kit.primary, p, false);

  // Hair — slime hair is rendered as metaballs by the slime synth;
  // ignis hair is shaped fire; specter hair trails into mist.
  if (!isSlime && dna.hair.style !== 'none') {
    if (dna.species === 'ignis') {
      const flame = buildFlameHair(dna, kit, p.headR);
      flame.group.userData.pick = 'hair';
      result.rig.head.add(flame.group);
      const tongues = flame.tongues;
      result.hooks.tick.push((t) => {
        for (const { node, phase } of tongues) {
          node.scale.y = 1 + Math.sin(t * 7.5 + phase) * 0.22 + Math.sin(t * 13 + phase * 2) * 0.08;
          node.rotation.y = Math.sin(t * 5.2 + phase) * 0.14;
        }
      });
    } else if (dna.species === 'specter') {
      const mist = buildMistHair(dna, kit, p.headR, result.hooks.disposers);
      mist.group.userData.pick = 'hair';
      result.rig.head.add(mist.group);
      const trail = mist.trail;
      result.hooks.tick.push((t) => {
        trail.forEach((node, i) => {
          node.rotation.y = Math.sin(t * 1.4 - i * 0.7) * 0.22;
          node.rotation.x = Math.sin(t * 1.1 - i * 0.55) * 0.12 + 0.06;
        });
      });
    } else {
      const hair = buildHair(dna, kit, p.headR);
      if (hair) {
        hair.group.userData.pick = 'hair';
        if (dna.species === 'fae') sprinkleGrowth(hair.group, p.headR, kit);
        if (dna.species === 'verdant') sprinkleGrowth(hair.group, p.headR, kit, 4);
        result.rig.head.add(hair.group);
        if (hair.pigtails.length > 0) {
          const tails = hair.pigtails;
          result.hooks.tick.push((t) => {
            tails.forEach((tailGroup, i) => {
              const side = i === 0 ? 1 : -1;
              tailGroup.rotation.z = side * (0.12 + Math.sin(t * 2.4 + i) * 0.08);
              tailGroup.rotation.x = Math.sin(t * 1.9 + i * 2) * 0.07;
            });
          });
        }
      }
    }
  }
}
