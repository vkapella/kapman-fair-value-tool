import { Trash2 } from "lucide-react";
import NumCell from "./cells/NumCell.jsx";
import TextCell from "./cells/TextCell.jsx";
import SortHeader from "./SortHeader.jsx";
import EmptyTableRow from "./EmptyTableRow.jsx";
import { fmtMoney, ivColor, ivBg, fmtPctIV } from "../lib/format.js";

const formatEps = (value) => (typeof value === "number" ? value.toFixed(2) : "—");

function epsDifference(gaap, adjusted) {
  if (typeof gaap !== "number" || typeof adjusted !== "number" || gaap === 0) return null;
  return ((adjusted - gaap) / Math.abs(gaap)) * 100;
}

function SourceEps({ value, label, onChoose, source, timestamp, unavailableReason }) {
  const unavailable = value == null;
  return (
    <button
      disabled={unavailable}
      onClick={onChoose}
      title={unavailable ? unavailableReason || `${label} is unavailable` : `Use ${label} for valuation`}
      className="text-right tabular-nums font-mono text-xs px-1.5 py-1 rounded hover:bg-zinc-800/60 disabled:cursor-not-allowed disabled:text-zinc-600"
    >
      <span>{formatEps(value)}</span>
      {(source || timestamp) && <span className="block text-[9px] leading-3 text-zinc-600 truncate max-w-24">{source || "provider"}{timestamp ? ` · ${timestamp}` : ""}</span>}
      {unavailable && unavailableReason && <span className="block text-[9px] leading-3 text-amber-300/70 truncate max-w-24">{unavailableReason}</span>}
    </button>
  );
}

function GrowthSuggestion({ row, onChoose }) {
  const recommendation = row.growthRecommendation;
  if (!recommendation || recommendation.value == null) {
    return <span className="text-zinc-600 font-mono text-xs" title={recommendation?.warning || "Refresh provider data to calculate a suggestion"}>—</span>;
  }
  const delta = recommendation.value - row.growth;
  const material = Math.abs(delta) >= 3;
  const confidenceClass = recommendation.confidence === "high"
    ? "text-emerald-300"
    : recommendation.confidence === "medium" ? "text-sky-300" : "text-amber-300";
  const input = recommendation.inputs || {};
  const displayInput = (value) => typeof value === "number" ? `${value.toFixed(1)}%` : "—";
  const title = [
    `Adopt ${recommendation.value.toFixed(1)}% for ${row.ticker}`,
    `${recommendation.classification}; cap ${recommendation.cap}%`,
    recommendation.basis,
    `FY+1 ${displayInput(input.forward)} · 3Y ${displayInput(input.history3Y)} · 5Y ${displayInput(input.history5Y)} · capacity ${displayInput(input.capacity)}`,
    recommendation.warning,
  ].filter(Boolean).join("\n");
  return (
    <button onClick={onChoose} title={title} className={`rounded border px-2 py-1 text-right font-mono hover:bg-zinc-800/60 ${material ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800"}`}>
      <span className="block text-xs tabular-nums text-zinc-100">{recommendation.value.toFixed(1)}%</span>
      <span className={`block text-[9px] uppercase tracking-wider ${confidenceClass}`}>{recommendation.confidence} · {recommendation.classification}</span>
      <span className={`block text-[9px] ${material ? "text-amber-300" : "text-zinc-600"}`}>Δ {delta >= 0 ? "+" : ""}{delta.toFixed(1)}pp · IV {fmtMoney(row.suggestedIv)}</span>
    </button>
  );
}

export default function IntrinsicTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle }) {
  const chooseBasis = (row, idx, value, basis) => {
    if (row.epsPinned && !window.confirm(`${row.ticker} valuation EPS is pinned. Replace it with ${basis} EPS and retain the pin?`)) return;
    updateStock(idx, { valuationTtmEps: value, valuationEpsBasis: basis, epsPinned: Boolean(row.epsPinned) });
  };

  const togglePin = (row, idx) => {
    if (row.epsPinned) {
      if (window.confirm(`Unpin ${row.ticker} valuation EPS? Source refreshes remain available either way.`)) {
        updateStock(idx, { epsPinned: false });
      }
      return;
    }
    updateStock(idx, { epsPinned: true });
  };

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold">Intrinsic Value Calculation</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Select an EPS basis, then set the operator&apos;s long-term IV growth assumption. TTM EPS Growth YoY belongs on the Growth score tab.</p>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">Intrinsic Value = Valuation EPS × (PE_no_growth + g × IV Growth Assumption%) × (Avg_AAA_Yield / Bond_Yield)</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50"><tr className="hairline">
            <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
            <SortHeader col="gaapTtmEps" label="GAAP TTM EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="adjustedTtmEps" label="Adjusted TTM EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="valuationTtmEps" label="Valuation TTM EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Adjusted vs GAAP</th>
            <SortHeader col="growth" label="Operator IV Growth %" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="suggestedGrowth" label="Suggested IV Growth %" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="iv" label="Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="currentPrice" label="Current Price" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
            <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Updated Date</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={11} message="No stocks tracked. Add a ticker to calculate intrinsic value." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              const difference = epsDifference(r.gaapTtmEps, r.adjustedTtmEps);
              const diffClass = difference != null && Math.abs(difference) >= 15 ? "text-rose-300 border-rose-500/40 bg-rose-500/10" : difference != null && Math.abs(difference) >= 10 ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-zinc-400 border-zinc-800";
              return <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                <td className="px-3 py-2"><div className="flex items-center gap-2"><TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase /><button onClick={() => removeStock(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                <td className="px-2 py-2 text-right"><SourceEps value={r.gaapTtmEps} label="GAAP" source={r.eps?.gaap?.source} timestamp={r.eps?.gaap?.fetchedAt} unavailableReason={r.eps?.gaap?.unavailableReason} onChoose={() => chooseBasis(r, idx, r.gaapTtmEps, "reported")} /></td>
                <td className="px-2 py-2 text-right"><SourceEps value={r.adjustedTtmEps} label="Adjusted" source={r.eps?.adjusted?.source} timestamp={r.eps?.adjusted?.fetchedAt} unavailableReason={r.eps?.adjusted?.unavailableReason} onChoose={() => chooseBasis(r, idx, r.adjustedTtmEps, "adjusted")} /></td>
                <td className="px-2 py-2 text-right"><div className="flex items-center justify-end gap-1"><NumCell value={r.valuationTtmEps} onChange={(v) => updateStock(idx, { valuationTtmEps: v, valuationEpsBasis: "operator", epsPinned: true })} decimals={2} width="w-20" /><div className="text-right"><span className="block text-[9px] uppercase tracking-wider font-mono text-emerald-300">{r.valuationEpsBasis === "adjusted" ? "Adjusted" : r.valuationEpsBasis === "reported" ? "Reported" : "Operator"}</span><button onClick={() => togglePin(r, idx)} title={r.epsPinned ? "Unpin valuation EPS" : "Pin current valuation EPS"} className={`text-[9px] uppercase tracking-wider font-mono ${r.epsPinned ? "text-amber-300 hover:text-amber-200" : "text-zinc-500 hover:text-emerald-300"}`}>{r.epsPinned ? "pinned" : "unpinned"}</button></div></div></td>
                <td className="px-2 py-2 text-right"><span className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${diffClass}`}>{difference == null ? "—" : `${difference >= 0 ? "+" : ""}${difference.toFixed(1)}%`}</span></td>
                <td className="px-2 py-2 text-right"><NumCell value={r.growth} onChange={(v) => updateStock(idx, { growth: v })} decimals={1} suffix="%" width="w-20" /></td>
                <td className="px-2 py-2 text-right"><GrowthSuggestion row={r} onChoose={() => updateStock(idx, { growth: r.growthRecommendation.value })} /></td>
                <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">{fmtMoney(r.iv)}</td>
                <td className="px-2 py-2 text-right"><NumCell value={r.currentPrice} onChange={(v) => updateStock(idx, { currentPrice: v })} decimals={2} width="w-24" /></td>
                <td className="px-2 py-2 text-right"><span className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${ivBg(r.pctIV)} ${ivColor(r.pctIV)}`}>{fmtPctIV(r.pctIV)}</span></td>
                <td className="px-2 py-2 text-zinc-500 font-mono text-xs"><TextCell value={r.updated} onChange={(v) => updateStock(idx, { updated: v })} width="w-16" /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
