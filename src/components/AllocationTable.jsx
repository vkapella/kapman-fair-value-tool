import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import SignalText from "./SignalText.jsx";
import { ivColor, fmtPctIV, scoreColor } from "../lib/format.js";

export default function AllocationTable({ rows, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Allocation Signals</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Algorithmic defaults from Score × % of Intrinsic Value.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Buy Shares</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Sell Puts</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Buy Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={6} message="No stocks tracked. Add a ticker to generate allocation signals." /> : rows.map((r) => (
              <tr key={r.ticker} className="hairline hover:bg-zinc-900/30">
                <td className="px-3 py-2 font-mono font-medium">{r.ticker}</td>
                <td className="px-2 py-2 text-right">
                  <span className={`inline-flex items-center justify-center w-12 py-0.5 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                </td>
                <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                <td className="px-3 py-2">
                  {r.buyShares ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>YES {r.buySharesPct}%
                    </span>
                  ) : <span className="text-zinc-600 text-xs font-mono">no</span>}
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
