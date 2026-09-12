import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildVulperiaWindow,
  buildVulperiaDoor,
  buildVulperiaRoundWatch,
  buildVulperiaEyebrowDormerWindow,
  buildVulperiaShutteredWindow,
  buildVulperiaGableSlit,
  type VulperiaOpeningPalette,
} from '@/world/buildings/vulperia/VulperiaOpenings';
import { depthFor } from '@/world/buildings/kit/DepthLadder';

function makePalette(): VulperiaOpeningPalette {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#d4a060' }),
    glazing: new THREE.MeshStandardMaterial({ color: '#2a1a08' }),
    wood: new THREE.MeshStandardMaterial({ color: '#6a3810' }),
    accent: new THREE.MeshStandardMaterial({ color: '#2f5233' }),
  };
}

function requireChild(group: THREE.Group, name: string): THREE.Object3D {
  const child = group.getObjectByName(name);
  expect(child, `${name} should exist`).toBeTruthy();
  return child!;
}

describe('buildVulperiaWindow — five-piece framed opening', () => {
  it('produces recess/surround/sill/division/glazing at separated depths', () => {
    const wallZ = 1.2;
    const opening = buildVulperiaWindow({ width: 0.55, height: 0.75, wallZ, palette: makePalette() });
    const recess = requireChild(opening, 'recess');
    const surround = requireChild(opening, 'surround');
    requireChild(opening, 'sill');
    requireChild(opening, 'division');
    const glazing = requireChild(opening, 'glazing');
    expect(recess.position.z - wallZ).toBeLessThanOrEqual(depthFor('REVEAL') + 1e-9);
    expect(surround.position.z - wallZ).toBeGreaterThanOrEqual(depthFor('FRAME'));
    expect(glazing.position.z - wallZ).toBeLessThanOrEqual(depthFor('GLAZING'));
  });

  it('uses a low/rounded profile (round or shallow arch), never a tall gothic lancet', () => {
    const opening = buildVulperiaWindow({ width: 0.5, height: 0.7, wallZ: 0, palette: makePalette() });
    opening.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(opening);
    const height = box.max.y - box.min.y;
    // A vampire-style tall lancet would push the aspect ratio well past 2:1;
    // vulperia's small framed openings should stay closer to square/round.
    expect(height / 0.5).toBeLessThan(2.2);
  });
});

describe('buildVulperiaDoor — burrow/porch door', () => {
  it('produces recess/surround/threshold/door-leaf/straps', () => {
    const opening = buildVulperiaDoor({ width: 0.85, height: 1.5, wallZ: 1.0, palette: makePalette() });
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'threshold');
    let hasPlank = false;
    let hasStrap = false;
    opening.traverse((o) => {
      if (o.name.startsWith('plank-')) hasPlank = true;
      if (o.name.startsWith('strap-')) hasStrap = true;
    });
    expect(hasPlank).toBe(true);
    expect(hasStrap).toBe(true);
  });

  it('has a rounded/Romanesque low profile, not a tall gothic point', () => {
    const opening = buildVulperiaDoor({ width: 0.85, height: 1.5, wallZ: 0, palette: makePalette() });
    opening.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(opening);
    expect(box.max.y - box.min.y).toBeLessThan(1.5 * 1.35);
  });
});

describe('buildVulperiaRoundWatch — round watch-window opening', () => {
  it('produces a round five-piece opening with a cross division', () => {
    const opening = buildVulperiaRoundWatch({ diameter: 0.5, wallZ: 1.0, palette: makePalette() });
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'glazing');
  });
});

describe('buildVulperiaEyebrowDormerWindow — small dormer-set window', () => {
  it('wraps a five-piece window with a proud eyebrow hood lintel', () => {
    const win = buildVulperiaEyebrowDormerWindow({ width: 0.45, height: 0.55, wallZ: 0.8, palette: makePalette() });
    requireChild(win, 'opening');
    const hood = requireChild(win, 'eyebrow-hood');
    expect((hood as THREE.Mesh).geometry).toBeTruthy();
  });
});

describe('buildVulperiaShutteredWindow — small framed shuttered opening', () => {
  it('wraps a five-piece window with a pair of named shutters', () => {
    const win = buildVulperiaShutteredWindow({ width: 0.5, height: 0.7, wallZ: 0.9, palette: makePalette() });
    requireChild(win, 'opening');
    let shutterCount = 0;
    win.traverse((o) => { if (o.name.startsWith('shutter-')) shutterCount++; });
    expect(shutterCount).toBeGreaterThanOrEqual(2);
  });
});

describe('buildVulperiaGableSlit — narrow tall watching slit', () => {
  it('produces a genuinely narrow/tall five-piece opening, exempt from the low-aspect clamp', () => {
    const opening = buildVulperiaGableSlit({ width: 0.28, height: 0.95, wallZ: 0.5, palette: makePalette() });
    requireChild(opening, 'recess');
    requireChild(opening, 'surround');
    requireChild(opening, 'glazing');
    opening.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(opening);
    expect((box.max.y - box.min.y) / 0.28).toBeGreaterThan(2);
  });
});

describe('vulperia openings — no NaN/degenerate geometry across the whole family', () => {
  it('every opening produces only finite vertex positions', () => {
    const palette = makePalette();
    const groups = [
      buildVulperiaWindow({ width: 0.5, height: 0.7, wallZ: 0.5, palette }),
      buildVulperiaDoor({ width: 0.85, height: 1.5, wallZ: 0.5, palette }),
      buildVulperiaRoundWatch({ diameter: 0.5, wallZ: 0.5, palette }),
      buildVulperiaEyebrowDormerWindow({ width: 0.45, height: 0.55, wallZ: 0.5, palette }),
      buildVulperiaShutteredWindow({ width: 0.5, height: 0.7, wallZ: 0.5, palette }),
      buildVulperiaGableSlit({ width: 0.28, height: 0.95, wallZ: 0.5, palette }),
    ];
    for (const g of groups) {
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i))).toBe(true);
          expect(Number.isFinite(pos.getY(i))).toBe(true);
          expect(Number.isFinite(pos.getZ(i))).toBe(true);
        }
        expect(o.geometry.getAttribute('uv')).toBeTruthy();
      });
    }
  });
});
