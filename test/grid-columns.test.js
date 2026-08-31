import test from "node:test";
import assert from "node:assert/strict";
import {
  columnWidth,
  headerWordFloor,
  CHIP_GAP,
  CHIP_W,
  HEADER_CONTROL_W,
  KIND_WIDTH,
  PINNED,
  TOOLBAR_FILTER_COLUMNS,
} from "../src/lib/gridColumns.js";

test("the pinned group is 160px, held at every width", () => {
  assert.equal(PINNED.select + PINNED.actions + PINNED.symbol, 160);
});

test("a column is never narrower than its own header's longest word", () => {
  // "INTRINSIC" is 9 characters: ceil(9 * 7.5) + 30 = 98, above numeric's 84.
  assert.equal(headerWordFloor("% of Intrinsic Value"), 98);
  assert.ok(columnWidth("% of Intrinsic Value") >= 98);
});

test("a short header still gets its kind's base width", () => {
  assert.equal(columnWidth("Score", "numeric", { sortable: false }), KIND_WIDTH.numeric);
});

// ---- decision 50: the floor takes furniture and the chip as inputs --------

test("each header control is charged 20px, counted rather than assumed", () => {
  const bare = columnWidth("Sell Puts", "text", { sortable: false });
  const sorted = columnWidth("Sell Puts", "text");
  const filtered = columnWidth("Sell Puts", "text", { filter: true });
  assert.ok(filtered >= sorted && sorted >= bare, "adding a control never narrows a column");
  // A sortable-unfiltered column renders a sort indicator and is charged for
  // it. The flat 40px this replaced was billed only to filterable columns, so
  // that furniture was free — which is how a header truncated behind it.
  assert.equal(
    columnWidth("Suggested IV Growth %", "numeric"),
    headerWordFloor("Suggested IV Growth %") + HEADER_CONTROL_W,
  );
  assert.equal(
    columnWidth("% of Intrinsic Value", "numeric", { filter: true }),
    headerWordFloor("% of Intrinsic Value") + 2 * HEADER_CONTROL_W,
  );
});

test("a chip sharing the cell adds its step and the gap to the same sum", () => {
  // UI-C puts a 64px pin/model marker beside every category score. The chip is
  // a term in the floor, not a rival floor max'd against it: the header still
  // has to fit its longest word with the marker sitting beside the value.
  const header = "Valuation /20";
  assert.equal(
    columnWidth(header, "numeric", { filter: true, chip: 2 }),
    headerWordFloor(header) + 2 * HEADER_CONTROL_W + CHIP_W[2] + CHIP_GAP,
  );
  assert.ok(
    columnWidth(header, "numeric", { filter: true, chip: 2 }) >
      columnWidth(header, "numeric", { filter: true }),
  );
});

test("the pinned symbol column cannot meet the sum, so it hosts no filter", () => {
  // Decision 50 names this column as the case the formula cannot satisfy:
  // "Ticker" needs 75px of label plus 20px of sort indicator against a 76px
  // budget held at every width. The remedy is that its filter lives in the
  // toolbar — furniture and chip never shrink — so the exemption is only
  // sound while the column has no filter of its own.
  assert.ok(columnWidth("Ticker", "text", { filter: false }) > PINNED.symbol);
  assert.ok(TOOLBAR_FILTER_COLUMNS.includes("ticker"));
});

test("an unknown column kind is a mistake, not a silent default", () => {
  assert.throws(() => columnWidth("Ticker", "wingding"), /unknown column kind/);
});

test("an unknown chip step is a mistake, not a silent default", () => {
  assert.throws(() => columnWidth("Moat /20", "numeric", { chip: 9 }), /unknown chip step/);
});
