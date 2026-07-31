#!/usr/bin/env node
/**
 * scripts/repo-doctor.mjs
 *
 * Lightweight "does this repo actually work on a fresh checkout" sanity check.
 * Catches the class of bug that only shows up on a fresh clone / new machine:
 *
 *   1. Stray tsc-compiled .js files committed alongside their .ts source
 *      (tsconfig.json noEmit prevents new ones, but this guards regressions
 *      and catches anyone committing with a different local tsconfig).
 *   2. Local TS imports (`@/...` and relative) that don't resolve to a real
 *      file — the class of bug behind the missing envManifest.ts import.
 *   3. Git-LFS pointer stubs checked out instead of real binaries — the
 *      class of bug you get when `git lfs install` was never run on this
 *      machine before cloning.
 *
 * Usage:  node scripts/repo-doctor.mjs
 * Exits non-zero (and prints a report) if any check fails.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const problems = [];

function gitFiles(pattern) {
  return execSync(`git ls-files ${pattern}`, { cwd: ROOT })
    .toString()
    .split('\n')
    .filter(Boolean);
}

// ── 1. Stray compiled .js next to .ts ────────────────────────────────────────

for (const jsFile of gitFiles("'src/**/*.js' 'tests/**/*.js'")) {
  const ts = jsFile.replace(/\.js$/, '.ts');
  const tsx = jsFile.replace(/\.js$/, '.tsx');
  if (existsSync(join(ROOT, ts)) || existsSync(join(ROOT, tsx))) {
    problems.push(`stray compiled artifact: ${jsFile} (matching ${ts} exists — tsc likely emitted in-place; check tsconfig noEmit)`);
  }
}

// ── 2. Broken local imports ───────────────────────────────────────────────────

const importRe = /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g;

for (const file of gitFiles("'src/**/*.ts' 'src/**/*.tsx' 'tests/**/*.ts'")) {
  // Strip comments so import-like text inside comments (e.g. "import X from '...'"
  // used as documentation) isn't mistaken for a real import statement.
  const content = readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  let m;
  while ((m = importRe.exec(content))) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('@/')) continue; // skip node_modules packages
    const base = spec.split('?')[0]; // strip Vite `?url`/`?raw` suffixes
    const target = spec.startsWith('@/')
      ? join(ROOT, 'src', base.slice(2))
      : resolve(dirname(join(ROOT, file)), base);
    const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, join(target, 'index.ts')];
    if (!candidates.some(c => existsSync(c))) {
      problems.push(`unresolved import in ${file}: "${spec}"`);
    }
  }
}

// ── 3. Git-LFS pointer stubs instead of real binaries ─────────────────────────

const LFS_POINTER_HEADER = 'version https://git-lfs.github.com/spec';
const lfsPatterns = ["'*.glb'", "'*.fbx'", "'*.zip'", "'*.mp3'"];
let checkedBinaries = 0;

for (const pattern of lfsPatterns) {
  const files = gitFiles(pattern).slice(0, 5); // sample a few per extension, not all — cheap check
  for (const f of files) {
    const full = join(ROOT, f);
    if (!existsSync(full)) continue; // gitignored/untracked-on-disk edge case
    if (statSync(full).size > 200) { checkedBinaries++; continue; } // real binaries are always >200B
    const head = readFileSync(full, 'utf8').slice(0, LFS_POINTER_HEADER.length);
    if (head === LFS_POINTER_HEADER) {
      problems.push(`Git-LFS pointer stub instead of real file: ${f} — run \`git lfs install && git lfs pull\``);
    }
    checkedBinaries++;
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`\n❌ repo-doctor found ${problems.length} issue(s):\n`);
  problems.forEach(p => console.error(`  - ${p}`));
  console.error('');
  process.exit(1);
} else {
  console.log(`✅ repo-doctor: no stray build artifacts, no broken local imports, ${checkedBinaries} sampled LFS binaries OK.`);
}
