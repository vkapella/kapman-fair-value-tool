import test from "node:test";
import assert from "node:assert/strict";
import { buildTickerPreview } from "../server/lib/import.js";

const globals = { peNoGrowth: 8.5, g: 2, avgYieldAAA: 4.4, bondYield: 4.4 };

test("ticker preview skips tracked and provider-unpriced symbols", () => {
  const preview = buildTickerPreview({
    tickers: ["OLD", "NEW", "NOPRICE"],
    stocks: [{ ticker: "OLD" }],
    globals,
    quotes: {
      NEW: { currentPrice: 50, trailingEps: 5, longName: "New Co" },
      NOPRICE: { currentPrice: null, previousClose: null },
    },
  });

  assert.deepEqual(preview.adds.map(({ ticker }) => ticker), ["NEW"]);
  assert.deepEqual(preview.skips, [
    { ticker: "OLD", reason: "already tracked" },
    { ticker: "NOPRICE", reason: "no live provider price available" },
  ]);
});

test("new ticker preview is conservative and flags operator-owned inputs", () => {
  const preview = buildTickerPreview({
    tickers: ["NEW"],
    stocks: [],
    globals,
    quotes: {
      NEW: {
        currentPrice: 50,
        trailingEps: 5,
        epsGrowthRate: 0.8,
        quoteType: "EQUITY",
        longName: "New Co",
      },
    },
  });
  const add = preview.adds[0];

  assert.equal(add.ttmEPS, 5);
  assert.equal(add.currentPrice, 50);
  assert.equal(add.growth, 0);
  assert.equal(add.sources.growth, "operator");
  assert.ok(add.needsOperatorInput.includes("growth"));
  assert.ok(add.needsOperatorInput.includes("valuation"));
  assert.ok(add.notes.some((note) => note.includes("starts at 0%")));
});
