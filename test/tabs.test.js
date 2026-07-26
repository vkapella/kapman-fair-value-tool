import test from "node:test";
import assert from "node:assert/strict";
import { MAIN_TABS } from "../src/components/tabs.js";
import { CATEGORY_KEYS } from "../src/lib/rubric.js";

test("main navigation definitions keep workflow views and rubric maintenance sections together", () => {
  const ids = MAIN_TABS.map(({ id }) => id);

  assert.deepEqual(ids.slice(0, 3), ["scorecard", "intrinsic", "allocation"]);
  assert.deepEqual(ids.slice(3), CATEGORY_KEYS);
  assert.equal(new Set(ids).size, ids.length);
});
