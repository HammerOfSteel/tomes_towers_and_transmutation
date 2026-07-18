/**
 * EntityRegistry.ts — PROC-A1
 *
 * Central registry that maps entity kind → builder function.
 * Both the game runtime and the atelier tools resolve builders from here.
 *
 * Usage:
 *   const build = EntityRegistry.resolve('npc');
 *   const entity = build(dna);
 *   scene.add(entity.root);
 *
 * Builders are lazy-loaded so unused builders don't bloat the initial bundle.
 */

import type { ProceduralDNA, EntityKind } from './ProceduralDNA';
import type { BuilderFn } from './builder/BaseBuilder';

// ── Registry ──────────────────────────────────────────────────────────────────

type BuilderEntry = {
  /** Sync factory: already-loaded builder. Populated after first resolve. */
  fn?:    BuilderFn;
  /** Async loader: dynamically imports the builder module and sets `fn`. */
  load:   () => Promise<BuilderFn>;
};

const REGISTRY: Record<EntityKind, BuilderEntry> = {
  princess: {
    load: async () => {
      const { buildPrincess } = await import('@/princess-creator/factory');
      // Wrap to conform to BuilderFn<ProceduralDNA> signature
      return (dna) => {
        console.log(`[EntityRegistry] building princess: ${dna.name}`);
        const inst = buildPrincess(dna as any);
        return { root: inst.root, dna, update: (t, dt) => inst.update(t, dt), dispose: () => inst.dispose() };
      };
    },
  },
  npc: {
    load: async () => {
      // PROC-B1: will be implemented in the NPC creator phase
      // For now return a no-op builder that logs the request
      return (dna) => {
        console.warn(`[EntityRegistry] npc builder not yet implemented (dna: ${dna.name})`);
        const { Group } = require('three') as typeof import('three');
        const root = new Group();
        return { root, dna, update: () => {}, dispose: () => {} };
      };
    },
  },
  enemy: {
    load: async () => {
      // PROC-B2: will be implemented in the Enemy creator phase
      return (dna) => {
        console.warn(`[EntityRegistry] enemy builder not yet implemented (dna: ${dna.name})`);
        const { Group } = require('three') as typeof import('three');
        const root = new Group();
        return { root, dna, update: () => {}, dispose: () => {} };
      };
    },
  },
  prop: {
    load: async () => {
      const { buildProp } = await import('@/prop-creator/builder');
      return (dna) => {
        console.log(`[EntityRegistry] building prop: ${dna.name}`);
        const built = buildProp(dna as any);
        return { root: built.root, dna, update: () => {}, dispose: built.dispose };
      };
    },
  },
  building: {
    load: async () => {
      const { buildBuilding } = await import('@/world/buildings/BuildingBuilder');
      return (dna) => {
        console.log(`[EntityRegistry] building building: ${dna.name}`);
        const inst = buildBuilding(dna as any);
        return { root: inst.exteriorGroup, dna, update: () => {}, dispose: inst.dispose };
      };
    },
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve (and lazy-load) the builder for the given entity kind.
 * The returned function is cached after the first call.
 */
export async function resolveBuilder(kind: EntityKind): Promise<BuilderFn> {
  const entry = REGISTRY[kind];
  if (!entry) throw new Error(`[EntityRegistry] unknown kind: "${kind}"`);
  if (!entry.fn) {
    entry.fn = await entry.load();
  }
  return entry.fn;
}

/**
 * Build any entity from a DNA object.
 * Routes to the correct builder based on `dna.kind`.
 */
export async function buildEntity(dna: ProceduralDNA) {
  const build = await resolveBuilder(dna.kind);
  return build(dna);
}

/** Register a custom builder (e.g. for testing or modding). */
export function registerBuilder(kind: EntityKind, fn: BuilderFn): void {
  REGISTRY[kind].fn   = fn;
}

/** List all registered entity kinds. */
export function registeredKinds(): EntityKind[] {
  return Object.keys(REGISTRY) as EntityKind[];
}
