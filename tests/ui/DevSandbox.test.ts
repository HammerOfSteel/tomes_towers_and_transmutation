import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('DevSandbox modern DNA labs', () => {
  let savedRaf: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    document.body.innerHTML = '';
    savedRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof globalThis.requestAnimationFrame;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    globalThis.requestAnimationFrame = savedRaf;
  });

  async function mountSandbox() {
    const { DevSandbox } = await import('@/ui/DevSandbox');
    const onSpawnCreature = vi.fn();
    const onSpawnNPC = vi.fn();
    const sandbox = new DevSandbox({
      onGrantSpell: () => {},
      onSetActiveSpell: () => {},
      onSpawnEnemies: () => {},
      onKillAllEnemies: () => {},
      onGrantAllSpells: () => {},
      getProcGenStats: () => ({ text: '', roomIds: [] }),
      onEnterRoom: () => {},
      onReturnToArena: () => {},
      onEnterOverworld: () => {},
      onEnterWaterLab: () => {},
      onSetWaterVariant: () => {},
      onSpawnCreature,
      onSpawnNPC,
      onClose: () => {},
    });
    return { sandbox: sandbox as any, onSpawnCreature, onSpawnNPC };
  }

  it('spawns creature tab selections as EnemyDNA', async () => {
    const { sandbox, onSpawnCreature } = await mountSandbox();
    sandbox._switchTab('creature');

    const species = document.querySelector<HTMLSelectElement>('[data-ds-field="enemy-species"]')!;
    const role = document.querySelector<HTMLSelectElement>('[data-ds-field="enemy-role"]')!;
    const tier = document.querySelector<HTMLSelectElement>('[data-ds-field="enemy-tier"]')!;
    const movement = document.querySelector<HTMLSelectElement>('[data-ds-field="enemy-movement"]')!;
    const spawn = document.querySelector<HTMLButtonElement>('[data-ds-action="spawn-creature"]')!;

    species.value = 'undead';
    species.dispatchEvent(new Event('change'));
    role.value = 'caster';
    role.dispatchEvent(new Event('change'));
    tier.value = '3';
    tier.dispatchEvent(new Event('change'));
    movement.value = 'ambush';
    movement.dispatchEvent(new Event('change'));
    spawn.click();

    expect(onSpawnCreature).toHaveBeenCalledTimes(1);
    const [dna] = onSpawnCreature.mock.calls[0];
    expect(dna.kind).toBe('enemy');
    expect(dna.species).toBe('undead');
    expect(dna.combatRole).toBe('caster');
    expect(dna.tier).toBe(3);
    expect(dna.movement).toBe('ambush');
  });

  it('spawns npc tab selections as NpcDNA with sandbox combat overrides', async () => {
    const { sandbox, onSpawnNPC } = await mountSandbox();
    sandbox._switchTab('npcgen');

    const name = document.querySelector<HTMLInputElement>('[data-ds-field="npc-name"]')!;
    const species = document.querySelector<HTMLSelectElement>('[data-ds-field="npc-species"]')!;
    const role = document.querySelector<HTMLSelectElement>('[data-ds-field="npc-role"]')!;
    const personality = document.querySelector<HTMLSelectElement>('[data-ds-field="npc-personality"]')!;
    const hp = document.querySelector<HTMLInputElement>('[data-ds-field="npc-hp"]')!;
    const damage = document.querySelector<HTMLInputElement>('[data-ds-field="npc-damage"]')!;
    const count = document.querySelector<HTMLInputElement>('[data-ds-field="npc-count"]')!;
    const spawn = document.querySelector<HTMLButtonElement>('[data-ds-action="spawn-npc"]')!;

    name.value = 'Archivist';
    name.dispatchEvent(new Event('input'));
    species.value = 'elf';
    species.dispatchEvent(new Event('change'));
    role.value = 'scholar';
    role.dispatchEvent(new Event('change'));
    personality.value = 'formal';
    personality.dispatchEvent(new Event('change'));
    hp.value = '55';
    hp.dispatchEvent(new Event('change'));
    damage.value = '9';
    damage.dispatchEvent(new Event('change'));
    count.value = '2';
    count.dispatchEvent(new Event('change'));
    spawn.click();

    expect(onSpawnNPC).toHaveBeenCalledTimes(1);
    const [dna, spawnedHp, spawnedDamage, spawnedCount] = onSpawnNPC.mock.calls[0];
    expect(dna.kind).toBe('npc');
    expect(dna.name).toBe('Archivist');
    expect(dna.species).toBe('elf');
    expect(dna.role).toBe('scholar');
    expect(dna.personality).toBe('formal');
    expect(spawnedHp).toBe(55);
    expect(spawnedDamage).toBe(9);
    expect(spawnedCount).toBe(2);
  });

  it('offers a 3-way water variant selector defaulting to stylized', async () => {
    const onSetWaterVariant = vi.fn();
    const { DevSandbox } = await import('@/ui/DevSandbox');
    const sandbox = new DevSandbox({
      onGrantSpell: () => {},
      onSetActiveSpell: () => {},
      onSpawnEnemies: () => {},
      onKillAllEnemies: () => {},
      onGrantAllSpells: () => {},
      getProcGenStats: () => ({ text: '', roomIds: [] }),
      onEnterRoom: () => {},
      onReturnToArena: () => {},
      onEnterOverworld: () => {},
      onEnterWaterLab: () => {},
      onSetWaterVariant,
      onSpawnCreature: () => {},
      onSpawnNPC: () => {},
      onClose: () => {},
    }) as any;
    sandbox._switchTab('procgen');

    const stylizedBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-stylized"]')!;
    const reflectiveBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-reflective"]')!;
    const flowBtn = document.querySelector<HTMLButtonElement>('[data-ds-action="water-variant-flow"]')!;
    expect(stylizedBtn).toBeTruthy();
    expect(reflectiveBtn).toBeTruthy();
    expect(flowBtn).toBeTruthy();
    // Stylized starts active (matches WaterLabScene's new default), no
    // click needed to select it, but clicking the others should call
    // through with the right variant name.
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(true);

    reflectiveBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('reflective');
    expect(reflectiveBtn.classList.contains('ds-btn--accent')).toBe(true);
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(false);

    flowBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('flow-refractive');
    expect(flowBtn.classList.contains('ds-btn--accent')).toBe(true);

    stylizedBtn.click();
    expect(onSetWaterVariant).toHaveBeenCalledWith('stylized');
    expect(stylizedBtn.classList.contains('ds-btn--accent')).toBe(true);
  });
});
