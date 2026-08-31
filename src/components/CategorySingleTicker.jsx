import { ChevronLeft, ChevronRight, Pin, PinOff } from "lucide-react";
import FactorCell from "./cells/FactorCell.jsx";
import JudgmentCell from "./cells/JudgmentCell.jsx";
import NumCell from "./cells/NumCell.jsx";
import { categoryFields, countUnassessed, fieldTitle, weightLabel, PIN_TITLE } from "../lib/categoryFields.js";
import { formatFieldValue } from "../lib/format.js";
import { categoryScorePatch, togglePinnedCategory } from "../lib/cellSemantics.js";

// The single-ticker transpose (UI-4, decision 15): one ticker, factors down
// the rows. This is the only orientation that reaches every factor at 390px
// without horizontal scrolling, which is why the split is by width rather
// than by preference. Reached by tapping a ticker on the score card, or by
// the picker below.
export default function CategorySingleTicker({
  category,
  rows,
  stocks,
  factors,
  computed,
  updateStock,
  updateFactor,
  selectedTicker,
  setSelectedTicker,
}) {
  const { def, derived, quantitative, qualitative, all } = categoryFields(category);

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-text-3 font-mono">
        No stocks tracked. Add a ticker to start the watchlist.
      </div>
    );
  }

  const activeIndex = Math.max(0, rows.findIndex((r) => r.ticker === selectedTicker));
  const row = rows[activeIndex];
  const idx = stocks.findIndex((s) => s.ticker === row.ticker);
  const tickerFactors = factors[row.ticker] || {};
  const isPinned = (row.pinnedCategories || []).includes(category);
  const effective = row[category];
  const comp = computed[row.ticker]?.[category] ?? null;
  const unassessed = countUnassessed(qualitative, tickerFactors);

  const step = (delta) => {
    const next = (activeIndex + delta + rows.length) % rows.length;
    setSelectedTicker(rows[next].ticker);
  };

  const renderEditor = (field) => {
    if (derived.includes(field)) {
      // Derived cells are model output: never editable, and dashed so that
      // reads as a property of the cell rather than a disabled control.
      return (
        <span className="km-cell--derived inline-block px-2 py-1 rounded tabular-nums font-mono text-xs">
          {formatFieldValue(row[field.key], field.format)}
        </span>
      );
    }
    if (qualitative.includes(field)) {
      const entry = tickerFactors[field.key] || { manual: null };
      return (
        <JudgmentCell
          field={field}
          manual={entry.manual}
          onChange={(value) => updateFactor(row.ticker, { [field.key]: value })}
        />
      );
    }
    const entry = tickerFactors[field.key] || { manual: null, fetched: null };
    return (
      <FactorCell
        fetched={entry.fetched}
        manual={entry.manual}
        format={field.format}
        onCommit={(value) => updateFactor(row.ticker, { [field.key]: value })}
      />
    );
  };

  return (
    <div className="lg:hidden">
      {/* Ticker picker — previous / next across the same sorted rows the wide
          grid shows, so the two orientations stay in step. */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-2">
        <span className="km-section-label">Ticker</span>
        <span className="font-mono text-sm font-semibold text-text">{row.ticker}</span>
        <span className="font-mono text-[10px] text-text-3">{activeIndex + 1} of {rows.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            aria-label="Previous ticker"
            className="nav-touch min-w-11 flex items-center justify-center rounded border border-border bg-surface-3 text-text-2 hover:border-border-strong"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next ticker"
            className="nav-touch min-w-11 flex items-center justify-center rounded border border-border bg-surface-3 text-text-2 hover:border-border-strong"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* One card per factor at 390px; the label/value pair goes side by side
          once there is room for it. */}
      <div className="p-3 space-y-2">
        {all.map((field) => (
          <div
            key={field.key}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <div className="text-xs text-text-2" title={fieldTitle(category, field, all)}>{field.label}</div>
              <div className="text-[9px] uppercase tracking-wider font-mono text-text-3">
                {derived.includes(field) ? "derived · " : qualitative.includes(field) ? "judgment · " : "fetched · "}
                {weightLabel(category, field, all)}
              </div>
            </div>
            <div className="shrink-0">{renderEditor(field)}</div>
          </div>
        ))}
      </div>

      {/* Category total: the same score input, unassessed state and pin
          toggle the wide grid carries in its three trailing columns. */}
      <div className="border-t border-border px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="km-section-label">Category total</span>
        {unassessed > 0
          ? <span className="font-mono text-[10px] text-warn">{unassessed} unassessed</span>
          : <span className="font-mono text-[10px] text-pos">assessed</span>}
        <div className="ml-auto flex items-center gap-2">
          {isPinned && comp != null && comp !== effective && (
            <span data-contrast-exempt="" className="tabular-nums font-mono text-[10px] text-text-4">model {comp}</span>
          )}
          <NumCell
            value={effective}
            onChange={(value) => updateStock(idx, categoryScorePatch(row, category, value))}
            decimals={0}
            max={def.max}
            width="w-12"
          />
          <span className="font-mono text-xs text-text-3">/ {def.max}</span>
          <button
            onClick={() => updateStock(idx, togglePinnedCategory(row, category))}
            aria-pressed={isPinned}
            aria-label={`Pin ${def.label.replace(/\s*\/\d+$/, "")} score for ${row.ticker}`}
            title={isPinned ? PIN_TITLE.pinned : PIN_TITLE.unpinned}
            className={`nav-touch min-w-11 flex items-center justify-center rounded transition ${isPinned ? "text-warn bg-warn-dim" : "text-text-4 hover:text-text"}`}
          >
            {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
