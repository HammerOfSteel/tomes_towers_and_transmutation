import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputManager } from '@/core/InputManager';
describe('InputManager', () => {
    let manager;
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
        expect(s.mouseX).toBe(0);
        expect(s.mouseY).toBe(0);
    });
});
