// Table data: loading (browser fetch or Node fs) and corrections. No DOM, no physics.

export const TABLE_IDS = ['A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5', 'A2.1', 'A2.3', 'A3.1', 'A3.3', 'A10', 'A11', 'A12'];

export const SUBSTANCES = {
  water: { name: 'Water', he: 'מים', formula: 'H₂O', satT: 'A1.1', satP: 'A1.2', sup: 'A1.3', comp: 'A1.4', solid: 'A1.5', Tc: 374.14, pc: 22090 },
  NH3: { name: 'Ammonia', he: 'אמוניה', formula: 'NH₃', satT: 'A2.1', satP: null, sup: 'A2.3', comp: null },
  R12: { name: 'R-12', he: 'R-12', formula: 'CCl₂F₂', satT: 'A3.1', satP: null, sup: 'A3.3', comp: null },
  R134a: { name: 'R-134a', he: 'R-134a', formula: 'CF₃CH₂F', satT: 'A10', satP: 'A11', sup: 'A12', comp: null },
};

// Booklet name as printed on the page header (used on every reference card).
export const PRINTED_NAME = {
  'A1.1': 'A.1.1', 'A1.2': 'A1.2', 'A1.3': 'A.1.3', 'A1.4': 'A.1.4', 'A1.5': 'A.1.5',
  'A2.1': 'A 2.1', 'A2.3': 'A 2.3', 'A3.1': 'A 3.1', 'A3.3': 'A 3.3', A10: 'A-10', A11: 'A-11', A12: 'A-12',
};

/** Apply corrections.json to a raw table (mutates a deep copy). Each corrected cell is recorded in table.corrected. */
export function prepareTable(raw, corrections = []) {
  const t = JSON.parse(JSON.stringify(raw));
  t.corrected = {};
  t.name = PRINTED_NAME[t.id] || t.id;
  for (const c of corrections) {
    if (c.table !== t.id) continue;
    const [keyCol, keyVal] = Object.entries(c.at)[0];
    const apply = (cols, rows, bi) => {
      const ki = cols.indexOf(keyCol), ci = cols.indexOf(c.col);
      const ri = rows.findIndex((r) => r[ki] === keyVal);
      if (ri < 0 || ci < 0) throw new Error(`correction not applicable: ${JSON.stringify(c)}`);
      if (c.printed !== undefined && typeof c.printed === 'number' && rows[ri][ci] !== c.printed) {
        throw new Error(`correction printed value mismatch (${rows[ri][ci]}): ${JSON.stringify(c)}`);
      }
      rows[ri][ci] = c.value;
      t.corrected[`${bi}|${ri}|${c.col}`] = c;
    };
    if (t.blocks) {
      const bi = t.blocks.findIndex((b) => b.p === c.p);
      if (bi < 0) throw new Error(`correction block not found: ${JSON.stringify(c)}`);
      apply(t.blocks[bi].columns, t.blocks[bi].rows, bi);
    } else apply(t.columns, t.rows, -1);
  }
  return t;
}

let cache = null;

/** Load all tables. In the browser pass nothing (fetches ./data/*.json); in Node pass a readJson(name) function. */
export async function loadAll(readJson) {
  if (cache) return cache;
  const read = readJson || (async (name) => {
    const r = await fetch(new URL(`../../data/${name}`, import.meta.url));
    if (!r.ok) throw new Error(`failed to load ${name}`);
    return r.json();
  });
  const corrections = await read('corrections.json');
  const tables = {};
  await Promise.all(TABLE_IDS.map(async (id) => { tables[id] = prepareTable(await read(`${id}.json`), corrections.cells); }));
  cache = { tables, corrections: corrections.cells };
  return cache;
}

/** Node helper. */
export async function loadAllNode() {
  const fs = await import('fs');
  const path = await import('path');
  const url = await import('url');
  const dir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..', 'data');
  return loadAll(async (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}
