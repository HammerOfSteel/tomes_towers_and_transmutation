# RESEARCH SUPPLEMENT — Community Implementations, Export Tech, Chibi & Kawaii Theory, Creator UX

> Compiled 2026-07-18 by a dedicated research pass. Complements RESEARCH.md
> (which covers Spore's own tech). Findings below carry inline sources.

## 1. Open-Source / Community Spore-Like Creature Creators

- **Pudgy Pals Procedural Creature Generator** (CIS566 course project, 2018) — closest browser-based analog found. Raymarched SDF primitives (not MarchingCubes). Spine = 4 control points on a De Casteljau spline with 8–12 metaballs placed along it (radius randomized, smaller balls pulled closer to keep torso continuous). Up to 4 limb pairs from spine anchor points, mirrored across X. **Steal:** the "spline + metaballs with radius correlated to inter-ball distance" trick for guaranteed-continuous torsos. **Caveat:** raymarched SDF, not exportable geometry.
- **daniellochner "Creature Creator"** (Unity, GPL-3.0) — full Spore-inspired system that shipped as a standalone Steam game. Validates that a rigblock/metaball hybrid scales to a shipped product; reference for rigblock snapping + animation logic.
- **VOID Engine creature creator (NZ dev, three.js — the user's reference video qETZFWyTvQQ)** — no public repo, devlog, or writeup found beyond the YouTube video. Treat as video-only inspiration (interactive editing, painting, model export in browser three.js), not a reusable technical reference.
- **jonasz-o "3D Paint"** (itch.io) — browser metaball-brush sculptor using Marching Cubes with GLB/OBJ/STL export + Draco toggle. Best available reference for the "sculpt with metaballs, export clean mesh" pipeline our slime needs.
- **Parts-based procedural creators**: JuanchoGithub/starfleet-ship-creator (deep per-part sliders + one-click randomize) and the Medium writeup "Procedural generation of 3d objects with three.js" (Factory/Builder/Placer/Provider pattern + a Rules system to prevent invalid part combos — applicable to archetype-specific constraints).
- Generic THREE.MarchingCubes demos (takumi0125/threejsMarchingCubesMetaball, sjpt/metaballsWebgl GPU variant, koji014/interactive-droplets) — usage references only, none are character tools.

Sources: https://github.com/nmagarino/Pudgy-Pals-Procedural-Creature-Generator · https://nmagarino.github.io/Pudgy-Pals-Procedural-Creature-Generator/ · https://github.com/daniellochner/SPORE-Creature-Creator · https://jonasz-o.itch.io/3d-paint · https://github.com/JuanchoGithub/starfleet-ship-creator · https://medium.com/@LEM_ing/procedural-generation-of-3d-objects-with-three-js-9874806da449 · https://github.com/sjpt/metaballsWebgl · https://github.com/takumi0125/threejsMarchingCubesMetaball

## 2. Spore's DNA-in-PNG Trick ("Pollination")

- Spore share cards are ordinary PNG portraits that fully reconstruct the creation when dragged into the editor — even straight from a browser without saving. Renaming survives; pixel editing/re-encoding breaks it.
- **Mechanism**: LSB steganography across all four RGBA channels (1–2 LSBs, varied per image with random padding), concentrated where visual error is imperceptible. Chosen over PNG tEXt metadata because raw pixel encoding survives the OS/browser **clipboard** (32-bit image copy) and most lossless resaves; metadata chunks get stripped by hosts.
- **Payload**: deflate-compressed stream = "Pollen Metadata" header (name/description/tags/author/asset lineage/timestamps) + the Spore Model XML (rigblock/paint recipe). Hard cap: **8183 bytes decompressed** per 128×128 PNG — the tiny-recipe representation is what makes this possible.
- **Why brilliant**: every shared image anywhere on the internet IS the save file. Zero infrastructure.
- For us: a future nicety (embed share code in exported PNG portrait). Our base64url share code already follows the same tiny-recipe philosophy.

Sources: https://nedbatchelder.com/blog/200806/spore_creature_creator_and_steganography · https://gamedev.stackexchange.com/questions/72760/how-can-i-store-game-metadata-in-a-png-file · https://spore-community.github.io/docs/pollination/pollen_metadata · https://github.com/Spore-Community/SporePngDecoder.ts

## 3. THREE.MarchingCubes — API, Performance, Export, Alternatives

**API (r134+ / r170-era):**
- `new MarchingCubes(resolution, material, enableUvs, enableColors, maxPolyCount)` — `maxPolyCount` (default 10000) is a **hard buffer cap set at construction**; exceeded = silent truncation + warning. Size 20,000–50,000 for a character-scale blob.
- Since PR #22642, MarchingCubes extends `Mesh`; buffers rebuild in `onBeforeRender()` while dirty.
- `addBall(x, y, z, strength, subtract)` takes **normalized 0–1 grid coords**. `reset()` + `addBall()`s + `update()` per frame is the live-editing model.
- **`generateGeometry()`** returns a detached, correctly-sized `BufferGeometry` — the method to call once at export time to bake the blob for GLTF (verify output on r170; re-run `mergeVertices`/bounds if needed).

**Performance:**
- Cost ~ O(resolution³); ball count is comparatively cheap. Canonical example defaults to resolution 28 (GUI 14–100), numBlobs 1–50.
- Practical bands for one chibi character: **28–40 live editing**, **50–70 final preview**, **80+ only for one-shot export bake**.
- Avoid per-blob vertex colors (documented 60→20fps regression, later fixed) — tint via material, not vertex colors.

**Alternatives:** npm `isosurface` / `surface-nets` (fewer triangles per fidelity, manual integration), raymarched SDF (no mesh → no export), gl-isosurface3d (sci-viz). **Recommendation: stay on THREE.MarchingCubes** — first-party, documented, `generateGeometry()` export path. Surface nets only if GLB size becomes a problem.

Sources: https://threejs.org/docs/pages/MarchingCubes.html · https://github.com/mrdoob/three.js/blob/master/examples/webgl_marchingcubes.html · https://github.com/mrdoob/three.js/pull/22642 · https://github.com/mrdoob/three.js/pull/13955 · https://github.com/mrdoob/three.js/pull/15799 · https://github.com/pmndrs/drei/blob/master/src/core/MarchingCubes.tsx · https://github.com/mikolalysenko/isosurface · https://github.com/mikolalysenko/surface-nets

## 4. GLTFExporter Gotchas (procedural scenes)

- **CanvasTexture exports fine in-browser.** Avoid `DataTexture` for painted patterns (edge-case failures; PR #20588 only partially fixed) — paint into a real canvas + `CanvasTexture`.
- **Transmission**: exporter emits `KHR_materials_transmission` when `material.transmission !== 0` and `KHR_materials_volume` when `thickness !== 0` (PR #22214); `ior` maps 1:1. Render-side caveats: keep slime roughness ≤ ~0.6–0.7 (issue #25485 flicker above 0.8); some third-party viewers don't implement transmission — document an alpha-blend fallback.
- **Hierarchy**: nested pivot Groups export correctly visually, but `Group` re-imports as plain `Object3D`; tag pivot semantics in `userData` (preserved) if round-trips ever matter. Avoid repeated export→import→export cycles (wrapper-node drift).
- **Binary GLB**: `options.binary: true` → ArrayBuffer (one self-contained file — our default). Guard `result instanceof ArrayBuffer` (issue #18919: silently returns JSON when nothing visible). Set `onlyVisible: true`, cap `maxTextureSize` (2048).
- WebP textures silently downgrade to PNG (issue #33116) — irrelevant for us (we use PNG anyway).

Sources: https://threejs.org/docs/pages/GLTFExporter.html · https://github.com/mrdoob/three.js/blob/master/examples/misc_exporter_gltf.html · https://github.com/mrdoob/three.js/pull/22214 · https://github.com/mrdoob/three.js/issues/25485 · https://github.com/mrdoob/three.js/issues/18919 · https://github.com/mrdoob/three.js/pull/20588

## 5. Chibi Proportion Numbers (strong multi-source consensus)

| Control | Range | Default | Notes |
|---|---|---|---|
| Head-to-body ratio | 1.75–3.0 heads | **2.5** | The single highest-impact proportion control. 2 = super-deformed, 2.5 = classic chibi, 3 = semi-chibi; >3–4 reads as "child", not chibi |
| Eye size (% of face height) | 18–32% | 24% | Below ~18% stops reading as chibi |
| Eye vertical position | 38–52% of head height | 45% | Eyes in the LOWER half of the face — the #1 beginner mistake is placing them too high |
| Eye spacing | 0.9–1.3× realistic gap | 1.1× | Wider = doe-eyed |
| Torso width | 45–70% of head width | 55% | "Egg" or "rectangle" silhouettes; avoid inverted triangle |
| Limb rules | — | — | Short, plump, tapering; arms never thicker than legs (hard constraint, not a slider); no muscle definition |
| Nose | dot or hidden | hidden | ~70–80% of professional chibi work omits the nose |

Silhouette readability: pass the "black-silhouette-at-icon-size" test; one distinctive silhouette hook per character (ears / hairstyle / tail / crown); lock "character DNA" invariants (head shape, eye language, signature accessory, color triad) and vary the rest. Maps directly onto our archetypes: fox ears+tail, slime translucent blob+twintails, skeleton bone joints+cape, human bob+tiara must survive all slider extremes.

Sources: https://design.tutsplus.com/articles/the-elements-of-cute-character-design--vector-3533 · https://tips.clip-studio.com/en-us/articles/4829 · https://tips.clip-studio.com/en-us/articles/10547 · https://www.usillustrations.com/blog/create-adorable-characters-for-your-childrens-picture-book · https://www.brainmonsters.com/cute-characters/ · https://www.neolemon.com/blog/what-makes-good-character-design-unforgettable/

## 6. Kawaii / Storybook Palette Theory

- Pastel band: OKLCH lightness ≈ 0.70–0.95, chroma ≈ 0.08–0.18 (≈ HSL S 25–45%, L 80–95%). Accent band ("kawaii pop"): S 65–85%, L 55–70%.
- Two registers: **pure kawaii** (Sanrio; low saturation, soft value shifts) vs **kawaii pop** (Harajuku; saturated pastels, colored shadows). Pick per archetype.
- Construction rule: one dominant desaturated base + 2–3 soft accents + one warm neutral anchor; keep body saturation DOWN and face/accent saturation UP for facial readability.
- Harmony: square/complementary wheel, applied asymmetrically (dominant low-sat, complement reserved for small high-impact zones: eyes, bow, gem).
- Proposed palette hexes (design-review proposals, synthesized from the sourced bands) are folded into `palettes.ts`; note TTT's canonical human princess is **Midnight Punk** (navy/black/gold from reference art), which deliberately sits OUTSIDE the pastel band — dark base + pastel-skin + gold accent still follows the "dominant + saturated accent" rule.

Sources: https://doi.org/10.5057/jjske.8.535 (Ohkura et al. 2009) · https://github.com/Innei/Pastel · https://tips.clip-studio.com/en-us/articles/9742 · https://maclafersa.com/the-best-color-combinations-for-cute-and-kawaii-amigurumi/ · https://designmd.app/library/kawaii-pastel-pop

## 7. Character-Creator UX Patterns (Mii, Tomodachi, Animal Crossing, Hytale, WoW)

1. **Preset-first flow** — open on curated starting presets per archetype, full editor one click away (Tomodachi "Get Help vs From Scratch"; Easy/Advanced Face Paint split).
2. **Few high-impact controls by default**, deeper sliders behind a disclosure; identical interaction model across steps (Miitomo's documented failure: each step worked differently).
3. **Instant, uninterrupted feedback** — zero confirmation modals for reversible cosmetic changes; gate only destructive/final actions.
4. **Curated randomness beats pure randomness** — Hytale's randomize feels "designed" because color/style pools are themed per category. Constrain RNG pools per archetype.
5. **Archetype-aware controls, not one universal slider set** — WoW Dragonriding: each body rig exposes its own customization vocabulary. Fox foregrounds ears/tail/snout; slime foregrounds wobble/translucency/glow; skeleton foregrounds bone gauge/eye glow; human foregrounds hair/dress.
6. **Never force multi-step repetition for repeatable actions** (Animal Crossing's most-hated pattern) — randomize/preset/mutate must be single-click.
7. **Visible completion sense** — persistent step/tab indicator (archetype → body → face → colors → motion → export).
8. Animal Crossing's delight mechanics worth copying: consistent rounded pastel UI language everywhere, springy micro-animations on selection, 1:1 sound-to-feedback pairing (future polish).

Sources: https://first-run-ux.kryshiggins.com/miitomo-app-first-time-user-experience-the-good/ · https://www.redbean.ai/blog/tomodachi-life-miis-original-character-creation · https://tomcrippsdesign.com/posts/2025-03-15-animal-crossing-delightfully-cosy-gaming/ · https://medium.com/patternfly/crossing-a-line-a-case-study-of-animal-crossing-new-horizons-ux-3a670676fd05 · https://hytale.com/news/2019/2/customizing-your-character-in-hytale · https://us.forums.blizzard.com/en/wow/t/dragon-customization-and-things-interview/1228383

*(Gap noted: Media Molecule's Dreams puppet creator yielded no citable UX writeups in this pass.)*
