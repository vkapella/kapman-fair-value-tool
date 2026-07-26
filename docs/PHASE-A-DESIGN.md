# Phase A — persisted factors and provider-backed ticker intake

This is the current design of record for the maintainable scoring model.

## Data model

`stocks` contains the effective category scores and the valuation inputs.
`stock_factors` stores provider and operator factor values separately.
`fundamentals_cache` retains the most recent provider payload. Snapshot tables
hold append-only model captures.

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
  still computed and shown for comparison.
- `curated_scores` preserves the operator's number across unpin/re-pin cycles.
- `eps_pinned` independently protects operator-curated EPS while allowing live
  price refreshes.

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

Category grids expose fetched and manual values, model and effective scores,
assessment coverage, and category pins. The Intrinsic Value tab exposes the
separate EPS pin. Ticker Import is an addition workflow only: it cannot update
or unpin existing rows.
