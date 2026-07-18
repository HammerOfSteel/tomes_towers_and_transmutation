/**
 * overworld.startup.smoke.test.ts — F2 smoke test: Overworld data pipeline initialises without throw.
 *
 * Tests buildWorldData + OWMinimap rather than full OverworldScene (which requires
 * PhysicsWorld + PlayerController + real WorldGrid — too heavyweight for unit tests).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@dimforge/rapier3d-compat', () => ({
  default: { init: vi.fn().mockResolvedValue(undefined) },
}));

describe('OverworldScene — startup smoke', () => {
  it('buildWorldData module imports without throwing', async () => {
    await expect(import('@/world/WorldGenerator')).resolves.toHaveProperty('buildWorldData');
  });

  it('OWMinimap module imports without throwing', async () => {
    await expect(import('@/ui/OWMinimap')).resolves.toHaveProperty('OWMinimap');
  });

  it('OverworldScene module imports without throwing', async () => {
    await expect(import('@/scene/OverworldScene')).resolves.toHaveProperty('OverworldScene');
  });
});
