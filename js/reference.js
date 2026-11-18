// Booklet reference screen: one numbered Hebrew step per trace, with the numbers substituted. UI only.
import { SUBSTANCES } from './engine/data.js';
import { esc, num, sym } from './format.js';

const L = (s) => `<bdi dir="ltr">${s}</bdi>`; // English / math fragment inside Hebrew text
const n6 = (v) => num(v, 6);
const PROP_UNIT = { T: '°C', v: 'm³/kg', u: 'kJ/kg', h: 'kJ/kg', s: 'kJ/(kg·K)' };
const VERDICT = {
  mixture: 'בין הערך של הנוזל הרווי לערך של האד הרווי, ולכן המצב בתוך הפעמון (תערובת רוויה).',
  superheated: 'גדול מהערך של האד הרווי, ולכן המצב מחוץ לפעמון בצד הימני: אד מחומם-על.',
  compressed: 'קטן מהערך של הנוזל הרווי, ולכן המצב מחוץ לפעמון בצד השמאלי: נוזל דחוס.',
};

/** Column name as printed → display with subscript. */
function colLabel(c) {
  const m = /^(\w+?)(?: \[(\w+)\])?$/.exec(c);
  if (c.includes('×')) return `${sym(c.split('×')[0])}×10³`;
  if (m && m[2]) return `${esc(m[1])} [${esc(m[2])}]`;
  return sym(c);
}

function interpRow(rows, f) {
  if (rows.length === 1) return { ...rows[0] };
  const o = {};
  for (const k of Object.keys(rows[0])) o[k] = rows[0][k] + f * (rows[1][k] - rows[0][k]);
  return o;
}

function linFormula(name, x, x1, x2, y1, y2, y) {
  return `${name} = ${n6(y1)} + (${n6(x)} − ${n6(x1)}) / (${n6(x2)} − ${n6(x1)}) × (${n6(y2)} − ${n6(y1)}) = ${n6(y)}`;
}

function bookletTable(caption, rows, hitKey) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return `<div class="booklet"><table><caption>${esc(caption)}</caption>
    <thead><tr>${cols.map((c) => `<th>${colLabel(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c === hitKey ? 'hit' : ''}">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function chips(st) {
  const c = [`טבלה ${L(esc(st.tableName))}`, `עמוד ${L(esc(st.bookletPage))} בחוברת`, `עמוד ${st.pdfPage} ב-PDF`];
  if (st.block) c.push(L(esc(st.block)));
  return `<div class="where-chip">${c.map((x) => `<span class="chip">${x}</span>`).join('')}</div>`;
}

function printedButton(id, html) {
  return `<button type="button" class="btn secondary printed-toggle" data-toggle="${id}">הצג את השורות המודפסות</button><div id="${id}" hidden>${html}</div>`;
}

function warnNotes(st) {
  return (st.warnings || []).map((w) => (w.kind === 'corrected'
    ? `<div class="note">בחוברת התא ${L(sym(w.col))} מודפס כ-${L(esc(w.printed))}; האפליקציה משתמשת ב-${L(esc(w.value))}. ${w.how ? `(${esc(w.how)})` : ''}</div>`
    : `<div class="note">${esc(w.text)}</div>`)).join('');
}

// ------------------------------------------------------------------ step renderers

function satStep(st, i) {
  const xName = st.x.name;
  const xUnit = st.x.unit;
  const key = Object.keys(st.rows[0]).find((k) => k === xName || k.startsWith(xName + ' ')) || xName;
  const res = interpRow(st.rows, st.f);
  const outCols = Object.keys(res).filter((k) => k !== key);
  let p = '';
  if (st.method === 'exact') {
    p = `<p>פתחו את טבלה ${L(esc(st.tableName))}, עמוד ${L(esc(st.bookletPage))}, בשורה ${L(`${xName} = ${n6(st.x.value)} ${esc(xUnit)}`)}. הערך מודפס בדיוק בטבלה, אין צורך באינטרפולציה.</p>`;
  } else {
    const a = st.rows[0][key], b = st.rows[1][key];
    const inv = st.method === 'inverse';
    p = `<p>${inv ? 'בטבלה הזו אין עמודה מסודרת לפי הערך הנתון, לכן מחפשים אותו בעמודה ' + L(colLabel(key)) + ' (חיפוש הפוך). ' : ''}פתחו את טבלה ${L(esc(st.tableName))}, עמוד ${L(esc(st.bookletPage))}. הערך ${L(`${xName} = ${n6(st.x.value)} ${esc(xUnit)}`)} נמצא בין השורות ${L(`${colLabel(key)} = ${n6(a)}`)} ו-${L(`${n6(b)}`)}, ולכן מבצעים אינטרפולציה לינארית.</p>`;
    if (st.noPTable) p += `<div class="note">לחומר הזה אין בחוברת טבלת רוויה לפי לחץ, ולכן מחפשים את ${L('p')} בעמודת הלחץ של טבלת הטמפרטורה ומבצעים אינטרפולציה הפוכה.</div>`;
    p += `<div class="formula">f = (${n6(st.x.value)} − ${n6(a)}) / (${n6(b)} − ${n6(a)}) = ${num(st.f, 5)}</div>`;
    const main = outCols[0];
    p += `<div class="formula">${linFormula(main, st.x.value, a, b, st.rows[0][main], st.rows[1][main], res[main])}</div>`;
    p += `<p>באותו יחס ${L(`f = ${num(st.f, 5)}`)} מחשבים את שאר העמודות:</p>`;
  }
  p += `<div class="formula">${outCols.map((c) => `${colLabel(c).replace(/<\/?sub>/g, '')} = ${n6(res[c])}`).join('\n')}</div>`;
  if (st.computedCols?.length) p += `<p class="muted">העמודות ${st.computedCols.map((c) => L(sym(c))).join(', ')} לא מודפסות בטבלה הזו; הן מחושבות כהפרש (${L('y_g − y_f')}).</p>`;
  if (st.alsoIn) p += `<p>הערך מודפס גם בטבלה ${L(esc(st.alsoIn.table))}, עמוד ${L(esc(st.alsoIn.bookletPage))}, בשורה ${L(esc(st.alsoIn.row))}.</p>`;
  return p + printedButton(`printed-${i}`, bookletTable(`${st.tableName} — page ${st.bookletPage}`, st.rows, key));
}

function blockOne(part, st, xName, xUnit) {
  const key = xName;
  const res = interpRow(part.rows, part.f);
  const others = Object.keys(res).filter((k) => k !== key);
  if (part.method === 'exact') {
    return { html: `<p>בבלוק ${L(esc(part.block))} (עמוד ${L(esc(part.bookletPage))}) יש שורה בדיוק ב-${L(`${xName} = ${n6(res[key])} ${esc(xUnit)}`)}.</p>`, res };
  }
  const a = part.rows[0][key], b = part.rows[1][key];
  let html = `<p>בבלוק ${L(esc(part.block))} (עמוד ${L(esc(part.bookletPage))}): ${L(`${xName} = ${n6(res[key])}`)} נמצא בין השורות ${L(`${xName} = ${n6(a)}`)} ו-${L(n6(b))}${part.method === 'inverse' ? ' (חיפוש הפוך בעמודה ' + L(xName) + ')' : ''}.</p>`;
  const main = others.includes('T') && key !== 'T' ? 'T' : others[0];
  html += `<div class="formula">${linFormula(main, res[key], a, b, part.rows[0][main], part.rows[1][main], res[main])}</div>`;
  html += `<div class="formula">${others.map((c) => `${c} = ${n6(res[c])}`).join('   ')}</div>`;
  return { html, res };
}

function blockStep(st, i) {
  const xName = st.x.name, xUnit = st.x.unit;
  let html = '';
  if (st.method !== 'double') {
    const part = { block: st.block, bookletPage: st.bookletPage, rows: st.rows, f: st.f, method: st.method };
    html += `<p>פתחו את טבלה ${L(esc(st.tableName))}, עמוד ${L(esc(st.bookletPage))}, בבלוק ${L(esc(st.block))}.</p>`;
    html += blockOne(part, st, xName, xUnit).html;
  } else {
    html += `<p>הלחץ ${L(`p = ${n6(st.p.value)} ${esc(st.p.unit)}`)} לא מודפס בטבלה ${L(esc(st.tableName))}, ולכן עושים <b>אינטרפולציה כפולה</b>: קודם בכל אחד משני הבלוקים השכנים ${L(`p = ${st.p.p1}`)} ו-${L(`p = ${st.p.p2} ${esc(st.p.unit)}`)}, ואחר כך בין התוצאות לפי ${L('p')}.</p>`;
    const r = st.parts.map((part) => blockOne(part, st, xName, xUnit));
    html += r.map((x) => x.html).join('');
    html += `<div class="formula">f_p = (${n6(st.p.value)} − ${n6(st.p.p1)}) / (${n6(st.p.p2)} − ${n6(st.p.p1)}) = ${num(st.p.f, 5)}</div>`;
    const cols = Object.keys(r[0].res).filter((c) => c !== xName);
    html += `<div class="formula">${cols.map((c) => `${c} = ${n6(r[0].res[c])} + ${num(st.p.f, 5)} × (${n6(r[1].res[c])} − ${n6(r[0].res[c])}) = ${n6(r[0].res[c] + st.p.f * (r[1].res[c] - r[0].res[c]))}`).join('\n')}</div>`;
  }
  if (st.inverseP) {
    const q = st.inverseP;
    html += `<p>את ${L('p')} עצמו מצאנו כך: בכל בלוק לחץ חישבנו את ${L(q.col)} ב-${L('T')} הנתונה, וחיפשנו את שני הבלוקים שביניהם נמצא ${L(`${q.col} = ${n6(q.target)}`)}:</p>
      <div class="formula">${q.col}(p = ${q.a.p}) = ${n6(q.a.y)},  ${q.col}(p = ${q.b.p}) = ${n6(q.b.y)}\np = ${q.a.p} + (${n6(q.target)} − ${n6(q.a.y)}) / (${n6(q.b.y)} − ${n6(q.a.y)}) × (${q.b.p} − ${q.a.p}) = ${n6(q.a.p + q.f * (q.b.p - q.a.p))} ${esc(q.unit)}</div>`;
  }
  const printed = st.method === 'double'
    ? st.parts.map((part) => bookletTable(`${st.tableName} — ${part.block} — page ${part.bookletPage}`, part.rows, xName)).join('')
    : bookletTable(`${st.tableName} — ${st.block} — page ${st.bookletPage}`, st.rows, xName);
  return html + printedButton(`printed-${i}`, printed);
}

function compareStep(st) {
  const nm = st.name;
  if (nm === 'p') {
    const verdict = st.verdict === 'superheated'
      ? `${L(`p < p_sat`)}: בטמפרטורה הזו הלחץ נמוך מלחץ הרוויה, ולכן המצב הוא <b>אד מחומם-על</b>.`
      : `${L(`p > p_sat`)}: הלחץ גבוה מלחץ הרוויה בטמפרטורה הזו, ולכן המצב הוא <b>נוזל דחוס</b>.`;
    return `<p>משווים את הלחץ הנתון ללחץ הרוויה בטמפרטורה הזו: ${L(`p = ${n6(st.value)} kPa`)}, ${L(`p_sat = ${n6(st.f)} kPa`)}.</p><p>${verdict}</p>`;
  }
  const f = st.solid ? 'i' : 'f';
  return `<p>משווים את ${L(nm)} הנתון לערכים ברוויה: ${L(`${nm}_${f} = ${n6(st.f)}`)}, ${L(`${nm}_g = ${n6(st.g)}`)}, ${L(`${nm} = ${n6(st.value)}`)}.</p>
    <p>${L(`${nm} = ${n6(st.value)}`)} ${VERDICT[st.verdict]}</p>`;
}

function qualityStep(st) {
  const f = st.solid ? 'i' : 'f';
  let html = '';
  if (st.given) {
    const g = st.lines.find((l) => l.name === st.given.name);
    html += `<p>מחשבים את האיכות מהתכונה הנתונה:</p><div class="formula">x = (${st.given.name} − ${st.given.name}_${f}) / (${st.given.name}_g − ${st.given.name}_${f}) = (${n6(st.given.value)} − ${n6(g.f)}) / (${n6(g.g)} − ${n6(g.f)}) = ${num(st.x, 5)}</div>`;
  } else {
    html += `<p>האיכות נתונה: ${L(`x = ${num(st.x, 5)}`)}.${st.x === 0 ? ' זה נוזל רווי.' : st.x === 1 ? ' זה אד רווי.' : ''}</p>`;
  }
  html += `<p>כל תכונה אחרת: ${L(`y = y_${f} + x (y_g − y_${f})`)}</p>`;
  html += `<div class="formula">${st.lines.filter((l) => !st.given || l.name !== st.given.name).map((l) => `${l.name} = ${n6(l.f)} + ${num(st.x, 5)} × (${n6(l.g)} − ${n6(l.f)}) = ${n6(l.value)}`).join('\n')}</div>`;
  return html;
}

function approxStep(st) {
  const r = st.result;
  const giveT = st.by === 'T' ? 'בטמפרטורה הנתונה' : `בשורה שבה ${L(`${st.by}_f = ${st.by}`)} (ומשם ${L(`T = ${n6(st.T)} °C`)})`;
  return `<p>${esc(st.reason)}, ולכן משתמשים ב<b>קירוב נוזל רווי</b>: לוקחים את ערכי הנוזל הרווי ${giveT}.</p>
    <div class="formula">v ≈ v_f(T) = ${n6(r.v)}\nu ≈ u_f(T) = ${n6(r.u)}\ns ≈ s_f(T) = ${n6(r.s)}\nh ≈ h_f(T) + v_f(T)·(p − p_sat(T)) = ${n6(st.hf)} + ${n6(st.vf)} × (${n6(st.p)} − ${n6(st.psat)}) = ${n6(st.hf + st.vf * (st.p - st.psat))}</div>`;
}

function searchStep(st) {
  if (st.where === 'sat') {
    return `<p>נתונים ${L('v')} ו-${L('u')}. עוברים על השורות של טבלה ${L(esc(st.tableName))} (עמוד ${L(esc(st.bookletPage))}): בכל שורה מחשבים ${L('x = (v − v_f)/(v_g − v_f)')} ואז ${L('u = u_f + x·u_fg')}, ומחפשים את השורות שבהן ${L('u')} המחושב עובר את הערך הנתון.</p>
      <div class="formula">T = ${n6(st.a.T)}: x = ${num(st.a.x, 4)}, u = ${n6(st.a.u)}\nT = ${n6(st.b.T)}: x = ${num(st.b.x, 4)}, u = ${n6(st.b.u)}\n${linFormula('T', st.u, st.a.u, st.b.u, st.a.T, st.b.T, st.T)}</div>`;
  }
  return `<p>${L('v')} גדול מ-${L('v_g')} בכל הטבלה, לכן מחפשים בטבלת האד המחומם-על ${L(esc(st.tableName))}: בכל בלוק לחץ מוצאים את השורה עם ${L(`v = ${n6(st.v)}`)} וקוראים את ${L('u')}.</p>
    <div class="formula">p = ${st.a.p}: u = ${n6(st.a.u)}\np = ${st.b.p}: u = ${n6(st.b.u)}\n${linFormula('p', st.u, st.a.u, st.b.u, st.a.p, st.b.p, st.p)} ${esc(st.unit)}</div>`;
}

function noteStep(st) {
  if (st.text === 'supercriticalT') return `<p>${L(`T = ${n6(st.T)} °C`)} גבוהה מהטמפרטורה הקריטית (${L(`${st.Tc} °C`)}). אין שם פעמון, ולכן קוראים ישר מטבלת האד המחומם-על.</p>`;
  if (st.text === 'supercriticalP') return `<p>${L(`p = ${n6(st.p)} kPa`)} גבוה מהלחץ הקריטי (${L(`${st.pc} kPa`)}). קוראים מטבלת האד המחומם-על (ואם הערך מתחת לטבלה — מטבלת הנוזל הדחוס).</p>`;
  if (st.text === 'aboveSatTable') return `<p>${L(`T = ${n6(st.T)} °C`)} מעל טבלת הרוויה (עד ${L(`${st.Tmax} °C`)}), ושם ${L('p_sat')} גבוה מ-${L(`${n6(st.pmax)} kPa`)}. הלחץ הנתון נמוך מזה, ולכן המצב בוודאות אד מחומם-על.</p>`;
  return '';
}

// ------------------------------------------------------------------ screen

export function renderReference(el, db, last) {
  if (!last) {
    el.innerHTML = `<div class="card empty">עוד אין חישוב. חשבו מצב במסך <b>מחשבון</b>, וכאן יופיע מתכון צעד-אחר-צעד: באיזו טבלה, באיזה עמוד ובאילו שורות למצוא כל ערך בחוברת.</div>`;
    return;
  }
  const { res, substance, shown, vm } = last;
  const S = SUBSTANCES[substance];
  const giv = res.state.given.map((n) => L(`${n} = ${esc(shown[n].raw)} ${esc(shown[n].unit === '-' ? '' : shown[n].unit.replace('m3', 'm³').replace('C', '°C').replace('kJ/kgK', 'kJ/(kg·K)'))}`)).join(', ');
  let html = `<div class="card ref-head"><h2>איפה בחוברת</h2><p>${esc(S.he)} ${L(esc(S.formula))}, נתון: ${giv}. תוצאה: <b>${esc(res.state.phase.he)}</b>.</p>
    <p>החוברת: <i>Thermodynamics – Tables and Diagrams</i>. ${L('T')} ב-°C. הלחץ ביחידות של כל טבלה (${L('kPa / MPa / bar')}).</p></div><ol class="steps">`;
  let n = 0;
  if (vm) {
    html += `<li class="card step" id="step-vm"><p>מחשבים נפח סגולי מהנפח והמסה (תמיד עובדים עם תכונות ליחידת מסה):</p><div class="formula">v = V / m = ${n6(vm.V)} / ${n6(vm.m)} = ${n6(vm.v)} m³/kg</div></li>`;
  }
  res.traces.forEach((st, i) => {
    let body = '';
    if (st.kind === 'table') body = chips(st) + (st.block ? blockStep(st, i) : satStep(st, i));
    else if (st.kind === 'compare') body = compareStep(st);
    else if (st.kind === 'quality') body = qualityStep(st);
    else if (st.kind === 'approx') body = approxStep(st);
    else if (st.kind === 'search') body = searchStep(st);
    else if (st.kind === 'note') body = noteStep(st);
    body += warnNotes(st);
    html += `<li class="card step" id="step-${i}">${body}</li>`;
    n++;
  });
  html += '</ol>';
  el.innerHTML = html;
}

// toggle printed rows
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle]');
  if (!b) return;
  const box = document.getElementById(b.dataset.toggle);
  if (!box) return;
  box.hidden = !box.hidden;
  b.textContent = box.hidden ? 'הצג את השורות המודפסות' : 'הסתר את השורות המודפסות';
});
