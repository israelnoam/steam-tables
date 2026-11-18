// T–v sketch (inline SVG): saturation dome from the booklet table + the state point. UI only.
import { SUBSTANCES } from './engine/data.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function tvSketch(db, sub, state) {
  const t = db.tables[SUBSTANCES[sub].satT];
  const c = Object.fromEntries(t.columns.map((n, i) => [n, i]));
  const rows = t.rows;
  const W = 340, H = 210, L = 34, R = 12, T0 = 12, B = 30;
  const Ts = rows.map((r) => r[c.T]);
  let tmin = Math.min(...Ts), tmax = Math.max(...Ts);
  const vs = rows.flatMap((r) => [r[c.vf], r[c.vg]]);
  let vmin = Math.min(...vs), vmax = Math.max(...vs);
  const sv = state.v, sT = state.T;
  if (Number.isFinite(sv)) { vmin = Math.min(vmin, sv); vmax = Math.max(vmax, sv); }
  if (Number.isFinite(sT)) { tmin = Math.min(tmin, sT); tmax = Math.max(tmax, sT); }
  const pad = (tmax - tmin) * 0.08;
  tmin -= pad; tmax += pad;
  const lv0 = Math.log10(vmin) - 0.25, lv1 = Math.log10(vmax) + 0.25;
  const X = (v) => L + ((Math.log10(v) - lv0) / (lv1 - lv0)) * (W - L - R);
  const Y = (T) => T0 + (1 - (T - tmin) / (tmax - tmin)) * (H - T0 - B);
  const left = rows.map((r) => `${X(r[c.vf]).toFixed(1)},${Y(r[c.T]).toFixed(1)}`);
  const right = rows.slice().reverse().map((r) => `${X(r[c.vg]).toFixed(1)},${Y(r[c.T]).toFixed(1)}`);
  const dome = `M${left.join(' L')} L${right.join(' L')}`;
  const key = state.phase.key;
  const color = key === 'compressed' || key === 'satLiquid' ? 'var(--liquid)' : key === 'mixture' || key === 'solidVapor' ? 'var(--accent)' : 'var(--vapor)';
  const px = X(sv), py = Y(sT);
  // horizontal saturation line through the point when inside the dome
  let tie = '';
  if (key === 'mixture' || key === 'satLiquid' || key === 'satVapor') {
    const k = rows.findIndex((r) => r[c.T] >= sT);
    if (k >= 0) {
      const r = rows[k];
      tie = `<line x1="${X(r[c.vf]).toFixed(1)}" y1="${py.toFixed(1)}" x2="${X(r[c.vg]).toFixed(1)}" y2="${py.toFixed(1)}" stroke="var(--dome)" stroke-dasharray="4 3"/>`;
    }
  }
  const label = (x, y, txt, anchor = 'middle') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="10" fill="var(--muted)">${esc(txt)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="דיאגרמת T–v עם הפעמון ונקודת המצב" direction="ltr">
  <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="var(--border)"/>
  <line x1="${L}" y1="${T0}" x2="${L}" y2="${H - B}" stroke="var(--border)"/>
  <path d="${dome}" fill="none" stroke="var(--dome)" stroke-width="1.6" stroke-linejoin="round"/>
  ${tie}
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
  ${label((L + W - R) / 2, H - 8, 'v [m³/kg] (log)')}
  <text x="12" y="${(T0 + H - B) / 2}" font-size="10" fill="var(--muted)" text-anchor="middle" transform="rotate(-90 12 ${(T0 + H - B) / 2})">T [°C]</text>
  ${label(L + 4, T0 + 10, `${Math.round(tmax)}`, 'start')}
  ${label(L + 4, H - B - 4, `${Math.round(tmin)}`, 'start')}
</svg>`;
}
