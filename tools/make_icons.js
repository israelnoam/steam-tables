#!/usr/bin/env node
// Build-time only: draws the app icon (saturation dome + state point + steam wisp) as SVG and PNGs.
// Pure Node (zlib) — no image libraries. Usage: node tools/make_icons.js
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');
fs.mkdirSync(out, { recursive: true });

const BG1 = [11, 107, 203], BG2 = [7, 64, 140], INK = [255, 255, 255], DOT = [255, 196, 87];

// geometry in a 32×32 design grid
const bez = (p0, p1, p2, p3, n = 120) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, u = 1 - t;
  return [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]];
});
const dome = bez([5, 26], [8.5, 7], [23.5, 7], [27, 26]);
const wisp = Array.from({ length: 60 }, (_, i) => { const t = i / 59; return [16 + 1.6 * Math.sin(t * 2 * Math.PI), 9.6 - t * 6.6]; });
const dot = [13.2, 20];

function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
const polyDist = (px, py, pts) => { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, py, pts[i], pts[i + 1])); return d; };

function render(N, { maskable = false, rounded = false } = {}) {
  const px = Buffer.alloc(N * N * 4);
  const scale = maskable ? 0.72 : 0.92; // maskable: keep the art inside the safe zone
  const s = (N / 32) * scale, off = (N - 32 * s) / 2;
  const radius = rounded ? N * 0.22 : 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      // background coverage (rounded square)
      let cov = 1;
      if (radius) {
        const cx = Math.min(Math.max(x + 0.5, radius), N - radius), cy = Math.min(Math.max(y + 0.5, radius), N - radius);
        cov = Math.max(0, Math.min(1, radius - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
      }
      const g = (x + y) / (2 * N);
      let col = BG1.map((c, k) => c + (BG2[k] - c) * g);
      // design-space coordinates
      const dx = (x + 0.5 - off) / s, dy = (y + 0.5 - off) / s;
      const aa = 0.5 / s; // half a pixel in design units
      const ink = (d, w) => Math.max(0, Math.min(1, (w / 2 - d) / (2 * aa) + 0.5));
      const a1 = Math.max(ink(polyDist(dx, dy, dome), 2.6), ink(polyDist(dx, dy, wisp), 1.8) * 0.85);
      col = col.map((c, k) => c + (INK[k] - c) * a1);
      const a2 = ink(Math.hypot(dx - dot[0], dy - dot[1]), 5.6);
      col = col.map((c, k) => c + (DOT[k] - c) * a2);
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = Math.round(255 * cov);
    }
  }
  return png(N, px);
}

function png(N, rgba) {
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const svgPath = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L');
fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(${BG1})"/><stop offset="1" stop-color="rgb(${BG2})"/></linearGradient></defs>
<rect width="32" height="32" rx="7" fill="url(#g)"/>
<g transform="translate(1.28 1.28) scale(.92)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
<path d="${svgPath(dome)}" stroke-width="2.6"/><path d="${svgPath(wisp)}" stroke-width="1.8" stroke-opacity=".85"/>
<circle cx="${dot[0]}" cy="${dot[1]}" r="2.8" fill="rgb(${DOT})" stroke="none"/></g></svg>
`);
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180));
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, { rounded: true }));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, { rounded: true }));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, { maskable: true }));
console.log('icons written to', out);
