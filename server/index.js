import Database from "better-sqlite3";
import express from "express";
import fs from "fs";
import path from "path";
import YahooFinance from "yahoo-finance2";
import { fileURLToPath } from "url";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "../src/lib/defaultData.js";
import { calcIV, calcPctIV, calcScore, allocationSignals } from "../src/lib/valuation.js";
import { fetchFundamentalsBatch, finnhubConfigured } from "./lib/finnhub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const defaultDbDir = process.env.NODE_ENV === "production" ? "/data" : path.join(__dirname, "..", ".data");
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(defaultDbDir, "fair-value.sqlite");

const STOCK_FIELDS = ["ticker", "ttmEPS", "growth", "currentPrice", "updated", "valuation", "growthScore", "moat", "executionRisk", "economy", "epsPinned"];
const STOCK_FIELD_SET = new Set(STOCK_FIELDS);
// epsPinned is optional everywhere (defaults to 0): operator/import curation
// flag, not part of the core row contract.
const REQUIRED_STOCK_FIELDS = STOCK_FIELDS.filter((field) => field !== "epsPinned");
const NUMERIC_STOCK_FIELDS = new Set(["ttmEPS", "growth", "currentPrice", "valuation", "growthScore", "moat", "executionRisk", "economy"]);
const GLOBAL_FIELDS = ["peNoGrowth", "g", "avgYieldAAA", "bondYield"];
const GLOBAL_FIELD_SET = new Set(GLOBAL_FIELDS);

const stockColumnByField = {
  ticker: "ticker",
  ttmEPS: "ttm_eps",
  growth: "growth",
  currentPrice: "current_price",
  updated: "updated",
  valuation: "valuation",
  growthScore: "growth_score",
  moat: "moat",
  executionRisk: "execution_risk",
  economy: "economy",
  epsPinned: "eps_pinned",
};

const globalColumnByField = {
  peNoGrowth: "pe_no_growth",
  g: "growth_multiplier",
  avgYieldAAA: "avg_yield_aaa",
  bondYield: "bond_yield",
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS stocks (
    ticker TEXT PRIMARY KEY,
    ttm_eps REAL NOT NULL,
    growth REAL NOT NULL,
    current_price REAL NOT NULL,
    updated TEXT NOT NULL,
    valuation REAL NOT NULL,
    growth_score REAL NOT NULL,
    moat REAL NOT NULL,
    execution_risk REAL NOT NULL,
    economy REAL NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS globals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pe_no_growth REAL NOT NULL,
    growth_multiplier REAL NOT NULL,
    avg_yield_aaa REAL NOT NULL,
    bond_yield REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshot_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taken_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    globals TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshot_rows (
    run_id INTEGER NOT NULL REFERENCES snapshot_runs(id),
    ticker TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (run_id, ticker)
  );
`);

// Migration: eps_pinned marks rows whose ttmEPS is operator/sheet-curated on a
// basis providers cannot reproduce (ETFs, BRK.B operating earnings). Refresh
// must never overwrite EPS on pinned rows.
if (!db.prepare("PRAGMA table_info(stocks)").all().some((c) => c.name === "eps_pinned")) {
  db.exec("ALTER TABLE stocks ADD COLUMN eps_pinned INTEGER NOT NULL DEFAULT 0");
}

const insertStock = db.prepare(`
  INSERT INTO stocks (
    ticker, ttm_eps, growth, current_price, updated, valuation,
    growth_score, moat, execution_risk, economy, eps_pinned, position
  ) VALUES (
    @ticker, @ttmEPS, @growth, @currentPrice, @updated, @valuation,
    @growthScore, @moat, @executionRisk, @economy, @epsPinned, @position
  )
`);

const seedDatabase = db.transaction(() => {
  const stockCount = db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count;
  if (stockCount === 0) {
    SEED_STOCKS.forEach((stock, index) => insertStock.run({ epsPinned: 0, ...stock, position: index }));
  }

  const globalCount = db.prepare("SELECT COUNT(*) AS count FROM globals").get().count;
  if (globalCount === 0) {
    db.prepare(`
      INSERT INTO globals (id, pe_no_growth, growth_multiplier, avg_yield_aaa, bond_yield)
      VALUES (1, @peNoGrowth, @g, @avgYieldAAA, @bondYield)
    `).run(DEFAULT_GLOBALS);
  }
});

seedDatabase();

app.use(express.json());
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "request body must be valid JSON" });
  }
  next(error);
});

function apiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTicker(value, field = "ticker") {
  if (typeof value !== "string") throw apiError(400, `${field} must be a string`);
  const ticker = value.trim().toUpperCase();
  if (!ticker) throw apiError(400, `${field} is required`);
  if (ticker.length > 24) throw apiError(400, `${field} must be 24 characters or fewer`);
  return ticker;
}

function normalizeFiniteNumber(value, field) {
  if (typeof value === "string" && value.trim() === "") throw apiError(400, `${field} must be a finite number`);
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw apiError(400, `${field} must be a finite number`);
  return number;
}

function assertKnownFields(payload, allowedFields) {
  const unknown = Object.keys(payload).filter((key) => !allowedFields.has(key));
  if (unknown.length > 0) throw apiError(400, `unknown field(s): ${unknown.join(", ")}`);
}

function normalizeStockPayload(payload, { partial = false } = {}) {
  if (!isPlainObject(payload)) throw apiError(400, "request body must be a JSON object");
  assertKnownFields(payload, STOCK_FIELD_SET);

  if (!partial) {
    const missing = REQUIRED_STOCK_FIELDS.filter((field) => payload[field] == null);
    if (missing.length > 0) throw apiError(400, `missing required field(s): ${missing.join(", ")}`);
  }

  const stock = {};
  if (payload.ticker != null) stock.ticker = normalizeTicker(payload.ticker);
  if (payload.updated != null) {
    if (typeof payload.updated !== "string") throw apiError(400, "updated must be a string");
    stock.updated = payload.updated.trim();
  }
  if (payload.epsPinned != null) {
    if (payload.epsPinned === true || payload.epsPinned === 1) stock.epsPinned = 1;
    else if (payload.epsPinned === false || payload.epsPinned === 0) stock.epsPinned = 0;
    else throw apiError(400, "epsPinned must be a boolean");
  }
  for (const field of NUMERIC_STOCK_FIELDS) {
    if (payload[field] != null) stock[field] = normalizeFiniteNumber(payload[field], field);
  }

  if (partial && Object.keys(stock).length === 0) throw apiError(400, "at least one stock field is required");
  return stock;
}

function normalizeGlobalsPayload(payload) {
  if (!isPlainObject(payload)) throw apiError(400, "request body must be a JSON object");
  assertKnownFields(payload, GLOBAL_FIELD_SET);

  const globals = {};
  for (const field of GLOBAL_FIELDS) {
    if (payload[field] != null) globals[field] = normalizeFiniteNumber(payload[field], field);
  }
  if (Object.keys(globals).length === 0) throw apiError(400, "at least one global field is required");
  return globals;
}

function stockFromRow(row) {
  return {
    ticker: row.ticker,
    ttmEPS: row.ttm_eps,
    growth: row.growth,
    currentPrice: row.current_price,
    updated: row.updated,
    valuation: row.valuation,
    growthScore: row.growth_score,
    moat: row.moat,
    executionRisk: row.execution_risk,
    economy: row.economy,
    epsPinned: Boolean(row.eps_pinned),
  };
}

function globalsFromRow(row) {
  return {
    peNoGrowth: row.pe_no_growth,
    g: row.growth_multiplier,
    avgYieldAAA: row.avg_yield_aaa,
    bondYield: row.bond_yield,
  };
}

function getStocks() {
  return db.prepare(`
    SELECT ticker, ttm_eps, growth, current_price, updated, valuation,
      growth_score, moat, execution_risk, economy, eps_pinned
    FROM stocks
    ORDER BY position ASC, ticker ASC
  `).all().map(stockFromRow);
}

function getGlobals() {
  const row = db.prepare(`
    SELECT pe_no_growth, growth_multiplier, avg_yield_aaa, bond_yield
    FROM globals
    WHERE id = 1
  `).get();
  return row ? globalsFromRow(row) : DEFAULT_GLOBALS;
}

function getStockByTicker(ticker) {
  const row = db.prepare(`
    SELECT ticker, ttm_eps, growth, current_price, updated, valuation,
      growth_score, moat, execution_risk, economy, eps_pinned
    FROM stocks
    WHERE ticker = ?
  `).get(ticker);
  return row ? stockFromRow(row) : null;
}

function handleRoute(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({ error: status === 500 ? "internal server error" : error.message });
    }
  };
}

function yahooSymbolFromTicker(ticker) {
  return ticker.replace(/\./g, "-");
}

function emptyFundamentals() {
  return {
    trailingPE: null,
    forwardPE: null,
    priceToBook: null,
    debtToEquity: null,
    currentRatio: null,
    revenueGrowth: null,
    freeCashflow: null,
    totalCash: null,
    totalDebt: null,
    returnOnEquity: null,
    returnOnAssets: null,
    grossMargins: null,
    operatingMargins: null,
    profitMargins: null,
    revenuePerShare: null,
    beta: null,
    sector: null,
    industry: null,
    marketCap: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    dividendYield: null,
    shortPercentOfFloat: null,
    sharesOutstanding: null,
    insidersPercentHeld: null,
    institutionsPercentHeld: null,
  };
}

app.get("/api/data", handleRoute((req, res) => {
  res.json({ stocks: getStocks(), globals: getGlobals() });
}));

app.post("/api/stocks", handleRoute((req, res) => {
  const stock = normalizeStockPayload(req.body);
  if (getStockByTicker(stock.ticker)) throw apiError(409, `stock ${stock.ticker} already exists`);

  const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM stocks").get().position;
  insertStock.run({ epsPinned: 0, ...stock, position: nextPosition });
  res.status(201).json(getStockByTicker(stock.ticker));
}));

app.put("/api/stocks/:ticker", handleRoute((req, res) => {
  const currentTicker = normalizeTicker(req.params.ticker, "ticker parameter");
  const patch = normalizeStockPayload(req.body, { partial: true });
  const current = getStockByTicker(currentTicker);
  if (!current) throw apiError(404, `stock ${currentTicker} not found`);

  const nextTicker = patch.ticker || currentTicker;
  if (nextTicker !== currentTicker && getStockByTicker(nextTicker)) {
    throw apiError(409, `stock ${nextTicker} already exists`);
  }

  // Pin invariant is enforced HERE, not in the SPA: a stale browser session
  // (loaded before rows were pinned) still refreshes with epsPinned=false in
  // memory and would silently clobber curated EPS. Intentional writers
  // (manual edit, importer) always send epsPinned alongside ttmEPS.
  if (current.epsPinned && patch.ttmEPS != null && patch.epsPinned == null) {
    throw apiError(409, `stock ${currentTicker} EPS is pinned (curated); include epsPinned to overwrite it`);
  }

  const assignments = Object.keys(patch).map((field) => `${stockColumnByField[field]} = @${field}`);
  db.prepare(`UPDATE stocks SET ${assignments.join(", ")} WHERE ticker = @currentTicker`).run({ ...patch, currentTicker });
  res.json(getStockByTicker(nextTicker));
}));

app.delete("/api/stocks/:ticker", handleRoute((req, res) => {
  const ticker = normalizeTicker(req.params.ticker, "ticker parameter");
  const result = db.prepare("DELETE FROM stocks WHERE ticker = ?").run(ticker);
  if (result.changes === 0) throw apiError(404, `stock ${ticker} not found`);
  res.status(204).end();
}));

app.put("/api/globals", handleRoute((req, res) => {
  const patch = normalizeGlobalsPayload(req.body);
  const assignments = Object.keys(patch).map((field) => `${globalColumnByField[field]} = @${field}`);
  db.prepare(`UPDATE globals SET ${assignments.join(", ")} WHERE id = 1`).run(patch);
  res.json(getGlobals());
}));

app.post("/api/prices", async (req, res) => {
  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers must be a non-empty array" });
  }

  try {
    const result = {};
    await Promise.all(
      tickers.map(async (raw) => {
        const ticker = String(raw || "").trim().toUpperCase();
        if (!ticker) return;
        try {
          const quote = await yahooFinance.quote(yahooSymbolFromTicker(ticker), {}, { validateResult: false }).catch(() => null);
          result[ticker] = {
            currentPrice: quote?.regularMarketPrice ?? null,
            previousClose: quote?.regularMarketPreviousClose ?? null,
            longName: quote?.longName ?? quote?.shortName ?? null,
          };
        } catch (_) {
          result[ticker] = {
            currentPrice: null,
            previousClose: null,
            longName: null,
          };
        }
      })
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error?.message || "internal server error" });
  }
});

// Enriched quote data. Finnhub (keyed, stable) is the primary fundamentals
// source; Yahoo back-fills only the fields Finnhub's free tier lacks
// (ownership, short interest, cash/debt/FCF levels, forward EPS). Shared by
// POST /api/quotes and POST /api/snapshot.
async function buildQuoteMap(normalized) {
  const finnhubByTicker = finnhubConfigured() ? await fetchFundamentalsBatch(normalized) : {};

  const result = {};
  await Promise.all(
    normalized.map(async (t) => {
        const yahooSymbol = yahooSymbolFromTicker(t);
        try {
          const [quote, summary] = await Promise.all([
            yahooFinance.quote(yahooSymbol, {}, { validateResult: false }).catch(() => null),
            yahooFinance.quoteSummary(
              yahooSymbol,
              { modules: ["defaultKeyStatistics", "financialData", "price", "summaryDetail", "assetProfile", "majorHoldersBreakdown"] },
              { validateResult: false }
            ).catch(() => null),
          ]);

          const fh = finnhubByTicker[t]?.ok ? finnhubByTicker[t] : null;
          // Yahoo reports debtToEquity as a percentage; rubric bands expect a ratio.
          const yahooDebtToEquity = summary?.financialData?.debtToEquity != null
            ? summary.financialData.debtToEquity / 100
            : null;

          result[t] = {
            currentPrice: fh?.currentPrice ?? quote?.regularMarketPrice ?? summary?.price?.regularMarketPrice ?? null,
            previousClose: fh?.previousClose ?? quote?.regularMarketPreviousClose ?? summary?.price?.regularMarketPreviousClose ?? null,
            trailingEps: fh?.trailingEps ?? summary?.defaultKeyStatistics?.trailingEps ?? quote?.trailingEps ?? null,
            forwardEps: summary?.defaultKeyStatistics?.forwardEps ?? quote?.forwardEps ?? null,
            epsGrowthRate: fh?.epsGrowthRate ?? summary?.financialData?.earningsGrowth ?? quote?.earningsGrowth ?? null,
            longName: fh?.longName ?? quote?.longName ?? summary?.price?.longName ?? summary?.price?.shortName ?? null,
            quoteType: quote?.quoteType ?? summary?.price?.quoteType ?? null,
            source: { finnhub: Boolean(fh), yahoo: Boolean(quote || summary) },
            fundamentals: {
              ...emptyFundamentals(),
              trailingPE: fh?.fundamentals.trailingPE ?? summary?.summaryDetail?.trailingPE ?? null,
              forwardPE: fh?.fundamentals.forwardPE ?? summary?.summaryDetail?.forwardPE ?? null,
              priceToBook: fh?.fundamentals.priceToBook ?? summary?.defaultKeyStatistics?.priceToBook ?? null,
              debtToEquity: fh?.fundamentals.debtToEquity ?? yahooDebtToEquity,
              currentRatio: fh?.fundamentals.currentRatio ?? summary?.financialData?.currentRatio ?? null,
              revenueGrowth: fh?.fundamentals.revenueGrowth ?? summary?.financialData?.revenueGrowth ?? null,
              freeCashflow: summary?.financialData?.freeCashflow ?? null,
              totalCash: summary?.financialData?.totalCash ?? null,
              totalDebt: summary?.financialData?.totalDebt ?? null,
              returnOnEquity: fh?.fundamentals.returnOnEquity ?? summary?.financialData?.returnOnEquity ?? null,
              returnOnAssets: fh?.fundamentals.returnOnAssets ?? summary?.financialData?.returnOnAssets ?? null,
              grossMargins: fh?.fundamentals.grossMargins ?? summary?.financialData?.grossMargins ?? null,
              operatingMargins: fh?.fundamentals.operatingMargins ?? summary?.financialData?.operatingMargins ?? null,
              profitMargins: fh?.fundamentals.profitMargins ?? summary?.financialData?.profitMargins ?? null,
              revenuePerShare: fh?.fundamentals.revenuePerShare ?? summary?.financialData?.revenuePerShare ?? null,
              beta: fh?.fundamentals.beta ?? summary?.summaryDetail?.beta ?? null,
              sector: summary?.assetProfile?.sector ?? fh?.fundamentals.sector ?? null,
              industry: summary?.assetProfile?.industry ?? fh?.fundamentals.industry ?? null,
              marketCap: fh?.fundamentals.marketCap ?? summary?.summaryDetail?.marketCap ?? null,
              fiftyTwoWeekHigh: fh?.fundamentals.fiftyTwoWeekHigh ?? summary?.summaryDetail?.fiftyTwoWeekHigh ?? null,
              fiftyTwoWeekLow: fh?.fundamentals.fiftyTwoWeekLow ?? summary?.summaryDetail?.fiftyTwoWeekLow ?? null,
              dividendYield: fh?.fundamentals.dividendYield ?? summary?.summaryDetail?.dividendYield ?? null,
              shortPercentOfFloat: summary?.defaultKeyStatistics?.shortPercentOfFloat ?? null,
              sharesOutstanding: fh?.fundamentals.sharesOutstanding ?? summary?.defaultKeyStatistics?.sharesOutstanding ?? null,
              insidersPercentHeld: summary?.majorHoldersBreakdown?.insidersPercentHeld ?? null,
              institutionsPercentHeld: summary?.majorHoldersBreakdown?.institutionsPercentHeld ?? null,
            },
          };
        } catch (_) {
          result[t] = null;
        }
      })
    );
  return result;
}

app.post("/api/quotes", async (req, res) => {
  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers must be a non-empty array" });
  }

  try {
    const normalized = [...new Set(tickers.map((raw) => String(raw || "").trim().toUpperCase()).filter(Boolean))];
    res.json(await buildQuoteMap(normalized));
  } catch (error) {
    res.status(500).json({ error: error?.message || "internal server error" });
  }
});

const SNAPSHOT_SCHEMA_VERSION = 1;

const insertSnapshot = db.transaction((payload) => {
  const runId = db.prepare(
    "INSERT INTO snapshot_runs (taken_at, schema_version, globals) VALUES (?, ?, ?)"
  ).run(payload.takenAt, payload.schemaVersion, JSON.stringify(payload.globals)).lastInsertRowid;
  const insertRow = db.prepare("INSERT INTO snapshot_rows (run_id, ticker, data) VALUES (?, ?, ?)");
  for (const stock of payload.stocks) insertRow.run(runId, stock.ticker, JSON.stringify(stock));
  return runId;
});

// Freeze the model's current state: curated inputs (EPS, growth, scores) from
// the DB, live price and fundamentals from the providers, IV/%IV/signals
// computed with the shared formulas. Append-only — snapshots never mutate the
// stocks table, and later model changes never rewrite old rows.
app.post("/api/snapshot", async (req, res) => {
  try {
    const stocks = getStocks();
    if (stocks.length === 0) return res.status(400).json({ error: "no stocks to snapshot" });
    const globals = getGlobals();
    const quoteMap = await buildQuoteMap(stocks.map((s) => s.ticker));

    const rows = stocks.map((s) => {
      const quote = quoteMap[s.ticker] || null;
      const currentPrice = quote?.currentPrice ?? quote?.previousClose ?? s.currentPrice;
      const iv = calcIV(s.ttmEPS, s.growth, globals);
      const pctIV = calcPctIV(currentPrice, iv);
      const score = calcScore(s);
      return {
        ...s,
        currentPrice,
        priceSource: quote?.currentPrice != null ? "live" : quote?.previousClose != null ? "previousClose" : "stored",
        iv,
        pctIV,
        score,
        signals: allocationSignals(s, iv, pctIV, score),
        quote: quote ? {
          trailingEps: quote.trailingEps,
          forwardEps: quote.forwardEps,
          epsGrowthRate: quote.epsGrowthRate,
          quoteType: quote.quoteType,
          longName: quote.longName,
        } : null,
        fundamentals: quote?.fundamentals ?? null,
      };
    });

    const payload = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      source: "kapman-fair-value-tool",
      takenAt: new Date().toISOString(),
      globals,
      stocks: rows,
    };
    const runId = insertSnapshot(payload);
    res.status(201).json({ runId, ...payload });
  } catch (error) {
    res.status(500).json({ error: error?.message || "internal server error" });
  }
});

app.get("/api/snapshots", handleRoute((req, res) => {
  const runs = db.prepare(`
    SELECT r.id, r.taken_at, r.schema_version, COUNT(sr.ticker) AS tickers
    FROM snapshot_runs r LEFT JOIN snapshot_rows sr ON sr.run_id = r.id
    GROUP BY r.id ORDER BY r.id DESC
  `).all();
  res.json(runs.map((r) => ({ runId: r.id, takenAt: r.taken_at, schemaVersion: r.schema_version, tickers: r.tickers })));
}));

app.get("/api/snapshots/:id", handleRoute((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw apiError(400, "snapshot id must be a positive integer");
  const run = db.prepare("SELECT id, taken_at, schema_version, globals FROM snapshot_runs WHERE id = ?").get(id);
  if (!run) throw apiError(404, `snapshot ${id} not found`);
  const rows = db.prepare("SELECT data FROM snapshot_rows WHERE run_id = ? ORDER BY ticker ASC").all(id);
  res.json({
    runId: run.id,
    schemaVersion: run.schema_version,
    source: "kapman-fair-value-tool",
    takenAt: run.taken_at,
    globals: JSON.parse(run.globals),
    stocks: rows.map((r) => JSON.parse(r.data)),
  });
}));

// Serve built frontend. Vite assets are content-hashed -> cache forever;
// index.html must never be cached or browsers keep running stale app code
// against a newer API after deploys.
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
    } else {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
}));

// SPA fallback (anything not /api/* falls through to index.html)
app.get(/^\/(?!api).*/, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fair Value Evaluator running on :${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
