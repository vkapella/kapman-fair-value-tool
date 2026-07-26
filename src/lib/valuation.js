// Shared valuation math. Imported by both the SPA and the server (snapshot
// endpoint) so frozen snapshot rows are computed with exactly the same
// formulas the UI displays.
export const calcIV = (eps, growth, g) => eps * (g.peNoGrowth + g.g * growth) * (g.avgYieldAAA / g.bondYield);
export const calcPctIV = (price, iv) => (iv > 0 ? (price / iv) * 100 : 0);
export const calcScore = (s) => (s.valuation || 0) + (s.growthScore || 0) + (s.moat || 0) + (s.executionRisk || 0) + (s.economy || 0);

export const allocationSignals = (s, iv, pctIV, score) => {
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
