import * as THREE from 'three';

export function applyTaper(geometry: THREE.BufferGeometry, start: number, end: number) {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const t = (v.y + 0.5); 
        const scale = THREE.MathUtils.lerp(start, end, t);
        v.x *= scale;
        v.z *= scale;
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
}

export function createPatternTexture(pattern: 'None' | 'Stripes' | 'Dots'): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#00000033';
    if (pattern === 'Stripes') {
        for(let i=0; i<64; i+=8) ctx.fillRect(0, i, 64, 4);
    } else if (pattern === 'Dots') {
        for(let i=0; i<64; i+=16) for(let j=0; j<64; j+=16) ctx.fillRect(i, j, 8, 8);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}