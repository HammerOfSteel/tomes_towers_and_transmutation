/**
 * BaseScene — persistent base-building structure system.
 *
 * Phase 7g: Base Building (Lite)
 *
 * Structures are placed by the player in exterior Construction Mode (`[B]`).
 * The full list is serialised to localStorage under 'ttt-base-structures' so
 * structures survive session reloads without full world regeneration.
 *
 * Each structure has:
 *   - A `StructureType` key that determines mesh + behaviour
 *   - World-space position (wx, wz)  — Y is resolved from terrain at render time
 *   - A unique `id` (UUID-style from seed+index)
 *
 * Behaviour that requires external systems (pathfinding avoidance, HP aura,
 * guard FSM assignment) is managed via callbacks registered on `BaseScene`.
 */
import * as THREE from 'three';
/** Resource costs per structure (matches blueprint recipe ingredients). */
export const STRUCTURE_COSTS = {
    barrier_wall: { timber: 3 },
    watch_perch: { timber: 2, ore: 1 },
    healing_fountain: { ore: 4 },
    ward_stone: { essence: 3 },
};
/** Display metadata for UI. */
export const STRUCTURE_META = {
    barrier_wall: { icon: '🧱', name: 'Barrier Wall', description: '3u wall. Blocks enemy pathing.' },
    watch_perch: { icon: '🗼', name: 'Watch Perch', description: 'Assign a minion. +4 aggro range.' },
    healing_fountain: { icon: '💧', name: 'Healing Fountain', description: '+1 HP/5s aura in 5u radius.' },
    ward_stone: { icon: '🔯', name: 'Ward Stone', description: 'Repels hostiles in 4u radius.' },
};
// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ttt-base-structures';
/** Snap grid size in WU — matches terrain tile size T = 2. */
const SNAP = 2;
/** Heal fountain tick rate in seconds. */
const FOUNTAIN_TICK = 5;
/** Heal fountain radius in WU. */
const FOUNTAIN_RADIUS = 5;
/** Ward stone repel radius in WU. */
const WARD_RADIUS = 4;
// ── BaseScene ──────────────────────────────────────────────────────────────
export class BaseScene {
    scene;
    _structures = [];
    _meshes = new Map();
    _idCounter = 0;
    /** Fountain heal tick timer (seconds). */
    _fountainTimer = 0;
    // ── Callbacks ─────────────────────────────────────────────────────────
    /** Called each fountain tick — heal player + minions within range. */
    onFountainHeal;
    /** Called when a ward stone is placed/loaded — register repel zone. */
    onWardStonePlaced;
    /** Called when a ward stone is removed. */
    onWardStoneRemoved;
    get structures() { return this._structures; }
    constructor(scene) {
        this.scene = scene;
        this._load();
        this._renderAll();
    }
    // ── Placement ──────────────────────────────────────────────────────────
    /**
     * Place a structure at (wx, wz) snapped to the 2 WU grid.
     * Returns the new `PlacedStructure`, or `null` if a structure already
     * exists at that cell.
     */
    place(type, wx, wz) {
        const sx = Math.round(wx / SNAP) * SNAP;
        const sz = Math.round(wz / SNAP) * SNAP;
        // Block overlapping placements at the same grid cell
        if (this._structures.some(s => s.wx === sx && s.wz === sz))
            return null;
        const id = `struct_${Date.now()}_${this._idCounter++}`;
        const entry = { id, type, wx: sx, wz: sz };
        this._structures.push(entry);
        this._save();
        const mesh = this._buildMesh(entry);
        this._meshes.set(id, mesh);
        this.scene.add(mesh);
        // Fire callbacks for behaviour systems
        if (type === 'ward_stone') {
            this.onWardStonePlaced?.(new THREE.Vector3(sx, 0, sz), WARD_RADIUS, id);
        }
        return entry;
    }
    /** Remove a structure by id. */
    remove(id) {
        const idx = this._structures.findIndex(s => s.id === id);
        if (idx === -1)
            return;
        const [entry] = this._structures.splice(idx, 1);
        this._save();
        const mesh = this._meshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this._freeGroup(mesh);
            this._meshes.delete(id);
        }
        if (entry.type === 'ward_stone') {
            this.onWardStoneRemoved?.(id);
        }
    }
    /** Returns the nearest Watch Perch within `range` WU of `pos`, or null. */
    nearWatchPerch(pos, range = 3.5) {
        let best = null;
        let bestD2 = range * range;
        for (const s of this._structures) {
            if (s.type !== 'watch_perch')
                continue;
            const dx = pos.x - s.wx;
            const dz = pos.z - s.wz;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = s;
            }
        }
        return best;
    }
    // ── Per-frame update ────────────────────────────────────────────────────
    update(dt, playerPos) {
        // Healing Fountain aura — tick every FOUNTAIN_TICK seconds
        const hasFountain = this._structures.some(s => s.type === 'healing_fountain');
        if (hasFountain && this.onFountainHeal) {
            this._fountainTimer -= dt;
            if (this._fountainTimer <= 0) {
                this._fountainTimer = FOUNTAIN_TICK;
                for (const s of this._structures) {
                    if (s.type !== 'healing_fountain')
                        continue;
                    const p = new THREE.Vector3(s.wx, playerPos.y, s.wz);
                    this.onFountainHeal(p, FOUNTAIN_RADIUS, 1);
                }
            }
        }
        else {
            this._fountainTimer = FOUNTAIN_TICK;
        }
        // Animate fountain glow (pulse emissiveIntensity)
        const t = performance.now() * 0.001;
        for (const [id, mesh] of this._meshes) {
            const s = this._structures.find(e => e.id === id);
            if (s?.type !== 'healing_fountain')
                continue;
            mesh.traverse(child => {
                const mat = child.material;
                if (mat?.emissiveIntensity !== undefined) {
                    mat.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 2.2);
                }
            });
        }
    }
    // ── Scene enter/exit ────────────────────────────────────────────────────
    enter() {
        for (const mesh of this._meshes.values())
            this.scene.add(mesh);
    }
    exit() {
        for (const mesh of this._meshes.values())
            this.scene.remove(mesh);
    }
    dispose() {
        this.exit();
        for (const mesh of this._meshes.values())
            this._freeGroup(mesh);
        this._meshes.clear();
    }
    // ── Persistence ─────────────────────────────────────────────────────────
    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._structures));
        }
        catch { /* quota exceeded */ }
    }
    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw)
                return;
            const list = JSON.parse(raw);
            for (const s of list) {
                if (s.id && s.type && typeof s.wx === 'number' && typeof s.wz === 'number') {
                    this._structures.push(s);
                }
            }
        }
        catch { /* corrupt data */ }
    }
    _renderAll() {
        for (const s of this._structures) {
            const mesh = this._buildMesh(s);
            this._meshes.set(s.id, mesh);
            // scene.add called in enter()
        }
        // Fire callbacks for ward stones loaded from persistence
        for (const s of this._structures) {
            if (s.type === 'ward_stone') {
                this.onWardStonePlaced?.(new THREE.Vector3(s.wx, 0, s.wz), WARD_RADIUS, s.id);
            }
        }
    }
    // ── Mesh builders ────────────────────────────────────────────────────────
    _buildMesh(s) {
        const grp = new THREE.Group();
        grp.position.set(s.wx, 0, s.wz);
        switch (s.type) {
            case 'barrier_wall':
                this._makeBarrierWall(grp);
                break;
            case 'watch_perch':
                this._makeWatchPerch(grp);
                break;
            case 'healing_fountain':
                this._makeHealingFountain(grp);
                break;
            case 'ward_stone':
                this._makeWardStone(grp);
                break;
        }
        return grp;
    }
    /** 3-unit tall solid wall — 2WU wide, 0.3WU deep grey stone planks. */
    _makeBarrierWall(grp) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.85, metalness: 0.1 });
        const geo = new THREE.BoxGeometry(2, 3, 0.3);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 1.5;
        mesh.castShadow = true;
        grp.add(mesh);
        // Horizontal mortar lines — thin dark boxes
        const mortarMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
        for (let y = 0; y < 3; y += 0.5) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.06, 0.32), mortarMat);
            m.position.y = y + 0.25;
            grp.add(m);
        }
    }
    /** Wooden watchtower — narrow base cylinder + platform + railing. */
    _makeWatchPerch(grp) {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
        // Legs × 4
        const legGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 6);
        const legOffsets = [[0.4, 0.4], [0.4, -0.4], [-0.4, 0.4], [-0.4, -0.4]];
        for (const [x, z] of legOffsets) {
            const leg = new THREE.Mesh(legGeo, woodMat);
            leg.position.set(x, 1.25, z);
            grp.add(leg);
        }
        // Platform floor
        const platGeo = new THREE.BoxGeometry(1.1, 0.12, 1.1);
        const plat = new THREE.Mesh(platGeo, woodMat);
        plat.position.y = 2.5;
        plat.castShadow = true;
        grp.add(plat);
        // Railing
        const railMat = new THREE.MeshStandardMaterial({ color: 0x5c3317, roughness: 0.95 });
        const railGeo = new THREE.BoxGeometry(1.1, 0.6, 0.06);
        const railPositions = [
            [0, 2.8, 0.52, 0], [0, 2.8, -0.52, 0],
            [0.52, 2.8, 0, Math.PI / 2], [-0.52, 2.8, 0, Math.PI / 2],
        ];
        for (const [x, y, z, ry] of railPositions) {
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.position.set(x, y, z);
            rail.rotation.y = ry;
            grp.add(rail);
        }
    }
    /** Glowing blue-white fountain with pulsing sphere orb. */
    _makeHealingFountain(grp) {
        // Basin
        const basinMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7 });
        const basinGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.3, 12);
        const basin = new THREE.Mesh(basinGeo, basinMat);
        basin.position.y = 0.15;
        grp.add(basin);
        // Pedestal
        const pedGeo = new THREE.CylinderGeometry(0.15, 0.22, 0.9, 8);
        const ped = new THREE.Mesh(pedGeo, basinMat);
        ped.position.y = 0.6;
        grp.add(ped);
        // Orb — emissive
        const orbMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff, emissive: 0x4488cc, emissiveIntensity: 0.8,
            roughness: 0.2, metalness: 0.1,
        });
        const orbGeo = new THREE.SphereGeometry(0.28, 12, 10);
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.y = 1.2;
        grp.add(orb);
    }
    /** Standing rune stone — tall box with glowing carved rune face. */
    _makeWardStone(grp) {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5065, roughness: 0.85 });
        const runeGeo = new THREE.BoxGeometry(0.5, 1.6, 0.22);
        const stone = new THREE.Mesh(runeGeo, stoneMat);
        stone.position.y = 0.8;
        stone.castShadow = true;
        grp.add(stone);
        // Rune glow face
        const glowMat = new THREE.MeshStandardMaterial({
            color: 0xcc88ff, emissive: 0x9944cc, emissiveIntensity: 1.0,
            roughness: 0.5, transparent: true, opacity: 0.9,
        });
        const glowGeo = new THREE.PlaneGeometry(0.3, 0.9);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, 0.8, 0.115);
        grp.add(glow);
    }
    // ── Utility ───────────────────────────────────────────────────────────────
    _freeGroup(g) {
        g.traverse(child => {
            const m = child;
            if (m.geometry)
                m.geometry.dispose();
            if (Array.isArray(m.material))
                m.material.forEach(mt => mt.dispose());
            else if (m.material)
                m.material.dispose();
        });
    }
}
