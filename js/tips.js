// Tips screen: static content (Hebrew text, LaTeX math via KaTeX). UI only.
import { tex, texBlock } from './format.js';

const L = (s) => `<bdi dir="ltr">${s}</bdi>`; // table names and other plain English fragments
const M = (s) => tex(s); // inline math
const DEG = '\\,{}^{\\circ}\\mathrm{C}';

// SVG <text> cannot hold KaTeX, so the chart uses italic letters and real subscripts.
const v = (c) => `<tspan font-style="italic">${c}</tspan>`;
const sub = (c, s) => `${v(c)}<tspan baseline-shift="sub" font-size="9">${s}</tspan>`;

function flowchart() {
  // simple vertical decision chart; boxes are drawn RTL-friendly (text-anchor middle)
  const box = (x, y, w, h, text, cls = 'b') => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="${cls}"/>${text.map((t, i) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (text.length - 1) / 2) * 15 + 5}" text-anchor="middle">${t}</text>`).join('')}</g>`;
  const arrow = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="a" marker-end="url(#arr)"/>`;
  const ltr = (s) => `<tspan direction="ltr" unicode-bidi="embed">${s}</tspan>`;
  return `<svg viewBox="0 0 340 420" role="img" aria-label="תרשים החלטה: איזו טבלה לפתוח">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--muted)"/></marker></defs>
  <style>
    .b{fill:var(--surface-2);stroke:var(--border)} .q{fill:var(--accent-soft);stroke:var(--accent)}
    .m{fill:color-mix(in srgb,var(--accent) 18%,var(--surface));stroke:var(--accent)}
    .s{fill:color-mix(in srgb,var(--vapor) 18%,var(--surface));stroke:var(--vapor)}
    .c{fill:color-mix(in srgb,var(--liquid) 18%,var(--surface));stroke:var(--liquid)}
    text{font-size:12.5px;fill:var(--text);font-family:inherit} .a{stroke:var(--muted);stroke-width:1.6;fill:none}
  </style>
  ${box(95, 8, 150, 34, ['בוחרים חומר'])}
  ${arrow(170, 42, 170, 62)}
  ${box(60, 62, 220, 46, [`נתון ${v('T')} או ${v('p')}?`, 'פותחים את טבלת הרוויה בערך הזה'], 'q')}
  ${arrow(170, 108, 170, 128)}
  ${box(40, 128, 260, 46, [`משווים את התכונה השנייה (${ltr(`${v('v')}, ${v('u')}, ${v('h')}, ${v('s')}`)})`, `לערכי ${sub('y', 'f')} ו-${sub('y', 'g')} באותה שורה`], 'q')}
  ${arrow(80, 174, 55, 214)}${arrow(170, 174, 170, 214)}${arrow(260, 174, 285, 214)}
  ${box(225, 214, 110, 52, [ltr(`${v('y')} &lt; ${sub('y', 'f')}`), 'נוזל דחוס'], 'c')}
  ${box(115, 214, 110, 52, [ltr(`${sub('y', 'f')} ≤ ${v('y')} ≤ ${sub('y', 'g')}`), 'תערובת'], 'm')}
  ${box(5, 214, 110, 52, [ltr(`${v('y')} &gt; ${sub('y', 'g')}`), 'אד מחומם-על'], 's')}
  ${arrow(280, 266, 280, 300)}${arrow(170, 266, 170, 300)}${arrow(60, 266, 60, 300)}
  ${box(225, 300, 110, 92, ['טבלה דחוסה', `(מים, ${ltr(`${v('p')} ≥ 5 MPa`)})`, 'אחרת קירוב:', ltr(`${v('y')} ≈ ${sub('y', 'f')}(${v('T')})`)], 'c')}
  ${box(115, 300, 110, 92, ['נשארים בטבלת', 'הרוויה', `ומחשבים ${v('x')}`], 'm')}
  ${box(5, 300, 110, 92, ['עוברים לטבלת', 'האד המחומם-על', `בבלוק של ${v('p')}`], 's')}
</svg>`;
}

export function renderTips(el) {
  el.innerHTML = `
  <article class="card tip">
    <h2>1. איזו טבלה לפתוח</h2>
    <p>תמיד מתחילים בטבלת הרוויה, בערך של ${M('T')} או ${M('p')} שנתון. רק אחרי ההשוואה יודעים לאיזו טבלה לעבור.</p>
    ${flowchart()}
    <p class="muted">טבלאות לפי חומר: מים ${L('A.1.1–A.1.5')}, אמוניה ${L('A 2.1, A 2.3')}, ${L('R-12')} ${L('A 3.1, A 3.3')}, ${L('R-134a')} ${L('A-10, A-11, A-12')}.</p>
  </article>

  <article class="card tip">
    <h2>2. בתוך הפעמון או מחוץ לו</h2>
    <ul>
      <li>בשורת הרוויה קוראים את ${M('v_f')} ואת ${M('v_g')} ומשווים אליהם את ${M('v')}. אותו דבר עם ${M('u,\\ h,\\ s')}.</li>
      <li>בתוך הפעמון ${M('T')} ו-${M('p')} תלויים זה בזה (${M('T = T_{\\text{sat}}(p)')}), ולכן שניהם לבד <b>לא</b> קובעים את המצב. צריך עוד תכונה, למשל ${M('x')} או ${M('v')}.</li>
    </ul>
    ${texBlock('x = \\dfrac{v - v_f}{v_g - v_f}, \\qquad y = y_f + x\\,(y_g - y_f)')}
    <p><b>דוגמה:</b> מים, ${M('p = 200\\,\\mathrm{kPa}')}, ${M('v = 0.35\\,\\mathrm{m^3/kg}')}. בטבלה ${L('A1.2')}: ${M('v_f = 0.001061')}, ${M('v_g = 0.8857')}. מתקיים ${M('v_f < v < v_g')}, ולכן זו תערובת ו-${M(`T = T_{\\text{sat}} = 120.23${DEG}`)}.</p>
    ${texBlock('x = \\dfrac{0.35 - 0.001061}{0.8857 - 0.001061} \\approx 0.394')}
  </article>

  <article class="card tip">
    <h2>3. אינטרפולציה לינארית</h2>
    ${texBlock('y = y_1 + \\dfrac{x - x_1}{x_2 - x_1}\\,(y_2 - y_1)')}
    <ul>
      <li><b>בדיקה עצמית:</b> הציבו ${M('x = x_1')}. צריך לקבל בדיוק ${M('y_1')}, ועם ${M('x = x_2')} בדיוק ${M('y_2')}.</li>
      <li><b>טעות נפוצה:</b> לכפול את השיפוע ב-${M('x')} במקום ב-${M('(x - x_1)')}.</li>
      <li>כשגם ${M('p')} וגם ${M('T')} לא מודפסים: אינטרפולציה ב-${M('T')} בכל אחד משני בלוקי הלחץ השכנים, ואז אינטרפולציה בין שתי התוצאות לפי ${M('p')}.</li>
    </ul>
    <p><b>דוגמה:</b> ${M('p_{\\text{sat}}')} של מים ב-${M(`22${DEG}`)}. בטבלה ${L('A.1.1')}: ב-${M(`20${DEG}`)} ${M('p = 2.339\\,\\mathrm{kPa}')}, ב-${M(`25${DEG}`)} ${M('p = 3.169\\,\\mathrm{kPa}')}.</p>
    ${texBlock('p = 2.339 + \\dfrac{22 - 20}{25 - 20}\\,(3.169 - 2.339) \\approx 2.671\\,\\mathrm{kPa}')}
  </article>

  <article class="card tip">
    <h2>4. מלכודות בחוברת</h2>
    <ul>
      <li><b>יחידות משתנות בין טבלאות:</b> ${L('kPa')}, ${L('MPa')} ו-${L('bar')}. ב-${L('A.1.1')} הלחץ ב-${L('kPa')} עד ${M(`100${DEG}`)} ואחר כך ב-${L('MPa')}. ${M('1\\,\\mathrm{bar} = 100\\,\\mathrm{kPa}')}, ${M('1\\,\\mathrm{MPa} = 1000\\,\\mathrm{kPa}')}.</li>
      <li><b>לאמוניה ול-${L('R-12')} אין טבלת רוויה לפי לחץ.</b> כשנתון ${M('p')} מחפשים אותו בעמודת הלחץ של טבלת הטמפרטורה ועושים אינטרפולציה הפוכה.</li>
      <li><b>${L('R-134a')} מדפיסה ${M('v_f \\times 10^3')}:</b> המספר בטבלה צריך להתחלק ב-1000.</li>
      <li><b>תמיד ליחידת מסה:</b> הטבלאות נותנות תכונות סגוליות. אם נתונים נפח ומסה, מחשבים קודם ${M('v = V/m')}.</li>
      <li><b>טבלת הנוזל הדחוס של מים מתחילה ב-${M('5\\,\\mathrm{MPa}')}.</b> מתחת לזה משתמשים בקירוב:
        ${texBlock('v \\approx v_f(T), \\quad u \\approx u_f(T), \\quad s \\approx s_f(T)', 'h \\approx h_f(T) + v_f\\,\\bigl(p - p_{\\text{sat}}(T)\\bigr)')}</li>
      <li><b>בטבלת ${L('R-12')} המחוממת-על</b> תוכן העניינים כותב ${L('A3.1')}, אבל בראש העמוד כתוב ${L('A 3.3')}.</li>
      <li><b>תאים עם טעויות דפוס</b> (בין השאר):
        <ul>
          <li>${L('A.1.3')}: ${M(`p = 3\\,\\mathrm{MPa},\\ T = 300${DEG}`)}: ${M('s')} מודפס ${M('0.6539')} במקום ${M('6.539')}.</li>
          <li>${L('A.1.3')}: ${M(`p = 0.5\\,\\mathrm{MPa},\\ T = 1300${DEG}`)}: ${M('s')} מודפס ${M('6.7749')} במקום ${M('9.7749')}.</li>
          <li>${L('A.1.3')}: ${M(`p = 1.8\\,\\mathrm{MPa},\\ T = 1200${DEG}`)}: ${M('v')} ו-${M('h')} שבורים (${M('0.776,\\ 5860.5')}).</li>
          <li>${L('A1.2')}: ${M('p = 1500\\,\\mathrm{kPa}')}: ${M('u_f,\\ h_f')} מודפסים ${M('743.16,\\ 744.89')} במקום ${M('843.16,\\ 844.89')}.</li>
          <li>${L('A.1.4')}: ${M('p = 20\\,\\mathrm{MPa}')}: השורה הראשונה חוזרת על ערכי ${M('5\\,\\mathrm{MPa}')}, ו-${M('s')} ב-${M(`240,\\ 260${DEG}`)} חסר את הספרה 2.</li>
          <li>${L('A 2.3')}: ${M(`p = 1600\\,\\mathrm{kPa},\\ T = 60${DEG}`)}: ${M('v = 0.895')} (צ"ל ${M('0.0895')}) ו-${M('u = 102.4')}.</li>
          <li>${L('A 3.1')}: ${M(`T = 35${DEG}`)}: ${M('v_g,\\ v_{fg},\\ u_g,\\ u_{fg}')} לא מתאימים לשכנים.</li>
        </ul>
        המחשבון משתמש בערכים המתוקנים ומציג הערה צהובה בכל פעם שהוא נעזר בתא כזה.</li>
    </ul>
  </article>`;
}
