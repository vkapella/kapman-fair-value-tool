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
// Score bands (UI-3): ≥80 pos, 75–79 accent, 65–74 warn, <65 text-3.
// text-3 on surface-3 passes AA at 4.62:1 — do not darken either token
// without re-measuring (Amendment 02 §2).
export const scoreColor = (s) =>
  s >= 80 ? "bg-pos text-bg"
  : s >= 75 ? "bg-accent text-bg"
  : s >= 65 ? "bg-warn text-bg" : "bg-surface-3 text-text-3";

// An em dash means "no value in force". That is a disabled marker, not prose,
// and the shared theme sanctions it at --text-4 (.km-cell--missing: "em dash;
// scores neutral 55%, not zero"). Spread this onto the node that renders one
// so the contrast gate allowlists exactly those — prose at --text-4 still
// fails, which is the distinction UI-0 step 5 draws.
export const missingMarkerProps = (value) => (value == null ? { "data-contrast-exempt": "" } : {});

// A disabled control's label sits at --text-4 per UI-0 step 5, and WCAG 1.4.3
// excludes inactive components from the contrast minimum. Applied only while
// the control is actually disabled, so the enabled state stays gated.
// (Flagged upstream: "never prose" and this enumeration disagree on whether a
// disabled *label* is a marker.)
export const disabledMarkerProps = (isDisabled) => (isDisabled ? { "data-contrast-exempt": "" } : {});

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
