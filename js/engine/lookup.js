// Table lookups: bracketing rows, linear / double / inverse interpolation. Every lookup returns values
// (internal units: °C, kPa, m³/kg, kJ/kg, kJ/kgK) plus a trace step for the booklet reference card.
import { P_TO_KPA } from './units.js';

export class TableRangeError extends Error {
  constructor(msg, info = {}) { super(msg); this.name = 'TableRangeError'; Object.assign(this, info); }
}

export const lin = (x, x1, y1, x2, y2) => (x2 === x1 ? y1 : y1 + ((x - x1) / (x2 - x1)) * (y2 - y1));

/** Find two rows that bracket x in column ci. Works for ascending or descending columns. */
export function bracket(rows, ci, x) {
  for (let k = 0; k < rows.length; k++) if (rows[k][ci] === x) return { i: k, j: k, f: 0, exact: true };
  for (let k = 0; k < rows.length - 1; k++) {
    const a = rows[k][ci], b = rows[k + 1][ci];
    if ((a - x) * (b - x) < 0) return { i: k, j: k + 1, f: (x - a) / (b - a), exact: false };
  }
  return null;
}

/** Pressure factor from the stored table unit to kPa. A.1.1 stores p in kPa (printed partly in MPa). */
export const pFactor = (t) => (t.id === 'A1.1' ? 1 : P_TO_KPA[t.units.p]);

const genericName = (c) => c.replace(/^([vuhs])i(g?)$/, '$1f$2'); // ice table: vi → vf, uig → ufg

/** Printed form of a table row (booklet units and column names) for the reference card. */
export function printedRow(t, row, columns = t.columns) {
  const o = {};
  columns.forEach((c, k) => {
    let v = row[k], name = c;
    if (c === 'p' && t.id === 'A1.1') {
      if (row[0] >= t.pPrintedInMPaFromT) { v = +(v / 1000).toPrecision(5); name = 'p [MPa]'; } else name = 'p [kPa]';
    }
    if (c === 'vf' && t.substance === 'R134a') { v = +(v * 1000).toPrecision(5); name = 'vf×10³'; }
    o[name] = v;
  });
  return o;
}

function correctionWarnings(t, bi, ris, columns) {
  const w = [];
  for (const ri of new Set(ris)) {
    for (const c of columns) {
      const corr = t.corrected[`${bi}|${ri}|${c}`];
      if (corr) w.push({ kind: 'corrected', table: t.name, col: c, printed: corr.printed, value: corr.value, how: corr.how });
    }
  }
  return w;
}

function rangeError(t, name, value, lo, hi, unit, where = '') {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return new TableRangeError(`הערך מחוץ לטווח הטבלה: ${name} = ${+value.toPrecision(6)} ${unit}. בטבלה ${t.name}${where} הטווח הוא ${a} עד ${b} ${unit}.`, { table: t.id, name, value, lo: a, hi: b, unit });
}

// ------------------------------------------------------------------ saturated tables

/**
 * Saturation lookup by T or p (or any column, e.g. inverse on p in a T-indexed table).
 * value is internal (°C or kPa). Returns { props, step } with props in internal units and generic f/fg/g names.
 */
export function satLookup(t, by, value) {
  const ci = t.columns.indexOf(by);
  const pf = pFactor(t);
  const x = by === 'p' ? value / pf : value;
  const br = bracket(t.rows, ci, x);
  const unit = by === 'p' ? (t.id === 'A1.1' ? 'kPa' : t.units.p) : by === 'T' ? '°C' : '';
  if (!br) {
    const col = t.rows.map((r) => r[ci]);
    throw rangeError(t, by, x, col[0], col[col.length - 1], unit);
  }
  const r1 = t.rows[br.i], r2 = t.rows[br.j];
  const props = {};
  t.columns.forEach((c, k) => {
    let v = br.exact ? r1[k] : r1[k] + br.f * (r2[k] - r1[k]);
    if (c === 'p') v *= pf;
    props[genericName(c)] = v;
  });
  props[by] = value; // keep the given value exact
  const method = br.exact ? 'exact' : by === t.indexedBy ? 'linear' : 'inverse';
  const step = {
    kind: 'table', table: t.id, tableName: t.name, label: t.label, bookletPage: t.bookletPage, pdfPage: t.pdfPage,
    block: null, method, x: { name: by, value: x, unit },
    rows: (br.exact ? [r1] : [r1, r2]).map((r) => printedRow(t, r)),
    f: br.f, indexedBy: t.indexedBy, computedCols: t.computed || [],
    warnings: correctionWarnings(t, -1, [br.i, br.j], t.columns),
  };
  return { props, step };
}

// ------------------------------------------------------------------ block tables (superheated / compressed)

function sortedRows(b) {
  if (!b._sorted) b._sorted = b.rows.map((r, i) => ({ r, i })).sort((a, c) => a.r[0] - c.r[0]);
  return b._sorted;
}

/** Look up inside one pressure block by T (or inverse by v/u/h/s). */
function inBlock(t, bi, by, x) {
  const b = t.blocks[bi];
  const ci = b.columns.indexOf(by);
  const rows = sortedRows(b);
  const br = bracket(rows.map((o) => o.r), ci, x);
  if (!br) return null;
  const o1 = rows[br.i], o2 = rows[br.j];
  const vals = {};
  b.columns.forEach((c, k) => { vals[c] = br.exact ? o1.r[k] : o1.r[k] + br.f * (o2.r[k] - o1.r[k]); });
  vals[by] = x;
  return { vals, br, o1, o2, b, bi };
}

function blockRange(t, bi, by) {
  const b = t.blocks[bi], ci = b.columns.indexOf(by);
  const col = sortedRows(b).map((o) => o.r[ci]);
  return [Math.min(...col), Math.max(...col)];
}

const BY_UNIT = { T: '°C', v: 'm³/kg', u: 'kJ/kg', h: 'kJ/kg', s: 'kJ/(kg·K)' };

/**
 * Superheated or compressed table lookup at pressure pKpa, by T (or v/u/h/s).
 * Single interpolation if p is a printed block, double interpolation otherwise.
 */
export function blockLookup(t, pKpa, by, x) {
  const pf = P_TO_KPA[t.units.p];
  const pt = pKpa / pf;
  const blocks = t.blocks;
  const exact = blocks.findIndex((b) => Math.abs(b.p - pt) < 1e-9);
  const blockLabel = (b) => `p = ${b.p} ${t.units.p}`;
  const mkRows = (res) => (res.br.exact ? [res.o1] : [res.o1, res.o2]).map((o) => printedRow(t, o.r, res.b.columns));
  const warn = (res) => correctionWarnings(t, res.bi, [res.o1.i, res.o2.i], res.b.columns);
  const dir = by === 'T' ? null : 'inverse';

  if (exact >= 0) {
    const res = inBlock(t, exact, by, x);
    if (!res) {
      const [lo, hi] = blockRange(t, exact, by);
      throw rangeError(t, by, x, lo, hi, BY_UNIT[by], `, בלוק ${blockLabel(blocks[exact])},`);
    }
    const props = { ...res.vals, p: pKpa };
    const step = {
      kind: 'table', table: t.id, tableName: t.name, label: t.label, bookletPage: res.b.bookletPage, pdfPage: res.b.pdfPage,
      block: blockLabel(res.b), method: res.br.exact ? 'exact' : dir || 'linear', x: { name: by, value: x, unit: BY_UNIT[by] },
      rows: mkRows(res), f: res.br.f, warnings: warn(res),
    };
    return { props, steps: [step] };
  }
  // double interpolation between two pressure blocks
  let k = -1;
  for (let i = 0; i < blocks.length - 1; i++) if (blocks[i].p < pt && pt < blocks[i + 1].p) k = i;
  if (k < 0) throw rangeError(t, 'p', pt, blocks[0].p, blocks[blocks.length - 1].p, t.units.p);
  const lo = inBlock(t, k, by, x), hi = inBlock(t, k + 1, by, x);
  if (!lo || !hi) {
    const bad = !lo ? k : k + 1;
    const [a, b] = blockRange(t, bad, by);
    throw rangeError(t, by, x, a, b, BY_UNIT[by], `, בלוק ${blockLabel(blocks[bad])} (נדרש לאינטרפולציה כפולה),`);
  }
  const fp = (pt - lo.b.p) / (hi.b.p - lo.b.p);
  const props = { p: pKpa };
  for (const c of lo.b.columns) props[c] = lo.vals[c] + fp * (hi.vals[c] - lo.vals[c]);
  props[by] = x;
  const sub = (res) => ({
    block: blockLabel(res.b), bookletPage: res.b.bookletPage, pdfPage: res.b.pdfPage, method: res.br.exact ? 'exact' : dir || 'linear',
    rows: mkRows(res), f: res.br.f, vals: res.vals,
  });
  const step = {
    kind: 'table', table: t.id, tableName: t.name, label: t.label, bookletPage: lo.b.bookletPage, pdfPage: lo.b.pdfPage,
    block: `${blockLabel(lo.b)} ו-${blockLabel(hi.b)}`, method: 'double', x: { name: by, value: x, unit: BY_UNIT[by] },
    p: { value: pt, unit: t.units.p, p1: lo.b.p, p2: hi.b.p, f: fp },
    parts: [sub(lo), sub(hi)], rows: [...mkRows(lo), ...mkRows(hi)], warnings: [...warn(lo), ...warn(hi)],
  };
  return { props, steps: [step] };
}

/**
 * Inverse in pressure: at fixed T, find p such that column `col` equals target, scanning blocks.
 * Used for T + v (superheated / compressed). Returns null if no pair of blocks brackets the target.
 */
export function blockInverseP(t, T, col, target) {
  const vals = t.blocks.map((b, bi) => {
    const r = inBlock(t, bi, 'T', T);
    return r ? { bi, p: b.p, y: r.vals[col], res: r } : null;
  });
  for (let i = 0; i < vals.length - 1; i++) {
    const a = vals[i], b = vals[i + 1];
    if (!a || !b) continue;
    if (a.y === target) return { pKpa: a.p * P_TO_KPA[t.units.p] };
    if ((a.y - target) * (b.y - target) < 0) {
      // linear in p: exactly consistent with the double interpolation blockLookup does at the resulting p
      const f = (target - a.y) / (b.y - a.y);
      return { pKpa: (a.p + f * (b.p - a.p)) * P_TO_KPA[t.units.p], a, b, f };
    }
  }
  return null;
}
