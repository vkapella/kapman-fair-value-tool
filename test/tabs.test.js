import test from "node:test";
import assert from "node:assert/strict";
import { Target } from "lucide-react";
import { CATEGORY_ICONS, MAIN_TABS } from "../src/components/tabs.js";
import { CATEGORY_KEYS } from "../src/lib/rubric.js";

test("main navigation definitions keep workflow views and rubric maintenance sections together", () => {
  const ids = MAIN_TABS.map(({ id }) => id);

  assert.deepEqual(ids.slice(0, 3), ["scorecard", "intrinsic", "allocation"]);
  assert.deepEqual(ids.slice(3), CATEGORY_KEYS);
  assert.equal(new Set(ids).size, ids.length);
});

// UI-7: CATEGORY_ICONS is keyed on CATEGORY_KEYS behind a silent `|| Target`
// fallback, so a category added to the rubric without an icon would ship
// wearing the score card's Target rather than failing anywhere visible.
test("every rubric category ships an explicit icon", () => {
  for (const key of CATEGORY_KEYS) {
    assert.ok(CATEGORY_ICONS[key], `category "${key}" has no entry in CATEGORY_ICONS`);
    assert.notEqual(
      CATEGORY_ICONS[key],
      Target,
      `category "${key}" must not reuse Target, the score card's icon`
    );
  }

  // No stale entries either: an icon for a category the rubric dropped is a
  // sign the two lists have drifted.
  assert.deepEqual(Object.keys(CATEGORY_ICONS).sort(), [...CATEGORY_KEYS].sort());
});

test("category subtabs resolve distinct icons, not the fallback", () => {
  const categoryTabs = MAIN_TABS.slice(3);
  const icons = categoryTabs.map(({ icon }) => icon);

  assert.equal(new Set(icons).size, icons.length, "two categories share one icon");
  assert.ok(!icons.includes(Target), "a category fell through to the Target fallback");
});
