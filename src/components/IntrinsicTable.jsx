import { Trash2 } from "lucide-react";
import NumCell from "./cells/NumCell.jsx";
import TextCell from "./cells/TextCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import { fmtMoney, ivColor, ivBg, fmtPctIV } from "../lib/format.js";
import { todayShort } from "../lib/api.js";

export default function IntrinsicTable({ rows, updateStock, removeStock, stocks, globals, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Intrinsic Value Calculation</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Click EPS, Growth, or Price to edit. Intrinsic Value recalculates instantly.</p>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">Intrinsic Value = EPS × (PE_no_growth + g × Growth%) × (Avg_AAA_Yield / Bond_Yield)</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="pe" label="P/E" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="forwardPe" label="Forward P/E" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="ttmEPS" label="Trailing EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="forwardEps" label="Forward EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="growth" label="EPS Growth %" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="iv" label="Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="currentPrice" label="Current Price" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Updated Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={10} message="No stocks tracked. Add a ticker to calculate intrinsic value." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase />
                      <button onClick={() => removeStock(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.pe != null ? r.pe.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.forwardPe != null ? r.forwardPe.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.epsCurated && (
                        <button
                          onClick={() => {
                            if (!r.epsPinned) return;
                            if (window.confirm(`Unpin ${r.ticker} EPS? Future refreshes will overwrite it with provider-derived EPS.`)) {
                              updateStock(idx, { epsPinned: false });
                            }
                          }}
                          title={r.epsPinned
                            ? "EPS is operator-curated and pinned — refresh updates price only. Click to unpin and let refresh overwrite it."
                            : "No provider EPS for this ticker — value is operator-maintained. Refresh updates price only and leaves the Updated date alone."}
                          className="text-[9px] uppercase tracking-wider font-mono px-1 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                          {r.epsPinned ? "pinned" : "curated"}
                        </button>
                      )}
                      <NumCell value={r.ttmEPS} onChange={(v) => updateStock(idx, { ttmEPS: v, updated: todayShort(), epsPinned: true })} decimals={2} width="w-20" />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.forwardEps != null ? r.forwardEps.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.growth} onChange={(v) => updateStock(idx, { growth: v, updated: todayShort() })} decimals={0} suffix="%" width="w-16" /></td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">{fmtMoney(r.iv)}</td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.currentPrice} onChange={(v) => updateStock(idx, { currentPrice: v })} decimals={2} width="w-24" /></td>
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${ivBg(r.pctIV)} ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span>
                  </td>
                  <td className="px-2 py-2 text-zinc-500 font-mono text-xs">
                    <TextCell value={r.updated} onChange={(v) => updateStock(idx, { updated: v })} width="w-16" />
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
