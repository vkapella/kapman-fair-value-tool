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

/** UI-C chip steps, repeated here because a column whose cells carry an
 *  enumerated chip must be wide enough to hold one. The width rules budget
 *  for the header but not for the cell, and UI-C mandates a 64px chip beside
 *  every category score — so the two rules cropped each other until this
 *  floor existed. Filed for Design with the header-affordance finding. */
export const CHIP_W = { 1: 48, 2: 64, 3: 84 };
const CELL_PADDING = 30;   // measured: 15px each side in the shipped theme
const VALUE_ALLOWANCE = 34; // up to three tabular-mono digits, plus the gap

/** `content` states the width a cell's own controls need, for the cells that
 *  hold more than a value — the valuation-EPS cell is an input beside a basis
 *  label and a pin toggle. Given explicitly so the number is arguable in
 *  review rather than a magic width. */
export function columnWidth(headerName, kind = "numeric", { filter = false, chip = null, content = 0 } = {}) {
  const base = KIND_WIDTH[kind];
  if (base == null) throw new Error(`unknown column kind: ${kind}`);
  if (chip != null && CHIP_W[chip] == null) throw new Error(`unknown chip step: ${chip}`);
  const headerFloor = headerWordFloor(headerName) + (filter ? HEADER_AFFORDANCE : 0);
  const chipFloor = chip == null ? 0 : VALUE_ALLOWANCE + CHIP_W[chip] + CELL_PADDING;
  const contentFloor = content ? content + CELL_PADDING : 0;
  return Math.max(base, headerFloor, chipFloor, contentFloor);
}
