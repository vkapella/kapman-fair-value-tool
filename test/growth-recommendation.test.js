import test from "node:test";
import assert from "node:assert/strict";
import { suggestIvGrowth } from "../src/lib/growthRecommendation.js";

test("suggestion blends forward and historical evidence, checks capacity, and applies the Graham haircut", () => {
  const result = suggestIvGrowth({
    quoteType: "EQUITY",
    sector: "Technology",
    marketCap: 3_000_000_000_000,
    forwardEpsGrowth: 0.1554,
    epsGrowth3Y: 0.1224,
    epsGrowth5Y: 0.188,
    returnOnEquity: 0.3401,
    payoutRatioTtm: 0.2065,
    analystCount: 30,
  });

  assert.equal(result.value, 12.5);
  assert.equal(result.classification, "Mature / mega-cap");
  assert.equal(result.cap, 15);
  assert.equal(result.confidence, "medium");
  assert.ok(result.inputs.capacity > 26 && result.inputs.capacity < 28);
});

test("financial cap prevents optimistic evidence from exceeding 8%", () => {
  const result = suggestIvGrowth({
    quoteType: "EQUITY",
    sector: "Financial Services",
    forwardEpsGrowth: 0.3,
    epsGrowth3Y: 0.25,
    epsGrowth5Y: 0.22,
    returnOnEquity: 0.3,
    payoutRatioTtm: 0,
    analystCount: 12,
  });

  assert.equal(result.value, 8);
  assert.equal(result.cap, 8);
  assert.equal(result.classification, "Financial company");
});

test("disagreement above 15 percentage points applies the unstable cap and 35% haircut", () => {
  const result = suggestIvGrowth({
    quoteType: "EQUITY",
    sector: "Technology",
    forwardEpsGrowth: 0.3,
    epsGrowth3Y: 0.05,
    epsGrowth5Y: 0.2,
    returnOnEquity: 0.3,
    payoutRatioTtm: 0.2,
    analystCount: 15,
  });

  assert.equal(result.classification, "Cyclical / unstable evidence");
  assert.equal(result.confidence, "low");
  assert.equal(result.inputs.haircut, 65);
  assert.match(result.warning, /more than 15 percentage points/);
});

test("ETF recommendation uses a low-confidence index default rather than company metrics", () => {
  const result = suggestIvGrowth({ quoteType: "ETF" });
  assert.equal(result.value, 7);
  assert.equal(result.cap, 8);
  assert.equal(result.confidence, "low");
  assert.match(result.warning, /not comparable for an ETF/);
});

test("one observation without a valid capacity check abstains", () => {
  const result = suggestIvGrowth({ quoteType: "EQUITY", forwardEpsGrowth: 0.12 });
  assert.equal(result.value, null);
  assert.equal(result.confidence, "unavailable");
});

test("negative evidence is not softened by the positive-growth haircut", () => {
  const result = suggestIvGrowth({
    quoteType: "EQUITY",
    forwardEpsGrowth: -0.05,
    epsGrowth3Y: -0.02,
    epsGrowth5Y: -0.04,
  });
  assert.equal(result.value, -4);
  assert.equal(result.inputs.haircut, 100);
});
