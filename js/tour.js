// Guided tour, written in-house: dims the page, highlights one element, shows a Hebrew bubble. UI only.
const L = (s) => `<bdi dir="ltr">${s}</bdi>`;

const STEPS = [
  { tab: 'calc', sel: '.brand', text: `מחשבון טבלאות קיטור לשיעורי בית בתרמודינמיקה 1, שנבנה במסגרת הקורס ${L('00360714')}. הוא נותן את כל תכונות המצב ומראה איפה למצוא כל ערך בחוברת. <b>במבחן עובדים עם החוברת.</b>` },
  { tab: 'calc', sel: '#substance-group', text: `בוחרים חומר: מים, אמוניה, ${L('R-12')} או ${L('R-134a')}.` },
  { tab: 'calc', sel: '#pair-group', text: `בוחרים אילו שתי תכונות ידועות, ומזינים אותן עם היחידות. כשיש ${L('v')}, אפשר להזין במקומו ${L('V')} ו-${L('m')} והמחשבון יחשב ${L('v = V/m')}.` },
  { tab: 'calc', sel: '#result', fallback: '#solve-btn', text: `כאן מופיעה התוצאה: הפאזה וכל התכונות. ליד כל ערך יש קישור <b>מאיפה?</b> שמוביל לצעד המתאים בחוברת.` },
  { tab: 'calc', sel: '[data-tab="ref"]', text: `במסך <b>איפה בחוברת</b>: באיזו טבלה, באיזה עמוד ובאילו שורות, עם האינטרפולציה כתובה במספרים.` },
  { tab: 'calc', sel: '[data-tab="tips"]', text: `במסך <b>טיפים</b>: איך לבחור טבלה, איך לבצע אינטרפולציה, ואילו מלכודות יש בחוברת.` },
  { tab: 'calc', sel: '#theme-btn', text: `מצב בהיר או כהה. חישובים אחרונים נשמרים מתחת לתוצאה, ולחיצה על אחד טוענת אותו מחדש.` },
  { tab: 'calc', sel: '.brand', text: `מקור הנתונים: כל הערכים לקוחים מחוברת הקורס <i>Thermodynamics – Tables and Diagrams</i>. תאים עם טעויות דפוס מתוקנים ומסומנים בהערה צהובה.` },
];

let state = null;

function place() {
  if (!state) return;
  const s = STEPS[state.i];
  let el = document.querySelector(s.sel);
  if (!el || el.hidden || !el.getClientRects().length) el = s.fallback ? document.querySelector(s.fallback) : null;
  const hole = state.hole, bubble = state.bubble;
  if (el) {
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px`, opacity: 1 });
    const below = r.bottom + 12, bh = bubble.offsetHeight;
    bubble.style.top = below + bh < innerHeight - 70 ? `${below}px` : `${Math.max(12, r.top - bh - 12)}px`;
  } else {
    Object.assign(hole.style, { left: '50%', top: '40%', width: '0px', height: '0px' });
    bubble.style.top = '30%';
  }
}

function render() {
  const s = STEPS[state.i];
  state.showTab(s.tab);
  const el = document.querySelector(s.sel);
  if (el && el.getClientRects().length) el.scrollIntoView({ block: 'center' });
  const last = state.i === STEPS.length - 1;
  state.bubble.innerHTML = `<p>${s.text}</p><div class="tour-actions"><span class="count">${state.i + 1} / ${STEPS.length}</span>
    <span><button type="button" class="btn secondary" data-t="skip">דלג</button> <button type="button" class="btn primary" style="width:auto" data-t="next">${last ? 'סיום' : 'הבא'}</button></span></div>`;
  requestAnimationFrame(place);
  state.bubble.querySelector('[data-t="next"]').focus();
}

function end() {
  if (!state) return;
  state.shade.remove(); state.hole.remove(); state.bubble.remove();
  removeEventListener('resize', place); removeEventListener('scroll', place, true); removeEventListener('keydown', onKey);
  state = null;
  try { localStorage.setItem('tourDone', '1'); } catch { /* ignore */ }
}
function onKey(e) { if (e.key === 'Escape') end(); }

export function startTour(showTab) {
  if (state) return;
  const shade = Object.assign(document.createElement('div'), { className: 'tour-shade' });
  const hole = Object.assign(document.createElement('div'), { className: 'tour-hole' });
  const bubble = Object.assign(document.createElement('div'), { className: 'tour-bubble' });
  bubble.setAttribute('role', 'dialog'); bubble.setAttribute('aria-live', 'polite');
  document.body.append(shade, hole, bubble);
  state = { i: 0, shade, hole, bubble, showTab };
  bubble.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t === 'skip') end();
    if (t === 'next') { if (state.i < STEPS.length - 1) { state.i++; render(); } else end(); }
  });
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', onKey);
  render();
}

export function maybeAutoTour(showTab) {
  let done = false;
  try { done = localStorage.getItem('tourDone') === '1'; } catch { done = true; }
  if (!done) setTimeout(() => startTour(showTab), 600);
}
