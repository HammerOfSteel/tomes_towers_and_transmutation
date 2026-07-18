# Buildings — Procedural DNA Catalog

> **Architecture:** Every building is described by a `BuildingDNA` object.
> The `buildBuilding(dna)` function renders it from Three.js primitives with no external assets.
> Same DNA → identical building every time (deterministic via `seed`).

---

## DNA Parameters (reference)

```typescript
BuildingDNA {
  buildingKind:   BuildingKind    // functional archetype (what it IS)
  style:          BuildingStyle   // cultural/faction aesthetic (what it LOOKS LIKE)
  size:           BuildingSize    // scale class: tiny | small | medium | large
  floors:         1 | 2 | 3 | 4  // vertical height
  condition:      BuildingCondition  // pristine | weathered | damaged | ruined | overgrown | cursed
  faction:        Faction         // who built/uses it (drives secondary details)
  terrace:        TerraceSide     // none | left | right | both (row-house mode)
  features:       Feature[]       // optional attachments
  colors:         BuildingColors  // walls / roof / trim / door overrides
  seed:           number          // deterministic RNG
}
```

### BuildingStyle values
| Style | Aesthetic | Materials | Who uses it |
|---|---|---|---|
| `thatched` | English vernacular, warm | Cob/daub, straw roof | Humans (rural) |
| `timber` | Tudor, half-timbered | Oak frame, whitewash infill | Humans (town) |
| `stone` | Norman/Romanesque, heavy | Coursed limestone | Humans, Dwarves |
| `gothic` | Pointed arches, soaring | Dark cut stone, flying buttresses | Humans (religious), Vampires |
| `tudor` | Decorative framing, grand | Black timber, pale render | Humans (wealthy) |
| `nordic` | Stave church, longhouse | Dark wood, turf roof | Nordic humans, Rangers |
| `arcane` | Purple/indigo, glowing | Enchanted stone, ley-line cracks | Mages, Celestials |
| `elven` | Organic curves, pale wood | Silver-birch, living wood | Elves |
| `dwarven` | Squat, carved, functional | Granite, iron fittings | Dwarves |
| `vampiric` | Gothic excess, gargoyles | Obsidian, black iron | Vampires, High Undead |
| `orcish` | Crude, aggressive | Rough timber, bone decoration | Orcs, Barbarians |
| `fae` | Tiny, mushroom-influenced | Toadstool, bark, petal | Fae, Pixies |
| `nomadic` | Portable, fabric | Canvas, hides, rope | Nomads, Slime |
| `ruined` | Collapsed, overgrown | Crumbling stone, vines | All (decay state) |

### Feature flags
| Feature | Description |
|---|---|
| `bay_window` | Projecting 3-light window (Victorian/Tudor) |
| `jetty` | Upper floors overhang lower by ~0.4m (medieval) |
| `battlements` | Crenellated parapet at top |
| `buttress` | Side structural props (gothic/chapel) |
| `awning` | Fabric canopy over entrance |
| `balcony` | Open platform on upper floor |
| `barred_windows` | Iron bars across windows (prison/crypt) |
| `glow_runes` | Emissive arcane markings on walls |
| `bone_decoration` | Skull/bone trim on surfaces |
| `vine_covered` | Climbing plant mesh overlay |
| `iron_bars` | Heavy iron reinforcement |
| `alchemy_pipes` | Copper tubes venting from walls |
| `banner` | Hanging faction banner |
| `gargoyles` | Carved stone creatures at corners |
| `moat_bridge` | Timber drawbridge at entrance |

---

## Category I — Human Settlements

### 1.1 Rural / Hamlet
*Scattered farmsteads, hamlets of 3–8 buildings, close to fields.*

| Kind | Style | Floors | Key Features | Notes |
|---|---|---|---|---|
| `cottage` | `thatched` | 1 | Steep roof (pitch 0.75+), arched door, flower baskets | Quintessential village home |
| `cottage` | `stone` | 1–2 | Thick walls, small deep-set windows, low eave | Moorland / highland variant |
| `barn` | `thatched` or `timber` | 1 | Wide gambrel roof, open front, hay loft | Agricultural, no windows |
| `well` | `stone` | — | Rope + bucket, moss-covered | Water source, centre of hamlet |
| `market_stall` | `timber` | — | Striped awning, counter | Seasonal market / fair |
| `tent` | `nomadic` | — | Conical canvas, striped panels | Traveler camp, seasonal worker |

**DNA recipe — hamlet cottage:**
```json
{ "buildingKind": "cottage", "style": "thatched", "size": "small",
  "floors": 1, "condition": "weathered", "features": [] }
```

---

### 1.2 Village
*10–30 buildings, inn + smithy + chapel + market square.*

| Kind | Style | Floors | Key Features |
|---|---|---|---|
| `house` | `timber` | 2 | Jetty overhang, glazed windows, chimney |
| `terraced` | `timber` | 2–3 | Shared walls, Tudor frame, narrow frontage |
| `inn` | `timber` or `tudor` | 2 | Wide frontage, bay windows, hanging sign, stable arch |
| `tavern` | `tudor` | 2 | Even wider, bay windows, multiple chimneys, iron bracket sign |
| `blacksmith` | `stone` | 1 | Open forge front, massive chimney, glowing hearth |
| `shop` | `timber` | 1–2 | Large display window, shutters |
| `apothecary` | `timber` | 3 | Oriel window 2nd floor, herb bundles, narrow |
| `chapel` | `stone` or `gothic` | nave+tower | Gothic pointed windows, buttresses, spire |
| `watchtower` | `stone` | 4 | Battlements, arrow slits, slight taper |
| `market_stall` | `timber` | — | Awning, goods on counter |

**DNA recipe — village tavern:**
```json
{ "buildingKind": "tavern", "style": "tudor", "size": "medium",
  "floors": 2, "condition": "weathered",
  "features": ["bay_window", "banner"] }
```

---

### 1.3 Town
*50–200 buildings, guilds, varied architecture, cobbled streets.*

| Kind | Style | Floors | Key Features |
|---|---|---|---|
| `terraced` | `timber` or `stone` | 2–3 | Jetty, varied window widths, party walls |
| `guild` | `stone` or `tudor` | 2–3 | Hipped roof, arched ground-floor, banner |
| `villa` | `stone` or `tudor` | 2–3 | Georgian 5-bay, portico columns, quoins |
| `shop` | `timber` | 2 | Bay window, display front, shutters |
| `inn` | `tudor` | 2–3 | Courtyard arch, stable yard behind |
| `chapel` | `gothic` | 2+tower | Fully developed west front, nave + side aisles |
| `watchtower` | `stone` | 4–5 | Battlements, murder holes, murder holes |
| `apothecary` | `timber` | 3 | Oriel, alchemical pipes |

---

### 1.4 City
*Grand civic scale, monumental buildings, mixed architecture.*

| Kind | Style | Floors | Key Features |
|---|---|---|---|
| `villa` | `gothic` or `tudor` | 3 | Double-height entrance, symmetrical, roof walk |
| `guild` | `stone` | 3–4 | Battlements, arched windows, tower annexe |
| `chapel` (cathedral scale) | `gothic` | 3+spire | Transept, flying buttresses, rose window, 3 spires |
| `watchtower` (city gate) | `stone` | 3–4 | Portcullis arch, flanking towers |
| `tent` (grand pavilion) | `arcane` | — | Large ceremonial tent, pennants |

---

## Category II — Wilderness & Nature Structures

### 2.1 Forest / Ranger
| Kind | Style | Notes |
|---|---|---|
| `cottage` | `nordic` | Ranger's cabin, turf roof, low profile |
| `watchtower` | `timber` | Wooden palisade-style, ladder access |
| `tent` | `nomadic` | Hunter's camp |
| `market_stall` | `timber` | Roadside shrine/milestone |

### 2.2 Agricultural / Rural Industry
| Kind | Style | Notes |
|---|---|---|
| `barn` | `thatched` | Grain storage, hay loft |
| `barn` | `stone` | Highland cattle barn, very plain |
| `blacksmith` | `stone` | Rural forge, open front |
| `well` | `stone` | Farm well, rope-and-bucket |

### 2.3 Arcane / Mage
| Kind | Style | Notes |
|---|---|---|
| `watchtower` (mage tower) | `arcane` | Tall, glowing rune cracks, conical cap |
| `cottage` (hermit's) | `arcane` | Isolated, unusual additions, alchemy pipes |
| `apothecary` (alchemist) | `arcane` | Alchemy pipes, glow-rune features |
| `chapel` (arcane sanctum) | `arcane` | Circular plan, arcane windows |

**DNA recipe — mage tower:**
```json
{ "buildingKind": "watchtower", "style": "arcane", "size": "small",
  "floors": 4, "condition": "pristine",
  "features": ["glow_runes", "battlements"],
  "colors": { "walls": "#3a2860", "roof": "#1a0840", "trim": "#8060ff", "door": "#6040c0" } }
```

---

## Category III — Elven Structures

*Elven buildings flow with the landscape — organic curves, pale silver-birch wood,
living vines woven into structure, no right angles where avoidable.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `cottage` | `elven` | Vine-covered, curved walls, leaf-shaped windows | Forest dwelling |
| `watchtower` | `elven` | Spiralling form, no battlements, open platform top | Treetop observation post |
| `chapel` (woodland shrine) | `elven` | No walls — open pillared colonnade, living tree as central column | Sacred grove |
| `villa` (elder's hall) | `elven` | Long low form, many windows, garden terrace | Elder's meeting hall |
| `market_stall` | `elven` | Woven-branch frame, flower/herb goods | Wandering merchant |
| `tent` (travelling camp) | `nomadic` | Pale canvas, silver rope | Wandering elf camp |

**DNA recipe — elven cottage:**
```json
{ "buildingKind": "cottage", "style": "elven", "size": "small",
  "floors": 1, "condition": "pristine",
  "features": ["vine_covered"],
  "colors": { "walls": "#c8d8b0", "roof": "#8a9870", "trim": "#f0f0e8", "door": "#6a8a50" } }
```

---

## Category IV — Dwarven Structures

*Squat, massively built, carved from the rock face or built to look carved.
No nonsense — every element is structural. Carved reliefs, iron fittings.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `cottage` (burrow house) | `dwarven` | Half-buried, carved stone door frame, single round window | Mountain homestead |
| `blacksmith` | `dwarven` | Double-wide forge, carved stone, iron doors | Master forge |
| `guild` (clan hall) | `dwarven` | Heavy lintel stones, carved clan runes, squat towers | Clan gathering |
| `watchtower` | `dwarven` | Very squat (2 floors), crenellated, carved relief panels | Border post |
| `barn` (mine entrance) | `dwarven` | Arched stone portal, cart tracks in floor | Mine portal |
| `chapel` (ancestor shrine) | `dwarven` | No spire — flat-topped, carved ancestor faces on walls | Dwarven religion = ancestors |

**DNA recipe — dwarven forge:**
```json
{ "buildingKind": "blacksmith", "style": "dwarven", "size": "large",
  "floors": 1, "condition": "pristine",
  "colors": { "walls": "#706860", "roof": "#404040", "trim": "#2a2020", "door": "#1a1818" } }
```

---

## Category V — Undead / Vampiric Structures

*Divided into two sub-factions: High Undead (vampires, liches — decadent, gothic excess)
and Common Undead (skeletons, zombies — ruined human buildings repurposed).*

### 5.1 Vampire / High Undead
| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `villa` (vampire manor) | `vampiric` | Gothic excess, gargoyles, barred windows, iron gates | Noble vampire estate |
| `watchtower` (blood tower) | `vampiric` | Black iron, gargoyles at top, no windows | Blood tower / dungeon |
| `chapel` (mausoleum) | `vampiric` | Heavy stone, sealed door, gargoyles, no windows | Family mausoleum |
| `guild` (vampire court) | `vampiric` | Grand entrance arch, flanking statues, battlements | Vampire political seat |
| `cottage` (thrall quarters) | `vampiric` | Barred windows, heavy lock, small | Servant housing |

**DNA recipe — vampire manor:**
```json
{ "buildingKind": "villa", "style": "vampiric", "size": "large",
  "floors": 3, "condition": "weathered",
  "features": ["gargoyles", "barred_windows", "battlements"],
  "colors": { "walls": "#2a2030", "roof": "#1a1020", "trim": "#4a3050", "door": "#8a2020" } }
```

### 5.2 Common Undead (repurposed human buildings)
| Kind | Style | Notes |
|---|---|---|
| `cottage` | `ruined` + `bone_decoration` | Skeleton squatter, bones piled at entrance |
| `watchtower` | `ruined` + `stone` | Crumbling, partially collapsed, occupied |
| `chapel` | `ruined` + `gothic` | Desecrated chapel, broken windows, rotting pews |
| `barn` | `ruined` | Skeleton horde gathering place, straw piled for rot |

---

## Category VI — Draconic / Scaled Structures

*Draconic buildings are fortress-like — built to last forever, for creatures that
think in centuries. Large openings (for wingspan), reinforced everything, hoard-room
prominent.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `watchtower` (iron keep) | `dwarven` (dark variant) | Very wide, arched for wingspan, iron clad | Draconic border keep |
| `cottage` (scale-den) | `stone` | Underground entrance preferred, camouflaged | Lower-caste draconic |
| `guild` (fire-court) | `arcane` (red/gold) | Heat-warped stone, glow-rune markings | Draconic political court |
| `barn` (hoard vault) | `stone` | Sealed heavy door, no windows, deep floor | Treasury / hoard room |
| `chapel` (fire shrine) | `arcane` | Lava-pool altar, heat distortion above roof | Draconic religious site |
| `tent` (field camp) | `nomadic` | Large iron-frame tent, scale-hide canvas | Military draconic camp |

**DNA recipe — draconic keep:**
```json
{ "buildingKind": "watchtower", "style": "dwarven", "size": "large",
  "floors": 4, "condition": "pristine",
  "features": ["battlements", "iron_bars"],
  "colors": { "walls": "#5a2010", "roof": "#3a1008", "trim": "#c84000", "door": "#2a1008" } }
```

---

## Category VII — Celestial Structures

*Celestial beings use light, geometry, and elevation.
Buildings are tall, clean, often partially translucent in appearance,
oriented toward astronomical features.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `watchtower` (light beacon) | `arcane` | Glowing apex, pure white, no battlements | Signal / navigation beacon |
| `chapel` (star temple) | `arcane` | Dome (not spire), arcane window-star, circular plan | Celestial worship |
| `cottage` (wayshrine) | `arcane` | Small, glowing, roadside | Healing wayshrine |
| `villa` (sky palace annex) | `arcane` | Balcony, open arches, elevation | Celestial noble residence |
| `tent` (meditation platform) | `nomadic` | Open-sided, star-cloth canopy, elevated | Travelling celestial meditation |

---

## Category VIII — Vulperia / Foxling Structures

*Quick, agile, cunning. Buildings reflect this: narrow passages, multiple exits,
hidden rooms, market-oriented frontage, lots of windows for watching.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `cottage` | `timber` | Multiple small windows (watching neighbours), clever hidden entrance | Fox family home |
| `apothecary` (information broker) | `timber` | Oriel for watching street, coded sign | Intelligence-gathering front |
| `market_stall` | `timber` | Three-sided — always an exit route | Classic vulperia merchant |
| `watchtower` (lookout) | `timber` | Very narrow, many arrow slits (for watching, not fighting) | Network sentry post |
| `inn` | `tudor` | Central meeting point, hidden rooms behind bar | Information hub / safehouse |

---

## Category IX — Slime Structures

*Slimes don't build in the traditional sense — they occupy and adapt.
Their "buildings" are natural forms made liveable: cave mouths, crystalline
growths, hollowed trees, simple domes of hardened slime.*

| Kind | Style | Key Features | Notes |
|---|---|---|---|
| `cottage` (slime grotto) | `nomadic` | Domed, translucent shell, iridescent | Permanent slime home |
| `tent` (bubble camp) | `nomadic` | Translucent dome, colour-shifting | Temporary bubble dwelling |
| `well` (acid pool) | `stone` | Repurposed well, glowing green pool | Slime water source |
| `barn` (absorption chamber) | `stone` | Low ceiling, rounded corners, slick floor | Slime gathering / feeding |

**DNA recipe — slime grotto:**
```json
{ "buildingKind": "cottage", "style": "nomadic", "size": "small",
  "floors": 1, "condition": "pristine",
  "features": ["glow_runes"],
  "colors": { "walls": "#aaffcc", "roof": "#66ffaa", "trim": "#22ff88", "door": "#00cc66" } }
```

---

## Category X — Ruins & Ancient Structures

*Ruins of every kind — any human/faction building can be in a ruined state.
Plus truly ancient structures that predate current civilizations.*

| Kind | Style | Notes |
|---|---|---|
| `ruin` | `stone` | Partial walls, rubble, broken roof | Generic ruin |
| `ruin` | `gothic` | Desecrated cathedral remains, open to sky | Religious ruin |
| `ruin` | `elven` | Vine-consumed, graceful decay | Ancient elven ruin |
| `chapel` (standing stones) | `stone` | No walls — just carved standing stones in circle | Pre-human ritual |
| `watchtower` (obelisk) | `stone` | Single monolithic tower, no interior | Ancient marker/gate |
| `barn` (burial mound) | `stone` | Low earth-covered structure, sealed entrance | Ancient tomb |

---

## Category XI — Temporary / Camp Structures

*Used by adventurers, armies, nomads, and travelling merchants.*

| Kind | Style | Size | Notes |
|---|---|---|---|
| `tent` (bedroll shelter) | `nomadic` | tiny | Single person lean-to |
| `tent` (adventurer camp) | `nomadic` | small | 2-4 person cone tent + guy ropes |
| `tent` (command tent) | `nomadic` | medium | Military command + banner |
| `tent` (grand pavilion) | `nomadic` | large | Noble/ceremonial tent, multiple poles |
| `market_stall` | `timber` | small–medium | Roadside/market |
| `tent` (caravan pitch) | `nomadic` | small | Merchant caravan stop |

---

## Implementation Roadmap

### Already implemented ✓
- `house`, `shop`, `inn`, `guild` — standard human, 4 styles
- `terraced` — Tudor row house with jetty overhang
- `cottage` — steep thatched, arched door, flower baskets  
- `villa` — Georgian 5-bay, portico, quoins
- `tavern` — wide Tudor, bay window, iron sign bracket
- `blacksmith` — open forge, glow hearth, tool rack
- `apothecary` — oriel window, herb bundles
- `watchtower` — battlements, arrow slits, taper
- `chapel` — nave, gothic windows, buttresses, bell tower + spire
- `tent` — conical 8-panel, guy ropes, stake
- `market_stall` — striped awning, counter, goods
- `barn`, `well`, `ruin` — utility + decay
- **4 building styles**: `thatched`, `stone`, `timber`, `arcane`
- **Textures**: stone, brick, render, slate, thatch

### Next to implement
- [ ] **Styles**: `elven`, `dwarven`, `vampiric`, `nordic`, `nomadic`, `gothic` (full variant)
- [ ] **Kinds**: 
  - `watchtower` arcane/vampiric variants (conical dark cap, gargoyle details)
  - `chapel` dwarven (no spire, ancestor carving)
  - `cottage` elven (organic curves, vine-covered)
  - `villa` vampiric (gothic manor with gargoyles)
  - `barn` as hoard vault or mine entrance
- [ ] **Features**: `gargoyles`, `glow_runes` (full), `vine_covered`, `bone_decoration`, `alchemy_pipes`
- [ ] **Faction color presets**: 12 factions × 7 building kinds = 84 preset DNA objects
- [ ] **Settlement preset packs**: hamlet pack (5 DNAs), village pack (12), town pack (20)

### Faction preset DNA table

| Faction | Primary style | Roof type | Wall color | Distinguishing feature |
|---|---|---|---|---|
| Human Rural | thatched | pitched | `#c8b88a` | flower baskets |
| Human Town | timber | pitched | `#d8c8a0` | jetty + Tudor frame |
| Human Noble | tudor/stone | hipped | `#d4ccb8` | portico + quoins |
| Elven | elven | organic | `#c8d8b0` | vine + living wood |
| Dwarven | dwarven | flat/carved | `#706860` | carved relief + iron |
| Vampire | vampiric | gothic steep | `#2a2030` | gargoyles + barred |
| Undead Common | ruined+stone | collapsed | `#5a5048` | bone decoration |
| Draconic | dwarven (dark) | flat iron | `#5a2010` | iron bars + glow |
| Celestial | arcane | dome | `#e8f0ff` | glow runes + open arches |
| Vulperia | timber | pitched | `#d4a060` | many small windows |
| Slime | nomadic | dome | `#aaffcc` | translucent + glow |
| Fae | fae | mushroom-cap | `#c8a8d0` | tiny scale + organic |

---

## Combinatorial variety examples

One `BuildingKind` × multiple styles produces very different results:

**Watchtower across factions:**
- `stone` + human → Norman round tower, battlements
- `stone` + vampiric → black obsidian spire, gargoyles
- `arcane` + celestial → white beacon, glowing apex
- `dwarven` + dwarven → squat granite block, carved face
- `timber` + vulperia → narrow, many arrow-slits, wooden
- `elven` → spiralling organic column, no battlements, open top
- `nordic` → stave-church-style wooden, turf base

**Cottage across factions:**
- `thatched` + human → English cottage, flowers
- `stone` + human → moorland croft, tiny windows
- `elven` → vine-covered, curved walls, leaf windows
- `dwarven` → half-buried, carved stone, single round window
- `vampiric` → barred windows, heavy lock, dark render
- `nomadic` + slime → translucent dome, iridescent glow
