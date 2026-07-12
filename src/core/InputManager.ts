/** Snapshot of all game-relevant input at a point in time. */
export interface InputState {
  /** World-space movement axes */
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  /** Jump (Space) */
  jump: boolean;
  /** Run modifier — hold to sprint (ShiftLeft / ShiftRight) */
  run: boolean;
  /** Attack — left mouse button (wired in Phase 2) */
  attack: boolean;
  /** Dodge / dash — wired in Phase 2 */
  dodge: boolean;
  /** Interact (E) */
  interact: boolean;
  /** Mouse position normalized to [-1, 1] in both axes */
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

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code);
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

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  get state(): InputState {
    return {
      moveForward: this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp'),
      moveBackward: this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown'),
      moveLeft: this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft'),
      moveRight: this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight'),
      jump: this.heldKeys.has('Space'),
      run: this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight'),
      attack: this.heldMouseButtons.has(0),
      dodge: this.heldKeys.has('KeyF'),
      interact: this.heldKeys.has('KeyE'),
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
  }
}
