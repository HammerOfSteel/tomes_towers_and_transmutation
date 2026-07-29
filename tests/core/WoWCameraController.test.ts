import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CameraRig } from '@/core/CameraRig';
import { WoWCameraController } from '@/core/WoWCameraController';

describe('WoWCameraController', () => {
  let rig: CameraRig;
  let el: HTMLElement;
  let onTurnPlayer: ReturnType<typeof vi.fn>;
  let controller: WoWCameraController;

  beforeEach(() => {
    rig = new CameraRig(16 / 9);
    el = document.createElement('canvas');
    document.body.appendChild(el);
    onTurnPlayer = vi.fn();
    controller = new WoWCameraController(rig, el, { onTurnPlayer });
  });

  afterEach(() => {
    controller.dispose();
    el.remove();
  });

  function dispatch(el: HTMLElement, type: string, init: MouseEventInit = {}): void {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  }

  it('does not attach listeners while rig is in isometric mode (no drag effect)', () => {
    // DOM-level: spy must be in place before the controller is constructed
    const localEl = document.createElement('canvas');
    const addSpy = vi.spyOn(localEl, 'addEventListener');
    const localController = new WoWCameraController(rig, localEl, { onTurnPlayer });
    expect(addSpy).not.toHaveBeenCalled(); // no listeners attached at construction in isometric

    // Behavioral check: dispatching events has no effect
    dispatch(localEl, 'mousedown', { button: 0, clientX: 100, clientY: 100 });
    dispatch(localEl, 'mousemove', { clientX: 200, clientY: 100 });
    expect(rig.yaw).toBe(0); // never adjusted — controller inert
    expect(onTurnPlayer).not.toHaveBeenCalled();

    localController.dispose();
  });

  it('attaches listeners once rig switches to wow mode', () => {
    const addSpy = vi.spyOn(el, 'addEventListener');
    rig.toggleMode(0);

    // DOM-level: all five listeners must be registered on the element
    expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith('contextmenu', expect.any(Function));

    // Behavioral check: drag works
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 150, clientY: 100 });
    expect(rig.yaw).not.toBe(0);
  });

  it('right-drag adjusts yaw/pitch but does not call onTurnPlayer (look-only)', () => {
    rig.toggleMode(0);
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 150, clientY: 130 });
    expect(rig.yaw).not.toBe(0);
    expect(onTurnPlayer).not.toHaveBeenCalled();
  });

  it('left-drag adjusts yaw/pitch and calls onTurnPlayer with the new yaw', () => {
    rig.toggleMode(0);
    dispatch(el, 'mousedown', { button: 0, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 150, clientY: 100 });
    expect(onTurnPlayer).toHaveBeenCalledWith(rig.yaw);
  });

  it('camera holds position after mouseup — no snap-back', () => {
    rig.toggleMode(0);
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 150, clientY: 100 });
    const yawAfterDrag = rig.yaw;
    dispatch(el, 'mouseup', { button: 2, clientX: 150, clientY: 100 });
    expect(rig.yaw).toBeCloseTo(yawAfterDrag, 6);
  });

  it('mouse movement without a held button does not change yaw', () => {
    rig.toggleMode(0);
    dispatch(el, 'mousemove', { clientX: 500, clientY: 500 });
    expect(rig.yaw).toBe(0);
  });

  it('wheel adjusts frustum zoom (not distance) while in wow mode', () => {
    rig.toggleMode(0);
    const distBefore = rig.distance;
    const frustumBefore = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    const frustumAfter = (rig as unknown as { _targetFrustumHeight: number })['_targetFrustumHeight'];
    expect(frustumAfter).not.toBeCloseTo(frustumBefore, 5);
    // Orbit distance is no longer the WoW zoom mechanism (see CameraRig.applyScroll).
    expect(rig.distance).toBeCloseTo(distBefore, 5);
  });

  it('detaches listeners when switching back to isometric mode', () => {
    rig.toggleMode(0); // -> wow (listeners attach)
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    rig.toggleMode(0); // -> isometric (listeners detach)

    // DOM-level: all five listeners must be removed from the element
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('contextmenu', expect.any(Function));

    // Behavioral check: drag has no effect
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 200, clientY: 100 });
    expect(rig.yaw).toBe(0); // unaffected — listeners were removed
  });

  it('dispose() removes all listeners even in wow mode', () => {
    rig.toggleMode(0);
    controller.dispose();
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 200, clientY: 100 });
    expect(rig.yaw).toBe(0);
  });

  it('dispose() prevents listener re-attachment when rig later enters wow mode', () => {
    // Dispose before ever entering wow mode
    controller.dispose();

    const addSpy = vi.spyOn(el, 'addEventListener');
    rig.toggleMode(0); // -> wow: onModeChange callback fires but _disposed guard blocks _attach()

    // DOM-level: addEventListener must not have been called
    expect(addSpy).not.toHaveBeenCalled();

    // Behavioral: drag has no effect (rig.yaw resets to 0 via toggleMode, stays 0)
    dispatch(el, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 200, clientY: 100 });
    expect(rig.yaw).toBe(0);
  });
});
