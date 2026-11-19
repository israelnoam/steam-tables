// Booklet reference screen: one numbered Hebrew step per trace, with the numbers substituted. UI only.
import { SUBSTANCES } from './engine/data.js';
import { esc, num, sym, tex, texBlock, texSym as Y, texUnit as U } from './format.js';

const L = (s) => `<bdi dir="ltr">${s}</bdi>`; // plain English fragment (table names, pages, blocks) inside Hebrew text
const M = (s) => tex(s); // inline LaTeX
const n6 = (v) => num(v, 6);
/** Number for LaTeX after a minus sign: negatives in parentheses so "a - (-b)" reads right. */
const P = (v) => (v < 0 ? `(${n6(v)})` : n6(v));
const DEG = U('°C');
const VERDICT = {
  mixture: 'בין הערך של הנוזל הרווי לערך של האד הרווי, ולכן המצב בתוך הפעמון (תערובת רוויה).',
  superheated: 'גדול מהערך של האד הרווי, ולכן המצב מחוץ לפעמון בצד הימני: אד מחומם-על.',
  compressed: 'קטן מהערך של הנוזל הרווי, ולכן המצב מחוץ לפעמון בצד השמאלי: נוזל דחוס.',
};

/** Column name as printed → HTML with subscript (for the printed-rows table). */
function colLabel(c) {
  const m = /^(\w+?)(?: \[(\w+)\])?$/.exec(c);
  if (c.includes('×')) return `${sym(c.split('×')[0])}×10³`;
  if (m && m[2]) return `${esc(m[1])} [${esc(m[2])}]`;
  return sym(c);
}

/** Column name as printed → LaTeX. */
function texCol(c) {
  if (c.includes('×')) return `${Y(c.split('×')[0])} \\times 10^3`;
  const m = /^(\w+?) \[(.+)\]$/.exec(c);
  if (m) return `${Y(m[1])}\\ [\\mathrm{${m[2]}}]`;
  return Y(c);
}

function interpRow(rows, f) {
  if (rows.length === 1) return { ...rows[0] };
  const o = {};
  for (const k of Object.keys(rows[0])) o[k] = rows[0][k] + f * (rows[1][k] - rows[0][k]);
  return o;
}

/** Linear interpolation with the numbers substituted; the result goes on a second aligned line so it fits a phone. */
function linFormula(name, x, x1, x2, y1, y2, y, unit = '') {
  return `\\begin{aligned} ${name} &= ${n6(y1)} + \\dfrac{${n6(x)} - ${P(x1)}}{${n6(x2)} - ${P(x1)}} \\\\ &\\qquad \\times (${n6(y2)} - ${P(y1)}) \\\\ &= ${n6(y)}${unit} \\end{aligned}`;
}

/** Split a list into groups of n (several short results per formula line). */
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
/** Lines like "v = 0.1, u = 2500" (two per line, fits a phone). */
const valueLines = (pairs) => chunk(pairs, 2).map((g) => g.join(',\\quad '));

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
    ? `<div class="note">בחוברת התא ${M(Y(w.col))} מודפס כ-${L(esc(w.printed))}; האפליקציה משתמשת ב-${L(esc(w.value))}. ${w.how ? `(${esc(w.how)})` : ''}</div>`
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
    p = `<p>פתחו את טבלה ${L(esc(st.tableName))}, עמוד ${L(esc(st.bookletPage))}, בשורה ${M(`${Y(xName)} = ${n6(st.x.value)}${U(xUnit)}`)}. הערך מודפס בדיוק בטבלה, אין צורך באינטרפולציה.</p>`;
  } else {
    const a = st.rows[0][key], b = st.rows[1][key];
    const inv = st.method === 'inverse';
    p = `<p>${inv ? 'בטבלה הזו אין עמודה מסודרת לפי הערך הנתון, לכן מחפשים אותו בעמודה ' + M(texCol(key)) + ' (חיפוש הפוך). ' : ''}פתחו את טבלה ${L(esc(st.tableName))}, עמוד ${L(esc(st.bookletPage))}. הערך ${M(`${Y(xName)} = ${n6(st.x.value)}${U(xUnit)}`)} נמצא בין השורות ${M(`${texCol(key)} = ${n6(a)}`)} ו-${M(n6(b))}, ולכן מבצעים אינטרפולציה לינארית.</p>`;
    if (st.noPTable) p += `<div class="note">לחומר הזה אין בחוברת טבלת רוויה לפי לחץ, ולכן מחפשים את ${M('p')} בעמודת הלחץ של טבלת הטמפרטורה ומבצעים אינטרפולציה הפוכה.</div>`;
    const main = outCols[0];
    p += texBlock(
      `f = \\dfrac{${n6(st.x.value)} - ${P(a)}}{${n6(b)} - ${P(a)}} = ${num(st.f, 5)}`,
      linFormula(texCol(main), st.x.value, a, b, st.rows[0][main], st.rows[1][main], res[main]),
    );
    p += `<p>באותו יחס ${M(`f = ${num(st.f, 5)}`)} מחשבים את שאר העמודות:</p>`;
  }
  p += texBlock(valueLines(outCols.map((c) => `${texCol(c)} = ${n6(res[c])}`)));
  if (st.computedCols?.length) p += `<p class="muted">העמודות ${st.computedCols.map((c) => M(Y(c))).join(', ')} לא מודפסות בטבלה הזו; הן מחושבות כהפרש (${M('y_{fg} = y_g - y_f')}).</p>`;
  if (st.alsoIn) p += `<p>הערך מודפס גם בטבלה ${L(esc(st.alsoIn.table))}, עמוד ${L(esc(st.alsoIn.bookletPage))}, בשורה ${L(esc(st.alsoIn.row))}.</p>`;
  return p + printedButton(`printed-${i}`, bookletTable(`${st.tableName} — page ${st.bookletPage}`, st.rows, key));
}

function blockOne(part, st, xName, xUnit) {
  const key = xName;
  const res = interpRow(part.rows, part.f);
  const others = Object.keys(res).filter((k) => k !== key);
  if (part.method === 'exact') {
    return { html: `<p>בבלוק ${L(esc(part.block))} (עמוד ${L(esc(part.bookletPage))}) יש שורה בדיוק ב-${M(`${Y(xName)} = ${n6(res[key])}${U(xUnit)}`)}.</p>`, res };
  }
  const a = part.rows[0][key], b = part.rows[1][key];
  let html = `<p>בבלוק ${L(esc(part.block))} (עמוד ${L(esc(part.bookletPage))}): ${M(`${Y(xName)} = ${n6(res[key])}`)} נמצא בין השורות ${M(`${Y(xName)} = ${n6(a)}`)} ו-${M(n6(b))}${part.method === 'inverse' ? ' (חיפוש הפוך בעמודה ' + M(Y(xName)) + ')' : ''}.</p>`;
  const main = others.includes('T') && key !== 'T' ? 'T' : others[0];
  html += texBlock(
    linFormula(Y(main), res[key], a, b, part.rows[0][main], part.rows[1][main], res[main]),
    valueLines(others.map((c) => `${Y(c)} = ${n6(res[c])}`)),
  );
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
    html += `<p>הלחץ ${M(`p = ${n6(st.p.value)}${U(st.p.unit)}`)} לא מודפס בטבלה ${L(esc(st.tableName))}, ולכן עושים <b>אינטרפולציה כפולה</b>: קודם בכל אחד משני הבלוקים השכנים ${M(`p = ${st.p.p1}`)} ו-${M(`p = ${st.p.p2}${U(st.p.unit)}`)}, ואחר כך בין התוצאות לפי ${M('p')}.</p>`;
    const r = st.parts.map((part) => blockOne(part, st, xName, xUnit));
    html += r.map((x) => x.html).join('');
    const cols = Object.keys(r[0].res).filter((c) => c !== xName);
    html += texBlock(
      `f_p = \\dfrac{${n6(st.p.value)} - ${P(st.p.p1)}}{${n6(st.p.p2)} - ${P(st.p.p1)}} = ${num(st.p.f, 5)}`,
      `\\begin{aligned} ${cols.map((c) => `${Y(c)} &= ${n6(r[0].res[c])} + ${num(st.p.f, 5)} \\times (${n6(r[1].res[c])} - ${P(r[0].res[c])}) \\\\ &= ${n6(r[0].res[c] + st.p.f * (r[1].res[c] - r[0].res[c]))}`).join(' \\\\[4pt] ')} \\end{aligned}`,
    );
  }
  if (st.inverseP) {
    const q = st.inverseP;
    const c = Y(q.col);
    html += `<p>את ${M('p')} עצמו מצאנו כך: בכל בלוק לחץ חישבנו את ${M(c)} ב-${M('T')} הנתונה, וחיפשנו את שני הבלוקים שביניהם נמצא ${M(`${c} = ${n6(q.target)}`)}:</p>`
      + texBlock(
        `${c}(p = ${q.a.p}) = ${n6(q.a.y)},\\quad ${c}(p = ${q.b.p}) = ${n6(q.b.y)}`,
        `\\begin{aligned} p &= ${q.a.p} + \\dfrac{${n6(q.target)} - ${P(q.a.y)}}{${n6(q.b.y)} - ${P(q.a.y)}} \\times (${q.b.p} - ${P(q.a.p)}) \\\\ &= ${n6(q.a.p + q.f * (q.b.p - q.a.p))}${U(q.unit)} \\end{aligned}`,
      );
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
      ? `${M('p < p_{\\text{sat}}')}: בטמפרטורה הזו הלחץ נמוך מלחץ הרוויה, ולכן המצב הוא <b>אד מחומם-על</b>.`
      : `${M('p > p_{\\text{sat}}')}: הלחץ גבוה מלחץ הרוויה בטמפרטורה הזו, ולכן המצב הוא <b>נוזל דחוס</b>.`;
    return `<p>משווים את הלחץ הנתון ללחץ הרוויה בטמפרטורה הזו: ${M(`p = ${n6(st.value)}${U('kPa')}`)}, ${M(`p_{\\text{sat}} = ${n6(st.f)}${U('kPa')}`)}.</p><p>${verdict}</p>`;
  }
  const f = st.solid ? 'i' : 'f';
  return `<p>משווים את ${M(nm)} הנתון לערכים ברוויה: ${M(`${nm}_${f} = ${n6(st.f)}`)}, ${M(`${nm}_g = ${n6(st.g)}`)}, ${M(`${nm} = ${n6(st.value)}`)}.</p>
    <p>${M(`${nm} = ${n6(st.value)}`)} ${VERDICT[st.verdict]}</p>`;
}

function qualityStep(st) {
  const f = st.solid ? 'i' : 'f';
  let html = '';
  if (st.given) {
    const y = st.given.name;
    const g = st.lines.find((l) => l.name === y);
    html += `<p>מחשבים את האיכות מהתכונה הנתונה:</p>`
      + texBlock(`\\begin{aligned} x &= \\dfrac{${y} - ${y}_${f}}{${y}_g - ${y}_${f}} \\\\ &= \\dfrac{${n6(st.given.value)} - ${P(g.f)}}{${n6(g.g)} - ${P(g.f)}} = ${num(st.x, 5)} \\end{aligned}`);
  } else {
    html += `<p>האיכות נתונה: ${M(`x = ${num(st.x, 5)}`)}.${st.x === 0 ? ' זה נוזל רווי.' : st.x === 1 ? ' זה אד רווי.' : ''}</p>`;
  }
  html += `<p>כל תכונה אחרת: ${M(`y = y_${f} + x\\,(y_g - y_${f})`)}</p>`;
  const lines = st.lines.filter((l) => !st.given || l.name !== st.given.name)
    .map((l) => `${l.name} &= ${n6(l.f)} + ${num(st.x, 5)} \\times (${n6(l.g)} - ${P(l.f)}) \\\\ &= ${n6(l.value)}`);
  html += texBlock(`\\begin{aligned} ${lines.join(' \\\\[4pt] ')} \\end{aligned}`);
  return html;
}

function approxStep(st) {
  const r = st.result;
  const giveT = st.by === 'T' ? 'בטמפרטורה הנתונה' : `בשורה שבה ${M(`${st.by}_f = ${st.by}`)} (ומשם ${M(`T = ${n6(st.T)}${DEG}`)})`;
  return `<p>${esc(st.reason)}, ולכן משתמשים ב<b>קירוב נוזל רווי</b>: לוקחים את ערכי הנוזל הרווי ${giveT}.</p>
    ${texBlock(
    `v \\approx v_f(T) = ${n6(r.v)}`,
    `u \\approx u_f(T) = ${n6(r.u)}`,
    `s \\approx s_f(T) = ${n6(r.s)}`,
    `\\begin{aligned} h &\\approx h_f(T) + v_f(T)\\,\\bigl(p - p_{\\text{sat}}(T)\\bigr) \\\\ &= ${n6(st.hf)} + ${n6(st.vf)} \\times (${n6(st.p)} - ${P(st.psat)}) \\\\ &= ${n6(st.hf + st.vf * (st.p - st.psat))} \\end{aligned}`,
  )}`;
}

function searchStep(st) {
  if (st.where === 'sat') {
    return `<p>נתונים ${M('v')} ו-${M('u')}. עוברים על השורות של טבלה ${L(esc(st.tableName))} (עמוד ${L(esc(st.bookletPage))}): בכל שורה מחשבים ${M('x = \\frac{v - v_f}{v_g - v_f}')} ואז ${M('u = u_f + x\\,u_{fg}')}, ומחפשים את השורות שבהן ${M('u')} המחושב עובר את הערך הנתון.</p>
      ${texBlock(
    `T = ${n6(st.a.T)}:\\quad x = ${num(st.a.x, 4)},\\ u = ${n6(st.a.u)}`,
    `T = ${n6(st.b.T)}:\\quad x = ${num(st.b.x, 4)},\\ u = ${n6(st.b.u)}`,
    linFormula('T', st.u, st.a.u, st.b.u, st.a.T, st.b.T, st.T),
  )}`;
  }
  return `<p>${M('v')} גדול מ-${M('v_g')} בכל הטבלה, לכן מחפשים בטבלת האד המחומם-על ${L(esc(st.tableName))}: בכל בלוק לחץ מוצאים את השורה עם ${M(`v = ${n6(st.v)}`)} וקוראים את ${M('u')}.</p>
    ${texBlock(
    `p = ${st.a.p}:\\quad u = ${n6(st.a.u)}`,
    `p = ${st.b.p}:\\quad u = ${n6(st.b.u)}`,
    linFormula('p', st.u, st.a.u, st.b.u, st.a.p, st.b.p, st.p, U(st.unit)),
  )}`;
}

function noteStep(st) {
  if (st.text === 'supercriticalT') return `<p>${M(`T = ${n6(st.T)}${DEG}`)} גבוהה מהטמפרטורה הקריטית (${M(`${st.Tc}${DEG}`)}). אין שם פעמון, ולכן קוראים ישר מטבלת האד המחומם-על.</p>`;
  if (st.text === 'supercriticalP') return `<p>${M(`p = ${n6(st.p)}${U('kPa')}`)} גבוה מהלחץ הקריטי (${M(`${st.pc}${U('kPa')}`)}). קוראים מטבלת האד המחומם-על (ואם הערך מתחת לטבלה — מטבלת הנוזל הדחוס).</p>`;
  if (st.text === 'aboveSatTable') return `<p>${M(`T = ${n6(st.T)}${DEG}`)} מעל טבלת הרוויה (עד ${M(`${st.Tmax}${DEG}`)}), ושם ${M('p_{\\text{sat}}')} גבוה מ-${M(`${n6(st.pmax)}${U('kPa')}`)}. הלחץ הנתון נמוך מזה, ולכן המצב בוודאות אד מחומם-על.</p>`;
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
  const giv = res.state.given.map((n) => M(`${n} = ${esc(shown[n].raw)}${U(shown[n].unit)}`)).join(', ');
  let html = `<div class="card ref-head"><h2>איפה בחוברת</h2><p>${esc(S.he)} ${L(esc(S.formula))}, נתון: ${giv}. תוצאה: <b>${esc(res.state.phase.he)}</b>.</p>
    <p>החוברת: <i>Thermodynamics – Tables and Diagrams</i>. ${M('T')} ב-${M(DEG.replace('\\,', ''))}. הלחץ ביחידות של כל טבלה (${L('kPa / MPa / bar')}).</p></div><ol class="steps">`;
  if (vm) {
    html += `<li class="card step" id="step-vm"><p>מחשבים נפח סגולי מהנפח והמסה (תמיד עובדים עם תכונות ליחידת מסה):</p>${texBlock(`v = \\dfrac{V}{m} = \\dfrac{${n6(vm.V)}}{${n6(vm.m)}} = ${n6(vm.v)}${U('m³/kg')}`)}</li>`;
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
