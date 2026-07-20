// Finnhub free-tier client for fundamentals. Primary provider for /api/quotes;
// Yahoo back-fills only the fields the free tier lacks (ownership, short
// interest, cash/debt/FCF dollar levels, forward EPS).
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

// Finnhub reports percent-family metrics as percentages (roeTTM: 146.69) and
// size metrics in millions; rubric.js expects fractions and absolute dollars.
function fraction(value) {
  const n = num(value);
  return n == null ? null : n / 100;
}

function fromMillions(value) {
  const n = num(value);
  return n == null ? null : n * 1e6;
}

export async function fetchTickerFundamentals(ticker) {
  const [metricRes, profileRes, quoteRes] = await Promise.allSettled([
    finnhubGet("/stock/metric", { symbol: ticker, metric: "all" }),
    finnhubGet("/stock/profile2", { symbol: ticker }),
    finnhubGet("/quote", { symbol: ticker }),
  ]);

  const metric = metricRes.status === "fulfilled" ? metricRes.value?.metric || {} : {};
  const profile = profileRes.status === "fulfilled" ? profileRes.value || {} : {};
  const quote = quoteRes.status === "fulfilled" ? quoteRes.value || {} : {};

  const anyFulfilled = [metricRes, profileRes, quoteRes].some((r) => r.status === "fulfilled");
  const errors = [metricRes, profileRes, quoteRes]
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason?.message || String(r.reason));
  if (!anyFulfilled) return { ok: false, errors };

  // Finnhub returns an all-zero quote object for unknown symbols.
  const unknownQuote = num(quote.c) === 0 && num(quote.t) === 0;
  const currentPrice = unknownQuote ? null : num(quote.c);

  // metric.epsTTM is per-share of the PRIMARY listing — wrong currency for
  // ADRs (TSM: TWD) and wrong share class for duals (BRK.B: Class-A level).
  // P/E is dimensionless, so US price ÷ peTTM yields EPS in the traded
  // share's own currency and class. Underivable -> null (Yahoo back-fills).
  const peTTM = num(metric.peTTM);
  const trailingEps = currentPrice != null && peTTM != null && peTTM > 0
    ? currentPrice / peTTM
    : null;

  return {
    ok: true,
    errors,
    currentPrice,
    previousClose: unknownQuote ? null : num(quote.pc),
    trailingEps,
    epsGrowthRate: fraction(metric.epsGrowthTTMYoy),
    longName: profile.name || null,
    fundamentals: {
      trailingPE: num(metric.peTTM),
      forwardPE: num(metric.forwardPE),
      priceToBook: num(metric.pb),
      debtToEquity: num(metric["totalDebt/totalEquityQuarterly"]),
      currentRatio: num(metric.currentRatioQuarterly),
      revenueGrowth: fraction(metric.revenueGrowthTTMYoy),
      returnOnEquity: fraction(metric.roeTTM),
      returnOnAssets: fraction(metric.roaTTM),
      grossMargins: fraction(metric.grossMarginTTM),
      operatingMargins: fraction(metric.operatingMarginTTM),
      profitMargins: fraction(metric.netProfitMarginTTM),
      revenuePerShare: num(metric.revenuePerShareTTM),
      beta: num(metric.beta),
      sector: profile.finnhubIndustry || null,
      industry: profile.finnhubIndustry || null,
      marketCap: fromMillions(profile.marketCapitalization),
      fiftyTwoWeekHigh: num(metric["52WeekHigh"]),
      fiftyTwoWeekLow: num(metric["52WeekLow"]),
      dividendYield: fraction(metric.dividendYieldIndicatedAnnual),
      sharesOutstanding: fromMillions(profile.shareOutstanding),
    },
  };
}

// Small concurrency pool: 3 Finnhub calls per ticker, so 5 concurrent tickers
// keeps a full-table refresh under the 30 calls/sec burst cap.
export async function fetchFundamentalsBatch(tickers, limit = 5) {
  const results = {};
  const queue = [...tickers];
  async function worker() {
    while (queue.length > 0) {
      const ticker = queue.shift();
      try {
        results[ticker] = await fetchTickerFundamentals(ticker);
      } catch (error) {
        results[ticker] = { ok: false, errors: [error?.message || String(error)] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tickers.length) }, worker));
  return results;
}
