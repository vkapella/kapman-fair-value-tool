// The editing semantics that the inline cells carry, extracted from their JSX
// so they can be tested and so the AG Grid editors (UI-5) and the hand-rolled
// cells call exactly the same rules. The migration's stated risk is that a
// naive port silently loses the override marker and the pinning side effect;
// these functions are where that behaviour lives, and test/cell-semantics
// pins every one of them.

/** A factor cell shows the provider's value until an operator overrides it.
 *  `manual != null` IS the override — that is what draws the ● marker and
 *  brightens the cell, so nothing may collapse the two into one value. */
export function factorState({ fetched, manual }) {
  const hasOverride = manual != null;
  return {
    hasOverride,
    effective: hasOverride ? manual : fetched,
    // The value in force, never the figure it replaced.
    showsMarker: hasOverride,
  };
}

/** Commit of a factor edit. An empty commit CLEARS the override (back to the
 *  provider value); it never writes 0, and it never writes when nothing
 *  changed. Returns the intent so a caller cannot mistake "clear" for "set". */
export function factorCommit(draft, { manual, format } = {}) {
  const raw = typeof draft === "string" ? draft.trim() : draft;

  if (raw === "" || raw == null) {
    // Clearing an override restores the provider value; clearing when there
    // is no override is a no-op, not a write of null.
    return manual != null ? { action: "clear", value: null } : { action: "noop" };
  }

  if (format === "text") {
    return raw === manual ? { action: "noop" } : { action: "set", value: raw };
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return { action: "noop" };
  return n === manual ? { action: "noop" } : { action: "set", value: n };
}

/** Numeric cell commit: clamps to [0, max] and refuses no-op writes. The
 *  refusal is load-bearing — the EPS cell's handler pins the row and stamps
 *  the date, which a click-in/click-out must never do. */
export function numCommit(draft, { value, max } = {}) {
  let n = parseFloat(draft);
  if (Number.isNaN(n)) n = 0;
  if (max != null) n = Math.min(n, max);
  if (n < 0) n = 0;
  if (typeof value === "number" && n === value) return { action: "noop" };
  return { action: "set", value: n };
}

/** Setting a category score by hand pins that category for the ticker. This
 *  is the side effect the migration is most likely to drop: the score and the
 *  pin move together, in one patch, or an operator's number is silently
 *  overwritten by the model on the next refresh. */
export function categoryScorePatch(row, category, value) {
  return {
    [category]: value,
    pinnedCategories: Array.from(new Set([...(row.pinnedCategories || []), category])),
  };
}

/** Pin toggle is reversible: unpinning drops the category from the set and
 *  lets the model's computed value take over; the operator's number is
 *  retained on the row, so re-pinning restores it exactly. */
export function togglePinnedCategory(row, category) {
  const pinned = new Set(row.pinnedCategories || []);
  if (pinned.has(category)) pinned.delete(category);
  else pinned.add(category);
  return { pinnedCategories: Array.from(pinned) };
}

/** A judgment select's first option is the explicit "not assessed" state and
 *  maps to null — never to option 0, which would silently record a judgment
 *  the operator never made. */
export function judgmentValue(rawSelectValue) {
  return rawSelectValue === "" || rawSelectValue == null ? null : Number(rawSelectValue);
}

/** Editing valuation EPS by hand makes it operator-owned and pins it; the pin
 *  prevents only that formula input from refreshing. */
export function valuationEpsPatch(value) {
  return { valuationTtmEps: value, valuationEpsBasis: "operator", epsPinned: true };
}

/** Clicking a provider source copies it into valuation EPS and records which
 *  basis it came from. An existing pin is retained, not cleared. */
export function chooseBasisPatch(row, value, basis) {
  return { valuationTtmEps: value, valuationEpsBasis: basis, epsPinned: Boolean(row.epsPinned) };
}
