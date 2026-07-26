# Fair Value Evaluator

Modified-Graham intrinsic value tool with a provider-backed scorecard, explicit operator overrides, and bulk ticker intake. Yahoo and Finnhub market data stay behind the Express API. The app deploys to Fly.io as a single Node container.

```
IV = EPS × (P/E_no_growth + g × Growth%) × (Avg_AAA_Yield / Bond_Yield)
```

## Local dev and test commands

Use these commands from the project root. They assume your `.env` file contains `FINNHUB_API_KEY=...` (free key from https://finnhub.io/dashboard; without it `/api/quotes` falls back to Yahoo-only fundamentals).

### Install dependencies

```bash
npm install
```

### Run the app for development

This starts Vite on `http://localhost:5173` and Express on `http://localhost:8080`. Vite proxies `/api/*` to Express.

```bash
set -a
source .env
set +a
npm run dev
```

Open the app:

```bash
open http://localhost:5173
```

### Run a production-like local test

This builds the frontend and serves the built SPA from Express on `http://localhost:8080`.

```bash
set -a
source .env
set +a
npm run build
npm run start
```

In a second terminal window, run these smoke checks:

```bash
curl -sf http://localhost:8080/ | grep -i "<html"

curl -sf http://localhost:8080/api/data

curl -sf -X POST http://localhost:8080/api/prices \
  -H "content-type: application/json" \
  -d '{"tickers":["AAPL","MSFT"]}'

curl -sf -X POST http://localhost:8080/api/quotes \
  -H "content-type: application/json" \
  -d '{"tickers":["AAPL"]}'
```

### Run the Docker container locally

This is the closest local match to Fly.io. The bind mount simulates the Fly volume at `/data`.

```bash
docker build -t kapman-fair-value-tool .

docker run --rm -p 8080:8080 \
  --env-file .env \
  -v "$PWD/.docker-data:/data" \
  kapman-fair-value-tool
```

In a second terminal window, run:

```bash
curl -sf http://localhost:8080/ | grep -i "<html"
curl -sf http://localhost:8080/api/data
```

### Reset local SQLite data

Development mode stores SQLite data in `.data/fair-value.sqlite`. Docker mode with the command above stores SQLite data in `.docker-data/fair-value.sqlite`.

```bash
rm -rf .data .docker-data
```

## Stack
- React + Vite (frontend, Tailwind for styling)
- Express (serves built SPA + SQLite-backed REST API + `/api/prices` price refresh + `/api/quotes` Finnhub/Yahoo fundamentals)
- SQLite via `better-sqlite3` for persisted watchlist and formula variables
- Fly.io (single shared-CPU 256MB machine)

## Local development

```bash
npm install
set -a
source .env
set +a
npm run dev
```

This runs Vite (port 5173) and Express (port 8080) concurrently. The Vite dev server proxies `/api/*` to Express.
In local development, SQLite data is stored in `.data/fair-value.sqlite`. Set `SQLITE_DB_PATH=/absolute/path/to/file.sqlite` if you need a different database file.

Visit http://localhost:5173

## Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main

# Create the empty repo first on github.com (no README/license)
git remote add origin git@github.com:YOUR_USERNAME/fair-value-evaluator.git
git push -u origin main
```

## Deploy to Fly.io

One-time setup:

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
brew install flyctl                     # macOS
# or: curl -L https://fly.io/install.sh | sh

fly auth signup                         # or: fly auth login
```

Launch the app (first deploy):

```bash
fly launch --no-deploy --copy-config --name fair-value-evaluator
fly volumes create fair_value_data --region iad --size 1 --app fair-value-evaluator
fly secrets set FINNHUB_API_KEY=your_finnhub_key_here
fly deploy
```

`fly launch` will detect the existing `fly.toml` and `Dockerfile` and skip generating new ones. The `--copy-config` flag tells it to reuse them.

Subsequent deploys (after editing code):

```bash
git push                                # push to GitHub
fly deploy                              # deploy to Fly
```

Open the live app:

```bash
fly open
```

## Editing workflow

1. Clone the repo on any machine: `git clone git@github.com:YOUR_USERNAME/fair-value-evaluator.git`
2. Edit `src/App.jsx` (the main component) or `server/index.js` (the API)
3. Test locally: `npm run dev`
4. Push: `git push`
5. Deploy: `fly deploy`

If you want auto-deploy on every `git push`, add a GitHub Action — Fly publishes a starter at https://fly.io/docs/launch/continuous-deployment-with-github-actions/

## Project structure

```
fair-value-evaluator/
├── src/
│   ├── App.jsx          # Main React component
│   ├── lib/
│   │   └── defaultData.js # Shared seed stocks + default formula globals
│   ├── main.jsx         # React entry
│   └── index.css        # Tailwind + global styles
├── server/
│   └── index.js         # Express server + market-data endpoints
├── index.html           # Vite HTML template
├── package.json
├── vite.config.js       # Vite + dev API proxy
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile           # Multi-stage build
├── fly.toml             # Fly.io config
└── .gitignore
```

## Data persistence

User edits (tickers, scores, growth rates, current prices, update dates, and formula globals) are saved to a server-side SQLite database through REST endpoints:

- `GET /api/data`
- `POST /api/stocks`
- `PUT /api/stocks/:ticker`
- `DELETE /api/stocks/:ticker`
- `PUT /api/globals`
- `PUT /api/factors/:ticker`
- `POST /api/import/tickers`
- `POST /api/import/apply`

The database is initialized on server startup. Empty tables are seeded from `src/lib/defaultData.js`.

In production, the SQLite file lives at `/data/fair-value.sqlite`. Provision the Fly volume before deploying:

```bash
fly volumes create fair_value_data --region iad --size 1 --app fair-value-evaluator
```

The `fly.toml` mount maps that volume to `/data`, so the watchlist survives app restarts and deployments.

## Market data sources

- **Prices** (`/api/prices`): Yahoo Finance via `yahoo-finance2` (no key required).
- **Fundamentals** (`/api/quotes`): Finnhub free tier is the primary source (key required, 60 calls/min, US symbols); Yahoo back-fills ownership, short interest, cash/debt/FCF levels, and forward EPS. Finnhub values are unit-normalized to fractions/absolute dollars to match the rubric.

### EPS, valuation basis, and refresh behavior

The Intrinsic Value view distinguishes three earnings fields:

- **GAAP TTM EPS** — Yahoo traded-share price divided by Finnhub trailing P/E,
  with Yahoo trailing EPS as the fallback.
- **Adjusted TTM EPS** — the sum of the latest four valid, distinct Finnhub
  `/stock/earnings` `actual` values. It is unavailable rather than estimated
  if a complete, usable four-quarter set cannot be established.
- **Valuation TTM EPS** — the earnings input used by the intrinsic-value formula.

Valuation TTM EPS has an explicit Reported, Adjusted, or Operator basis.
Selecting a source copies its current value and records that basis. A pin is
independent of the basis: it freezes the copied valuation value until unpinned,
while provider refreshes continue updating both source EPS fields. Editing the
valuation value directly records Operator and pins it. The formula always uses
Valuation TTM EPS, never a display-only GAAP or adjusted value.

The refresh path is intentionally budgeted for Finnhub's free tier: it requests
the per-symbol `/stock/metric` and `/stock/earnings` data needed for
fundamentals/quarterly EPS, while Yahoo supplies the price. Refreshes should be
run deliberately for the selected watchlist rather than treated as streaming
market data.

`/api/quotes` atomically persists eligible price/EPS updates and provider
factors, recomputes every unpinned category, and returns the authoritative
saved rows in the same response.

## Ticker import and data ownership

The **Ticker Import** tab accepts comma-, space-, or newline-separated symbols.
Preview uses the live providers, skips symbols already on the watchlist, and
shows missing inputs before apply. Apply snapshots the current model, then adds
the selected batch transactionally.

New imported rows start unpinned with live model scores. Forward growth starts
at a conservative 0% and is flagged for operator review; trailing provider
growth is not silently substituted for a long-term forecast. Existing rows and
their EPS/category pins are never changed by ticker import.

- Providers own live prices, eligible unpinned GAAP TTM EPS, and quantitative
  factor values.
- The operator owns forward growth, qualitative judgments, manual factor
  overrides, pinned EPS, and curated category scores.

Get a Finnhub key: https://finnhub.io/dashboard (the key is shared with kapman-finnhub-mcp-server — both draw from the same 60 calls/min budget).

## Cost on Fly.io

A single shared-cpu-1x@256MB machine with `auto_stop_machines = "stop"` costs roughly **$0–$2/mo** for personal use — the machine sleeps when idle and cold-starts on first request (~2s).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Fundamentals mostly null | `FINNHUB_API_KEY` not set (Yahoo fallback also failing). Run `fly secrets set FINNHUB_API_KEY=...` |
| `Refresh failed: HTTP 429` | Finnhub free-tier rate limit (60 calls/min). Wait 60s. |
| App won't load after deploy | `fly logs` to see startup errors |
| Build fails on Fly | Check `fly logs` during `fly deploy`; usually a Node version mismatch |

## Disclaimer

Not financial advice. Intrinsic value calculations, scorecards, valuation
bases, and allocation labels are screening heuristics, not recommendations or
buy/sell signals. They can be incomplete, stale, or wrong and do not account
for every relevant factor, including debt, capital structure, sector dynamics,
taxes, liquidity, or macro conditions. Verify source data and use independent
judgment before making any financial decision.
