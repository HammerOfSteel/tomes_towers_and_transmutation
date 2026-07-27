/**
 * SolmorPresence.ts — Loads Arcanist Solmor's toad wizard GLB and places him
 * near the tower entrance in the exterior scene.
 *
 * Usage:
 *   const presence = new SolmorPresence(scene);
 *   await presence.load();    // call once when exterior scene loads
 *   presence.show();          // make visible (after prologue complete)
 *   presence.hide();          // hide (after Stage 3 dialogue)
 *   presence.update(dt);      // call each frame for idle bob + spin
 *   presence.dispose();       // when scene tears down
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const SOLMOR_PATH = '/assets/characters/wizards/toad/mesh.glb';
const ANIM_PATH = '/assets/characters/wizards/toad/anims.glb';
/** World position in front of the tower entrance (exterior mode). */
const SPAWN_POS = new THREE.Vector3(0, 0, -6);
/** Scale: toad wizard mesh is roughly 1 WU — scale to about 2 WU height. */
const SCALE = 1.8;
export class SolmorPresence {
    _scene;
    _root = null;
    _mixer = null;
    _age = 0;
    _loaded = false;
    constructor(_scene) {
        this._scene = _scene;
    }
    async load() {
        if (this._loaded)
            return;
        this._loaded = true;
        const loader = new GLTFLoader();
        let gltf = null;
        try {
            gltf = await loader.loadAsync(SOLMOR_PATH);
        }
        catch {
            console.warn('[SolmorPresence] Could not load toad mesh — Solmor will be invisible.');
            return;
        }
        this._root = gltf.scene;
        this._root.name = 'solmor_presence';
        this._root.scale.setScalar(SCALE);
        this._root.position.copy(SPAWN_POS);
        this._root.visible = false; // hidden until show() is called
        // Subtle glow: add a weak point light to make him stand out
        const light = new THREE.PointLight(0x8844cc, 0.8, 8);
        light.position.set(0, 2, 0);
        this._root.add(light);
        this._scene.add(this._root);
        // Try to load animations
        try {
            const animGltf = await loader.loadAsync(ANIM_PATH);
            this._mixer = new THREE.AnimationMixer(this._root);
            // Play idle / float animation if available
            const idle = animGltf.animations.find(a => /idle|float|stand/i.test(a.name))
                ?? animGltf.animations[0];
            if (idle) {
                const action = this._mixer.clipAction(idle);
                action.play();
            }
        }
        catch {
            // No anim — static pose is fine
        }
    }
    show() {
        if (this._root)
            this._root.visible = true;
    }
    hide() {
        if (this._root)
            this._root.visible = false;
    }
    get isVisible() {
        return this._root?.visible ?? false;
    }
    update(dt) {
        this._age += dt;
        this._mixer?.update(dt);
        if (this._root?.visible) {
            // Gentle hovering bob
            this._root.position.y = SPAWN_POS.y + Math.sin(this._age * 0.9) * 0.08;
            // Slow facing-player rotation (approximate)
            this._root.rotation.y += dt * 0.3;
        }
    }
    dispose() {
        if (this._root) {
            this._scene.remove(this._root);
            this._root = null;
        }
        this._mixer?.stopAllAction();
        this._mixer = null;
    }
}
