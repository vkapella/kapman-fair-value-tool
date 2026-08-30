import { RUBRIC_DEF, SCORE_WEIGHTS } from "./rubric.js";

// Both category-editor orientations — the ticker-per-row grid at ≥1024px and
// the single-ticker transpose below it (UI-4) — derive their factor list and
// weight labels from here, which derives them from RUBRIC_DEF[category].
// Neither orientation may hardcode a factor list: a rubric change (new field,
// new judgment option) has to reach both without touching either component.
export function categoryFields(category) {
  const def = RUBRIC_DEF[category];
  const derived = def.derivedFields || [];
  const quantitative = def.quantitativeFields;
  const qualitative = def.qualitativeFields;
  return {
    def,
    derived,
    quantitative,
    qualitative,
    // Order matters: derived first, then provider quantities, then judgments —
    // the same reading order in both orientations.
    all: [...derived, ...quantitative, ...qualitative],
  };
}

// Two fields can feed one score key (Total debt + Total cash both score as
// debtVsCash), in which case the weight is shared and the label says so.
export function weightLabel(category, field, scoreFields) {
  const scoreKey = field.scoreKey || field.key;
  const percent = Math.round((SCORE_WEIGHTS[category][scoreKey] || 0) * 100);
  const shared = scoreFields.filter((candidate) => (candidate.scoreKey || candidate.key) === scoreKey).length > 1;
  return `${percent}%${shared ? " shared" : ""}`;
}

export function fieldTitle(category, field, scoreFields) {
  return `${field.description} · Score weight: ${weightLabel(category, field, scoreFields)}`;
}

// Judgment fields with no stored manual value are what the Unassessed column
// counts; a quantitative factor falling back to its provider value is not
// "unassessed".
export function countUnassessed(qualitative, tickerFactors) {
  return qualitative.filter((field) => tickerFactors[field.key]?.manual == null).length;
}

export const PIN_TITLE = {
  pinned: "Pinned: your number is in force. Unpin to let the model's computed value take over — safe and reversible, re-pinning restores your number exactly.",
  unpinned: "Unpinned: the model's computed value is live and updates automatically. Pin to lock in your own number instead.",
};
