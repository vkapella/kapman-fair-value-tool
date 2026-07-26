// Finnhub free-tier client for fundamentals. Price is deliberately supplied by
// Yahoo in server/index.js; a normal EPS refresh makes only metric + earnings
// calls to Finnhub.
const BASE_URL = "https://finnhub.io/api/v1";

function apiKey() {
  return process.env.FINNHUB_API_KEY || process.env.FINHUB_API_KEY || null;
}

export function finnhubConfigured() {
  return Boolean(apiKey());
}

async function finnhubGet(path, params = {}) {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { "X-Finnhub-Token": apiKey() } });
  if (res.status === 429) throw new Error("Finnhub rate limit exceeded (free tier: 60 calls/min)");
  if (res.status === 401) throw new Error("Finnhub rejected the API key");
  if (res.status === 403) throw new Error(`Finnhub denied access to ${path} (premium endpoint or non-US symbol)`);
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} for ${path}`);
  return res.json();
}

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fraction(value) {
  const n = num(value);
  return n == null ? null : n / 100;
}

function reportedQuarterKey(earning) {
  // Finnhub currently supplies both period and date. A report can be revised
  // or duplicated, so a fiscal-period identity is mandatory before it counts.
  const key = earning?.period || earning?.date;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function reportTime(earning) {
  const raw = earning?.period || earning?.date || "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

// Finnhub's earnings endpoint labels the reported per-share figure `actual`.
// This is intentionally not a non-GAAP inference: it is a separate adjusted
// TTM series whose provenance remains visible to the operator.
export function adjustedTtmFromEarnings(earnings) {
  if (!Array.isArray(earnings)) {
    return { value: null, reason: "earnings history unavailable", quarters: [] };
  }
  const latest = [...earnings]
    .sort((a, b) => reportTime(b) - reportTime(a))
    .slice(0, 4);
  if (latest.length < 4) {
    return {
      value: null,
      reason: `requires 4 reported quarters; found ${latest.length}`,
      quarters: latest.map((q) => ({ period: reportedQuarterKey(q), actual: q?.actual ?? null })),
    };
  }
  const periods = latest.map(reportedQuarterKey);
  const actuals = latest.map((quarter) => num(quarter?.actual));
  if (periods.some((period) => !period) || actuals.some((actual) => actual == null)) {
    return { value: null, reason: "latest 4 reported quarters contain an invalid period or actual EPS", quarters: latest.map((q) => ({ period: reportedQuarterKey(q), actual: q?.actual ?? null })) };
  }
  if (new Set(periods).size !== periods.length) {
    return { value: null, reason: "latest 4 reported quarters contain duplicate periods", quarters: latest.map((q) => ({ period: reportedQuarterKey(q), actual: q.actual })) };
  }
  const quarters = latest;
  return {
    value: quarters.reduce((sum, quarter) => sum + quarter.actual, 0),
    reason: null,
    quarters: quarters.map((q) => ({ period: reportedQuarterKey(q), actual: q.actual })),
  };
}

export async function fetchTickerFundamentals(ticker) {
  const [metricRes, earningsRes] = await Promise.allSettled([
    finnhubGet("/stock/metric", { symbol: ticker, metric: "all" }),
    finnhubGet("/stock/earnings", { symbol: ticker }),
  ]);
  const metric = metricRes.status === "fulfilled" ? metricRes.value?.metric || {} : {};
  const earnings = earningsRes.status === "fulfilled" ? earningsRes.value : null;
  const anyFulfilled = [metricRes, earningsRes].some((r) => r.status === "fulfilled");
  const errors = [metricRes, earningsRes]
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason?.message || String(r.reason));
  if (!anyFulfilled) return { ok: false, errors };

  const adjusted = adjustedTtmFromEarnings(earnings);
  return {
    ok: true,
    errors,
    // The caller combines this dimensionless P/E with Yahoo's traded-share
    // price, avoiding an ADR/other-listing currency mismatch in epsTTM.
    trailingPE: num(metric.peTTM),
    adjustedTtmEps: adjusted.value,
    adjustedTtmEpsReason: adjusted.reason,
    adjustedQuarters: adjusted.quarters,
    epsGrowthRate: fraction(metric.epsGrowthTTMYoy),
    fundamentals: {
      trailingPE: num(metric.peTTM), forwardPE: num(metric.forwardPE), priceToBook: num(metric.pb),
      debtToEquity: num(metric["totalDebt/totalEquityQuarterly"]), currentRatio: num(metric.currentRatioQuarterly),
      revenueGrowth: fraction(metric.revenueGrowthTTMYoy), returnOnEquity: fraction(metric.roeTTM),
      returnOnAssets: fraction(metric.roaTTM), grossMargins: fraction(metric.grossMarginTTM),
      operatingMargins: fraction(metric.operatingMarginTTM), profitMargins: fraction(metric.netProfitMarginTTM),
      revenuePerShare: num(metric.revenuePerShareTTM), beta: num(metric.beta),
      fiftyTwoWeekHigh: num(metric["52WeekHigh"]), fiftyTwoWeekLow: num(metric["52WeekLow"]),
      dividendYield: fraction(metric.dividendYieldIndicatedAnnual),
    },
  };
}

export async function fetchFundamentalsBatch(tickers, limit = 5) {
  const results = {};
  const queue = [...tickers];
  async function worker() {
    while (queue.length > 0) {
      const ticker = queue.shift();
      try { results[ticker] = await fetchTickerFundamentals(ticker); }
      catch (error) { results[ticker] = { ok: false, errors: [error?.message || String(error)] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tickers.length) }, worker));
  return results;
}
