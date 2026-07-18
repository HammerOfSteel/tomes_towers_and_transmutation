// ── DNA-in-PNG: the Spore homage ─────────────────────────────────────────────
//
//  Spore famously hid the whole creature inside its PNG portrait ("the image
//  IS the save file" — see RESEARCH_SUPPLEMENT §2). We do the same: the share
//  code is written into the LSBs of an opaque 8-row strip at the bottom of
//  exported portraits. Drop any Atelier portrait back onto the page and the
//  princess walks out of it.
//
//  Byte-level codec is pure (unit-tested without canvas); canvas wiring below.

const MAGIC = [0x54, 0x54, 0x50, 0x32]; // "TTP2"
export const STRIP_ROWS = 8;

/** Max payload (bytes) a given image can carry. */
export function steganoCapacity(width: number): number {
  return Math.floor((width * STRIP_ROWS * 3) / 8) - MAGIC.length - 4;
}

/**
 * Writes MAGIC + uint32le(length) + utf8(payload) into the RGB LSBs of the
 * bottom STRIP_ROWS rows, forcing those pixels opaque over a plum base so
 * premultiplied-alpha round-trips can't corrupt the bits.
 * Returns false (pixels untouched) if the payload doesn't fit.
 */
export function encodeIntoPixels(
  pixels: Uint8ClampedArray, width: number, height: number, payload: string,
): boolean {
  const bytes = new TextEncoder().encode(payload);
  if (bytes.length > steganoCapacity(width)) return false;

  const stream = new Uint8Array(MAGIC.length + 4 + bytes.length);
  stream.set(MAGIC, 0);
  new DataView(stream.buffer).setUint32(MAGIC.length, bytes.length, true);
  stream.set(bytes, MAGIC.length + 4);

  const startRow = height - STRIP_ROWS;
  // Base strip: opaque stage-plum so the carrier reads as a footer bar.
  for (let y = startRow; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = 0x16;
      pixels[i + 1] = 0x11;
      pixels[i + 2] = 0x26;
      pixels[i + 3] = 255;
    }
  }
  let bit = 0;
  const totalBits = stream.length * 8;
  outer:
  for (let y = startRow; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (bit >= totalBits) break outer;
        const byte = stream[bit >> 3];
        const b = (byte >> (bit & 7)) & 1;
        pixels[i + c] = (pixels[i + c] & 0xfe) | b;
        bit++;
      }
    }
  }
  return true;
}

/** Reads a payload written by encodeIntoPixels. Null if magic doesn't match. */
export function decodeFromPixels(
  pixels: Uint8ClampedArray, width: number, height: number,
): string | null {
  const startRow = height - STRIP_ROWS;
  if (startRow < 0) return null;
  const readByte = (byteIndex: number): number => {
    let value = 0;
    for (let k = 0; k < 8; k++) {
      const bit = byteIndex * 8 + k;
      const px = Math.floor(bit / 3);
      const c = bit % 3;
      const y = startRow + Math.floor(px / width);
      const x = px % width;
      if (y >= height) return -1;
      const i = (y * width + x) * 4 + c;
      value |= (pixels[i] & 1) << k;
    }
    return value;
  };
  for (let m = 0; m < MAGIC.length; m++) {
    if (readByte(m) !== MAGIC[m]) return null;
  }
  let length = 0;
  for (let k = 0; k < 4; k++) {
    const b = readByte(MAGIC.length + k);
    if (b < 0) return null;
    length |= b << (k * 8);
  }
  if (length <= 0 || length > steganoCapacity(width) + 8) return null;
  const bytes = new Uint8Array(length);
  for (let n = 0; n < length; n++) {
    const b = readByte(MAGIC.length + 4 + n);
    if (b < 0) return null;
    bytes[n] = b;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// ── Canvas wiring (browser only) ─────────────────────────────────────────────

export async function embedInPngDataUrl(dataUrl: string, payload: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('portrait load failed'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (!encodeIntoPixels(imageData.data, canvas.width, canvas.height, payload)) {
    return dataUrl; // payload too large — ship a plain portrait
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function extractFromImageFile(file: File | Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeFromPixels(imageData.data, canvas.width, canvas.height);
  } catch {
    return null;
  }
}
