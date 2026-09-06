import { symbolLinkProps } from "../chartUrl";
import { Pin, PinOff } from "lucide-react";
import FactorCell from "./cells/FactorCell.jsx";
import JudgmentCell from "./cells/JudgmentCell.jsx";
import NumCell from "./cells/NumCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import CategorySingleTicker from "./CategorySingleTicker.jsx";
import { categoryFields, countUnassessed, fieldTitle, weightLabel, PIN_TITLE } from "../lib/categoryFields.js";
import { formatFieldValue } from "../lib/format.js";
import { categoryScorePatch, togglePinnedCategory } from "../lib/cellSemantics.js";

// One editor per rubric category (Valuation / Growth / Moat / Execution Risk /
// Economy), in two orientations (UI-4, decision 15):
//
//   ≥1024px  every tracked ticker down the rows, factors across — the
//            orientation that lets an operator compare one factor across the
//            whole watchlist, which is what this screen is for.
//   <1024px  the single-ticker transpose in CategorySingleTicker, the only
//            orientation that reaches every factor at 390px.
//
// Both derive their factor set from RUBRIC_DEF via lib/categoryFields, so a
// rubric change shows up in both without touching either file.
export default function CategoryGrid({
  category,
  rows,
  stocks,
  factors,
  computed,
  updateStock,
  updateFactor,
  sortBy,
  sortDir,
  sortToggle,
  selectedTicker,
  setSelectedTicker,
}) {
  const { def, derived, quantitative, qualitative, all } = categoryFields(category);
  const colSpan = 1 + all.length + 3;
  const categoryName = def.label.replace(/\s*\/\d+$/, "");

  const togglePin = (idx, current) => updateStock(idx, togglePinnedCategory(current, category));

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg font-bold">{categoryName} Factors</h2>
        <p className="text-[11px] text-text-3 font-mono">
          Every displayed factor feeds this category score. Model outputs are read-only; fetched values are dimmed and manual overrides are bright with a ● marker.
          Judgment fields default to <span className="text-text-2"> — not assessed — </span> until you set them.
        </p>
      </div>

      <CategorySingleTicker
        category={category}
        rows={rows}
        stocks={stocks}
        factors={factors}
        computed={computed}
        updateStock={updateStock}
        updateFactor={updateFactor}
        selectedTicker={selectedTicker}
        setSelectedTicker={setSelectedTicker}
      />

      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              {[...derived, ...quantitative].map((field) => (
                <th key={field.key} title={fieldTitle(category, field, all)} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider font-medium text-text-3">
                  {field.label}<span className="block text-[9px] text-text-3">{weightLabel(category, field, all)}</span>
                </th>
              ))}
              {qualitative.map((field) => (
                <th key={field.key} title={fieldTitle(category, field, all)} className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-text-3">
                  {field.label}<span className="block text-[9px] text-text-3">{weightLabel(category, field, all)}</span>
                </th>
              ))}
              <SortHeader col={category} label="Category Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider font-medium text-text-3">Unassessed</th>
              <th className="px-2 py-2 text-center text-[10px] uppercase tracking-wider font-medium text-text-3">Pin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={colSpan} message="No stocks tracked. Add a ticker to start the watchlist." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              const tickerFactors = factors[r.ticker] || {};
              const isPinned = (r.pinnedCategories || []).includes(category);
              const effective = r[category];
              const comp = computed[r.ticker]?.[category] ?? null;
              const unassessed = countUnassessed(qualitative, tickerFactors);

              return (
                <tr key={r.ticker} className="hairline hover:bg-surface-2 group">
                  <td className="px-3 py-2 font-mono text-xs text-text"><a {...symbolLinkProps(r.ticker)} className="km-sym-link">{r.ticker}</a></td>
                  {derived.map((field) => (
                    <td key={field.key} title={field.description} className="px-2 py-2 text-right">
                      {/* Derived cells are model output and never editable; the
                          dashed border says so without a disabled control. */}
                      <span className="km-cell--derived inline-block px-2 py-1 rounded tabular-nums font-mono text-xs">
                        {formatFieldValue(r[field.key], field.format)}
                      </span>
                    </td>
                  ))}
                  {quantitative.map((field) => {
                    const entry = tickerFactors[field.key] || { manual: null, fetched: null };
                    return (
                      <td key={field.key} className="px-2 py-2 text-right">
                        <FactorCell
                          fetched={entry.fetched}
                          manual={entry.manual}
                          format={field.format}
                          onCommit={(value) => updateFactor(r.ticker, { [field.key]: value })}
                        />
                      </td>
                    );
                  })}
                  {qualitative.map((field) => {
                    const entry = tickerFactors[field.key] || { manual: null };
                    return (
                      <td key={field.key} className="px-2 py-2">
                        <JudgmentCell
                          field={field}
                          manual={entry.manual}
                          onChange={(value) => updateFactor(r.ticker, { [field.key]: value })}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <NumCell
                        value={effective}
                        onChange={(value) => updateStock(idx, categoryScorePatch(r, category, value))}
                        decimals={0}
                        max={def.max}
                        width="w-12"
                      />
                      {isPinned && comp != null && comp !== effective && (
                        <span data-contrast-exempt="" className="tabular-nums font-mono text-[10px] text-text-4">model {comp}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {/* UI-C: deliberately content-sized — "{n} unassessed" is
                        open-ended, so this set takes no width step. */}
                    {unassessed > 0
                      ? <span className="font-mono text-[10px] text-warn">{unassessed} unassessed</span>
                      : <span className="font-mono text-[10px] text-pos">assessed</span>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => togglePin(idx, r)}
                        aria-pressed={isPinned}
                        aria-label={`Pin ${categoryName} score for ${r.ticker}`}
                        title={isPinned ? PIN_TITLE.pinned : PIN_TITLE.unpinned}
                        className={`p-1 rounded transition ${isPinned ? "text-warn hover:opacity-80" : "text-text-4 hover:text-text"}`}
                      >
                        {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
