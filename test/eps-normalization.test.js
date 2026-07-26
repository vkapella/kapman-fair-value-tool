import test from "node:test";
import assert from "node:assert/strict";
import { adjustedTtmFromEarnings, fetchTickerFundamentals } from "../server/lib/finnhub.js";

test("adjusted TTM EPS sums the latest four valid, distinct reported quarters", () => {
  const result = adjustedTtmFromEarnings([
    { period: "2025-12-31", actual: 1.25 },
    { period: "2025-09-30", actual: 1.1 },
    { period: "2025-06-30", actual: 0.9 },
    { period: "2025-03-31", actual: 0.75 },
    { period: "2024-12-31", actual: 9 },
  ]);

  assert.equal(result.value, 4);
  assert.equal(result.reason, null);
  assert.deepEqual(result.quarters.map(({ period }) => period), [
    "2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31",
  ]);
});

test("adjusted TTM EPS is unavailable without four valid distinct quarters", () => {
  const result = adjustedTtmFromEarnings([
    { period: "2025-12-31", actual: 1.25 },
    { period: "2025-09-30", actual: "1.1" },
    { period: "2025-06-30", actual: null },
    { actual: 0.75 },
  ]);

  assert.equal(result.value, null);
  assert.match(result.reason, /invalid period or actual EPS/);
});

test("adjusted TTM EPS rejects duplicate quarters instead of double counting them", () => {
  const result = adjustedTtmFromEarnings([
    { period: "2025-12-31", actual: 1.25 },
    { period: "2025-12-31", actual: 99 },
    { period: "2025-09-30", actual: 1.1 },
    { period: "2025-06-30", actual: 0.9 },
    { period: "2025-03-31", actual: 0.75 },
  ]);

  assert.equal(result.value, null);
  assert.match(result.reason, /duplicate periods/);
});

test("normal Finnhub refresh spends exactly metric and earnings calls per ticker", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  const paths = [];
  process.env.FINNHUB_API_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    return {
      ok: true,
      status: 200,
      json: async () => parsed.pathname === "/api/v1/stock/metric"
        ? { metric: { peTTM: 10 } }
        : [
            { period: "2025-12-31", actual: 1 },
            { period: "2025-09-30", actual: 1 },
            { period: "2025-06-30", actual: 1 },
            { period: "2025-03-31", actual: 1 },
          ],
    };
  };

  try {
    const result = await fetchTickerFundamentals("TEST");
    assert.equal(result.adjustedTtmEps, 4);
    assert.deepEqual(paths.sort(), ["/api/v1/stock/earnings", "/api/v1/stock/metric"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = originalKey;
  }
});
