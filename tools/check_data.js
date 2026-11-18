#!/usr/bin/env node
// Build-time consistency checks on data/*.json (after applying data/corrections.json).
// Prints every suspicious cell with a suggested value. Exit code 1 if anything is flagged.
import { loadAllNode } from '../js/engine/data.js';

const KPA = { kPa: 1, MPa: 1000, bar: 100 };
const { tables } = await loadAllNode();
const flags = [];
const flag = (tbl, where, col, printed, suggest, why) =>
  flags.push({ tbl, where, col, printed, suggest: suggest === undefined ? '' : +suggest.toPrecision(6), why });

const lin = (x, x1, y1, x2, y2) => y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);

// ------------------------------------------------------------- saturated tables
for (const t of Object.values(tables).filter((t) => t.region === 'saturated')) {
  const c = Object.fromEntries(t.columns.map((n, i) => [n, i]));
  const f = c.uf !== undefined ? 'f' : 'i';
  const pk = KPA[t.units.p];
  const comp = new Set(t.computed || []);
  // order rows by T ascending for monotonic checks
  const rows = t.rows.map((r, i) => ({ r, i })).sort((a, b) => a.r[c.T] - b.r[c.T]);
  const key = (r) => `${t.indexedBy}=${r[c[t.indexedBy]]}`;
  for (const { r } of rows) {
    for (const y of ['v', 'u', 'h', 's']) {
      const yf = c[y + f], yfg = c[y + f + 'g'] ?? c[y + 'fg'], yg = c[y + 'g'];
      if (yf === undefined || yfg === undefined || yg === undefined || comp.has(t.columns[yfg])) continue;
      const tol = y === 's' ? 0.0003 : y === 'v' ? Math.max(6e-5, 2e-4 * r[yg]) : 0.15;
      const err = r[yf] + r[yfg] - r[yg];
      if (Math.abs(err) > tol) flag(t.id, key(r), `${y}${f}+${y}${f}g≠${y}g`, `${r[yf]} + ${r[yfg]} = ${+(r[yf] + r[yfg]).toFixed(6)} vs ${r[yg]}`, undefined, 'sum');
    }
    for (const s of [f, 'g']) {
      const u = r[c['u' + s]], h = r[c['h' + s]], v = r[c['v' + s]];
      const pv = r[c.p] * pk * v;
      const err = h - (u + pv);
      if (Math.abs(err) > 0.6 + 0.002 * Math.abs(h)) flag(t.id, key(r), `h${s}≈u${s}+pv${s}`, `${h} vs ${(u + pv).toFixed(2)}`, undefined, 'h=u+pv');
    }
  }
  // monotonic in T: p up; v_g down; u_f,h_f up (s_f up except ice); h_fg down
  const mono = [['p', 1], ['vg', -1], ['u' + f, 1], ['h' + f, 1], ['s' + f, 1], ['hfg', -1], ['ug', 0]];
  for (const [name, dir] of mono) {
    if (!dir || c[name] === undefined) continue;
    for (let k = 1; k < rows.length - 1; k++) {
      const [a, b, d] = [rows[k - 1].r, rows[k].r, rows[k + 1].r];
      const ok = (x, y) => (dir > 0 ? y >= x : y <= x);
      const ci = c[name];
      if (!ok(a[ci], b[ci]) && ok(a[ci], d[ci])) {
        flag(t.id, key(b), name, b[ci], lin(b[c.T], a[c.T], a[ci], d[c.T], d[ci]), 'monotonic in T');
      }
    }
  }
}

// ------------------------------------------------------------- block tables
for (const t of Object.values(tables).filter((t) => t.blocks)) {
  const pk = KPA[t.units.p];
  const blocks = t.blocks;
  blocks.forEach((b, bi) => {
    const where = (r) => `p=${b.p} ${t.units.p}, T=${r[0]}`;
    for (let k = 0; k < b.rows.length; k++) {
      const r = b.rows[k];
      const err = r[3] - (r[2] + b.p * pk * r[1]);
      if (Math.abs(err) > 1 + 0.002 * Math.abs(r[3])) {
        // suggest: whichever of u or h matches interpolation from neighbours better
        flag(t.id, where(r), 'h≈u+pv', `h=${r[3]} u=${r[2]} v=${r[1]}`, r[2] + b.p * pk * r[1], 'h=u+pv');
      }
    }
    // monotonic in T within the block (skip the saturated-liquid row of the compressed table)
    const start = t.region === 'compressed' && b.satRow ? 1 : 0;
    for (const ci of [0, 1, 2, 3, 4]) {
      for (let k = start + 1; k < b.rows.length; k++) {
        const prev = b.rows[k - 1], cur = b.rows[k], next = b.rows[k + 1];
        if (cur[ci] > prev[ci] || (ci > 0 && cur[ci] === prev[ci] && t.region === 'compressed')) continue;
        if (ci === 4 && t.region === 'compressed' && cur[0] <= 20) continue; // s≈0 at 0 °C
        // decide which of prev/cur is the bad one
        const bad = next && next[ci] > prev[ci] ? cur : prev;
        const bk = b.rows.indexOf(bad);
        const n1 = b.rows[bk - 1], n2 = b.rows[bk + 1];
        flag(t.id, where(bad), t.blocks[bi].columns[ci], bad[ci], n1 && n2 ? lin(bad[0], n1[0], n1[ci], n2[0], n2[ci]) : undefined, 'monotonic in T');
      }
    }
  });
  // across pressure at the same T: v and s fall with p (superheated); v falls with p (compressed)
  const cols = t.region === 'superheated' ? [1, 4] : [1];
  for (let bi = 1; bi < blocks.length - 1; bi++) {
    const [lo, b, hi] = [blocks[bi - 1], blocks[bi], blocks[bi + 1]];
    for (const r of b.rows) {
      const rl = lo.rows.find((x) => x[0] === r[0]), rh = hi.rows.find((x) => x[0] === r[0]);
      if (!rl || !rh) continue;
      for (const ci of cols) {
        if (!(r[ci] < rl[ci] && r[ci] > rh[ci]) && rl[ci] > rh[ci]) {
          const sug = ci === 1 ? Math.exp(lin(Math.log(b.p), Math.log(lo.p), Math.log(rl[ci]), Math.log(hi.p), Math.log(rh[ci]))) : lin(Math.log(b.p), Math.log(lo.p), rl[ci], Math.log(hi.p), rh[ci]);
          flag(t.id, `p=${b.p} ${t.units.p}, T=${r[0]}`, b.columns[ci], r[ci], sug, `between p=${lo.p} (${rl[ci]}) and p=${hi.p} (${rh[ci]})`);
        }
      }
    }
  }
}

if (!flags.length) {
  console.log('check_data: all tables consistent (after corrections).');
} else {
  console.log(`check_data: ${flags.length} flagged cell(s):`);
  for (const f of flags) console.log(`  ${f.tbl.padEnd(5)} ${f.where.padEnd(28)} ${String(f.col).padEnd(14)} printed ${f.printed}  suggest ${f.suggest}  [${f.why}]`);
  process.exitCode = 1;
}
