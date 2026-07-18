/**
 * profileCurves — LatheGeometry silhouette profiles for organic clothing.
 *
 * CC-11: All profiles return Vector2[] suitable for `new THREE.LatheGeometry(points, 12)`.
 * Y-axis = vertical (bottom → top), X-axis = radial distance from centre.
 *
 * Control points are interpolated with a simple cubic Bézier to get smooth curves
 * without requiring spline dependencies.
 */
import * as THREE from 'three';
// ── Bézier helper ─────────────────────────────────────────────────────────────
/** Evaluate a cubic Bézier at parameter t ∈ [0, 1]. */
function _bezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
/** Sample a cubic Bézier curve into n+1 Vector2 points.
 *  Each point pair is (x0..x3, y0..y3) for X and Y independently. */
function _sampleBezier(x0, x1, x2, x3, y0, y1, y2, y3, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(new THREE.Vector2(_bezier(x0, x1, x2, x3, t), _bezier(y0, y1, y2, y3, t)));
    }
    return pts;
}
// ── Profiles ──────────────────────────────────────────────────────────────────
/**
 * Princess / flared dress profile.
 * Narrow waist at top, flares dramatically at hem.
 *
 * @param height  Total height of the dress portion (typically 0.9–1.2)
 * @param waistR  Radius at the top (waist), typically 0.14–0.22
 * @param hemR    Radius at the knee, before flare, typically 0.26–0.40
 * @param hemFlare  Extra outward flare added at the very bottom, typically 0.06–0.14
 */
export function dressFlaredProfile(height, waistR, hemR, hemFlare) {
    // Top half: narrow waist curves outward (Bézier: waistR → outward)
    const upper = _sampleBezier(waistR, waistR * 0.9, hemR * 0.85, hemR, height, height * 0.6, height * 0.3, height * 0.15, 8);
    // Bottom hem: slight outward flare at the very bottom
    const lower = _sampleBezier(hemR, hemR + hemFlare * 0.6, hemR + hemFlare, hemR + hemFlare, height * 0.15, height * 0.06, height * 0.01, 0, 6);
    return [...upper, ...lower];
}
/**
 * Layered / mage robe profile.
 * Slight A-line with a visible step in the silhouette at mid-height.
 *
 * @param height  Total height (typically 1.0–1.4)
 * @param chest   Chest radius (typically 0.22–0.30)
 */
export function robeLayeredProfile(height, chest) {
    const hem = chest * 1.28;
    const stepY = height * 0.42;
    const stepR = chest * 1.08;
    // Upper robe — chest to step
    const upper = _sampleBezier(chest, chest * 1.06, stepR * 0.97, stepR, height, height * 0.68, stepY + 0.04, stepY, 7);
    // Lower robe — step to hem
    const lower = _sampleBezier(stepR, stepR * 1.05, hem * 0.98, hem, stepY, stepY * 0.65, height * 0.05, 0, 8);
    return [...upper, ...lower];
}
/**
 * Gathered / pleated short skirt profile.
 * Starts at hip, curves slightly wider and drops to mid-thigh.
 *
 * @param height  Length of the skirt (typically 0.42–0.68)
 * @param hip     Hip radius at waistband (typically 0.20–0.32)
 */
export function skirtGatheredProfile(height, hip) {
    const hem = hip * 1.22;
    return _sampleBezier(hip, hip * 1.05, hem * 1.02, hem, height, height * 0.65, height * 0.18, 0, 12);
}
/**
 * Simple tunic profile — slightly flared at hem, straight sides.
 *
 * @param height  Length (typically 0.5–0.8)
 * @param chest   Chest radius
 */
export function tunicProfile(height, chest) {
    const hem = chest * 1.12;
    return _sampleBezier(chest, chest * 1.02, hem * 0.99, hem, height, height * 0.6, height * 0.1, 0, 10);
}
/**
 * Apply a sine-wave modulation to the radial values of the BOTTOM `foldPoints`
 * points in a profile, simulating gathered / pleated fabric folds.
 *
 * Mutates `profile` in-place and returns it.
 *
 * @param profile     A profile array (from the functions above).
 * @param foldCount   Number of full sine oscillations across the bottom ring.
 * @param foldDepth   Max radial displacement (positive = outward bulge, typical 0.02–0.06).
 */
export function addHemFolds(profile, foldCount, foldDepth) {
    const n = profile.length;
    // Modulate only the bottom 1/3 of the profile
    const affectedCount = Math.max(1, Math.floor(n / 3));
    for (let i = n - affectedCount; i < n; i++) {
        const progress = (i - (n - affectedCount)) / affectedCount;
        // Fade-in from zero at the start of the affected region
        const fade = Math.sin(progress * Math.PI * 0.5);
        profile[i].x += Math.sin(progress * Math.PI * 2 * foldCount) * foldDepth * fade;
    }
    return profile;
}
