/** Snapshot of all game-relevant input at a point in time. */
export interface InputState {
  /** World-space movement axes: forward/back/left/right */
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  /** Hold Shift to run */
  run: boolean;
  /** Space — jump */
  jump: boolean;
  /** Actions */
  attack: boolean;
  dodge: boolean;
  interact: boolean;
  /** Right mouse button — cast the active equipped spell */
  castSpell: boolean;
  /** Currently selected spell slot (0-3), switched by keys 1–4 */
  activeSlot: number;
  /** Mouse position normalized to [-1, 1] in both axes. */
  mouseX: number;
  mouseY: number;
}

/** Tracks keyboard and mouse state, exposing it as a stateless snapshot.
 *
 * Call dispose() when removing to clean up DOM listeners.
 */
export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly heldMouseButtons = new Set<number>();
  private mouseX = 0;
  private mouseY = 0;
  private _activeSlot = 0;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code);
    // Slot selection: 1–4 keys
    const slot = ['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);
    if (slot !== -1) this._activeSlot = slot;
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };
  private readonly onMouseMove = (e: MouseEvent): void => {
    this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  private readonly onMouseDown = (e: MouseEvent): void => {
    this.heldMouseButtons.add(e.button);
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    this.heldMouseButtons.delete(e.button);
  };
  /** Suppress browser context menu so right-click can be used in-game. */
  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Currently selected spell slot index (0–3). */
  get activeSlot(): number { return this._activeSlot; }

  get state(): InputState {
    return {
      moveForward: this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp'),
      moveBackward: this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown'),
      moveLeft: this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft'),
      moveRight: this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight'),
      run: this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight'),
      jump: this.heldKeys.has('Space'),
      attack: this.heldMouseButtons.has(0),
      dodge: this.heldKeys.has('KeyF'),
      interact: this.heldKeys.has('KeyE'),
      castSpell: this.heldMouseButtons.has(2),
      activeSlot: this._activeSlot,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
  }
}
