# Contributing to Tomes, Towers & Transmutation

This document covers the dev workflow, code conventions, and quality rules for this project.

---

## The Prime Rule

> **No phase is "done" without passing automated unit tests AND a successful manual playtest.**

This is the single non-negotiable quality gate. Shipping code that isn't tested and playtested does not count as progress.

---

## Branch Strategy

```
main          — stable, always releasable
dev           — integration branch; all feature branches merge here first
feature/<name> — individual feature work (e.g. feature/player-controller)
fix/<name>    — bug fixes
phase/<n>     — phase-level branch when coordinating multiple features
```

### Flow

```bash
git checkout dev
git checkout -b feature/my-feature

# ... do work, commit ...

git push origin feature/my-feature
# open PR → dev
# squash merge after review
```

`main` is only updated from `dev` after a full phase playtest passes.

---

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

Types:
  feat     — new feature
  fix      — bug fix
  chore    — tooling, deps, config
  docs     — documentation only
  test     — adding or fixing tests
  refactor — code change with no behaviour change
  perf     — performance improvement
  shader   — GLSL shader work
  level    — blueprint / level data

Examples:
  feat(player): add kinematic wall-sliding
  fix(physics): clamp velocity on steep slopes
  shader(floor): implement perlin noise dirt texture
  level(editor): export blueprint to JSON
  test(hitbox): add sweep arc overlap unit tests
```

Keep the subject line under 72 characters. Add a body if the change is non-obvious.

---

## Code Style

- **Language:** TypeScript (strict mode)
- **Formatter:** Prettier (default config)
- **Linter:** ESLint with TypeScript rules
- **No `any`:** Use explicit types. `unknown` is acceptable where truly needed.
- **No magic numbers:** Constants go in a named `const` or an enum.
- **Imports:** Absolute paths via Vite's `resolve.alias` — no `../../..` chains.

### Three.js conventions

- Dispose of geometry, materials, and textures when removing objects from the scene (`geometry.dispose()`, `material.dispose()`).
- Never allocate `new THREE.Vector3()` inside `update()` loops — reuse pre-allocated vectors.
- Shader uniforms are updated once per frame at the top of the game loop, not inside individual object updates.

### Physics (Rapier3D) conventions

- Physics bodies are owned by the system that creates them; cleanup on removal is mandatory.
- Collider user data must be set to the owning entity's ID so hit callbacks can resolve the entity.
- Never read `body.translation()` and apply it to a mesh inside the physics step callback — do it in the render loop after the physics world is stepped.

---

## Testing

- **Framework:** [Vitest](https://vitest.dev/)
- **Location:** `tests/` mirroring the `src/` structure (e.g. `tests/player/combat.test.ts`)
- **Coverage threshold:** 80% on core logic modules (physics helpers, blueprint parser, generator, damage math)
- **No renderer in unit tests:** Tests must not instantiate `THREE.WebGLRenderer` or `RAPIER.World` — mock or stub these at the module boundary.

```bash
npm test           # run all tests
npm run test:watch # watch mode during development
npm run coverage   # generate coverage report
```

Each phase defines explicit required tests. Do not mark a phase complete until those tests pass.

---

## The "No Asset" Rule

Until Phase 8, **no binary assets** (`.png`, `.jpg`, `.gltf`, `.obj`, `.fbx`, audio files) are committed to the repository.

- **Characters:** Compound primitive geometry only.
- **Textures:** Canvas API or GLSL fragment shaders (Perlin/Simplex noise, grid functions).
- **VFX:** Three.js particle systems (`Points` / `BufferGeometry`) and shader materials.
- **Audio:** Web Audio API synthesis — no audio files.

If you believe an asset is genuinely necessary before Phase 8, open a discussion in the issue tracker first.

---

## Level Blueprints

- Blueprint JSON files live in `levels/`.
- All blueprints must pass schema validation against `docs/BLUEPRINT_SCHEMA.md` before commit.
- Blueprints authored by the in-game editor are the canonical source — do not hand-edit JSON unless fixing a schema violation.

---

## Pull Request Checklist

Before opening a PR, confirm:

- [ ] All new logic has unit tests
- [ ] `npm test` passes locally
- [ ] No `console.log` left in non-debug code (use the game's debug flag)
- [ ] No new binary assets added
- [ ] Commit messages follow Conventional Commits
- [ ] The relevant phase playtest was performed (for phase-completing PRs)
- [ ] `ARCHITECTURE.md` updated if any architectural decision changed
