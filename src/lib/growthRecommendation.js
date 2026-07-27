const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const toPercent = (value) => (isFiniteNumber(value) ? value * 100 : null);
const roundHalfPoint = (value) => Math.round(value * 2) / 2;

const CYCLICAL_SECTORS = new Set(["Basic Materials", "Consumer Cyclical", "Energy"]);

function weightedEvidence(inputs) {
  const weighted = [
    ["FY+1 consensus", inputs.forwardEpsGrowth, 0.5],
    ["3Y EPS history", inputs.epsGrowth3Y, 0.25],
    ["5Y EPS history", inputs.epsGrowth5Y, 0.25],
  ].filter(([, value]) => isFiniteNumber(value));

  if (weighted.length === 0) return { value: null, labels: [], observations: [] };
  const totalWeight = weighted.reduce((sum, [, , weight]) => sum + weight, 0);
  const observations = weighted.map(([label, value, weight]) => ({
    label,
    // Growth feeds can contain extreme recovery-from-loss base effects.
    value: clamp(value, -0.2, 0.4),
    weight,
  }));
  return {
    value: observations.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight,
    labels: observations.map((item) => item.label),
    observations,
  };
}

function retainedEarningsCapacity({ returnOnEquity, payoutRatioTtm }) {
  if (!isFiniteNumber(returnOnEquity) || !isFiniteNumber(payoutRatioTtm)) return null;
  // Very high/negative ROE commonly reflects a thin or negative equity base,
  // so it is not a dependable ceiling on sustainable EPS growth.
  if (returnOnEquity <= 0 || returnOnEquity > 0.6 || payoutRatioTtm < 0 || payoutRatioTtm > 1) return null;
  return returnOnEquity * (1 - payoutRatioTtm);
}

function classificationFor(inputs, evidence, capacity) {
  const quoteType = String(inputs.quoteType || "").toUpperCase();
  const sector = String(inputs.sector || "");
  const observations = evidence.observations.map(({ value }) => value);
  const spread = observations.length >= 2 ? Math.max(...observations) - Math.min(...observations) : null;

  if (quoteType.includes("ETF") || quoteType.includes("FUND")) {
    return { key: "index", label: "ETF / index default", cap: 8, defaultValue: 7, spread };
  }
  if (/financial/i.test(sector)) {
    return { key: "financial", label: "Financial company", cap: 8, spread };
  }
  if (CYCLICAL_SECTORS.has(sector) || (spread != null && spread > 0.15)) {
    return { key: "cyclical", label: "Cyclical / unstable evidence", cap: 10, spread };
  }
  if (isFiniteNumber(inputs.marketCap) && inputs.marketCap >= 200_000_000_000) {
    return { key: "mega-cap", label: "Mature / mega-cap", cap: 15, spread };
  }
  if (
    isFiniteNumber(inputs.forwardEpsGrowth) && inputs.forwardEpsGrowth >= 0.2
    && isFiniteNumber(inputs.epsGrowth5Y) && inputs.epsGrowth5Y >= 0.15
    && isFiniteNumber(capacity) && capacity >= 0.15
  ) {
    return { key: "verified-growth", label: "Verified high growth", cap: 20, spread };
  }
  return { key: "operating-company", label: "Operating company", cap: 12, spread };
}

/**
 * Produces an advisory growth assumption in percentage points, matching the
 * operator-owned `stock.growth` field. Provider inputs are fractions.
 */
export function suggestIvGrowth(inputs = {}) {
  const evidence = weightedEvidence(inputs);
  const capacity = retainedEarningsCapacity(inputs);
  const classification = classificationFor(inputs, evidence, capacity);

  if (classification.defaultValue != null) {
    return {
      value: classification.defaultValue,
      confidence: "low",
      classification: classification.label,
      cap: classification.cap,
      basis: "Long-run index default",
      warning: "Company-level EPS and reinvestment metrics are not comparable for an ETF.",
      inputs: { forward: null, history3Y: null, history5Y: null, capacity: null },
    };
  }

  if (evidence.value == null || (evidence.observations.length < 2 && capacity == null)) {
    return {
      value: null,
      confidence: "unavailable",
      classification: classification.label,
      cap: classification.cap,
      basis: evidence.labels.join(" + ") || "Insufficient provider evidence",
      warning: "A suggestion requires at least two growth observations, or one observation plus a valid capacity check.",
      inputs: {
        forward: toPercent(inputs.forwardEpsGrowth),
        history3Y: toPercent(inputs.epsGrowth3Y),
        history5Y: toPercent(inputs.epsGrowth5Y),
        capacity: toPercent(capacity),
      },
    };
  }

  const supported = capacity == null ? evidence.value : Math.min(evidence.value, capacity);
  const hasForward = isFiniteNumber(inputs.forwardEpsGrowth);
  const highDispersion = classification.spread != null && classification.spread > 0.15;
  const haircut = supported > 0 ? (highDispersion ? 0.65 : hasForward ? 0.8 : 0.65) : 1;
  const capped = Math.min(supported * haircut, classification.cap / 100);
  const value = roundHalfPoint(capped * 100);
  const analystCount = isFiniteNumber(inputs.analystCount) ? inputs.analystCount : null;
  const tightEvidence = classification.spread != null && classification.spread <= 0.05;
  const confidence = (
    evidence.observations.length === 3 && capacity != null && analystCount >= 5 && tightEvidence
  ) ? "high" : (
    evidence.observations.length >= 2 && !highDispersion && (hasForward || capacity != null)
  ) ? "medium" : "low";

  const basisParts = [...evidence.labels];
  if (capacity != null) basisParts.push("ROE × retained earnings");
  return {
    value,
    confidence,
    classification: classification.label,
    cap: classification.cap,
    basis: basisParts.join(" + "),
    warning: highDispersion
      ? "Growth evidence differs by more than 15 percentage points; a 35% haircut and lower cap were applied."
      : null,
    inputs: {
      forward: toPercent(inputs.forwardEpsGrowth),
      history3Y: toPercent(inputs.epsGrowth3Y),
      history5Y: toPercent(inputs.epsGrowth5Y),
      capacity: toPercent(capacity),
      evidence: toPercent(evidence.value),
      supported: toPercent(supported),
      haircut: haircut * 100,
      analystCount,
    },
  };
}
