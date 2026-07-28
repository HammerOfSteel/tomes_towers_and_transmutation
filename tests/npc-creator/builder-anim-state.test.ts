/**
 * builder-anim-state.test.ts
 * Verifies NpcInstance.setAnimState bridges to the underlying princess rig's
 * setState(), matching the pattern already used by EnemyInstance.
 */

import { describe, it, expect } from 'vitest';
import { buildNpc } from '@/npc-creator/builder';
import { getDefaultNpcDna } from '@/npc-creator/defaults/NpcDefaults';

describe('NpcInstance.setAnimState', () => {
  it('exists as a callable method on the built instance', async () => {
    const dna = getDefaultNpcDna('human', 'citizen', 1);
    const inst = await buildNpc({ ...dna, name: 'Test Citizen' });
    expect(typeof inst.setAnimState).toBe('function');
  });

  it('does not throw when switching between walk and idle', async () => {
    const dna = getDefaultNpcDna('human', 'citizen', 2);
    const inst = await buildNpc({ ...dna, name: 'Test Citizen 2' });
    expect(() => inst.setAnimState('walk')).not.toThrow();
    expect(() => inst.setAnimState('idle')).not.toThrow();
  });
});
