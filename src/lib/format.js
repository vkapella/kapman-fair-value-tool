// null = not valuable (no positive EPS). Rendered as an em dash everywhere,
// never as a number -- see the comment in lib/valuation.js.
export const fmtMoney = (n) => (
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);
export const fmtPctIV = (pct) => (pct == null ? "—" : `${pct.toFixed(2)}%`);

export const ivColor = (pct) =>
  pct == null ? "text-text-4"
  : pct < 80 ? "text-pos" : pct < 100 ? "text-pos" : pct < 110 ? "text-warn" : "text-neg";
export const ivBg = (pct) =>
  pct == null ? "bg-surface-3 border-border"
  : pct < 80 ? "bg-pos-dim border-pos-border"
  : pct < 100 ? "bg-pos-dim border-pos-border"
  : pct < 110 ? "bg-warn-dim border-warn-border"
  : "bg-neg-dim border-neg-border";
export const scoreColor = (s) =>
  s >= 80 ? "bg-pos text-bg"
  : s >= 75 ? "bg-accent text-bg"
  : s >= 65 ? "bg-warn text-bg" : "bg-surface-3 text-text-2";

export function formatFieldValue(value, format) {
  if (value == null || value === "") return "—";
  if (format === "percent" && typeof value === "number") return `${(value * 100).toFixed(2)}%`;
  if (format === "percentValue" && typeof value === "number") return `${value.toFixed(2)}%`;
  if (format === "currency" && typeof value === "number") return `$${value.toLocaleString()}`;
  if ((format === "ratio" || format === "number") && typeof value === "number") return value.toFixed(2);
  return String(value);
}

export function valuationRangeHint(key) {
  const ranges = {
    pctIV: "<70 | 70–90 | 90–110 | 110–130 | >130",
    trailingPE: "<12 | 12–15 | 15–20 | 20–25 | >25",
    forwardPE: "<12 | 12–15 | 15–20 | 20–25 | >25",
    priceToBook: "<1.2 | 1.2–1.5 | 1.5–3 | 3–5 | >5",
    debtToEquity: "<0.5 | 0.5–1.0 | 1.0–1.5 | 1.5–2.0 | >2.0",
    currentRatio: ">2.0 | 1.5–2.0 | 1.0–1.5 | 0.5–1.0 | <0.5",
  };
  return ranges[key] || null;
}
