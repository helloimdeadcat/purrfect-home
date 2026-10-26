// Generates the PWA / Apple touch icons into public/ without image tooling:
// a minimal PNG encoder (zlib + CRC32) and an anti-aliased cat face (the
// app mark from components/cute/illustrations.tsx) on the blush pink.
// Run: node scripts/generate-pwa-icons.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BACKGROUND = hex("#e8679a"); // --expense-mark / blush accent
const FUR = hex("#fff1e8");
const INNER_EAR = hex("#f7a8c2"); // --blush
const LINE = hex("#4a3b47"); // --cat-line
const NOSE = hex("#c93d78"); // --primary

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, y);
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inTriangle(u, v, [a, b, c]) {
  const sign = (p1, p2) => (u - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (v - p2[1]);
  const d1 = sign(a, b);
  const d2 = sign(b, c);
  const d3 = sign(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const mirror = (tri) => tri.map(([u, v]) => [-u, v]);
const EAR = [[-0.92, -0.2], [-0.74, -1.18], [-0.12, -0.68]];
const INNER = [[-0.72, -0.42], [-0.64, -0.96], [-0.32, -0.66]];
const NOSE_TRI = [[-0.11, 0.22], [0.11, 0.22], [0, 0.34]];

/**
 * Colour of the topmost shape at normalised point (u, v); the head has
 * radius ≈ 1 and v grows downwards. Order: background → ears → head →
 * features.
 */
function catColor(u, v) {
  let color = BACKGROUND;
  if (inTriangle(u, v, EAR) || inTriangle(u, v, mirror(EAR))) color = FUR;
  if (inTriangle(u, v, INNER) || inTriangle(u, v, mirror(INNER))) color = INNER_EAR;
  if ((u / 1) ** 2 + ((v - 0.05) / 0.86) ** 2 <= 1) color = FUR;
  for (const cx of [-0.62, 0.62]) {
    if (Math.hypot(u - cx, v - 0.3) <= 0.15) color = INNER_EAR;
  }
  // Happy closed eyes: upper half-rings.
  for (const cx of [-0.38, 0.38]) {
    const d = Math.hypot(u - cx, v - 0.1);
    if (v <= 0.1 && Math.abs(d - 0.16) <= 0.05) color = LINE;
  }
  if (inTriangle(u, v, NOSE_TRI)) color = NOSE;
  return color;
}

/**
 * Cat face scaled by `glyphScale` of the canvas so the maskable variant
 * keeps it inside the 80% safe zone.
 */
function catIcon(size, glyphScale) {
  const SAMPLES = 4;
  const half = (size * glyphScale) / 2;
  const cx = size / 2;
  const cy = size / 2 + half * 0.08; // ears make the glyph top-heavy

  return encodePng(size, (x, y) => {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const u = (x + (sx + 0.5) / SAMPLES - cx) / half;
        const v = (y + (sy + 0.5) / SAMPLES - cy) / half;
        const c = catColor(u, v);
        acc[0] += c[0];
        acc[1] += c[1];
        acc[2] += c[2];
      }
    }
    return acc.map((sum) => Math.round(sum / (SAMPLES * SAMPLES)));
  });
}

const out = path.join(import.meta.dirname, "..", "public");
const icons = [
  ["icon-192.png", 192, 0.6],
  ["icon-512.png", 512, 0.6],
  ["icon-maskable-512.png", 512, 0.46],
  ["apple-touch-icon.png", 180, 0.58],
];
for (const [name, size, scale] of icons) {
  writeFileSync(path.join(out, name), catIcon(size, scale));
  console.log("wrote", name);
}
