// ── DNA-in-PNG byte codec (pure part; canvas wiring is browser-only) ────────

import { describe, it, expect } from 'vitest';
import {
  encodeIntoPixels, decodeFromPixels, steganoCapacity, STRIP_ROWS,
} from '../stegano';
import { defaultDna, dnaToShareCode, shareCodeToDna } from '../dna';

function blankImage(width: number, height: number): Uint8ClampedArray {
  // transparent-ish noise, like a real portrait readback
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = (i * 7) % 256;
    px[i + 1] = (i * 13) % 256;
    px[i + 2] = (i * 29) % 256;
    px[i + 3] = i % 5 === 0 ? 0 : 200;
  }
  return px;
}

describe('stegano codec', () => {
  it('round-trips a real share code through pixels', () => {
    const dna = defaultDna('foxling');
    dna.name = 'Pixel Smuggler ✨';
    const code = dnaToShareCode(dna);
    const w = 1024, h = 1024;
    const px = blankImage(w, h);

    expect(encodeIntoPixels(px, w, h, code)).toBe(true);
    const back = decodeFromPixels(px, w, h);
    expect(back).toBe(code);
    expect(shareCodeToDna(back!)).toEqual(dna);
  });

  it('strip pixels are forced opaque (premultiply-safe)', () => {
    const w = 512, h = 512;
    const px = blankImage(w, h);
    encodeIntoPixels(px, w, h, 'P2.abc');
    for (let y = h - STRIP_ROWS; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(px[(y * w + x) * 4 + 3]).toBe(255);
      }
    }
    // pixels above the strip untouched
    expect(px[((h - STRIP_ROWS - 1) * w) * 4 + 3]).not.toBe(255);
  });

  it('rejects payloads over capacity without touching pixels', () => {
    const w = 64, h = 64;
    const px = blankImage(w, h);
    const before = px.slice();
    const huge = 'x'.repeat(steganoCapacity(w) + 1);
    expect(encodeIntoPixels(px, w, h, huge)).toBe(false);
    expect(px).toEqual(before);
  });

  it('returns null on images without the magic', () => {
    const w = 256, h = 256;
    expect(decodeFromPixels(blankImage(w, h), w, h)).toBeNull();
  });

  it('1024px portraits fit worst-case v2 codes', () => {
    // Longest plausible code: long name + all fields — sanity margin check.
    const dna = defaultDna('foxling');
    dna.name = 'Ｍａｘｉｍａｌｉａ✨✨✨✨';
    const code = dnaToShareCode(dna);
    expect(code.length).toBeLessThan(steganoCapacity(1024));
  });
});
