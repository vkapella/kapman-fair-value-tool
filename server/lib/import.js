// Pure helpers for the in-app sheet-import flow (issue #29, stage S5):
// the three-way merge diff and the import_baseline bootstrap seed. Both are
// plain data transforms with no express/DB-cursor coupling beyond a
// better-sqlite3 handle passed in, so server/index.js owns all the route
// wiring, request validation, and the actual stocks-table writes.
//
// Keep classifyField in sync with the merge table in
// docs/PHASE-A-DESIGN.md ("Re-importing a newer workbook: three-way merge").
import { parseSheet } from "./sheet.js";
import { calcIV, calcPctIV } from "../../src/lib/valuation.js";

// Fields Brandon's workbook owns and that the three-way merge tracks via
// import_baseline. "updated" is deliberately excluded from this list -- it's
// a bookkeeping date, not a competing edit, so it always behaves as if no
// baseline row exists (see classifyField's `base === undefined` branch):
// applied whenever it differs, never flagged as a conflict.
export const MERGE_FIELDS = ["ttmEPS", "growth", "valuation", "growthScore", "moat", "executionRisk", "economy"];
const DIFF_FIELDS = [...MERGE_FIELDS, "updated"];

// A brand-new ticker needs every one of these to become a full stocks row --
// mirrors the `required` tuple in scripts/import-sheet.py's main().
export const ADD_REQUIRED_FIELDS = ["ttmEPS", "growth", "price", "updated", "valuation", "growthScore", "moat", "executionRisk", "economy"];

function valuesEqual(a, b) {
  if (a == null || b == null) return a == b;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

// Classifies one (ticker, field) triple per the three-way merge table:
//   base==mine, base==theirs -> null       (unchanged, nothing to show)
//   base==mine, base!=theirs -> "update"   (clean update, Brandon moved it)
//   base!=mine, base==theirs -> null       ("mine stands", not surfaced)
//   base!=mine, base!=theirs -> "conflict" (both moved, and moved apart)
// No baseline row at all (first-ever import of this field) is treated as a
// clean update whenever the workbook's value differs from the app's.
export function classifyField({ base, mine, theirs }) {
  if (theirs == null) return null; // sheet doesn't supply this field for this ticker
  if (base === undefined) {
    return valuesEqual(theirs, mine) ? null : "update";
  }
  const baseMine = valuesEqual(base, mine);
  const baseTheirs = valuesEqual(base, theirs);
  if (baseMine && baseTheirs) return null;
  if (baseMine && !baseTheirs) return "update";
  if (!baseMine && baseTheirs) return null;
  return "conflict";
}

// sheet: { tickers, meta } as returned by parseSheet().
// stocks: current app stock rows (server/index.js's getStocks()).
// globals: current globals row (for the informational %IV before/after).
// baselineRows: raw rows from `SELECT ticker, field, value, imported_at, source FROM import_baseline`.
// source: display name for the upload (filename, or a fallback).
export function buildPreview({ sheet, stocks, globals, baselineRows, source }) {
  const baseline = new Map(); // ticker -> field -> row
  for (const row of baselineRows) {
    if (!baseline.has(row.ticker)) baseline.set(row.ticker, new Map());
    baseline.get(row.ticker).set(row.field, row);
  }

  const updates = [];
  const conflicts = [];
  const stocksByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  for (const stock of stocks) {
    const row = sheet.tickers[stock.ticker];
    if (!row) continue; // app ticker not in this workbook -- left alone
    const tickerBaseline = baseline.get(stock.ticker) || new Map();
    const fields = {};

    for (const field of DIFF_FIELDS) {
      const theirs = row[field];
      const mine = stock[field];
      const baseRow = MERGE_FIELDS.includes(field) ? tickerBaseline.get(field) : undefined;
      const base = baseRow ? Number(baseRow.value) : undefined;
      const outcome = classifyField({ base, mine, theirs });
      if (outcome === "update") {
        fields[field] = { old: mine, new: theirs };
      } else if (outcome === "conflict") {
        conflicts.push({
          ticker: stock.ticker,
          field,
          mine,
          base,
          theirs,
          baseImportedAt: baseRow?.imported_at ?? null,
          baseSource: baseRow?.source ?? null,
          sheetUpdated: row.updated,
          mineUpdated: stock.updated,
        });
      }
    }

    // Mirrors scripts/import-sheet.py's pin rule: pin EPS whenever the sheet
    // supplies one and either ttmEPS is actually changing or the row isn't
    // pinned yet. Score-only rows (SGOV et al.) never reach here with a
    // non-null ttmEPS, so this can't spuriously pin an uncurated value.
    const willPinEps = row.ttmEPS != null && (fields.ttmEPS != null || !stock.epsPinned);

    if (Object.keys(fields).length > 0 || willPinEps) {
      const pctIVBefore = calcPctIV(stock.currentPrice, calcIV(stock.ttmEPS, stock.growth, globals));
      const afterEPS = fields.ttmEPS ? fields.ttmEPS.new : stock.ttmEPS;
      const afterGrowth = fields.growth ? fields.growth.new : stock.growth;
      const pctIVAfter = calcPctIV(stock.currentPrice, calcIV(afterEPS, afterGrowth, globals));
      updates.push({ ticker: stock.ticker, fields, willPinEps, pctIVBefore, pctIVAfter });
    }
  }

  const adds = [];
  const skips = [];
  for (const [ticker, row] of Object.entries(sheet.tickers)) {
    if (stocksByTicker.has(ticker)) continue;
    const missing = ADD_REQUIRED_FIELDS.filter((f) => row[f] == null);
    if (missing.length > 0) {
      skips.push({ ticker, score: row.score ?? null, reason: `missing ${missing.join(", ")}` });
      continue;
    }
    const pctIV = calcPctIV(row.price, calcIV(row.ttmEPS, row.growth, globals));
    adds.push({
      ticker,
      score: row.score,
      ttmEPS: row.ttmEPS,
      growth: row.growth,
      currentPrice: row.price,
      updated: row.updated,
      valuation: row.valuation,
      growthScore: row.growthScore,
      moat: row.moat,
      executionRisk: row.executionRisk,
      economy: row.economy,
      pctIV,
      preChecked: (row.score ?? 0) >= 75,
    });
  }
  adds.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return { source, meta: sheet.meta, updates, conflicts, adds, skips };
}

// -- baseline bootstrap -------------------------------------------------------
// The 7/26 import (issue #28) predates import_baseline entirely. Without a
// seed, the next preview would have no baseline row for any field on any
// existing ticker, and classifyField's "no baseline row" branch treats that
// as a clean update whenever workbook != app -- silently overwriting every
// operator edit made since that import as if it had never happened. Seeding
// from the workbook that produced today's data (verified idempotent) or, if
// that file isn't available, from current values on rows that look
// sheet-curated, recreates the baseline that would exist had this table
// shipped on day one. Runs at most once, guarded by an import_meta marker.
export function seedBaselineIfNeeded(db, { stocks, workbookBuffer, workbookSource }) {
  const already = db.prepare("SELECT value FROM import_meta WHERE key = 'baseline_seeded'").get();
  if (already) return { seeded: false, reason: "already seeded", at: already.value };

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO import_baseline (ticker, field, value, imported_at, source)
    VALUES (@ticker, @field, @value, @importedAt, @source)
    ON CONFLICT (ticker, field) DO UPDATE SET value = excluded.value, imported_at = excluded.imported_at, source = excluded.source
  `);
  const markSeeded = db.prepare("INSERT INTO import_meta (key, value) VALUES ('baseline_seeded', @now)");

  let mode = "empty";
  let rows = 0;
  db.transaction(() => {
    if (workbookBuffer) {
      mode = "workbook";
      const sheet = parseSheet(workbookBuffer);
      for (const stock of stocks) {
        const row = sheet.tickers[stock.ticker];
        if (!row) continue;
        for (const field of MERGE_FIELDS) {
          const value = row[field];
          if (value == null) continue;
          insert.run({ ticker: stock.ticker, field, value: String(value), importedAt: now, source: workbookSource });
          rows++;
        }
      }
    } else {
      // No workbook on disk -- fall back to today's current values for rows
      // that look sheet-imported. epsPinned is only ever set by an import or
      // a deliberate manual override, so it's a reasonable "this row has
      // already been curated" signal to seed a baseline from.
      mode = "current-values";
      for (const stock of stocks) {
        if (!stock.epsPinned) continue;
        for (const field of MERGE_FIELDS) {
          const value = stock[field];
          if (value == null) continue;
          insert.run({ ticker: stock.ticker, field, value: String(value), importedAt: now, source: "bootstrap-current-values" });
          rows++;
        }
      }
    }
    markSeeded.run({ now });
  })();

  return { seeded: true, mode, rows, at: now };
}
