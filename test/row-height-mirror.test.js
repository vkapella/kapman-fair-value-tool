import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// useTokenRowHeight (KapmanGrid.jsx) mirrors kapman-grid.css's touch media
// query by hand: AG Grid virtualises on a JS number, so the breakpoint exists
// twice — once in CSS for min-height, once in JS for the row height the engine
// lays out on. Nothing but a comment kept them in step, and they had already
// drifted apart once by the time ruling 57 moved the CSS to 1023.98px.
//
// These tests read both files as text rather than importing the component,
// because the hazard is textual: an edit to one file that is not made to the
// other. A rendering test would need a coarse pointer at a rail-band width,
// which the preview harness cannot emulate together.

const CSS = readFileSync(new URL("../src/design/kapman-grid.css", import.meta.url), "utf8");
const JSX = readFileSync(new URL("../src/components/grid/KapmanGrid.jsx", import.meta.url), "utf8");

const TOUCH_QUERY = "(pointer: coarse) and (max-width: 1023.98px)";

test("the vendored grid CSS puts touch rows through the rail band (ruling 57)", () => {
  const queries = [...CSS.matchAll(/@media\s*\(pointer:\s*coarse\)[^{]*/g)].map((m) => m[0].trim());
  assert.ok(queries.length >= 2, `expected both row-height rules, found ${queries.length}`);
  for (const q of queries) {
    assert.match(q, /max-width:\s*1023\.98px/,
      `a coarse-pointer rule still targets the old band: ${q}`);
  }
});

test("every matchMedia in KapmanGrid mirrors the CSS touch query exactly", () => {
  const found = [...JSX.matchAll(/matchMedia\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
  assert.ok(found.length >= 2, `expected both matchMedia calls, found ${found.length}`);
  for (const q of found) {
    assert.equal(q, TOUCH_QUERY,
      "KapmanGrid's matchMedia drifted from kapman-grid.css — the virtualiser " +
      "and the CSS min-height would disagree in the band between them.");
  }
});

test("the JS breakpoint is the one the CSS actually declares", () => {
  // Ties the two assertions above together: if the vendored CSS is re-vendored
  // to a new band, this fails until the JS constant moves too.
  const cssBand = CSS.match(/@media\s*\(pointer:\s*coarse\)\s*and\s*\(max-width:\s*([\d.]+)px\)/);
  assert.ok(cssBand, "no coarse-pointer max-width rule found in the vendored CSS");
  assert.ok(
    TOUCH_QUERY.includes(`${cssBand[1]}px`),
    `CSS declares ${cssBand[1]}px but the JS mirror expects ${TOUCH_QUERY}`,
  );
});
