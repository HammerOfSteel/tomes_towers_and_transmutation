/**
 * OWMinimap — top-right corner canvas minimap for the overworld.
 *
 * Pre-renders the WorldGrid into a background canvas (biome colours, roads,
 * rivers, dungeons, settlement dots).  Every frame only the player dot is
 * redrawn on top.
 *
 * Toggle with [M].  Hidden by default inside dungeons/buildings.
 */

import type { WorldData, DungeonEntry, SettlementEntry } from '@/world/WorldData';
import type { WorldGrid }                                from '@/world/WorldGrid';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAP_PX    = 180;   // display size in CSS / canvas pixels
const MARGIN_PX = 12;    // from screen edge (right + top)

// Biome fill colours (hex strings, drawn to canvas)
const BIOME_COLOUR: Record<string, string> = {
  water:    '#192e52',
  bog:      '#3d4d26',
  grass:    '#2d5c1e',
  forest:   '#1a3d12',
  highland: '#6e5f48',
  rocky:    '#524d4a',
};

// ── OWMinimap ─────────────────────────────────────────────────────────────────

export class OWMinimap {
  private readonly _wrap:    HTMLDivElement;
  private readonly _bg:      HTMLCanvasElement;  // static terrain (redrawn on init)
  private readonly _overlay: HTMLCanvasElement;  // player + dynamic dots (every frame)
  private readonly _bgCtx:   CanvasRenderingContext2D;
  private readonly _ovCtx:   CanvasRenderingContext2D;

  private readonly _gw: number;
  private readonly _gh: number;

  /** Whether the minimap is currently visible. */
  private _visible = true;

  constructor(worldData: WorldData) {
    const { grid, settlements, dungeons } = worldData;
    this._gw = grid.width;
    this._gh = grid.height;

    // ── Wrapper div ──────────────────────────────────────────────────────────
    this._wrap = document.createElement('div');
    this._wrap.id = 'ow-minimap';
    Object.assign(this._wrap.style, {
      position:     'fixed',
      top:          `${MARGIN_PX}px`,
      right:        `${MARGIN_PX}px`,
      width:        `${MAP_PX}px`,
      height:       `${MAP_PX}px`,
      borderRadius: '4px',
      border:       '1px solid rgba(255,255,255,0.12)',
      boxShadow:    '0 2px 8px rgba(0,0,0,0.7)',
      overflow:     'hidden',
      zIndex:       '120',
      pointerEvents:'none',
      userSelect:   'none',
    } as Partial<CSSStyleDeclaration>);

    // ── Background canvas (terrain, roads, dungeons, settlements) ───────────
    this._bg = this._makeCanvas();
    this._bgCtx = this._bg.getContext('2d')!;

    // ── Overlay canvas (player dot) ─────────────────────────────────────────
    this._overlay = this._makeCanvas();
    this._ovCtx   = this._overlay.getContext('2d')!;
    this._overlay.style.position = 'absolute';
    this._overlay.style.top  = '0';
    this._overlay.style.left = '0';

    this._wrap.appendChild(this._bg);
    this._wrap.appendChild(this._overlay);
    document.body.appendChild(this._wrap);

    // ── Render static layer ─────────────────────────────────────────────────
    this._renderTerrain(grid);
    this._renderSettlements(settlements ?? []);
    this._renderDungeons(dungeons ?? []);

    // ── Keyboard toggle [M] ─────────────────────────────────────────────────
    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _makeCanvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width  = MAP_PX;
    c.height = MAP_PX;
    Object.assign(c.style, { width: `${MAP_PX}px`, height: `${MAP_PX}px`, display: 'block' });
    return c;
  }

  /** Map a grid column to canvas X (0..MAP_PX-1). */
  private _cx(col: number): number { return (col / (this._gw - 1)) * (MAP_PX - 1); }
  /** Map a grid row to canvas Y (0..MAP_PX-1). */
  private _cy(row: number): number { return (row / (this._gh - 1)) * (MAP_PX - 1); }

  private _renderTerrain(grid: WorldGrid): void {
    const ctx = this._bgCtx;
    const gw  = this._gw;
    const gh  = this._gh;
    const pw  = MAP_PX / gw;  // pixels per tile (fractional)
    const ph  = MAP_PX / gh;

    for (let row = 0; row < gh; row++) {
      for (let col = 0; col < gw; col++) {
        const cell = grid.get(col, row);
        let colour: string;

        // Feature overrides biome colour for roads and rivers
        if (cell.feature === 'road' || cell.feature === 'road_dirt') {
          colour = '#8c7050';
        } else if (cell.feature === 'river' || cell.feature === 'river_bank') {
          colour = '#2a5a9a';
        } else {
          colour = BIOME_COLOUR[cell.biome] ?? '#2d5c1e';
        }

        ctx.fillStyle = colour;
        ctx.fillRect(col * pw, row * ph, Math.ceil(pw) + 1, Math.ceil(ph) + 1);
      }
    }
  }

  private _renderSettlements(settlements: SettlementEntry[]): void {
    const ctx = this._bgCtx;
    for (const entry of settlements) {
      const { plan } = entry;
      const x = this._cx(plan.centerCol);
      const y = this._cy(plan.centerRow);

      // Filled dot + glow ring
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#cc8844';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,180,60,0.45)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }
  }

  private _renderDungeons(dungeons: DungeonEntry[]): void {
    const ctx = this._bgCtx;
    for (const d of dungeons) {
      const x = this._cx(d.col);
      const y = this._cy(d.row);

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#aa2222';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,40,40,0.4)';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }
  }

  private _onKey(e: KeyboardEvent): void {
    if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      this.toggle();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call once per frame from the overworld update loop. */
  updatePlayer(col: number, row: number): void {
    const ctx = this._ovCtx;
    ctx.clearRect(0, 0, MAP_PX, MAP_PX);

    const x = this._cx(col);
    const y = this._cy(row);

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(68,220,255,0.25)';
    ctx.fill();

    // Player dot (cyan)
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#44ddff';
    ctx.fill();
  }

  show(): void {
    this._visible = true;
    this._wrap.style.display = 'block';
  }

  hide(): void {
    this._visible = false;
    this._wrap.style.display = 'none';
  }

  toggle(): void {
    if (this._visible) this.hide(); else this.show();
  }

  isVisible(): boolean { return this._visible; }

  dispose(): void {
    window.removeEventListener('keydown', this._onKey);
    this._wrap.remove();
  }
}
