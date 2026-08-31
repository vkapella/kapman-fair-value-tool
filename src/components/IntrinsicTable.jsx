import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import KapmanGrid from "./grid/KapmanGrid.jsx";
import NumCell from "./cells/NumCell.jsx";
import TextCell from "./cells/TextCell.jsx";
import { columnWidth, PINNED } from "../lib/gridColumns.js";
import { fmtMoney, ivColor, ivBg, fmtPctIV, missingMarkerProps } from "../lib/format.js";
import { chooseBasisPatch, valuationEpsPatch } from "../lib/cellSemantics.js";

// Migrated to AG Grid (UI-5). The inline editors are preserved as cell
// RENDERERS that host their own edit state, not as AG Grid cell editors: the
// valuation-EPS cell is a number input plus a basis label plus a pin toggle in
// one cell, and AG Grid's one-editor-per-cell model cannot express that
// without splitting the cell and breaking the pinning side effect that lives
// across it. The semantics themselves live in lib/cellSemantics and are
// tested, so what is preserved here is preserved provably.

const formatEps = (value) => (typeof value === "number" ? value.toFixed(2) : "—");

function epsDifference(gaap, adjusted) {
  if (typeof gaap !== "number" || typeof adjusted !== "number" || gaap === 0) return null;
  return ((adjusted - gaap) / Math.abs(gaap)) * 100;
}

function SourceEps({ value, label, onChoose, source, timestamp, unavailableReason }) {
  const unavailable = value == null;
  return (
    <button
      {...missingMarkerProps(value)}
      disabled={unavailable}
      onClick={onChoose}
      title={unavailable ? unavailableReason || `${label} is unavailable` : `Use ${label} for valuation`}
      className="text-right tabular-nums font-mono text-xs px-1.5 py-1 rounded hover:bg-surface-3 disabled:cursor-not-allowed disabled:text-text-4"
    >
      <span>{formatEps(value)}</span>
      {(source || timestamp) && <span className="block text-[9px] leading-3 text-text-3 truncate max-w-24">{source || "provider"}{timestamp ? ` · ${timestamp}` : ""}</span>}
      {unavailable && unavailableReason && <span className="block text-[9px] leading-3 text-warn truncate max-w-24">{unavailableReason}</span>}
    </button>
  );
}

function GrowthSuggestion({ row, onChoose }) {
  const recommendation = row.growthRecommendation;
  if (!recommendation || recommendation.value == null) {
    return <span data-contrast-exempt="" className="text-text-4 font-mono text-xs" title={recommendation?.warning || "Refresh provider data to calculate a suggestion"}>—</span>;
  }
  const delta = recommendation.value - row.growth;
  const material = Math.abs(delta) >= 3;
  const confidenceClass = recommendation.confidence === "high"
    ? "text-pos"
    : recommendation.confidence === "medium" ? "text-accent-soft" : "text-warn";
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
    <button onClick={onChoose} title={title} className={`rounded border px-2 py-1 text-right font-mono hover:bg-surface-3 ${material ? "border-warn-border bg-warn-dim" : "border-border"}`}>
      <span className="block text-xs tabular-nums text-text">{recommendation.value.toFixed(1)}%</span>
      <span className={`block text-[9px] uppercase tracking-wider ${confidenceClass}`}>{recommendation.confidence} · {recommendation.classification}</span>
      <span className={`block text-[9px] ${material ? "text-warn" : "text-text-3"}`}>Δ {delta >= 0 ? "+" : ""}{delta.toFixed(1)}pp · IV {fmtMoney(row.suggestedIv)}</span>
    </button>
  );
}

export default function IntrinsicTable({ rows, updateStock, removeStock, stocks }) {
  const indexOf = (ticker) => stocks.findIndex((s) => s.ticker === ticker);

  const chooseBasis = (row, value, basis) => {
    // The confirm is the guard on an operator's pinned number; it survives the
    // migration unchanged.
    if (row.epsPinned && !window.confirm(`${row.ticker} valuation EPS is pinned. Replace it with ${basis} EPS and retain the pin?`)) return;
    updateStock(indexOf(row.ticker), chooseBasisPatch(row, value, basis));
  };

  const togglePin = (row) => {
    if (row.epsPinned) {
      if (window.confirm(`Unpin ${row.ticker} valuation EPS? Source refreshes remain available either way.`)) {
        updateStock(indexOf(row.ticker), { epsPinned: false });
      }
      return;
    }
    updateStock(indexOf(row.ticker), { epsPinned: true });
  };

  const columnDefs = useMemo(() => [
    {
      colId: "remove",
      headerName: "",
      width: PINNED.actions,
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      sortable: false,
      cellClass: "km-grid-pinned",
      cellRenderer: ({ data }) => (
        <button
          onClick={() => removeStock(indexOf(data.ticker))}
          aria-label={`Remove ${data.ticker}`}
          className="opacity-40 hover:opacity-100 focus-visible:opacity-100 text-text-3 hover:text-neg focus-visible:text-neg rounded transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
    {
      field: "ticker",
      headerName: "Ticker",
      width: PINNED.symbol,
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      cellClass: "km-grid-pinned km-grid-pinned--edge",
      cellRenderer: ({ data }) => (
        <TextCell value={data.ticker} onChange={(v) => updateStock(indexOf(data.ticker), { ticker: v })} width="w-16" uppercase />
      ),
    },
    {
      field: "gaapTtmEps",
      headerName: "GAAP TTM EPS",
      width: columnWidth("GAAP TTM EPS", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <SourceEps
          value={data.gaapTtmEps} label="GAAP"
          source={data.eps?.gaap?.source} timestamp={data.eps?.gaap?.fetchedAt}
          unavailableReason={data.eps?.gaap?.unavailableReason}
          onChoose={() => chooseBasis(data, data.gaapTtmEps, "reported")}
        />
      ),
    },
    {
      field: "adjustedTtmEps",
      headerName: "Adjusted TTM EPS",
      width: columnWidth("Adjusted TTM EPS", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <SourceEps
          value={data.adjustedTtmEps} label="Adjusted"
          source={data.eps?.adjusted?.source} timestamp={data.eps?.adjusted?.fetchedAt}
          unavailableReason={data.eps?.adjusted?.unavailableReason}
          onChoose={() => chooseBasis(data, data.adjustedTtmEps, "adjusted")}
        />
      ),
    },
    {
      field: "valuationTtmEps",
      headerName: "Valuation TTM EPS",
      // 80px input + gap + the basis label and pin toggle stacked beside it.
      width: columnWidth("Valuation TTM EPS", "text", { filter: true, content: 150 }),
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <div className="flex items-center justify-end gap-1">
          <NumCell
            value={data.valuationTtmEps}
            onChange={(v) => updateStock(indexOf(data.ticker), valuationEpsPatch(v))}
            decimals={2}
            width="w-20"
          />
          <div className="text-right">
            <span className="block text-[9px] uppercase tracking-wider font-mono text-accent">
              {data.valuationEpsBasis === "adjusted" ? "Adjusted" : data.valuationEpsBasis === "reported" ? "Reported" : "Operator"}
            </span>
            <button
              onClick={() => togglePin(data)}
              aria-pressed={Boolean(data.epsPinned)}
              aria-label={`Pin valuation EPS for ${data.ticker}`}
              title={data.epsPinned ? "Unpin valuation EPS" : "Pin current valuation EPS"}
              className={`text-[9px] uppercase tracking-wider font-mono ${data.epsPinned ? "text-warn hover:opacity-80" : "text-text-3 hover:text-accent"}`}
            >
              {data.epsPinned ? "pinned" : "unpinned"}
            </button>
          </div>
        </div>
      ),
    },
    {
      colId: "epsDiff",
      headerName: "Adjusted vs GAAP",
      width: columnWidth("Adjusted vs GAAP", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      valueGetter: (params) => (params.data ? epsDifference(params.data.gaapTtmEps, params.data.adjustedTtmEps) : null),
      cellRenderer: ({ value }) => {
        const cls = value != null && Math.abs(value) >= 15 ? "text-neg border-neg-border bg-neg-dim"
          : value != null && Math.abs(value) >= 10 ? "text-warn border-warn-border bg-warn-dim"
          : "text-text-2 border-border";
        return (
          <span {...missingMarkerProps(value)} className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${cls}`}>
            {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`}
          </span>
        );
      },
    },
    {
      field: "growth",
      headerName: "Operator IV Growth %",
      width: columnWidth("Operator IV Growth %", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <NumCell value={data.growth} onChange={(v) => updateStock(indexOf(data.ticker), { growth: v })} decimals={1} suffix="%" width="w-20" />
      ),
    },
    {
      field: "suggestedGrowth",
      headerName: "Suggested IV Growth %",
      // The suggestion is a three-line button: value, confidence, delta.
      width: columnWidth("Suggested IV Growth %", "text", { filter: true, content: 170 }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <GrowthSuggestion row={data} onChoose={() => updateStock(indexOf(data.ticker), { growth: data.growthRecommendation.value })} />
      ),
    },
    {
      field: "iv",
      headerName: "Intrinsic Value",
      width: columnWidth("Intrinsic Value", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ value }) => (
        <span {...missingMarkerProps(value)} className="tabular-nums font-mono text-xs text-text">{fmtMoney(value)}</span>
      ),
    },
    {
      field: "currentPrice",
      headerName: "Current Price",
      width: columnWidth("Current Price", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ data }) => (
        <NumCell value={data.currentPrice} onChange={(v) => updateStock(indexOf(data.ticker), { currentPrice: v })} decimals={2} width="w-24" />
      ),
    },
    {
      field: "pctIV",
      headerName: "% of Intrinsic Value",
      width: columnWidth("% of Intrinsic Value", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ value }) => (
        <span {...missingMarkerProps(value)} className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${ivBg(value)} ${ivColor(value)}`}>
          {fmtPctIV(value)}
        </span>
      ),
    },
    {
      field: "updated",
      headerName: "Updated Date",
      width: columnWidth("Updated Date", "date", { filter: true }),
      filter: "agTextColumnFilter",
      cellRenderer: ({ data }) => (
        <TextCell value={data.updated} onChange={(v) => updateStock(indexOf(data.ticker), { updated: v })} width="w-16" />
      ),
    },
  ], [stocks, updateStock, removeStock]);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold">Intrinsic Value Calculation</h2>
          <p className="text-[11px] text-text-3 font-mono">Select an EPS basis, then set the operator&apos;s long-term IV growth assumption. TTM EPS Growth YoY belongs on the Growth score tab.</p>
        </div>
        <div className="text-[10px] text-text-3 font-mono whitespace-nowrap">Intrinsic Value = Valuation EPS × (PE_no_growth + g × IV Growth Assumption%) × (Avg_AAA_Yield / Bond_Yield)</div>
      </div>
      <KapmanGrid
        rows={rows}
        columnDefs={columnDefs}
        ariaLabel="Intrinsic value calculation"
        getRowId={(params) => params.data.ticker}
        defaultSort={[{ colId: "score", sort: "desc" }]}
        // Three lines: the value, its provenance, and the delta line.
        rowLines={3}
      />
    </div>
  );
}
