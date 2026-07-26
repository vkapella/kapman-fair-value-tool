# Archived handoff — app watchlist vs. IWB Stock Sheet 4.0

> Historical record only. The application no longer consumes this workbook;
> providers and operator inputs are the current data owners.

> **Status 7/26/26 (local session):** Prod read via `/api/data` — refresh HAS
> been run (all 16 rows stamped 7/26/26, MU self-corrected to 44.69), and QQQ
> (27.94) / VOO (31.24) are frozen at April EPS exactly as predicted in
> finding 1. Fixes 1 and 2 are implemented on this branch: refresh stamps
> `updated` only when EPS actually refreshed, fund-type tickers (Yahoo
> `quoteType` ETF/MUTUALFUND, now exposed by `/api/quotes`) are curated-EPS
> like `growth`, price-only rows are named in the refresh message, and a
> "curated" badge shows in the Intrinsic Value table. Verified end-to-end
> against live providers. Remaining: items 3 (sheet import — also fixes prod's
> already-lying QQQ/VOO dates) and 4 (promote `economy` to a global).

> **Status 7/26/26 (later):** Deployed. Snapshot feature added (POST
> /api/snapshot + GET /api/snapshots[/:id], header button copies JSON for the
> KB). Item 3 executed: fresh sheet export lives in `data/sheets/` (git-ignored
> — public repo), `scripts/import-sheet.py` syncs EPS/growth/scores/economy/
> dates from it and pins imported EPS via the new `eps_pinned` column so
> refresh can never overwrite sheet-basis EPS (the BRK.B finding: Finnhub
> derives 37.22 GAAP-ish vs Brandon's 21.41 operating basis — a 60%-of-IV
> mirage). Sheet's economy=22 everywhere, so item 4's cheap form ships with the
> import; promoting economy to a true global remains open, folded into the
> Phase A redesign (persisted constituent fields, category tabs, computed-but-
> overridable scores).

Context for continuing this work in a local Claude Code session.
Investigation was done in a cloud session that could not reach prod
(`kapman-fair-value-tool.fly.dev` is not on that environment's egress
allowlist). Everything below is verified from source plus live market data.

## What was compared

- **App side:** the seeded watchlist in `src/lib/defaultData.js` (16 tickers,
  dated 4/24–4/29/26). This is what prod's SQLite was seeded with on 5/3/26
  and what it still serves unless rows were added or deleted in the UI.
  **Prod's actual DB was never read — see "Open item" below.**
- **Sheet side:** IWB Stock Sheet 4.0, Main Score Card tab, dated
  7/14–7/23/26, 109 tickers. Local copy: `IWB_STOCK_SHEET_4.0.xlsx`.

Sheet freshness confirmed: its QQQ ($684.23) and MU ($920.95) prices matched
live Finnhub quotes exactly at time of analysis.

## Findings

### 1. QQQ and VOO can never refresh their EPS (the real bug)

`server/lib/finnhub.js:68` derives EPS as `currentPrice / metric.peTTM`.
Finnhub's `/stock/metric` does not cover ETFs — a live call for QQQ returns
only price-return statistics (`52WeekHigh`, `beta`, `13WeekPriceReturnDaily`),
with **no `peTTM` and no `epsTTM`**. So `trailingEps` resolves to `null`.
Yahoo's `defaultKeyStatistics.trailingEps` is also null for ETFs, so the
fallback in `server/index.js` saves nothing either.

In `src/App.jsx:285`:

```js
if (quote.trailingEps != null) patch.ttmEPS = quote.trailingEps;
```

This never fires for QQQ or VOO. But the two lines above it *do* fire —
`patch.currentPrice` and `patch.updated = today`. Net effect: every refresh
stamps the row with a live price and today's date while silently leaving
`ttmEPS` frozen. The row advertises itself as current while its valuation
denominator is months stale, and the gap widens every time the index earns.

**Impact on QQQ** — at $684.23:

| | TTM EPS | IV | % of IV | verdict |
|---|---|---|---|---|
| app | 27.94 (April) | $614.68 | 111% | overvalued, excluded from buy zone |
| sheet | 31.18 (7/23) | $701.55 | 98% | under IV; sheet flags buy + sell puts |

111% crosses the `pctIV >= 110` line in the `overvalued` stat and fails
`buyZone` (`score >= 75 && pctIV < 100`) despite scoring 82. The tool inverts
the sheet's signal. VOO has the same defect (109% vs 99%).

### 2. MU is the largest single divergence

Sheet EPS 45.12 vs app 21.92 — the post-earnings revision never landed.
IV $1,443.84 vs $591.84. At $920.95 the app reads **156% of IV** (deeply
overvalued) against the sheet's **64%** (one of its cheapest names, score 81).
Unlike QQQ this one *would* self-correct on a refresh — MU has a real `peTTM`.

### 3. Nothing has been refreshed since April

Every app row is dated 4/24–4/29; the sheet is 7/14–7/23. This alone accounts
for the NVDA, TSM, BAC, SCHW, ASML and BRK.B gaps.

### 4. Even a successful refresh will not match the sheet

Finnhub gives NVDA `peTTM 31.36` → derived EPS ≈ 6.53. The sheet says 5.81 —
12% apart. The sheet curates TTM EPS on a different basis than Finnhub's
GAAP TTM. Refresh will never reproduce it for any ticker.

### 5. `economy` is modeled wrong

It is a per-row column in `stocks` but a single macro input in the sheet,
which moved every row to 22. All app rows are 21, so every app score is one
point low before any other difference.

### 6. Coverage gap

App carries 16 of the sheet's 109. All 16 exist in the sheet — no app-only
rows. Sheet names scoring >= 75 that the app lacks: GOOG (80), JPM (78),
AVGO (77), AMZN (77), SGOV (77), CRM (76), ORCL (75).

Note: SGOV and BLV carry a score but no IV (cash/bond funds, no EPS). The
schema requires a non-null `ttmEPS`, so adding them needs a nullable path.

## Proposed work, in priority order

1. **Stop stamping `updated` when EPS did not refresh** — or badge such rows
   "price-only". The silent staleness is what makes QQQ dangerous rather than
   merely wrong. Smallest change, biggest correctness win.
2. **Treat `ttmEPS` as a curated field for ETFs**, the same way `growth`
   already is at `src/App.jsx:285`.
3. **Import the sheet** — sync EPS/growth/scores for the 16, and add the seven
   missing names above.
4. **Promote `economy` to a global** alongside `peNoGrowth` / `bondYield`.

Items 1 and 2 are the actual bug fix and do not depend on prod state.

## Open item — read prod before item 3

The comparison above assumes prod still matches the April seed. Confirm with:

```bash
curl -s https://kapman-fair-value-tool.fly.dev/api/data | python3 -m json.tool
```

If EPS values differ from `src/lib/defaultData.js`, refresh has been run and
the stock rows are newer than assumed — but QQQ and VOO will still be frozen
at 27.94 and 31.24, which is the whole point of finding #1.

## Reproducing the ETF gap locally

```bash
set -a; source .env; set +a
npm run build && npm run start

# QQQ returns trailingEps: null; MSFT returns a real number.
curl -s -X POST http://localhost:8080/api/quotes \
  -H 'content-type: application/json' \
  -d '{"tickers":["QQQ","VOO","MSFT"]}' | python3 -m json.tool
```

This needs `FINNHUB_API_KEY` and outbound access to Finnhub and Yahoo —
neither was available in the cloud session, which is why this was verified
against the Finnhub API directly rather than through the app.
