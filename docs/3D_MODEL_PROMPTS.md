# 3D Model Generation Prompts — Tomes, Towers & Transmutation

> **How to use:** Paste the **Style Anchor** first, then the individual prompt.
> For character models always include the pose note at the end.
> Tested with Meshy.ai, Tripo3D, and Luma Genie.
> Target export: `.glb`, max 5k triangles per character, flat-shaded or minimal PBR.

---

## STYLE ANCHOR

> Copy this block into every prompt to lock the aesthetic.

```
Low-poly stylized 3D game asset, KayKit inspired, flat shaded solid colors,
slightly chibi proportions (head 1/4 body height), clean rounded silhouette,
vibrant saturated fantasy palette, no texture maps, vertex colors only,
game-ready topology, neutral background, white studio lighting.
```

**For characters add:**
```
T-pose, arms slightly out from sides, facing forward, full body visible,
suitable for GLB export with skeleton rig.
```

**For items/props add:**
```
Centered on origin, facing forward, no background, correct scale for a
hand-held or world-space prop in a 1-unit-per-metre game scene.
```

---

## PLAYABLE CHARACTERS

> These are the 19 `CharacterId` variants from the campfire conversation.
> The species group heading matches the in-game branch.

### Human Archetypes

**1 · rogue**
```
[STYLE ANCHOR] [T-POSE]
Human female rogue, slim leather armour in dark brown and forest green,
twin daggers at her hips, short auburn hair tucked under a bandana,
confident smirk, lightly armoured boots, fingerless gloves.
```

**2 · rogue_hooded**
```
[STYLE ANCHOR] [T-POSE]
Human rogue in a deep charcoal hooded cloak, hood up casting the face
in shadow with only glowing amber eyes visible, dark leather under-armour,
a single curved blade on the back, mysterious silhouette.
```

**3 · mage**
```
[STYLE ANCHOR] [T-POSE]
Human female mage, deep indigo robes with gold star embroidery,
tall pointed hat slightly bent at the tip, a carved wooden staff
topped with a glowing teal orb, round wire-rimmed spectacles,
silver hair, serene expression.
```

**4 · human_warrior**
```
[STYLE ANCHOR] [T-POSE]
Human male knight in full plate armour, royal blue with silver trim,
a longsword sheathed at the hip, rectangular heater shield on the
left arm bearing a golden sun emblem, strong jaw, short dark hair,
determined expression.
```

**5 · human_paladin**
```
[STYLE ANCHOR] [T-POSE]
Human female paladin, gleaming ivory armour with rose-gold accents,
a holy symbol on her breastplate (stylised sun cross), a warhammer
strapped to her back, golden shoulder-length hair, warm confident gaze,
faint golden aura around her hands.
```

**6 · human_bard**
```
[STYLE ANCHOR] [T-POSE]
Human male bard, flamboyant doublet in teal and burnt orange, a lute
slung across his back, a feathered cap in deep purple, knee-high boots
with buckles, curly chestnut hair, charming grin, a rapier at his belt.
```

---

### Undead Archetypes

**7 · skeleton_rogue**
```
[STYLE ANCHOR] [T-POSE]
Animated skeleton rogue, bare bleached bones with scraps of dark leather
armour strapped on (chest, one shoulder, shins), twin short blades,
a tattered bandana tied around the skull, small amber will-o-wisp flames
in the eye sockets, playful tilt to the head.
```

**8 · skeleton_mage**
```
[STYLE ANCHOR] [T-POSE]
Animated skeleton in tattered indigo mage robes, bony hands gripping an
obsidian staff topped with a pulsing violet orb, purple flames in the
eye sockets, a crown of rusted iron on the skull,
robes slightly ragged at the hem.
```

**9 · zombie**
```
[STYLE ANCHOR] [T-POSE]
Articulate zombie, clearly once a scholar — tattered waistcoat and
trousers, greenish-grey skin with patches of exposed bone,
one eye slightly larger than the other, monocle somehow still in place,
carrying a partially decomposed book, surprisingly dignified posture.
```

**10 · ghost**
```
[STYLE ANCHOR] [T-POSE]
Ethereal ghost, translucent pale blue-white, humanoid form that fades
to wispy trails below the waist, flowing ghostly robes, gentle glow,
sorrowful hollow eyes, arms slightly outstretched,
particle wisps trailing off the body edges.
```

**11 · mystery_undead**
```
[STYLE ANCHOR] [T-POSE]
Dark undead caster, midnight-black robes with deep purple lining,
the face hidden beneath a deep cowl with only two pinprick pale lights
for eyes, skeletal hands clasping a twisted bone staff,
ribbons of dark shadow energy curling off the hem,
silhouette deliberately ambiguous — could be ghost, lich, or something worse.
```

---

### Vulperia (Fox Folk) Archetypes

> Vulperia are bipedal anthro fox people — digitigrade legs, large expressive
> ears, bushy tails, fur patterns replacing clothing detail.

**12 · fox_rogue**
```
[STYLE ANCHOR] [T-POSE]
Vulperia rogue, a bipedal fox-person, russet orange fur with white muzzle
and tail tip, sleek dark leather armour, a wrapped cloth mask pulled
down around the neck, twin small blades at the thighs, nimble build,
mischievous narrow eyes, large tufted ears.
```

**13 · fox_ranger**
```
[STYLE ANCHOR] [T-POSE]
Vulperia ranger, tawny golden-brown fox-person, forest green cloak and
fitted archer's leathers, a recurve bow across the back, a quiver of
arrows, one ear slightly notched from a past scar, calm focused gaze,
a braided tail with a small carved wooden bead.
```

**14 · fox_mage**
```
[STYLE ANCHOR] [T-POSE]
Vulperia pyromancer, deep red-orange fox-person, flowing flame-coloured
robes that flicker at the hem, small flames dancing around the raised
hand, a copper fire-staff, bright amber eyes with vertical pupils,
tail curled upward and slightly ablaze at the tip.
```

**15 · fox_mysterious**
```
[STYLE ANCHOR] [T-POSE]
Vulperia wanderer, grey-silver fox-person, a weathered traveller's coat
in dusty sage green, a wide-brimmed hat, a walking staff with a lantern
hanging from it, one eye covered by an eyepatch, tail wrapped in cloth
bands, expression unreadable, something in the coat pocket glows faintly.
```

---

### Slime Archetypes

> Slimes are gelatinous blob creatures — no limbs unless noted, expressive
> faces formed by colour variation in the gel.

**16 · slime**
```
[STYLE ANCHOR]
Basic slime creature, rounded teardrop blob shape, cheerful translucent
bright green gel, simple circular black eyes with tiny white highlights,
slightly smiley expression, small wobble-waves in the silhouette,
glistening surface, no limbs.
Ground level, centred on origin.
```

**17 · slime_arcane**
```
[STYLE ANCHOR]
Arcane slime, a glowing crystalline blob, deep cobalt blue gel with
interior light patterns like floating runes, tentacle-like pseudopods
of solidified crystal extending outward, a single large pupil-less
glowing eye, crackling tiny lightning arcs on the surface.
```

**18 · slime_philosopher**
```
[STYLE ANCHOR]
Philosopher slime, a calm round blob in muted teal, small round
wire-rimmed spectacles somehow balanced on where a nose would be,
a tiny leather-bound book floating just in front of the slime body
(levitated, no hands), contemplative half-lidded expression,
a mortarboard hat perched on top.
```

**19 · slime_young**
```
[STYLE ANCHOR]
Young slime, very small round blob in pale translucent lime green,
huge wide innocent eyes taking up half the face, a tiny wobbly blob
antenna on top, mouth slightly open in curiosity,
scale roughly half the size of a regular slime, baby proportions.
```

---

## ENEMIES

### Basic Horde Enemies (low LOD, spawned in multiples)

**E1 · Goblin Grunt**
```
[STYLE ANCHOR] [T-POSE]
Small goblin warrior, big head with bat-like ears, lime green skin,
mismatched scavenged armour (one shoulder pad, dented helmet),
a rusty short sword, hunched posture, beady red eyes, toothy grin.
Roughly 60% the height of a human character.
```

**E2 · Goblin Archer**
```
[STYLE ANCHOR] [T-POSE]
Small goblin archer, same lime green goblin proportions, a rough leather
jerkin, a short bow clutched in one hand, a quiver on the back,
one eye squinted for aim, a crooked grin.
```

**E3 · Skeleton Warrior**
```
[STYLE ANCHOR] [T-POSE]
Basic skeleton soldier, yellowed bones, a rusty iron sword and a round
wooden shield with a crack through it, a dented iron helmet sitting
slightly off-centre on the skull, dim orange eye-flame.
```

**E4 · Skeleton Archer**
```
[STYLE ANCHOR] [T-POSE]
Skeleton archer, bare bones in a tattered leather vest, a longbow,
a quiver of mismatched arrows on the back, one arm extended forward
as if drawing, bright yellow eye-flames.
```

**E5 · Zombie Walker**
```
[STYLE ANCHOR] [T-POSE]
Shuffling zombie, grey-green decaying flesh, outstretched arms,
tattered peasant clothing (torn shirt, trousers), blank white eyes,
slow heavy posture, one foot dragged, dishevelled hair.
```

**E6 · Giant Rat**
```
[STYLE ANCHOR]
Large dungeon rat, four-legged, dark brown matted fur, oversized front
incisors, glowing red eyes, hunched aggressive stance, a scarred snout,
roughly the size of a medium dog, whiskers.
```

**E7 · Giant Spider**
```
[STYLE ANCHOR]
Dungeon spider, eight legs, bulbous black abdomen with a red hourglass
marking, mandibles clicking, multiple small eyes in a cluster,
slightly fluffy leg joints, roughly the size of a cat.
```

**E8 · Shadow Wraith**
```
[STYLE ANCHOR]
Shadow wraith, a humanoid silhouette made of swirling dark smoke,
no distinct features except two pale glowing eye-slits,
wispy tentacle-like limbs that trail upward,
floats slightly above the ground.
```

**E9 · Slime Enemy (hostile)**
```
[STYLE ANCHOR]
Hostile slime blob, bright acid-green, angry V-shaped eyes (not the
friendly player slime), jagged toothy mouth, corrosive-looking drips
along the base, slightly larger than the player slime variants.
```

**E10 · Barbarian Raider**
```
[STYLE ANCHOR] [T-POSE]
Human barbarian raider, broad and muscular, bare chest with fur
shoulder cape, horned helm, a large two-handed axe, war-paint stripes
on the face, wild tangled hair, aggressive scowl.
```

---

### Bounty Hunters / Human Threats

**E11 · Mercenary Swordsman**
```
[STYLE ANCHOR] [T-POSE]
Human mercenary, practical half-plate armour in dark grey and brown,
a longsword and a hand shield, close-cropped hair, scarred cheek,
a coin pouch at the belt, professional neutral expression.
```

**E12 · Bounty Hunter**
```
[STYLE ANCHOR] [T-POSE]
Human bounty hunter, long dark duster coat, wide brimmed hat,
a crossbow in one hand and a coil of rope at the hip,
sharp calculating eyes, several wanted-poster scrolls stuffed in a
belt pouch, weathered boots.
```

**E13 · Dark Cultist**
```
[STYLE ANCHOR] [T-POSE]
Dark cultist, billowing black hooded robe with deep crimson lining,
a ritual dagger in one hand, the hood up with only pale lips visible,
arcane glyphs embroidered on the sleeves, a pendant shaped like
a cracked eye on a chain.
```

**E14 · Armoured Guard Captain**
```
[STYLE ANCHOR] [T-POSE]
Human guard captain, heavy armour in town-guard blue and silver,
a plumed helmet, a longsword at the hip and a barked-command posture,
a cape billowing behind, commanding broad-shouldered build.
```

---

### Dungeon Creatures

**E15 · Stone Golem**
```
[STYLE ANCHOR] [T-POSE]
Stone golem, blocky humanoid form built from rough hewn granite blocks,
glowing amber runes carved into the chest, mossy cracks between
the stone segments, no neck (head sits directly on shoulders),
fists like boulders, slow and heavy silhouette.
```

**E16 · Animated Armour**
```
[STYLE ANCHOR] [T-POSE]
Animated suit of plate armour with nothing inside — gaps at the joints
show only darkness and faint purple energy, visor glows violet,
one arm holds a halberd, the other is raised as if defending,
slightly unnatural joint angles that no living person could hold.
```

**E17 · Dungeon Bat Swarm**
```
[STYLE ANCHOR]
A cluster of 5–7 small cave bats flying in tight formation,
dark brown leathery wings, tiny red eyes, fangs bared,
treat the whole swarm as one model unit flying together,
wingspan per bat roughly 30cm.
```

**E18 · Cave Troll**
```
[STYLE ANCHOR] [T-POSE]
Cave troll mini-boss, massive hunched humanoid, grey-blue rocky skin,
a huge club over one shoulder, small red eyes under a heavy brow,
moss and fungi growing in the skin cracks, roughly 2× player height,
wart-covered knuckles dragging near the ground.
```

---

### Boss / Named Enemies

**E19 · The Necromancer**
```
[STYLE ANCHOR] [T-POSE]
Necromancer boss, a tall gaunt human in floor-length black and deep
purple robes, a crown of finger bones on the head, one hand raised
with green death-energy crackling between the fingers, hollow sunken
cheeks, pale yellow eyes, a grimoire floating open beside them.
```

**E20 · The Lich Lord**
```
[STYLE ANCHOR] [T-POSE]
Lich boss, a skeleton king in ornate obsidian and gold plate armour,
a tall iron crown, a sceptre topped with a glowing soul-gem in
sickly green, robes of shadow fabric trailing behind, the ribcage
partially visible through the armour, an aura of dark energy rising
like smoke from the shoulders.
```

**E21 · Vampire Count**
```
[STYLE ANCHOR] [T-POSE]
Vampire boss, aristocratic human male, pale chalk-white skin, a deep
crimson nobleman's coat with black lapels and gold buttons,
slicked-back raven hair, elongated canine fangs visible in a
half-smile, gloved hands with unnaturally long fingers,
a blood-red gemstone brooch.
```

**E22 · Dragon Whelp**
```
[STYLE ANCHOR] [T-POSE]
Young dragon, roughly wolf-sized, scales in deep copper-orange with
a cream underbelly, a small pair of leathery wings folded on the back,
a stubby horn nub on the snout, an oversized head relative to body,
tiny clawed feet, a smoke wisp from the nostril, somehow still cute.
```

---

## WIZARD CHARACTERS (Campfire Scene NPCs)

> The campfire wizard is randomly selected from 3 variants.
> Additional variants can expand the pool.

**W1 · Toad Wizard** *(already in game — reference for style)*
```
[STYLE ANCHOR] [T-POSE]
Elderly toad wizard, a rotund anthropomorphic toad in deep green and
brown mage robes, a wide brimmed hat with a slight lean, a gnarled
wooden staff, large bulging amber eyes behind small half-moon
spectacles, a warm grandfatherly expression, webbed three-fingered hands.
```

**W2 · Elf Wizard** *(already in game — reference)*
```
[STYLE ANCHOR] [T-POSE]
Elven wizard, slender tall elf with long silver-white hair, silver
robes with leaf-vine embroidery, long elegant pointed ears, a smooth
pale complexion, a staff of living wood still bearing small leaves,
violet eyes, an air of quiet authority.
```

**W3 · Lizard Wizard** *(already in game — reference)*
```
[STYLE ANCHOR] [T-POSE]
Lizard-person wizard, an anthropomorphic lizard in dusty sienna mage
robes, a flat snout, a fan of neck frills raised slightly,
a blue and yellow tail swishing behind, a staff wrapped in copper
wire with crystals, sharp curious eyes.
```

**W4 · Gnome Wizard** *(new variant)*
```
[STYLE ANCHOR] [T-POSE]
Gnome wizard, very short and round, snow-white bushy eyebrows and
a matching handlebar moustache, deep purple robes too long at the hem,
a staff topped with a spinning clockwork orrery, a jewelled monocle,
rosy cheeks, a kindly but slightly manic expression.
```

**W5 · Cat Wizard** *(new variant)*
```
[STYLE ANCHOR] [T-POSE]
Cat-person wizard, anthropomorphic cat, sleek black fur with a white
chest patch, half-moon spectacles balanced on a flat feline nose,
flowing midnight-blue robes, a staff of polished bone, one ear slightly
torn, a long striped tail curling behind, inscrutable yellow eyes.
```

**W6 · Mushroom Wizard** *(new variant)*
```
[STYLE ANCHOR] [T-POSE]
Fungal wizard, a small humanoid being with a huge flat mushroom cap
for a head (red with white spots), a mossy green robe, glowing spore
particles drifting upward from the cap edges, a staff of twisted root,
tiny black bead eyes, speaking in a cloud of spores.
```

---

## NPCs (World Inhabitants)

### Settlement NPCs

**N1 · Town Guard**
```
[STYLE ANCHOR] [T-POSE]
Town guard, stocky human in simple blue livery over chainmail,
an iron helmet with a nose guard, a spear in one hand and a round
shield on the other arm, a belt with a short sword,
a bored but dutiful expression.
```

**N2 · Merchant**
```
[STYLE ANCHOR] [T-POSE]
Travelling merchant, a portly human in a brown travelling coat with
many pockets, a large pack on the back with goods poking out
(rolled fabric, a pot, a lantern), a wide hat, a ledger tucked
under one arm, a friendly but shrewd expression.
```

**N3 · Innkeeper**
```
[STYLE ANCHOR] [T-POSE]
Innkeeper, a cheerful stout human in a linen shirt with rolled sleeves
and a leather apron, a clay tankard in one hand and a cloth in the
other, rosy cheeks, thinning hair, a warm smile,
the apron has a faded crest on it.
```

**N4 · Scholar / Librarian**
```
[STYLE ANCHOR] [T-POSE]
Scholar, a slight human in ink-stained grey robes, a stack of books
tucked under one arm and one open in the raised hand,
round glasses, a quill tucked behind one ear,
a slightly distracted expression, papery complexion.
```

**N5 · Blacksmith**
```
[STYLE ANCHOR] [T-POSE]
Blacksmith, a broad-shouldered human with defined arms, a thick
leather apron with burn marks, a heavy hammer resting on one shoulder,
a bandana around the forehead, sleeves rolled up, soot on the cheeks,
confident relaxed stance.
```

**N6 · Farmer**
```
[STYLE ANCHOR] [T-POSE]
Peasant farmer, a plain human in rough linen tunic and trousers, straw
hat, muddy boots, a hoe or pitchfork in one hand, calloused hands,
a friendly but weary expression, a simple belt pouch.
```

**N7 · Healer / Cleric**
```
[STYLE ANCHOR] [T-POSE]
Village healer, a human in white and pale gold robes with a sun-cross
emblem, a herb satchel on the hip, gentle hands, warm eyes,
a small holy symbol on a necklace, an air of calm authority.
```

**N8 · Alchemist**
```
[STYLE ANCHOR] [T-POSE]
Alchemist, a wiry eccentric human in a stained laboratory coat,
goggles pushed up on the forehead, multiple vials and tubes in belt
holsters, wild grey hair standing out sideways, a curious eager
expression, green-stained fingers.
```

**N9 · Caravan Driver**
```
[STYLE ANCHOR] [T-POSE]
Caravan driver, a weathered human in practical travelling clothes,
a wide-brim hat, a long driving whip coiled at the belt, dusty boots,
a short beard, squinting road-watching eyes, a comfortable slouch.
```

---

### Faction-Specific NPCs

**N10 · Elder Slime**
```
[STYLE ANCHOR]
Elder slime, a large ancient slime blob three times normal size,
deep ocean-blue translucent gel, a long white beard made of
a denser gel formation below the face, multiple concentric ring
eye patterns, a small crown of fossilised coral on top,
radiates calm gravitas.
Ground level, centred on origin.
```

**N11 · Fox Elder**
```
[STYLE ANCHOR] [T-POSE]
Vulperia elder, an aged fox-person with silver-white fur and deep
amber eyes, a long ceremonial robe in forest green and rust orange,
a carved bone staff topped with feathers, a long white-tipped tail
moving slowly, deep face wrinkles suggesting great age,
a knowing expression.
```

**N12 · Human King / Queen**
```
[STYLE ANCHOR] [T-POSE]
Fantasy monarch, human, an elaborate crown of gold and sapphire,
a regal mantle in deep crimson trimmed with white, a ceremonial
sceptre, a firm dignified posture, fine embroidered clothing underneath
the mantle, a signet ring, expression of composed authority.
```

**N13 · Lich Advisor** *(not hostile — undead court advisor)*
```
[STYLE ANCHOR] [T-POSE]
Undead court advisor, a dignified lich in a tailored formal coat
of black with bone-white lapels, a monocle of polished soul-crystal,
gaunt skeletal face with a wisp of moustache still attached,
a clipboard of parchment under one arm, pinprick purple eye-flames,
surprisingly bureaucratic energy.
```

**N14 · Bounty Board Keeper**
```
[STYLE ANCHOR] [T-POSE]
Quest board keeper, a no-nonsense human woman, short cropped hair,
a practical vest over a linen shirt, rolled-up wanted posters tucked
into a satchel, a quill and inkpot at the belt, reading glasses,
a cork-board covered in notices just visible over her shoulder.
```

---

## ITEMS & PROPS

### Potions (small bottles, all same base shape with colour variation)

**P1 · Health Potion**
```
[STYLE ANCHOR] [ITEM]
Small glass vial with a cork stopper, filled with glowing crimson
liquid, tiny heart symbol etched on the glass, warm red inner glow.
```

**P2 · Mana Potion**
```
[STYLE ANCHOR] [ITEM]
Small glass vial, filled with luminous cobalt-blue liquid, tiny star
symbol etched on the glass, cool blue inner glow, bubbles drifting up.
```

**P3 · Strength Potion**
```
[STYLE ANCHOR] [ITEM]
Chunky glass bottle with a wax-sealed top, filled with amber-orange
liquid with dark swirls, a small muscle-arm symbol on the label,
warm golden glow.
```

**P4 · Speed Potion**
```
[STYLE ANCHOR] [ITEM]
Slim aerodynamic vial, filled with bright green liquid with electrical
sparks visible inside, a small lightning bolt etched on the glass.
```

---

### Weapons

**W · Longsword**
```
[STYLE ANCHOR] [ITEM]
Fantasy longsword, straight double-edged blade in polished steel,
a crossguard of dark iron, a wrapped leather grip, a round pommel
with a small gem, classic and clean.
```

**W · Mage Staff**
```
[STYLE ANCHOR] [ITEM]
Wooden mage staff, gnarled oak wood, wrapped with copper wire near the
top, a large glowing teal orb caged in a wooden cradle at the tip,
slight natural curve to the wood, subtle magical shimmer.
```

**W · Short Bow**
```
[STYLE ANCHOR] [ITEM]
Short recurve bow, laminated wood in light and dark layers, sinew
string, carved leaf motifs at the limb tips, unstrung to show the
elegant curve.
```

**W · Dagger**
```
[STYLE ANCHOR] [ITEM]
Rogue's dagger, a slim blade with a single edge, dark wooden handle
with a small crossguard, brass finger ring at the base of the blade,
compact and practical.
```

**W · Warhammer**
```
[STYLE ANCHOR] [ITEM]
Paladin warhammer, a short-hafted hammer with a wide flat striking
face, one side flat and one side spiked, a holy sun symbol inlaid in
the face, a wrapped leather grip, a round pommel.
```

---

### World Props / Fixtures

**F1 · Campfire**
```
[STYLE ANCHOR] [ITEM]
Campfire prop, a ring of grey stones surrounding a pile of burning
logs, stylised low-poly flames in layers of orange, yellow and white,
a slight ember glow on the stones, simple and iconic.
```

**F2 · Treasure Chest**
```
[STYLE ANCHOR] [ITEM]
Wooden treasure chest, dark oak planks with iron bands and corner
brackets, a large iron lock on the latch, slightly domed lid,
brass tack details, warm wood-brown tone.
Open variant: lid open, golden light spilling out from inside.
```

**F3 · Notice Board / Quest Board**
```
[STYLE ANCHOR] [ITEM]
Wooden notice board on two posts, a rough-hewn rectangular board face
covered in pinned parchment notices and wanted posters, a small
lantern hanging from one post, warm aged wood, the papers overlapping.
```

**F4 · Merchant's Market Stall**
```
[STYLE ANCHOR] [ITEM]
Market stall, a wooden trestle table with a striped canopy in warm
yellow and red, goods displayed on the table (small crates, vials,
fabric rolls), a coin box, a small hanging scale, cheerful and busy.
```

**F5 · Crafting Cauldron**
```
[STYLE ANCHOR] [ITEM]
Iron cauldron on three legs over a small fire, the cauldron filled
with a glowing purple bubbling liquid, arcane runes etched around
the rim, green and violet vapour wisping upward, chunky low-poly.
```

**F6 · Ancient Ruins Pillar**
```
[STYLE ANCHOR] [ITEM]
Broken stone pillar, rough-cut grey granite, cracked near the middle
with the top piece fallen and resting against the base, moss growing
in the cracks, faint worn carvings of spirals and runes on the surface.
```

**F7 · Ore Rock Node**
```
[STYLE ANCHOR] [ITEM]
Rock with ore vein, a chunky grey boulder with veins of bright
orange-copper ore gleaming on one face, a pickaxe scratch mark on
the surface suggesting it has been worked before,
faceted angular rock geometry.
```

**F8 · Timber Log Node**
```
[STYLE ANCHOR] [ITEM]
Felled timber log, a cross-section of a large tree trunk with visible
growth rings, bark on the outside, flat cut ends, light pine colour.
The full log model: a large pine tree stump with one clean cut, the
fallen trunk at the base.
```

**F9 · Magical Anomaly Crystal**
```
[STYLE ANCHOR] [ITEM]
Magical anomaly, a cluster of large faceted crystals growing out of
the ground, deep purple and violet, glowing from within with a pulsing
light, arcane energy arcs between the crystal tips,
slightly ethereal and wrong-feeling.
```

**F10 · Dungeon Entrance Archway**
```
[STYLE ANCHOR] [ITEM]
Dungeon entrance archway, two large stone pillars with a carved arch
connecting them, the doorway filled with darkness and a faint green
glow from deep within, worn skull motif above the keystone,
iron torch brackets on each pillar (unlit), ominous atmosphere.
```

---

## BUILDINGS (Settlement Structures)

**B1 · Tavern / Inn**
```
[STYLE ANCHOR] [ITEM]
Fantasy tavern building, two-storey, timber-framed construction with
plaster panels in warm cream, a thatched roof, a hanging wooden sign
(a tankard silhouette), window-box flowers, a welcoming arched doorway,
warm candlelight visible in the windows.
```

**B2 · Blacksmith Forge**
```
[STYLE ANCHOR] [ITEM]
Blacksmith forge, a squat stone building with a large open front,
an anvil visible inside, a stone chimney venting dark smoke,
a weapon rack on the outside wall, a water barrel with tongs
resting on the rim, a glowing orange furnace glow from within.
```

**B3 · Merchant's Shop**
```
[STYLE ANCHOR] [ITEM]
Merchant's shop building, a neat two-storey stone and timber structure,
a colourful striped awning over the front window display,
stacked crates and barrels outside, a bell above the door,
a sign with a coin and scales symbol.
```

**B4 · Tower (player's base)**
```
[STYLE ANCHOR] [ITEM]
Wizard's tower, a tall narrow cylindrical stone tower, slightly tapering
toward the top, a conical pointed roof, arrow-slit windows, a wooden
door at the base banded with iron, glowing windows near the top
suggesting an inhabited study, ivy climbing one side,
a gargoyle on the roof peak.
```

**B5 · Ruined Cottage**
```
[STYLE ANCHOR] [ITEM]
Ruined stone cottage, collapsed roof on one side, mossy weathered
stone walls, a crumbling chimney, empty window frames, a broken door
frame, grass and weeds growing through the floor,
atmospheric decay.
```

---

## VEHICLES & TRANSPORT

**V1 · Merchant Caravan Wagon**
```
[STYLE ANCHOR] [ITEM]
Covered merchant wagon, a sturdy four-wheeled wooden wagon with a
canvas cover over wooden bows in cream and green stripes,
a driver's bench at the front, lanterns hanging at the corners,
goods packed in the back visible under the cover,
wooden wheel spokes with iron rims.
```

---

## BATCH GENERATION TIPS

> When ordering many models at once, use these batch groupings for consistent
> inter-model proportions.

| Batch | Contents | Key scale note |
|---|---|---|
| Player heroes | All 19 CharacterId variants | All same height (1.8m) |
| Wizard variants | W1–W6 | Slightly shorter and rounder than heroes |
| Horde enemies | E1–E9 | Mix of sizes — see per-prompt height notes |
| Boss enemies | E19–E22 | 1.5–2× hero height |
| World NPCs | N1–N14 | Same height as heroes |
| Items | P1–P4, all W and F prompts | Scale to 0.3m or 1.0m as noted |
| Buildings | B1–B5 | Scale 3–6m height |

---

*Last updated: 2026-07-16*
