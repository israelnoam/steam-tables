#!/usr/bin/env node
// Build-time only. Converts tables.pdf (course booklet) into data/*.json.
// Uses `pdftotext -raw` (content-stream order keeps each printed row on one line).
// Usage: node tools/parse_pdf.js [path/to/tables.pdf]

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, '..');
const PDF = process.argv[2] || path.join(ROOT, 'tables.pdf');
const OUT = path.join(ROOT, 'data');

function page(n) {
  return execFileSync('pdftotext', ['-raw', '-f', String(n), '-l', String(n), PDF, '-'], { encoding: 'latin1' });
}
const NUM = /^-?\d*\.?\d+$/;
const nums = (line) => line.trim().split(/\s+/).filter((t) => NUM.test(t)).map(Number);
const isDataLine = (line) => /^\s*-?\d/.test(line);

function write(id, obj) {
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(obj, null, 0).replace(/\],\[/g, '],\n[').replace(/"rows":\[\[/g, '"rows":[\n['));
  const n = obj.rows ? obj.rows.length : obj.blocks.reduce((a, b) => a + b.rows.length, 0);
  console.log(`${id}: ${n} rows${obj.blocks ? ' in ' + obj.blocks.length + ' blocks' : ''}`);
}

// Restore lost minus signs in a T column that runs "40 36 ... 4 0 4 8": everything before the
// minimum of a leading strictly-decreasing run is negative.
function restoreSigns(ts) {
  let i = 0;
  while (i + 1 < ts.length && ts[i + 1] < ts[i]) i++;
  if (i === 0) return ts.slice();
  // the turning point itself is negative too, unless it is exactly 0
  return ts.map((t, k) => (k < i || (k === i && t !== 0) ? -t : t));
}

// ---------------------------------------------------------------- saturated tables
function satTable({ id, label, substance, pdfPage, bookletPage, indexedBy, units, columns, nCols, map }) {
  const rows = [];
  let mpa = false; // A.1.1 switches its p column from kPa to MPa mid-table
  for (const line of page(pdfPage).split(/\r?\n/)) {
    if (!isDataLine(line)) continue;
    if (/MPa/.test(line)) mpa = true;
    const v = nums(line);
    if (v.length !== nCols) continue;
    rows.push(map ? map(v, mpa) : v);
  }
  return { id, label, substance, region: 'saturated', indexedBy, bookletPage, pdfPage, units, columns, rows };
}

// ---------------------------------------------------------------- block tables (water style: each block has its own T column)
function blockTable({ id, label, substance, region, units, pages, groupSize = 5, hasSatRow }) {
  const blocks = [];
  const assignLog = [];
  for (const { pdfPage, bookletPage } of pages) {
    let cur = null; // blocks currently filling, left to right
    for (const raw of page(pdfPage).split(/\r?\n/)) {
      const line = raw.trim();
      const hdr = [...line.matchAll(/p\s*=\s*([\d.]+)\s*(MPa|kPa)/g)];
      if (hdr.length) {
        cur = hdr.map((m) => ({ p: Number(m[1]), bookletPage, pdfPage, columns: ['T', 'v', 'u', 'h', 's'], rows: [] }));
        blocks.push(...cur);
        continue;
      }
      if (!cur || !isDataLine(line)) continue;
      const tok = line.split(/\s+/);
      if (!tok.every((t) => NUM.test(t))) continue;
      const v = tok.map(Number);
      // Split into slots: each slot is "T v u h s" or a lone "T" (empty printed cell).
      // A slot is empty when the next token repeats the same T, or the line ends.
      const slots = [];
      for (let i = 0; i < v.length;) {
        const T = v[i];
        if (i + 1 >= v.length || v[i + 1] === T || i + groupSize > v.length) { slots.push(null); i += 1; }
        else { slots.push(v.slice(i, i + groupSize)); i += groupSize; }
      }
      const hasLone = slots.includes(null);
      if (hasLone && slots.length >= cur.length) {
        slots.forEach((g, k) => { if (g && cur[k]) cur[k].rows.push(g); });
        continue;
      }
      const groups = slots.filter(Boolean);
      if (groups.length === cur.length) { groups.forEach((g, k) => cur[k].rows.push(g)); continue; }
      // fewer groups than blocks: choose the order-preserving assignment that keeps T increasing in each block;
      // prefer blocks that already have rows and whose last T is closest below.
      const choice = bestAssign(groups, cur, region);
      choice.forEach((bi, gi) => cur[bi].rows.push(groups[gi]));
      assignLog.push(`${id} p${pdfPage}: [${groups.map((g) => g[0]).join(', ')}] -> blocks ${choice.map((b) => cur[b].p).join(', ')}`);
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) if (!blocks[i].rows.length) blocks.splice(i, 1);
  for (const b of blocks) {
    if (hasSatRow && hasSatRow(b)) { b.Tsat = b.rows[0][0]; b.satRow = true; }
  }
  return { obj: { id, label, substance, region, units, blocks }, assignLog };
}

function bestAssign(groups, cur, region) {
  let best = null, bestScore = Infinity;
  const n = cur.length, k = groups.length;
  const rec = (gi, start, acc) => {
    if (gi === k) {
      let score = 0;
      for (let j = 0; j < k; j++) {
        const b = cur[acc[j]], T = groups[j][0];
        const last = b.rows.length ? b.rows[b.rows.length - 1][0] : null;
        if (last !== null && T <= last) return; // must increase
        if (region === 'compressed' && b.rows.length && T >= b.rows[0][0]) return; // compressed liquid: T below this block's T_sat
        score += last === null ? 1000 : T - last;
      }
      if (score < bestScore) { bestScore = score; best = acc.slice(); }
      return;
    }
    for (let b = start; b <= n - (k - gi); b++) rec(gi + 1, b + 1, [...acc, b]);
  };
  rec(0, 0, []);
  return best || groups.map((_, i) => i);
}

// ---------------------------------------------------------------- R-134a superheated (shared T column, 2 blocks per band)
function r134aSuper(pages, pSatZero) {
  const blocks = [];
  for (const { pdfPage, bookletPage } of pages) {
    const lines = page(pdfPage).split(/\r?\n/).map((l) => l.trim());
    let cur = null, rows = [];
    const flush = () => {
      if (!cur) return;
      const plain = restoreSigns(rows.filter((r) => !r.sat).map((r) => r.T));
      let pi = 0;
      const Ts = rows.map((r) => (r.sat ? null : plain[pi++]));
      rows.forEach((r, i) => {
        r.groups.forEach((g, k) => {
          const T = r.sat ? cur[k].Tsat : Ts[i];
          cur[k].rows.push([T, ...g]);
        });
      });
      rows = [];
    };
    for (const line of lines) {
      const hdr = [...line.matchAll(/p\s+([\d.]+)\s*bar/g)];
      if (hdr.length) {
        flush();
        cur = hdr.map((m) => ({ p: Number(m[1]), bookletPage, pdfPage, columns: ['T', 'v', 'u', 'h', 's'], rows: [], satRow: true }));
        blocks.push(...cur);
        continue;
      }
      if (!cur) continue;
      const ts = line.match(/^([\d.]+)C\)/); // "37.07C)" → Tsat, sign lost
      if (ts) {
        const b = cur.find((x) => x.Tsat === undefined);
        if (b) b.Tsat = b.p < pSatZero ? -Number(ts[1]) : Number(ts[1]);
        continue;
      }
      const sat = /^Sat\./.test(line);
      if (!sat && !isDataLine(line)) continue;
      const tok = line.replace(/^Sat\.\s*/, '').split(/\s+/);
      if (!tok.every((t) => NUM.test(t))) continue;
      const v = tok.map(Number);
      const T = sat ? null : v.shift();
      if (v.length % 4) continue;
      const groups = [];
      for (let i = 0; i < v.length; i += 4) groups.push(v.slice(i, i + 4));
      rows.push({ T, sat, groups });
    }
    flush();
  }
  // a block whose first T row is below its own Tsat is impossible: that means the left/right assignment was wrong
  return { id: 'A12', label: 'Table A-12 — Superheated R-134a', substance: 'R134a', region: 'superheated', units: { p: 'bar', T: 'C' }, blocks };
}

// ================================================================= build
fs.mkdirSync(OUT, { recursive: true });
const logs = [];
const satCols13 = ['vf', 'vg', 'uf', 'ufg', 'ug', 'hf', 'hfg', 'hg', 'sf', 'sfg', 'sg'];

const a11 = (satTable({
  id: 'A1.1', label: 'Table A.1.1 — Saturated steam (Temperature)', substance: 'water', pdfPage: 2, bookletPage: '–1–',
  indexedBy: 'T', units: { T: 'C', p: 'kPa' }, columns: ['T', 'p', ...satCols13], nCols: 13,
  // printed p is kPa up to 100 °C, then MPa; stored in kPa. pPrinted keeps the printed number for the reference card.
  map: (v, mpa) => (mpa ? [v[0], +(v[1] * 1000).toPrecision(6), ...v.slice(2)] : v),
}));
{
  const t = a11;
  t.notes = ['p is printed in kPa up to 100 °C and in MPa from 105 °C; stored here in kPa.'];
  t.pPrintedInMPaFromT = 105;
  write('A1.1', t);
}
write('A1.2', satTable({
  id: 'A1.2', label: 'Table A.1.2 — Saturated steam (Pressure)', substance: 'water', pdfPage: 3, bookletPage: '–2–',
  indexedBy: 'p', units: { p: 'kPa', T: 'C' }, columns: ['p', 'T', ...satCols13], nCols: 13,
}));
{
  const r = blockTable({
    id: 'A1.3', label: 'Table A.1.3 — Superheated steam', substance: 'water', region: 'superheated', units: { p: 'MPa', T: 'C' },
    pages: [4, 5, 6, 7].map((p, i) => ({ pdfPage: p, bookletPage: `–${i + 3}–` })),
    hasSatRow: (b) => b.p < 22.09,
  });
  write('A1.3', r.obj); logs.push(...r.assignLog);
}
{
  const r = blockTable({
    id: 'A1.4', label: 'Table A.1.4 — Compressed liquid water', substance: 'water', region: 'compressed', units: { p: 'MPa', T: 'C' },
    pages: [{ pdfPage: 8, bookletPage: '–7–' }],
    hasSatRow: (b) => b.p < 22.09,
  });
  write('A1.4', r.obj); logs.push(...r.assignLog);
}
write('A1.5', satTable({
  id: 'A1.5', label: 'Table A.1.5 — Saturated solid–vapor (water)', substance: 'water', pdfPage: 9, bookletPage: '–8–',
  indexedBy: 'T', units: { T: 'C', p: 'kPa' }, columns: ['T', 'p', 'vi', 'vg', 'ui', 'uig', 'ug', 'hi', 'hig', 'hg', 'si', 'sig', 'sg'], nCols: 13,
}));
write('A2.1', satTable({
  id: 'A2.1', label: 'Table A 2.1 — Saturated ammonia (Temperature)', substance: 'NH3', pdfPage: 10, bookletPage: '–9–',
  indexedBy: 'T', units: { T: 'C', p: 'kPa' }, columns: ['T', 'p', 'vf', 'vfg', 'vg', 'uf', 'ufg', 'ug', 'hf', 'hfg', 'hg', 'sf', 'sfg', 'sg'], nCols: 14,
}));
{
  const r = blockTable({
    id: 'A2.3', label: 'Table A 2.3 — Superheated ammonia', substance: 'NH3', region: 'superheated', units: { p: 'kPa', T: 'C' },
    pages: [{ pdfPage: 11, bookletPage: '–10–' }, { pdfPage: 12, bookletPage: '–11–' }],
  });
  write('A2.3', r.obj); logs.push(...r.assignLog);
}
write('A3.1', satTable({
  id: 'A3.1', label: 'Table A 3.1 — Saturated R-12 (Temperature)', substance: 'R12', pdfPage: 13, bookletPage: '–12–',
  indexedBy: 'T', units: { T: 'C', p: 'MPa' }, columns: ['T', 'p', 'vf', 'vfg', 'vg', 'uf', 'ufg', 'ug', 'hf', 'hfg', 'hg', 'sf', 'sfg', 'sg'], nCols: 14,
}));
{
  const r = blockTable({
    id: 'A3.3', label: 'Table A 3.3 — Superheated R-12', substance: 'R12', region: 'superheated', units: { p: 'MPa', T: 'C' },
    pages: [{ pdfPage: 14, bookletPage: '–13–' }, { pdfPage: 15, bookletPage: '–14–' }],
  });
  r.obj.note = 'The booklet table of contents calls this table "A3.1"; the page header says A 3.3.';
  write('A3.3', r.obj); logs.push(...r.assignLog);
}

// R-134a: columns T p vf*1e3 vg uf ug hf hfg hg sf sg T  (and A-11: p T ... p)
function r134aSat(id, pdfPage, bookletPage, indexedBy) {
  const raw = [];
  for (const line of page(pdfPage).split(/\r?\n/)) {
    if (!isDataLine(line)) continue;
    const v = nums(line);
    if (v.length === 12) raw.push(v);
  }
  const Tcol = indexedBy === 'T' ? 0 : 1;
  const Ts = restoreSigns(raw.map((r) => r[Tcol]));
  const rows = raw.map((r, i) => {
    const T = Ts[i], p = indexedBy === 'T' ? r[1] : r[0];
    const [, , vf3, vg, uf, ug, hf, hfg, hg, sf, sg] = r;
    const vf = +(vf3 / 1000).toPrecision(5);
    return indexedBy === 'T'
      ? [T, p, vf, vg, uf, +(ug - uf).toFixed(2), ug, hf, hfg, hg, sf, +(sg - sf).toFixed(4), sg]
      : [p, T, vf, vg, uf, +(ug - uf).toFixed(2), ug, hf, hfg, hg, sf, +(sg - sf).toFixed(4), sg];
  });
  const first = indexedBy === 'T' ? ['T', 'p'] : ['p', 'T'];
  return {
    id, label: `Table ${id.replace('A', 'A-')} — Saturated R-134a (${indexedBy === 'T' ? 'Temperature' : 'Pressure'})`,
    substance: 'R134a', region: 'saturated', indexedBy, bookletPage, pdfPage, units: { T: 'C', p: 'bar' },
    columns: [...first, ...satCols13], computed: ['ufg', 'sfg'],
    notes: ['v_f is printed ×10³ in the booklet (stored here divided by 1000).', 'Minus signs lost in PDF text were restored.'],
    rows,
  };
}
const a10 = r134aSat('A10', 16, '736', 'T');
write('A10', a10);
write('A11', r134aSat('A11', 17, '737', 'p'));
const pSatZero = a10.rows.find((r) => r[0] === 0)[1];
write('A12', r134aSuper([18, 19, 20].map((p, i) => ({ pdfPage: p, bookletPage: String(738 + i) })), pSatZero));

console.log('\nRows assigned by T-continuity (fewer groups than blocks on the line):');
logs.forEach((l) => console.log('  ' + l));
