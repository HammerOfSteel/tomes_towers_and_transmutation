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
  /** Species ability slots: Q = slot 0, R = slot 1, Z = slot 2, X = slot 3 */
  ability1: boolean;
  ability2: boolean;
  ability3: boolean;
  ability4: boolean;
  /** Mouse position normalized to [-1, 1] in both axes. */
  mouseX: number;
  mouseY: number;
}

/** Rebindable keyboard actions. Mouse buttons are not rebindable. */
export type RebindableAction =
  | 'moveForward' | 'moveBackward' | 'moveLeft' | 'moveRight'
  | 'run' | 'jump' | 'dodge' | 'interact';

/** A complete set of key codes for all rebindable actions. */
export type Bindings = Record<RebindableAction, string>;

export const DEFAULT_BINDINGS: Readonly<Record<RebindableAction, string>> = {
  moveForward:  'KeyW',
  moveBackward: 'KeyS',
  moveLeft:     'KeyA',
  moveRight:    'KeyD',
  run:          'ShiftLeft',
  jump:         'Space',
  dodge:        'KeyF',
  interact:     'KeyE',
};

const LS_BINDINGS_KEY = 'ttt_key_bindings';

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
  /** Current key bindings — overrides DEFAULT_BINDINGS where set. */
  private _bindings: Record<RebindableAction, string>;

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
    // Load persisted bindings (fall back to defaults for any missing key)
    this._bindings = { ...DEFAULT_BINDINGS };
    try {
      const saved = JSON.parse(localStorage.getItem(LS_BINDINGS_KEY) ?? '{}') as Partial<Record<RebindableAction, string>>;
      for (const [action, code] of Object.entries(saved)) {
        if (action in DEFAULT_BINDINGS && typeof code === 'string') {
          (this._bindings as Record<string, string>)[action] = code;
        }
      }
    } catch { /* ignore corrupt storage */ }

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Currently selected spell slot index (0–3). */
  get activeSlot(): number { return this._activeSlot; }

  /** Current bindings snapshot (copy). */
  get bindings(): Readonly<Record<RebindableAction, string>> {
    return { ...this._bindings };
  }

  /**
   * Rebind an action to a new key code.
   * Swaps with the action already using that code to avoid conflicts.
   */
  rebind(action: RebindableAction, code: string): void {
    // Find if another action already uses this code and swap
    for (const [a, c] of Object.entries(this._bindings) as [RebindableAction, string][]) {
      if (c === code && a !== action) {
        this._bindings[a] = this._bindings[action]; // give displaced action the old code
        break;
      }
    }
    this._bindings[action] = code;
    this._saveBindings();
  }

  /** Reset all bindings to defaults. */
  resetBindings(): void {
    this._bindings = { ...DEFAULT_BINDINGS };
    localStorage.removeItem(LS_BINDINGS_KEY);
  }

  private _saveBindings(): void {
    localStorage.setItem(LS_BINDINGS_KEY, JSON.stringify(this._bindings));
  }

  get state(): InputState {
    const b = this._bindings;
    return {
      moveForward:  this.heldKeys.has(b.moveForward)  || this.heldKeys.has('ArrowUp'),
      moveBackward: this.heldKeys.has(b.moveBackward) || this.heldKeys.has('ArrowDown'),
      moveLeft:     this.heldKeys.has(b.moveLeft)     || this.heldKeys.has('ArrowLeft'),
      moveRight:    this.heldKeys.has(b.moveRight)    || this.heldKeys.has('ArrowRight'),
      run:          this.heldKeys.has(b.run)      || this.heldKeys.has('ShiftRight'),
      jump:         this.heldKeys.has(b.jump),
      attack:       this.heldMouseButtons.has(0),
      dodge:        this.heldKeys.has(b.dodge),
      interact:     this.heldKeys.has(b.interact),
      castSpell:    this.heldMouseButtons.has(2),
      activeSlot:   this._activeSlot,
      ability1:     this.heldKeys.has('KeyQ'),
      ability2:     this.heldKeys.has('KeyR'),
      ability3:     this.heldKeys.has('KeyZ'),
      ability4:     this.heldKeys.has('KeyX'),
      mouseX:       this.mouseX,
      mouseY:       this.mouseY,
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
