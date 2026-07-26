// Server-side scoring engine. Reuses the exact same rubric weighting the SPA
// worksheet uses (suggestScore) so a score computed here and one computed in
// the browser can never diverge.
import { CATEGORY_KEYS, FACTOR_INDEX, suggestScore } from "../../src/lib/rubric.js";
import { calcIV, calcPctIV } from "../../src/lib/valuation.js";

// stock_factors stores everything as TEXT (SQLite is dynamically typed and a
// few quant fields, e.g. sector/industry, are genuinely text). Coerce back to
// the shape suggestScore/rubric bands expect: judgment values are select
// indices (numbers), text quant fields stay strings, everything else is a
// finite number or null.
export function coerceFactorValue(key, rawValue) {
  if (rawValue == null) return null;
  const info = FACTOR_INDEX[key];
  if (!info) return rawValue;
  if (info.kind === "judgment") {
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : null;
  }
  if (info.format === "text") return String(rawValue);
  const n = Number(rawValue);
  return Number.isFinite(n) ? n : null;
}

// Builds the flat fundamentals object suggestScore expects: fetched values
// come from the fundamentals_cache payload (the per-ticker object produced by
// buildQuoteMap), with any operator manual_value overriding field-by-field —
// manual always wins over fetched.
function buildFundamentalsInput(fundamentals, factors) {
  const cached = fundamentals || {};
  const flat = { ...(cached.fundamentals || {}) };
  // epsGrowthRate is a quant field but lives at the top level of the cached
  // quote payload (alongside trailingEps/forwardEps), not inside .fundamentals.
  if (cached.epsGrowthRate != null) flat.epsGrowthRate = cached.epsGrowthRate;

  for (const [key, manualValue] of Object.entries(factors || {})) {
    const info = FACTOR_INDEX[key];
    if (!info || info.kind !== "quant" || manualValue == null) continue;
    flat[key] = coerceFactorValue(key, manualValue);
  }
  return flat;
}

// Judgment factors pass straight through as suggestScore's `overrides` arg
// (the select option index it already expects).
function buildOverrides(factors) {
  const overrides = {};
  for (const [key, manualValue] of Object.entries(factors || {})) {
    const info = FACTOR_INDEX[key];
    if (!info || info.kind !== "judgment" || manualValue == null) continue;
    const idx = coerceFactorValue(key, manualValue);
    if (idx != null) overrides[key] = idx;
  }
  return overrides;
}

// factors: { factorKey: manualValue|null } — raw stock_factors.manual_value
// for one ticker. Missing/null entries simply fall back to fetched data (or
// the rubric's neutral weight if nothing is known).
// fundamentals: the parsed fundamentals_cache.data row for the ticker, or null.
export function computeScores(stock, factors, fundamentals, globals) {
  const flatFundamentals = buildFundamentalsInput(fundamentals, factors);
  const overrides = buildOverrides(factors);
  const iv = calcIV(stock.valuationTtmEps ?? stock.ttmEPS, stock.growth, globals);
  const pctIV = calcPctIV(stock.currentPrice, iv);

  const scores = {};
  for (const category of CATEGORY_KEYS) {
    scores[category] = suggestScore(category, flatFundamentals, pctIV, globals, overrides).suggested;
  }
  return scores;
}
