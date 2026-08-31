import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import SignalText from "./SignalText.jsx";
import { ivColor, fmtPctIV, scoreColor, missingMarkerProps } from "../lib/format.js";

export default function AllocationTable({ rows, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg font-bold">Allocation Signals</h2>
        <p className="text-[11px] text-text-3 font-mono">Algorithmic defaults from Score × % of Intrinsic Value.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-text-3">Buy Shares</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-text-3">Sell Puts</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-text-3">Buy Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={6} message="No stocks tracked. Add a ticker to generate allocation signals." /> : rows.map((r) => (
              <tr key={r.ticker} className="hairline hover:bg-surface-2">
                <td className="px-3 py-2 font-mono font-medium">{r.ticker}</td>
                <td className="px-2 py-2 text-right">
                  <span className={`inline-flex items-center justify-center w-12 py-0.5 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                </td>
                <td className="px-2 py-2 text-right"><span {...missingMarkerProps(r.pctIV)} className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                <td className="px-3 py-2">
                  {r.buyShares ? (
                    <span className="inline-flex items-center gap-1.5 text-pos text-xs font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-pos"></span>YES {r.buySharesPct}%
                    </span>
                  ) : <span className="text-text-3 text-xs font-mono">no</span>}
                </td>
                <td className="px-3 py-2"><SignalText note={r.sellPutsNote} /></td>
                <td className="px-3 py-2"><SignalText note={r.buyCallsNote} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
