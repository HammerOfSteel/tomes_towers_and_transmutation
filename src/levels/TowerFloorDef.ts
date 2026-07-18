// ── Tower Floor Definitions ───────────────────────────────────────────────────
//
//  Static data describing each of the 11 tower levels (B=basement, F0–F9).
//  The TowerGenerator consumes these to produce deterministic per-floor blueprints.

import type { FloorType, InteractableType, Rotation } from './blueprint';
import type { RoomEncounterDef } from './RoomEncounterDef';
import {
  ENCOUNTER_POOL_F1, ENCOUNTER_POOL_F2,
  ENCOUNTER_POOL_F4, ENCOUNTER_POOL_F5, ENCOUNTER_POOL_F6,
  ENCOUNTER_POOL_F7, ENCOUNTER_POOL_F8, ENCOUNTER_POOL_F9,
} from './RoomEncounterDef';

export interface FixtureDef {
  type: InteractableType;
  content: string;
  spellUnlock?: string;
}

export interface ScatterEntry {
  type: InteractableType;
  x: number;
  z: number;
  rotation?: Rotation;
  /** Short text shown when the player examines this item. Omit for decorative-only items. */
  content?: string;
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
   * Optional flavour text for the 4 ring bookshelves, in BOOKSHELF_RING order:
   * [East, West, NE, SW]. Omit to leave shelves without examine text.
   */
  chamberBookshelfContent?: readonly [string, string, string, string];
  /** Adds 4 candelabras at mid-radius cardinal positions inside the chamber. */
  chamberCandelabras?: boolean;
  /**
   * If set, a door at this DOOR_SLOTS index is added with targetId=null, which
   * fires onExitTrigger when entered → returns the player to the overworld.
   * The slot must NOT be used for a side room (ensure sideRoomCount max ≤ this index).
   * Index 0=NE-east, 1=SE-east, 2=NW-west, 3=SW-west.
   */
  exteriorExitSlot?: number;
  /**
   * Optional second interactable placed in the chamber at a fixed secondary
   * position (east of centre).  Use for narrative props that must be in the
   * main hall rather than a side room (e.g. the library telescope).
   */
  chamberExtraFixture?: FixtureDef;
  /**
   * Explicit scatter items placed at fixed grid positions in the main chamber.
   * Use for barrels, crates, chests, and narrative key items.
   */
  chamberScatter?: readonly ScatterEntry[];
  /**
   * Designed room encounters for this floor's side rooms (Phase B3).
   * When present, SceneManager selects one entry (seeded by room ID) and
   * spawns the specified enemies instead of the generic `enemiesPerRoom` count.
   * Floors without a pool fall back to the existing slime-count logic.
   */
  encounterPool?: readonly RoomEncounterDef[];
}

export const TOWER_FLOOR_DEFS: readonly TowerFloorDef[] = [
  // ── Basement — Alchemical Workshop ──────────────────────────────────────────
  {
    id: 'floor_alchemy',
    floorIndex: -1,
    name: 'The Lower Laboratory',
    chamberRadius: 7,
    floorType: 'stone_alchemy',
    keyFixture: {
      type: 'cauldron',
      content:
        'The primary distillation rig hisses with quiet confidence. A rack of ' +
        'unlabelled vials sits nearby — each stopper sealed with a different colour of wax. ' +
        'One of them is definitely not water. One of the others might be.',
    },
    sideRoomCount: [2, 3],
    enemiesPerRoom: 2,
    sideRoomProps: ['barrel', 'crate', 'bookshelf', 'lectern'],
    chamberCandelabras: true,
    chamberExtraFixture: {
      type: 'lectern',
      content:
        'A reading stand holds a leather binder, tabbed and indexed in a precise hand.\n\n' +
        'The cover reads: "CANDIDATE ARCHIVE — ACTIVE INTAKE". Your name — or rather, ' +
        'a precise physical and behavioural description that is unmistakably you — ' +
        'is on the first page.\n\n' +
        'The file is thorough. He has been watching for some time.\n\n' +
        'A folded note is tucked into the back cover:\n\n' +
        '"If you are reading this, I underestimated you considerably. ' +
        'The spare master key is on the central workbench. Take it. ' +
        'I will explain everything when I return.\n\n' +
        '— S."',
    },
    chamberScatter: [
      // The central workbench — the master key rests here
      {
        type: 'workbench_key',
        x: 8, z: 5,
        content: 'A heavy iron key sits on the workbench, glowing faintly with a binding ward.\n\nThis is the master key to the tower\'s front door.',
      },
      // Reagent barrels against the west wall
      { type: 'barrel', x: 3, z: 7,
        content: 'A sealed reagent barrel. The label reads: "VOLATILE — store upright, open carefully, do not breathe directly, avoid moonlight, ESPECIALLY avoid moonlight."' },
      { type: 'barrel', x: 3, z: 9,
        content: 'A barrel marked with three crossed wands and the number \'47\'. You decide not to ask what happened to barrels 1 through 46.' },
      // Crates against the east wall
      { type: 'crate', x: 13, z: 7,
        content: 'A reinforced crate of alchemical supplies. It hums slightly. You decide not to investigate further.' },
      { type: 'crate', x: 13, z: 9,
        content: 'Packed with straw and sealed with wax. The packing list inside reads only: "fragile, important, mine."' },
      // Potion racks on the north wall flanks
      { type: 'potion_rack', x: 4,  z: 3, rotation: 0   as const,
        content: 'A rack of labelled potions. Most labels say things like "DO NOT DRINK" and "EXTREMELY DO NOT DRINK".' },
      { type: 'potion_rack', x: 12, z: 3, rotation: 0   as const,
        content: 'More potions. One of them glows faintly. Another one seems to be watching you.' },
      // Distillation coil near the central workbench area
      { type: 'distillation_coil', x: 10, z: 6 },
      // Alchemical circle rug under the central cauldron
      { type: 'rug', x: 8, z: 8 },
    ],
  },

  // ── Floor 0 — Grand Entrance Hall ───────────────────────────────────────────
  {
    id: 'floor_foyer',
    floorIndex: 0,
    name: 'The Grand Entrance Hall',
    chamberRadius: 7,
    floorType: 'stone_herald',
    keyFixture: {
      type: 'quest_board',
      content:
        'A board covered in notices, timetables, and what appears to be a ' +
        'seating chart for a banquet that occurred nineteen years ago. ' +
        'The wizard was still cross about table seven.',
    },
    sideRoomCount: [2, 2],
    enemiesPerRoom: 1,
    sideRoomProps: ['barrel', 'crate', 'chest', 'bookshelf'],
    chamberPillars: true,
    chamberCandelabras: true,
    // NW door slot (index 2, west-facing) leads back to the overworld
    exteriorExitSlot: 2,
    chamberScatter: [
      // Supply barrels near the NE pillar cluster
      { type: 'barrel', x: 13, z: 6,
        content: 'A barrel stencilled "TOWER STORES — NON-EDIBLE (MOST)". Someone has added "probably" in smaller lettering beneath.' },
      { type: 'barrel', x: 12, z: 12,
        content: 'A sealed barrel of something that smells faintly of copper and overconfidence.' },
      // Supply crates near the SW area
      { type: 'crate', x: 3, z: 6,
        content: 'A shipping crate. The customs form reads: "Contents: research materials of uncertain legal status. Declaration signed under protest."' },
      { type: 'crate', x: 4, z: 11,
        content: 'A heavy crate. You cannot lift the lid. The contents rattle in a pattern that suggests intent.' },
      // A locked chest near the south wall
      { type: 'chest', x: 8, z: 13,
        content: 'A locked iron-banded chest. The keyhole has been welded shut from the outside, which seems to defeat the purpose.' },
      // Grand entrance rug at centre
      { type: 'rug', x: 8, z: 8 },
      // Decorative wall banners — north and south walls
      { type: 'banner', x: 8, z: 2,  rotation: 180 as const },
      { type: 'banner', x: 8, z: 14, rotation: 0   as const },
    ],
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
    sideRoomProps: ['bookshelf', 'lectern', 'candelabra', 'chest'],
    chamberPillars: true,
    chamberBookshelves: true,
    chamberBookshelfContent: [
      // East shelf
      'A shelf of alphabetised magical compendiums. Vols. 1 and 2 are missing. Vols. 3–7 have been annotated in three different handwriting styles, none of which is your host\'s.',
      // West shelf
      'Herbalism, transmutation theory, and one volume titled \'Species of Dubious Sapience: An Ongoing Inquiry\' — heavily bookmarked.',
      // NE shelf
      "A shelf of historical texts. Many are stamped 'PROPERTY OF THE GRAND COLLEGE — LONG TERM LOAN'. The loan date was forty-six years ago.",
      // SW shelf
      "Popular titles: 'Transcendence Made Simple', 'Transcendence Made Moderately Difficult', and 'Transcendence: Perhaps Not For Everyone'.",
    ],
    chamberCandelabras: true,
    chamberExtraFixture: {
      type: 'telescope',
      content:
        'A note is pinned to the eyepiece with a wax seal.\n\n' +
        '"Do not go to the basement.\n\n' +
        'I am asking you politely, which is unusual for me. The basement is ' +
        'not a place for guests. It has never been a place for guests. ' +
        'If you are reading this, you have already done considerably more ' +
        'exploring than I intended.\n\n' +
        'Put the note down. Go back to your room. The view from this window ' +
        'is very nice. Focus on that.\n\n' +
        '— Arcanist Solmor"',
    },    chamberScatter: [
      // Reading tables with chairs (NW and SE quadrant, away from telescope)
      { type: 'reading_table', x: 5, z: 5, rotation: 90 as const },
      { type: 'reading_table', x: 11, z: 11, rotation: 270 as const },
      // Decorative globe near west wall
      { type: 'globe', x: 4, z: 10 },
      // Rugs under each reading table
      { type: 'rug', x: 5, z: 5 },
    ],
    encounterPool: ENCOUNTER_POOL_F1,
  },

  // ── Floor 2 — The Fermentation Level ────────────────────────────────────────
  {
    id: 'floor_brewing',
    floorIndex: 2,
    name: 'The Fermentation Level',
    chamberRadius: 7,
    floorType: 'stone_damp',
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
    sideRoomProps: ['barrel', 'crate', 'bookshelf', 'chest'],
    chamberCandelabras: true,
    chamberScatter: [
      // Two large fermenting vats flanking the cauldron
      { type: 'fermenting_vat', x: 5, z: 6 },
      { type: 'fermenting_vat', x: 11, z: 6 },
      // Distillation coil on a workbench-level surface near east wall
      { type: 'distillation_coil', x: 13, z: 10 },
      // Hanging herb bundles
      { type: 'herb_bundle', x: 6, z: 11 },
      { type: 'herb_bundle', x: 10, z: 4 },
      // Barrels of brewing supplies
      { type: 'barrel', x: 3, z: 5,
        content: 'A barrel of fermented grain mash. It smells like ambition and regret.' },
      { type: 'barrel', x: 13, z: 12,
        content: 'A sealed barrel marked \'BATCH 89 — DO NOT DISTURB UNTIL THE NEXT CONVERGENCE\'. The date is illegible.' },
    ],
    encounterPool: ENCOUNTER_POOL_F2,
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
    chamberBookshelfContent: [
      // East shelf
      'A row of star charts, navigational almanacs, and a slim volume: \'Sleeping Patterns of the Magically Overworked\'. The survey is extensive.',
      // West shelf
      'Poetry anthologies, a pressed flower between pages 44 and 45, and a novel with seventeen bookmarks but no discernible beginning or end.',
      // NE shelf
      "Journals. The most recent entry reads: 'I fear the cauldron is sentient.' The next entry is dated three weeks later: 'I was right.'",
      // SW shelf
      'Arranged not by author, subject, or size, but by the mood the books put the previous owner in. The system is effective.',
    ],
    chamberScatter: [
      // Bedroom corner: bed + wardrobe (NE quadrant)
      { type: 'bed',       x: 12, z: 4, rotation: 90 as const },
      { type: 'wardrobe',  x: 14, z: 6 },
      // Writing desk (SW area, near bookshelves)
      { type: 'writing_desk', x: 4, z: 12, rotation: 90 as const },
      // Star-map rug at centre
      { type: 'rug', x: 8, z: 8 },
      // E1: Act I lore book — Human arc (Raiders on the Rise)
      // A military ledger hinting that the raider warlords have inside information.
      {
        type: 'lectern', x: 13, z: 12,
        content:
          'A slim intelligence ledger, stamped with a kingdom crest.\n\n' +
          '"SUMMARY — Northern Incursion Assessment\n\n' +
          'The raids are not opportunistic. Movement patterns suggest advance knowledge ' +
          'of patrol schedules and supply routes. The information is recent and precise.\n\n' +
          'Source of the leak is unknown. Access to this level of detail requires either ' +
          'a spy within the garrison, or someone with access to the tower\'s observation records.\n\n' +
          'Recommend immediate investigation of the eastern warlord camp.\n\n' +
          '— Filed: Office of the Kingdom\'s Keeper"',
      },
    ],
  },

  // ── Floor 4 — The Runic Forge ────────────────────────────────────────────────
  {
    id: 'floor_smithy',
    floorIndex: 4,
    name: 'The Runic Forge',
    chamberRadius: 7,
    floorType: 'stone_scorched',
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
    chamberScatter: [
      { type: 'anvil', x: 5, z: 5 },
      { type: 'anvil', x: 11, z: 11 },
      { type: 'cooling_trough', x: 5, z: 11, rotation: 90 as const },
      { type: 'cooling_trough', x: 11, z: 5, rotation: 90 as const },
      { type: 'barrel', x: 3, z: 8,
        content: 'A barrel of coal dust mixed with arcane reagent. The label says "GRADE A SCORCHITE". It is very illegal.' },
      // E1: Act I lore book — Vulperia arc (Someone Wants You Dead)
      // A contract notice referencing an unnamed "fox-eared candidate".
      {
        type: 'lectern', x: 13, z: 4,
        content:
          'A folded notice, stamped with the Baron\'s Keep seal.\n\n' +
          '"TO: All Registered Bounty Contractors\n\n' +
          'SUBJECT: Active Acquisition Contract\n\n' +
          'One (1) target: fox-eared, female-presenting, last seen in the vicinity of ' +
          'the Arcanist\'s Tower. Contract placed anonymously. Fee: substantial.\n\n' +
          'Acquisition only. Target is to be delivered intact.\n\n' +
          'Enquiries should be directed to the Keep\'s eastern gate quartermaster.\n\n' +
          'This notice is NOT to be distributed to independent contractors ' +
          'without guild clearance.\n\n' +
          '[Unsigned]"',
      },
    ],
    encounterPool: ENCOUNTER_POOL_F4,
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
    chamberScatter: [
      { type: 'bunk', x: 4, z: 4 },
      { type: 'bunk', x: 12, z: 4 },
      { type: 'bunk', x: 4, z: 12 },
      { type: 'bunk', x: 12, z: 12 },
      { type: 'mess_table', x: 8, z: 10 },
      // E1: Act I lore book — Undead arc (Why Am I Moving?)
      // Solmor's maintenance notes on the undead-preservation mechanism.
      {
        type: 'lectern', x: 13, z: 8,
        content:
          'A ring-bound technical manual, heavily annotated.\n\n' +
          '"UNDEAD PRESERVATION SYSTEM — MAINTENANCE LOG\n\n' +
          'Primary animating coil: stable. Secondary resonance matrix: stable. ' +
          'Tertiary suppression ward: DEGRADED — replaced 12 cycles ago, degrading again.\n\n' +
          'THEORY: The suppression ward\'s degradation is not equipment failure. ' +
          'The subject is actively resisting it at a sub-conscious level. ' +
          'This has not happened before.\n\n' +
          'CRITICAL NOTE: The maintenance point for the tertiary suppression ward ' +
          'is located at the bog shrine, grid ref 7-N. If the ward fails completely, ' +
          'the animating mechanism may become \'aware\'.\n\n' +
          'This may not be a problem. This may be a significant problem.\n\n' +
          '— Ongoing"',
      },
    ],
    encounterPool: ENCOUNTER_POOL_F5,
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
    chamberScatter: [
      { type: 'map_table', x: 8, z: 8 },
      { type: 'weapon_stand', x: 4, z: 4 },
      { type: 'weapon_stand', x: 12, z: 4 },
      { type: 'weapon_stand', x: 4, z: 12 },
      { type: 'weapon_stand', x: 12, z: 12 },
      { type: 'banner', x: 8, z: 2, rotation: 180 as const },
    ],
    encounterPool: ENCOUNTER_POOL_F6,
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
    chamberScatter: [
      { type: 'raised_planter', x: 4, z: 5, rotation: 90 as const },
      { type: 'raised_planter', x: 12, z: 11, rotation: 90 as const },
      { type: 'plant_pot', x: 6, z: 3 },
      { type: 'plant_pot', x: 10, z: 3 },
      { type: 'plant_pot', x: 6, z: 13 },
      { type: 'plant_pot', x: 10, z: 13 },
      { type: 'plant_pot', x: 3, z: 8 },
      { type: 'plant_pot', x: 13, z: 8 },
      // E1: Act I lore book — Slime arc (What Is This?)
      // Solmor's notes on a previous slime candidate who absorbed something unusual.
      {
        type: 'lectern', x: 4, z: 11,
        content:
          'A research journal, water-damaged.\n\n' +
          '"INCIDENT REPORT — CANDIDATE #7 (Slime, Classification IV)\n\n' +
          'The subject absorbed a personality fragment from a decommissioned construct ' +
          'in the lower laboratory. Fragment contained partial linguistic matrix and ' +
          'approximately 40 years of accumulated grievances.\n\n' +
          'The subject now has opinions.\n\n' +
          'Previously the subject did not have opinions. This is a significant change.\n\n' +
          'The personality fragment appears to retain access to certain structural ' +
          'knowledge of the tower, including an exit route I was not aware of.\n\n' +
          'RECOMMENDATION: Do not allow future candidates near the construct remains ' +
          'in the lab\'s NW quadrant.\n\n' +
          'I have not followed this recommendation myself. I am curious.\n\n' +
          '— S."',
      },
    ],
    encounterPool: ENCOUNTER_POOL_F7,
  },

  // ── Floor 8 — The Forbidden Archive ─────────────────────────────────────────
  {
    id: 'floor_archive',
    floorIndex: 8,
    name: 'The Forbidden Archive',
    chamberRadius: 7,
    floorType: 'stone_sealed',
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
    chamberBookshelfContent: [
      // East shelf
      'Bound in pale leather. Each volume is numbered. Numbers 1 through 14 are present. Number 7 is upside down. You do not correct it.',
      // West shelf
      'Technical grimoires behind locked glass. The key is hanging on a nail beside the case. The nail is also locked.',
      // NE shelf
      "Census records for something labelled only 'The Study'. Population at founding: twelve. Population at closure: one. Cause of closure: 'Resolved'.",
      // SW shelf
      'The titles are in a language you do not recognise. The index is in a language you recognise but do not speak. This is somehow worse.',
    ],
    chamberScatter: [
      { type: 'containment_ring', x: 8, z: 8 },
      { type: 'bookshelf', x: 3, z: 4,
        content: 'A shelf of sealed, black-bound volumes. Each spine bears only a number. You do not open them.' },
      { type: 'bookshelf', x: 13, z: 12, rotation: 180 as const,
        content: 'Scrolls sealed with seven different wax stamps. One of the stamps is a thumbprint. A very large thumbprint.' },
    ],
    encounterPool: ENCOUNTER_POOL_F8,
  },

  // ── Floor 9 — The Celestial Observatory ─────────────────────────────────────
  {
    id: 'floor_observatory',
    floorIndex: 9,
    name: 'The Celestial Observatory',
    chamberRadius: 7,
    floorType: 'stone_celestial',
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
    chamberScatter: [
      { type: 'astrolabe', x: 8, z: 8 },
      { type: 'globe', x: 5, z: 5 },
      { type: 'globe', x: 11, z: 11 },
      { type: 'rug', x: 8, z: 8 },
    ],
    encounterPool: ENCOUNTER_POOL_F9,
  },
];

/** Player spawns on this floor at game start. */
export const PLAYER_START_FLOOR_INDEX = 0; // Grand Entrance Hall

/** Get a floor definition by its floorIndex (-1..9). */
export function getFloorDef(floorIndex: number): TowerFloorDef | undefined {
  return TOWER_FLOOR_DEFS.find((d) => d.floorIndex === floorIndex);
}

/** Ordered list from basement (-1) to rooftop (9). */
export const FLOORS_ORDERED = [...TOWER_FLOOR_DEFS].sort(
  (a, b) => a.floorIndex - b.floorIndex,
);
