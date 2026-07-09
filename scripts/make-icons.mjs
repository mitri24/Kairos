// Dependency-freie PNG-Icon-Erzeugung für die ADHD-Lernuhr.
// Zeichnet ein Uhr-Motiv (Papier-Zifferblatt auf Terrakotta, zwei dunkle Zeiger)
// als RGBA-Pixelpuffer und kodiert es von Hand als PNG:
//   RGBA-Pixel  →  gefilterte Scanlines  →  zlib.deflate  →  IHDR/IDAT/IEND + CRC32.
// Verwendet nur Node-Standardmodule (node:zlib, node:fs).

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = join(__dirname, "..", "web", "icons");

// Farben (aus tokens.css): Akzent, Papier, Tinte.
const ACCENT = [0xa9, 0x52, 0x4a];
const PAPER = [0xfb, 0xf7, 0xf0];
const INK = [0x38, 0x33, 0x2c];

// ── PNG-Kodierung ────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit-Tiefe
  ihdr[9] = 6; // Farbtyp: RGBA
  ihdr[10] = 0; // Kompression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // kein Interlace

  // Scanlines mit Filter-Byte 0 (None) je Zeile.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Zeichnen ─────────────────────────────────────────────────────────────
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;

  // Papier-Zifferblatt gut innerhalb der Maskable-Sicherheitszone (Zentrum 80 %).
  const faceR = size * 0.38;

  // Zeiger-Endpunkte relativ zum Zentrum.
  const hourEnd = [cx - faceR * 0.34, cy - faceR * 0.46];
  const minEnd = [cx + faceR * 0.74, cy - faceR * 0.02];
  const hourW = size * 0.036;
  const minW = size * 0.026;

  const hubR = size * 0.045;
  const hubInner = size * 0.018;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const r = Math.hypot(px - cx, py - cy);

      let col = ACCENT; // Terrakotta-Hintergrund (füllt die Maske randlos)
      if (r <= faceR) col = PAPER; // Papier-Zifferblatt

      // Zeiger nur auf dem Zifferblatt zeichnen.
      if (r <= faceR + hourW) {
        if (distToSegment(px, py, cx, cy, hourEnd[0], hourEnd[1]) <= hourW) col = INK;
        if (distToSegment(px, py, cx, cy, minEnd[0], minEnd[1]) <= minW) col = INK;
      }

      // Nabe.
      if (r <= hubR) col = INK;
      if (r <= hubInner) col = ACCENT;

      const i = (y * size + x) * 4;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 0xff;
    }
  }
  return encodePng(size, size, rgba);
}

// ── Ausgabe ──────────────────────────────────────────────────────────────
mkdirSync(ICON_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = renderIcon(size);
  const path = join(ICON_DIR, `icon-${size}.png`);
  writeFileSync(path, png);
  const sig = png.subarray(0, 8).toString("hex");
  console.log(`icon-${size}.png  ${png.length} bytes  sig=${sig}`);
}
