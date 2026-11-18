# Steam-Table Calculator — Full Build Spec

This document is the complete instruction set for Claude Code. Build exactly what is described here, in the order of section 9.

## 0. How to start (for Noam)

1. Export this doc as Markdown and save it as `SPEC.md` in a new empty folder.
2. Put the booklet PDF in the same folder as `tables.pdf`.
3. Open Claude Code in that folder and paste the prompt below.

```text
Read SPEC.md fully. It is the complete spec for a frontend-only steam-table calculator,
built from tables.pdf in this folder. Follow section 9 step by step. Before step 1, give me
a short plan and wait for my OK. After each step, run the tests, commit, and tell me what
works. Deadline is tonight: if time runs short, finish the minimum in section 9 (water only)
and publish to GitHub Pages first, then continue with the rest.
```

## 1. Goal

A web app for thermodynamics homework. The student picks a substance and two known properties. The app returns every other property of the state (T, p, v, u, h, s, x, phase) and tells the student exactly where to find each value in the printed course booklet *Thermodynamics – Tables and Diagrams*: which table, which page, which pressure block, which rows, and the interpolation written out with numbers.

The app has three screens:

1. **Calculator** — inputs and full result.
2. **Booklet reference** — step-by-step "where to look" card for the last result.
3. **Tips** — how to navigate the steam tables by hand.

It is also the submission for the Technion course 00360714 (Generative AI tools), task "My first website": built in VS Code, published on GitHub Pages, with two links submitted in Moodle (live site + repo).

## 2. Hard constraints

- **Frontend only.** Plain HTML, CSS and JavaScript. No backend, no server functions, no database, no build step required to run.
- **No external resources at runtime.** No CDNs, no Google Fonts, no analytics, no external APIs, no links that fetch data. Every file the site needs is inside the repo. If a library is used (for example KaTeX for formulas), its files are copied into `vendor/` in the repo.
- **All data comes from the booklet PDF**, not from an external steam library, so results match the paper tables exactly.
- **Hosted on GitHub Pages** from the `main` branch, root folder. Relative paths only, so it works at `https://<user>.github.io/<repo>/`.
- **Language:** UI text in Hebrew (RTL layout). Property symbols, units and table names stay in English (T, p, v, u, h, s, x, kPa, A.1.3). Mixed lines must render correctly: wrap every English/math fragment inside Hebrew text in a `<bdi>` or `<span dir="ltr">`.
- **Mobile friendly.** Must work well on an iPhone in Safari (390 px width) and on desktop.

## 3. Repository structure

```
steam-tables/
├── index.html            # app shell, three screens (tabs)
├── css/
│   └── style.css
├── js/
│   ├── app.js            # UI: tabs, inputs, rendering
│   ├── engine/
│   │   ├── units.js      # unit conversion
│   │   ├── data.js       # loads JSON tables
│   │   ├── lookup.js     # bracketing rows, interpolation
│   │   ├── phase.js      # decide the region
│   │   └── solve.js      # main entry point, builds traces
│   └── tips.js           # content of the Tips screen
├── data/                 # one JSON file per booklet table
│   ├── A1.1.json  A1.2.json  A1.3.json  A1.4.json  A1.5.json
│   ├── A2.1.json  A2.3.json
│   ├── A3.1.json  A3.3.json
│   └── A10.json   A11.json   A12.json
├── vendor/               # local copies of any library (e.g. katex)
├── tools/                # build-time only, not used by the site
│   ├── parse_pdf.py      # PDF text -> data/*.json
│   └── check_data.js     # consistency checks on the JSON
├── tests/
│   └── engine.test.js    # run with node
├── README.md
└── .gitignore
```

The engine never touches the DOM and the UI never does physics. The engine must run in Node too, so the tests can call it directly.

## 4. Booklet map

The PDF has 25 pages. Page 1 is the table of contents.

| Table | Substance | Region | Booklet page | PDF page | Indexed by | Units |
| --- | --- | --- | --- | --- | --- | --- |
| A.1.1 | Water | Saturated liquid–vapor | –1– | 2 | T: 0.01 → 374.14 °C | p in kPa up to 100 °C, then MPa |
| A.1.2 | Water | Saturated liquid–vapor | –2– | 3 | p: 0.6113 → 22090 kPa | kPa |
| A.1.3 | Water | Superheated vapor | –3– to –6– | 4–7 | blocks p = 0.01 → 60 MPa; rows T up to 1300 °C | MPa |
| A.1.4 | Water | Compressed liquid | –7– | 8 | blocks p = 5, 10, 15, 20, 30, 50 MPa | MPa |
| A.1.5 | Water | Saturated solid–vapor | –8– | 9 | T: 0.01 → −40 °C | kPa |
| A 2.1 | Ammonia | Saturated liquid–vapor | –9– | 10 | T: −50 → 50 °C | kPa |
| A 2.3 | Ammonia | Superheated vapor | –10–, –11– | 11–12 | blocks p = 50 → 2000 kPa | kPa |
| A 3.1 | R-12 | Saturated liquid–vapor | –12– | 13 | T: −90 → 112 °C | MPa |
| A 3.3 | R-12 | Superheated vapor | –13–, –14– | 14–15 | blocks p = 0.05 → 4.0 MPa | MPa |
| A-10 | R-134a | Saturated liquid–vapor | 736 | 16 | T: −40 → 100 °C | bar |
| A-11 | R-134a | Saturated liquid–vapor | 737 | 17 | p: 0.6 → 30 bar | bar |
| A-12 | R-134a | Superheated vapor | 738–740 | 18–20 | blocks p = 0.6 → 16 bar | bar |
| — | Diagrams | h–s, T–s (water), p–h (NH₃, R-12), psychrometric | –15– to –19– | 21–25 | images only, not used for values | — |

### Traps in the booklet the code must handle

1. **Units change between tables:** kPa, MPa and bar. Internally the engine uses kPa, °C, m³/kg, kJ/kg, kJ/(kg·K). Every reference card shows values in the booklet's own units for that table.
2. **R-134a tables print v\_f × 10³.** Divide by 1000 when parsing.
3. **R-134a negative temperatures lost their minus sign** in the PDF text extraction (for example the first row reads "40" but is −40 °C). The parser must restore signs: in A-10 the temperatures run −40 → 100 °C; in A-11 and A-12 a T\_sat or row T is negative when it is below 0 °C (check against monotonic order and against the saturation pressure).
4. **Ammonia and R-12 have no pressure-indexed saturation table.** When p is given, invert the temperature table (interpolate on the p column) and say so in the reference card.
5. **Table of contents names the R-12 superheated table "A3.1"**, but its page header says A 3.3. Always cite the page header.
6. **Water compressed-liquid data starts at 5 MPa.** Below that use the saturated-liquid approximation (section 6.5).
7. **Corrupted or suspicious cells** — keep a `corrections.json` list and show a warning when a value comes from one of them:
   - A.1.3, p = 20 MPa, saturation row: h prints as "######"; the line wraps to 2409.7 and 4.9269 (h, s).
   - A.1.3, p = 1.80 MPa, T = 1200 °C: v = 0.77600 and h = 5860.5 break the trend (expected about 0.3880 and 5144.4).
   - A.1.3, p = 0.50 MPa, T = 1300 °C: s = 6.7749 (expected about 9.7749).
   - A.1.3, p = 3.00 MPa, T = 300 °C: s = 0.6539 (expected about 6.5390).
   - A.1.3, p = 1.40 MPa, T = 500 °C: u and h jump (3132.1, 3485.0); check against neighbours.
   - A.1.4, p = 20 MPa: the first row repeats the 5 MPa saturation values; s at 240 and 260 °C print as 0.6674 and 0.8459 (expected 2.6674, 2.8459).
   - A.1.2, p = 1500 kPa: u\_f, h\_f break the trend (743.16, 744.89).
   - A 2.3, p = 1600 kPa, T = 60 °C: v = 0.8950, u = 102.4 are wrong (expected about 0.0895 and 1402.4).
   - A 3.1, T = 35 °C: v\_fg, u\_fg look shifted; check with v\_g − v\_f.
   - A 3.3, p = 0.200 MPa, T = 60 °C: v = 0.113970 breaks the trend. The check script (section 8) must find these automatically, and any others. For each one, the JSON stores the corrected value and the printed value, and the card says: "In the booklet this cell is printed as X; the app uses Y."

## 5. Data format

One JSON file per table. Metadata drives the reference card.

Saturated table (example A1.2):

```json
{
  "id": "A1.2",
  "label": "Table A.1.2 — Saturated steam (Pressure)",
  "substance": "water",
  "region": "saturated",
  "indexedBy": "p",
  "bookletPage": "–2–",
  "pdfPage": 3,
  "units": { "p": "kPa", "T": "C" },
  "columns": ["p","T","vf","vg","uf","ufg","ug","hf","hfg","hg","sf","sfg","sg"],
  "rows": [[100, 99.63, 0.001043, 1.6940, 417.36, 2088.7, 2506.1, 417.46, 2258.0, 2675.5, 1.3026, 6.0568, 7.3594]]
}
```

Superheated or compressed table (example A1.3): a list of blocks, one per pressure, each with its own page:

```json
{
  "id": "A1.3",
  "label": "Table A.1.3 — Superheated steam",
  "substance": "water",
  "region": "superheated",
  "units": { "p": "MPa", "T": "C" },
  "blocks": [
    { "p": 1.20, "Tsat": 187.99, "bookletPage": "–4–", "pdfPage": 5,
      "columns": ["T","v","u","h","s"],
      "rows": [[187.99, 0.16333, 2588.8, 2784.8, 6.5233], [200, 0.16930, 2612.8, 2816.0, 6.5898]] }
  ]
}
```

Compact arrays keep the files small. Missing columns (for example R-134a has no u\_fg or s\_fg) are computed as differences and marked `computed: true`, so the card never pretends they are printed.

## 6. Engine

### 6.1 Supported input pairs

Only these eight pairs are offered in the UI. They cover almost every Thermo 1 exercise.

| # | Pair | Typical use |
| --- | --- | --- |
| 1 | T + p | Any state with both given; decide liquid / superheated |
| 2 | T + x | Saturated mixture at a known temperature |
| 3 | p + x | Saturated mixture at a known pressure |
| 4 | T + v | Rigid tank heated or cooled |
| 5 | p + v | Piston-cylinder, tank with known volume and mass (v = V/m) |
| 6 | p + h | Throttling valve, heat exchanger outlet |
| 7 | p + s | Turbine, pump, compressor (isentropic step) |
| 8 | v + u | Free expansion into vacuum, insulated rigid tank |

A helper field lets the user enter V and m instead of v; the app computes v = V/m and shows that step.

### 6.2 Deciding the phase (phase.js)

Always check the saturation table first, at the given T or p.

| Given | Rule | Region and table |
| --- | --- | --- |
| T + p | p > p\_sat(T): compressed liquid. p < p\_sat(T): superheated. p = p\_sat(T): ask for one more property | Compressed table or approximation; superheated table |
| T or p + x | 0 ≤ x ≤ 1: saturated mixture. Otherwise reject | T-indexed or p-indexed saturation table |
| T or p + y (y = v, h or s) | y < y\_f: compressed liquid. y\_f ≤ y ≤ y\_g: mixture, compute x. y > y\_g: superheated | Saturation table, then the region's table |
| v + u | Search: for each saturation row find x from v, compare u; else search superheated blocks | Saturation table or superheated table |
| Water, T < 0.01 °C | Solid–vapor region | A.1.5 |
| Above the critical point | Read from the superheated table | A.1.3 |

Preferred table: the one indexed by what the user gave, so the student reads a printed row instead of interpolating. If the value is printed exactly in the other table too, mention both.

### 6.3 Interpolation (lookup.js)

Single linear interpolation between two printed rows:

```latex
y = y_1 + \frac{x - x_1}{x_2 - x_1}\,(y_2 - y_1)
```

Double interpolation (superheated, neither p nor T printed): interpolate in T inside the two neighbouring pressure blocks, then interpolate those two results in p. The trace records all four rows.

Quality inside the dome:

```latex
x = \frac{y - y_f}{y_g - y_f}, \qquad y = y_f + x\,(y_g - y_f)
```

Inverse lookup (p given for NH₃ or R-12, or h or s given with T unknown): find the two rows that bracket the given value in its column, then interpolate every other column with the same fraction.

Never extrapolate. Outside the table range, return a clear error: "הערך מחוץ לטווח הטבלה" plus the range.

### 6.4 The trace (powers the reference card)

Every lookup returns its value and a record of how it was found:

```js
{
  table: "A1.3", bookletPage: "–4–", pdfPage: 5,
  block: "p = 1.20 MPa",
  rows: [{ T: 200, h: 2816.0 }, { T: 250, h: 2935.0 }],
  method: "linear",   // exact | linear | double | inverse | approx | quality
  x: { name: "T", value: 220 },
  result: { name: "h", value: 2863.6 },
  warnings: []
}
```

### 6.5 Compressed liquid below the table (water)

Below 5 MPa, use the saturated liquid at the same temperature (A.1.1):

```latex
v \approx v_f(T), \quad u \approx u_f(T), \quad s \approx s_f(T), \quad h \approx h_f(T) + v_f(T)\,(p - p_{sat}(T))
```

The card states that this is an approximation and names the A.1.1 row used. For NH₃, R-12 and R-134a there is no compressed table at all; use the same approximation.

### 6.6 Output of solve()

```js
{ state: { T, p, v, u, h, s, x, phase }, traces: [ ... ], warnings: [ ... ] }
```

Phase is one of: compressed liquid, saturated mixture, saturated liquid, saturated vapor, superheated vapor, solid–vapor. Warnings: value from a corrected cell, approximation used, near the edge of the table.

## 7. Screens (UI)

Three tabs at the top, Hebrew labels: מחשבון · איפה בחוברת · טיפים.

### 7.1 Calculator

1. Substance picker: מים (H₂O), אמוניה (NH₃), R-12, R-134a.
2. Pair picker: the eight pairs from 6.1, as buttons.
3. Two number fields, each with a unit dropdown (T: °C, K; p: kPa, MPa, bar; v: m³/kg, L/kg).
4. Optional "V and m" helper that fills v.
5. Button חשב. Results update on Enter as well.
6. Result card: phase in large text (Hebrew + English), then a table of T, p, v, u, h, s, x with units. Given values are marked. Each value has a small "מאיפה?" link that jumps to its step on the reference screen.
7. A small T–v sketch (inline SVG, drawn by the app) with the dome and the state point, so the phase decision is visible.

### 7.2 Booklet reference

For the last result, one numbered step per trace, written in Hebrew with English symbols, for example:

1. פתח את טבלה A.1.2, עמוד –2–, שורה p = 200 kPa. שם v\_f = 0.001061, v\_g = 0.8857.
2. v = 0.35 נמצא בין v\_f ל-v\_g, ולכן המצב בתוך הפעמון ו-T = T\_sat = 120.23 °C.
3. מחשבים x עם הנוסחה, כולל המספרים.

Each step shows the formula with the numbers substituted, and a button to show the printed rows used, styled like the booklet. Corrected cells and approximations show a yellow note.

### 7.3 Tips screen

Static content in Hebrew (English symbols), stored in `js/tips.js`. Four cards:

1. **Decision chart: which table to open.** An inline SVG flowchart: substance → is T or p given? → open the saturation table at that value → compare the second property with the f and g values → mixture (stay in the saturation table, compute x), superheated (go to the superheated table), compressed (compressed table or the approximation).
2. **Inside or outside the dome.** How to compare v with v\_f and v\_g; T and p are dependent inside the dome, so they alone cannot fix the state; a worked example: water, p = 200 kPa, v = 0.35 m³/kg → mixture, x ≈ 0.394.
3. **Linear interpolation.** The formula, the self-check (x = x₁ must return y₁), the common mistake of multiplying the slope by x instead of (x − x₁), and a worked example: p\_sat of water at 22 °C ≈ 2.671 kPa.
4. **Booklet traps.** Units change between tables (kPa, MPa, bar); NH₃ and R-12 have no pressure table; R-134a prints v\_f × 10³; always work with specific (per-kg) properties, v = V/m; the misprinted cells from section 4.

### 7.4 Phone-first design

The app is used mainly on an iPhone. Design for 390 px first, then let it widen on desktop.

- Bottom tab bar for the three screens (thumb reach), fixed, respecting the iPhone safe areas (`env(safe-area-inset-*)`).
- Touch targets at least 44 px; body text at least 16 px (prevents Safari zoom on input focus).
- Number fields use `inputmode="decimal"` so the numeric keypad opens.
- Results table fits the width without sideways scrolling; long reference steps wrap.

### 7.5 Light and dark mode

No separate settings screen. A sun/moon toggle in the header. Default follows the phone's setting (`prefers-color-scheme`); a manual choice is saved in `localStorage`. Colours are CSS variables, so both themes share one stylesheet.

### 7.6 Guided tour

A "?" button in the header starts a short step-by-step tour, written in-house (no library). It also starts once automatically on the first visit. Each step dims the page, highlights one element and shows a Hebrew bubble with "הבא" / "דלג". Steps:

1. What the app is: a steam-table calculator for Thermo 1 homework, built for course 00360714; in the exam, use the booklet.
2. Substance picker.
3. Pair picker and the two inputs (including the V and m helper).
4. The result card and the "מאיפה?" links.
5. The booklet reference tab.
6. The tips tab.
7. Theme toggle and history.
8. Sources: all values come from the course booklet *Thermodynamics – Tables and Diagrams*; corrected cells are marked.

### 7.7 Home-screen icon and offline use (PWA)

- `manifest.webmanifest` with name "טבלאות קיטור", short name "קיטור", `display: standalone`, theme colours for both modes.
- Icon: an original simple design drawn as SVG in the repo (a saturation dome with a small steam wisp), exported to PNG at 180 (`apple-touch-icon`), 192 and 512, plus a maskable 512.
- A small service worker caches every file, so the app opens and calculates with no internet.

### 7.8 Small extras

- History: the last 10 calculations, saved in `localStorage`, tap to reload one.
- Copy button on the result card: copies the state as plain text for homework.

## 8. Testing

All tests run with plain Node (`node tests/engine.test.js`), no framework needed.

- **Round trip:** for every printed row, give two of its properties to `solve()` and expect the other columns back within the printed precision.
- **Saturation consistency:** in every row, y\_f + y\_fg = y\_g for u, h, s, and h ≈ u + p·v. A failing row means a parse error or a misprint; add it to `corrections.json`.
- **Monotonicity:** T and v increase down every superheated block; p\_sat increases with T\_sat. A break points at a bad row.
- **Hand-solved cases** (must match):
  - Water, p = 200 kPa, v = 0.35 m³/kg → mixture, T = 120.23 °C, x ≈ 0.394.
  - Water, p = 2 MPa, T = 500 °C → superheated, v = 0.17568 m³/kg, A.1.3 page –4–.
  - Water, p = 300 kPa, T = 250 °C → superheated, v = 0.7964 m³/kg.
  - Water, T = 22 °C, x = 0 → p ≈ 2.671 kPa (interpolated in A.1.1).
  - Water, v = 0.6 m³/kg, u = u at (140 °C, v = 0.3 m³/kg) → free expansion case, must find a state.
- **Booklet coverage:** every table and every block appears at least once in a test.

## 9. Build steps for Claude Code

Work in this order. After each step: run the tests, open the site locally, check it at 390 px width, then commit.

1. **Set up the repo.** Create the folder structure from section 3, a `.gitignore`, and a README with the project goal and the live link placeholder.
2. **Parse the PDF.** Write `tools/parse_pdf.py` using `pdftotext -layout` (pages 2–20) and convert every table to JSON in `data/`. Handle the traps in section 4 (units, ×10³, lost minus signs, wrapped lines).
3. **Check the data.** Write `tools/check_data.js` with the consistency and monotonicity checks. Fix or record every flagged cell in `data/corrections.json`.
4. **Engine for water.** units, data loading, lookup, phase and solve, for all eight input pairs. Pass the hand-solved tests.
5. **Engine for NH₃, R-12, R-134a.** Unit handling and the inverse lookup for the missing pressure tables.
6. **Calculator screen.** RTL layout, inputs, result table, T–v sketch.
7. **Booklet reference screen.** Render traces as numbered Hebrew steps with substituted formulas.
8. **Tips screen.** The four cards from 7.3.
9. **Polish.** Mobile layout, clear error messages, a short footer: "לשימוש בשיעורי בית בלבד — במבחן עובדים עם החוברת".
10. **Publish.** Push to a public GitHub repo, enable GitHub Pages (Settings → Pages → Deploy from a branch → main / root), wait for the site, open it and test one case on a phone.

If time is short, the minimum for submission is steps 1–4 and 6 for water, published. The rest can follow in later commits.

## 10. Submission (Moodle, course 00360714)

Deadline: Thursday 19 November 2026, 00:00 (end of Wednesday night).

Submit two links:

1. The live site: `https://<user>.github.io/<repo>/`
2. The repo: `https://github.com/<user>/<repo>`

Before submitting, open the live link in a private window and run one calculation to confirm it works.
