import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputManager } from '@/core/InputManager';

describe('InputManager', () => {
  let manager: InputManager;

  beforeEach(() => {
    manager = new InputManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ── Movement keys ─────────────────────────────────────────────────────────

  it('sets moveForward when W is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(manager.state.moveForward).toBe(true);
  });

  it('clears moveForward when W is released', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    expect(manager.state.moveForward).toBe(false);
  });

  it('sets moveBackward when S is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }));
    expect(manager.state.moveBackward).toBe(true);
  });

  it('sets moveLeft when A is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(manager.state.moveLeft).toBe(true);
  });

  it('sets moveRight when D is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(manager.state.moveRight).toBe(true);
  });

  it('supports ArrowUp as moveForward', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
    expect(manager.state.moveForward).toBe(true);
  });

  it('supports ArrowDown as moveBackward', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
    expect(manager.state.moveBackward).toBe(true);
  });

  it('supports ArrowLeft as moveLeft', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(manager.state.moveLeft).toBe(true);
  });

  it('supports ArrowRight as moveRight', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(manager.state.moveRight).toBe(true);
  });

  // ── Action keys ───────────────────────────────────────────────────────────

  it('sets jump when Space is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(manager.state.jump).toBe(true);
  });

  it('sets run when ShiftLeft is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    expect(manager.state.run).toBe(true);
  });

  it('sets run when ShiftRight is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' }));
    expect(manager.state.run).toBe(true);
  });

  it('sets attack when mouse button 0 is pressed', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(manager.state.attack).toBe(true);
  });

  it('clears attack when mouse button 0 is released', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    expect(manager.state.attack).toBe(false);
  });

  it('sets dodge when F is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
    expect(manager.state.dodge).toBe(true);
  });

  it('sets interact when E is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    expect(manager.state.interact).toBe(true);
  });

  it('sets meleeKey when Digit5 is pressed', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5' }));
    expect(manager.state.meleeKey).toBe(true);
  });

  it('clears meleeKey when Digit5 is released', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit5' }));
    expect(manager.state.meleeKey).toBe(false);
  });

  // ── Look-held (right mouse button, used for WoW-mode strafe) ─────────────

  // ── Turn-drag-held (left mouse button, used for WoW-mode strafe) ────────

  it('sets turnDragHeld when left mouse button is pressed', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(manager.state.turnDragHeld).toBe(true);
  });

  it('clears turnDragHeld when left mouse button is released', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    expect(manager.state.turnDragHeld).toBe(false);
  });

  it('does not set turnDragHeld from the right mouse button', () => {
    window.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
    expect(manager.state.turnDragHeld).toBe(false);
  });

  // ── Instant-cast slot requests (Digit1-4, for WoW camera mode) ───────────

  it('consumeCastSlotRequest() returns the slot on a fresh Digit1-4 press', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
    expect(manager.consumeCastSlotRequest()).toBe(1);
  });

  it('consumeCastSlotRequest() returns null after being drained once', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
    expect(manager.consumeCastSlotRequest()).toBe(0);
    expect(manager.consumeCastSlotRequest()).toBeNull();
  });

  it('consumeCastSlotRequest() returns null when no digit was pressed', () => {
    expect(manager.consumeCastSlotRequest()).toBeNull();
  });

  it('does not re-request on OS key-repeat of a held digit key', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3' }));
    expect(manager.consumeCastSlotRequest()).toBe(2);
    // Simulate the browser's auto-repeat keydown while still held
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', repeat: true }));
    expect(manager.consumeCastSlotRequest()).toBeNull();
  });

  it('still updates activeSlot on Digit1-4 press (unaffected by instant-cast request)', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4' }));
    expect(manager.activeSlot).toBe(3);
  });

  // ── Multiple keys held ────────────────────────────────────────────────────

  it('allows multiple keys to be held simultaneously', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    const s = manager.state;
    expect(s.moveForward).toBe(true);
    expect(s.moveRight).toBe(true);
  });

  // ── Mouse ─────────────────────────────────────────────────────────────────

  it('normalises mouse to (0, 0) at screen center', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 960, clientY: 540 }));
    expect(manager.state.mouseX).toBeCloseTo(0, 2);
    expect(manager.state.mouseY).toBeCloseTo(0, 2);
  });

  it('normalises mouse to (-1, 1) at top-left corner', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }));
    expect(manager.state.mouseX).toBeCloseTo(-1, 2);
    expect(manager.state.mouseY).toBeCloseTo(1, 2);
  });

  it('normalises mouse to (1, -1) at bottom-right corner', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1920, clientY: 1080 }));
    expect(manager.state.mouseX).toBeCloseTo(1, 2);
    expect(manager.state.mouseY).toBeCloseTo(-1, 2);
  });

  // ── Defaults ──────────────────────────────────────────────────────────────

  it('starts with all inputs false and mouse at origin', () => {
    const s = manager.state;
    expect(s.moveForward).toBe(false);
    expect(s.moveBackward).toBe(false);
    expect(s.moveLeft).toBe(false);
    expect(s.moveRight).toBe(false);
    expect(s.run).toBe(false);
    expect(s.jump).toBe(false);
    expect(s.attack).toBe(false);
    expect(s.dodge).toBe(false);
    expect(s.interact).toBe(false);
    expect(s.meleeKey).toBe(false);
    expect(s.turnDragHeld).toBe(false);
    expect(s.mouseX).toBe(0);
    expect(s.mouseY).toBe(0);
  });
});
