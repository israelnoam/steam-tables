// UI: tabs, inputs, rendering. All physics lives in js/engine/.
import { loadAll, SUBSTANCES } from './engine/data.js';
import { solve, PAIRS } from './engine/solve.js';
import { toInternal, UNITS, DEFAULT_UNIT } from './engine/units.js';
import { esc, fmtProp, unitLabel, tex, texSym, texUnit } from './format.js';
import { tvSketch } from './sketch.js';
import { renderReference } from './reference.js';
import { renderTips } from './tips.js';
import { startTour, maybeAutoTour } from './tour.js';

const $ = (s, el = document) => el.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: ignore */ } },
};

const PAIR_HINT = ['כל מצב', 'תערובת', 'תערובת', 'מיכל קשיח', 'בוכנה', 'מחנק', 'טורבינה', 'התפשטות חופשית'];
const FIELD = {
  T: { label: 'טמפרטורה', units: ['C', 'K'] },
  p: { label: 'לחץ', units: ['kPa', 'MPa', 'bar'] },
  v: { label: 'נפח סגולי', units: ['m3/kg', 'L/kg'] },
  u: { label: 'אנרגיה פנימית', units: ['kJ/kg'] },
  h: { label: 'אנתלפיה', units: ['kJ/kg'] },
  s: { label: 'אנטרופיה', units: ['kJ/kgK'] },
  x: { label: 'איכות (0–1)', units: ['-'] },
};
const BOOKLET_P_UNIT = { water: 'kPa', NH3: 'kPa', R12: 'MPa', R134a: 'bar' };

const ui = {
  substance: store.get('substance', 'water'),
  pair: store.get('pair', 0),
  units: store.get('units', {}),
  values: store.get('values', {}),
  last: null,
  vmNote: null,
};
let db;

// ------------------------------------------------------------------ tabs
function showTab(name, { focusStep } = {}) {
  document.querySelectorAll('.tabbar [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  if (focusStep !== undefined) {
    const el = document.getElementById(`step-${focusStep}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
  } else window.scrollTo({ top: 0 });
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}
document.querySelectorAll('.tabbar [role=tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ------------------------------------------------------------------ theme
function effectiveDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
$('#theme-btn').addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
});

// ------------------------------------------------------------------ pickers
function renderSubstances() {
  $('#substance-picker').innerHTML = Object.entries(SUBSTANCES).map(([k, s]) =>
    `<button type="button" role="radio" data-sub="${k}" aria-checked="${k === ui.substance}">${esc(s.he)}<small><bdi>${esc(s.formula)}</bdi></small></button>`).join('');
}
function renderPairs() {
  $('#pair-picker').innerHTML = PAIRS.map((p, i) =>
    `<button type="button" role="radio" data-pair="${i}" aria-checked="${i === ui.pair}">${tex(`${p[0]} + ${p[1]}`)}<small>${PAIR_HINT[i]}</small></button>`).join('');
}
function unitFor(name) {
  if (ui.units[name] && FIELD[name].units.includes(ui.units[name])) return ui.units[name];
  return name === 'p' ? BOOKLET_P_UNIT[ui.substance] : DEFAULT_UNIT[name];
}
function renderInputs() {
  const pair = PAIRS[ui.pair];
  $('#inputs').innerHTML = pair.map((n) => {
    const f = FIELD[n];
    const unitCtl = f.units.length > 1
      ? `<select data-unit="${n}" aria-label="יחידות ${n}">${f.units.map((u) => `<option value="${u}" ${u === unitFor(n) ? 'selected' : ''}>${esc(unitLabel(n, u))}</option>`).join('')}</select>`
      : `<span class="unit-fixed">${esc(unitLabel(n, f.units[0])) || '—'}</span>`;
    return `<label class="field"><span class="field-label"><span class="sym">${tex(n)}</span> ${f.label}</span>
      <span class="field-row"><input type="text" inputmode="decimal" enterkeyhint="go" dir="ltr" data-field="${n}" value="${esc(ui.values[n] ?? '')}" aria-label="${n}">${unitCtl}</span></label>`;
  }).join('');
  $('#vm-helper').hidden = !pair.includes('v');
}

$('#substance-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sub]'); if (!b) return;
  ui.substance = b.dataset.sub; store.set('substance', ui.substance);
  delete ui.units.p; store.set('units', ui.units);
  renderSubstances(); renderInputs();
});
$('#pair-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pair]'); if (!b) return;
  readValues();
  ui.pair = Number(b.dataset.pair); store.set('pair', ui.pair);
  renderPairs(); renderInputs();
  $('#inputs input')?.focus();
});
$('#inputs').addEventListener('change', (e) => {
  if (e.target.matches('select[data-unit]')) { ui.units[e.target.dataset.unit] = e.target.value; store.set('units', ui.units); }
});

function readValues() {
  document.querySelectorAll('#inputs input[data-field]').forEach((i) => { ui.values[i.dataset.field] = i.value.trim(); });
  store.set('values', ui.values);
}
const parseNum = (s) => {
  if (typeof s !== 'string') return NaN;
  const t = s.replace(/\s/g, '').replace(',', '.').replace(/[−–]/g, '-');
  return t === '' ? NaN : Number(t);
};

// V and m helper
$('#vm-apply').addEventListener('click', () => {
  const V = parseNum($('#vm-V').value), m = parseNum($('#vm-m').value);
  if (!(V > 0 && m > 0)) { $('#vm-out').textContent = 'הזינו V ו-m חיוביים.'; return; }
  const v = V / m;
  const inp = $('#inputs input[data-field="v"]');
  const sel = $('#inputs select[data-unit="v"]');
  if (sel) { sel.value = 'm3/kg'; ui.units.v = 'm3/kg'; store.set('units', ui.units); }
  inp.value = String(+v.toPrecision(6));
  ui.vmNote = { V, m, v };
  $('#vm-out').innerHTML = tex(`v = \\dfrac{V}{m} = \\dfrac{${+V.toPrecision(6)}}{${+m.toPrecision(6)}} = ${+v.toPrecision(6)}${texUnit('m³/kg')}`);
});

// ------------------------------------------------------------------ solve
function showError(msg) {
  const el = $('#calc-error');
  el.textContent = msg; el.hidden = !msg;
}

function compute({ fromHistory } = {}) {
  readValues();
  showError('');
  const pair = PAIRS[ui.pair];
  const given = {}, shown = {};
  for (const n of pair) {
    const raw = ui.values[n];
    const val = parseNum(raw);
    if (!Number.isFinite(val)) { showError(`הזינו מספר עבור ${n}.`); $(`#inputs input[data-field="${n}"]`)?.focus(); return; }
    const unit = unitFor(n);
    given[n] = toInternal(n, val, unit);
    shown[n] = { raw: val, unit };
  }
  if ('v' in given && !(given.v > 0)) { showError('v חייב להיות חיובי.'); return; }
  const input = { substance: ui.substance, given };
  let res;
  try { res = solve(db, input); } catch (e) {
    showError(e.message || String(e));
    $('#result').hidden = true;
    return;
  }
  const vm = ui.vmNote && 'v' in given && Math.abs(ui.vmNote.v - given.v) < 1e-12 ? ui.vmNote : null;
  ui.last = { input, res, shown, vm, substance: ui.substance };
  renderResult();
  renderReference($('#ref-content'), db, ui.last, (i) => showTab('calc'));
  if (!fromHistory) pushHistory();
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#calc-form').addEventListener('submit', (e) => { e.preventDefault(); compute(); });

const PROP_ROWS = ['T', 'p', 'v', 'u', 'h', 's', 'x'];
function displayUnit(n) {
  const sh = ui.last?.shown?.[n];
  if (sh) return sh.unit;
  if (n === 'p') return BOOKLET_P_UNIT[ui.last.substance];
  return DEFAULT_UNIT[n];
}

function renderResult() {
  const { res, substance } = ui.last;
  const st = res.state;
  const S = SUBSTANCES[substance];
  $('#result').hidden = false;
  const tables = [...new Set(res.traces.filter((t) => t.tableName).map((t) => t.tableName))];
  $('#result-phase').innerHTML = `<strong>${esc(st.phase.he)}</strong><span class="en">${esc(st.phase.en)}</span>
    <span class="where">${esc(S.he)} <bdi>${esc(S.formula)}</bdi> · טבלאות: ${tables.map((t) => `<bdi>${esc(t)}</bdi>`).join(', ')}</span>`;
  $('#result-table').innerHTML = `<tbody>${PROP_ROWS.map((n) => {
    const u = displayUnit(n);
    const val = n === 'x' && (st.x === null || st.x === undefined) ? '—' : fmtProp(n, st[n], u);
    const given = st.given.includes(n);
    const src = res.src[n];
    const link = given ? '<span class="badge">נתון</span>' : src !== undefined ? `<a href="#ref" data-step="${src}">מאיפה?</a>` : '';
    return `<tr class="${given ? 'given' : ''}"><th scope="row">${tex(n)}</th><td class="val">${val}</td><td class="unit">${esc(unitLabel(n, u))}</td><td class="src">${link}</td></tr>`;
  }).join('')}</tbody>`;
  $('#result-warnings').innerHTML = res.warnings.map((w) => `<div class="note">${w.kind === 'corrected'
    ? `בחוברת התא ${tex(texSym(w.col))} בטבלה <bdi>${esc(w.table)}</bdi> מודפס כ-<bdi dir="ltr">${esc(w.printed)}</bdi>; האפליקציה משתמשת ב-<bdi dir="ltr">${esc(w.value)}</bdi>.`
    : esc(w.text)}</div>`).join('');
  $('#sketch').innerHTML = `${tvSketch(db, substance, st)}<figcaption>דיאגרמת <bdi>T–v</bdi>: הפעמון מהטבלה ונקודת המצב</figcaption>`;
}

$('#result-table').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-step]'); if (!a) return;
  e.preventDefault();
  showTab('ref', { focusStep: Number(a.dataset.step) });
});
$('#goto-ref-btn').addEventListener('click', () => showTab('ref'));

$('#copy-btn').addEventListener('click', async () => {
  const { res, substance, shown } = ui.last;
  const st = res.state;
  const giv = st.given.map((n) => `${n} = ${shown[n].raw} ${unitLabel(n, shown[n].unit)}`.trim()).join(', ');
  const lines = [`${SUBSTANCES[substance].name}: ${giv} → ${st.phase.en}`];
  for (const n of PROP_ROWS) {
    if (n === 'x' && (st.x === null || st.x === undefined)) continue;
    const u = displayUnit(n);
    lines.push(`${n} = ${fmtProp(n, st[n], u)} ${unitLabel(n, u)}`.trim());
  }
  const text = lines.join('\n');
  const btn = $('#copy-btn');
  try { await navigator.clipboard.writeText(text); btn.textContent = 'הועתק ✓'; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); btn.textContent = 'הועתק ✓'; } catch { btn.textContent = 'ההעתקה נכשלה'; }
    ta.remove();
  }
  setTimeout(() => { btn.textContent = 'העתק תוצאה'; }, 1600);
});

// ------------------------------------------------------------------ history (last 10)
function pushHistory() {
  const { res, substance, shown } = ui.last;
  const entry = { substance, pair: ui.pair, values: Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, String(v.raw)])), units: Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, v.unit])), phase: res.state.phase.he };
  const list = store.get('history', []).filter((h) => JSON.stringify([h.substance, h.pair, h.values, h.units]) !== JSON.stringify([entry.substance, entry.pair, entry.values, entry.units]));
  list.unshift(entry);
  store.set('history', list.slice(0, 10));
  renderHistory();
}
function renderHistory() {
  const list = store.get('history', []);
  $('#history').hidden = !list.length;
  $('#history-list').innerHTML = list.map((h, i) => {
    const giv = Object.entries(h.values).map(([k, v]) => `${k} = ${v} ${unitLabel(k, h.units[k])}`).join(', ');
    return `<li><button type="button" data-h="${i}">${esc(SUBSTANCES[h.substance]?.he || h.substance)} · <bdi dir="ltr">${esc(giv)}</bdi><br><span class="h-phase">${esc(h.phase)}</span></button></li>`;
  }).join('');
}
$('#history-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]'); if (!b) return;
  const h = store.get('history', [])[Number(b.dataset.h)]; if (!h) return;
  ui.substance = h.substance; ui.pair = h.pair;
  Object.assign(ui.values, h.values); Object.assign(ui.units, h.units);
  renderSubstances(); renderPairs(); renderInputs();
  compute({ fromHistory: true });
});

// ------------------------------------------------------------------ boot
async function boot() {
  renderSubstances(); renderPairs(); renderInputs(); renderHistory();
  renderTips($('#tips-content'));
  renderReference($('#ref-content'), null, null);
  const tab = location.hash.replace('#', '');
  if (['calc', 'ref', 'tips'].includes(tab)) showTab(tab);
  try {
    db = await loadAll();
  } catch (e) {
    showError('טעינת הטבלאות נכשלה. רעננו את הדף.');
    return;
  }
  $('#tour-btn').addEventListener('click', () => startTour(showTab));
  maybeAutoTour(showTab);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
