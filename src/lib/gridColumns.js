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

/** The text term: a column is never narrower than its own header's longest
 *  word, or the header truncates and the column reads as a mystery. This is
 *  the term decision 50 builds on; the +30 is the cell's own padding. */
export function headerWordFloor(headerName) {
  const longest = String(headerName)
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);
  return Math.ceil(longest * 7.5) + 30;
}

/** The floor measures the longest WORD, which only makes sense for a header
 *  that wraps — an ellipsizing header needs its whole label. The grid
 *  therefore wraps its headers (KapmanGrid sets wrapHeaderText), which is also
 *  what the hand-rolled tables did before the migration. */

/** Decision 50: the word-fit floor takes header furniture and the in-cell chip
 *  as INPUTS, summed, rather than being max'd against separately-derived
 *  floors. The three width defects this repo reported — truncated filterable
 *  headers, category values clipping behind their marker, the pinned symbol
 *  column — are one generator that did not know about furniture, not three
 *  columns to patch. Patching them locally would have left the formula intact
 *  to produce a fourth collision.
 *
 *    floor = ceil(longestWord × 7.5) + 30
 *          + 20 per header control
 *          + chip step + 8px gap, when a chip shares the cell with text
 *
 *  20px per control, counted, replaces a flat 40px charged only to filterable
 *  columns. AG Grid puts a sort indicator on every sortable column, so a
 *  sortable-unfiltered column was previously charged nothing for furniture it
 *  actually renders. */
export const HEADER_CONTROL_W = 20;
export const CHIP_GAP = 8;

/** UI-C chip steps, repeated here because a column whose cells carry an
 *  enumerated chip must be wide enough to hold one beside the value. */
export const CHIP_W = { 1: 48, 2: 64, 3: 84 };
const CELL_PADDING = 30;   // measured: 15px each side in the shipped theme

/** The one column that cannot meet the sum, named by decision 50 itself: the
 *  pinned symbol column is held at 76px at every width, and "Ticker" alone
 *  needs 75 + 20 for its sort indicator. The ruling's remedy is that such a
 *  column does not host a filter control — its filter moves to the toolbar —
 *  rather than that the column shrinks something. Nothing shrinks here today
 *  because the symbol column has never carried a filter; the test guards that
 *  it never gains one silently.
 *
 *  When space still runs out, the yield order is: cell text truncates first,
 *  header label second, and furniture and the chip never shrink. Only the
 *  first step is reachable in this app — KapmanGrid wraps headers rather than
 *  ellipsizing them, so a header label has no truncation to yield. */
export const TOOLBAR_FILTER_COLUMNS = ["ticker"];

/** `content` states the width a cell's own controls need, for the cells that
 *  hold more than a value — the valuation-EPS cell is an input beside a basis
 *  label and a pin toggle. Given explicitly so the number is arguable in
 *  review rather than a magic width.
 *
 *  `sortable` defaults to true because KapmanGrid's defaultColDef does; pass
 *  false for the action columns, which render no header at all. */
export function columnWidth(
  headerName,
  kind = "numeric",
  { filter = false, sortable = true, chip = null, content = 0 } = {},
) {
  const base = KIND_WIDTH[kind];
  if (base == null) throw new Error(`unknown column kind: ${kind}`);
  if (chip != null && CHIP_W[chip] == null) throw new Error(`unknown chip step: ${chip}`);

  const controls = (sortable ? 1 : 0) + (filter ? 1 : 0);
  const wordFit =
    headerWordFloor(headerName) +
    controls * HEADER_CONTROL_W +
    (chip == null ? 0 : CHIP_W[chip] + CHIP_GAP);
  const contentFloor = content ? content + CELL_PADDING : 0;
  return Math.max(base, wordFit, contentFloor);
}
