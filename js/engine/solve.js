// Main entry point: solve(db, input) → { state, traces, warnings }. No DOM.
import { SUBSTANCES } from './data.js';
import { blockLookup, blockInverseP, satLookup, TableRangeError, lin } from './lookup.js';
import { PHASES, satByT, satByP, trySatByT } from './phase.js';
import { P_TO_KPA } from './units.js';

export const PAIRS = [
  ['T', 'p'], ['T', 'x'], ['p', 'x'], ['T', 'v'], ['p', 'v'], ['p', 'h'], ['p', 's'], ['v', 'u'],
];

const PROPS = ['T', 'p', 'v', 'u', 'h', 's'];
const err = (msg, extra) => Object.assign(new TableRangeError(msg), extra || {});

/**
 * @param db     result of loadAll()
 * @param input  { substance: 'water'|'NH3'|'R12'|'R134a', given: { T?, p?, v?, u?, h?, s?, x? } } in internal units
 */
export function solve(db, input) {
  const { substance: sub, given } = input;
  const S = SUBSTANCES[sub];
  if (!S) throw new Error(`unknown substance ${sub}`);
  const names = Object.keys(given);
  if (names.length !== 2) throw err('יש להזין בדיוק שתי תכונות.');
  for (const n of names) if (!Number.isFinite(given[n])) throw err(`ערך לא תקין עבור ${n}.`);
  const ctx = { db, sub, S, traces: [], src: {}, warnings: [] };
  const key = names.slice().sort().join('+');
  let state;
  switch (key) {
    case 'T+p': state = solveTP(ctx, given.T, given.p); break;
    case 'T+x': state = solveSatX(ctx, 'T', given.T, given.x); break;
    case 'p+x': state = solveSatX(ctx, 'p', given.p, given.x); break;
    case 'T+v': state = solveTY(ctx, given.T, 'v', given.v); break;
    case 'p+v': state = solvePY(ctx, given.p, 'v', given.v); break;
    case 'h+p': state = solvePY(ctx, given.p, 'h', given.h); break;
    case 'p+s': state = solvePY(ctx, given.p, 's', given.s); break;
    case 'u+v': state = solveVU(ctx, given.v, given.u); break;
    default: throw err('צירוף התכונות הזה לא נתמך. בחרו אחד משמונת הצירופים.');
  }
  for (const n of names) state[n] = given[n];
  state.given = names;
  // collect warnings from all steps
  for (const st of ctx.traces) for (const w of st.warnings || []) ctx.warnings.push(w);
  return { state, traces: ctx.traces, warnings: ctx.warnings, src: ctx.src };
}

// ------------------------------------------------------------------ helpers
function push(ctx, step, props) {
  ctx.traces.push(step);
  const i = ctx.traces.length - 1;
  for (const n of props || []) ctx.src[n] = i;
  return i;
}

function pushTable(ctx, step, props) { return push(ctx, step, props); }

const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));

function satStepFor(ctx, by, value) {
  const r = by === 'T' ? satByT(ctx.db, ctx.sub, value) : satByP(ctx.db, ctx.sub, value);
  return r;
}

/** State inside the dome from saturation props and quality x. */
function mixture(ctx, sat, x, givenName, givenValue) {
  const st = { T: sat.props.T, p: sat.props.p, x };
  const lines = [];
  for (const y of ['v', 'u', 'h', 's']) {
    const f = sat.props[y + 'f'], g = sat.props[y + 'g'];
    st[y] = f + x * (g - f);
    lines.push({ name: y, f, g, value: st[y] });
  }
  if (givenName) st[givenName] = givenValue;
  const phase = sat.solid ? PHASES.solidVapor : x === 0 ? PHASES.satLiquid : x === 1 ? PHASES.satVapor : PHASES.mixture;
  push(ctx, { kind: 'quality', method: 'quality', x, lines, given: givenName ? { name: givenName, value: givenValue } : null, solid: !!sat.solid, warnings: [] }, ['v', 'u', 'h', 's', 'x'].filter((n) => n !== givenName));
  st.phase = phase;
  return st;
}

function compareStep(ctx, name, value, f, g, verdict, solid) {
  push(ctx, { kind: 'compare', name, value, f, g, verdict, solid: !!solid, warnings: [] });
}

/** Compressed liquid at (p, by=value): compressed table if p is inside it, else the saturated-liquid approximation. */
function compressed(ctx, p, by, value, Tsat) {
  const { db, S, sub } = ctx;
  if (S.comp) {
    const t = db.tables[S.comp];
    const pmin = t.blocks[0].p * P_TO_KPA[t.units.p];
    if (p >= pmin) {
      try {
        const r = blockLookup(t, p, by, value);
        r.steps.forEach((s) => pushTable(ctx, s, ['T', 'v', 'u', 'h', 's'].filter((n) => n !== by)));
        return { ...pick(r.props, PROPS), p, x: null, phase: PHASES.compressed };
      } catch (e) {
        if (!(e instanceof TableRangeError)) throw e;
        ctx.warnings.push({ kind: 'approx', text: `הערך מחוץ לשורות הטבלה הדחוסה (${e.message}); משתמשים בקירוב נוזל רווי.` });
      }
    }
  }
  return approxLiquid(ctx, p, by, value);
}

/** v ≈ vf(T), u ≈ uf(T), s ≈ sf(T), h ≈ hf(T) + vf(T)(p − psat(T)). For by ≠ T, T is found by inverting the yf column. */
function approxLiquid(ctx, p, by, value) {
  const { db, S, sub } = ctx;
  const t = db.tables[S.satT];
  let r;
  if (by === 'T') r = satByT(db, sub, value);
  else {
    const col = { v: 'vf', u: 'uf', h: 'hf', s: 'sf' }[by];
    r = satLookup(t, col, value);
  }
  const T = r.props.T, P = r.props;
  const st = { T, p, v: P.vf, u: P.uf, s: P.sf, h: P.hf + P.vf * (p - P.p), x: null, phase: PHASES.compressed };
  if (by !== 'T' && by !== 'h') st[by] = value;
  if (by === 'h') { st.h = value; } // given h: T from h ≈ hf(T)
  pushTable(ctx, r.step, []);
  const reason = S.comp ? 'הטבלה הדחוסה A.1.4 מתחילה ב-5 MPa' : 'בחוברת אין טבלת נוזל דחוס לחומר הזה';
  push(ctx, {
    kind: 'approx', method: 'approx', by, p, Tsat: P.T, psat: P.p, vf: P.vf, uf: P.uf, hf: P.hf, sf: P.sf, T, result: st, reason,
    warnings: [{ kind: 'approx', text: `קירוב נוזל רווי: ${reason}. התכונות נלקחות מהשורה של T = ${+T.toPrecision(6)} °C בטבלת הרוויה.` }],
  }, ['T', 'v', 'u', 'h', 's'].filter((n) => n !== by));
  return st;
}

function superheated(ctx, p, by, value) {
  const t = ctx.db.tables[ctx.S.sup];
  const r = blockLookup(t, p, by, value);
  r.steps.forEach((s) => pushTable(ctx, s, ['T', 'v', 'u', 'h', 's'].filter((n) => n !== by)));
  return { ...pick(r.props, PROPS), p, x: null, phase: PHASES.superheated };
}

// ------------------------------------------------------------------ pairs

function solveTP(ctx, T, p) {
  const { db, sub, S } = ctx;
  const sat = trySatByT(db, sub, T);
  if (!sat) {
    const t = db.tables[S.satT];
    const Tmax = t.rows[t.rows.length - 1][0];
    if (T > Tmax) {
      if (sub === 'water') {
        push(ctx, { kind: 'note', text: 'supercriticalT', T, Tc: Tmax, warnings: [] });
        const st = superheated(ctx, p, 'T', T);
        st.phase = p > 22090 ? PHASES.supercritical : PHASES.superheated;
        return st;
      }
      // refrigerant above its table: p_sat(T) > p_sat(Tmax); if p is below that, it is certainly superheated
      const pmax = t.rows[t.rows.length - 1][1] * P_TO_KPA[t.units.p];
      if (p < pmax) {
        push(ctx, { kind: 'note', text: 'aboveSatTable', T, Tmax, pmax, warnings: [] });
        return superheated(ctx, p, 'T', T);
      }
    }
    throw err(`T = ${T} °C מחוץ לטבלת הרוויה, ולכן אי אפשר להחליט על הפאזה.`);
  }
  if (sat.solid && !(T >= 0 && p > sat.props.p && ctx.S.comp && p >= ctx.db.tables[ctx.S.comp].blocks[0].p * 1000)) {
    throw err('מתחת ל-0.01 °C החוברת נותנת רק את טבלת מוצק–אד (A.1.5). עם T ו-p בלבד אי אפשר לקבוע שם מצב (חוץ מנוזל דחוס ב-0 °C מעל 5 MPa) — השתמשו ב-T + x.');
  }
  pushTable(ctx, sat.step, []);
  const psat = sat.props.p;
  const rel = Math.abs(p - psat) / psat;
  if (rel < 2e-4) throw err(`p שווה ל-p_sat(T) = ${+psat.toPrecision(5)} kPa: המצב בתוך הפעמון, ו-T ו-p לבדם לא קובעים אותו. הזינו תכונה נוספת (למשל x).`);
  if (p < psat) {
    compareStep(ctx, 'p', p, psat, psat, 'superheated');
    return superheated(ctx, p, 'T', T);
  }
  compareStep(ctx, 'p', p, psat, psat, 'compressed');
  return compressed(ctx, p, 'T', T, T);
}

function solveSatX(ctx, by, value, x) {
  if (!(x >= 0 && x <= 1)) throw err('האיכות x חייבת להיות בין 0 ל-1.');
  const sat = satStepFor(ctx, by, value);
  pushTable(ctx, sat.step, [by === 'T' ? 'p' : 'T']);
  return mixture(ctx, sat, x);
}

function dome(ctx, sat, y, value) {
  const f = sat.props[y + 'f'], g = sat.props[y + 'g'];
  if (value < f) return { region: 'compressed', f, g };
  if (value > g) return { region: 'superheated', f, g };
  return { region: 'mixture', f, g, x: (value - f) / (g - f) };
}

function solveTY(ctx, T, y, value) {
  const { db, sub, S } = ctx;
  const sat = trySatByT(db, sub, T);
  if (!sat) {
    if (sub === 'water' && T > S.Tc) {
      push(ctx, { kind: 'note', text: 'supercriticalT', T, Tc: S.Tc, warnings: [] });
      return superheatedTY(ctx, T, y, value, PHASES.supercritical);
    }
    throw err(`T = ${T} °C מחוץ לטבלת הרוויה.`);
  }
  pushTable(ctx, sat.step, ['p']);
  const d = dome(ctx, sat, y, value);
  compareStep(ctx, y, value, d.f, d.g, d.region, sat.solid);
  if (d.region === 'mixture') return mixture(ctx, sat, d.x, y, value);
  if (sat.solid) throw err('המצב מחוץ לפעמון מוצק–אד; לאזור הזה אין טבלה בחוברת.');
  if (d.region === 'superheated') return superheatedTY(ctx, T, y, value, PHASES.superheated);
  // compressed liquid with T + v: p from the compressed table if possible
  if (S.comp) {
    const t = db.tables[S.comp];
    const inv = blockInverseP(t, T, y, value);
    if (inv && inv.a) {
      const st = compressed(ctx, inv.pKpa, 'T', T, T);
      ctx.traces[ctx.traces.length - 1].inverseP = { col: y, target: value, a: { p: inv.a.p, y: inv.a.y }, b: { p: inv.b.p, y: inv.b.y }, f: inv.f, unit: t.units.p };
      ctx.src.p = ctx.traces.length - 1;
      st[y] = value;
      return st;
    }
  }
  throw err('נוזל דחוס: v כמעט לא תלוי בלחץ, ולכן T ו-v לא מספיקים כדי לקבוע את p מהטבלאות. הזינו את p.');
}

function superheatedTY(ctx, T, y, value, phase) {
  const t = ctx.db.tables[ctx.S.sup];
  const inv = blockInverseP(t, T, y, value);
  if (!inv) throw err(`לא נמצאו שני בלוקי לחץ בטבלה ${t.name} שבהם ${y} = ${value} ב-T = ${T} °C. הערך מחוץ לטווח הטבלה.`);
  const st = superheated(ctx, inv.pKpa, 'T', T);
  if (inv.a) {
    const step = ctx.traces[ctx.traces.length - 1];
    step.inverseP = { col: y, target: value, a: { p: inv.a.p, y: inv.a.y }, b: { p: inv.b.p, y: inv.b.y }, f: inv.f, unit: t.units.p };
    ctx.src.p = ctx.traces.length - 1;
  }
  st[y] = value;
  st.phase = phase;
  return st;
}

function solvePY(ctx, p, y, value) {
  const { db, sub, S } = ctx;
  let sat;
  try { sat = satByP(db, sub, p); } catch (e) {
    if (!(e instanceof TableRangeError)) throw e;
    if (sub === 'water' && p > S.pc) {
      push(ctx, { kind: 'note', text: 'supercriticalP', p, pc: S.pc, warnings: [] });
      try { const st = superheated(ctx, p, y, value); st.phase = PHASES.supercritical; return st; } catch (e2) {
        if (!(e2 instanceof TableRangeError)) throw e2;
        return compressed(ctx, p, y, value);
      }
    }
    throw e;
  }
  pushTable(ctx, sat.step, ['T']);
  const d = dome(ctx, sat, y, value);
  compareStep(ctx, y, value, d.f, d.g, d.region, sat.solid);
  if (d.region === 'mixture') return mixture(ctx, sat, d.x, y, value);
  if (sat.solid) throw err('המצב מחוץ לפעמון מוצק–אד; לאזור הזה אין טבלה בחוברת.');
  if (d.region === 'superheated') return superheated(ctx, p, y, value);
  return compressed(ctx, p, y, value);
}

/** v + u: search the saturation table for the row where u(x(v)) matches, else the superheated blocks. */
function solveVU(ctx, v, u) {
  const { db, S } = ctx;
  const t = db.tables[S.satT];
  const c = Object.fromEntries(t.columns.map((n, i) => [n, i]));
  const cand = t.rows.map((r) => {
    const x = (v - r[c.vf]) / (r[c.vg] - r[c.vf]);
    if (!(x >= 0 && x <= 1)) return null;
    return { T: r[c.T], x, u: r[c.uf] + x * (r[c.ug] - r[c.uf]) };
  });
  for (let i = 0; i < cand.length - 1; i++) {
    const a = cand[i], b = cand[i + 1];
    if (!a || !b) continue;
    if ((a.u - u) * (b.u - u) <= 0 && a.u !== b.u) {
      const T = lin(u, a.u, a.T, b.u, b.T);
      push(ctx, { kind: 'search', where: 'sat', table: t.id, tableName: t.name, bookletPage: t.bookletPage, v, u, a, b, T, warnings: [] }, []);
      const sat = satByT(db, ctx.sub, T);
      pushTable(ctx, sat.step, ['T', 'p']);
      const x = (v - sat.props.vf) / (sat.props.vg - sat.props.vf);
      const st = mixture(ctx, sat, x, 'v', v);
      st.u = u;
      return st;
    }
  }
  // superheated: in every block find the row with this v, compare u
  const ts = db.tables[S.sup];
  const pts = [];
  for (const b of ts.blocks) {
    try {
      const r = blockLookup(ts, b.p * P_TO_KPA[ts.units.p], 'v', v);
      pts.push({ p: b.p, u: r.props.u, T: r.props.T });
    } catch { pts.push(null); }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    if ((a.u - u) * (b.u - u) <= 0 && a.u !== b.u) {
      const pt = lin(u, a.u, a.p, b.u, b.p);
      push(ctx, { kind: 'search', where: 'sup', table: ts.id, tableName: ts.name, v, u, a, b, p: pt, unit: ts.units.p, warnings: [] }, []);
      const st = superheated(ctx, pt * P_TO_KPA[ts.units.p], 'v', v);
      ctx.src.p = ctx.traces.length - 2;
      st.u = u;
      return st;
    }
  }
  throw err('לא נמצא מצב בטבלאות שבו גם v וגם u מתאימים. ייתכן שהמצב מחוץ לטווח החוברת.');
}
