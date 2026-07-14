// ── Tower Floor Definitions ───────────────────────────────────────────────────
//
//  Static data describing each of the 11 tower levels (B=basement, F0–F9).
//  The TowerGenerator consumes these to produce deterministic per-floor blueprints.

import type { FloorType, InteractableType } from './blueprint';

export interface FixtureDef {
  type: InteractableType;
  content: string;
  spellUnlock?: string;
}

export interface TowerFloorDef {
  /** Stable ID — used as part of blueprint IDs (no spaces). */
  id: string;
  /** Basement = -1, ground floor = 0, upper floors 1–9. */
  floorIndex: number;
  /** Human-readable name shown in the HUD. */
  name: string;
  /** Radius of the circular main hall in cells (default 7 → 17×17 cell grid). */
  chamberRadius: number;
  /** Floor material for both chamber and side rooms. */
  floorType: FloorType;
  /** Key interactable placed at the chamber centre. */
  keyFixture: FixtureDef;
  /** Min/max number of side rooms attached (seeded). [0,0] = no side rooms. */
  sideRoomCount: readonly [number, number];
  /** Slimes spawned inside each side room on first visit (0 = safe room). */
  enemiesPerRoom: number;
  /** Interactable types to scatter in side rooms. */
  sideRoomProps: readonly InteractableType[];
  // ── Optional decor flags ─────────────────────────────────────────────────
  /** Override wall height (world units). Default WALL_H = 3.5. Low values → parapet feel. */
  wallHeight?: number;
  /** Adds an evenly-spaced ring of 8 stone pillars at radius ~5 inside the chamber. */
  chamberPillars?: boolean;
  /** Adds 4 bookshelves pressed against the N/E/S/W walls of the chamber. */
  chamberBookshelves?: boolean;
  /**
   * If set, a door at this DOOR_SLOTS index is added with targetId=null, which
   * fires onExitTrigger when entered → returns the player to the overworld.
   * The slot must NOT be used for a side room (ensure sideRoomCount max ≤ this index).
   * Index 0=NE-east, 1=SE-east, 2=NW-west, 3=SW-west.
   */
  exteriorExitSlot?: number;
}

export const TOWER_FLOOR_DEFS: readonly TowerFloorDef[] = [
  // ── Basement — Alchemical Workshop ──────────────────────────────────────────
  {
    id: 'floor_alchemy',
    floorIndex: -1,
    name: 'The Lower Laboratory',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'cauldron',
      content:
        'The primary distillation rig hisses with quiet confidence. A rack of ' +
        'unlabelled vials sits nearby — each stopper sealed with a different colour of wax. ' +
        'One of them is definitely not water. One of the others might be.',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 2,
    sideRoomProps: ['bookshelf', 'lectern'],
  },

  // ── Floor 0 — Grand Entrance Hall ───────────────────────────────────────────
  {
    id: 'floor_foyer',
    floorIndex: 0,
    name: 'The Grand Entrance Hall',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'quest_board',
      content:
        'A board covered in notices, timetables, and what appears to be a ' +
        'seating chart for a banquet that occurred nineteen years ago. ' +
        'The wizard was still cross about table seven.',
    },
    sideRoomCount: [2, 2],
    enemiesPerRoom: 1,
    sideRoomProps: ['bookshelf'],
    chamberPillars: true,
    // NW door slot (index 2, west-facing) leads back to the overworld
    exteriorExitSlot: 2,
  },

  // ── Floor 1 — The Reading Galleries ────────────────────────────────────────
  {
    id: 'floor_library',
    floorIndex: 1,
    name: 'The Reading Galleries',
    chamberRadius: 7,
    floorType: 'wood',
    keyFixture: {
      type: 'lectern',
      content:
        '"A Comprehensive Survey of Transcendence, and Other Matters Beneath My Concern"\n\n' +
        'The margin note on page one reads: "For personal edification only. ' +
        'If found by anyone else: the author is considerably smarter than you, and this remains ' +
        'true even if you are reading this in the future when I am gone, ' +
        'which you are, and I was."',
      spellUnlock: 'flame_dart',
    },
    sideRoomCount: [3, 4],
    enemiesPerRoom: 2,
    sideRoomProps: ['bookshelf', 'lectern'],
    chamberPillars: true,
    chamberBookshelves: true,
  },

  // ── Floor 2 — The Fermentation Level ────────────────────────────────────────
  {
    id: 'floor_brewing',
    floorIndex: 2,
    name: 'The Fermentation Level',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'cauldron',
      content:
        'The cauldron is enormous — large enough to comfortably bathe in. ' +
        'Not that anyone would. A placard on the side reads: ' +
        '"OPTIMISED WORKFLOW — DO NOT TOUCH. I mean it this time. ' +
        'This is my third placard."',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 2,
    sideRoomProps: ['bookshelf'],
  },

  // ── Floor 3 — The Wizard's Chambers (player start) ───────────────────────────
  {
    id: 'floor_quarters',
    floorIndex: 3,
    name: "The Wizard's Chambers",
    chamberRadius: 7,
    floorType: 'wood',
    keyFixture: {
      type: 'lectern',
      content:
        'A leather diary, left open.\n\n' +
        '"Note to self — the captive appears to have learned rudimentary levitation. ' +
        'Possibly self-taught. Possibly the books. Monitor the situation. ' +
        'Probably fine."\n\n' +
        '[later entry]\n\n' +
        '"The captive has now re-shelved the entire library by subject. ' +
        'They appear to be working through the restricted section. ' +
        'Still probably fine."',
    },
    sideRoomCount: [3, 4],
    enemiesPerRoom: 0,
    sideRoomProps: ['bookshelf', 'lectern'],
    chamberBookshelves: true,
  },

  // ── Floor 4 — The Runic Forge ────────────────────────────────────────────────
  {
    id: 'floor_smithy',
    floorIndex: 4,
    name: 'The Runic Forge',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'forge',
      content:
        'A cold runic forge. The enchantment matrix etched into the anvil surface ' +
        'still glows amber — the magic outlasting the wizard by some margin. ' +
        'A handwritten tag hangs from the bellows: ' +
        '"Enchants stack — theoretically. Results varied — experimentally."',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 3,
    sideRoomProps: ['bookshelf'],
    chamberPillars: true,
  },

  // ── Floor 5 — The Minion Barracks ────────────────────────────────────────────
  {
    id: 'floor_menagerie',
    floorIndex: 5,
    name: 'The Minion Barracks',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'quest_board',
      content:
        'A duty rota in six different handwriting styles, most of which are suspiciously ' +
        'similar for entities without hands.\n\n' +
        'At the bottom, in careful lettering: "FORMAL COMPLAINT RE: BUNK ASSIGNMENTS ' +
        '— This is the fourth complaint. We have been here for all four complaints. ' +
        'We remain unhappy.\n\n— The Slimes (collective)"',
    },
    sideRoomCount: [3, 4],
    enemiesPerRoom: 3,
    sideRoomProps: ['bookshelf'],
  },

  // ── Floor 6 — The War Room ───────────────────────────────────────────────────
  {
    id: 'floor_trophies',
    floorIndex: 6,
    name: 'The War Room',
    chamberRadius: 7,
    floorType: 'wood',
    keyFixture: {
      type: 'quest_board',
      content:
        'A great campaign map table, inlaid with brass markers and regimental pins. ' +
        'Every territory in a hundred-league radius has been marked and annotated. ' +
        'Over it all, in red ink applied with considerable confidence: ' +
        '"MINE (all of it)". The note is dated. It was optimistic.',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 4,
    sideRoomProps: ['lectern', 'bookshelf'],
    chamberPillars: true,
  },

  // ── Floor 7 — The Botanical Laboratory ──────────────────────────────────────
  {
    id: 'floor_garden',
    floorIndex: 7,
    name: 'The Botanical Laboratory',
    chamberRadius: 7,
    floorType: 'grass',
    keyFixture: {
      type: 'greenhouse_orb',
      content:
        'A hovering grow-light orb, still faithfully sustaining a chamber of experimental ' +
        'flora long after its creator departed. The plants have opinions about visitors. ' +
        'Several of them have eyes. All of the eyes follow you. ' +
        'One of the plants appears to be writing notes.',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 3,
    sideRoomProps: ['bookshelf'],
  },

  // ── Floor 8 — The Forbidden Archive ─────────────────────────────────────────
  {
    id: 'floor_archive',
    floorIndex: 8,
    name: 'The Forbidden Archive',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'lectern',
      content:
        'A warded cabinet. The suppression seals are still active, which is either ' +
        'reassuring or alarming, depending on what is inside.\n\n' +
        'A laminated notice reads: "ABSOLUTELY DO NOT OPEN — ' +
        'this means you, Hendricks."\n\n' +
        'You are not Hendricks.\n\n' +
        'You open it.',
      spellUnlock: 'nova_burst',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 4,
    sideRoomProps: ['bookshelf', 'lectern'],
    chamberBookshelves: true,
  },

  // ── Floor 9 — The Celestial Observatory ─────────────────────────────────────
  {
    id: 'floor_observatory',
    floorIndex: 9,
    name: 'The Celestial Observatory',
    chamberRadius: 7,
    floorType: 'stone',
    keyFixture: {
      type: 'telescope',
      content:
        'A precision brass telescope on a rotating pivot mount. ' +
        'The surrounding lands are visible through the eyepiece — forests, ruins, ' +
        'the distant smear of what passes for civilisation. ' +
        'Somewhere out there, someone is almost certainly having a worse day.',
    },
    sideRoomCount: [0, 0],       // rooftop — no side rooms
    enemiesPerRoom: 0,
    sideRoomProps: [],
    wallHeight: 1.2,             // low circular parapet
    chamberPillars: false,
  },
];

/** Player spawns on this floor at game start. */
export const PLAYER_START_FLOOR_INDEX = 3; // Living Quarters

/** Get a floor definition by its floorIndex (-1..9). */
export function getFloorDef(floorIndex: number): TowerFloorDef | undefined {
  return TOWER_FLOOR_DEFS.find((d) => d.floorIndex === floorIndex);
}

/** Ordered list from basement (-1) to rooftop (9). */
export const FLOORS_ORDERED = [...TOWER_FLOOR_DEFS].sort(
  (a, b) => a.floorIndex - b.floorIndex,
);
