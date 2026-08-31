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

// The contrast gate's allowlist, and the whole of it. Decision 51 settled what
// may sit at --text-4 and therefore what may carry data-contrast-exempt: the
// tie-break is whether a human READS IT AS LANGUAGE. Only a non-linguistic
// glyph or state marker is exempt. Everything a person reads for meaning —
// a button's label, a provenance line, a weight annotation — is language, goes
// to --text-3, and stays gated.
//
// An em dash means "no value in force", and it is ratified explicitly as a
// marker rather than prose: the shared theme sanctions it at --text-4
// (.km-cell--missing: "em dash; scores neutral 55%, not zero"). Spread this
// onto the node that renders one so the gate allowlists exactly those.
//
// The other two survivors are the `pin` / `model` state markers and the
// unpinned pin glyph; they are inline, not routed through here.
//
// `disabledMarkerProps` used to live beside this and blanket-exempted any
// disabled control's label. Decision 51 removed the category it served — a
// disabled label is language, sits at --text-3, and lets the control carry the
// disabled state — so the helper is gone rather than left unused.
export const missingMarkerProps = (value) => (value == null ? { "data-contrast-exempt": "" } : {});

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
