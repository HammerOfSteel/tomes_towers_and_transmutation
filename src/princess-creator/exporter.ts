// ── Exports: PNG portrait, GLB (trimmed slime bake), DNA JSON ────────────────

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { PrincessDNA } from './types';
import type { BuildResult } from './synth/contracts';
import type { Stage } from './scene';
import { dnaToShareCode } from './dna';
import { embedInPngDataUrl } from './stegano';

function fileSafe(name: string): string {
  return (name || 'princess').toLowerCase().replace(/[^a-z0-9-_]+/g, '_').slice(0, 40);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Portrait PNG with the full DNA hidden in its bottom-strip pixels (Spore's
 * "the image IS the save file" trick) — drop it back onto the Atelier and the
 * princess loads.
 */
export async function exportPng(stage: Stage, dna: PrincessDNA): Promise<void> {
  const plain = stage.snapshot(1024, true);
  let dataUrl = plain;
  try {
    dataUrl = await embedInPngDataUrl(plain, dnaToShareCode(dna));
  } catch {
    // portrait still ships without embedded DNA
  }
  const bytes = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  downloadBlob(new Blob([arr], { type: 'image/png' }), `${fileSafe(dna.name)}.png`);
}

export function exportJson(dna: PrincessDNA): void {
  const blob = new Blob([JSON.stringify(dna, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${fileSafe(dna.name)}.princess.json`);
}

/**
 * The live MarchingCubes mesh has buffers sized to maxPolyCount — exporting it
 * raw would emit thousands of degenerate zero-triangles. Bake a trimmed copy.
 */
function trimmedGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const posAttr = src.getAttribute('position');
  const count = Number.isFinite(src.drawRange.count)
    ? Math.min(src.drawRange.count, posAttr.count)
    : posAttr.count;
  const g = new THREE.BufferGeometry();
  const posArray = (posAttr.array as Float32Array).slice(0, count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const normAttr = src.getAttribute('normal');
  if (normAttr) {
    const normArray = (normAttr.array as Float32Array).slice(0, count * 3);
    g.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
  } else {
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

export async function exportGlb(result: BuildResult, dna: PrincessDNA): Promise<void> {
  const mc = result.root.getObjectByName('slimeBody') as THREE.Mesh | undefined;
  let baked: THREE.Mesh | null = null;

  if (mc) {
    baked = new THREE.Mesh(trimmedGeometry(mc.geometry), mc.material);
    baked.name = 'slimeBodyBaked';
    baked.position.copy(mc.position);
    baked.scale.copy(mc.scale);
    baked.userData.pivotRole = 'slimeBody';
    mc.visible = false;
    mc.parent?.add(baked);
  }

  // Tag rig pivots so downstream tooling can find them (Group → Object3D in glTF).
  result.root.traverse((obj) => {
    if (obj.name.startsWith('socket:') || ['rigRoot', 'torso', 'neck', 'head'].includes(obj.name)) {
      obj.userData.pivotRole = obj.name;
    }
  });

  try {
    const exporter = new GLTFExporter();
    const out = await exporter.parseAsync(result.root, { binary: true, onlyVisible: true });
    if (out instanceof ArrayBuffer) {
      downloadBlob(new Blob([out], { type: 'model/gltf-binary' }), `${fileSafe(dna.name)}.glb`);
    } else {
      // Binary silently ignored (three#18919 edge case) — fall back to .gltf
      const json = JSON.stringify(out);
      downloadBlob(new Blob([json], { type: 'model/gltf+json' }), `${fileSafe(dna.name)}.gltf`);
    }
  } finally {
    if (baked) {
      baked.parent?.remove(baked);
      baked.geometry.dispose();
      if (mc) mc.visible = true;
    }
  }
}
