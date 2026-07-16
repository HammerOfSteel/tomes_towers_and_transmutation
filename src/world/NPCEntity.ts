/**
 * NPCEntity — a living NPC in the overworld.
 *
 * Wander/idle/interact FSM.  Uses buildCreature() from the creature creator
 * pipeline so NPCs share the same visual DNA system as the player character.
 *
 * Interaction [E] at 2.5u opens an HTML dialogue panel (parchment style,
 * reuses BookReader aesthetics) with 2–3 generated dialogue lines.
 */

import * as THREE            from 'three';
import { TimeSystem }        from '@/world/TimeSystem';
import { buildCreature }     from '@/creatures/CreatureBuilder';
import type { CreatureRig }  from '@/creatures/CreatureBuilder';
import { animateCreature }   from '@/creatures/CreatureAnimator';
import { mulberry32 }        from '@/core/prng';
import type { NPCRole }      from './NPCDnaGenerator';
import { npcDna, npcName }   from './NPCDnaGenerator';
import { generateGreeting, generateQuestHint } from './NPCDialogue';
import type { DialogueContext }                 from './NPCDialogue';
import type { HistoryEvent }                    from './WorldHistory';
import type { SettlementEntry, DungeonEntry }   from './WorldData';
import { generateQuest }                        from './QuestDef';
import type { QuestDef, QuestContext }          from './QuestDef';

// ── FSM state ─────────────────────────────────────────────────────────────────

type NPCState = 'wander' | 'idle' | 'interact';

// ── Constants ─────────────────────────────────────────────────────────────────

const WANDER_SPEED      = 1.0;   // world units/s
const INTERACT_RANGE    = 2.5;   // radius for [E] prompt
const AGGRO_RANGE       = 6.0;   // NPC turns to face player within this range
const WANDER_RADIUS_WU  = 12.0;  // max wander distance from home in world units
const HOME_RADIUS_WU    = 2.5;   // tight radius at night (resting)
const WORK_RADIUS_WU    = 5.0;   // near work-spot during work hours
const IDLE_MIN          = 2.0;   // seconds
const IDLE_MAX          = 5.5;   // seconds
const IDLE_HOME_MIN     = 6.0;   // longer rest at night
const IDLE_HOME_MAX     = 14.0;  // up to 14s idle when home phase
const UPDATE_RATE_FAR   = 10;    // update every N frames beyond 80u
const FREEZE_DIST_SQ    = 150 * 150; // fully frozen beyond this

// ── Dialogue panel (shared singleton) ─────────────────────────────────────────

let _dialoguePanel: HTMLDivElement | null = null;
let _dialogueCloseKey: ((e: KeyboardEvent) => void) | null = null;

function _showDialogue(npcName: string, lines: string): void {
  _closeDialogue();

  const panel = document.createElement('div');
  panel.id = 'npc-dialogue';
  Object.assign(panel.style, {
    position:    'fixed',
    bottom:      '80px',
    left:        '50%',
    transform:   'translateX(-50%)',
    width:       '440px',
    maxWidth:    '90vw',
    padding:     '20px 24px',
    background:  'linear-gradient(160deg, #2a1e0f 0%, #1a1208 100%)',
    border:      '1px solid #5a3a1a',
    borderRadius:'4px',
    boxShadow:   '0 4px 24px rgba(0,0,0,0.85)',
    color:       '#e8d4a0',
    fontFamily:  'Georgia, serif',
    fontSize:    '14px',
    lineHeight:  '1.6',
    zIndex:      '200',
    userSelect:  'none',
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = npcName;
  Object.assign(title.style, {
    fontFamily:     'Cinzel, serif',
    fontSize:       '13px',
    letterSpacing:  '2px',
    textTransform:  'uppercase',
    color:          '#c8963c',
    marginBottom:   '10px',
    borderBottom:   '1px solid rgba(90,60,26,0.5)',
    paddingBottom:  '6px',
  } as Partial<CSSStyleDeclaration>);
  panel.appendChild(title);

  const body = document.createElement('div');
  body.textContent = lines;
  panel.appendChild(body);

  const hint = document.createElement('div');
  hint.textContent = '[E] to dismiss';
  Object.assign(hint.style, {
    marginTop:  '12px',
    fontSize:   '11px',
    color:      '#6a5a3a',
    fontFamily: 'monospace',
  } as Partial<CSSStyleDeclaration>);
  panel.appendChild(hint);

  document.body.appendChild(panel);
  _dialoguePanel = panel;

  _dialogueCloseKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' || e.code === 'Escape') _closeDialogue();
  };
  window.addEventListener('keydown', _dialogueCloseKey);
}

function _closeDialogue(): void {
  _dialoguePanel?.remove();
  _dialoguePanel = null;
  if (_dialogueCloseKey) {
    window.removeEventListener('keydown', _dialogueCloseKey);
    _dialogueCloseKey = null;
  }
}

export function isDialogueOpen(): boolean { return _dialoguePanel !== null; }

// ── NPCEntity ─────────────────────────────────────────────────────────────────

export class NPCEntity {
  readonly name: string;
  readonly role: NPCRole;

  private readonly _rig:      CreatureRig;
  private readonly _homeWx:   number;
  private readonly _homeWz:   number;
  private readonly _seed:     number;
  private readonly _ctx:      DialogueContext;
  private readonly _settlement: SettlementEntry;
  private readonly _dungeons:   DungeonEntry[];
  private readonly _nearbyEvents: HistoryEvent[];

  // FSM
  private _state:      NPCState = 'idle';
  private _target:     THREE.Vector3 | null = null;
  private _idleTimer:  number = 0;
  private _frameCount: number = 0;
  private _questGiven: boolean = false;

  /** Optional callback fired once when this NPC hands out a quest. */
  onQuestGiven?: (quest: QuestDef) => void;

  // [E] prompt label
  private _label:      HTMLDivElement | null = null;
  private _labelShown: boolean = false;

  constructor(
    col:        number,
    row:        number,
    worldX:     number,
    worldZ:     number,
    role:       NPCRole,
    settlement: SettlementEntry,
    nearbyEvents: HistoryEvent[] = [],
    nearestDungeonName?: string,
    nearestDungeonDir?:  'north' | 'south' | 'east' | 'west',
    nearestRiverDir?:    'north' | 'south' | 'east' | 'west',
    dungeons:            DungeonEntry[] = [],
  ) {
    this._seed   = (col * 73856093) ^ (row * 19349663) ^ settlement.seed;
    this._homeWx = worldX;
    this._homeWz = worldZ;
    this.role    = role;
    this.name    = npcName(this._seed);

    const rand = mulberry32(this._seed | 1);

    // Build creature rig from seeded DNA
    const dna  = npcDna(col, row, settlement.seed, role);
    this._rig  = buildCreature(dna);

    // Slight idle rotation offset so NPCs don't all face the same direction
    this._rig.root.rotation.y = rand() * Math.PI * 2;

    // Position
    this._rig.root.position.set(worldX, 0, worldZ);
    this._idleTimer = IDLE_MIN + rand() * (IDLE_MAX - IDLE_MIN);

    // Dialogue context
    this._settlement = settlement;
    this._dungeons   = dungeons;
    this._nearbyEvents = nearbyEvents;
    this._ctx = {
      npcName:            this.name,
      npcRole:            role,
      settlementName:     settlement.plan.name,
      settlementType:     settlement.plan.type,
      nearestDungeonName,
      nearestDungeonDir,
      nearestRiverDir,
      nearbyEvents,
    };
  }

  get group(): THREE.Group { return this._rig.root; }

  // ── Add / remove from scene ───────────────────────────────────────────────

  addToScene(scene: THREE.Scene): void    { scene.add(this._rig.root); }
  removeFromScene(scene: THREE.Scene): void { scene.remove(this._rig.root); }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(dt: number, playerPos: THREE.Vector3, inputE: boolean): void {
    const pos  = this._rig.root.position;
    const dx   = playerPos.x - pos.x;
    const dz   = playerPos.z - pos.z;
    const dist2 = dx * dx + dz * dz;

    // Distance culling — reduce update rate beyond 80u, freeze beyond 150u
    this._frameCount++;
    if (dist2 > FREEZE_DIST_SQ) {
      this._updateLabel(false);
      return;
    }
    const isFar = dist2 > 80 * 80;
    if (isFar && (this._frameCount % UPDATE_RATE_FAR) !== 0) return;

    // ── Interact check ────────────────────────────────────────────────────
    const inRange = dist2 < INTERACT_RANGE * INTERACT_RANGE;
    this._updateLabel(inRange && !isDialogueOpen());

    if (inRange && inputE && !isDialogueOpen()) {
      this._state = 'interact';
    }

    if (this._state === 'interact') {
      // Face player
      this._rig.root.rotation.y = Math.atan2(dx, dz);
      if (!isDialogueOpen()) {
        const greeting  = generateGreeting(this._ctx, this._seed);
        const questHint = generateQuestHint(this._ctx, this._seed ^ 0xFF);
        const lines     = questHint ? `${greeting}\n\n${questHint}` : greeting;
        _showDialogue(this.name, lines);

        // Generate and deliver a quest on first interaction (quest-giving roles only)
        if (!this._questGiven && this.onQuestGiven) {
          const qctx: QuestContext = {
            npcName:      this.name,
            npcRole:      this.role,
            settlement:   this._settlement,
            dungeons:     this._dungeons,
            nearbyEvents: this._nearbyEvents,
          };
          const quest = generateQuest(qctx, this._seed ^ 0xAB_CD_EF);
          if (quest) {
            this._questGiven = true;
            this.onQuestGiven(quest);
          }
        }
      }
      // Return to wander once player moves away
      if (dist2 > AGGRO_RANGE * AGGRO_RANGE) {
        _closeDialogue();
        this._state = 'wander';
      }
      return;
    }

    // ── Turn to face player when close ────────────────────────────────────
    if (dist2 < AGGRO_RANGE * AGGRO_RANGE) {
      this._rig.root.rotation.y = Math.atan2(dx, dz);
    }

    // ── Wander / Idle FSM ─────────────────────────────────────────────────
    if (this._state === 'idle') {
      this._idleTimer -= dt;
      if (this._idleTimer <= 0) {
        this._state = 'wander';
        this._pickWanderTarget(mulberry32(this._seed ^ (this._frameCount * 31337)));
      }
      return;
    }

    if (this._state === 'wander') {
      if (!this._target) {
        this._pickWanderTarget(mulberry32(this._seed ^ (this._frameCount * 31337)));
        return;
      }
      const tdx   = this._target.x - pos.x;
      const tdz   = this._target.z - pos.z;
      const tDist = Math.sqrt(tdx * tdx + tdz * tdz);

      if (tDist < 0.3) {
        // Reached target → idle; longer rest during home phase
        const phase = TimeSystem.instance.schedulePhase;
        const idleMin = phase === 'home' ? IDLE_HOME_MIN : IDLE_MIN;
        const idleMax = phase === 'home' ? IDLE_HOME_MAX : IDLE_MAX;
        this._target    = null;
        this._state     = 'idle';
        this._idleTimer = idleMin + (mulberry32(this._seed ^ this._frameCount)() * (idleMax - idleMin));
        return;
      }

      const speed = WANDER_SPEED * dt;
      pos.x += (tdx / tDist) * speed;
      pos.z += (tdz / tDist) * speed;
      this._rig.root.rotation.y = Math.atan2(tdx, tdz);
    }

    // ── Serpent trail locomotion + creature animation ─────────────────────
    const t = performance.now() * 0.001;
    const isMoving = this._state === 'wander' && this._target !== null;
    if (this._rig.snakeLoco) {
      // Run follow-en-trail BEFORE animateCreature so sway (+=) layers on top.
      this._rig.snakeLoco.update(this._rig.root, this._rig.bones.segments ?? []);
    }
    animateCreature(this._rig, { state: isMoving ? 'walk' : 'idle', time: t });
  }

  // ── Label ─────────────────────────────────────────────────────────────────

  private _updateLabel(show: boolean): void {
    if (show && !this._labelShown) {
      this._label = document.createElement('div');
      Object.assign(this._label.style, {
        position:   'fixed',
        padding:    '3px 8px',
        background: 'rgba(0,0,0,0.65)',
        color:      '#e8d4a0',
        fontFamily: 'monospace',
        fontSize:   '11px',
        borderRadius:'2px',
        border:     '1px solid rgba(200,150,60,0.4)',
        pointerEvents:'none',
        zIndex:     '150',
        transform:  'translate(-50%, -100%)',
      } as Partial<CSSStyleDeclaration>);
      this._label.textContent = `[E] Talk to ${this.name}`;
      document.body.appendChild(this._label);
      this._labelShown = true;
    } else if (!show && this._labelShown) {
      this._label?.remove();
      this._label      = null;
      this._labelShown = false;
    }
  }

  /** Update the screen-space position of the talk-to label. */
  updateLabelPosition(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    if (!this._label || !this._labelShown) return;
    const pos3  = this._rig.root.position.clone();
    pos3.y     += 2.2;
    const ndc   = pos3.project(camera);
    const w     = renderer.domElement.clientWidth;
    const h     = renderer.domElement.clientHeight;
    const sx    = (ndc.x * 0.5 + 0.5) * w;
    const sy    = (-ndc.y * 0.5 + 0.5) * h;
    this._label.style.left = `${sx}px`;
    this._label.style.top  = `${sy}px`;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    _closeDialogue();
    this._label?.remove();
    this._rig.dispose();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _pickWanderTarget(rand: () => number): void {
    const phase  = TimeSystem.instance.schedulePhase;
    const radius = phase === 'home' ? HOME_RADIUS_WU
                 : phase === 'work' ? WORK_RADIUS_WU
                 :                    WANDER_RADIUS_WU;
    const angle  = rand() * Math.PI * 2;
    const dist   = rand() * radius;
    this._target = new THREE.Vector3(
      this._homeWx + Math.cos(angle) * dist,
      0,
      this._homeWz + Math.sin(angle) * dist,
    );
  }
}
