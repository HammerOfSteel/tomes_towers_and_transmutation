# Project Roadmap: Phased Implementation

**Rule for completion:** No phase is complete without passing automated unit tests for core logic AND a successful, playable manual playtest.

---

## Phase 1: The Isometric Sandbox & Physics
**Goal:** Establish the Three.js environment, the isometric camera, and character physics.
*   [ ] Initialize Vite + Three.js project.
*   [ ] Implement Orthographic or high-FOV Perspective camera locked to an isometric angle.
*   [ ] Integrate Rapier3D physics engine.
*   [ ] Create the Player Controller: Procedural capsule geometry, WASD movement, kinematic character controller with wall-sliding.
*   **Tests:** Unit tests for input mapping and physics velocity calculations.
*   **Playtest 1:** Walk a capsule around a flat procedural grid plane. Collide smoothly with procedural boxes.

## Phase 2: ALttP Action Combat
**Goal:** Implement real-time combat mechanics, hitboxes, and damage states.
*   [ ] Implement health and damage interfaces.
*   [ ] Create Melee Attack: A sweeping arc hitbox (procedural slash mesh) that briefly stuns enemies.
*   [ ] Create Projectile Attack: Mouse-aimed physics spheres with basic glowing shaders.
*   [ ] Create basic Enemy AI (State machine: Idle -> Chase -> Attack).
*   [ ] Implement i-frames (invincibility frames) on taking damage and a simple dodge-roll/dash.
*   **Tests:** Unit tests for hitbox overlapping, damage math, and HP reduction.
*   **Playtest 2:** A standalone arena where the player must defeat 3 aggressive "slime" primitives using melee and projectiles.

## Phase 3: The Modular Blueprint System
**Goal:** Build the underlying data structure for rooms and towers.
*   [ ] Define JSON schema for "Blueprints" (walls, floors, doorways, spawn points).
*   [ ] Create the Blueprint Renderer: Parses JSON and spits out procedural Three.js geometry.
*   [ ] Implement door/portal transitions between modular rooms.
*   **Tests:** Unit tests parsing JSON to ensure exact output of expected 3D coordinates.
*   **Playtest 3:** Walk through a hard-coded sequence of 3 different connected rooms.

## Phase 4: The Level Designer (Dev Tool)
**Goal:** A UI overlay to build rooms visually, saving time on future development.
*   [ ] Create a toggleable "Edit Mode" in the client.
*   [ ] Implement a grid-snapping placement tool (mouse raycasting to place walls/floors/spawns).
*   [ ] Add Export/Import functionality (save current layout to JSON).
*   **Tests:** Unit test the export/import serialization (Object -> JSON -> Object yields identical data).
*   **Playtest 4:** Open the game, hit "Edit", build a small library room, export it, load it as the starting level, and walk around it.

## Phase 5: Procedural Generation & Discovery
**Goal:** Let the algorithm build the tower, and let the princess learn magic.
*   [ ] Build the Dungeon Generator: Stitches JSON blueprints together via doorways using a random seed.
*   [ ] Implement the Interactable System (raycast to objects).
*   [ ] Create the "Arcane for Dummies" UI: HTML overlay for reading books.
*   [ ] Implement the Progression System: Reading specific books unlocks new spell projectiles or passives.
*   **Tests:** Generator tests (ensure 1000 random seeds never produce overlapping/broken rooms).
*   **Playtest 5:** Spawn in a procedurally generated 5-floor tower. Find the "Fireball" book, read it, and use it to blast the door open.

## Phase 6: Overworld & Monster Minions
**Goal:** Leave the tower and build the army.
*   [ ] Implement procedural exterior generation (Simplex noise terrain, procedural cylinder trees).
*   [ ] Create "Tame/Recruit" mechanic: Defeating a monster below 10% HP adds them to your party.
*   [ ] Implement Follower AI: Minions use a NavMesh to follow the player and attack the player's target.
*   **Tests:** Unit tests for NavMesh path calculation and party array management.
*   **Playtest 6:** Exit the tower, find an outdoor enemy camp, recruit a monster, and have it help you clear the rest of the camp.

## Phase 7: The OP Power Fantasy
**Goal:** Scale the player's power to ridiculous heights and implement base building.
*   [ ] Implement XP, leveling, and massive AOE (Area of Effect) procedural spells.
*   [ ] Add resource gathering (mining procedural rocks/trees).
*   [ ] Allow player to command minions to guard the tower or build defenses.
*   **Tests:** Load testing (spawn 100 minions to ensure Three.js/physics performance holds up).
*   **Playtest 7:** Wipe out a massive horde of high-level enemies using a screen-clearing spell and an army of 20 followers.

## Phase 8: The Asset Replacement & The Final Boss
**Goal:** Turn the "greybox" into a finished game.
*   [ ] Asset Pipeline: Swap out procedural primitives for actual `.gltf` models and `.png` textures.
*   [ ] Integrate character animations (mixamo/blender) to replace kinematic sliding.
*   [ ] Build the Wizard Captor boss fight (intentionally designed with simple mechanics and low HP).
*   [ ] Final polish, audio (Web Audio API), and UI styling.
*   **Tests:** Asset loading tests (ensure no memory leaks on scene transitions).
*   **Playtest 8:** A full end-to-end speedrun of the game, ending with the hilarious 2-second destruction of the Wizard Captor.