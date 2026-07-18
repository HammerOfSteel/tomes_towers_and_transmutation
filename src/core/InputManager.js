export const DEFAULT_BINDINGS = {
    moveForward: 'KeyW',
    moveBackward: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    run: 'ShiftLeft',
    jump: 'Space',
    dodge: 'KeyF',
    interact: 'KeyE',
};
const LS_BINDINGS_KEY = 'ttt_key_bindings';
/** Tracks keyboard and mouse state, exposing it as a stateless snapshot.
 *
 * Call dispose() when removing to clean up DOM listeners.
 */
export class InputManager {
    heldKeys = new Set();
    heldMouseButtons = new Set();
    mouseX = 0;
    mouseY = 0;
    _activeSlot = 0;
    /** Current key bindings — overrides DEFAULT_BINDINGS where set. */
    _bindings;
    onKeyDown = (e) => {
        this.heldKeys.add(e.code);
        // Slot selection: 1–4 keys
        const slot = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
        if (slot !== -1)
            this._activeSlot = slot;
    };
    onKeyUp = (e) => {
        this.heldKeys.delete(e.code);
    };
    onMouseMove = (e) => {
        this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    onMouseDown = (e) => {
        this.heldMouseButtons.add(e.button);
    };
    onMouseUp = (e) => {
        this.heldMouseButtons.delete(e.button);
    };
    /** Suppress browser context menu so right-click can be used in-game. */
    onContextMenu = (e) => {
        e.preventDefault();
    };
    constructor() {
        // Load persisted bindings (fall back to defaults for any missing key)
        this._bindings = { ...DEFAULT_BINDINGS };
        try {
            const saved = JSON.parse(localStorage.getItem(LS_BINDINGS_KEY) ?? '{}');
            for (const [action, code] of Object.entries(saved)) {
                if (action in DEFAULT_BINDINGS && typeof code === 'string') {
                    this._bindings[action] = code;
                }
            }
        }
        catch { /* ignore corrupt storage */ }
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('contextmenu', this.onContextMenu);
    }
    /** Currently selected spell slot index (0–3). */
    get activeSlot() { return this._activeSlot; }
    /** Current bindings snapshot (copy). */
    get bindings() {
        return { ...this._bindings };
    }
    /**
     * Rebind an action to a new key code.
     * Swaps with the action already using that code to avoid conflicts.
     */
    rebind(action, code) {
        // Find if another action already uses this code and swap
        for (const [a, c] of Object.entries(this._bindings)) {
            if (c === code && a !== action) {
                this._bindings[a] = this._bindings[action]; // give displaced action the old code
                break;
            }
        }
        this._bindings[action] = code;
        this._saveBindings();
    }
    /** Reset all bindings to defaults. */
    resetBindings() {
        this._bindings = { ...DEFAULT_BINDINGS };
        localStorage.removeItem(LS_BINDINGS_KEY);
    }
    _saveBindings() {
        localStorage.setItem(LS_BINDINGS_KEY, JSON.stringify(this._bindings));
    }
    get state() {
        const b = this._bindings;
        return {
            moveForward: this.heldKeys.has(b.moveForward) || this.heldKeys.has('ArrowUp'),
            moveBackward: this.heldKeys.has(b.moveBackward) || this.heldKeys.has('ArrowDown'),
            moveLeft: this.heldKeys.has(b.moveLeft) || this.heldKeys.has('ArrowLeft'),
            moveRight: this.heldKeys.has(b.moveRight) || this.heldKeys.has('ArrowRight'),
            run: this.heldKeys.has(b.run) || this.heldKeys.has('ShiftRight'),
            jump: this.heldKeys.has(b.jump),
            attack: this.heldMouseButtons.has(0),
            dodge: this.heldKeys.has(b.dodge),
            interact: this.heldKeys.has(b.interact),
            castSpell: this.heldMouseButtons.has(2),
            activeSlot: this._activeSlot,
            ability1: this.heldKeys.has('KeyQ'),
            ability2: this.heldKeys.has('KeyR'),
            ability3: this.heldKeys.has('KeyZ'),
            ability4: this.heldKeys.has('KeyX'),
            mouseX: this.mouseX,
            mouseY: this.mouseY,
        };
    }
    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('contextmenu', this.onContextMenu);
    }
}
