const NEUTRAL_WEIGHT = 0.55;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickBand(categoryDef, score) {
  return categoryDef.bands.find((band) => score >= band.min && score <= band.max) || categoryDef.bands[categoryDef.bands.length - 1];
}

function asNumber(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function byIndex(value, map, fallback = NEUTRAL_WEIGHT) {
  const idx = asNumber(value);
  if (idx == null) return fallback;
  return map[idx] ?? fallback;
}

function metric(rawValue, evaluator) {
  if (rawValue == null) return { raw: null, score: NEUTRAL_WEIGHT };
  return { raw: rawValue, score: evaluator(rawValue) };
}

export const RUBRIC_DEF = {
  valuation: {
    label: "Valuation /20",
    max: 20,
    bands: [
      { min: 18, max: 20, label: "Deep value — significant margin of safety", description: "Price is trading below 70% of intrinsic value with a low P/E and P/B; Graham's ideal entry point." },
      { min: 14, max: 17, label: "Good value — Graham's defensive criteria met", description: "Price is 70–90% of intrinsic value with a P/E under 15; a disciplined entry with meaningful upside." },
      { min: 10, max: 13, label: "Fair value — no margin of safety", description: "Price approximates intrinsic value; adequate for high-quality compounders but no buffer against error." },
      { min: 6, max: 9, label: "Moderately overvalued — growth must justify the premium", description: "Price exceeds intrinsic value by 10–30%; requires sustained earnings delivery to earn its multiple." },
      { min: 0, max: 5, label: "Speculative premium — Graham would not underwrite this price", description: "Price is more than 30% above intrinsic value; the margin of safety is negative." },
    ],
    quantitativeFields: [
      { key: "trailingPE", label: "Trailing P/E", format: "ratio", description: "Trailing P/E — price relative to last twelve months earnings" },
      { key: "forwardPE", label: "Forward P/E", format: "ratio", description: "Forward P/E — price relative to next twelve months consensus earnings" },
      { key: "priceToBook", label: "Price-to-book", format: "ratio", description: "Price-to-book — price relative to net asset value per share" },
      { key: "debtToEquity", label: "Debt-to-equity", format: "ratio", description: "Debt-to-equity — financial leverage; Graham required this below 1.0 for defensive stocks" },
      { key: "currentRatio", label: "Current ratio", format: "ratio", description: "Current ratio — short-term liquidity; Graham required at least 2.0" },
    ],
    qualitativeFields: [],
  },
  growthScore: {
    label: "Growth /20",
    max: 20,
    bands: [
      { min: 18, max: 20, label: "Exceptional compounder — consistent double-digit organic growth", description: "Ten or more years of uninterrupted EPS growth above 15% annually, funded by operations not debt." },
      { min: 14, max: 17, label: "Solid growth record — meets Graham's ten-year consistency test", description: "Seven or more years of EPS growth at 10–15% CAGR with free cash flow confirming the earnings quality." },
      { min: 10, max: 13, label: "Adequate growth — watch earnings quality carefully", description: "Five to seven years of 5–10% EPS growth; acceptable if margins are stable and debt is not fueling the headline number." },
      { min: 6, max: 9, label: "Unreliable trend — Graham would demand a steep discount", description: "Fewer than five years of consistent growth or a track record that includes earnings deficits or heavy dilution." },
      { min: 0, max: 5, label: "Fails the consistency test", description: "Negative EPS years in the recent record, shrinking margins, or growth that is entirely debt or acquisition funded." },
    ],
    quantitativeFields: [
      { key: "epsGrowthRate", label: "EPS growth rate", format: "percent", description: "EPS growth rate — year-over-year earnings per share change (sourced from top-level yahoo field)" },
      { key: "revenueGrowth", label: "Revenue growth", format: "percent", description: "Revenue growth — top-line expansion confirming earnings growth is real" },
      { key: "freeCashflow", label: "Free cash flow", format: "currency", description: "Free cash flow — operating cash after capex; confirms earnings are not accounting artifacts" },
      { key: "totalDebt", label: "Total debt", format: "currency", description: "Total debt — Graham flagged debt-funded growth as unreliable" },
      { key: "totalCash", label: "Total cash", format: "currency", description: "Total cash — balance sheet cushion; net debt = total debt minus total cash" },
    ],
    qualitativeFields: [
      { key: "growthConsistency", label: "EPS consistency (10-year record)", type: "select", options: ["10+ years no deficits", "7–9 years no deficits", "5–6 years no deficits", "3–4 years or deficit present", "Under 3 years or chronic deficits"], description: "Graham required earnings in every year of the past ten; check annual EPS history on the Intrinsic Value tab or SEC filings." },
      { key: "growthFundingQuality", label: "Earnings quality", type: "select", options: ["Entirely organic / FCF-funded", "Mostly organic with modest debt", "Mixed organic and debt", "Primarily debt or acquisition-driven", "Dilution or financial engineering"], description: "Buffett prizes earnings generated by the business, not manufactured by the balance sheet." },
    ],
  },
  moat: {
    label: "Moat /20",
    max: 20,
    bands: [
      { min: 18, max: 20, label: "Wide moat — Buffett's castle with piranhas in the moat", description: "ROIC consistently above 20% for ten or more years, with identifiable and durable competitive barriers." },
      { min: 14, max: 17, label: "Solid moat — clear pricing power and above-average returns", description: "ROE above 15% sustained for seven or more years; competitors have not materially eroded margins." },
      { min: 10, max: 13, label: "Narrow moat — advantage exists but erosion is possible", description: "Margins are above industry average but declining, or the source of advantage is difficult to pinpoint." },
      { min: 6, max: 9, label: "Shallow moat — margin pressure is a present risk", description: "Returns on capital are near the cost of capital; the business competes primarily on price." },
      { min: 0, max: 5, label: "No moat — commodity economics", description: "Gross margins are thin, returns on equity are below 10%, and there is no identifiable reason a customer would not switch to a lower-cost alternative." },
    ],
    quantitativeFields: [
      { key: "returnOnEquity", label: "Return on equity", format: "percent", description: "Return on equity — net income as a percentage of shareholder equity; Buffett's primary moat proxy, target above 15%" },
      { key: "returnOnAssets", label: "Return on assets", format: "percent", description: "Return on assets — how efficiently assets generate earnings; complements ROE by removing leverage effects" },
      { key: "grossMargins", label: "Gross margin", format: "percent", description: "Gross margin — revenue remaining after cost of goods; pricing power shows up here first" },
      { key: "operatingMargins", label: "Operating margin", format: "percent", description: "Operating margin — earnings after overhead; reveals whether the business model is structurally profitable" },
      { key: "profitMargins", label: "Net profit margin", format: "percent", description: "Net profit margin — the bottom line kept per dollar of revenue" },
    ],
    qualitativeFields: [
      { key: "moatType", label: "Moat type", type: "select", options: ["Brand and consumer loyalty", "Network effect", "Cost advantage / low-cost producer", "High switching costs", "Efficient scale / regional monopoly", "Patent or regulatory license", "No identifiable moat"], description: "Buffett identified five durable moat sources; the type matters as much as the width because different moats decay at different rates." },
      { key: "moatDurability", label: "Moat trajectory", type: "select", options: ["Widening — competitive position strengthening", "Stable — no material erosion visible", "Narrowing slowly — watching carefully", "Narrowing rapidly — disruption underway", "Moat already broken"], description: "Buffett wrote that every moat is either widening or narrowing even when the effect is imperceptible quarter to quarter." },
    ],
  },
  executionRisk: {
    label: "Execution Risk /10",
    max: 10,
    bands: [
      { min: 9, max: 10, label: "Owner-operator quality — Buffett's honest lord of the castle", description: "Founder or significant insider ownership, conservative compensation, candid shareholder communication, and a proven record of intelligent capital allocation." },
      { min: 7, max: 8, label: "Good stewardship — aligned and competent", description: "Management compensation is reasonable, buybacks are executed below intrinsic value, and the record shows no major capital allocation errors." },
      { min: 5, max: 6, label: "Neutral — professional management, no red flags", description: "Standard corporate governance with market-rate compensation; no differentiated edge but no clear warning signs." },
      { min: 3, max: 4, label: "Caution — misalignment or capital allocation concerns", description: "Excessive dilution, poorly timed buybacks, acquisition sprees, or compensation that does not track shareholder returns." },
      { min: 0, max: 2, label: "High risk — Graham and Buffett would not invest regardless of price", description: "Material governance failures, earnings restatements, aggressive accounting, or management that treats the company as a personal ATM." },
    ],
    quantitativeFields: [
      { key: "insidersPercentHeld", label: "Insider ownership", format: "percent", description: "Insider ownership — percentage of shares held by directors and officers; higher is better as it aligns interests with shareholders" },
      { key: "institutionsPercentHeld", label: "Institutional ownership", format: "percent", description: "Institutional ownership — percentage held by institutions; very high concentration can mean crowded exit risk" },
      { key: "shortPercentOfFloat", label: "Short interest", format: "percent", description: "Short interest — percentage of float sold short; elevated short interest can signal market skepticism about management or accounting" },
    ],
    qualitativeFields: [
      { key: "managementQuality", label: "Management quality", type: "select", options: ["Exceptional — founder or owner-operator with long track record", "Good — professional team with aligned incentives", "Average — standard corporate management", "Below average — some misalignment or poor decisions", "Poor — governance failures or integrity concerns"], description: "Buffett says he looks for managers who are talented, honest, and energetic — and that dishonesty or incompetence cannot be fixed by any price." },
      { key: "capitalAllocation", label: "Capital allocation track record", type: "select", options: ["Outstanding — buybacks below IV, smart acquisitions", "Good — generally sensible with occasional missteps", "Mixed — some value-creating and some value-destroying", "Poor — chronic over-acquisition or ill-timed buybacks", "Destructive — actively eroding per-share value"], description: "Graham measured management quality by whether retained earnings produced at least a dollar of market value for every dollar kept." },
    ],
  },
  economy: {
    label: "Economy /30",
    max: 30,
    bands: [
      { min: 27, max: 30, label: "Maximum tailwind — all macro conditions favorable", description: "Falling or stable interest rates, industry in a secular growth phase, non-cyclical demand, and pricing power that holds through inflation." },
      { min: 21, max: 26, label: "Normal environment — business can compound regardless of macro", description: "Neutral rate environment, stable industry dynamics, modest cyclicality; a quality business performs here." },
      { min: 15, max: 20, label: "Headwinds present but manageable for durable franchises", description: "Rising rates or mild sector pressure; requires a wider margin of safety and higher confidence in the moat." },
      { min: 8, max: 14, label: "Meaningful macro drag — proceed with caution", description: "Elevated rates, sector under regulatory or competitive pressure, or meaningful cyclical exposure at a vulnerable point in the cycle." },
      { min: 0, max: 7, label: "Severe headwinds — Graham would demand an extreme discount", description: "Existential regulatory threat, deep cyclical trough, or structural industry decline; only the strongest balance sheets survive." },
    ],
    quantitativeFields: [
      { key: "beta", label: "Beta", format: "number", description: "Beta — sensitivity of the stock's returns to market movements; above 1.5 signals high cyclicality, below 0.8 suggests defensive characteristics" },
      { key: "dividendYield", label: "Dividend yield", format: "percent", description: "Dividend yield — Graham required 20 or more years of uninterrupted dividends as a quality filter; yield also signals cash generation discipline" },
      { key: "fiftyTwoWeekHigh", label: "52-week high", format: "currency", description: "52-week high — context for where current price sits in the recent range" },
      { key: "fiftyTwoWeekLow", label: "52-week low", format: "currency", description: "52-week low — distance from trough signals cyclical positioning" },
      { key: "sector", label: "Sector", format: "text", description: "Sector — used to calibrate industry cyclicality and regulatory exposure" },
      { key: "industry", label: "Industry", format: "text", description: "Industry — provides context for competitive dynamics and secular growth or decline" },
    ],
    qualitativeFields: [
      { key: "rateEnvironment", label: "Interest rate environment", type: "select", options: ["Falling rates — tailwind for equity valuations", "Stable rates — neutral", "Rising rates — headwind, particularly for high-multiple stocks", "Peak rates — watching for inflection", "Rate uncertainty — high dispersion of outcomes"], description: "Graham's revised formula explicitly adjusts intrinsic value for bond yields; the bond yield input in your globals already captures this — use this field for directional context." },
      { key: "industryTailwind", label: "Industry tailwind / headwind", type: "select", options: ["Strong secular tailwind — multi-year demand growth", "Mild tailwind — growing market", "Neutral — stable market share dynamics", "Mild headwind — market share or volume pressure", "Structural decline — secular demand destruction"], description: "Buffett avoids industries in structural decline regardless of price; Kodak was cheap for a reason." },
      { key: "regulatoryRisk", label: "Regulatory risk", type: "select", options: ["Minimal — unregulated or lightly regulated", "Low — standard oversight", "Moderate — subject to periodic regulatory change", "Elevated — active regulatory scrutiny or pending legislation", "Severe — existential regulatory threat"], description: "Graham viewed regulated industries as having capped upside; Buffett's franchise definition explicitly excludes regulated businesses from the highest moat tier." },
    ],
  },
};

export function suggestScore(category, fundamentals, pctIV, globals, overrides = {}) {
  const def = RUBRIC_DEF[category];
  if (!def) return { suggested: 0, breakdown: [] };

  const all = { ...(fundamentals || {}) };
  if (all.epsGrowthRate == null && globals?.epsGrowthRate != null) all.epsGrowthRate = globals.epsGrowthRate;

  const metrics = [];
  const push = (key, label, weight, evaluator, value) => {
    const isOverride = Object.prototype.hasOwnProperty.call(overrides, key);
    const resolved = isOverride ? overrides[key] : value;
    const normalized = typeof resolved === "string" ? resolved.trim() : resolved;
    const numeric = typeof normalized === "string" ? asNumber(normalized) : normalized;
    const m = metric(numeric, evaluator);
    metrics.push({ key, label, value: normalized === "" ? null : normalized, weight, score: m.score, isOverride });
  };

  if (category === "valuation") {
    push("pctIV", "% of intrinsic value", 0.5, (v) => (v < 70 ? 1 : v <= 90 ? 0.8 : v <= 110 ? 0.6 : v <= 130 ? 0.35 : 0.1), pctIV);
    push("trailingPE", "Trailing P/E", 0.15, (v) => (v < 12 ? 1 : v <= 15 ? 0.8 : v <= 20 ? 0.6 : v <= 25 ? 0.35 : 0.1), all.trailingPE);
    push("forwardPE", "Forward P/E", 0.1, (v) => (v < 12 ? 1 : v <= 15 ? 0.8 : v <= 20 ? 0.6 : v <= 25 ? 0.35 : 0.1), all.forwardPE);
    push("priceToBook", "Price to book", 0.15, (v) => (v < 1.2 ? 1 : v <= 1.5 ? 0.8 : v <= 3 ? 0.6 : v <= 5 ? 0.35 : 0.1), all.priceToBook);
    push("debtToEquity", "Debt to equity", 0.05, (v) => (v < 0.5 ? 1 : v <= 1 ? 0.8 : v <= 1.5 ? 0.6 : v <= 2 ? 0.35 : 0.1), all.debtToEquity);
    push("currentRatio", "Current ratio", 0.05, (v) => (v > 2 ? 1 : v >= 1.5 ? 0.8 : v >= 1 ? 0.6 : v >= 0.5 ? 0.35 : 0.1), all.currentRatio);
  }

  if (category === "growthScore") {
    const growthEval = (v) => (v > 0.2 ? 1 : v >= 0.15 ? 0.85 : v >= 0.1 ? 0.65 : v >= 0.05 ? 0.4 : 0.15);
    push("epsGrowthRate", "EPS growth rate", 0.35, growthEval, all.epsGrowthRate);
    push("revenueGrowth", "Revenue growth", 0.25, growthEval, all.revenueGrowth);
    push("freeCashflow", "Free cash flow", 0.15, (v) => (v > 0 ? 0.9 : 0.1), all.freeCashflow);
    push("debtVsCash", "Debt vs cash", 0.15, (v) => (v < 0.5 ? 1 : v <= 1 ? 0.8 : v <= 2 ? 0.55 : v <= 4 ? 0.3 : 0.1), (all.totalDebt != null && all.totalCash ? all.totalDebt / all.totalCash : null));
    push("growthConsistency", "EPS consistency", 0.1, (v) => byIndex(v, { 0: 1, 1: 0.8, 2: 0.6, 3: 0.3, 4: 0.1 }), overrides.growthConsistency);
  }

  if (category === "moat") {
    push("returnOnEquity", "Return on equity", 0.3, (v) => (v > 0.25 ? 1 : v >= 0.2 ? 0.85 : v >= 0.15 ? 0.65 : v >= 0.1 ? 0.4 : 0.15), all.returnOnEquity);
    push("grossMargins", "Gross margin", 0.25, (v) => (v > 0.6 ? 1 : v >= 0.4 ? 0.85 : v >= 0.25 ? 0.65 : v >= 0.1 ? 0.4 : 0.15), all.grossMargins);
    push("operatingMargins", "Operating margin", 0.2, (v) => (v > 0.3 ? 1 : v >= 0.2 ? 0.85 : v >= 0.1 ? 0.65 : v >= 0.05 ? 0.4 : 0.15), all.operatingMargins);
    push("returnOnAssets", "Return on assets", 0.15, (v) => (v > 0.15 ? 1 : v >= 0.1 ? 0.85 : v >= 0.07 ? 0.65 : v >= 0.03 ? 0.4 : 0.15), all.returnOnAssets);
    push("moatType", "Moat type", 0.1, (v) => byIndex(v, { 0: 1, 1: 0.9, 2: 0.85, 3: 0.8, 4: 0.7, 5: 0.75, 6: 0.15 }), overrides.moatType);
  }

  if (category === "executionRisk") {
    push("managementQuality", "Management quality", 0.4, (v) => byIndex(v, { 0: 1, 1: 0.8, 2: 0.6, 3: 0.35, 4: 0.1 }), overrides.managementQuality);
    push("capitalAllocation", "Capital allocation", 0.3, (v) => byIndex(v, { 0: 1, 1: 0.8, 2: 0.6, 3: 0.35, 4: 0.1 }), overrides.capitalAllocation);
    push("insidersPercentHeld", "Insider ownership", 0.15, (v) => (v > 0.2 ? 1 : v >= 0.1 ? 0.8 : v >= 0.05 ? 0.6 : v >= 0.01 ? 0.4 : 0.2), all.insidersPercentHeld);
    push("shortPercentOfFloat", "Short percent of float", 0.15, (v) => (v < 0.02 ? 1 : v <= 0.05 ? 0.8 : v <= 0.1 ? 0.6 : v <= 0.2 ? 0.35 : 0.1), all.shortPercentOfFloat);
  }

  if (category === "economy") {
    push("beta", "Beta", 0.2, (v) => (v < 0.6 ? 1 : v <= 0.9 ? 0.85 : v <= 1.2 ? 0.65 : v <= 1.6 ? 0.4 : 0.15), all.beta);
    push("rateEnvironment", "Rate environment", 0.2, (v) => byIndex(v, { 0: 1, 1: 0.75, 2: 0.45, 3: 0.6, 4: 0.4 }), overrides.rateEnvironment);
    push("industryTailwind", "Industry tailwind", 0.25, (v) => byIndex(v, { 0: 1, 1: 0.8, 2: 0.6, 3: 0.35, 4: 0.1 }), overrides.industryTailwind);
    push("regulatoryRisk", "Regulatory risk", 0.2, (v) => byIndex(v, { 0: 1, 1: 0.8, 2: 0.6, 3: 0.35, 4: 0.1 }), overrides.regulatoryRisk);
    push("dividendYield", "Dividend yield", 0.15, (v) => (v > 0.03 ? 1 : v >= 0.01 ? 0.75 : v > 0 ? 0.5 : 0.4), all.dividendYield);
  }

  const weightedScore = metrics.reduce((sum, item) => sum + (item.score * item.weight), 0);
  const totalWeight = metrics.reduce((sum, item) => sum + item.weight, 0) || 1;
  const normalized = weightedScore / totalWeight;
  const suggested = clamp(Math.round(normalized * def.max), 0, def.max);

  const breakdown = metrics.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.value ?? null,
    contribution: Number((item.score * item.weight * def.max).toFixed(2)),
    bandLabel: pickBand(def, Math.round(item.score * def.max)).label,
    isOverride: item.isOverride,
  }));

  return { suggested, breakdown };
}
