// Booklet reference screen (filled in step 7).
import { esc } from './format.js';
export function renderReference(el, db, last) {
  if (!last) { el.innerHTML = '<p class="card empty">עוד אין חישוב. חשבו מצב במסך המחשבון.</p>'; return; }
  el.innerHTML = `<ol class="steps">${last.res.traces.map((s, i) => `<li class="card step" id="step-${i}"><p>${esc(s.tableName || s.kind)} ${esc(s.bookletPage || '')} ${esc(s.block || '')}</p></li>`).join('')}</ol>`;
}
