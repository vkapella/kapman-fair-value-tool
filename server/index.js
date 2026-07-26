import Database from "better-sqlite3";
import express from "express";
import fs from "fs";
import path from "path";
import YahooFinance from "yahoo-finance2";
import { fileURLToPath } from "url";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "../src/lib/defaultData.js";
import { calcIV, calcPctIV, calcScore, allocationSignals } from "../src/lib/valuation.js";
import { CATEGORY_KEYS, FACTOR_INDEX } from "../src/lib/rubric.js";
import { fetchFundamentalsBatch, finnhubConfigured } from "./lib/finnhub.js";
import { computeScores, coerceFactorValue } from "./lib/scoring.js";
import { parseSheet } from "./lib/sheet.js";
import { buildPreview, seedBaselineIfNeeded, MERGE_FIELDS } from "./lib/import.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const defaultDbDir = process.env.NODE_ENV === "production" ? "/data" : path.join(__dirname, "..", ".data");
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(defaultDbDir, "fair-value.sqlite");

const STOCK_FIELDS = ["ticker", "ttmEPS", "growth", "currentPrice", "updated", "valuation", "growthScore", "moat", "executionRisk", "economy", "epsPinned", "pinnedCategories"];
const STOCK_FIELD_SET = new Set(STOCK_FIELDS);
// epsPinned and pinnedCategories are optional everywhere (default to
// 0 / "unpinned"): curation flags, not part of the core row contract.
const OPTIONAL_STOCK_FIELDS = new Set(["epsPinned", "pinnedCategories", "ttmEPS"]);
const REQUIRED_STOCK_FIELDS = STOCK_FIELDS.filter((field) => !OPTIONAL_STOCK_FIELDS.has(field));
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
  pinnedCategories: "pinned_categories",
  curatedScores: "curated_scores",
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

  CREATE TABLE IF NOT EXISTS stock_factors (
    ticker       TEXT NOT NULL,
    factor_key   TEXT NOT NULL,
    category     TEXT NOT NULL,
    kind         TEXT NOT NULL,
    manual_value TEXT,
    fetched_value TEXT,
    fetched_at   TEXT,
    updated      TEXT,
    PRIMARY KEY (ticker, factor_key)
  );

  CREATE TABLE IF NOT EXISTS fundamentals_cache (
    ticker     TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    data       TEXT NOT NULL
  );

  -- Three-way merge memory for sheet re-imports (S5): what the last import
  -- wrote per (ticker, field), so a later import can tell the operator's own
  -- edit from a Brandon revision. See docs/PHASE-A-DESIGN.md.
  CREATE TABLE IF NOT EXISTS import_baseline (
    ticker      TEXT NOT NULL,
    field       TEXT NOT NULL,
    value       TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    source      TEXT,
    PRIMARY KEY (ticker, field)
  );

  CREATE TABLE IF NOT EXISTS import_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: eps_pinned marks rows whose ttmEPS is operator/sheet-curated on a
// basis providers cannot reproduce (ETFs, BRK.B operating earnings). Refresh
// must never overwrite EPS on pinned rows.
if (!db.prepare("PRAGMA table_info(stocks)").all().some((c) => c.name === "eps_pinned")) {
  db.exec("ALTER TABLE stocks ADD COLUMN eps_pinned INTEGER NOT NULL DEFAULT 0");
}

// Migration: pinned_categories marks which of the five score columns are
// operator-curated vs. recomputed live from stock_factors. Rows that predate
// this column have no factors on file at all -- their scores are entirely
// curated (sheet import / manual entry) -- so on first run we pin every
// category for every existing row. Without this, the very next recompute
// (e.g. the next /api/quotes refresh) would silently overwrite every
// pre-existing score with a cold-start computed value.
// The ALTER and the pinning UPDATE MUST be one transaction. Run as two
// autocommit statements, a crash in between leaves the column present but
// empty -- and the existence guard then skips the UPDATE forever, so every
// row stays unpinned and the next refresh silently recomputes over all of
// them (reproduced: QQQ 82 -> 54, BRK.B 77 -> 56). Atomic means the guard
// correctly retries on the next boot instead.
if (!db.prepare("PRAGMA table_info(stocks)").all().some((c) => c.name === "pinned_categories")) {
  db.transaction(() => {
    db.exec("ALTER TABLE stocks ADD COLUMN pinned_categories TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE stocks SET pinned_categories = ?").run(CATEGORY_KEYS.join(","));
  })();
}

// Migration: curated_scores retains the operator's own number per category
// even while that category is unpinned and showing the model's value. Without
// it, unpinning is destructive -- the curated score is overwritten in place
// the instant you release a category to "see what the model says", with no way
// back. Seeded from the current score columns, which at migration time ARE the
// curated values (every row is pinned by the migration above).
if (!db.prepare("PRAGMA table_info(stocks)").all().some((c) => c.name === "curated_scores")) {
  db.transaction(() => {
    db.exec("ALTER TABLE stocks ADD COLUMN curated_scores TEXT NOT NULL DEFAULT '{}'");
    const rows = db.prepare(`SELECT ticker, ${CATEGORY_KEYS.map((c) => stockColumnByField[c]).join(", ")} FROM stocks`).all();
    const write = db.prepare("UPDATE stocks SET curated_scores = ? WHERE ticker = ?");
    for (const row of rows) {
      const curated = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, row[stockColumnByField[c]]]));
      write.run(JSON.stringify(curated), row.ticker);
    }
  })();
}

// Migration: ttm_eps becomes nullable. Brandon scores names he cannot value
// with Graham -- funds (SGOV, BLV, DRAM) that have no provider EPS at all, and
// loss-makers where TTM EPS is meaningless. NOT NULL forced those rows to be
// skipped entirely. SQLite cannot relax a column constraint in place, so this
// is the standard table rebuild; atomic, and guarded to run exactly once.
if (db.prepare("PRAGMA table_info(stocks)").all().find((c) => c.name === "ttm_eps")?.notnull === 1) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE stocks_new (
        ticker TEXT PRIMARY KEY,
        ttm_eps REAL,
        growth REAL NOT NULL,
        current_price REAL NOT NULL,
        updated TEXT NOT NULL,
        valuation REAL NOT NULL,
        growth_score REAL NOT NULL,
        moat REAL NOT NULL,
        execution_risk REAL NOT NULL,
        economy REAL NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        eps_pinned INTEGER NOT NULL DEFAULT 0,
        pinned_categories TEXT NOT NULL DEFAULT '',
        curated_scores TEXT NOT NULL DEFAULT '{}'
      );
      INSERT INTO stocks_new SELECT
        ticker, ttm_eps, growth, current_price, updated, valuation, growth_score,
        moat, execution_risk, economy, position, eps_pinned, pinned_categories, curated_scores
      FROM stocks;
      DROP TABLE stocks;
      ALTER TABLE stocks_new RENAME TO stocks;
    `);
  })();
}

const insertStock = db.prepare(`
  INSERT INTO stocks (
    ticker, ttm_eps, growth, current_price, updated, valuation,
    growth_score, moat, execution_risk, economy, eps_pinned, pinned_categories,
    curated_scores, position
  ) VALUES (
    @ticker, @ttmEPS, @growth, @currentPrice, @updated, @valuation,
    @growthScore, @moat, @executionRisk, @economy, @epsPinned, @pinnedCategories,
    @curatedScores, @position
  )
`);

const seedDatabase = db.transaction(() => {
  const stockCount = db.prepare("SELECT COUNT(*) AS count FROM stocks").get().count;
  if (stockCount === 0) {
    // Seed data is curated the same way sheet-imported rows are (see the
    // pinned_categories migration above) -- pin everything so a stray
    // /api/quotes refresh on a fresh install can't recompute over it.
    SEED_STOCKS.forEach((stock, index) => insertStock.run({
      epsPinned: 0,
      pinnedCategories: CATEGORY_KEYS.join(","),
      ...stock,
      curatedScores: JSON.stringify(Object.fromEntries(CATEGORY_KEYS.map((c) => [c, stock[c]]))),
      position: index,
    }));
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

// Bootstrap import_baseline (S5) from the workbook that produced the current
// data, if it's present locally; otherwise from current values on rows that
// look sheet-curated. Guarded by an import_meta marker so this runs once.
try {
  const bootstrapWorkbookName = "260726 IWB STOCK SHEET 4.0.xlsx";
  const bootstrapWorkbookPath = path.join(__dirname, "..", "data", "sheets", bootstrapWorkbookName);
  const workbookBuffer = fs.existsSync(bootstrapWorkbookPath) ? fs.readFileSync(bootstrapWorkbookPath) : null;
  const seedResult = seedBaselineIfNeeded(db, {
    stocks: getStocks(),
    workbookBuffer,
    workbookSource: bootstrapWorkbookName,
  });
  if (seedResult.seeded) {
    console.log(`import_baseline seeded (${seedResult.mode}, ${seedResult.rows} row(s))`);
  }
} catch (err) {
  console.error("import_baseline bootstrap failed:", err.message);
}

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

// Canonical (RUBRIC_DEF) order, deduped -- stable storage/display regardless
// of the order the client sent them in.
function normalizePinnedCategories(value) {
  if (!Array.isArray(value)) throw apiError(400, "pinnedCategories must be an array of category keys");
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== "string" || !CATEGORY_KEYS.includes(entry)) {
      throw apiError(400, `pinnedCategories: unknown category "${entry}"`);
    }
    seen.add(entry);
  }
  return CATEGORY_KEYS.filter((category) => seen.has(category));
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
  if (payload.pinnedCategories != null) {
    stock.pinnedCategories = normalizePinnedCategories(payload.pinnedCategories).join(",");
  }
  // ttmEPS is explicitly nullable: a row can carry a score with no valuation
  // (funds with no provider EPS, loss-makers). `null` clears it; anything
  // non-numeric is still rejected.
  if (Object.prototype.hasOwnProperty.call(payload, "ttmEPS") && payload.ttmEPS === null) {
    stock.ttmEPS = null;
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
    pinnedCategories: row.pinned_categories ? row.pinned_categories.split(",").filter(Boolean) : [],
    curatedScores: row.curated_scores ? JSON.parse(row.curated_scores) : {},
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
      growth_score, moat, execution_risk, economy, eps_pinned, pinned_categories, curated_scores
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
      growth_score, moat, execution_risk, economy, eps_pinned, pinned_categories, curated_scores
    FROM stocks
    WHERE ticker = ?
  `).get(ticker);
  return row ? stockFromRow(row) : null;
}

const upsertFactorManual = db.prepare(`
  INSERT INTO stock_factors (ticker, factor_key, category, kind, manual_value, updated)
  VALUES (@ticker, @factorKey, @category, @kind, @manualValue, @updated)
  ON CONFLICT (ticker, factor_key) DO UPDATE SET manual_value = excluded.manual_value, updated = excluded.updated
`);

// Only touches the fetched_value/fetched_at columns -- never clobbers an
// operator's manual_value when a provider refresh runs.
const upsertFactorFetched = db.prepare(`
  INSERT INTO stock_factors (ticker, factor_key, category, kind, fetched_value, fetched_at, updated)
  VALUES (@ticker, @factorKey, @category, @kind, @fetchedValue, @fetchedAt, @updated)
  ON CONFLICT (ticker, factor_key) DO UPDATE SET fetched_value = excluded.fetched_value, fetched_at = excluded.fetched_at, updated = excluded.updated
`);

const upsertFundamentalsCache = db.prepare(`
  INSERT INTO fundamentals_cache (ticker, fetched_at, data)
  VALUES (@ticker, @fetchedAt, @data)
  ON CONFLICT (ticker) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data
`);

// Advances the three-way merge baseline for one (ticker, field) to whatever
// value this import round reconciled against -- used both for fields the
// import wrote to the stocks table (value == the new/theirs value) and for
// conflicts the operator explicitly resolved by keeping their own value
// (value == theirs, so a future import of the same workbook version doesn't
// re-flag an already-decided conflict; see POST /api/import/apply).
const upsertBaselineField = db.prepare(`
  INSERT INTO import_baseline (ticker, field, value, imported_at, source)
  VALUES (@ticker, @field, @value, @importedAt, @source)
  ON CONFLICT (ticker, field) DO UPDATE SET value = excluded.value, imported_at = excluded.imported_at, source = excluded.source
`);

// stock_factors, fundamentals_cache, and import_baseline are all keyed by
// ticker with no foreign key back to stocks, so SQLite will not cascade for
// us: every path that removes or renames a symbol has to clean them up by
// hand. Skipping this strands rows that a later re-add of the same symbol
// silently adopts as current data.
const TICKER_SCOPED_TABLES = ["stock_factors", "fundamentals_cache", "import_baseline"];

const deleteTickerRows = TICKER_SCOPED_TABLES.map((table) =>
  db.prepare(`DELETE FROM ${table} WHERE ticker = ?`)
);

const renameTickerRows = TICKER_SCOPED_TABLES.map((table) =>
  db.prepare(`UPDATE ${table} SET ticker = @nextTicker WHERE ticker = @currentTicker`)
);

// Each table keys on ticker, so renaming onto a symbol that still has orphan
// rows would hit a uniqueness conflict; clear the destination first.
function moveTickerScopedRows(currentTicker, nextTicker) {
  for (const stmt of deleteTickerRows) stmt.run(nextTicker);
  for (const stmt of renameTickerRows) stmt.run({ currentTicker, nextTicker });
}

function getFundamentalsCache(ticker) {
  const row = db.prepare("SELECT data FROM fundamentals_cache WHERE ticker = ?").get(ticker);
  return row ? JSON.parse(row.data) : null;
}

// Full factor map for API responses -- every known factor key (from
// FACTOR_INDEX, not hard-coded), filled in with nulls where no row exists yet
// so the shape is stable whether or not the ticker has ever been scored.
function getFactorsMapForTicker(ticker) {
  const rows = db.prepare("SELECT factor_key, manual_value, fetched_value, fetched_at FROM stock_factors WHERE ticker = ?").all(ticker);
  const byKey = new Map(rows.map((row) => [row.factor_key, row]));
  const map = {};
  for (const key of Object.keys(FACTOR_INDEX)) {
    const row = byKey.get(key);
    map[key] = {
      manual: row ? coerceFactorValue(key, row.manual_value) : null,
      fetched: row ? coerceFactorValue(key, row.fetched_value) : null,
      fetchedAt: row?.fetched_at ?? null,
    };
  }
  return map;
}

// Pure -- reads only, no writes. Used both by GET /api/data (which must not
// mutate on a read) and by recomputeScoresForTicker (which decides what to
// write based on this).
function computeScoresForTicker(ticker) {
  const stock = getStockByTicker(ticker);
  if (!stock) return null;
  const globals = getGlobals();
  const factorRows = db.prepare("SELECT factor_key, manual_value FROM stock_factors WHERE ticker = ?").all(ticker);
  const factors = Object.fromEntries(factorRows.map((row) => [row.factor_key, row.manual_value]));
  const fundamentals = getFundamentalsCache(ticker);
  return computeScores(stock, factors, fundamentals, globals);
}

// The effective-score rule: pinned categories keep whatever is already in the
// stocks row untouched; unpinned categories get overwritten with the fresh
// computed value. Called whenever factors change or fundamentals refresh.
function recomputeScoresForTicker(ticker) {
  const stock = getStockByTicker(ticker);
  if (!stock) return null;
  const computed = computeScoresForTicker(ticker);
  const pinned = new Set(stock.pinnedCategories);

  const patch = {};
  for (const category of CATEGORY_KEYS) {
    // A pinned category restores the operator's curated number rather than
    // merely leaving the column alone: re-pinning after a look at the model
    // must give back exactly what they had, not freeze the computed value.
    if (pinned.has(category)) {
      const curated = stock.curatedScores?.[category];
      if (curated != null && curated !== stock[category]) patch[stockColumnByField[category]] = curated;
    } else {
      patch[stockColumnByField[category]] = computed[category];
    }
  }
  if (Object.keys(patch).length > 0) {
    const assignments = Object.keys(patch).map((column) => `${column} = @${column}`);
    db.prepare(`UPDATE stocks SET ${assignments.join(", ")} WHERE ticker = @ticker`).run({ ...patch, ticker });
  }
  return { computed, stock: getStockByTicker(ticker) };
}

function normalizeFactorPatch(payload) {
  if (!isPlainObject(payload)) throw apiError(400, "request body must be a JSON object");
  const unknown = Object.keys(payload).filter((key) => !FACTOR_INDEX[key]);
  if (unknown.length > 0) throw apiError(400, `unknown factor key(s): ${unknown.join(", ")}`);

  const patch = {};
  for (const [key, rawValue] of Object.entries(payload)) {
    const info = FACTOR_INDEX[key];
    if (rawValue == null) {
      patch[key] = null; // explicit clear of the override
      continue;
    }
    if (info.kind === "judgment") {
      // Number("") is 0 -- without this guard an empty string silently books
      // option 0, which is the highest-scoring choice in every list.
      if (typeof rawValue === "string" && rawValue.trim() === "") {
        throw apiError(400, `${key} must be an option index, not an empty string (send null to clear)`);
      }
      const idx = Number(rawValue);
      const optionCount = info.options?.length || 0;
      if (!Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
        throw apiError(400, `${key} must be an integer option index between 0 and ${optionCount - 1}`);
      }
      patch[key] = String(idx);
    } else if (info.format === "text") {
      if (typeof rawValue !== "string") throw apiError(400, `${key} must be a string`);
      patch[key] = rawValue.trim();
    } else {
      patch[key] = String(normalizeFiniteNumber(rawValue, key));
    }
  }
  if (Object.keys(patch).length === 0) throw apiError(400, "at least one factor is required");
  return patch;
}

function handleRoute(fn) {
  const fail = (res, error) => {
    const status = error.status || 500;
    res.status(status).json({ error: status === 500 ? "internal server error" : error.message });
  };
  return (req, res) => {
    try {
      // Async handlers return a promise; without catching it a rejection would
      // escape this try block and leave the request hanging.
      const out = fn(req, res);
      if (out && typeof out.then === "function") out.catch((error) => fail(res, error));
    } catch (error) {
      fail(res, error);
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
  const stocks = getStocks();
  const factors = {};
  const computed = {};
  for (const stock of stocks) {
    factors[stock.ticker] = getFactorsMapForTicker(stock.ticker);
    computed[stock.ticker] = computeScoresForTicker(stock.ticker);
  }
  res.json({ stocks, globals: getGlobals(), factors, computed });
}));

app.post("/api/stocks", handleRoute((req, res) => {
  const stock = normalizeStockPayload(req.body);
  if (getStockByTicker(stock.ticker)) throw apiError(409, `stock ${stock.ticker} already exists`);

  const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM stocks").get().position;
  // New stocks default to fully PINNED, matching the migration and seed paths:
  // the five scores are required fields, so every caller supplies real numbers
  // -- the sheet importer supplies Brandon's curated scores. Defaulting to
  // unpinned made the next /api/quotes recompute silently replace them with
  // cold-start neutral values (a 78 import landed as 59, dropping the name out
  // of the buy zone). Curated by default; opt into the model by unpinning.
  insertStock.run({
    epsPinned: 0,
    pinnedCategories: CATEGORY_KEYS.join(","),
    ...stock,
    // The supplied scores ARE the curated ones (sheet import, manual add).
    curatedScores: JSON.stringify(Object.fromEntries(CATEGORY_KEYS.map((c) => [c, stock[c]]))),
    position: nextPosition,
  });
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

  // A score arriving here is the operator typing a number, so it becomes the
  // curated value of record for that category -- retained even if they later
  // unpin to compare against the model, so re-pinning gives it back intact.
  const editedCategories = CATEGORY_KEYS.filter((c) => patch[c] != null);
  if (editedCategories.length > 0) {
    patch.curatedScores = JSON.stringify({
      ...current.curatedScores,
      ...Object.fromEntries(editedCategories.map((c) => [c, patch[c]])),
    });
  }

  const assignments = Object.keys(patch).map((field) => `${stockColumnByField[field]} = @${field}`);
  db.transaction(() => {
    db.prepare(`UPDATE stocks SET ${assignments.join(", ")} WHERE ticker = @currentTicker`).run({ ...patch, currentTicker });

    // A rename has to carry the ticker's factors and cached fundamentals with
    // it, or the renamed stock loses its whole scoring history to orphans
    // sitting under the old symbol.
    if (nextTicker !== currentTicker) {
      moveTickerScopedRows(currentTicker, nextTicker);
    }

    // Pinning/unpinning changes which columns are "live"; recompute immediately
    // so a newly-unpinned category doesn't sit stale until the next factor edit
    // or quotes refresh happens to touch it.
    if (Object.prototype.hasOwnProperty.call(patch, "pinnedCategories")) {
      recomputeScoresForTicker(nextTicker);
    }
  })();
  res.json(getStockByTicker(nextTicker));
}));

app.put("/api/factors/:ticker", handleRoute((req, res) => {
  const ticker = normalizeTicker(req.params.ticker, "ticker parameter");
  if (!getStockByTicker(ticker)) throw apiError(404, `stock ${ticker} not found`);
  const patch = normalizeFactorPatch(req.body);
  const now = new Date().toISOString();

  const result = db.transaction(() => {
    for (const [key, manualValue] of Object.entries(patch)) {
      const info = FACTOR_INDEX[key];
      upsertFactorManual.run({ ticker, factorKey: key, category: info.category, kind: info.kind, manualValue, updated: now });
    }
    return recomputeScoresForTicker(ticker);
  })();

  res.json({ factors: getFactorsMapForTicker(ticker), computed: result.computed, stock: result.stock });
}));

app.delete("/api/stocks/:ticker", handleRoute((req, res) => {
  const ticker = normalizeTicker(req.params.ticker, "ticker parameter");
  const removed = db.transaction(() => {
    const result = db.prepare("DELETE FROM stocks WHERE ticker = ?").run(ticker);
    if (result.changes === 0) return false;
    for (const stmt of deleteTickerRows) stmt.run(ticker);
    return true;
  })();
  if (!removed) throw apiError(404, `stock ${ticker} not found`);
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

// Persists the provider payload for every ticker returned (even ones not in
// the stocks table -- harmless fundamentals cache warm-up), then for tickers
// the app actually tracks: mirrors quant values into stock_factors as
// fetched_value/fetched_at and recomputes unpinned scores. Runs as one
// transaction so a mid-batch failure can't leave the cache and factor rows
// out of sync.
function persistQuotesAndRecompute(tickers, quoteMap) {
  const now = new Date().toISOString();
  const trackedTickers = new Set(getStocks().map((s) => s.ticker));
  const toRecompute = [];

  db.transaction(() => {
    for (const ticker of tickers) {
      const quote = quoteMap[ticker];
      if (!quote) continue;
      upsertFundamentalsCache.run({ ticker, fetchedAt: now, data: JSON.stringify(quote) });
      if (!trackedTickers.has(ticker)) continue;

      for (const [key, info] of Object.entries(FACTOR_INDEX)) {
        if (info.kind !== "quant") continue;
        const value = key === "epsGrowthRate" ? quote.epsGrowthRate : quote.fundamentals?.[key];
        if (value == null) continue;
        upsertFactorFetched.run({ ticker, factorKey: key, category: info.category, kind: info.kind, fetchedValue: String(value), fetchedAt: now, updated: now });
      }
      toRecompute.push(ticker);
    }
    for (const ticker of toRecompute) recomputeScoresForTicker(ticker);
  })();
}

app.post("/api/quotes", async (req, res) => {
  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers must be a non-empty array" });
  }

  try {
    const normalized = [...new Set(tickers.map((raw) => String(raw || "").trim().toUpperCase()).filter(Boolean))];
    const quoteMap = await buildQuoteMap(normalized);
    persistQuotesAndRecompute(normalized, quoteMap);
    res.json(quoteMap);
  } catch (error) {
    res.status(500).json({ error: error?.message || "internal server error" });
  }
});

const SNAPSHOT_SCHEMA_VERSION = 2; // v2 adds per-ticker factors + pinnedCategories (rubric persistence, S2)

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
// Shared by POST /api/snapshot and POST /api/import/apply (which must take
// one before writing anything).
async function takeSnapshot() {
  const stocks = getStocks();
  if (stocks.length === 0) throw apiError(400, "no stocks to snapshot");
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
      factors: getFactorsMapForTicker(s.ticker),
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
  return { runId, ...payload };
}

app.post("/api/snapshot", async (req, res) => {
  try {
    const result = await takeSnapshot();
    res.status(201).json(result);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: status === 500 ? (error?.message || "internal server error") : error.message });
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

// -- sheet import (S5) --------------------------------------------------------
// Upload transport is deliberately raw bytes, not multipart: the client POSTs
// the .xlsx File body directly with Content-Type: application/octet-stream,
// which needs no parsing dependency beyond express.raw. The original
// filename (for the "source" shown in the plan and recorded into
// import_baseline) rides along in a request header since a raw body has no
// place to carry it.
const importUpload = express.raw({ type: "application/octet-stream", limit: "25mb" });

app.post("/api/import/preview", importUpload, handleRoute(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw apiError(400, "request body must be the raw bytes of an .xlsx workbook (Content-Type: application/octet-stream)");
  }
  const rawFilename = req.get("X-Import-Filename");
  let source = "uploaded-workbook.xlsx";
  if (rawFilename) {
    try { source = decodeURIComponent(rawFilename); } catch (_) { source = rawFilename; }
  }

  let sheet;
  try {
    sheet = parseSheet(req.body);
  } catch (error) {
    // parseSheet's errors (corrupt zip, wrong tab, duplicate ticker, ...) are
    // already descriptive and meant for a human to read -- surface verbatim.
    throw apiError(400, error.message);
  }

  const stocks = getStocks();
  const globals = getGlobals();
  const baselineRows = db.prepare("SELECT ticker, field, value, imported_at, source FROM import_baseline").all();
  // Fill workbook gaps from live providers so rows Brandon scores but does not
  // value (funds, loss-makers) are still addable instead of silently skipped.
  const untracked = Object.keys(sheet.tickers).filter((t) => !stocks.some((s) => s.ticker === t));
  let quotes = {};
  if (untracked.length > 0) {
    try {
      quotes = await buildQuoteMap(untracked);
    } catch (_) {
      quotes = {}; // provider outage degrades the fill, it must not fail the preview
    }
  }

  res.json(buildPreview({ sheet, stocks, globals, baselineRows, source, quotes }));
}));

// Reshapes/validates the client's chosen subset of a preview into what the
// stocks table actually needs. The client is expected to have derived these
// straight from a prior /api/import/preview response -- see ImportPanel.jsx.
function normalizeImportUpdates(payload) {
  if (!Array.isArray(payload)) throw apiError(400, "updates must be an array");
  return payload.map((entry, i) => {
    if (!isPlainObject(entry)) throw apiError(400, `updates[${i}] must be an object`);
    const ticker = normalizeTicker(entry.ticker, `updates[${i}].ticker`);
    if (!isPlainObject(entry.fields)) throw apiError(400, `updates[${i}].fields must be an object`);
    // Empty fields is only valid alongside pinEps: a row whose sheet values
    // already match but wasn't pinned yet (see buildPreview's willPinEps).
    if (Object.keys(entry.fields).length === 0 && entry.pinEps !== true) {
      throw apiError(400, `updates[${i}].fields must be a non-empty object (or set pinEps)`);
    }
    const fields = {};
    for (const [field, value] of Object.entries(entry.fields)) {
      if (field === "updated") {
        if (typeof value !== "string" || !value.trim()) throw apiError(400, `updates[${i}].fields.updated must be a non-empty string`);
        fields.updated = value.trim();
      } else if (NUMERIC_STOCK_FIELDS.has(field)) {
        fields[field] = normalizeFiniteNumber(value, `updates[${i}].fields.${field}`);
      } else {
        throw apiError(400, `updates[${i}].fields: unknown field "${field}"`);
      }
    }
    return { ticker, fields, pinEps: entry.pinEps === true };
  });
}

// Conflicts the operator resolved (either direction) advance the baseline to
// the workbook's value even when "mine" was kept, so a later import of the
// same unchanged workbook doesn't re-flag a conflict already decided. They do
// NOT by themselves write to the stocks table -- an entry resolved "theirs"
// must also appear in that ticker's updates[].fields to actually be applied.
function normalizeConflictResolutions(payload) {
  if (payload == null) return [];
  if (!Array.isArray(payload)) throw apiError(400, "conflictResolutions must be an array");
  return payload.map((entry, i) => {
    if (!isPlainObject(entry)) throw apiError(400, `conflictResolutions[${i}] must be an object`);
    const ticker = normalizeTicker(entry.ticker, `conflictResolutions[${i}].ticker`);
    if (!MERGE_FIELDS.includes(entry.field)) {
      throw apiError(400, `conflictResolutions[${i}].field must be one of ${MERGE_FIELDS.join(", ")}`);
    }
    if (entry.resolution !== "mine" && entry.resolution !== "theirs") {
      throw apiError(400, `conflictResolutions[${i}].resolution must be "mine" or "theirs"`);
    }
    const theirs = normalizeFiniteNumber(entry.theirs, `conflictResolutions[${i}].theirs`);
    return { ticker, field: entry.field, resolution: entry.resolution, theirs };
  });
}

function normalizeImportAdds(payload) {
  if (payload == null) return [];
  if (!Array.isArray(payload)) throw apiError(400, "addTickers must be an array");
  // Sheet-imported rows land fully pinned, same as scripts/import-sheet.py's
  // POST /api/stocks calls -- Brandon's workbook gives final judgment
  // numbers with no constituent breakdown to import from.
  return payload.map((entry) => normalizeStockPayload({ ...entry, epsPinned: true }));
}

app.post("/api/import/apply", async (req, res) => {
  try {
    const body = req.body;
    if (!isPlainObject(body)) throw apiError(400, "request body must be a JSON object");
    if (typeof body.source !== "string" || !body.source.trim()) throw apiError(400, "source is required");
    const source = body.source.trim();

    const updates = normalizeImportUpdates(body.updates || []);
    const conflictResolutions = normalizeConflictResolutions(body.conflictResolutions);
    const adds = normalizeImportAdds(body.addTickers);

    if (updates.length === 0 && adds.length === 0 && conflictResolutions.length === 0) {
      throw apiError(400, "nothing to apply: updates, addTickers, and conflictResolutions are all empty");
    }

    // Snapshot first, unconditionally, before any write -- any import is
    // then recoverable from GET /api/snapshots regardless of what happens next.
    let snapshot;
    try {
      snapshot = await takeSnapshot();
    } catch (error) {
      throw apiError(error.status || 500, `snapshot failed, import aborted: ${error.message}`);
    }

    const errors = [];
    let updatedCount = 0;
    let addedCount = 0;

    // One transaction for all the writes below: a mid-batch failure on one
    // ticker is caught and reported per-ticker (see try/catch inside each
    // loop) rather than allowed to escape and roll back everyone else's
    // otherwise-valid changes.
    db.transaction(() => {
      const now = new Date().toISOString();
      const baselineWrites = new Map(); // "TICKER::field" -> value

      for (const { ticker, fields, pinEps } of updates) {
        try {
          const current = getStockByTicker(ticker);
          if (!current) throw new Error(`stock ${ticker} not found`);

          const patch = {};
          for (const [field, value] of Object.entries(fields)) {
            patch[stockColumnByField[field]] = value;
            if (MERGE_FIELDS.includes(field)) baselineWrites.set(`${ticker}::${field}`, value);
          }
          if (pinEps) patch.eps_pinned = 1;

          // A score field arriving here becomes the curated value of record
          // for that category, and pins it -- matching PUT /api/stocks/:ticker
          // and this task's "pin imported score categories" requirement.
          const editedCategories = CATEGORY_KEYS.filter((c) => fields[c] != null);
          if (editedCategories.length > 0) {
            const curated = { ...current.curatedScores, ...Object.fromEntries(editedCategories.map((c) => [c, fields[c]])) };
            patch.curated_scores = JSON.stringify(curated);
            const pinnedSet = new Set(current.pinnedCategories);
            editedCategories.forEach((c) => pinnedSet.add(c));
            patch.pinned_categories = CATEGORY_KEYS.filter((c) => pinnedSet.has(c)).join(",");
          }

          const assignments = Object.keys(patch).map((column) => `${column} = @${column}`);
          db.prepare(`UPDATE stocks SET ${assignments.join(", ")} WHERE ticker = @ticker`).run({ ...patch, ticker });
          updatedCount++;
        } catch (error) {
          errors.push(`${ticker}: ${error.message}`);
        }
      }

      for (const { ticker, field, theirs } of conflictResolutions) {
        baselineWrites.set(`${ticker}::${field}`, theirs);
      }
      for (const [key, value] of baselineWrites) {
        const [ticker, field] = key.split("::");
        upsertBaselineField.run({ ticker, field, value: String(value), importedAt: now, source });
      }

      for (const stock of adds) {
        try {
          if (getStockByTicker(stock.ticker)) throw new Error(`stock ${stock.ticker} already exists`);
          const nextPosition = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM stocks").get().position;
          insertStock.run({
            epsPinned: 0,
            pinnedCategories: CATEGORY_KEYS.join(","),
            ...stock,
            curatedScores: JSON.stringify(Object.fromEntries(CATEGORY_KEYS.map((c) => [c, stock[c]]))),
            position: nextPosition,
          });
          for (const field of MERGE_FIELDS) {
            if (stock[field] != null) upsertBaselineField.run({ ticker: stock.ticker, field, value: String(stock[field]), importedAt: now, source });
          }
          addedCount++;
        } catch (error) {
          errors.push(`${stock.ticker}: ${error.message}`);
        }
      }
    })();

    res.status(201).json({ snapshotRunId: snapshot.runId, updated: updatedCount, added: addedCount, errors });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: status === 500 ? (error?.message || "internal server error") : error.message });
  }
});

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

// Final error handler: catches body-parser failures from ANY route's body
// middleware (express.json() above, and /api/import/preview's express.raw())
// regardless of where in the stack they were registered -- Express only
// walks forward from the point of failure, so this must be last to see
// everyone's errors, not just the ones after the first handler near the top.
app.use((error, req, res, next) => {
  if (error && (error.type === "entity.too.large" || error.status === 413)) {
    return res.status(400).json({ error: "upload too large (max 25mb)" });
  }
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "request body must be valid JSON" });
  }
  res.status(error?.status || 500).json({ error: error?.message || "internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fair Value Evaluator running on :${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
