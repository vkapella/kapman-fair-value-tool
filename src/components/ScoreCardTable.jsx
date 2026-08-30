import { Trash2 } from "lucide-react";
import TextCell from "./cells/TextCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import Legend from "./Legend.jsx";
import { ivColor, scoreColor, fmtPctIV } from "../lib/format.js";

const CATEGORY_COLUMNS = [
  "valuation",
  "growthScore",
  "moat",
  "executionRisk",
  "economy",
];

export default function ScoreCardTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Main Score Card</h2>
          <p className="text-[11px] text-text-3 font-mono">Read-only rollup. Review factors and manage score overrides on each category tab. Score ≥ 75 = potential buy.</p>
        </div>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="valuation" label="Valuation /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="growthScore" label="Growth /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="moat" label="Moat /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="executionRisk" label="Exec Risk /10" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="economy" label="Economy /30" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={9} message="No stocks tracked. Add a ticker to start the watchlist." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-surface-2 group">
                  <td className="px-3 py-2"><TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase /></td>
                  <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                  {CATEGORY_COLUMNS.map((key) => {
                    const isPinned = (r.pinnedCategories || []).includes(key);
                    return (
                      <td key={key} className="px-2 py-2 text-right">
                        <span className="tabular-nums font-mono text-xs font-bold text-text">{r[key]}</span>
                        {/* UI-C (decision 36): pin/model is a closed set, so the
                            marker takes the set's step and the column keeps one
                            edge instead of jittering by label width. */}
                        <span className={`ml-1.5 inline-block min-w-chip-2 text-center text-[9px] uppercase font-mono ${isPinned ? "text-warn" : "text-text-4"}`} title={isPinned ? "Operator override is pinned" : "Live model score"}>{isPinned ? "pin" : "model"}</span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-flex items-center justify-center w-12 py-1 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => removeStock(idx)} aria-label={`Remove ${r.ticker}`} className="opacity-40 hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 text-text-3 hover:text-neg focus-visible:text-neg rounded transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
