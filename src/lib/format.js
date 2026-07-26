// null = not valuable (no positive EPS). Rendered as an em dash everywhere,
// never as a number -- see the comment in lib/valuation.js.
export const fmtMoney = (n) => (
  n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);
export const fmtPctIV = (pct) => (pct == null ? "—" : `${pct.toFixed(2)}%`);

export const ivColor = (pct) =>
  pct == null ? "text-zinc-600"
  : pct < 80 ? "text-emerald-400" : pct < 100 ? "text-emerald-300" : pct < 110 ? "text-amber-300" : "text-rose-400";
export const ivBg = (pct) =>
  pct == null ? "bg-zinc-800/40 border-zinc-700/40"
  : pct < 80 ? "bg-emerald-500/20 border-emerald-500/40"
  : pct < 100 ? "bg-emerald-500/10 border-emerald-500/30"
  : pct < 110 ? "bg-amber-500/10 border-amber-500/30"
  : "bg-rose-500/10 border-rose-500/30";
export const scoreColor = (s) =>
  s >= 80 ? "bg-emerald-500 text-emerald-950"
  : s >= 75 ? "bg-emerald-400 text-emerald-950"
  : s >= 65 ? "bg-amber-400 text-amber-950" : "bg-zinc-600 text-zinc-200";

export function formatFieldValue(value, format) {
  if (value == null || value === "") return "—";
  if (format === "percent" && typeof value === "number") return `${(value * 100).toFixed(2)}%`;
  if (format === "currency" && typeof value === "number") return `$${value.toLocaleString()}`;
  if ((format === "ratio" || format === "number") && typeof value === "number") return value.toFixed(2);
  return String(value);
}

export function valuationRangeHint(key) {
  const ranges = {
    pctIV: "<70 | 70–90 | 90–110 | 110–130 | >130",
    trailingPE: "<12 | 12–15 | 15–20 | 20–25 | >25",
    priceToBook: "<1.2 | 1.2–1.5 | 1.5–3 | 3–5 | >5",
    debtToEquity: "<0.5 | 0.5–1.0 | 1.0–1.5 | 1.5–2.0 | >2.0",
    currentRatio: ">2.0 | 1.5–2.0 | 1.0–1.5 | 0.5–1.0 | <0.5",
  };
  return ranges[key] || null;
}
