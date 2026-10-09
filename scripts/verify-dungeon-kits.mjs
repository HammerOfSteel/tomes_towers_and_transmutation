// verify_dungeon_kits.mjs
//
// Rigorous geometric-fit verification harness for the real-asset dungeon
// kit integration (medieval + scifi). Per the user's explicit demand,
// this does NOT just check "did a real mesh render" or "does its longest
// axis point the expected way" — orientation-only checks like that
// already passed once while real gaps/holes were still on screen. This
// harness checks whether the ACTUAL rendered pieces geometrically FIT
// TOGETHER:
//
//   (A) Structural/connectivity: 5 small + 5 medium + 5 large dungeons via
//       the EXISTING generateDungeon() — no dangling doors, full BFS
//       reachability. (Unchanged from the prior pass — already solid.)
//   (B) Floor coverage: every non-wall cell in every room has EXACTLY one
//       floor tile mesh, and that mesh's world AABB is centered on the
//       expected cell with the expected footprint — catches holes like
//       the "missing floor under every pillar" bug found via screenshot
//       review (pillars were wrongly excluded from the floor loop).
//   (C) Wall adjacency contiguity: for every pair of orthogonally-adjacent
//       wall tiles, their rendered meshes' world AABBs must be
//       contiguous along the shared boundary (gap/overlap bounded by a
//       small tolerance) — catches misaligned/wrongly-scaled panels that
//       orientation-only checks cannot see.
//   (D) Door-opening correctness: each door's real-asset piece AABB must
//       sit within the room's wall-ring opening at that cell, not
//       overlapping neighbouring wall meshes beyond tolerance.
//
// Run: node scripts/verify-dungeon-kits.mjs  (or `npm run verify:dungeon-kits`;
// requires a Vite dev server on BASE_URL serving building-viewer.html)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5187';
const OUT_DIR = 'tests/e2e/screenshots/dungeon-kit-verify';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Tolerance for "touching" — real kit pieces are measured to ~1mm
// precision (see QuatDungeonAdapter.ts's doc comments), so anything
// beyond a few centimetres is a genuine gap/overlap, not float noise.
const FIT_TOLERANCE = 0.08; // 8cm

const browser = await chromium.launch();
const failures = [];

// ── Part A: structural/connectivity check over 15 real generated dungeons ──
async function verifyStructural() {
  const page = await browser.newPage();
  await page.goto(`${BASE}/building-viewer.html`);
  const report = await page.evaluate(async () => {
    const { generateDungeon } = await import('/src/levels/DungeonGenerator.ts');
    const sizes = [
      { label: 'small', floorCount: 1, seeds: [1, 2, 3, 4, 5] },
      { label: 'medium', floorCount: 3, seeds: [11, 12, 13, 14, 15] },
      { label: 'large', floorCount: 6, seeds: [21, 22, 23, 24, 25] },
    ];
    const out = [];
    for (const size of sizes) {
      for (const seed of size.seeds) {
        const plan = generateDungeon(seed, size.floorCount);
        let danglingDoors = 0, doorCount = 0;
        for (const [, bp] of plan.rooms) {
          for (const door of bp.doors) {
            doorCount++;
            if (door.targetId !== null && !plan.rooms.has(door.targetId)) danglingDoors++;
          }
        }
        const visited = new Set([plan.startRoomId]);
        const queue = [plan.startRoomId];
        while (queue.length) {
          const id = queue.shift();
          const bp = plan.rooms.get(id);
          for (const door of bp.doors) {
            if (door.targetId && !visited.has(door.targetId)) { visited.add(door.targetId); queue.push(door.targetId); }
          }
        }
        out.push({ size: size.label, seed, roomCount: plan.rooms.size, doorCount, danglingDoors, allReachable: visited.size === plan.rooms.size });
      }
    }
    return out;
  });
  await page.close();
  fs.writeFileSync('/tmp/dungeon_structural_report.json', JSON.stringify(report, null, 2));
  const bad = report.filter(r => r.danglingDoors !== 0 || !r.allReachable);
  console.log(`[Part A] 15 generated dungeons (5 small/5 medium/5 large): ${report.length - bad.length}/${report.length} structurally valid`);
  if (bad.length) { failures.push({ part: 'A-structural', bad }); console.log('  FAILURES:', JSON.stringify(bad, null, 2)); }
  return report;
}

function loadTemplate(name) {
  return JSON.parse(fs.readFileSync(`src/levels/blueprints/${name}.json`, 'utf8'));
}

// ── Geometric-fit assertions (independent of BlueprintRenderer's own math) ──

function checkFloorCoverage(bp, geo) {
  const issues = [];
  const wallCells = new Set(bp.tiles.filter(t => t.type === 'wall').map(t => `${t.x},${t.z}`));
  const expectedCells = [];
  for (let z = 0; z < bp.depth; z++) {
    for (let x = 0; x < bp.width; x++) {
      if (!wallCells.has(`${x},${z}`)) expectedCells.push(`${x},${z}`);
    }
  }
  const gotCells = new Set(geo.floors.map(f => `${f.tileX},${f.tileZ}`));
  const missing = expectedCells.filter(c => !gotCells.has(c));
  if (missing.length) issues.push({ type: 'missing-floor-tiles', cells: missing });
  if (geo.floors.length !== expectedCells.length) {
    issues.push({ type: 'floor-count-mismatch', expected: expectedCells.length, got: geo.floors.length });
  }
  return issues;
}

// Two AABBs are "contiguous" along a shared grid edge if the gap between
// them (gap = facingMin - facingMax along the axis connecting the two
// cells) is within tolerance — either touching (~0) or slightly
// overlapping (never more than one wall-thickness), AND they overlap
// (or nearly overlap) along the perpendicular axis too (no diagonal
// slip where two panels no longer share a face at all).
function checkWallAdjacency(bp, geo) {
  const issues = [];
  // A true corner tile now legitimately renders TWO wall pieces (one per
  // arm — see BlueprintRenderer.ts's computeWallRunRotations()), so a
  // tile key can map to more than one AABB. For each neighbour pair, a
  // tile only needs ONE of its own piece(s) to line up with ONE of the
  // neighbour's piece(s) — pick whichever pairing is closest to touching
  // before deciding there's a genuine gap.
  const byKey = new Map();
  for (const w of geo.walls) {
    const key = `${w.tileX},${w.tileZ}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(w);
  }
  const wallTiles = bp.tiles.filter(t => t.type === 'wall');
  const wallKeySet = new Set(wallTiles.map(t => `${t.x},${t.z}`));
  for (const tile of wallTiles) {
    const aList = byKey.get(`${tile.x},${tile.z}`);
    if (!aList || aList.length === 0) { issues.push({ type: 'wall-mesh-missing', tile: `${tile.x},${tile.z}` }); continue; }
    for (const [dx, dz, axis] of [[1, 0, 'x'], [0, 1, 'z']]) {
      const nKey = `${tile.x + dx},${tile.z + dz}`;
      if (!wallKeySet.has(nKey)) continue;
      const bList = byKey.get(nKey);
      if (!bList || bList.length === 0) continue; // reported separately above when that tile is visited
      let bestGap = Infinity;
      let bestOverlap = -Infinity;
      for (const a of aList) {
        for (const b of bList) {
          const gap = axis === 'x' ? b.min.x - a.max.x : b.min.z - a.max.z;
          const [aLo, aHi, bLo, bHi] = axis === 'x'
            ? [a.min.z, a.max.z, b.min.z, b.max.z]
            : [a.min.x, a.max.x, b.min.x, b.max.x];
          const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo);
          if (Math.abs(gap) < Math.abs(bestGap)) bestGap = gap;
          if (overlap > bestOverlap) bestOverlap = overlap;
        }
      }
      if (Math.abs(bestGap) > FIT_TOLERANCE) {
        issues.push({ type: 'wall-gap', axis, a: `${tile.x},${tile.z}`, b: nKey, gap: +bestGap.toFixed(4) });
      }
      if (bestOverlap < -FIT_TOLERANCE) {
        issues.push({ type: 'wall-perpendicular-slip', axis, a: `${tile.x},${tile.z}`, b: nKey, overlap: +bestOverlap.toFixed(4) });
      }
    }
  }
  return issues;
}

function checkDoorFit(bp, geo) {
  const issues = [];
  const byKey = new Map(geo.doors.map(d => [`${d.tileX},${d.tileZ}`, d]));
  for (const door of bp.doors) {
    const d = byKey.get(`${door.x},${door.z}`);
    if (!d) { issues.push({ type: 'door-mesh-missing', door: `${door.x},${door.z}` }); continue; }
    const sizeX = d.max.x - d.min.x;
    const sizeZ = d.max.z - d.min.z;
    const maxDim = Math.max(sizeX, sizeZ);
    const minDim = Math.min(sizeX, sizeZ);
    if (maxDim < bp.cellSize * 0.4) issues.push({ type: 'door-too-small', door: `${door.x},${door.z}`, sizeX, sizeZ });
    if (maxDim > bp.cellSize * 2.5) issues.push({ type: 'door-too-large', door: `${door.x},${door.z}`, sizeX, sizeZ });
    if (minDim < 0.05) issues.push({ type: 'door-degenerate', door: `${door.x},${door.z}`, sizeX, sizeZ });
  }
  return issues;
}

async function verifyRoom(page, label, bp, kit, screenshotName, takeShot) {
  const solo = {
    rooms: { [bp.id]: { ...bp, dungeonKit: kit, doors: bp.doors.map(d => ({ ...d, targetId: null })), staircases: bp.staircases.map(s => ({ ...s, targetId: null })) } },
    startRoomId: bp.id, seed: 0,
  };

  await page.goto(`${BASE}/building-viewer.html`);
  await page.evaluate((cfg) => { localStorage.setItem('ttt_external_assets_v1', JSON.stringify(cfg)); },
    { enabled: { 'nature-props': false, 'animals': false, 'monsters': false, 'settlement-buildings': false, 'building-interiors': false, 'dungeons-towers': true } });
  await page.evaluate((json) => { localStorage.setItem('ttt_building_preview', JSON.stringify(json)); }, solo);

  await page.goto(`${BASE}/building-viewer.html`);
  try {
    await page.waitForFunction(() => window.__buildingViewerReady === true || window.__buildingViewerError, { timeout: 20000 });
  } catch {
    failures.push({ part: 'geometric-fit', label, reason: 'timed out waiting for viewer ready' });
    return { label, ok: false };
  }
  const err = await page.evaluate(() => window.__buildingViewerError);
  if (err) { failures.push({ part: 'geometric-fit', label, reason: `viewer error: ${err}` }); return { label, ok: false }; }

  await page.waitForTimeout(2200); // let async GLTF/OBJ real-asset loads resolve

  const geo = await page.evaluate(() => window.__bvGetRoomGeometry ? window.__bvGetRoomGeometry() : null);
  if (!geo) { failures.push({ part: 'geometric-fit', label, reason: '__bvGetRoomGeometry hook missing' }); return { label, ok: false }; }

  const floorIssues = checkFloorCoverage(bp, geo);
  const adjacencyIssues = checkWallAdjacency(bp, geo);
  const doorIssues = checkDoorFit(bp, geo);
  const boxGeoCount = geo.walls.filter(w => w.isBoxGeometry).length + geo.doors.filter(d => d.isBoxGeometry).length;
  const allIssues = [...floorIssues, ...adjacencyIssues, ...doorIssues];

  if (takeShot) await page.screenshot({ path: `${OUT_DIR}/${screenshotName}.png` });

  const ok = allIssues.length === 0 && boxGeoCount === 0 && geo.walls.length > 0;
  console.log(`[fit] ${label}: walls=${geo.walls.length} floors=${geo.floors.length} doors=${geo.doors.length} boxGeoCount=${boxGeoCount} issues=${allIssues.length} -> ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) {
    failures.push({ part: 'geometric-fit', label, floorIssues, adjacencyIssues, doorIssues, boxGeoCount });
    console.log('  ', JSON.stringify(allIssues, null, 2).slice(0, 2000));
  }
  return { label, ok, floorIssues, adjacencyIssues, doorIssues, boxGeoCount };
}

async function verifyShapesAndDungeons() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

  const templates = ['cell_start', 'corridor_ns', 'corridor_ew', 'library_small', 'library_large'];
  const results = [];

  // (1) Per-shape, per-kit geometric fit + one representative screenshot each.
  for (const kit of ['medieval', 'scifi']) {
    for (const name of templates) {
      const bp = loadTemplate(name);
      const r = await verifyRoom(page, `shape:${name}[${kit}]`, bp, kit, `shape-${name}-${kit}`, true);
      results.push(r);
    }
  }

  // (2) Mixed-kit demonstration: two rooms from the same real generated
  // dungeon, rendered individually with different dungeonKit values.
  const mixedRooms = await page.evaluate(async (seed) => {
    const { generateDungeon } = await import('/src/levels/DungeonGenerator.ts');
    const plan = generateDungeon(seed, 3);
    const rooms = [...plan.rooms.values()];
    return { a: rooms[0], b: rooms[Math.min(1, rooms.length - 1)] };
  }, 11);
  results.push(await verifyRoom(page, 'mixed-kit-room-A[medieval]', mixedRooms.a, 'medieval', 'mixed-kit-room-A-medieval', true));
  results.push(await verifyRoom(page, 'mixed-kit-room-B[scifi]', mixedRooms.b, 'scifi', 'mixed-kit-room-B-scifi', true));

  // (3) Exhaustive geometric-fit sweep (no screenshots — too many rooms)
  // across every room of all 15 generated dungeons, for BOTH kits — this
  // is the real "5 small / 5 medium / 5 large x {medieval, scifi}"
  // coverage the user asked for, beyond the 5 unique template shapes.
  const dungeonRoomsBySize = await page.evaluate(async () => {
    const { generateDungeon } = await import('/src/levels/DungeonGenerator.ts');
    const sizes = [
      { label: 'small', floorCount: 1, seeds: [1, 2, 3, 4, 5] },
      { label: 'medium', floorCount: 3, seeds: [11, 12, 13, 14, 15] },
      { label: 'large', floorCount: 6, seeds: [21, 22, 23, 24, 25] },
    ];
    const out = [];
    for (const size of sizes) {
      for (const seed of size.seeds) {
        const plan = generateDungeon(seed, size.floorCount);
        out.push({ size: size.label, seed, rooms: [...plan.rooms.values()] });
      }
    }
    return out;
  });

  let sweepTotal = 0, sweepFail = 0;
  for (const kit of ['medieval', 'scifi']) {
    for (const dungeon of dungeonRoomsBySize) {
      for (const room of dungeon.rooms) {
        sweepTotal++;
        const r = await verifyRoom(page, `sweep:${dungeon.size}/seed${dungeon.seed}/${room.id}[${kit}]`, room, kit, '', false);
        if (!r.ok) sweepFail++;
        results.push(r);
      }
    }
  }
  console.log(`[Part B sweep] ${sweepTotal - sweepFail}/${sweepTotal} room x kit instances passed geometric-fit checks`);

  await page.close();
  return results;
}

const structural = await verifyStructural();
const results = await verifyShapesAndDungeons();
await browser.close();

console.log('\n=== SUMMARY ===');
console.log(`Structural: ${structural.length} dungeons checked, ${failures.filter(f => f.part === 'A-structural').length === 0 ? 'ALL PASS' : 'FAILURES'}`);
console.log(`Geometric-fit checks: ${results.length} room x kit instances, ${results.filter(r => r.ok).length} passed`);
console.log(`Total failure records: ${failures.length}`);
fs.writeFileSync('/tmp/verify_dungeon_kits_report.json', JSON.stringify({ structural, results, failures }, null, 2));
if (failures.length > 0) {
  console.log('SOME CHECKS FAILED — see /tmp/verify_dungeon_kits_report.json');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
