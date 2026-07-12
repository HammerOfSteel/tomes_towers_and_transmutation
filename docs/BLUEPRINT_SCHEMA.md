# Blueprint Schema

The blueprint system is the foundation of all level design in *Tomes, Towers & Transmutation*. A **blueprint** is a JSON file that describes a single room: its dimensions, geometry elements, spawn points, and connection points (doorways).

The procedural generator assembles blueprints into full floors. The in-game level editor exports blueprints to this format. Both must produce and consume identical schema.

---

## Schema Version

Current schema version: **`1.0`**

All blueprint files must declare their version. The loader will reject or migrate files with a version mismatch.

---

## Top-Level Structure

```jsonc
{
  "schema_version": "1.0",
  "id": "library_small_01",          // unique identifier (kebab-case)
  "category": "library",             // room category (see categories below)
  "tags": ["bookcase", "quiet"],     // optional descriptive tags
  "dimensions": {
    "width": 12,                     // in world units (x-axis)
    "depth": 10,                     // in world units (z-axis)
    "height": 4                      // in world units (y-axis)
  },
  "doorways": [ /* ... */ ],
  "geometry": [ /* ... */ ],
  "spawns": [ /* ... */ ],
  "interactables": [ /* ... */ ]
}
```

### `id`
- Format: `[category]_[descriptor]_[variant_number]`
- Example: `library_small_01`, `corridor_straight_02`, `cell_starting_01`
- Must be unique across all blueprints in the pool.

### `category`
Valid values:

| Value | Description |
|---|---|
| `cell` | Prison/starting room |
| `library` | Study, bookcases, lore |
| `barracks` | Guard room, high enemy density |
| `armory` | Resources, equipment |
| `ritual_chamber` | Special encounter, circular layout |
| `corridor` | Connecting passage |
| `boss_room` | Phase-boss or floor-cap encounter |

---

## `doorways` Array

Doorways define where this room connects to others. The generator stitches rooms together by aligning doorways.

```jsonc
{
  "id": "door_north",
  "position": { "x": 6, "y": 0, "z": 0 },   // center of the doorway opening
  "direction": "north",                        // which wall it's on
  "width": 2,                                  // opening width in world units
  "height": 3,                                 // opening height in world units
  "locked": false,                             // if true, requires key_id
  "key_id": null                               // ID of the key item that unlocks this door
}
```

**`direction`** valid values: `"north"`, `"south"`, `"east"`, `"west"`, `"up"` (staircase), `"down"`

Rooms must have at least **1** doorway. Corridor rooms must have exactly **2** aligned doorways.

---

## `geometry` Array

Each entry describes a primitive to instantiate when rendering the room.

```jsonc
{
  "type": "box",                              // primitive type
  "id": "wall_north",                        // optional, for referencing in logic
  "position": { "x": 6, "y": 2, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 },   // Euler angles in radians
  "scale":    { "x": 12, "y": 4, "z": 0.3 },
  "material": "stone_wall",                   // material key (see Materials section)
  "physics":  "static"                        // "static" | "dynamic" | "trigger" | "none"
}
```

### Supported Primitive Types

| `type` | Three.js Geometry | Parameters |
|---|---|---|
| `box` | `BoxGeometry` | `scale.x/y/z` = width/height/depth |
| `plane` | `PlaneGeometry` | `scale.x/z` = width/depth |
| `cylinder` | `CylinderGeometry` | `scale.x` = radius, `scale.y` = height |
| `sphere` | `SphereGeometry` | `scale.x` = radius |
| `torus` | `TorusGeometry` | `scale.x` = outer radius, `scale.z` = tube radius |
| `cone` | `ConeGeometry` | `scale.x` = radius, `scale.y` = height |

### Material Keys

Material keys map to pre-registered `ShaderMaterial` or `MeshLambertMaterial` instances in the renderer:

| Key | Description |
|---|---|
| `stone_wall` | Dark stone noise texture |
| `stone_floor` | Lighter stone with grout lines |
| `wood_floor` | Warm wood plank pattern |
| `dirt_floor` | Exterior terrain shader |
| `torch_bracket` | Iron-grey lambert |
| `bookcase_wood` | Warm brown lambert |
| `locked_door` | Red-tinted stone, emissive lock glyph |
| `open_door` | Transparent/trigger volume only |

---

## `spawns` Array

Defines where entities can spawn. The generator and encounter system resolve which entities fill which spawn points at runtime.

```jsonc
{
  "id": "spawn_guard_01",
  "type": "enemy",                           // "enemy" | "item" | "player_start" | "elite"
  "position": { "x": 4, "y": 0, "z": 5 },
  "enemy_tags": ["tower", "humanoid"],       // optional — limits which enemy types may spawn here
  "patrol_path": [                           // optional — list of waypoints for PATROL AI state
    { "x": 4, "y": 0, "z": 5 },
    { "x": 8, "y": 0, "z": 5 }
  ]
}
```

**`type`** valid values:

| Value | Description |
|---|---|
| `enemy` | Standard enemy spawn |
| `elite` | Guaranteed elite enemy |
| `item` | Loot/resource drop |
| `player_start` | The player's starting position (only valid in `cell` category rooms) |
| `book` | Guaranteed interactable book (used to ensure progression books always appear) |

---

## `interactables` Array

Interactable objects that the player can trigger via raycast.

```jsonc
{
  "id": "bookcase_01",
  "type": "bookcase",
  "position": { "x": 2, "y": 0, "z": 1 },
  "rotation": { "y": 1.5708 },
  "loot_table": "books_tier1",               // loot table ID (resolved by progression system)
  "geometry_ref": "bookcase_large"           // optional: override default geometry
}
```

**`type`** valid values: `"bookcase"`, `"lectern"`, `"chest"`, `"lever"`, `"staircase_up"`, `"staircase_down"`, `"breakable_wall"`

---

## Full Example Blueprint

```jsonc
{
  "schema_version": "1.0",
  "id": "library_small_01",
  "category": "library",
  "tags": ["bookcase", "quiet", "lore"],
  "dimensions": { "width": 10, "depth": 8, "height": 4 },
  "doorways": [
    {
      "id": "door_south",
      "position": { "x": 5, "y": 0, "z": 8 },
      "direction": "south",
      "width": 2,
      "height": 3,
      "locked": false,
      "key_id": null
    }
  ],
  "geometry": [
    { "type": "plane", "id": "floor", "position": { "x": 5, "y": 0, "z": 4 }, "rotation": { "x": -1.5708, "y": 0, "z": 0 }, "scale": { "x": 10, "y": 1, "z": 8 }, "material": "stone_floor", "physics": "static" },
    { "type": "box",   "id": "wall_north", "position": { "x": 5, "y": 2, "z": 0 }, "rotation": { "x": 0, "y": 0, "z": 0 }, "scale": { "x": 10, "y": 4, "z": 0.3 }, "material": "stone_wall", "physics": "static" },
    { "type": "box",   "id": "wall_east",  "position": { "x": 10, "y": 2, "z": 4 }, "rotation": { "x": 0, "y": 1.5708, "z": 0 }, "scale": { "x": 8, "y": 4, "z": 0.3 }, "material": "stone_wall", "physics": "static" },
    { "type": "box",   "id": "wall_west",  "position": { "x": 0, "y": 2, "z": 4 }, "rotation": { "x": 0, "y": 1.5708, "z": 0 }, "scale": { "x": 8, "y": 4, "z": 0.3 }, "material": "stone_wall", "physics": "static" }
  ],
  "spawns": [
    { "id": "spawn_enemy_01", "type": "enemy", "position": { "x": 7, "y": 0, "z": 4 }, "enemy_tags": ["tower"] }
  ],
  "interactables": [
    { "id": "bookcase_01", "type": "bookcase", "position": { "x": 2, "y": 0, "z": 2 }, "rotation": { "y": 0 }, "loot_table": "books_tier1" },
    { "id": "bookcase_02", "type": "bookcase", "position": { "x": 2, "y": 0, "z": 5 }, "rotation": { "y": 0 }, "loot_table": "books_tier1" }
  ]
}
```

---

## Validation Rules

The blueprint loader enforces these rules and throws a descriptive error on violation:

1. `id` must match `/^[a-z0-9_]+$/` (lowercase alphanumeric and underscores only)
2. All positions must be within `[0, dimensions.width]` × `[0, dimensions.height]` × `[0, dimensions.depth]`
3. At least one `player_start` spawn must exist in blueprints with `category: "cell"`
4. Doorway positions must be on a wall boundary (x=0, x=width, z=0, or z=depth)
5. `locked: true` requires a non-null `key_id`
6. Duplicate `id` values within a single blueprint are rejected
7. `material` must be a registered key from the renderer's material registry

---

## Versioning & Migration

If the schema version changes, a migration function must be added to `src/levels/blueprintMigration.ts`:

```typescript
// Example: migrate v0.9 → v1.0
migrators['0.9'] = (data: unknown): BlueprintV1 => {
  // ... transform old shape to new shape
};
```

The loader automatically chains migrators to bring any stored blueprint up to the current version.
