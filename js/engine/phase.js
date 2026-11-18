// Saturation lookups per substance and the region decision. No DOM.
import { SUBSTANCES } from './data.js';
import { satLookup, TableRangeError } from './lookup.js';

export const PHASES = {
  compressed: { key: 'compressed', he: 'נוזל דחוס', en: 'compressed liquid' },
  mixture: { key: 'mixture', he: 'תערובת רוויה', en: 'saturated mixture' },
  satLiquid: { key: 'satLiquid', he: 'נוזל רווי', en: 'saturated liquid' },
  satVapor: { key: 'satVapor', he: 'אד רווי', en: 'saturated vapor' },
  superheated: { key: 'superheated', he: 'אד מחומם-על', en: 'superheated vapor' },
  supercritical: { key: 'supercritical', he: 'מעל הנקודה הקריטית', en: 'supercritical (superheated table)' },
  solidVapor: { key: 'solidVapor', he: 'תערובת מוצק–אד', en: 'solid–vapor' },
};

const T_TRIPLE = 0.01;

/** Saturation properties at temperature T (°C). Water below 0.01 °C uses the solid–vapor table. */
export function satByT(db, sub, T) {
  const S = SUBSTANCES[sub];
  if (sub === 'water' && T < T_TRIPLE) {
    const r = satLookup(db.tables[S.solid], 'T', T);
    return { ...r, solid: true };
  }
  const t = db.tables[S.satT];
  const r = satLookup(t, 'T', T);
  // the value may be printed exactly in the pressure table too
  if (S.satP && r.step.method !== 'exact') {
    const tp = db.tables[S.satP];
    const ti = tp.columns.indexOf('T');
    const row = tp.rows.find((x) => Math.abs(x[ti] - T) < 1e-9);
    if (row) r.step.alsoIn = { table: tp.name, bookletPage: tp.bookletPage, row: `p = ${row[0]} ${tp.units.p}` };
  }
  return r;
}

/** Saturation properties at pressure p (kPa). Uses the p-indexed table if the booklet has one, else inverts the T table. */
export function satByP(db, sub, p) {
  const S = SUBSTANCES[sub];
  if (sub === 'water') {
    const tp = db.tables[S.satP];
    const pmin = tp.rows[0][0];
    if (p < pmin) {
      const r = satLookup(db.tables[S.solid], 'p', p);
      return { ...r, solid: true };
    }
  }
  if (S.satP) return satLookup(db.tables[S.satP], 'p', p);
  const r = satLookup(db.tables[S.satT], 'p', p);
  if (r.step.method !== 'exact') r.step.noPTable = true;
  return r;
}

/** Saturation pressure at T, or null if T is outside every saturation table (e.g. above the critical point). */
export function trySatByT(db, sub, T) {
  try { return satByT(db, sub, T); } catch (e) { if (e instanceof TableRangeError) return null; throw e; }
}

export function isAboveCritical(db, sub, { T, p }) {
  const t = db.tables[SUBSTANCES[sub].satT];
  const last = t.rows[t.rows.length - 1];
  const Tc = last[0], pc = last[1] * (t.id === 'A1.1' ? 1 : { kPa: 1, MPa: 1000, bar: 100 }[t.units.p]);
  return { aboveT: T !== undefined && T > Tc, aboveP: p !== undefined && p > pc, Tc, pc, isCriticalRow: sub === 'water' };
}
