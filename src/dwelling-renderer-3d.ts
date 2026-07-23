/**
 * DwellingRenderer3D — OW-D 3D preview
 *
 * Renders the full Three.js interior from generateInterior() in an isometric
 * diorama view with OrbitControls. Used by the Dwelling tab in Overworld Studio.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateInterior, type InteriorScene } from './world/buildings/InteriorGenerator';
import type { BuildingDNA } from './world/buildings/BuildingDNA';

export class DwellingRenderer3D {
  private renderer:   THREE.WebGLRenderer;
  private scene:      THREE.Scene;
  private camera:     THREE.PerspectiveCamera;
  private controls:   OrbitControls;
  private root:       THREE.Group | null = null;
  private pointLights: THREE.PointLight[] = [];
  private raf  = 0;
  private active = false;
  private clock  = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x080608);
    this.renderer.shadowMap.enabled  = true;
    this.renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    this.renderer.setSize(canvas.offsetWidth || 600, canvas.offsetHeight || 600);

    this.scene  = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x080608, 18, 40);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(8, 10, 12);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.06;
    this.controls.minDistance     = 3;
    this.controls.maxDistance     = 28;
    this.controls.maxPolarAngle   = Math.PI / 2;
    this.controls.rotateSpeed     = 0.6;
  }

  loadInterior(dna: BuildingDNA, floorIndex: number): void {
    // Dispose old interior
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse(obj => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else (mat as THREE.Material).dispose();
        }
      });
      this.root = null;
    }
    for (const l of this.pointLights) this.scene.remove(l);
    this.pointLights = [];
    // Clear scene except fog
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]!);
    this.scene.fog = new THREE.Fog(0x080608, 18, 40);

    // Build interior
    const interior: InteriorScene = generateInterior(dna, floorIndex);
    this.root = interior.group;
    this.scene.add(this.root);

    // Point lights
    for (const l of interior.lights) { this.scene.add(l); this.pointLights.push(l); }

    // Scene lighting
    const ambient = new THREE.AmbientLight(0xc8c0b8, 0.55);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfffaf0, 0.9);
    key.position.set(interior.planW * 0.6, 8, interior.planD * 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8090b0, 0.3);
    fill.position.set(-interior.planW * 0.4, 4, -interior.planD * 0.4);
    this.scene.add(fill);

    // Frame camera on the interior
    const cx = interior.floorCenter.x;
    const cz = interior.floorCenter.z;
    const span = Math.max(interior.planW, interior.planD);
    this.camera.position.set(cx + span * 0.65, span * 0.9, cz + span * 0.75);
    this.camera.lookAt(cx, 0.5, cz);
    this.controls.target.set(cx, 0.5, cz);
    this.controls.update();
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.clock.start();
    const loop = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
  }
}
