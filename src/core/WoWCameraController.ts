import type { CameraRig } from '@/core/CameraRig';
import { WOW_YAW_SENSITIVITY, WOW_PITCH_SENSITIVITY } from '@/core/CameraRig';

export interface WoWCameraCallbacks {
  /** Called during a left-button drag with the camera's new yaw, so the
   *  player's facing can be kept in sync (classic WoW "turn while holding
   *  left mouse" behavior). Not called during right-button (look-only) drags. */
  onTurnPlayer: (yaw: number) => void;
}

/**
 * Owns all mouse input for WoW-style camera mode: right-drag free-look,
 * left-drag orbit+turn, wheel zoom. Listeners are only attached to `target`
 * while `rig.mode === 'wow'` — fully inert (no listeners at all) in
 * isometric mode, so isometric behavior can never regress from this module
 * existing.
 *
 * Usage:
 *   const controller = new WoWCameraController(cameraRig, canvas, {
 *     onTurnPlayer: (yaw) => player.setFacingAngle(yaw),
 *   });
 *   // ... later, on teardown:
 *   controller.dispose();
 */
export class WoWCameraController {
  private _attached = false;
  private _disposed = false;
  private _draggingLeft = false;
  private _draggingRight = false;
  private _lastX = 0;
  private _lastY = 0;

  constructor(
    private readonly rig: CameraRig,
    private readonly target: HTMLElement,
    private readonly callbacks: WoWCameraCallbacks,
  ) {
    this.rig.onModeChange((mode) => {
      if (this._disposed) return;
      if (mode === 'wow') this._attach();
      else this._detach();
    });
    if (this.rig.mode === 'wow') this._attach();
  }

  private _attach(): void {
    if (this._attached) return;
    this._attached = true;
    this.target.addEventListener('mousedown', this._onMouseDown);
    this.target.addEventListener('mousemove', this._onMouseMove);
    this.target.addEventListener('mouseup', this._onMouseUp);
    this.target.addEventListener('wheel', this._onWheel, { passive: false });
    this.target.addEventListener('contextmenu', this._onContextMenu);
  }

  private _detach(): void {
    if (!this._attached) return;
    this._attached = false;
    this._draggingLeft = false;
    this._draggingRight = false;
    this.target.removeEventListener('mousedown', this._onMouseDown);
    this.target.removeEventListener('mousemove', this._onMouseMove);
    this.target.removeEventListener('mouseup', this._onMouseUp);
    this.target.removeEventListener('wheel', this._onWheel);
    this.target.removeEventListener('contextmenu', this._onContextMenu);
  }

  private readonly _onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this._draggingLeft = true;
    else if (e.button === 2) this._draggingRight = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  };

  private readonly _onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this._draggingLeft = false;
    else if (e.button === 2) this._draggingRight = false;
  };

  private readonly _onMouseMove = (e: MouseEvent): void => {
    if (!this._draggingLeft && !this._draggingRight) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;

    this.rig.adjustYaw(-dx * WOW_YAW_SENSITIVITY);
    this.rig.adjustPitch(-dy * WOW_PITCH_SENSITIVITY);

    if (this._draggingLeft) this.callbacks.onTurnPlayer(this.rig.yaw);
  };

  private readonly _onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rig.applyScroll(e.deltaY);
  };

  private readonly _onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  /** Remove all listeners regardless of current mode. Call on teardown. */
  dispose(): void {
    this._disposed = true;
    this._detach();
  }
}
