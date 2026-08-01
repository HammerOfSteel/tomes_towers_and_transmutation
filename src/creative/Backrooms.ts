/**
 * Backrooms.ts
 *
 * Registry of all Dev Backroom pocket spaces + the portal object that
 * renders in-world as a swirling void doorway.
 *
 * A backroom is an extra-dimensional test space outside the main world
 * timeline. No saves, no quests, no enemy respawns. Time frozen.
 *
 * Architecture:
 *   BackroomRegistry.all()        — list of defined rooms
 *   BackroomRegistry.get(id)      — get a single def
 *   BackroomPortal                — THREE.js object that renders the portal
 *   BackroomManager               — handles enter/exit transitions
 *
 * The BACKROOM_DOOR portal is placed at a fixed position in the tower
 * basement (B1 - The Lower Laboratory, near the south wall).
 */

import * as THREE from 'three';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackroomDef {
  id:          string;
  name:        string;
  icon:        string;
  description: string;
  /** World-space spawn point inside the backroom. */
  spawnPoint:  { x: number; y: number; z: number };
  /** Persistent — saves placed objects between visits. */
  persistent:  boolean;
  /** Ambient track ID. */
  music?:      string;
  /** The backroom's "portal color" (tint of the void effect). */
  portalColor: number;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const BACKROOM_DEFS: ReadonlyArray<BackroomDef> = [
  {
    id:          'spell_lab',
    name:        'The Spell Crafting Lab',
    icon:        '🧪',
    description: 'Test spell combinations, measure DPS on dummy targets, inspect effect durations and AoE shapes.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  false,
    music:       'ambient_lab',
    portalColor: 0x4488ff,
  },
  {
    id:          'combat_arena',
    name:        'Combat Testing Arena',
    icon:        '⚔️',
    description: 'Spawnable enemies at configurable tiers, damage output testing, AI behavior watching.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  false,
    portalColor: 0xff4444,
  },
  {
    id:          'npc_sandbox',
    name:        'NPC Sandbox',
    icon:        '🗣',
    description: 'Place any NPC, trigger dialogues, test quest flags, inspect NPC state machines.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  true,
    portalColor: 0x44ffcc,
  },
  {
    id:          'asset_showcase',
    name:        'Asset Showcase Hall',
    icon:        '🏛',
    description: 'All extracted 3D assets displayed on pedestals, grouped by kit. A live 3D version of the model viewer.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  false,
    portalColor: 0xcc88ff,
  },
  {
    id:          'biome_lab',
    name:        'Biome Lab',
    icon:        '🌿',
    description: 'Configurable overworld biome slice for testing environment assets in context.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  true,
    portalColor: 0x44bb44,
  },
  {
    id:          'dungeon_prototype',
    name:        'Dungeon Prototype Room',
    icon:        '🏚',
    description: 'Empty dungeon room with all blueprint variants — test prop placement in actual dungeon lighting.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  true,
    portalColor: 0x884400,
  },
  {
    id:          'sound_room',
    name:        'The Sound Room',
    icon:        '🔊',
    description: 'Trigger any SFX or music track, test spatial audio positioning.',
    spawnPoint:  { x: 0, y: 1.5, z: 0 },
    persistent:  false,
    portalColor: 0xffee44,
  },
  {
    id:          'building_lab',
    name:        'Building Interior Lab',
    icon:        '🏗',
    description: 'Walk through procedural building interiors as the fox princess. Tests room layouts, stair connections, collision, and NPC placement.',
    spawnPoint:  { x: 0, y: 1.5, z: 12 },
    persistent:  false,
    portalColor: 0x44cc88,
  },
];

export const BackroomRegistry = {
  all():                          ReadonlyArray<BackroomDef> { return BACKROOM_DEFS; },
  get(id: string):                BackroomDef | undefined { return BACKROOM_DEFS.find(b => b.id === id); },
  extractedOnly():                ReadonlyArray<BackroomDef> { return BACKROOM_DEFS; }, // all available
};

// ── Backroom Portal (Three.js object) ─────────────────────────────────────────
//
// Renders as a tall oval "void doorway" — a glowing ring with a swirling
// dark interior. The effect is achieved with two meshes:
//   1. An oval ring (torus) — glowing in the room's portal color
//   2. A dark oval plane inside — the "void" view
//
// The portal pulses with a sine-wave opacity animation each frame.
// Call BackroomPortal.update(dt) each game frame to animate it.

export class BackroomPortal {
  readonly group: THREE.Group;
  private _ring:  THREE.Mesh;
  private _void:  THREE.Mesh;
  private _t = 0;

  constructor(
    readonly roomId: string,
    portalColor: number,
    /** World-space position where the portal stands. */
    position: { x: number; y: number; z: number },
  ) {
    this.group = new THREE.Group();
    this.group.position.set(position.x, position.y, position.z);
    this.group.userData['backroomPortal'] = roomId;

    // Oval ring — TubeGeometry around an ellipse path
    const ellipseCurve = new THREE.EllipseCurve(0, 0, 0.7, 1.2, 0, Math.PI * 2, false, 0);
    const pts    = ellipseCurve.getSpacedPoints(48);
    const path   = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
    const ringGeo = new THREE.TubeGeometry(path, 64, 0.06, 8, true);
    this._ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: portalColor, transparent: true, opacity: 0.9 }),
    );
    this.group.add(this._ring);

    // Void interior
    const voidGeo = new THREE.CircleGeometry(0.9, 32);
    this._void = new THREE.Mesh(
      voidGeo,
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    this._void.position.z = -0.01;
    this.group.add(this._void);

    // Label above the portal
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = `#${portalColor.toString(16).padStart(6, '0')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const def = BackroomRegistry.get(roomId);
    ctx.fillText(`${def?.icon ?? ''} ${def?.name ?? roomId}`, 128, 32);
    const labelTex = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
    label.scale.set(2.5, 0.65, 1);
    label.position.y = 1.5;
    this.group.add(label);
  }

  /** Call each frame to animate the portal pulse. */
  update(dt: number): void {
    this._t += dt;
    const pulse = 0.75 + Math.sin(this._t * 2.5) * 0.15;
    (this._ring.material as THREE.MeshBasicMaterial).opacity = pulse;
    (this._void.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this._t * 1.8) * 0.1;
  }

  dispose(): void {
    this.group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite) {
        (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material as THREE.Material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat?.dispose();
      }
    });
  }
}

// ── Backroom Manager ──────────────────────────────────────────────────────────
//
// Handles entering/exiting backrooms and tracks return stack so pressing
// the return portal brings you back to where you came from.

export interface BackroomContext {
  /** Teleport the player to a world-space position. */
  teleportPlayer: (pos: { x: number; y: number; z: number }) => void;
  /** Load the backroom scene — returns a cleanup function. */
  loadScene:      (roomId: string) => Promise<() => void>;
  /** Restore the previous game scene. */
  restoreScene:   () => void;
  /** Scene for spawning return portals (optional). */
  scene?:         import('three').Scene;
}

export class BackroomManager {
  private _returnStack: Array<{ roomId: string | null; pos: { x: number; y: number; z: number } }> = [];
  private _currentCleanup: (() => void) | null = null;
  private _activePortals: BackroomPortal[] = [];

  constructor(private readonly ctx: BackroomContext) {}

  get isInBackroom(): boolean { return this._returnStack.length > 0; }
  get currentBackroomId(): string | null {
    return this._returnStack[this._returnStack.length - 1]?.roomId ?? null;
  }

  /** Spawn portal objects in the scene for each defined backroom. */
  spawnMainDoorPortals(scene: THREE.Scene, positions: Array<{ roomId: string; x: number; y: number; z: number }>): void {
    for (const p of positions) {
      const def = BackroomRegistry.get(p.roomId);
      if (!def) continue;
      const portal = new BackroomPortal(p.roomId, def.portalColor, p);
      scene.add(portal.group);
      this._activePortals.push(portal);
    }
  }

  /** Animate all active portals — call each game frame. */
  updatePortals(dt: number): void {
    for (const p of this._activePortals) p.update(dt);
  }

  /** Enter a backroom from the current player position. */
  async enterBackroom(roomId: string, fromPos: { x: number; y: number; z: number }): Promise<void> {
    const def = BackroomRegistry.get(roomId);
    if (!def) { console.warn(`[Backrooms] Unknown room: ${roomId}`); return; }

    this._returnStack.push({ roomId, pos: fromPos });
    this._currentCleanup = await this.ctx.loadScene(roomId);
    this.ctx.teleportPlayer(def.spawnPoint);

    // Load persisted objects if the backroom is persistent
    if (def.persistent) {
      await this._loadPersistedBackroom(roomId);
    }

    // Spawn a return portal at the entry point (slightly behind the spawn)
    const returnPos = { x: def.spawnPoint.x, y: def.spawnPoint.y, z: def.spawnPoint.z + 3 };
    const returnPortal = new BackroomPortal(`return_${roomId}`, 0xccaaff, returnPos);
    returnPortal.group.userData['returnPortal'] = true;
    returnPortal.group.userData['onEnter'] = () => this.exitBackroom();
    this.ctx.scene?.add(returnPortal.group);
    this._activePortals.push(returnPortal);
  }

  /** Return to the previous location (use the return portal). */
  exitBackroom(): void {
    // Persist placed objects if the backroom is marked persistent
    const roomId = this.currentBackroomId;
    if (roomId) {
      const def = BackroomRegistry.get(roomId);
      if (def?.persistent) {
        this._persistBackroom(roomId);
      }
    }
    this._currentCleanup?.();
    this._currentCleanup = null;
    const prev = this._returnStack.pop();
    if (prev) {
      this.ctx.restoreScene();
      if (prev.pos) this.ctx.teleportPlayer(prev.pos);
    }
  }

  /** Save the current scene's placed objects for a persistent backroom. */
  private _persistBackroom(roomId: string): void {
    const key = `ttt_backroom_persist_${roomId}`;
    // Collect all creativeObject userData groups from the scene
    const objects: Array<{ path: string; x: number; y: number; z: number; ry: number; scale: number }> = [];
    this.ctx.scene?.traverse(obj => {
      if (obj.userData['creativeObject'] && obj.userData['path']) {
        objects.push({
          path:  obj.userData['path'] as string,
          x: obj.position.x, y: obj.position.y, z: obj.position.z,
          ry: obj.rotation.y,
          scale: obj.scale.x,
        });
      }
    });
    try { localStorage.setItem(key, JSON.stringify(objects)); } catch { /* quota */ }
  }

  /** Load persisted objects back into the scene when entering a persistent backroom. */
  private async _loadPersistedBackroom(roomId: string): Promise<void> {
    const key = `ttt_backroom_persist_${roomId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const objects = JSON.parse(raw) as Array<{ path: string; x: number; y: number; z: number; ry: number; scale: number }>;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      for (const o of objects) {
        loader.loadAsync(o.path).then(gltf => {
          const root = gltf.scene;
          root.position.set(o.x, o.y, o.z);
          root.rotation.y = o.ry;
          root.scale.setScalar(o.scale);
          root.userData['creativeObject'] = true;
          root.userData['path'] = o.path;
          this.ctx.scene?.add(root);
        }).catch(() => {});
      }
    } catch { /* ignore corrupt data */ }
  }

  dispose(): void {
    for (const p of this._activePortals) p.dispose();
    this._activePortals = [];
  }
}

// ── Tower basement portal positions (where the "Backroom Door" spawns in B1) ──
//
// These are placed near the south wall of the basement chamber.
// Each room gets its own small portal in a row.

export const BASEMENT_PORTAL_POSITIONS = BACKROOM_DEFS.map((def, i) => ({
  roomId: def.id,
  x: (i - Math.floor(BACKROOM_DEFS.length / 2)) * 2.5,
  y: 0,
  z: -8,   // south wall of the basement chamber (z = -R×CELL = -14, back a bit)
}));
