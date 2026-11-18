// Number and label formatting shared by the screens. UI only.
import { fromInternal, unitLabel } from './engine/units.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Format a number with about 5 significant digits, never in exponent notation for normal table values. */
export function num(v, sig = 5) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  let s;
  if (a >= 1e5) s = v.toFixed(0);
  else if (a >= 1) s = v.toFixed(Math.max(0, sig - 1 - Math.floor(Math.log10(a))));
  else if (a >= 1e-4) s = v.toFixed(Math.min(8, sig - 1 - Math.floor(Math.log10(a))));
  else s = v.toExponential(3);
  if (s.includes('.') && !s.includes('e')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

const DIGITS = { T: 2, u: 2, h: 2, s: 4, x: 4 };
export function fmtProp(name, internal, unit) {
  if (internal === null || internal === undefined || !Number.isFinite(internal)) return '—';
  const v = unit ? fromInternal(name, internal, unit) : internal;
  if (name in DIGITS && !(name === 'T' && unit === 'K')) {
    const d = DIGITS[name];
    return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
  return num(v, name === 'v' ? 5 : 5);
}

export const ltr = (s) => `<bdi dir="ltr">${s}</bdi>`;
export { unitLabel };

/** Property symbol with subscript: v_f → v<sub>f</sub>. */
export function sym(name) {
  const m = /^([a-zA-Z])(.*)$/.exec(name);
  if (!m || !m[2] || /[^a-z]/.test(m[2])) return esc(name);
  return `${esc(m[1])}<sub>${esc(m[2])}</sub>`;
}
