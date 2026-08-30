import { useEffect, useState } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import TextCell from "./cells/TextCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import Legend from "./Legend.jsx";
import { RUBRIC_DEF } from "../lib/rubric.js";
import { ivColor, scoreColor, fmtPctIV } from "../lib/format.js";

const CATEGORY_COLUMNS = [
  "valuation",
  "growthScore",
  "moat",
  "executionRisk",
  "economy",
];

// Below 768px a single amber dot beside the ticker means the row holds an
// operator override beyond the watchlist-wide Economy pin; the detail sheet
// answers which (decision 19).
const hasOverrideBeyondEconomy = (row) =>
  (row.pinnedCategories || []).some((key) => key !== "economy");

function ScoreMarker({ isPinned }) {
  return (
    /* UI-C (decision 36): pin/model is a closed set, so the marker takes the
       set's step and the column keeps one edge instead of jittering. */
    <span
      className={`ml-1.5 inline-block min-w-chip-2 text-center text-[9px] uppercase font-mono ${isPinned ? "text-warn" : "text-text-4"}`}
      title={isPinned ? "Operator override is pinned" : "Live model score"}
    >
      {isPinned ? "pin" : "model"}
    </span>
  );
}

// Row detail sheet (<1024px): the five category points that leave the table
// when the priority columns take over, with the pin/model marker per row.
function RowDetailSheet({ row, onClose, onOpenCategory }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lg:hidden">
      <div
        className="fixed inset-0 z-[70]"
        style={{ background: "color-mix(in srgb, var(--bg) 60%, transparent)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={`${row.ticker} category detail`}
        className="fixed inset-x-0 bottom-0 z-[71] rounded-t-lg border-t border-border bg-surface-2 px-4 pt-3"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-sm">{row.ticker}</span>
            <span className={`inline-flex items-center justify-center w-12 py-1 rounded font-mono font-bold text-xs ${scoreColor(row.score)}`}>{row.score}</span>
            <span className={`tabular-nums font-mono text-xs ${ivColor(row.pctIV)}`}>{fmtPctIV(row.pctIV)} of IV</span>
          </div>
          <button
            autoFocus
            onClick={onClose}
            aria-label="Close detail"
            className="nav-touch p-2 rounded text-text-3 hover:text-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {CATEGORY_COLUMNS.map((key) => {
          const isPinned = (row.pinnedCategories || []).includes(key);
          return (
            <button
              key={key}
              onClick={() => onOpenCategory(row.ticker, key)}
              className="nav-touch w-full flex items-center justify-between py-2 border-b border-border-subtle last:border-b-0 text-left hover:text-accent"
            >
              <span className="text-xs text-text-2">{RUBRIC_DEF[key].label}</span>
              <span className="flex items-center">
                <span className="tabular-nums font-mono text-xs font-bold text-text">{row[key]}</span>
                <ScoreMarker isPinned={isPinned} />
                <ChevronRight className="w-3.5 h-3.5 ml-1 text-text-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ScoreCardTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle, onOpenCategory }) {
  const [detailTicker, setDetailTicker] = useState(null);
  const detailRow = rows.find((r) => r.ticker === detailTicker) || null;

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
              {/* Priority columns below 1024px are Ticker, % of IV and Score;
                  the five category points move to the row detail sheet. */}
              <SortHeader col="valuation" label="Valuation /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} className="hidden lg:table-cell" />
              <SortHeader col="growthScore" label="Growth /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} className="hidden lg:table-cell" />
              <SortHeader col="moat" label="Moat /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} className="hidden lg:table-cell" />
              <SortHeader col="executionRisk" label="Exec Risk /10" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} className="hidden lg:table-cell" />
              <SortHeader col="economy" label="Economy /30" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} className="hidden lg:table-cell" />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="w-8 lg:hidden"></th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={10} message="No stocks tracked. Add a ticker to start the watchlist." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-surface-2 group">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase />
                      {hasOverrideBeyondEconomy(r) && (
                        <span className="md:hidden w-1.5 h-1.5 rounded-full bg-warn shrink-0" title="Holds an operator override — open the row detail for which" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                  {CATEGORY_COLUMNS.map((key) => {
                    const isPinned = (r.pinnedCategories || []).includes(key);
                    return (
                      <td key={key} className="px-2 py-2 text-right hidden lg:table-cell">
                        <span className="tabular-nums font-mono text-xs font-bold text-text">{r[key]}</span>
                        <ScoreMarker isPinned={isPinned} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-flex items-center justify-center w-12 py-1 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="px-2 py-2 text-right lg:hidden">
                    <button
                      onClick={() => setDetailTicker(r.ticker)}
                      aria-label={`Category detail for ${r.ticker}`}
                      className="nav-touch p-1 rounded text-text-3 hover:text-text"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
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
      {detailRow && (
        <RowDetailSheet
          row={detailRow}
          onClose={() => setDetailTicker(null)}
          onOpenCategory={(ticker, category) => {
            setDetailTicker(null);
            onOpenCategory?.(ticker, category);
          }}
        />
      )}
    </div>
  );
}
