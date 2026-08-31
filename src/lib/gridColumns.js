// Column widths (UI-5 / spec §05). Every column gets an explicit fixed width
// so a drag never triggers width redistribution; nothing flexes.

/** Base width by content kind. */
export const KIND_WIDTH = {
  numeric: 84,
  date: 96,
  text: 112,
  tags: 175,
  notes: 240,
};

/** The pinned group: select 40 + actions 44 + symbol 76 = 160px, held at
 *  every width including 390px. */
export const PINNED = { select: 40, actions: 44, symbol: 76 };

/** A column is never narrower than its own header's longest word, or the
 *  header truncates and the column reads as a mystery. */
export function headerWordFloor(headerName) {
  const longest = String(headerName)
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);
  return Math.ceil(longest * 7.5) + 30;
}

/** The floor measures the longest WORD, which only makes sense for a header
 *  that wraps — an ellipsizing header needs its whole label. The grid
 *  therefore wraps its headers (KapmanGrid sets wrapHeaderText), which is also
 *  what the hand-rolled tables did before the migration.
 *
 *  What the formula does not budget for is the header's own furniture: a sort
 *  indicator and a filter button sit beside the label, measured at 40px
 *  together in the shipped theme. Without that allowance every filterable
 *  header truncates, which is the defect the floor exists to prevent. Filed
 *  for Design — the width formula and the header-filter requirement were
 *  specified apart. */
export const HEADER_AFFORDANCE = 40;

export function columnWidth(headerName, kind = "numeric", { filter = false } = {}) {
  const base = KIND_WIDTH[kind];
  if (base == null) throw new Error(`unknown column kind: ${kind}`);
  const floor = headerWordFloor(headerName) + (filter ? HEADER_AFFORDANCE : 0);
  return Math.max(base, floor);
}
