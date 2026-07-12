/** Snapshot of all game-relevant input at a point in time. */
export interface InputState {
  /** World-space movement axes: forward/back/left/right */
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  /** Actions */
  attack: boolean;
  dodge: boolean;
  interact: boolean;
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

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  get state(): InputState {
    return {
      moveForward: this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp'),
      moveBackward: this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown'),
      moveLeft: this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft'),
      moveRight: this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight'),
      attack: this.heldKeys.has('Space'),
      dodge: this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight'),
      interact: this.heldKeys.has('KeyE'),
      mouseX: this.mouseX,
      mouseY: this.mouseY,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
}
