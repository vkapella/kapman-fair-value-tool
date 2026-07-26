# Phase A — persisted factors and provider-backed ticker intake

This is the current design of record for the maintainable scoring model.

## Data model

`stocks` contains the effective category scores and the valuation inputs.
`stock_factors` stores provider and operator factor values separately.
`fundamentals_cache` retains the most recent provider payload. Snapshot tables
hold append-only model captures.

The valuation record separates reported **GAAP TTM EPS**, derived **Adjusted
TTM EPS**, and effective **Valuation TTM EPS**. Adjusted TTM EPS is the sum of
the latest four valid, distinct quarterly provider EPS observations. Duplicate
periods, missing values, or malformed inputs leave it unavailable. It is never
filled with a partial sum.

```sql
stock_factors(ticker, factor_key, category, kind,
              manual_value, fetched_value, fetched_at, updated)
fundamentals_cache(ticker, fetched_at, data)
stocks.eps_pinned
stocks.pinned_categories
stocks.curated_scores
```

Provider refreshes write only `fetched_value`; they never erase
`manual_value`. `pctIV` is derived from current price and intrinsic value rather
than stored as a factor.

## Score authority

The five category columns on `stocks` are the effective values used by
snapshots, allocation signals, the stats bar, and screening.

- An unpinned category is recomputed from current provider factors, operator
  judgments, and formula globals.
- A pinned category displays the operator's retained value. The model value is
  still computed and is shown beside the effective value only when it differs.
- `curated_scores` preserves the operator's number across unpin/re-pin cycles.
- `eps_pinned` independently protects operator-curated EPS while allowing live
  price refreshes.

### Valuation EPS basis and pin

`valuationEpsBasis` records Reported, Adjusted, or Operator as the source of
Valuation TTM EPS. Changing the basis selects the corresponding available
source value. `epsPinned` is independent of basis and freezes the copied
valuation value; refreshes may update the GAAP and adjusted source fields but
must not overwrite that pinned effective value. Editing Valuation TTM EPS
directly records Operator and pins it. Unpinning resumes the selected source.
`calcIV` and every downstream percentage/signal calculation consume Valuation
TTM EPS only.

Existing rows keep their current EPS and category pins across migrations.

## API contract

```text
GET  /api/data
  → { stocks, globals, factors, computed }

PUT  /api/factors/:ticker
  { factorKey: value | null }
  → { factors, computed, stock }

PUT  /api/stocks/:ticker
  → { stock, computed }

PUT  /api/globals
  → { globals, stocks, computed }

POST /api/quotes
  { tickers: string[] }
  → { quotes, stocks, factors, computed }

POST /api/import/tickers
  { tickers: string[] }
  → { source, meta, adds, skips }

POST /api/import/apply
  { addTickers: string[] }
  → { snapshotRunId, added, stocks, factors, computed, errors }
```

Quote refresh is atomic: price, eligible unpinned EPS, provider factors, and
effective scores are saved in one transaction and returned from that same
state.

The quote refresh performs the Finnhub `/stock/metric` and `/stock/earnings`
requests required for fundamentals and quarterly EPS; Yahoo remains the price
source. This keeps the request shape within the free-tier budget and avoids
browser-direct provider requests.

## Ticker intake

The operator pastes comma-, space-, or newline-separated symbols. The server
normalizes and deduplicates them, skips existing rows, and previews live
provider data.

New rows:

- use provider price and TTM EPS where available;
- begin with `growth = 0`, because trailing earnings growth is not a defensible
  substitute for the operator's forward 7–10 year assumption;
- seed the two provider-unavailable qualitative defaults conservatively;
- start with EPS and all categories unpinned;
- immediately persist provider factors and calculate live category scores;
- visibly flag growth and category judgments for operator review.

Apply takes a snapshot first and inserts the selected batch transactionally.

## Field precedence

Providers and the operator are the only owners.

| Source | Owns | Never touches |
|---|---|---|
| **Providers** | live price, unpinned GAAP TTM EPS, quantitative factor `fetched_value` | pinned EPS, manual overrides, curated scores, forward growth |
| **Operator** | forward growth, manual factor overrides, category pin state, curated EPS and scores | provider history/cache |

Pinning changes which value is effective; it does not change the underlying
ownership rule.

## UI

Main Score Card is a read-only rollup. Category grids are the single owners of
category score inputs and expose fetched/manual factors, one effective Category
Score, assessment coverage, and the category pin. Every displayed category
factor maps to a declared score weight. Context-only provider fields such as
sector and industry remain cached but are not presented as if they affected a
score.

Intrinsic Value owns EPS-source diagnostics, the operator's long-term IV
growth assumption, and the separate EPS pin. Provider `TTM EPS Growth YoY`
belongs to Growth and is distinct from that forward-looking assumption. P/E
ratios belong to Valuation. Ticker Import is an addition workflow only: it
cannot update or unpin existing rows.

Navigation uses two levels. The top level contains Main Score Card, Docs, and
Ticker Import. Main Score Card exposes the second-level workflow and
score-maintenance tabs: Main Score Card, Intrinsic Value, Allocation Signals,
Valuation, Growth, Moat, Execution Risk, and Economy.
