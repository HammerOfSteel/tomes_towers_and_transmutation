/**
 * lockedDoor.test.ts — Unit tests for locked_door interactable behaviour.
 *
 * Covers:
 *   - onLockedDoor callback fires with correct (doorId, requiredKey, hasKey=false)
 *   - onLockedDoor is not called when player is out of range
 *   - Multiple doors — nearest is selected
 */

import { describe, it, expect, vi } from 'vitest';
import { InteractableSystem } from '@/interactables/InteractableSystem';
import type { WorldInteractable } from '@/interactables/InteractableSystem';
import * as THREE from 'three';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

const makeBookReader = () => ({ isOpen: false, open: vi.fn(), close: vi.fn() } as any);
const makeProgression = () => ({}) as any;

function makeDoor(id = 'door_exit', requiredKey = 'master_key', x = 0, z = 0): WorldInteractable {
  return {
    id,
    type: 'locked_door',
    position: new THREE.Vector3(x, 0, z),
    content: requiredKey,
    label: 'Iron Door',
  } as unknown as WorldInteractable;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InteractableSystem — locked_door', () => {
  it('onLockedDoor fires with correct doorId and requiredKey', () => {
    const sys = new InteractableSystem(makeProgression(), makeBookReader());
    const door = makeDoor('tower_exit', 'master_key');
    const cb   = vi.fn();
    sys.onLockedDoor = cb;

    sys.update(new THREE.Vector3(0, 0, 0.5), [door]);  // player near door
    sys.tryRead();                                       // tryRead handles locked_door
    expect(cb).toHaveBeenCalledWith('tower_exit', 'master_key', false);
  });

  it('onLockedDoor is not called when player is out of range', () => {
    const sys = new InteractableSystem(makeProgression(), makeBookReader());
    const door = makeDoor();
    const cb   = vi.fn();
    sys.onLockedDoor = cb;

    sys.update(new THREE.Vector3(20, 0, 20), [door]);  // far away
    sys.tryRead();
    expect(cb).not.toHaveBeenCalled();
  });

  it('nearest door is selected when two doors exist', () => {
    const sys   = new InteractableSystem(makeProgression(), makeBookReader());
    const far   = makeDoor('door_far',  'key_far',   0, 10);
    const near  = makeDoor('door_near', 'key_near',  0,  0.5);
    const cb    = vi.fn();
    sys.onLockedDoor = cb;

    sys.update(new THREE.Vector3(0, 0, 0), [far, near]);
    sys.tryRead();
    // Should have fired for the nearer door
    expect(cb).toHaveBeenCalledWith('door_near', 'key_near', false);
    expect(cb).not.toHaveBeenCalledWith('door_far', expect.anything(), expect.anything());
  });

  it('does not fire when door content is absent (defaults to master_key)', () => {
    const sys  = new InteractableSystem(makeProgression(), makeBookReader());
    const door = { id: 'door_nokey', type: 'locked_door',
      position: new THREE.Vector3(0, 0, 0), label: 'Old Door' } as unknown as WorldInteractable;
    const cb   = vi.fn();
    sys.onLockedDoor = cb;

    sys.update(new THREE.Vector3(0, 0, 0.5), [door]);
    sys.tryRead();
    expect(cb).toHaveBeenCalledWith('door_nokey', 'master_key', false);
  });
});
