import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_KEYS,
  DEFAULT_JUDGMENT_OVERRIDES,
  FACTOR_INDEX,
  RUBRIC_DEF,
  SCORE_WEIGHTS,
  suggestScore,
} from "../src/lib/rubric.js";

function breakdownEntry(category, key, fundamentals = {}, overrides = {}) {
  const result = suggestScore(category, fundamentals, 100, {}, overrides);
  return result.breakdown.find((entry) => entry.key === key);
}

test("every category scoring weight sums to 1.0", () => {
  assert.deepEqual(Object.keys(SCORE_WEIGHTS), CATEGORY_KEYS);
  for (const category of CATEGORY_KEYS) {
    const total = Object.values(SCORE_WEIGHTS[category]).reduce((sum, weight) => sum + weight, 0);
    assert.ok(Math.abs(total - 1) < 1e-12, `${category} weights sum to ${total}`);
  }
});

test("manual-only judgment defaults use valid conservative option index 1", () => {
  assert.deepEqual(DEFAULT_JUDGMENT_OVERRIDES, {
    growthFundingQuality: 1,
    moatDurability: 1,
  });
  for (const [key, index] of Object.entries(DEFAULT_JUDGMENT_OVERRIDES)) {
    assert.equal(FACTOR_INDEX[key].kind, "judgment");
    assert.ok(FACTOR_INDEX[key].options[index], `${key} option ${index} exists`);
  }
});

test("new qualitative fields contribute to growth and moat scores", () => {
  const fundedBest = breakdownEntry("growthScore", "growthFundingQuality", {}, { growthFundingQuality: 0 });
  const fundedWorst = breakdownEntry("growthScore", "growthFundingQuality", {}, { growthFundingQuality: 4 });
  assert.ok(fundedBest.contribution > fundedWorst.contribution);

  const durableBest = breakdownEntry("moat", "moatDurability", {}, { moatDurability: 0 });
  const durableWorst = breakdownEntry("moat", "moatDurability", {}, { moatDurability: 4 });
  assert.ok(durableBest.contribution > durableWorst.contribution);
});

test("profit margin and institutional concentration contribute non-trivially", () => {
  const strongMargin = breakdownEntry("moat", "profitMargins", { profitMargins: 0.3 });
  const weakMargin = breakdownEntry("moat", "profitMargins", { profitMargins: 0.01 });
  assert.ok(strongMargin.contribution > weakMargin.contribution);

  const moderateOwnership = breakdownEntry(
    "executionRisk",
    "institutionsPercentHeld",
    { institutionsPercentHeld: 0.55 }
  );
  const crowdedOwnership = breakdownEntry(
    "executionRisk",
    "institutionsPercentHeld",
    { institutionsPercentHeld: 0.95 }
  );
  const veryLowOwnership = breakdownEntry(
    "executionRisk",
    "institutionsPercentHeld",
    { institutionsPercentHeld: 0.05 }
  );
  assert.ok(moderateOwnership.contribution > crowdedOwnership.contribution);
  assert.ok(moderateOwnership.contribution > veryLowOwnership.contribution);
});

test("context-only market classifications are excluded from score-input grids", () => {
  assert.equal(FACTOR_INDEX.fiftyTwoWeekHigh, undefined);
  assert.equal(FACTOR_INDEX.fiftyTwoWeekLow, undefined);
  assert.equal(FACTOR_INDEX.sector, undefined);
  assert.equal(FACTOR_INDEX.industry, undefined);

  const economyBreakdownKeys = new Set(
    suggestScore("economy", { sector: "Technology", industry: "Software" }, 100, {}, {}).breakdown
      .map((entry) => entry.key)
  );
  assert.equal(economyBreakdownKeys.has("sector"), false);
  assert.equal(economyBreakdownKeys.has("industry"), false);
  assert.equal(RUBRIC_DEF.economy.quantitativeFields.some((field) => field.key === "sector"), false);
  assert.equal(RUBRIC_DEF.economy.quantitativeFields.some((field) => field.key === "industry"), false);
});

test("every category-screen input maps to exactly one weighted score component", () => {
  for (const category of CATEGORY_KEYS) {
    const def = RUBRIC_DEF[category];
    const displayedInputs = [
      ...(def.derivedFields || []),
      ...def.quantitativeFields,
      ...def.qualitativeFields,
    ];
    const displayedScoreKeys = new Set(displayedInputs.map((field) => field.scoreKey || field.key));
    assert.deepEqual(
      [...displayedScoreKeys].sort(),
      Object.keys(SCORE_WEIGHTS[category]).sort(),
      `${category} displayed inputs and score weights drifted`
    );

    const breakdownKeys = new Set(
      suggestScore(category, {}, 100, {}, {}).breakdown.map((entry) => entry.key)
    );
    assert.deepEqual(
      [...breakdownKeys].sort(),
      Object.keys(SCORE_WEIGHTS[category]).sort(),
      `${category} score formula and declared weights drifted`
    );
  }
});

test("stored factor inputs have one category owner", () => {
  const seen = new Map();
  for (const category of CATEGORY_KEYS) {
    const def = RUBRIC_DEF[category];
    for (const field of [...def.quantitativeFields, ...def.qualitativeFields]) {
      assert.equal(seen.has(field.key), false, `${field.key} is displayed in both ${seen.get(field.key)} and ${category}`);
      seen.set(field.key, category);
      assert.equal(FACTOR_INDEX[field.key].category, category);
    }
  }
});

test("zero cash with debt is scored as leverage risk rather than missing data", () => {
  const noCash = breakdownEntry("growthScore", "debtVsCash", { totalDebt: 100, totalCash: 0 });
  const balanced = breakdownEntry("growthScore", "debtVsCash", { totalDebt: 100, totalCash: 100 });
  const missing = breakdownEntry("growthScore", "debtVsCash", { totalDebt: 100 });
  assert.ok(noCash.contribution < balanced.contribution);
  assert.ok(noCash.contribution < missing.contribution);
});
