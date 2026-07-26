import { calcIV, calcPctIV } from "../../src/lib/valuation.js";
import { CATEGORY_KEYS } from "../../src/lib/rubric.js";

const finiteOrNull = (value) => Number.isFinite(value) ? value : null;

// Provider feeds do not supply the operator's forward 7–10 year growth
// assumption. Starting at zero is deliberately conservative and, unlike
// copying trailing one-year EPS growth, cannot manufacture an inflated IV.
export function buildTickerPreview({ tickers, stocks, globals, quotes }) {
  const tracked = new Set(stocks.map((stock) => stock.ticker));
  const adds = [];
  const skips = [];

  for (const ticker of tickers) {
    if (tracked.has(ticker)) {
      skips.push({ ticker, reason: "already tracked" });
      continue;
    }

    const quote = quotes[ticker];
    const currentPrice = finiteOrNull(quote?.currentPrice ?? quote?.previousClose);
    if (!quote || currentPrice == null) {
      skips.push({ ticker, reason: "no live provider price available" });
      continue;
    }

    const ttmEPS = finiteOrNull(quote.trailingEps);
    const growth = 0;
    adds.push({
      ticker,
      longName: quote.longName || null,
      quoteType: quote.quoteType || null,
      ttmEPS,
      growth,
      currentPrice,
      updated: new Date().toLocaleDateString("en-US", {
        timeZone: "America/New_York",
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      }),
      pctIV: calcPctIV(currentPrice, calcIV(ttmEPS, growth, globals)),
      preChecked: true,
      sources: {
        currentPrice: "provider",
        ttmEPS: ttmEPS == null ? "unavailable" : "provider",
        growth: "operator",
        categories: "live model",
      },
      needsOperatorInput: ["growth", ...CATEGORY_KEYS],
      notes: [
        ttmEPS == null && "provider has no usable TTM EPS; intrinsic value will remain unavailable",
        "forward growth starts at 0% until reviewed",
        "category scores start unpinned from live factors; review qualitative judgments",
      ].filter(Boolean),
    });
  }

  return {
    source: "Finnhub + Yahoo",
    meta: { requested: tickers.length, addable: adds.length, skipped: skips.length },
    adds,
    skips,
  };
}
