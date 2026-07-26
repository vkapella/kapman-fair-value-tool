import { Trash2 } from "lucide-react";
import NumCell from "./cells/NumCell.jsx";
import TextCell from "./cells/TextCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import Legend from "./Legend.jsx";
import { ivColor, scoreColor, fmtPctIV } from "../lib/format.js";

// Matches the SortHeader columns below (label + max stay hard-coded here to
// keep this table's header text exactly as before -- only the repeated cell
// markup is deduped).
const CATEGORY_COLUMNS = [
  { key: "valuation", max: 20 },
  { key: "growthScore", max: 20 },
  { key: "moat", max: 20 },
  { key: "executionRisk", max: 10 },
  { key: "economy", max: 30 },
];

export default function ScoreCardTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle, onOpenWorksheet, worksheetLoading }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Main Score Card</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Each category scored manually. Click any cell to edit. Score ≥ 75 = potential buy.</p>
        </div>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
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
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2"><TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase /></td>
                  <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                  {CATEGORY_COLUMNS.map(({ key, max }) => {
                    const unpinned = !(r.pinnedCategories || []).includes(key);
                    return (
                      <td key={key} className="px-2 py-2 text-right">
                        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                          {unpinned && (
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" title="Unpinned — this number is recalculated from the factors and will change on the next refresh or factor edit." />
                          )}
                          <NumCell value={r[key]} onChange={(v) => updateStock(idx, { [key]: v })} decimals={0} max={max} width="w-14" />
                          <button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, key); }} className="text-zinc-600 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet">
                            <span className={worksheetLoading === `${r.ticker}-${key}` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-${key}` ? "↻" : "ⓘ"}</span>
                          </button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-flex items-center justify-center w-12 py-1 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => removeStock(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition">
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
