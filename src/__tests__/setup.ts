// @ts-nocheck
// Vitest setup — runs before each test file in the jsdom environment.
// @ts-nocheck is intentional: this file uses plain JS patterns for the mock
// and doesn't need to satisfy the full CanvasRenderingContext2D interface.

// ── localStorage stub ─────────────────────────────────────────────────────
// When Vitest is launched with --localstorage-file pointing to an invalid
// path, jsdom may produce a stripped localStorage without .clear().  Replace
// the entire implementation with a reliable in-memory Map-backed stub so
// tests can always call getItem / setItem / removeItem / clear / length.
;(function () {
  const _store = new Map();
  const lsMock = {
    getItem:    (k)    => _store.get(k) ?? null,
    setItem:    (k, v) => _store.set(k, String(v)),
    removeItem: (k)    => _store.delete(k),
    clear:      ()     => _store.clear(),
    get length()       { return _store.size; },
    key:        (i)    => ([..._store.keys()][i] ?? null),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: lsMock, writable: true, configurable: true });
})();

function _makeCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', globalAlpha: 1,
    shadowBlur: 0, shadowColor: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect(){}, clearRect(){}, strokeRect(){}, beginPath(){}, closePath(){},
    moveTo(){}, lineTo(){}, arc(){}, rect(){}, stroke(){}, fill(){},
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, setTransform(){},
    drawImage(){}, putImageData(){}, clip(){}, isPointInPath(){ return false; },
    ellipse(){}, bezierCurveTo(){}, quadraticCurveTo(){}, arcTo(){},
    fillText(){}, strokeText(){},
    getImageData(_a, _b, w, h){ return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}; },
    createImageData(w, h){ return {data:new Uint8ClampedArray(w*h*4),width:w,height:h}; },
    createLinearGradient(){ return {addColorStop(){}}; },
    createRadialGradient(){ return {addColorStop(){}}; },
    createPattern(){ return null; },
    measureText(t){ return {width:t.length*6}; },
  };
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function() { return _makeCtx(); };
  HTMLCanvasElement.prototype.toDataURL = function() { return ''; };
}

// Minimal WebGL stubs so THREE.js doesn't throw on import
if (typeof globalThis !== 'undefined') {
  if (!globalThis.WebGLRenderingContext) globalThis.WebGLRenderingContext = function(){};
  if (!globalThis.WebGL2RenderingContext) globalThis.WebGL2RenderingContext = function(){};
}
