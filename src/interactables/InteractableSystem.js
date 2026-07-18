import * as THREE from 'three';
// ── InteractableSystem ────────────────────────────────────────────────────
const INTERACT_RANGE = 2.5; // world units (XZ distance)
const PROMPT_LABELS = {
    bookshelf: 'bookshelf',
    lectern: 'tome',
    cauldron: 'cauldron',
    telescope: 'telescope',
    forge: 'forge',
    quest_board: 'notice board',
    greenhouse_orb: 'orb',
    barrel: 'barrel',
    crate: 'crate',
    chest: 'chest',
    workbench_key: 'master key',
    locked_door: 'locked door',
};
/** Items that are purely decorative — no interaction prompt shown. */
const NON_INTERACTIVE = new Set(['candelabra']);
/** Detects the nearest interactable within range and shows a world prompt.
 *  Call `update()` every frame, then `tryRead()` when the player presses E. */
export class InteractableSystem {
    progression;
    bookReader;
    nearby = null;
    promptEl;
    _tmp = new THREE.Vector3();
    _promptOverride = null;
    /** Called instead of BookReader when a telescope is activated. */
    onTelescopeActivate = null;
    /** Called when player interacts with a cauldron or forge.
     *  Argument is 'alchemy' for cauldron, 'forge' for forge, 'enchanting' for
     *  enchanting lectern.  Return `true` to consume the event. */
    onCraftingStation = null;
    /** Called when player interacts with a quest_board fixture. */
    onQuestBoard = null;
    /** Called when the player picks up the master key from the basement workbench. */
    onKeyPickup = null;
    constructor(progression, bookReader) {
        this.progression = progression;
        this.bookReader = bookReader;
        this.promptEl = this._createPrompt();
    }
    /** The interactable currently within range, if any. */
    get nearbyItem() { return this.nearby; }
    /** Override the normal interactable prompt with custom text.
     *  Pass `null` to restore normal proximity-based prompting. */
    overridePrompt(text) {
        this._promptOverride = text;
        if (text !== null) {
            this.promptEl.innerHTML = `<kbd style="${KBD_STYLE}">E</kbd>&nbsp; ${text}`;
            this.promptEl.style.opacity = '1';
        }
        else {
            this._updatePrompt(this.nearby);
        }
    }
    /** Update proximity each frame. Pass the player world position and the
     *  interactables for the currently loaded room. */
    update(playerPos, interactables) {
        let nearest = null;
        let minDist = INTERACT_RANGE;
        for (const item of interactables) {
            if (NON_INTERACTIVE.has(item.type))
                continue; // skip decorative items
            this._tmp.copy(item.position);
            const dx = this._tmp.x - playerPos.x;
            const dz = this._tmp.z - playerPos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < minDist) {
                minDist = dist;
                nearest = item;
            }
        }
        if (nearest !== this.nearby) {
            this.nearby = nearest;
            this._updatePrompt(nearest);
        }
    }
    /** Attempt to interact with the nearest item.
     *  @returns `true` if an interaction was triggered; `false` if nothing was nearby. */
    /** Called when player attempts to open a locked_door.
     *  The system checks the inventory for the required key; this callback is
     *  invoked with true if the door opened, false if it rattled (wrong/no key).
     *  The `content` field of the interactable specifies the required key item ID. */
    onLockedDoor = null;
    tryRead() {
        if (!this.nearby || this.bookReader.isOpen)
            return false;
        const item = this.nearby;
        // Telescope routes to its own dedicated view instead of the BookReader
        if (item.type === 'telescope') {
            this.onTelescopeActivate?.();
            return true;
        }
        // Master key — one-time pickup
        if (item.type === 'workbench_key') {
            this.onKeyPickup?.();
            return true;
        }
        // Locked door — requires a specific key item in inventory.
        // The caller's onLockedDoor handler is responsible for inventory checking.
        if (item.type === 'locked_door') {
            const requiredKey = item.content ?? 'master_key';
            this.onLockedDoor?.(item.id, requiredKey, false /* caller checks */);
            return true;
        }
        // Quest board opens the quest panel
        if (item.type === 'quest_board') {
            this.onQuestBoard?.();
            return true;
        }
        // Crafting stations open the CraftingUI panel
        if (item.type === 'cauldron') {
            this.onCraftingStation?.('alchemy');
            return true;
        }
        if (item.type === 'forge') {
            this.onCraftingStation?.('forge');
            return true;
        }
        if (item.type === 'lectern' && item.content === '__enchanting__') {
            this.onCraftingStation?.('enchanting');
            return true;
        }
        const firstRead = this.progression.markRead(item.id, item.spellUnlock);
        this.bookReader.open(item.content || '(blank page)', item.type, firstRead ? item.spellUnlock : undefined);
        return true;
    }
    dispose() {
        this.promptEl.remove();
    }
    // ── Prompt DOM ────────────────────────────────────────────────────────
    _createPrompt() {
        const el = document.createElement('div');
        el.style.cssText = [
            'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);',
            'background:rgba(10,8,18,0.88);border:1px solid #44405a;',
            'border-radius:5px;padding:7px 16px;',
            'color:#ccc;font:13px monospace;',
            'pointer-events:none;z-index:500;',
            'opacity:0;transition:opacity 0.18s;',
            'white-space:nowrap;',
        ].join('');
        document.body.appendChild(el);
        return el;
    }
    _updatePrompt(item) {
        if (this._promptOverride !== null)
            return; // taming / other override active
        if (!item) {
            this.promptEl.style.opacity = '0';
            return;
        }
        const label = PROMPT_LABELS[item.type] ?? item.type;
        // Verb depends on object type
        const verb = item.type === 'telescope' ? 'Use' :
            item.type === 'workbench_key' ? 'Take' :
                item.type === 'locked_door' ? 'Try' :
                    item.type === 'chest' ? 'Open' :
                        item.type === 'barrel' || item.type === 'crate' ? 'Search' :
                            ['cauldron', 'forge', 'greenhouse_orb'].includes(item.type) ? 'Examine' :
                                item.type === 'quest_board' ? 'Browse' :
                                    this.progression.hasRead(item.id) ? 'Re-read' : 'Read';
        this.promptEl.innerHTML = `<kbd style="${KBD_STYLE}">E</kbd>&nbsp; ${verb} ${label}`;
        this.promptEl.style.opacity = '1';
    }
}
const KBD_STYLE = [
    'background:#2a2838;border:1px solid #665588;',
    'border-radius:3px;padding:1px 6px;color:#bb99ff;',
].join('');
