// Shared valuation math. Imported by both the SPA and the server (snapshot
// endpoint) so frozen snapshot rows are computed with exactly the same
// formulas the UI displays.

// Graham's formula is only meaningful on positive earnings. A loss-making
// company yields a negative "intrinsic value", and the old guard (`iv > 0 ? …
// : 0`) turned that into a displayed 0.00% of IV -- which reads as infinitely
// cheap and fired every allocation signal at maximum aggression. Null means
// "cannot be valued", and every consumer must render it as such rather than
// inventing a number.
// Also null when the formula itself lands non-positive: a steeply negative
// growth rate drives the multiplier below zero even on positive EPS (XOM at
// -43% growth produced an intrinsic value of -$223.81). A negative intrinsic
// value is meaningless whatever the cause.
export const calcIV = (eps, growth, g) => {
  if (eps == null || !(eps > 0)) return null;
  const iv = eps * (g.peNoGrowth + g.g * growth) * (g.avgYieldAAA / g.bondYield);
  return iv > 0 ? iv : null;
};
export const calcPctIV = (price, iv) => (iv == null || !(iv > 0) || price == null ? null : (price / iv) * 100);
export const calcScore = (s) => (s.valuation || 0) + (s.growthScore || 0) + (s.moat || 0) + (s.executionRisk || 0) + (s.economy || 0);

export const allocationSignals = (s, iv, pctIV, score) => {
  // No valuation, no recommendation. Signals key off pctIV, so an unvaluable
  // row must abstain rather than fall through the thresholds.
  if (pctIV == null) {
    return { buyShares: false, buySharesPct: null, sellPutsNote: "n/a", buyCallsNote: "n/a" };
  }
  const buyShares = score >= 75 && pctIV < 110;
  const buySharesPct = !buyShares ? null
    : score >= 80 && pctIV < 95 ? Math.min(5, Math.round((100 - pctIV) / 8))
    : score >= 75 && pctIV < 105 ? 2 : 1;
  const sellPuts = score >= 75 && pctIV < 100;
  const sellPutsNote = sellPuts
    ? pctIV < 85 ? "10% AV | 2yr 10% below"
    : pctIV < 95 ? "5% AV | 2yr 15% below" : "ON RADAR" : "no";
  const buyCalls = score >= 75 && pctIV < 92;
  const buyCallsNote = buyCalls ? (pctIV < 80 ? "3% | 2yr 1% above" : "ON RADAR") : "no";
  return { buyShares, buySharesPct, sellPutsNote, buyCallsNote };
};
