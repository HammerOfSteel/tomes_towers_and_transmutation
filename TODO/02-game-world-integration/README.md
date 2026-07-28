# 02 — Game World Integration
> 🚧 Turn Overworld Studio output into the actual 3D playable world.
> **Realm terrain (RI-1–4), settlement spawning (SI-1), dungeon integration
> (DI-1/2/2b), and cave/glade integration (CG-1/2/3/5) all shipped as pure,
> tested modules — cave/glade, settlement-boundary, and dungeon site-metadata
> pieces are now also wired live into `OverworldScene.ts`/`main.ts`, and the
> dungeon exit-position bug is fixed (DI-3). Remaining renderer-wiring gaps:
> dungeon entrance-prop variants + quest/reward hooks (DI-1/DI-4b), cave/glade
> floor scenes (CG-4), and settlement LOD (SI-5).**

## The Problem
Overworld Studio generates beautiful maps (realm, settlements, dungeons, caves, solar system).
The game has `OverworldScene.ts` and `WorldGenerator.ts`.
But there is NO clear plan for how one feeds the other.

## The Contract (what needs to be defined)

```
RealmData (from OW-A)
  └── terrain biome cells → 3D terrain tiles
  └── settlements[]       → 3D building clusters
  └── rivers[]            → 3D river meshes
  └── dungeon markers     → dungeon entrance props
  └── cave markers        → cave entrance props

SettlementPlan (from OW-B area gen)
  └── wards[]             → building zones
  └── buildings[]         → individual building DNAs
  └── roads               → path meshes
  └── NPCs[]              → spawned NPC entities

DungeonBlueprint (from OW-B)
  └── rooms[]             → room geometry + encounters
  └── corridor graph      → passable paths

CavePlan (from OW-C)
  └── cells[]             → cave floor geometry
  └── features[]          → stalactites, pools, crystals
```

## Sub-todos

| File | Topic | Status |
|---|---|---|
| [Realm Integration](./realm-integration.md) | 3D terrain from biome cells | 🚧 In Progress |
| [Settlement Integration](./settlement-integration.md) | 3D settlements from plans (live buildings/roads/NPCs already working independently; boundary-crossing toast added) | 🚧 In Progress |
| [Dungeon Integration](./dungeon-integration.md) | Dungeon entrances + loading (live enter/exit works, exit-position bug fixed, site-family metadata now live + shown in discovery toast; quest/reward hooks + procedural entrance-prop variants still open) | 🚧 In Progress |
| [Cave Integration](./cave-glade-integration.md) | Cave + glade entrances (live wiring + minimap icons + save persistence done; only floor scene transition deferred) | 🚧 In Progress |

## Dependencies
- Requires: `01-overworld-studio` generators ✅
- Requires: `03-procedural-pipeline` builders (buildings, NPCs, tiles)
- Feeds: The actual playable game (`src/scene/OverworldScene.ts`)
