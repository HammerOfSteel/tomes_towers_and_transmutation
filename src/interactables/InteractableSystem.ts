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
  bookshelf: 'bookshelf',
  lectern:   'tome',
};

/** Detects the nearest interactable within range and shows a world prompt.
 *  Call `update()` every frame, then `tryRead()` when the player presses E. */
export class InteractableSystem {
  private nearby: WorldInteractable | null = null;
  private readonly promptEl: HTMLElement;
  private readonly _tmp = new THREE.Vector3();

  constructor(
    private readonly progression: ProgressionSystem,
    private readonly bookReader: BookReader,
  ) {
    this.promptEl = this._createPrompt();
  }

  /** The interactable currently within range, if any. */
  get nearbyItem(): WorldInteractable | null { return this.nearby; }

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

  /** Attempt to read the nearby interactable.
   *  @returns `true` if the BookReader was opened; `false` if nothing was nearby. */
  tryRead(): boolean {
    if (!this.nearby || this.bookReader.isOpen) return false;
    const item = this.nearby;
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
    if (!item) {
      this.promptEl.style.opacity = '0';
      return;
    }
    const label = PROMPT_LABELS[item.type] ?? item.type;
    const alreadyRead = this.progression.hasRead(item.id);
    const verb = alreadyRead ? 'Re-read' : 'Read';
    this.promptEl.innerHTML = `<kbd style="${KBD_STYLE}">E</kbd>&nbsp; ${verb} ${label}`;
    this.promptEl.style.opacity = '1';
  }
}

const KBD_STYLE = [
  'background:#2a2838;border:1px solid #665588;',
  'border-radius:3px;padding:1px 6px;color:#bb99ff;',
].join('');
