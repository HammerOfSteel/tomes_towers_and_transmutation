import * as THREE from 'three';
import type { ProgressionSystem } from '@/progression/ProgressionSystem';
import type { BookReader } from './BookReader';

// ── Types ─────────────────────────────────────────────────────────────────

/** A world-positioned interactable (bookshelf or lectern) in the active room. */
export interface WorldInteractable {
  /** Stable ID for progression tracking: `"<blueprintId>__<type>__<index>"`. */
  id: string;
  /** World-space position of the entity centre (y = 0, XZ only used for range). */
  position: THREE.Vector3;
  type: string;
  content: string;
  spellUnlock?: string;
}

// ── InteractableSystem ────────────────────────────────────────────────────

const INTERACT_RANGE = 2.5; // world units (XZ distance)
const PROMPT_LABELS: Record<string, string> = {
  bookshelf:      'bookshelf',
  lectern:        'tome',
  cauldron:       'cauldron',
  telescope:      'telescope',
  forge:          'forge',
  quest_board:    'notice board',
  greenhouse_orb: 'orb',
};

/** Detects the nearest interactable within range and shows a world prompt.
 *  Call `update()` every frame, then `tryRead()` when the player presses E. */
export class InteractableSystem {
  private nearby: WorldInteractable | null = null;
  private readonly promptEl: HTMLElement;
  private readonly _tmp = new THREE.Vector3();
  private _promptOverride: string | null = null;

  /** Called instead of BookReader when a telescope is activated. */
  onTelescopeActivate: (() => void) | null = null;
  /** Called when player interacts with a cauldron or forge.
   *  Argument is 'alchemy' for cauldron, 'forge' for forge, 'enchanting' for
   *  enchanting lectern.  Return `true` to consume the event. */
  onCraftingStation: ((type: 'alchemy' | 'forge' | 'enchanting') => void) | null = null;

  constructor(
    private readonly progression: ProgressionSystem,
    private readonly bookReader: BookReader,
  ) {
    this.promptEl = this._createPrompt();
  }

  /** The interactable currently within range, if any. */
  get nearbyItem(): WorldInteractable | null { return this.nearby; }

  /** Override the normal interactable prompt with custom text.
   *  Pass `null` to restore normal proximity-based prompting. */
  overridePrompt(text: string | null): void {
    this._promptOverride = text;
    if (text !== null) {
      this.promptEl.innerHTML = `<kbd style="${KBD_STYLE}">E</kbd>&nbsp; ${text}`;
      this.promptEl.style.opacity = '1';
    } else {
      this._updatePrompt(this.nearby);
    }
  }

  /** Update proximity each frame. Pass the player world position and the
   *  interactables for the currently loaded room. */
  update(playerPos: THREE.Vector3, interactables: WorldInteractable[]): void {
    let nearest: WorldInteractable | null = null;
    let minDist = INTERACT_RANGE;

    for (const item of interactables) {
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
  tryRead(): boolean {
    if (!this.nearby || this.bookReader.isOpen) return false;
    const item = this.nearby;

    // Telescope routes to its own dedicated view instead of the BookReader
    if (item.type === 'telescope') {
      this.onTelescopeActivate?.();
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
    this.bookReader.open(
      item.content || '(blank page)',
      item.type,
      firstRead ? item.spellUnlock : undefined,
    );
    return true;
  }

  dispose(): void {
    this.promptEl.remove();
  }

  // ── Prompt DOM ────────────────────────────────────────────────────────

  private _createPrompt(): HTMLElement {
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

  private _updatePrompt(item: WorldInteractable | null): void {
    if (this._promptOverride !== null) return;  // taming / other override active
    if (!item) {
      this.promptEl.style.opacity = '0';
      return;
    }
    const label = PROMPT_LABELS[item.type] ?? item.type;
    // Verb depends on object type
    const verb = item.type === 'telescope'
      ? 'Use'
      : (['cauldron', 'forge', 'greenhouse_orb'] as string[]).includes(item.type)
        ? 'Examine'
        : this.progression.hasRead(item.id) ? 'Re-read' : 'Read';
    this.promptEl.innerHTML = `<kbd style="${KBD_STYLE}">E</kbd>&nbsp; ${verb} ${label}`;
    this.promptEl.style.opacity = '1';
  }
}

const KBD_STYLE = [
  'background:#2a2838;border:1px solid #665588;',
  'border-radius:3px;padding:1px 6px;color:#bb99ff;',
].join('');
