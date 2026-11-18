// Unit conversion. Internal units: T °C, p kPa, v m³/kg, u/h kJ/kg, s kJ/(kg·K).

export const UNITS = {
  T: { C: { label: '°C', to: (x) => x, from: (x) => x }, K: { label: 'K', to: (x) => x - 273.15, from: (x) => x + 273.15 } },
  p: {
    kPa: { label: 'kPa', to: (x) => x, from: (x) => x },
    MPa: { label: 'MPa', to: (x) => x * 1000, from: (x) => x / 1000 },
    bar: { label: 'bar', to: (x) => x * 100, from: (x) => x / 100 },
  },
  v: { 'm3/kg': { label: 'm³/kg', to: (x) => x, from: (x) => x }, 'L/kg': { label: 'L/kg', to: (x) => x / 1000, from: (x) => x * 1000 } },
  u: { 'kJ/kg': { label: 'kJ/kg', to: (x) => x, from: (x) => x } },
  h: { 'kJ/kg': { label: 'kJ/kg', to: (x) => x, from: (x) => x } },
  s: { 'kJ/kgK': { label: 'kJ/(kg·K)', to: (x) => x, from: (x) => x } },
  x: { '-': { label: '', to: (x) => x, from: (x) => x } },
};

export const DEFAULT_UNIT = { T: 'C', p: 'kPa', v: 'm3/kg', u: 'kJ/kg', h: 'kJ/kg', s: 'kJ/kgK', x: '-' };

/** Convert a user value to internal units. */
export function toInternal(name, value, unit = DEFAULT_UNIT[name]) {
  const u = UNITS[name]?.[unit];
  if (!u) throw new Error(`unknown unit ${unit} for ${name}`);
  return u.to(value);
}

/** Convert an internal value to the given unit. */
export function fromInternal(name, value, unit = DEFAULT_UNIT[name]) {
  const u = UNITS[name]?.[unit];
  if (!u) throw new Error(`unknown unit ${unit} for ${name}`);
  return u.from(value);
}

/** Factor from a booklet pressure unit to kPa. */
export const P_TO_KPA = { kPa: 1, MPa: 1000, bar: 100 };

export function unitLabel(name, unit = DEFAULT_UNIT[name]) {
  return UNITS[name]?.[unit]?.label ?? unit;
}
