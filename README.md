# טבלאות קיטור — Steam-Table Calculator

A frontend-only web app for Thermodynamics 1 homework. Pick a substance (water, NH₃, R-12, R-134a) and two known properties; the app returns the full state (T, p, v, u, h, s, x, phase) **and tells you exactly where to find every value in the printed course booklet** *Thermodynamics – Tables and Diagrams* — table, page, pressure block, rows, and the interpolation written out with numbers.

- **Live site:** https://&lt;user&gt;.github.io/&lt;repo&gt;/ *(placeholder — filled in after publishing)*
- Course: Technion 00360714 (Generative AI tools), task "My first website".

## How it works

- Plain HTML, CSS and JavaScript. No backend, no build step, no external resources at runtime.
- All numbers come from the booklet itself (`data/*.json`), not from a steam library, so results match the paper tables exactly.
- Misprinted cells found in the booklet are listed in `data/corrections.json`; the app tells you when it used one.

## Repository layout

| Path | What |
| --- | --- |
| `index.html`, `css/`, `js/` | The site |
| `js/engine/` | Physics: units, table lookup, interpolation, phase, solve (DOM-free, runs in Node) |
| `data/` | One JSON file per booklet table |
| `tools/` | Build-time only: `parse_pdf.js` (PDF → JSON), `check_data.js` (consistency checks) |
| `tests/` | `node tests/engine.test.js` |

## Rebuilding the data

Requires `pdftotext` (xpdf or poppler) and Node. Put the booklet at `tables.pdf` (not committed), then:

```bash
node tools/parse_pdf.js
node tools/check_data.js
node tests/engine.test.js
```

> לשימוש בשיעורי בית בלבד — במבחן עובדים עם החוברת.
