// Run: node tests/engine.test.js   (no framework)
import { loadAllNode, TABLE_IDS } from '../js/engine/data.js';
import { solve } from '../js/engine/solve.js';
import { P_TO_KPA } from '../js/engine/units.js';
import { trySatByT } from '../js/engine/phase.js';
const trySat = (sub, T) => trySatByT(db, sub, T);

const db = await loadAllNode();
let pass = 0, fail = 0;
const failures = [];
const covered = new Set(); // "table" and "table|block"

function check(name, cond, detail = '') {
  if (cond) pass++;
  else { fail++; failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a, b, rel = 2e-4, abs = 1e-6) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
function run(name, input) {
  try {
    const r = solve(db, input);
    for (const st of r.traces) {
      if (st.table) covered.add(st.table);
      if (st.table && st.block) covered.add(`${st.table}|${st.block}`);
      for (const part of st.parts || []) covered.add(`${st.table}|${part.block}`);
    }
    return r;
  } catch (e) {
    fail++; failures.push(`✗ ${name} threw: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------- hand-solved cases (SPEC §8)
{
  const r = run('water p=200kPa v=0.35', { substance: 'water', given: { p: 200, v: 0.35 } });
  if (r) {
    check('p=200,v=0.35 phase mixture', r.state.phase.key === 'mixture', r.state.phase.key);
    check('p=200,v=0.35 T=120.23', near(r.state.T, 120.23), r.state.T);
    check('p=200,v=0.35 x≈0.394', Math.abs(r.state.x - 0.394) < 0.0006, r.state.x);
    check('p=200 uses A1.2', r.traces[0].table === 'A1.2');
  }
}
{
  const r = run('water p=2MPa T=500', { substance: 'water', given: { p: 2000, T: 500 } });
  if (r) {
    check('2MPa 500C superheated', r.state.phase.key === 'superheated', r.state.phase.key);
    check('2MPa 500C v=0.17568', near(r.state.v, 0.17568), r.state.v);
    const st = r.traces.find((s) => s.table === 'A1.3');
    check('2MPa 500C from A1.3 page –4–', st && st.bookletPage === '–4–', st && st.bookletPage);
  }
}
{
  const r = run('water p=300kPa T=250', { substance: 'water', given: { p: 300, T: 250 } });
  if (r) {
    check('300kPa 250C superheated', r.state.phase.key === 'superheated');
    check('300kPa 250C v=0.7964', near(r.state.v, 0.7964), r.state.v);
  }
}
{
  const r = run('water T=22 x=0', { substance: 'water', given: { T: 22, x: 0 } });
  if (r) {
    check('T=22 x=0 p≈2.671', Math.abs(r.state.p - 2.671) < 0.0006, r.state.p);
    check('T=22 x=0 linear in A1.1', r.traces[0].table === 'A1.1' && r.traces[0].method === 'linear');
  }
}
{
  const a = run('water T=140 v=0.3', { substance: 'water', given: { T: 140, v: 0.3 } });
  if (a) {
    const r = run('water v=0.6 u=u(140C,0.3)', { substance: 'water', given: { v: 0.6, u: a.state.u } });
    if (r) {
      check('free expansion finds a state', Number.isFinite(r.state.T) && Number.isFinite(r.state.p), JSON.stringify(r.state));
      check('free expansion u preserved', near(r.state.u, a.state.u));
      check('free expansion is a mixture', r.state.phase.key === 'mixture', r.state.phase.key);
    }
  }
}
// compressed-liquid approximation below 5 MPa, compressed table at 10 MPa
{
  const r = run('water 1MPa 50C', { substance: 'water', given: { p: 1000, T: 50 } });
  if (r) {
    check('1MPa 50C compressed', r.state.phase.key === 'compressed');
    check('1MPa 50C approx v=vf(50)', near(r.state.v, 0.001012));
    check('1MPa 50C approx h=hf+vf(p-psat)', near(r.state.h, 209.33 + 0.001012 * (1000 - 12.349)), r.state.h);
    check('1MPa 50C approx warning', r.warnings.some((w) => w.kind === 'approx'));
  }
  const c = run('water 10MPa 100C', { substance: 'water', given: { p: 10000, T: 100 } });
  if (c) check('10MPa 100C from A1.4', near(c.state.h, 426.51) && c.traces.some((s) => s.table === 'A1.4'), c.state.h);
}
// corrected-cell warning
{
  const r = run('water 3MPa 300C', { substance: 'water', given: { p: 3000, T: 300 } });
  if (r) {
    check('3MPa 300C s corrected', near(r.state.s, 6.539), r.state.s);
    check('3MPa 300C corrected warning', r.warnings.some((w) => w.kind === 'corrected'));
  }
}
// double interpolation
{
  const r = run('water 1.1MPa 225C', { substance: 'water', given: { p: 1100, T: 225 } });
  if (r) {
    const st = r.traces.find((s) => s.method === 'double');
    check('1.1MPa 225C double interpolation', !!st && st.rows.length === 4);
  }
}
// out of range → clear error
{
  let msg = '';
  try { solve(db, { substance: 'water', given: { p: 100, T: 2000 } }); } catch (e) { msg = e.message; }
  check('out of range error text', msg.includes('הערך מחוץ לטווח הטבלה'), msg);
}
// isentropic turbine example: p + s
{
  const r = run('water 10kPa s=6.5', { substance: 'water', given: { p: 10, s: 6.5 } });
  if (r) check('10kPa s=6.5 mixture x', r.state.phase.key === 'mixture' && near(r.state.x, (6.5 - 0.6493) / 7.5009, 1e-4), r.state.x);
}

// ---------------------------------------------------------------- round trip over every printed row
const RT = { rel: 3e-4, abs: 2e-4 };
for (const id of TABLE_IDS) {
  const t = db.tables[id];
  const sub = t.substance;
  if (t.region === 'saturated') {
    const c = Object.fromEntries(t.columns.map((n, i) => [n, i]));
    const pf = id === 'A1.1' ? 1 : P_TO_KPA[t.units.p];
    const f = c.uf !== undefined ? 'f' : 'i';
    t.rows.forEach((r) => {
      const by = t.indexedBy;
      const val = by === 'p' ? r[c.p] * pf : r[c.T];
      if (id === 'A1.5' && r[c.T] === 0.01) return; // triple point: T=0.01 resolves to the liquid table A1.1
      for (const [x, s] of [[0, f], [1, 'g']]) {
        const name = `${id} ${by}=${r[c[by]]} x=${x}`;
        const res = run(name, { substance: sub, given: { [by]: val, x } });
        if (!res) continue;
        const other = by === 'p' ? 'T' : 'p';
        const want = by === 'p' ? r[c.T] : r[c.p] * pf;
        if (!near(res.state[other], want, RT.rel, RT.abs)) check(name + ' ' + other, false, `${res.state[other]} vs ${want}`); else pass++;
        for (const y of ['v', 'u', 'h', 's']) {
          const wanted = r[c[y + s]];
          if (!near(res.state[y], wanted, RT.rel, RT.abs)) check(`${name} ${y}`, false, `${res.state[y]} vs ${wanted}`); else pass++;
        }
      }
    });
  } else {
    const pf = P_TO_KPA[t.units.p];
    t.blocks.forEach((b) => {
      const satT = b.satRow ? b.rows[0][0] : null;
      b.rows.forEach((r, ri) => {
        if (b.satRow && ri === 0) return; // saturation row: p = p_sat, needs x (covered by the saturation tables)
        const [T, v, u, h, s] = r;
        const p = b.p * pf;
        if (t.region === 'compressed' && satT !== null && T >= satT) return;
        // the booklet prints a few vapor rows slightly below T_sat(p) (e.g. NH3 450 kPa, 0 °C); the engine correctly calls those compressed
        if (t.region === 'superheated') { const ts = trySat(sub, T); if (ts && p > ts.props.p) return; }
        const name = `${id} p=${b.p} T=${T}`;
        const res = run(name + ' (T+p)', { substance: sub, given: { T, p } });
        if (res) {
          const okPhase = t.region === 'compressed' ? res.state.phase.key === 'compressed' : ['superheated', 'supercritical'].includes(res.state.phase.key);
          check(name + ' phase', okPhase, res.state.phase.key);
          for (const [k, want] of Object.entries({ v, u, h, s })) {
            if (!near(res.state[k], want, RT.rel, RT.abs)) check(`${name} ${k}`, false, `${res.state[k]} vs ${want}`); else pass++;
          }
        }
        if (t.region === 'superheated') {
          for (const [k, val] of [['h', h], ['s', s], ['v', v]]) {
            const r2 = run(`${name} (p+${k})`, { substance: sub, given: { p, [k]: val } });
            if (r2 && !near(r2.state.T, T, 0, 0.02)) check(`${name} p+${k} → T`, false, `${r2.state.T} vs ${T}`); else if (r2) pass++;
          }
        }
      });
    });
  }
}

// ---------------------------------------------------------------- booklet coverage
for (const id of TABLE_IDS) {
  const t = db.tables[id];
  check(`coverage ${id}`, covered.has(id));
  if (t.blocks) for (const b of t.blocks) check(`coverage ${id} p=${b.p}`, covered.has(`${id}|p = ${b.p} ${t.units.p}`));
}

const MAX = 40;
failures.slice(0, MAX).forEach((f) => console.log(f));
if (failures.length > MAX) console.log(`… and ${failures.length - MAX} more`);
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
