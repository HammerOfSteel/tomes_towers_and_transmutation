/**
 * DwellingGenerator.ts — OW-D: Procedural floor plan for individual buildings.
 *
 * Generates a DwellingPlan (rooms, furniture, doors, staircases) from a
 * DwellingDNA seed. Each archetype has a distinct room layout personality.
 * The plan is rendered by drawDwellingFloorPlan() in overworld-studio.ts.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type DwellingArchetype =
  | 'house_small'   // 2-3 rooms, cosy
  | 'house_large'   // 4-5 rooms, family home
  | 'inn'           // common room + guest rooms + kitchen + stable
  | 'shop'          // storefront + back storeroom + owner quarters
  | 'forge'         // smithy floor + quench room + materials store
  | 'alchemist'     // lab + ingredient store + sleeping loft
  | 'guard_post'    // barracks room + armory + watch room
  | 'manor';        // great hall + solar + kitchen + servant quarters + cellar

export type DwellingFaction =
  | 'human' | 'elven' | 'dwarven' | 'orcish' | 'fae';

export type FurnitureKind =
  | 'bed' | 'table' | 'chair' | 'shelf' | 'barrel' | 'chest'
  | 'forge' | 'anvil' | 'cauldron' | 'bookshelf' | 'fireplace'
  | 'counter' | 'crate' | 'weapon_rack' | 'rug' | 'plant';

export type RoomKind =
  | 'main'       // living/common room
  | 'bedroom'    | 'kitchen'   | 'storage'
  | 'workshop'   | 'lab'       | 'armory'
  | 'stable'     | 'cellar'    | 'great_hall'
  | 'solar'      | 'loft'      | 'watch';

export interface DwellingFurniture {
  x: number; y: number;  // cell coords within the room's local grid
  kind: FurnitureKind;
}

export interface DwellingDoor {
  wall: 'N' | 'S' | 'E' | 'W';
  offset: number;         // cell position along the wall
  isExterior: boolean;    // true = connects to outside
  targetRoomId?: string;
}

export interface DwellingRoom {
  id:        string;
  kind:      RoomKind;
  label:     string;
  x: number; y: number;   // top-left in building grid
  w: number; h: number;   // size in cells
  floor:     number;       // 0 = ground, 1 = upper, -1 = cellar
  furniture: DwellingFurniture[];
  doors:     DwellingDoor[];
}

export interface DwellingPlan {
  seed:       number;
  archetype:  DwellingArchetype;
  faction:    DwellingFaction;
  floors:     number;          // total floor count (including ground)
  rooms:      DwellingRoom[];
  name:       string;
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function mulberry(n: number) {
  let s = (n >>> 0) + 1;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Archetype room layouts ────────────────────────────────────────────────────

type RoomSpec = { id: string; kind: RoomKind; label: string; x: number; y: number; w: number; h: number; floor: number; };

const ARCHETYPES: Record<DwellingArchetype, RoomSpec[]> = {
  house_small: [
    { id: 'living',  kind: 'main',    label: 'Living Room', x: 0, y: 0, w: 5, h: 4, floor: 0 },
    { id: 'bedroom', kind: 'bedroom', label: 'Bedroom',     x: 5, y: 0, w: 4, h: 4, floor: 0 },
    { id: 'storage', kind: 'storage', label: 'Storage',     x: 0, y: 4, w: 3, h: 3, floor: 0 },
  ],
  house_large: [
    { id: 'main',    kind: 'main',    label: 'Hall',         x: 0, y: 0, w: 6, h: 5, floor: 0 },
    { id: 'kitchen', kind: 'kitchen', label: 'Kitchen',      x: 6, y: 0, w: 4, h: 3, floor: 0 },
    { id: 'store',   kind: 'storage', label: 'Pantry',       x: 6, y: 3, w: 4, h: 2, floor: 0 },
    { id: 'bed1',    kind: 'bedroom', label: 'Master Bed',   x: 0, y: 0, w: 5, h: 4, floor: 1 },
    { id: 'bed2',    kind: 'bedroom', label: 'Bedroom',      x: 5, y: 0, w: 4, h: 4, floor: 1 },
  ],
  inn: [
    { id: 'common',  kind: 'main',    label: 'Common Room',  x: 0, y: 0, w: 8, h: 6, floor: 0 },
    { id: 'kitchen', kind: 'kitchen', label: 'Kitchen',      x: 8, y: 0, w: 4, h: 4, floor: 0 },
    { id: 'stable',  kind: 'stable',  label: 'Stable',       x: 8, y: 4, w: 4, h: 4, floor: 0 },
    { id: 'room1',   kind: 'bedroom', label: 'Guest Room 1', x: 0, y: 0, w: 4, h: 4, floor: 1 },
    { id: 'room2',   kind: 'bedroom', label: 'Guest Room 2', x: 4, y: 0, w: 4, h: 4, floor: 1 },
    { id: 'owner',   kind: 'bedroom', label: "Innkeeper's",  x: 8, y: 0, w: 4, h: 4, floor: 1 },
  ],
  shop: [
    { id: 'front',   kind: 'main',    label: 'Shop Floor',   x: 0, y: 0, w: 6, h: 5, floor: 0 },
    { id: 'stock',   kind: 'storage', label: 'Storeroom',    x: 6, y: 0, w: 4, h: 3, floor: 0 },
    { id: 'quarters',kind: 'bedroom', label: 'Quarters',     x: 0, y: 0, w: 5, h: 4, floor: 1 },
  ],
  forge: [
    { id: 'smithy',  kind: 'workshop',label: 'Smithy',       x: 0, y: 0, w: 7, h: 6, floor: 0 },
    { id: 'quench',  kind: 'workshop',label: 'Quench Room',  x: 7, y: 0, w: 4, h: 4, floor: 0 },
    { id: 'materials',kind:'storage', label: 'Materials',    x: 7, y: 4, w: 4, h: 3, floor: 0 },
    { id: 'loft',    kind: 'loft',    label: "Smith's Loft", x: 0, y: 0, w: 5, h: 4, floor: 1 },
  ],
  alchemist: [
    { id: 'lab',     kind: 'lab',     label: 'Lab',          x: 0, y: 0, w: 7, h: 6, floor: 0 },
    { id: 'ingred',  kind: 'storage', label: 'Ingredients',  x: 7, y: 0, w: 4, h: 3, floor: 0 },
    { id: 'loft',    kind: 'loft',    label: 'Sleeping Loft',x: 0, y: 0, w: 6, h: 4, floor: 1 },
  ],
  guard_post: [
    { id: 'watch',   kind: 'watch',   label: 'Watch Room',   x: 0, y: 0, w: 5, h: 4, floor: 0 },
    { id: 'barracks',kind: 'main',    label: 'Barracks',     x: 5, y: 0, w: 5, h: 4, floor: 0 },
    { id: 'armory',  kind: 'armory',  label: 'Armory',       x: 0, y: 4, w: 5, h: 3, floor: 0 },
  ],
  manor: [
    { id: 'hall',    kind: 'great_hall',label:'Great Hall',  x: 0, y: 0, w: 9, h: 7, floor: 0 },
    { id: 'kitchen', kind: 'kitchen', label: 'Kitchen',      x: 9, y: 0, w: 4, h: 4, floor: 0 },
    { id: 'servants',kind: 'main',    label: 'Servants',     x: 9, y: 4, w: 4, h: 4, floor: 0 },
    { id: 'cellar',  kind: 'cellar',  label: 'Cellar',       x: 0, y: 0, w: 7, h: 5, floor: -1 },
    { id: 'solar',   kind: 'solar',   label: 'Solar',        x: 0, y: 0, w: 6, h: 5, floor: 1 },
    { id: 'lord',    kind: 'bedroom', label: "Lord's Chamber",x: 6, y: 0, w: 6, h: 4, floor: 1 },
  ],
};

// ── Furniture pools per room kind ─────────────────────────────────────────────

const FURNITURE_POOLS: Record<RoomKind, FurnitureKind[]> = {
  main:       ['table', 'chair', 'chair', 'fireplace', 'rug', 'shelf'],
  bedroom:    ['bed', 'table', 'chest', 'shelf'],
  kitchen:    ['table', 'barrel', 'barrel', 'shelf', 'shelf', 'cauldron'],
  storage:    ['barrel', 'barrel', 'crate', 'crate', 'shelf'],
  workshop:   ['anvil', 'forge', 'barrel', 'crate', 'chest'],
  lab:        ['cauldron', 'bookshelf', 'bookshelf', 'shelf', 'table'],
  armory:     ['weapon_rack', 'weapon_rack', 'chest', 'crate'],
  stable:     ['barrel', 'crate'],
  cellar:     ['barrel', 'barrel', 'crate', 'crate', 'chest'],
  great_hall: ['table', 'table', 'chair', 'chair', 'fireplace', 'rug'],
  solar:      ['bookshelf', 'bookshelf', 'table', 'chair', 'plant'],
  loft:       ['bed', 'chest', 'shelf'],
  watch:      ['table', 'chair', 'weapon_rack'],
};

// ── Names per archetype + faction ─────────────────────────────────────────────

const ARCHETYPE_NAMES: Record<DwellingArchetype, string[]> = {
  house_small:  ['The Thatched House', 'A Modest Home', 'The Cottage'],
  house_large:  ['The Manor House', 'The Family Estate', 'Holmwood'],
  inn:          ['The Wanderer\'s Rest', 'The Lantern & Key', 'Mudwall Inn'],
  shop:         ['The Trading Post', 'Merchant\'s Corner', 'The Stall'],
  forge:        ['The Ironworks', 'Gregor\'s Forge', 'The Anvil'],
  alchemist:    ['The Apothecary', 'Miriam\'s Potions', 'The Crucible'],
  guard_post:   ['Watch Post', 'The Garrison', 'North Gate Guard'],
  manor:        ['The Manor', 'Greystone Hall', 'The Seat'],
};

// ── Generator ─────────────────────────────────────────────────────────────────

function scatterFurniture(
  room: DwellingRoom,
  rng: () => number,
): void {
  const pool = FURNITURE_POOLS[room.kind] ?? ['table'];
  const count = Math.min(pool.length, 1 + Math.floor(rng() * Math.min(pool.length, (room.w * room.h) / 4)));
  const placed = new Set<string>();

  for (let i = 0; i < count; i++) {
    const kind = pool[Math.floor(rng() * pool.length)]!;
    // Try a few positions to avoid obvious overlap
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = 1 + Math.floor(rng() * (room.w - 2));
      const y = 1 + Math.floor(rng() * (room.h - 2));
      const key = `${x},${y}`;
      if (!placed.has(key)) {
        placed.add(key);
        room.furniture.push({ x, y, kind });
        break;
      }
    }
  }
}

function addDoors(rooms: DwellingRoom[], rng: () => number): void {
  // Add one exterior door to the ground-floor "main" or first room
  const groundRooms = rooms.filter(r => r.floor === 0);
  const mainRoom = groundRooms.find(r => r.kind === 'main' || r.kind === 'great_hall' || r.kind === 'watch') ?? groundRooms[0];
  if (mainRoom) {
    mainRoom.doors.push({ wall: 'S', offset: Math.floor(mainRoom.w / 2), isExterior: true });
  }

  // Add internal doors between adjacent rooms on the same floor
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!, b = rooms[j]!;
      if (a.floor !== b.floor) continue;

      // Check adjacency: a's east edge touches b's west edge
      if (a.x + a.w === b.x && rangesOverlap(a.y, a.y + a.h, b.y, b.y + b.h)) {
        const midY = Math.floor((Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2);
        a.doors.push({ wall: 'E', offset: midY - a.y, isExterior: false, targetRoomId: b.id });
        b.doors.push({ wall: 'W', offset: midY - b.y, isExterior: false, targetRoomId: a.id });
      }
      // Check adjacency: a's south edge touches b's north edge
      if (a.y + a.h === b.y && rangesOverlap(a.x, a.x + a.w, b.x, b.x + b.w)) {
        const midX = Math.floor((Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2);
        a.doors.push({ wall: 'S', offset: midX - a.x, isExterior: false, targetRoomId: b.id });
        b.doors.push({ wall: 'N', offset: midX - b.x, isExterior: false, targetRoomId: a.id });
      }
    }
  }
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

export function generateDwelling(
  seed: number,
  archetype: DwellingArchetype = 'house_small',
  faction: DwellingFaction = 'human',
): DwellingPlan {
  const rng = mulberry(seed);
  const specs = ARCHETYPES[archetype];

  const rooms: DwellingRoom[] = specs.map(spec => ({
    ...spec,
    furniture: [],
    doors: [],
  }));

  // Scatter furniture per room
  for (const room of rooms) {
    scatterFurniture(room, rng);
  }

  // Add doors
  addDoors(rooms, rng);

  const floorSet = new Set(rooms.map(r => r.floor));
  const floors = floorSet.size;

  // Name
  const names = ARCHETYPE_NAMES[archetype];
  const name = names[Math.floor(rng() * names.length)]!;

  return { seed, archetype, faction, floors, rooms, name };
}

// ── Canvas 2D Renderer ────────────────────────────────────────────────────────

const DWELL_COLORS: Record<RoomKind, { bg: string; label: string }> = {
  main:       { bg: '#2a2215', label: '#d4b87a' },
  bedroom:    { bg: '#1a1e28', label: '#8ab4d8' },
  kitchen:    { bg: '#1e1a10', label: '#c8a050' },
  storage:    { bg: '#181818', label: '#888888' },
  workshop:   { bg: '#1a1010', label: '#e07040' },
  lab:        { bg: '#0e1820', label: '#60c8a0' },
  armory:     { bg: '#141414', label: '#909090' },
  stable:     { bg: '#1a1808', label: '#907858' },
  cellar:     { bg: '#0e0e0e', label: '#666666' },
  great_hall: { bg: '#1e1a08', label: '#e8c060' },
  solar:      { bg: '#141e10', label: '#80c870' },
  loft:       { bg: '#161220', label: '#a090c0' },
  watch:      { bg: '#141414', label: '#a0a0a0' },
};

const FURNITURE_GLYPHS: Record<FurnitureKind, string> = {
  bed:         '🛏', table:      '⬜', chair:     '🪑',
  shelf:       '📦', barrel:     '🪣', chest:     '🗃',
  forge:       '🔥', anvil:      '⚒', cauldron:  '🫕',
  bookshelf:   '📚', fireplace:  '🕯', counter:   '🪵',
  crate:       '📦', weapon_rack:'⚔', rug:        '▭',
  plant:       '🌿',
};

export function drawDwellingFloorPlan(
  plan: DwellingPlan,
  canvas: HTMLCanvasElement,
  floorFilter: number = 0,
): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, W, H);

  const rooms = plan.rooms.filter(r => r.floor === floorFilter);

  if (rooms.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`No rooms on floor ${floorFilter}`, W / 2, H / 2);
    return;
  }

  // Find bounding box
  const minX = Math.min(...rooms.map(r => r.x));
  const minY = Math.min(...rooms.map(r => r.y));
  const maxX = Math.max(...rooms.map(r => r.x + r.w));
  const maxY = Math.max(...rooms.map(r => r.y + r.h));
  const gridW = maxX - minX;
  const gridH = maxY - minY;

  const PADDING = 24;
  const cellSize = Math.floor(Math.min(
    (W - PADDING * 2) / gridW,
    (H - PADDING * 2) / gridH,
    32,
  ));
  const offX = Math.floor((W - gridW * cellSize) / 2) - minX * cellSize;
  const offY = Math.floor((H - gridH * cellSize) / 2) - minY * cellSize;

  // Draw rooms
  for (const room of rooms) {
    const px = offX + room.x * cellSize;
    const py = offY + room.y * cellSize;
    const pw = room.w * cellSize;
    const ph = room.h * cellSize;

    const colors = DWELL_COLORS[room.kind] ?? { bg: '#181818', label: '#999' };

    // Room floor fill
    ctx.fillStyle = colors.bg;
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);

    // Walls
    ctx.strokeStyle = '#c8b080';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    // Room label (top-left)
    ctx.fillStyle = colors.label;
    ctx.font = `${Math.max(8, cellSize * 0.45)}px Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.fillText(room.label, px + 4, py + Math.max(10, cellSize * 0.5));

    // Furniture
    const fSize = Math.max(8, cellSize * 0.55);
    ctx.font = `${fSize}px serif`;
    ctx.textAlign = 'center';
    for (const f of room.furniture) {
      const fx = px + (f.x + 0.5) * cellSize;
      const fy = py + (f.y + 0.9) * cellSize;
      const glyph = FURNITURE_GLYPHS[f.kind] ?? '·';
      ctx.fillText(glyph, fx, fy);
    }

    // Doors
    for (const door of room.doors) {
      const doorColor = door.isExterior ? '#f0c040' : '#a08060';
      ctx.fillStyle = doorColor;
      const dw = cellSize * 0.5;
      const dh = cellSize * 0.18;
      let dx = 0, dy = 0;
      switch (door.wall) {
        case 'N': dx = px + door.offset * cellSize + cellSize * 0.25; dy = py - dh / 2; ctx.fillRect(dx, dy, dw, dh); break;
        case 'S': dx = px + door.offset * cellSize + cellSize * 0.25; dy = py + ph - dh / 2; ctx.fillRect(dx, dy, dw, dh); break;
        case 'E': dx = px + pw - dh / 2; dy = py + door.offset * cellSize + cellSize * 0.25; ctx.fillRect(dx, dy, dh, dw); break;
        case 'W': dx = px - dh / 2; dy = py + door.offset * cellSize + cellSize * 0.25; ctx.fillRect(dx, dy, dh, dw); break;
      }
    }
  }

  // Floor label
  ctx.fillStyle = 'rgba(200,180,120,0.7)';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'left';
  const floorLabel = floorFilter === 0 ? 'Ground Floor'
                   : floorFilter < 0  ? `Cellar (B${Math.abs(floorFilter)})`
                   : `Upper Floor ${floorFilter}`;
  ctx.fillText(`${plan.name}  ·  ${floorLabel}`, 8, 16);
}
