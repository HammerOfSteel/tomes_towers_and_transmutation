import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { CharacterBuilder } from './engine/CharacterBuilder';
import { DEFAULT_CONFIG } from './types/Models';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Real lighting for "fleshed out" look
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
const point = new THREE.PointLight(0xffffff, 10);
point.position.set(2, 2, 2);
scene.add(ambient, point);

new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 1.2, 3);

const builder = new CharacterBuilder();
const config = { ...DEFAULT_CONFIG, anim: 'Idle' };
let group = builder.build(config);
scene.add(group);

// Improved UI
const gui = new GUI();
gui.add(config, 'anim', ['Idle', 'Walk']);
gui.addColor(config, 'dressColor').onChange(rebuild);
gui.add({ Randomize: () => {
    config.dressColor = Math.random() * 0xffffff;
    rebuild();
}}, 'Randomize');

function rebuild() {
    scene.remove(group);
    group = builder.build(config);
    scene.add(group);
}

function animate() {
    requestAnimationFrame(animate);
    const t = Date.now() * 0.005;
    if (config.anim === 'Walk') {
        Object.values(builder.parts).forEach((part, i) => {
            part.rotation.x = Math.sin(t + i) * 0.4;
        });
    } else {
        Object.values(builder.parts).forEach(p => p.rotation.x = 0);
    }
    renderer.render(scene, camera);
}
animate();