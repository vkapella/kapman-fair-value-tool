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
