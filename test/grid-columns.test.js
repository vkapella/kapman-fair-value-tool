import test from "node:test";
import assert from "node:assert/strict";
import { columnWidth, headerWordFloor, KIND_WIDTH, PINNED } from "../src/lib/gridColumns.js";

test("the pinned group is 160px, held at every width", () => {
  assert.equal(PINNED.select + PINNED.actions + PINNED.symbol, 160);
});

test("a column is never narrower than its own header's longest word", () => {
  // "INTRINSIC" is 9 characters: ceil(9 * 7.5) + 30 = 98, above numeric's 84.
  assert.equal(headerWordFloor("% of Intrinsic Value"), 98);
  assert.ok(columnWidth("% of Intrinsic Value") >= 98);
});

test("a short header still gets its kind's base width", () => {
  assert.equal(columnWidth("Score"), KIND_WIDTH.numeric);
});

test("a filterable header reserves room for its sort and filter affordances", () => {
  const bare = columnWidth("Sell Puts", "text");
  const filtered = columnWidth("Sell Puts", "text", { filter: true });
  assert.ok(filtered >= bare, "adding a filter never narrows a column");
  // Without the allowance the label truncates behind the filter button — the
  // defect that this floor exists to prevent.
  assert.ok(columnWidth("Suggested IV Growth %", "numeric", { filter: true }) > headerWordFloor("Suggested IV Growth %"));
  assert.equal(columnWidth("% of Intrinsic Value", "numeric", { filter: true }), 138);
});

test("an unknown column kind is a mistake, not a silent default", () => {
  assert.throws(() => columnWidth("Ticker", "wingding"), /unknown column kind/);
});
