// ── SnakeLocomotion ──────────────────────────────────────────────────────────
//
//  Follow-en-trail locomotion for serpent-archetype creatures.
//
//  Algorithm (Kurt-Dekker "follow by distance"):
//    • positions[0] = head anchor = root's current world XZ position
//    • For each body segment i (1 … n):
//        If the gap between positions[i] and positions[i-1] exceeds `spacing`,
//        pull positions[i] toward positions[i-1] so the gap = spacing.
//    • segment[i-1].position is set to positions[i] (converted root-local).
//    • segment[i-1].lookAt(positions[i-1]) orients it toward the one ahead.
//
//  This naturally produces S-curves and coils when the snake turns, because
//  the body traces the exact path the head traveled — not a simple sine wave.
//
//  Requirements:
//    • Segments must be FLAT (direct) children of the rig root, not a
//      parent→child chain.  (CreatureBuilder._serpent now builds it flat.)
//    • Call update() BEFORE animateCreature() each frame so the sway overlay
//      uses += and does not fight the base lookAt orientation.
//
//  Call order each frame:
//    1. Move root  (NPCEntity / PlayerController FSM)
//    2. snakeLoco.update(root, segments)    ← sets positions + base orientation
//    3. animateCreature(rig, ctx)           ← adds lateral sway overlay (+=)
import * as THREE from 'three';
export class SnakeLocomotion {
    /**
     * World-space positions.
     *  [0]   = head anchor (mirrors root world pos each frame)
     *  [1…n] = body segment world positions
     */
    positions;
    _spacing;
    _inited = false;
    // Scratch objects — reused every frame to avoid GC pressure
    _headWP = new THREE.Vector3();
    _invMat = new THREE.Matrix4();
    _tmpWP = new THREE.Vector3();
    constructor(segmentCount, spacing) {
        this._spacing = spacing;
        this.positions = Array.from({ length: segmentCount + 1 }, () => new THREE.Vector3());
    }
    // ── Per-frame update ──────────────────────────────────────────────────────
    /**
     * Run the trail algorithm and write positions + base orientations back onto
     * `segments`.  Must be called every frame after root.position has been set.
     *
     * @param root     The snake rig's root THREE.Group (its world position = head)
     * @param segments bones.segments[] — must be direct children of root
     */
    update(root, segments) {
        root.getWorldPosition(this._headWP);
        if (!this._inited) {
            this._init(this._headWP, root.rotation.y);
        }
        // ── 1. Drive head anchor ──────────────────────────────────────────────
        this.positions[0].copy(this._headWP);
        // ── 2. Follow-en-trail: each position chases the one ahead ───────────
        for (let i = 1; i < this.positions.length; i++) {
            const ahead = this.positions[i - 1];
            const curr = this.positions[i];
            const dx = curr.x - ahead.x;
            const dz = curr.z - ahead.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > this._spacing * this._spacing) {
                const s = this._spacing / Math.sqrt(d2);
                curr.x = ahead.x + dx * s;
                curr.z = ahead.z + dz * s;
            }
            curr.y = ahead.y; // terrain-follow from the head (flat Y per segment)
        }
        // ── 3. Apply to segments ──────────────────────────────────────────────
        //  Convert world positions → root-local (so they don't rotate with root).
        root.updateWorldMatrix(true, false);
        this._invMat.copy(root.matrixWorld).invert();
        for (let i = 0; i < segments.length; i++) {
            // Set local position
            this._tmpWP.copy(this.positions[i + 1]).applyMatrix4(this._invMat);
            segments[i].position.copy(this._tmpWP);
            // Orient toward the anchor ahead (Three.js lookAt takes world-space coords
            // and internally accounts for the parent's world transform — safe here).
            const aheadWP = this.positions[i];
            segments[i].lookAt(aheadWP.x, aheadWP.y, aheadWP.z);
        }
    }
    // ── Reset ─────────────────────────────────────────────────────────────────
    /**
     * Call when the snake is teleported / just spawned to avoid a whiplash frame
     * where the old trail snaps to the new position.
     */
    reset(root) {
        this._inited = false;
        root.getWorldPosition(this._headWP);
        this._init(this._headWP, root.rotation.y);
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    /** Place all anchors in a straight line behind the head on first call. */
    _init(head, facingY) {
        this._inited = true;
        const bx = -Math.sin(facingY); // unit vector pointing behind the snake
        const bz = -Math.cos(facingY);
        for (let i = 0; i < this.positions.length; i++) {
            this.positions[i].set(head.x + bx * i * this._spacing, head.y, head.z + bz * i * this._spacing);
        }
    }
}
