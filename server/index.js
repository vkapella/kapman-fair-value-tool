import Database from "better-sqlite3";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "../src/lib/defaultData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const defaultDbDir = process.env.NODE_ENV === "production" ? "/data" : path.join(__dirname, "..", ".data");
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(defaultDbDir, "fair-value.sqlite");

const STOCK_FIELDS = ["ticker", "ttmEPS", "growth", "currentPrice", "updated", "valuation", "growthScore", "moat", "executionRisk", "economy"];
const STOCK_FIELD_SET = new Set(STOCK_FIELDS);
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
`);

const insertStock = db.prepare(`
  INSERT INTO stocks (
    ticker, ttm_eps, growth, current_price, updated, valuation,
    growth_score, moat, execution_risk, economy, position
  ) VALUES (
    @ticker, @ttmEPS, @growth, @currentPrice, @updated, @valuation,
    @growthScore, @moat, @executionRisk, @economy, @position
  )
`);

const seedDatabase = db.transaction(() => {
  const stockCount = db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count;
  if (stockCount === 0) {
    SEED_STOCKS.forEach((stock, index) => insertStock.run({ ...stock, position: index }));
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
    const missing = STOCK_FIELDS.filter((field) => payload[field] == null);
    if (missing.length > 0) throw apiError(400, `missing required field(s): ${missing.join(", ")}`);
  }

  const stock = {};
  if (payload.ticker != null) stock.ticker = normalizeTicker(payload.ticker);
  if (payload.updated != null) {
    if (typeof payload.updated !== "string") throw apiError(400, "updated must be a string");
    stock.updated = payload.updated.trim();
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
      growth_score, moat, execution_risk, economy
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
      growth_score, moat, execution_risk, economy
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

app.get("/api/data", handleRoute((req, res) => {
  res.json({ stocks: getStocks(), globals: getGlobals() });
}));

app.post("/api/stocks", handleRoute((req, res) => {
  const stock = normalizeStockPayload(req.body);
  if (getStockByTicker(stock.ticker)) throw apiError(409, `stock ${stock.ticker} already exists`);

  const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM stocks").get().position;
  insertStock.run({ ...stock, position: nextPosition });
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

// API: bulk fetch previous-close prices
app.post("/api/prices", async (req, res) => {
  if (!POLYGON_KEY) {
    return res.status(500).json({ error: "POLYGON_API_KEY env var not set on server" });
  }
  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers must be a non-empty array" });
  }

  const result = {};
  await Promise.all(
    tickers.map(async (raw) => {
      const t = String(raw).trim().toUpperCase();
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(t)}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
        const r = await fetch(url);
        if (!r.ok) return;
        const d = await r.json();
        if (d.results && d.results[0] && typeof d.results[0].c === "number") {
          result[t] = d.results[0].c;
        }
      } catch (_) { /* skip */ }
    })
  );

  res.json(result);
});

// Serve built frontend
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

// SPA fallback (anything not /api/* falls through to index.html)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fair Value Evaluator running on :${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
  console.log(`Polygon API key: ${POLYGON_KEY ? "configured" : "NOT SET - refresh will fail"}`);
});
