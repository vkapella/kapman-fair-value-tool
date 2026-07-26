import test from "node:test";
import assert from "node:assert/strict";
import { calcIV, calcPctIV } from "../src/lib/valuation.js";
import { selectAutomaticValuationEps } from "../server/lib/eps.js";

const globals = { peNoGrowth: 8.5, g: 2, avgYieldAAA: 4.4, bondYield: 4.4 };

test("intrinsic value follows the supplied valuation EPS, including a lower positive value", () => {
  const gaapTtmEps = 10;
  const valuationEps = 6;

  assert.equal(calcIV(valuationEps, 0, globals), 51);
  assert.ok(calcIV(valuationEps, 0, globals) < calcIV(gaapTtmEps, 0, globals));
  assert.equal(calcPctIV(51, calcIV(valuationEps, 0, globals)), 100);
});

test("intrinsic value abstains when valuation EPS is not positive", () => {
  assert.equal(calcIV(null, 10, globals), null);
  assert.equal(calcIV(0, 10, globals), null);
  assert.equal(calcIV(-1, 10, globals), null);
});

test("automatic valuation EPS selects the lower positive source conservatively", () => {
  assert.deepEqual(selectAutomaticValuationEps(10, 6), {
    basis: "adjusted",
    value: 6,
    reason: null,
  });
  assert.equal(selectAutomaticValuationEps(-2, 3).value, 3);
  assert.equal(selectAutomaticValuationEps(0, -1).value, null);
});
