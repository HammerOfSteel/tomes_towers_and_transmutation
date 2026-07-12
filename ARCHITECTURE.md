# Technical Architecture & Rules

## The "No Asset" Rule
Until Phase 8, **no external `.obj`, `.gltf`, or `.png` files are allowed**. 
*   **Characters:** Represented by compound primitive shapes (e.g., a capsule for the body, a floating sphere for the head).
*   **Textures:** Generated mathematically via Canvas API or Fragment Shaders (e.g., Perlin noise for dirt floors, grid shaders for tiles).
*   **VFX:** Three.js particle systems and shader materials.

## The Dual-Design System
The game relies on a chunk/blueprint system so levels can be generated in two ways:
1.  **Procedural Generator:** Scripts piece together modular blueprints based on a seed.
2.  **Level Designer (Dev Tool):** A drag-and-drop UI mode where developers can place procedural blueprints, save them as JSON, and feed them back into the generator's pool.