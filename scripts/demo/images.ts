/**
 * Pictures for the demo: pool-water "photos", handwritten-looking signatures and a logo, drawn
 * pixel by pixel and encoded as PNG with node:zlib. No image library, no files in git, and the
 * same seed always gives the same bytes.
 */
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** RGBA pixels → PNG bytes. */
export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++)
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function seeded(seed: string) {
  let a = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pool water seen from above: a blue gradient with caustic ripples; "turbia" is greener. */
export function poolPhoto(seed: string): Uint8Array {
  const w = 480;
  const h = 360;
  const r = seeded(seed);
  const turbid = seed.endsWith('turbia');
  const px = new Uint8Array(w * h * 4);
  const f1 = 0.03 + r() * 0.02;
  const f2 = 0.025 + r() * 0.02;
  const ph = r() * 10;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const ripple = Math.sin(x * f1 + Math.sin(y * f2 + ph) * 2) * Math.sin(y * f1 * 0.8 + ph);
      const caustic = Math.max(0, ripple) ** 6 * 70;
      const i = (y * w + x) * 4;
      const base = turbid ? [120, 150, 120] : [60, 170, 210];
      const deep = turbid ? [70, 100, 80] : [10, 90, 150];
      px[i] = Math.min(255, base[0]! * (1 - t) + deep[0]! * t + caustic);
      px[i + 1] = Math.min(255, base[1]! * (1 - t) + deep[1]! * t + caustic);
      px[i + 2] = Math.min(255, base[2]! * (1 - t) + deep[2]! * t + caustic * 0.8);
      px[i + 3] = 255;
    }
  }
  // Tiles along the top edge, the coping of the pool.
  for (let y = 0; y < 26; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const grout = x % 40 < 2 || y === 25;
      px[i] = grout ? 170 : 225;
      px[i + 1] = grout ? 170 : 218;
      px[i + 2] = grout ? 165 : 205;
    }
  }
  return encodePng(w, h, px);
}

/** A signature-like scribble in dark blue ink on white. */
export function signature(seed: string): Uint8Array {
  const w = 320;
  const h = 110;
  const r = seeded(seed);
  const px = new Uint8Array(w * h * 4).fill(255);
  const a = [r() * 6, r() * 6, r() * 6];
  const dot = (cx: number, cy: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        px[i] = 20;
        px[i + 1] = 40;
        px[i + 2] = 110;
      }
  };
  for (let t = 0; t <= 1; t += 0.0008) {
    const x = 20 + t * 270 + Math.sin(t * 40 + a[0]!) * 10;
    const y = 58 + Math.sin(t * 17 + a[1]!) * 22 * (1 - t * 0.5) + Math.cos(t * 53 + a[2]!) * 8;
    dot(x, y);
  }
  for (let x = 40; x < 290; x++) dot(x, 92 + Math.sin(x / 30) * 2);
  return encodePng(w, h, px);
}

/** The demo company's logo: a rounded tile with three waves, on a transparent background. */
export function logo(): Uint8Array {
  const w = 360;
  const h = 120;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Tile: 120×120 with rounded corners.
      const cx = Math.min(Math.max(x, 18), 102);
      const cy = Math.min(Math.max(y, 18), 102);
      const inTile = x < 120 && Math.hypot(x - cx, y - cy) <= 18;
      const wave = [40, 62, 84].some((wy) => Math.abs(y - (wy + Math.sin(x / 9) * 6)) < 4);
      // A bar to the right standing in for the name (the PDF prints the name in text).
      const bar = x > 140 && x < 340 && ((y > 38 && y < 56) || (y > 70 && y < 82 && x < 280));
      if (inTile) {
        const white = wave && x > 14 && x < 106;
        px[i] = white ? 255 : 0;
        px[i + 1] = white ? 255 : 107;
        px[i + 2] = white ? 255 : 121;
        px[i + 3] = 255;
      } else if (bar) {
        px[i] = 0;
        px[i + 1] = 48;
        px[i + 2] = 59;
        px[i + 3] = y > 70 ? 140 : 255;
      }
    }
  }
  return encodePng(w, h, px);
}
