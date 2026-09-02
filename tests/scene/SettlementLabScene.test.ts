import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { PlayerController } from '@/player/PlayerController';
import { DEFAULT_PLAYER_DNA } from '@/creatures/CreatureDNA';
import { SettlementLabScene } from '@/scene/SettlementLabScene';

describe('SettlementLabScene', () => {
  let scene: THREE.Scene;
  let physics: PhysicsWorld;
  let player: PlayerController;
  let lab: SettlementLabScene;

  beforeAll(async () => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
    lab = new SettlementLabScene(scene, physics, player);
  });

  it('enter() populates the scene with at least one building mesh and does not throw', () => {
    const baseline = scene.children.length;
    expect(() => lab.enter()).not.toThrow();
    // Ground + buildings + road tiles + lamp groups should all be added
    expect(scene.children.length).toBeGreaterThan(baseline);
    // At least one THREE.Group from buildings or lamps
    const hasGroup = scene.children.some(c => c instanceof THREE.Group);
    expect(hasGroup).toBe(true);
  });

  it('exit() removes everything enter()/regenerate added and returns scene to pre-enter state', () => {
    // Already entered from previous test — record the pre-exit count should be > 0
    const beforeExit = scene.children.length;
    expect(beforeExit).toBeGreaterThan(0);

    lab.exit();

    // After exit the scene should be empty (baseline was 0 before enter)
    expect(scene.children.length).toBe(0);
  });

  it('a second regeneration does not accumulate objects from the first (no leak)', async () => {
    // Fresh setup
    const scene2 = new THREE.Scene();
    const physics2 = new PhysicsWorld();
    await physics2.init();
    const lab2 = new SettlementLabScene(scene2, physics2, player);

    lab2.enter();
    const afterFirstEnter = scene2.children.length;
    expect(afterFirstEnter).toBeGreaterThan(0);

    // Trigger a second regeneration via the panel's regenerate button
    const panel = (lab2 as unknown as { _panel: { rootEl: HTMLElement } })._panel;
    document.body.appendChild(panel.rootEl);
    const regenBtn = panel.rootEl.querySelector('[data-action="regenerate"]') as HTMLButtonElement;
    regenBtn.click();

    // After regen (same default seed/type/faction/layout as the initial
    // enter() call), the scene child count must be EXACTLY the same — any
    // growth at all would indicate a leaked building/road/lamp object from
    // the previous settlement not being cleared before the new one is built.
    const afterSecondRegen = scene2.children.length;
    expect(afterSecondRegen).toBe(afterFirstEnter);

    lab2.exit();
    expect(scene2.children.length).toBe(0);
  });

  it('update(dt) does not throw', () => {
    const scene3 = new THREE.Scene();
    const lab3 = new SettlementLabScene(scene3, physics, player);
    expect(() => lab3.update(1 / 60)).not.toThrow();
  });

  it('lamp point-lights stay nested inside their lamp-post group (not reparented onto the scene root)', () => {
    // Regression test: SettlementLabScene used to additionally call
    // scene.add(light) for every entry in result.lampLights, on top of the
    // lights already being children of result.lampGroups (added by
    // makeLampPost()). THREE.Object3D.add() reparents unconditionally, so
    // that second add() ripped each light out of its lamp group and
    // collapsed it to world position (0, 1.42, 0) instead of illuminating
    // its actual lamp post. lampLights is meant to be a read-only parallel
    // bookkeeping array (mirroring OverworldScene's usage), never re-added.
    const scene4 = new THREE.Scene();
    const lab4 = new SettlementLabScene(scene4, physics, player);
    lab4.enter();

    const lampGroups = scene4.children.filter(
      (c): c is THREE.Group => c instanceof THREE.Group && c.children.some(ch => ch instanceof THREE.PointLight),
    );
    expect(lampGroups.length).toBeGreaterThan(0);

    for (const grp of lampGroups) {
      const light = grp.children.find(ch => ch instanceof THREE.PointLight) as THREE.PointLight;
      expect(light.parent).toBe(grp);
    }

    // No PointLight should ever be a direct child of the scene root.
    const directLightsOnScene = scene4.children.filter(c => c instanceof THREE.PointLight);
    expect(directLightsOnScene).toHaveLength(0);

    lab4.exit();
  });

  it('ground plane sits at the same elevation as buildings/roads (no floating gap)', () => {
    // Regression test: the Lab's grid is force-flattened to elevation=1 (the
    // minimum value planSettlement's _valid() accepts), and buildings/roads
    // render at elevation * LEVEL_HEIGHT (0.55 WU) per SettlementRenderer's
    // convention. The ground plane previously stayed at y=0 regardless,
    // leaving every building/road visibly floating ~0.55 WU above it.
    const scene5 = new THREE.Scene();
    const lab5 = new SettlementLabScene(scene5, physics, player);
    lab5.enter();

    const groundMesh = scene5.children.find(
      c => c instanceof THREE.Mesh && (c.geometry as THREE.BufferGeometry).type === 'PlaneGeometry',
    ) as THREE.Mesh | undefined;
    expect(groundMesh).toBeDefined();

    const buildingGroup = scene5.children.find(
      c => c instanceof THREE.Group && c.children.some(ch => ch instanceof THREE.Mesh),
    ) as THREE.Group | undefined;
    expect(buildingGroup).toBeDefined();

    // Building group's world Y should match the ground plane's Y exactly —
    // both are placed at the same flattened elevation plateau.
    expect(buildingGroup!.position.y).toBeCloseTo(groundMesh!.position.y, 5);

    lab5.exit();
  });
});

describe('SettlementLabScene — enter(initialParams) for "Play in 3D" handoff', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('enter(params) renders the settlement described by params instead of the hardcoded defaults', () => {
    const scene6 = new THREE.Scene();
    const labDefault = new SettlementLabScene(scene6, physics, player);
    labDefault.enter(); // default seed=42/village/human/auto
    const defaultReadout = (labDefault as unknown as { _panel: { setReadout: unknown } });
    const defaultPanelEl = (labDefault as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    const defaultText = defaultPanelEl.querySelector('[data-role="readout"]')?.textContent;
    labDefault.exit();

    const scene7 = new THREE.Scene();
    const labCustom = new SettlementLabScene(scene7, physics, player);
    labCustom.enter({ seed: 4242, type: 'city', faction: 'dwarven', layout: 'radial' });
    const customPanelEl = (labCustom as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;

    // Panel's dropdowns/seed input reflect the carried-over params, not the
    // Lab's own hardcoded defaults.
    const seedInput = customPanelEl.querySelector('[data-role="seed-input"]') as HTMLInputElement;
    const typeSelect = customPanelEl.querySelector('[data-role="type-select"]') as HTMLSelectElement;
    const factionSelect = customPanelEl.querySelector('[data-role="faction-select"]') as HTMLSelectElement;
    const layoutSelect = customPanelEl.querySelector('[data-role="layout-select"]') as HTMLSelectElement;
    expect(seedInput.value).toBe('4242');
    expect(typeSelect.value).toBe('city');
    expect(factionSelect.value).toBe('dwarven');
    expect(layoutSelect.value).toBe('radial');

    // A city with a different seed/faction/layout than the village default
    // should (overwhelmingly likely, and deterministically for this fixed
    // seed) produce a different building count than the default village.
    const customText = customPanelEl.querySelector('[data-role="readout"]')?.textContent;
    expect(customText).not.toBe(defaultText);
    void defaultReadout;

    labCustom.exit();
  });

  it('enter(params) with an invalid type/faction/layout falls back to defaults for just that field', () => {
    const scene8 = new THREE.Scene();
    const lab8 = new SettlementLabScene(scene8, physics, player);
    // seed is fine, but type/faction/layout are garbage — should not throw,
    // and should fall back to the Lab's known-good defaults for those.
    expect(() => lab8.enter({ seed: 7, type: 'not-a-type', faction: 'not-a-faction', layout: 'not-a-layout' }))
      .not.toThrow();

    const panelEl = (lab8 as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    const seedInput = panelEl.querySelector('[data-role="seed-input"]') as HTMLInputElement;
    const typeSelect = panelEl.querySelector('[data-role="type-select"]') as HTMLSelectElement;
    expect(seedInput.value).toBe('7');
    expect(typeSelect.value).toBe('village'); // fell back to first/default option

    lab8.exit();
  });
});

describe('SettlementLabScene — kind override (isolate one BuildingKind for review)', () => {
  let physics: PhysicsWorld;
  let player: PlayerController;

  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
    player = new PlayerController(physics, new THREE.Vector3(0, 5, 0));
    player.applyDNA(DEFAULT_PLAYER_DNA);
  });

  it('forces every building to the requested kind and reflects it in the readout', () => {
    const scene = new THREE.Scene();
    const lab = new SettlementLabScene(scene, physics, player);
    // city + elven so this exercises the elven stone-tower kit's watchtower
    // dispatch specifically (the exact scenario the user wants to preview).
    lab.enter({ seed: 7, type: 'city', faction: 'elven', layout: 'auto', kindOverride: 'watchtower' });

    const result = (lab as unknown as { _renderResult: { buildingRecords: { dna: { buildingKind: string } }[] } })
      ._renderResult;
    expect(result.buildingRecords.length).toBeGreaterThan(0);
    for (const rec of result.buildingRecords) {
      expect(rec.dna.buildingKind).toBe('watchtower');
    }

    const panelEl = (lab as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    const readoutEl = panelEl.querySelector('[data-role="readout"]') as HTMLElement;
    expect(readoutEl.textContent).toContain('kind override: watchtower');
    const kindSelect = panelEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(kindSelect.value).toBe('watchtower');

    lab.exit();
  });

  it('omitting kindOverride (or "all") preserves the normal per-ward BuildingKind mix', () => {
    const scene = new THREE.Scene();
    const lab = new SettlementLabScene(scene, physics, player);
    lab.enter({ seed: 7, type: 'city', faction: 'elven', layout: 'auto' }); // no kindOverride

    const result = (lab as unknown as { _renderResult: { buildingRecords: { dna: { buildingKind: string } }[] } })
      ._renderResult;
    const kinds = new Set(result.buildingRecords.map(r => r.dna.buildingKind));
    expect(kinds.size).toBeGreaterThan(1);

    const panelEl = (lab as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    const readoutEl = panelEl.querySelector('[data-role="readout"]') as HTMLElement;
    expect(readoutEl.textContent).not.toContain('kind override');
    const kindSelect = panelEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    expect(kindSelect.value).toBe('all');

    lab.exit();
  });

  it('an invalid kindOverride value does not throw and falls back to no override', () => {
    const scene = new THREE.Scene();
    const lab = new SettlementLabScene(scene, physics, player);
    expect(() => lab.enter({
      seed: 7, type: 'village', faction: 'human', layout: 'auto', kindOverride: 'not-a-real-kind',
    })).not.toThrow();

    const panelEl = (lab as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    const readoutEl = panelEl.querySelector('[data-role="readout"]') as HTMLElement;
    expect(readoutEl.textContent).not.toContain('kind override');

    lab.exit();
  });

  it('selecting a kind override via the panel and clicking Regenerate re-applies it', () => {
    const scene = new THREE.Scene();
    const lab = new SettlementLabScene(scene, physics, player);
    lab.enter({ seed: 7, type: 'city', faction: 'elven', layout: 'auto' }); // starts with no override

    const panelEl = (lab as unknown as { _panel: { rootEl: HTMLElement } })._panel.rootEl;
    document.body.appendChild(panelEl);
    const kindSelect = panelEl.querySelector('[data-role="kind-select"]') as HTMLSelectElement;
    kindSelect.value = 'tower';
    const regenBtn = panelEl.querySelector('[data-action="regenerate"]') as HTMLButtonElement;
    regenBtn.click();

    const result = (lab as unknown as { _renderResult: { buildingRecords: { dna: { buildingKind: string } }[] } })
      ._renderResult;
    expect(result.buildingRecords.length).toBeGreaterThan(0);
    for (const rec of result.buildingRecords) {
      expect(rec.dna.buildingKind).toBe('tower');
    }

    lab.exit();
  });
});