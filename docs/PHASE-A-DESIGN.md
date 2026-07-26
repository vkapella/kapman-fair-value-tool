# Phase A — maintainable model: persisted factors, category tabs, sheet import

Design of record for issue #29. Written before implementation; update it when
reality diverges.

## The problem this solves

Three separate complaints, one root cause.

1. *"I'm still not seeing the moat / execution risk … where can I maintain
   these values?"* — the rubric's constituent fields exist only inside a modal
   whose ⓘ trigger is `opacity-0` until hover, and **nothing in that modal is
   saved except the final applied number.** Moat type, management quality,
   capital-allocation judgment: all evaporate when the modal closes.
2. *"I want these values filled automatically where data sources allow."* — the
   quantitative half already fetches from Finnhub/Yahoo, but the result is
   never persisted, so every reopen re-fetches and every reload forgets
   (this is also why Forward P/E and Forward EPS render as `—` on a cold load).
3. *"The import should let me create new tickers that exist in the sheet."* —
   the CLI auto-adds only sheet names scoring ≥ 75. The other ~87 workbook
   tickers are unreachable without hand-entry.

The fix is one coherent change: give the constituent model a persistent home,
derive scores from it, and let the workbook feed it.

## Data model

Two new tables plus one column. Values are stored as TEXT and coerced in JS —
SQLite is dynamically typed and a few quant fields (`sector`, `industry`) are
genuinely text.

```sql
stock_factors(ticker, factor_key, category, kind,
              manual_value, fetched_value, fetched_at, updated)   -- PK (ticker, factor_key)
fundamentals_cache(ticker, fetched_at, data)                      -- JSON payload per ticker
stocks.pinned_categories TEXT NOT NULL DEFAULT ''                 -- comma-separated
```

`manual_value` and `fetched_value` are deliberately **separate columns**. A
refresh writes only `fetched_value`, so it can never erase an operator
override — the same principle as `eps_pinned`, applied to every factor.

Factor keys are derived by walking `RUBRIC_DEF`, never hard-coded, so adding a
rubric field automatically makes it storable. `pctIV` is the one exception: it
is computed from price ÷ IV at scoring time and is not stored.

## Score authority: computed, overridable

The five score columns on `stocks` remain the **effective score** — the number
that snapshots, allocation signals, the stats bar, and the buy-zone count all
read. Nothing downstream needs to learn a new concept.

- Category **not** in `pinned_categories` → server recomputes from factors and
  writes the result into the column.
- Category **in** `pinned_categories` → the operator's number stands, untouched.
  The computed value is still calculated and shown alongside, so drift is
  visible without being applied.

Sheet-imported scores land pinned, because Brandon's workbook gives final
judgment numbers with no constituent breakdown to import. Releasing a category
to the model is then a per-ticker, per-category decision the operator makes as
they fill in their own judgments.

Existing rows migrate with all five categories pinned, so deploying this
changes nobody's numbers.

## API contract

```
GET  /api/data
  stocks[]   … existing fields + pinnedCategories: string[]
  globals    … unchanged
  factors    { TICKER: { factorKey: { manual, fetched, fetchedAt } } }
  computed   { TICKER: { valuation, growthScore, moat, executionRisk, economy } }

PUT  /api/factors/:ticker   { factorKey: value | null }   null clears the override
     → { factors, computed, stock }

PUT  /api/stocks/:ticker    … may include pinnedCategories: string[]

POST /api/quotes            response shape unchanged (the SPA depends on it);
                            side effects: fill fundamentals_cache + factor
                            fetched values, recompute unpinned scores

POST /api/import/preview    multipart .xlsx → { updates[], adds[], skips[] }
POST /api/import/apply      { updates[], addTickers[] } → transactional, snapshots first
```

## UI

### Category tabs

Five tabs after the three existing ones, each a **tickers × factors grid** for
one category. Per cell:

- fetched provider value, dimmed
- operator override, bright, when set — click any cell to edit, with a visible
  clear-override affordance
- judgment fields render as the rubric's `select` options and persist on change

Per row: the computed score and the effective score side by side, with a pin
toggle. Pinned rows read "yours: 18 · model: 15"; unpinned rows show one number
that moves as factors change.

Grids scroll horizontally (Economy has six quantitative plus three judgment
columns) inside their own container — the page body never scrolls sideways.

### Import panel

File-pick or drag a `.xlsx` → the server parses and returns the same diff the
CLI dry-run prints → the operator reviews it as a table → **Apply**.

The adds section lists **every workbook ticker not currently tracked** with its
score, EPS, and % of IV, each with a checkbox. Names scoring ≥ 75 are
pre-checked; everything else is one click away. This is the requirement the CLI
could not satisfy.

Apply is transactional and takes a snapshot first, so any import is
recoverable from `/api/snapshots`.

## Field precedence: who owns what

Three sources write to a ticker, and each owns a different slice. Confusing
them is how curated values get silently destroyed.

| Source | Owns | Never touches |
|---|---|---|
| **IWB workbook** | TTM EPS, growth %, the five category scores | quantitative factors, judgment factors |
| **Refresh (providers)** | quantitative factor `fetched_value` | judgment factors, scores, pinned EPS |
| **Operator** | anything — judgment factors are *exclusively* theirs | — |

**New tickers:** the workbook is the default state. Created fully pinned with
Brandon's scores, EPS and growth; refresh then maintains their quantitative
factors. Judgment factors start unassessed and stay that way until the
operator fills them in — nothing infers them.

**Judgment fields need an explicit "not assessed" state.** Today the worksheet
pre-selects the middle option (`ScoringWorksheet.jsx`: `Math.floor((len-1)/2)`),
which is harmless while nothing persists but becomes a lie the moment it does —
a saved "Average" the operator never actually chose, contributing real weight
to the score. Add `— not assessed —` as the default option, mapping to `null`
so `suggestScore` falls through to its neutral weight, and surface a per-row
completeness indicator. "Manual assessment required" is only enforceable if
unassessed is visibly distinct from assessed.

## Re-importing a newer workbook: three-way merge

Brandon revises the sheet continuously, and the operator edits scores in the
app between imports. A straight overwrite would silently discard the
operator's work; skipping changed rows would silently discard Brandon's. The
answer is the one version control already settled on — a **three-way merge**.

Record what each import wrote, per ticker per field:

```sql
CREATE TABLE import_baseline (
  ticker TEXT NOT NULL,
  field  TEXT NOT NULL,        -- ttmEPS | growth | valuation | growthScore | moat | executionRisk | economy
  value  TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  source TEXT,                 -- workbook filename, e.g. "260726 IWB STOCK SHEET 4.0.xlsx"
  PRIMARY KEY (ticker, field)
);
```

That baseline is the common ancestor. For every field the preview then
compares three values — `base` (last import), `mine` (current app), `theirs`
(new workbook) — and classifies:

| base vs mine | base vs theirs | outcome |
|---|---|---|
| same | same | **unchanged** — no-op, not shown |
| same | differs | **clean update** — auto-applied, listed for information |
| differs | same | **mine stands** — Brandon didn't revisit it; no action |
| differs | differs | **conflict** — requires an explicit decision |

Only the fourth row demands attention, and in practice it will be a handful of
fields rather than a wall. Each conflict is presented with all three values and
their dates:

> **MU · moat** — you set **16** on 7/26 · last import **15** · Brandon now **17**
> `[ keep mine ]  [ take Brandon's ]`

Default is **keep mine**: the operator's deliberate edit outranks an
unreviewed bulk update. Nothing overwrites a divergent field without a click.

**Released categories are treated as a decision, not a gap.** If the operator
unpinned a category to let their own model drive it, an incoming workbook
score does not silently re-pin it — that surfaces as its own prompt
("you released `moat` to the model; Brandon now says 17 — re-pin?").

**Bootstrapping.** Today's import (issue #28) predates the baseline table, so
seed it from the workbook that produced it —
`data/sheets/260726 IWB STOCK SHEET 4.0.xlsx` — which is safe precisely
because that import was verified idempotent. Without the seed, the next
upload would flag every field the operator has touched since as a false
conflict.

## Also in scope

- **Economy** stays per-row — the rubric genuinely scores beta, sector, and
  regulatory risk per ticker — but Settings gains a macro control that writes
  one value to every row, matching how the workbook's Big 4 tab models it
  (single market-level number, currently 22).
- **Dead rubric fields:** `moatDurability`, `growthFundingQuality`, and
  `institutionsPercentHeld` are defined in `RUBRIC_DEF` and rendered in the
  worksheet but carry **zero weight** in `suggestScore`. Give them real weights
  or remove them; silently-ignored inputs are worse than absent ones.
- **Forward EPS** persists as a side effect of `fundamentals_cache`.
- The scoring worksheet's ⓘ trigger becomes always visible.
- Snapshot rows carry `factors` + `pinnedCategories`; `schemaVersion` → 2.

## Why this ordering

The sheet import ran first (issue #28) so Phase A builds on corrected data:
EPS on Brandon's basis, honest dates, economy 22, and the six missing ≥ 75
names already present. Had we built the schema first, every imported score
would have needed a second migration into the pin model.
