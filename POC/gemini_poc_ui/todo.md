# Procedural Character Creator - Todo

- [ ] **Phase 1: Foundation & Build System**
    - [ ] Setup Vite + TypeScript + Three.js project.
    - [ ] Create the `CharacterBuilder` factory class.
    - [ ] Implement the `CharacterConfig` interface (types for colors, scales, parts).

- [ ] **Phase 2: The "Chunky" Anatomy**
    - [ ] Create basic hierarchical body (Torso, Head, Limbs) using `RoundedBoxGeometry`.
    - [ ] Implement `applyTaper` logic for organic limb shaping.
    - [ ] Create the "Articulation" system (mechanical pivot groups for walking).

- [ ] **Phase 3: Face & Detail Factory**
    - [ ] Procedurally generate eye/mouth geometry.
    - [ ] Create "Hair Varieties" (stacking/scaling algorithms).
    - [ ] Implement the "Randomizer" logic.

- [ ] **Phase 4: Clothing & Procedural Textures**
    - [ ] Build the "Clothing Layering" system (geometry shells).
    - [ ] Implement `CanvasTexture` generator for procedural patterns (stripes/polka dots).
    - [ ] Add Clothing UI controls.

- [ ] **Phase 5: Animation & Polish**
    - [ ] Implement the Idle and Walk cycles using sine-wave kinematics.
    - [ ] Add full 360-degree orbit controls.
    - [ ] Finalize UI/UX for the character creator.