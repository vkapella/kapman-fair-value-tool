import test from "node:test";
import assert from "node:assert/strict";
import {
  factorState,
  factorCommit,
  numCommit,
  categoryScorePatch,
  togglePinnedCategory,
  judgmentValue,
  valuationEpsPatch,
  chooseBasisPatch,
} from "../src/lib/cellSemantics.js";

// These pin the behaviour the AG Grid migration (UI-5) is most likely to lose
// silently: the override marker and the pinning side effect. A cell editor
// that stops calling these will fail here rather than in production.

test("a factor shows the provider value until an override exists", () => {
  const fetched = factorState({ fetched: 21.4, manual: null });
  assert.equal(fetched.hasOverride, false);
  assert.equal(fetched.effective, 21.4);
  assert.equal(fetched.showsMarker, false, "no marker without an override");

  const overridden = factorState({ fetched: 21.4, manual: 18 });
  assert.equal(overridden.hasOverride, true);
  assert.equal(overridden.effective, 18, "shows the value in force, not the one it replaced");
  assert.equal(overridden.showsMarker, true);
});

test("an override of zero is still an override", () => {
  // 0 is falsy; a truthiness check here would drop the marker and show the
  // provider's number as though the operator had never set anything.
  const state = factorState({ fetched: 5, manual: 0 });
  assert.equal(state.hasOverride, true);
  assert.equal(state.effective, 0);
  assert.equal(state.showsMarker, true);
});

test("an empty factor commit clears the override rather than writing zero", () => {
  assert.deepEqual(factorCommit("", { manual: 18 }), { action: "clear", value: null });
  assert.deepEqual(factorCommit("   ", { manual: 18 }), { action: "clear", value: null });
  assert.deepEqual(factorCommit(null, { manual: 18 }), { action: "clear", value: null });
});

test("clearing a factor that has no override writes nothing", () => {
  assert.deepEqual(factorCommit("", { manual: null }), { action: "noop" });
});

test("a factor commit that changes nothing does not write", () => {
  assert.deepEqual(factorCommit("18", { manual: 18 }), { action: "noop" });
  assert.deepEqual(factorCommit("19", { manual: 18 }), { action: "set", value: 19 });
  assert.deepEqual(factorCommit("abc", { manual: 18 }), { action: "noop" }, "non-numeric is refused");
});

test("a text-format factor commits strings, not numbers", () => {
  assert.deepEqual(factorCommit("wide", { manual: "narrow", format: "text" }), { action: "set", value: "wide" });
  assert.deepEqual(factorCommit("narrow", { manual: "narrow", format: "text" }), { action: "noop" });
});

test("numeric commit clamps to the category maximum and to zero", () => {
  assert.deepEqual(numCommit("25", { value: 10, max: 20 }), { action: "set", value: 20 });
  assert.deepEqual(numCommit("-4", { value: 10 }), { action: "set", value: 0 });
  assert.deepEqual(numCommit("abc", { value: 10 }), { action: "set", value: 0 });
});

test("a numeric no-op does not fire — it would pin the row and stamp the date", () => {
  assert.deepEqual(numCommit("12", { value: 12 }), { action: "noop" });
  assert.deepEqual(numCommit("12.0", { value: 12 }), { action: "noop" });
});

test("editing a category score pins that category in the same patch", () => {
  const row = { ticker: "META", pinnedCategories: [] };
  const patch = categoryScorePatch(row, "valuation", 18);
  assert.equal(patch.valuation, 18);
  assert.deepEqual(patch.pinnedCategories, ["valuation"], "the score and the pin move together");
});

test("pinning a category preserves the ones already pinned and never duplicates", () => {
  const row = { pinnedCategories: ["economy", "moat"] };
  const patch = categoryScorePatch(row, "valuation", 12);
  assert.deepEqual(patch.pinnedCategories.sort(), ["economy", "moat", "valuation"]);

  const already = categoryScorePatch({ pinnedCategories: ["valuation"] }, "valuation", 15);
  assert.deepEqual(already.pinnedCategories, ["valuation"], "no duplicate entry");
});

test("the pin toggle is reversible in both directions", () => {
  const unpinned = { pinnedCategories: ["economy"] };
  const pinned = togglePinnedCategory(unpinned, "moat");
  assert.deepEqual(pinned.pinnedCategories.sort(), ["economy", "moat"]);

  const backAgain = togglePinnedCategory({ pinnedCategories: pinned.pinnedCategories }, "moat");
  assert.deepEqual(backAgain.pinnedCategories, ["economy"], "unpinning removes only that category");
});

test("an unassessed judgment maps to null, not to option zero", () => {
  assert.equal(judgmentValue(""), null, "the not-assessed option must not record a judgment");
  assert.equal(judgmentValue(null), null);
  assert.equal(judgmentValue("0"), 0, "option 0 is a real judgment and stays 0");
  assert.equal(judgmentValue("3"), 3);
});

test("editing valuation EPS makes it operator-owned and pins it", () => {
  assert.deepEqual(valuationEpsPatch(4.25), {
    valuationTtmEps: 4.25,
    valuationEpsBasis: "operator",
    epsPinned: true,
  });
});

test("choosing a provider basis records it and retains an existing pin", () => {
  assert.deepEqual(chooseBasisPatch({ epsPinned: true }, 3.1, "adjusted"), {
    valuationTtmEps: 3.1,
    valuationEpsBasis: "adjusted",
    epsPinned: true,
  });
  assert.deepEqual(chooseBasisPatch({ epsPinned: false }, 3.1, "reported"), {
    valuationTtmEps: 3.1,
    valuationEpsBasis: "reported",
    epsPinned: false,
  });
});
