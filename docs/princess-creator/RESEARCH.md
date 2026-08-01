# RESEARCH — How Spore Did It, How Others Did It, What We Do

> Compiled 2026-07-18. Every claim below carries its source. This doc exists so
> future contributors don't re-litigate solved problems.

---

## 1. Spore's Creature Creator — the actual tech

### 1.1 The skin: metaballs (implicit surface) over an editable spine

Chris Hecker (Maxis technology fellow, wrote the skin + animation + paint
systems) documents the creature skin in his "Liner Notes for Spore":

- The entire creature skin is **one blobby implicit surface (metaballs)**,
  regenerated in real time as the player deforms the torso and attaches limbs.
  Implicit surfaces were chosen for **topological robustness** over local
  control — the skin must always flow smoothly over any morphology the player
  produces, and the "recipe" must stay tiny for sharing.
- **Spherical metaballs only** (fast to evaluate), distributed along limbs and
  torso with spacing computed from the implicit parameters so the surface stays
  smooth. Falloff: a **4th-order polynomial in squared distance** (a 2nd-order
  term squared again for continuous derivatives → no lighting discontinuities).
- One surface, no metaball groups → skin **webs between close limbs**. Players
  turned this bug into bat wings. Hecker: *"Bugs + Player Creativity =
  Features."*
- Tessellation: ear-clipping originally (Marching Cubes was patented until
  ~2005); high-quality uniform meshes came from **Moore & Warren, "Mesh
  Displacement: An Improved Contouring Method for Trivariate Data"** (Graphics
  Gems III) — Hecker calls it "the secret to high quality implicit surface
  tessellations".
- **Bone weights are assigned by which body part generated which metaball** —
  that's how the blobby mesh animates without manual skinning.

Sources:
- https://chrishecker.com/My_Liner_Notes_for_Spore
- https://beyondsims.com/2009/05/ask-maxis-interview-with-spores-chris-hecker-answers-here/ (spheres-only rationale, negaballs, prototype metaball editor)

### 1.2 The parts: "rigblocks"

Everything that isn't blobby body — mouths, eyes, hands, feet, spikes, details
— is a **hand-authored part ("rigblock")** that snaps onto the body:

- ~228 functional parts in 7 categories (Mouths, Sensory, Limbs, Hands, Feet,
  Weapons, Details) + cosmetic details.
- Each placed part has **per-instance morphs**: morph handles (arrows), a
  rotation ball, and mouse-wheel scaling. Same part reads very differently
  across creatures.
- **Symmetry is the default**; asymmetry is opt-in. Alt-drag duplicates a part;
  Ctrl tears limbs apart / snaps segments together.
- Parts carry **gameplay stats** (bite/charge/sneak/dance…) and cost DNA points
  — cosmetic choice has mechanical meaning, and the budget constrains chaos.

Sources:
- https://remptongames.com/2022/08/07/how-the-spore-creature-creator-works/ (+ video: https://www.youtube.com/watch?v=ZFdj9wPNSD0)
- Official tutorial w/ John Cimino (editing grammar, undo, naming dice):
  https://www.youtube.com/watch?v=ZRr3lgckIAM

### 1.3 The paint: 3 procedural layers

Texturing = **base coat + coat pattern + detail layer**, each applied by
"particle painters" that flow over the surface — guaranteeing continuous
texture on any topology. Player picks layers + colors; the system does the
painting. (Rempton Games breakdown, Hecker's liner notes on the 3D paint
prototype.)

### 1.4 The animation: morphology-independent retargeting

Hecker et al., *"Real-time Motion Retargeting to Highly Varied User-Created
Morphologies"* (SIGGRAPH 2008):

- Animators author gestures in a tool (Spasm) against **semantic selections**
  ("all grippers", "the spine"), not concrete bones.
- Data is stored **generalized** (character-independent); at runtime it is
  **specialized** onto the actual creature and fed to a robust IK solver.
- Spine solving uses particles+constraints only at IK branch points, quintic
  Hermite spline reconstruction, and an **anti-buckling** blend back to rest
  pose.
- Test Drive mode = a stage where those emotes play (dance, wave, roar…), which
  is *why* creatures feel alive before ever entering the game.

Source: https://www.chrishecker.com/Real-time_Motion_Retargeting_to_Highly_Varied_User-Created_Morphologies

### 1.5 The design philosophy: "Magic Crayons"

Chaim Gingold's GDC 2007 talk (design lead of the editors):

- Goal = the ease + delight of a crayon that makes real, living things
  (*Harold and the Purple Crayon*).
- **Deliberately reduce editor breadth**: constraints maximize the odds any
  player output is well-formed and minimize confusion. No polygon-level access.
- Build a **design grammar of recognizable blocks** (torso, mouth, limb…) so
  player expectations map onto the tool.

Source: https://www.gamespot.com/articles/gdc-07-creating-spore/1100-6167215/

### 1.6 The share format: tiny recipes (and the PNG trick)

Creature "DNA" is deliberately small enough to transmit — famously, Spore
embeds the full creature definition **inside the creature's PNG portrait**
(steganographically), so sharing a picture *is* sharing the creature. We adopt
the same spirit: a compact versioned JSON ⇄ base64url share code, and PNG
portraits saved alongside DNA in the gallery. (Optional future: embed DNA in
the PNG like Spore.)

---

## 2. The reference video (user-provided)

**"Creature Creator App — Three.js" (VOID / VOIDENGINE, NZ)**
https://www.youtube.com/watch?v=qETZFWyTvQQ

A solo-dev, Three.js, Spore-inspired creature creator: interactive editing,
painting, and **3D model export**, explicitly positioned as "create 3D
characters without AI". Takeaways for us:

- A browser + Three.js Spore-like is absolutely viable as a polished standalone
  tool (that's the whole premise of this project).
- Export (GLB) and paint are first-class features, not afterthoughts.
- Single-page, no-backend architecture — same as ours.

## 3. Our own prior art (this repo)

- **`src/creatures/`** (DNA → Builder → Animator, base64 codes, canvas-texture
  faces/skins, mulberry32-seeded randomizer, archetype prop allow-lists) —
  proven patterns we re-apply; it now serves as the DevLab NPC/enemy generator
  (see `docs/CREATURE_CREATOR_PLAN.md`). The Princess Creator is a separate,
  more focused tool with different DNA and far higher visual polish bar.
- **Four Gemini POCs** (`POC/`), which are our art-direction ground truth:

| POC | Proved | We keep |
|---|---|---|
| `spore_creature_poc_slime_princess.html` | MarchingCubes body re-blobbed **every frame** from animated joint positions; MeshPhysicalMaterial (transmission 0.6, ior 1.4, thickness 2) reads as jelly; separate tracked eye group with slime "lids" | The whole approach: resolution ~45–56, world→volume mapping with edge clamping, per-frame `reset()+addBall()+update()`, fake-IK limb blobs, twin-tail blobs as hair |
| `low_poly_fox_princess_2.html` | Flat-shaded hex-cone dress + icosahedron head + cone snout/ears reads instantly as "fox princess"; hierarchical 5-segment tail with sine-propagated swish; pivot-at-joint `createLimbPart` pattern; random ear flicks | Everything, modularized; ear/tail become shared parts with fox defaults |
| `chibi_skeleton_princess_1.html` | `createBone` (cylinder shaft + icosahedron joint knob); skull = icosahedron with flattened jaw verts; inset socket boxes + glowing pupils + eye point-lights; 5-segment cape ripple; crooked crown charm | Everything; cape becomes a shared back-part; glow eyes become an eye style |
| `chibi_human_princess_1.html` | Smooth toon look (sphere head, capsule limbs); layered anime eyes (base+iris+2 highlights); hair cap + bangs + physics pigtails; bell dress + ruffle torus + waist ribbon + back bow; puffy sleeves; crown w/ jewel | Everything; pigtails/bow/crown become parts; eye stack becomes the `sparkle` eye style |

- **Reference art** (`princess_1_reference.png`, `punk_rock_mage.png` …): the
  canonical TTT princess is a **punk-rock royal** — midnight-navy dress, black
  leather harness details, combat boots, dark tiara, blonde bob, ~4 heads tall,
  big calm eyes. Consequence: our default human palette is *Midnight Punk*, and
  pastel storybook sets are alternates, not the default.

## 4. Technique decisions (with rationale)

| System | Spore's way | Our way | Why |
|---|---|---|---|
| Body surface | One metaball skin for everything + rigblock parts | **Hybrid**: parametric low-poly part construction for human/fox/skeleton; true metaball (MarchingCubes addon) body for slime | The TTT art style *is* readable low-poly primitives (GDD: "procedural primitives + GLSL", POC ground truth). Slime is where blobby tech pays rent. One `BodySynthesizer` contract keeps the editor archetype-agnostic |
| Tessellation | Ear clipping → (Moore & Warren quality) | `three/addons` MarchingCubes (patent long dead) at res 48–56, rebuilt per frame | POC-proven at 60fps; per-frame re-blob gives free squash/stretch/jiggle animation |
| Skinning | Bone weights from metaball ownership | FK hierarchy of pivot `Group`s (parts parent to joints); slime re-blobs from joint positions instead of skinning | No skinned-mesh complexity; matches POCs; export still bakes to static or simple rig |
| Parts | 228 rigblocks, DNA point economy | ~20 curated parts across 8 sockets to start; no point economy (this is a dev/player cosmetic tool, stats hook optional later) | Curation > volume for 4 fixed silhouettes; economy adds friction without gameplay here |
| Morph handles | 3D drag handles on every part | Sliders/chips first (Phase ≤6); direct-manipulation handles are Phase 7 polish | Handles are the most expensive UX item; sliders keep the tool always-shippable (creature-creator plan learned the same) |
| Symmetry | Default mirrored placement | Paired sockets (ears, pigtails, arms) are **always** mirrored; asymmetry via per-part `tilt` params (crooked crown) | Chibi princesses read best symmetric; controlled asymmetry as charm, not freedom |
| Paint | 3-layer particle painting | 3-slot palette system (primary/secondary/accent + skin/hair/eyes/metal/glow) with curated palettes per archetype; canvas-texture patterns Phase 5 | Flat-shaded low-poly bodies take color per-material, not per-texel; palettes enforce cohesion |
| Animation | Generalized gesture retargeting + IK | Shared procedural chibi gait/idle on the common rig contract + per-archetype secondary motion hooks (tail swish, cape ripple, pigtail bounce, jelly bob) + emote clips (wave/twirl/dance/cast) | Our morphology space is 4 known bipeds — full retargeting is overkill; the *feeling* of Test Drive is what we replicate |
| Sharing | DNA in PNG portrait | base64url JSON share code + gallery thumbnails (PNG-embedded DNA = future nicety) | Simple, debuggable, versioned |
| Naming | Random name dice | Seeded syllable name generator with 🎲 | Same delight, 30 lines |

## 5. Performance notes

- MarchingCubes cost ~ O(res³) per update; POC ships 45³ at 60fps on mid
  hardware with ~40 balls. We cap res at 56, ball count ≤ 64, and skip
  re-blob when tab hidden. Slider-driven *structural* rebuilds are coalesced
  to once per animation frame.
- Low-poly synths rebuild in <2ms (few hundred triangles); rebuild-on-change is
  fine (POC-proven). Color-only edits **never** rebuild — they retint the
  shared `MaterialKit`.
- Geometry/material disposal is mandatory on rebuild (`BuildResult.dispose()`),
  else slider-scrubbing leaks GPU memory fast.

## 6. Supplementary research

Additional findings (community implementations survey, THREE.MarchingCubes
export details, GLTF transmission support, chibi proportion + kawaii palette
theory, character-creator UX patterns) are appended in
[RESEARCH_SUPPLEMENT.md](RESEARCH_SUPPLEMENT.md) as they are compiled.
