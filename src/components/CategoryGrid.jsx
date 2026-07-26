import { Pin, PinOff } from "lucide-react";
import FactorCell from "./cells/FactorCell.jsx";
import JudgmentCell from "./cells/JudgmentCell.jsx";
import NumCell from "./cells/NumCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import { RUBRIC_DEF, SCORE_WEIGHTS } from "../lib/rubric.js";
import { formatFieldValue } from "../lib/format.js";

// One grid per rubric category (Valuation / Growth / Moat / Execution Risk /
// Economy). Columns are derived entirely from RUBRIC_DEF[category] so a
// change to the rubric (new field, new judgment option) shows up here without
// touching this file.
export default function CategoryGrid({ category, rows, stocks, factors, computed, updateStock, updateFactor, sortBy, sortDir, sortToggle }) {
  const def = RUBRIC_DEF[category];
  const derivedFields = def.derivedFields || [];
  const scoreFields = [...derivedFields, ...def.quantitativeFields, ...def.qualitativeFields];
  const colSpan = 1 + derivedFields.length + def.quantitativeFields.length + def.qualitativeFields.length + 3;
  const weightLabel = (field) => {
    const scoreKey = field.scoreKey || field.key;
    const percent = Math.round((SCORE_WEIGHTS[category][scoreKey] || 0) * 100);
    const shared = scoreFields.filter((candidate) => (candidate.scoreKey || candidate.key) === scoreKey).length > 1;
    return `${percent}%${shared ? " shared" : ""}`;
  };
  const fieldTitle = (field) => `${field.description} · Score weight: ${weightLabel(field)}`;

  const togglePin = (idx, current) => {
    const pinned = new Set(current.pinnedCategories || []);
    if (pinned.has(category)) pinned.delete(category); else pinned.add(category);
    updateStock(idx, { pinnedCategories: Array.from(pinned) });
  };

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">{def.label.replace(/\s*\/\d+$/, "")} Factors</h2>
        <p className="text-[11px] text-zinc-500 font-mono">
          Every displayed factor feeds this category score. Model outputs are read-only; fetched values are dimmed and manual overrides are bright with a ● marker.
          Judgment fields default to <span className="text-zinc-400"> — not assessed — </span> until you set them.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              {derivedFields.map((field) => (
                <th key={field.key} title={fieldTitle(field)} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider font-medium text-zinc-500">
                  {field.label}<span className="block text-[9px] text-zinc-600">{weightLabel(field)}</span>
                </th>
              ))}
              {def.quantitativeFields.map((field) => (
                <th key={field.key} title={fieldTitle(field)} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider font-medium text-zinc-500">
                  {field.label}<span className="block text-[9px] text-zinc-600">{weightLabel(field)}</span>
                </th>
              ))}
              {def.qualitativeFields.map((field) => (
                <th key={field.key} title={fieldTitle(field)} className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">
                  {field.label}<span className="block text-[9px] text-zinc-600">{weightLabel(field)}</span>
                </th>
              ))}
              <SortHeader col={category} label="Category Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-2 py-2 text-right text-[10px] uppercase tracking-wider font-medium text-zinc-500">Unassessed</th>
              <th className="px-2 py-2 text-center text-[10px] uppercase tracking-wider font-medium text-zinc-500">Pin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={colSpan} message="No stocks tracked. Add a ticker to start the watchlist." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              const tickerFactors = factors[r.ticker] || {};
              const isPinned = (r.pinnedCategories || []).includes(category);
              const effective = r[category];
              const comp = computed[r.ticker]?.[category] ?? null;
              const unassessed = def.qualitativeFields.filter((f) => tickerFactors[f.key]?.manual == null).length;

              return (
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2 font-mono text-xs text-zinc-200">{r.ticker}</td>
                  {derivedFields.map((field) => (
                    <td key={field.key} title={field.description} className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                      {formatFieldValue(r[field.key], field.format)}
                    </td>
                  ))}
                  {def.quantitativeFields.map((field) => {
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
                  {def.qualitativeFields.map((field) => {
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
                        onChange={(value) => updateStock(idx, {
                          [category]: value,
                          pinnedCategories: Array.from(new Set([...(r.pinnedCategories || []), category])),
                        })}
                        decimals={0}
                        max={def.max}
                        width="w-12"
                      />
                      {isPinned && comp != null && comp !== effective && (
                        <span className="tabular-nums font-mono text-[10px] text-zinc-600">model {comp}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {unassessed > 0
                      ? <span className="font-mono text-[10px] text-amber-300">{unassessed} unassessed</span>
                      : <span className="font-mono text-[10px] text-emerald-400">assessed</span>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => togglePin(idx, r)}
                        title={isPinned
                          ? "Pinned: your number is in force. Unpin to let the model's computed value take over — safe and reversible, re-pinning restores your number exactly."
                          : "Unpinned: the model's computed value is live and updates automatically. Pin to lock in your own number instead."}
                        className={`p-1 rounded transition ${isPinned ? "text-emerald-400 hover:text-emerald-300" : "text-zinc-600 hover:text-zinc-300"}`}
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
