# World Design

## Overview

The world of *Tomes, Towers & Transmutation* is composed of two distinct zones that the player transitions between: the **Tower Interior** and the **Exterior Wilds**. Both are procedurally generated at runtime from a single integer seed.

---

## The Tower

The tower is the primary dungeon — a vertical structure of connected floors, each floor a procedurally assembled collection of rooms stitched from JSON blueprint modules.

### Structure

```
Floor N (Boss / Key Item)
    │
Floor N-1 ... Floor N-2
    │
...
Floor 1 (Starting Cell — hand-crafted, always identical)
```

- **Floor count:** Variable (configurable per run), default 5.
- **Rooms per floor:** 3–7, connected by doorways. At least one room contains a bookcase.
- **Staircase:** Each floor has exactly one exit leading up.

### Room Categories

| Category | Contents | Spawn Weight |
|---|---|---|
| Cell / Prison | Sparse. Book guaranteed. Low enemy density. | Start floor only |
| Library / Study | Bookshelves, lectern, rare spell book possible | Medium |
| Guard Barracks | High enemy density, patrol routes | High |
| Armory | Resource crates, possible stat upgrade | Low |
| Ritual Chamber | Special encounter, unique geometry (circular room) | Very low |
| Corridor | Connecting passage, 1–2 enemies | High |

### Environmental Rules

- **Torches** are procedural cylinder + sphere emitters. They cast point lights with slight flicker (uniform sin(time + seed) variation).
- **Doors** are initially closed. They open by player proximity trigger or are locked and require a key item dropped by a room's elite enemy.
- **Secrets:** Every floor has a 30% chance of containing a hidden room accessible via a breakable wall (wall health < threshold → destroys mesh and reveals doorway).

---

## The Exterior Wilds

Unlocked in Phase 6. The exterior is an open terrain area surrounding the base of the tower.

### Terrain Generation

- **Algorithm:** Simplex noise heightmap (2D, octave-layered) rendered as a `PlaneGeometry` with vertex displacement.
- **Biomes (based on noise value ranges):**

| Noise Range | Biome | Visual |
|---|---|---|
| < 0.2 | Bog | Dark, wet-looking noise texture shader |
| 0.2 – 0.5 | Forest | Procedural cylinder trees (tapered trunk + sphere canopy) |
| 0.5 – 0.8 | Highlands | Sparse rocks (procedural irregular polyhedra) |
| > 0.8 | Cliffside | Steep geometry, no spawns |

- **Trees:** Procedural. Trunk = tapered `CylinderGeometry`. Canopy = `SphereGeometry` with vertex noise displacement to break uniformity.
- **Rocks:** Low-poly `DodecahedronGeometry` with random scale/rotation. Used for resource nodes (Phase 7 mining).

### Exterior Zones

```
[Tower Base]
    ↑
[Clearing]    — Safe. Minion rally point.
    ↑
[Forest]      — Medium enemy density. Recruitment grounds.
    ↑
[Highlands]   — High enemy density. Rare resource nodes.
    ↑
[Fog boundary] — Procedural fog wall (shader). Stops exploration.
```

### Enemy Camps

Enemy camps are clusters of 3–8 enemies with a shared patrol radius. Camps are placed by the generator using Poisson disk sampling to ensure spacing. Each camp has:
- 1 "Elite" enemy (higher HP, higher chance of dropping rare book or resource)
- 2–7 standard enemies

---

## Zone Transition

The tower entrance is a fixed location at the edge of the clearing. Triggering it runs a door-transition animation (fade to black, swap scene) identical to interior room transitions.

On re-entering the tower, the interior state is preserved (cleared rooms stay cleared, but enemies respawn on the next "rest" action — not yet implemented).

---

## Seed System

Both the tower and exterior share a single integer seed. The same seed always produces the same world layout.

```typescript
// Conceptual
const seed = 42;
const tower = generateTower(seed);
const exterior = generateExterior(seed + 1); // offset to avoid correlation
```

Seeds are displayed on the HUD (Phase 5+). Players can share seeds for identical runs.

---

## Open Questions

- [ ] Should the exterior be fully open-world or separated into discrete "zones" with load screens? Open-world is richer but may be a performance concern with 100+ minions.
- [ ] Does the tower regenerate on re-entry in a new run, or persist across sessions (save system)?
- [ ] Scale of the exterior — how large should the playable area be before the fog wall?
