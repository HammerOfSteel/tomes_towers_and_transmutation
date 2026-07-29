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
    dispatch(el, 'mousedown', { button: 0, clientX: 100, clientY: 100 });
    dispatch(el, 'mousemove', { clientX: 200, clientY: 100 });
    expect(rig.yaw).toBe(0); // never adjusted — controller inert
    expect(onTurnPlayer).not.toHaveBeenCalled();
  });

  it('attaches listeners once rig switches to wow mode', () => {
    rig.toggleMode(0);
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

  it('wheel adjusts distance while in wow mode', () => {
    rig.toggleMode(0);
    const before = rig.distance;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(rig.distance).not.toBeCloseTo(before, 5);
  });

  it('detaches listeners when switching back to isometric mode', () => {
    rig.toggleMode(0); // -> wow
    rig.toggleMode(0); // -> isometric
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
});
