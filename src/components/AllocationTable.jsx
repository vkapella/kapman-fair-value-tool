import { symbolLinkProps } from "../chartUrl";
import { useMemo } from "react";
import KapmanGrid from "./grid/KapmanGrid.jsx";
import SetFilter from "./grid/SetFilter.jsx";
import { columnWidth, PINNED } from "../lib/gridColumns.js";
import { ivColor, fmtPctIV, scoreColor, missingMarkerProps } from "../lib/format.js";

// Migrated to AG Grid (UI-5). Read-only, so it carries no cell editors — but
// it is where the header filters the acceptance line asks for live: a set
// filter on each signal column and a numeric range on Score and % of IV.

// Cell text is the first thing to yield when the 76px pinned column runs out
// (decision 50); furniture never does.
// The ticker is the theme's .km-sym-link (decisions 64–66): it inherits the
// cell's colour rather than reading as accent, stretches to the cell (the
// pinned ticker cell is a flex container, see index.css), and opens the
// Barchart chart in a new tab. Truncation stays: this is the one column that
// cannot meet its width sum (decision 50), so its text is what yields.
const TickerCell = ({ value }) => (
  <a {...symbolLinkProps(value)} className="km-sym-link km-grid-col-symbol truncate">{value}</a>
);

const ScoreCell = ({ value }) => (
  <span className={`inline-flex items-center justify-center w-12 py-0.5 rounded font-mono font-bold text-xs ${scoreColor(value)}`}>
    {value}
  </span>
);

const PctIvCell = ({ value }) => (
  <span {...missingMarkerProps(value)} className={`tabular-nums font-mono text-xs ${ivColor(value)}`}>
    {fmtPctIV(value)}
  </span>
);

const SignalCell = ({ value }) => {
  if (value === "no") return <span className="text-text-3 text-xs font-mono">no</span>;
  if (value === "ON RADAR") return <span className="text-warn text-xs font-mono">ON RADAR</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-pos text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-pos"></span>{value}
    </span>
  );
};

/** Buy Shares is a boolean plus a size; flattened to the one string an
 *  operator actually reads, so it sorts and filters as that signal. */
const buySharesValue = (row) => (row.buyShares ? `YES ${row.buySharesPct}%` : "no");

export default function AllocationTable({ rows }) {
  const columnDefs = useMemo(() => [
    {
      field: "ticker",
      headerName: "Ticker",
      width: PINNED.symbol,
      // Pinned at every width including 390px, so scrolling the metric
      // columns never takes the row's identity with it.
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      cellRenderer: TickerCell,
      // No filter here: the pinned group is fixed at 40+44+76=160px, and a
      // filter button does not fit beside the label at 76px. Identity is
      // what this column is for; the metric columns carry the filters.
      filter: false,
    },
    {
      field: "score",
      headerName: "Score",
      width: columnWidth("Score", "numeric", { filter: true }),
      type: "rightAligned",
      cellRenderer: ScoreCell,
      filter: "agNumberColumnFilter",
    },
    {
      field: "pctIV",
      headerName: "% of Intrinsic Value",
      width: columnWidth("% of Intrinsic Value", "numeric", { filter: true }),
      type: "rightAligned",
      cellRenderer: PctIvCell,
      filter: "agNumberColumnFilter",
    },
    {
      colId: "buyShares",
      headerName: "Buy Shares",
      width: columnWidth("Buy Shares", "text", { filter: true }),
      valueGetter: (params) => (params.data ? buySharesValue(params.data) : null),
      cellRenderer: SignalCell,
      filter: SetFilter,
      filterParams: { getValue: (node) => buySharesValue(node.data) },
    },
    {
      field: "sellPutsNote",
      headerName: "Sell Puts",
      width: columnWidth("Sell Puts", "notes", { filter: true }),
      cellRenderer: SignalCell,
      filter: SetFilter,
      filterParams: { getValue: (node) => node.data?.sellPutsNote },
    },
    {
      field: "buyCallsNote",
      headerName: "Buy Calls",
      width: columnWidth("Buy Calls", "notes", { filter: true }),
      cellRenderer: SignalCell,
      filter: SetFilter,
      filterParams: { getValue: (node) => node.data?.buyCallsNote },
    },
  ], []);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg font-bold">Allocation Signals</h2>
        <p className="text-[11px] text-text-3 font-mono">Algorithmic defaults from Score × % of Intrinsic Value.</p>
      </div>
      <KapmanGrid
        rows={rows}
        columnDefs={columnDefs}
        ariaLabel="Allocation signals"
        getRowId={(params) => params.data.ticker}
        defaultSort={[{ colId: "score", sort: "desc" }]}
      />
    </div>
  );
}
