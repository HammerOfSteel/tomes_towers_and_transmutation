import * as THREE from 'three';
import type { CharacterConfig } from '../types/Models';

export class CharacterBuilder {
    public group: THREE.Group;
    public parts: Record<string, THREE.Group> = {};

    constructor() {
        this.group = new THREE.Group();
    }

    public build(config: CharacterConfig): THREE.Group {
        this.group.clear();
        this.parts = {};

        // 1. Torso: Using CapsuleGeometry for organic base
        const torso = this.createMesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 16), config.skinColor, [0, 0.8, 0]);
        const clothing = this.createMesh(new THREE.CapsuleGeometry(0.24, 0.35, 4, 16), config.dressColor, [0, 0.85, 0]);
        this.group.add(torso, clothing);

        // 2. Sculpted Head
        this.addHead(config);

        // 3. Anatomical Limbs
        this.parts.lArm = this.buildLimb(0.3, 1.0, config.skinColor);
        this.parts.rArm = this.buildLimb(-0.3, 1.0, config.skinColor);
        this.parts.lLeg = this.buildLimb(0.12, 0.6, config.skinColor);
        this.parts.rLeg = this.buildLimb(-0.12, 0.6, config.skinColor);

        return this.group;
    }

    private addHead(config: CharacterConfig) {
        // High-density base for smooth vertex manipulation
        const geo = new THREE.SphereGeometry(0.25, 64, 64);
        
        // --- Vertex Sculpting Logic ---
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(pos, i);
            // Chin bulge: Pull bottom vertices inward
            if (v.y < -0.15) v.x *= 0.85;
            // Brow ridge: Push forward upper vertices
            if (v.y > 0.05 && v.z > 0.15) v.z += 0.04;
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({ color: config.skinColor, roughness: 0.4 });
        const head = new THREE.Mesh(geo, mat);
        head.position.set(0, 1.45, 0);

        // Add physical features
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), mat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 0.23);
        
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), mat);
        ear.rotation.z = Math.PI / 2;
        const leftEar = ear.clone(); leftEar.position.set(-0.24, 0, 0);
        const rightEar = ear.clone(); rightEar.position.set(0.24, 0, 0);

        head.add(nose, leftEar, rightEar);
        this.group.add(head);
    }

    private buildLimb(x: number, y: number, color: number): THREE.Group {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, 0);
        
        // Fleshy joints using CapsuleGeometry
        const upper = this.createMesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 16), color, [0, -0.15, 0]);
        const lower = this.createMesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 16), color, [0, -0.4, 0]);
        
        pivot.add(upper, lower);
        this.group.add(pivot);
        return pivot;
    }

    private createMesh(geo: THREE.BufferGeometry, color: number, pos: [number, number, number]): THREE.Mesh {
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
        mesh.position.set(...pos);
        return mesh;
    }
}