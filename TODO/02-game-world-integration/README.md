# 02 — Game World Integration
> ⚠️ BIG GAP — Turn Overworld Studio output into the actual 3D playable world.
> **This entire section needs design work before implementation begins.**

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
| [Realm Integration](./realm-integration.md) | 3D terrain from biome cells | ⚠️ GAP |
| [Settlement Integration](./settlement-integration.md) | 3D settlements from plans | ⚠️ GAP |
| [Dungeon Integration](./dungeon-integration.md) | Dungeon entrances + loading | ⚠️ GAP |
| [Cave Integration](./cave-glade-integration.md) | Cave + glade entrances | ⚠️ GAP |

## Dependencies
- Requires: `01-overworld-studio` generators ✅
- Requires: `03-procedural-pipeline` builders (buildings, NPCs, tiles)
- Feeds: The actual playable game (`src/scene/OverworldScene.ts`)
