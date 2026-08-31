import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import KapmanGrid from "./grid/KapmanGrid.jsx";
import Legend from "./Legend.jsx";
import { columnWidth, PINNED } from "../lib/gridColumns.js";
import { RUBRIC_DEF } from "../lib/rubric.js";
import { ivColor, scoreColor, fmtPctIV, missingMarkerProps } from "../lib/format.js";

const CATEGORY_COLUMNS = ["valuation", "growthScore", "moat", "executionRisk", "economy"];

const CATEGORY_HEADERS = {
  valuation: "Valuation /20",
  growthScore: "Growth /20",
  moat: "Moat /20",
  executionRisk: "Exec Risk /10",
  economy: "Economy /30",
};

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
      // Non-text marker at --text-4 (UI-0 step 5) — sanctioned, so the
      // contrast gate allowlists it. Its meaning is carried by the word.
      data-contrast-exempt=""
      className={`ml-1.5 inline-block min-w-chip-2 text-center text-[9px] uppercase font-mono ${isPinned ? "text-warn" : "text-text-4"}`}
      title={isPinned ? "Operator override is pinned" : "Live model score"}
    >
      {isPinned ? "pin" : "model"}
    </span>
  );
}

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
            <span {...missingMarkerProps(row.pctIV)} className={`tabular-nums font-mono text-xs ${ivColor(row.pctIV)}`}>{fmtPctIV(row.pctIV)} of IV</span>
          </div>
          <button autoFocus onClick={onClose} aria-label="Close detail" className="nav-touch p-2 rounded text-text-3 hover:text-text">
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

/** Below 1024px the priority columns are Ticker, % of IV and Score; the five
 *  category points move into the row detail sheet (UI-3). */
function useIsWide() {
  const read = () => (typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches);
  const [wide, setWide] = useState(read);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export default function ScoreCardTable({ rows, updateStock, removeStock, stocks, onOpenCategory }) {
  const [detailTicker, setDetailTicker] = useState(null);
  const detailRow = rows.find((r) => r.ticker === detailTicker) || null;
  const isWide = useIsWide();
  const [api, setApi] = useState(null);

  // Column visibility has to move through the API: AG Grid keeps its own
  // column state once the grid exists and ignores a changed `hide` in
  // replaced columnDefs, so crossing 1024px would otherwise only take effect
  // on a reload.
  useEffect(() => {
    if (!api) return;
    api.setColumnsVisible(CATEGORY_COLUMNS, isWide);
    api.setColumnsVisible(["detail"], !isWide);
  }, [api, isWide]);

  const indexOf = (ticker) => stocks.findIndex((s) => s.ticker === ticker);

  const columnDefs = useMemo(() => [
    {
      colId: "remove",
      headerName: "",
      width: PINNED.actions,
      pinned: "left",
      lockPinned: true,
      suppressMovable: true,
      sortable: false,
      // km-grid-pinned lets the control stretch instead of carrying its own
      // pixel height, which is what keeps the pinned and centre panes in
      // lockstep rather than drifting a fraction of a pixel per row.
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
      editable: true,
      // Uppercasing lives in the setter so it applies however the cell is
      // committed — Enter, blur, or a paste — and a no-op edit writes nothing.
      valueSetter: (params) => {
        const next = String(params.newValue || "").toUpperCase();
        if (!next || next === params.oldValue) return false;
        updateStock(indexOf(params.data.ticker), { ticker: next });
        return true;
      },
      // Decision 50's yield order, in the one column that cannot meet the
      // width sum: the ticker truncates, the override dot never shrinks.
      // flex-1 min-w-0 overrides the theme's fixed 76px on the symbol span so
      // the text yields the dot's width instead of pushing it out of the cell.
      cellRenderer: ({ data }) => (
        <span className="flex items-center gap-1.5">
          <span className="km-grid-col-symbol text-accent flex-1 min-w-0 truncate">{data.ticker}</span>
          {hasOverrideBeyondEconomy(data) && (
            <span className="md:hidden w-1.5 h-1.5 rounded-full bg-warn shrink-0" title="Holds an operator override — open the row detail for which" />
          )}
        </span>
      ),
    },
    {
      field: "pctIV",
      headerName: "% of Intrinsic Value",
      width: columnWidth("% of Intrinsic Value", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ value }) => (
        <span {...missingMarkerProps(value)} className={`tabular-nums font-mono text-xs ${ivColor(value)}`}>{fmtPctIV(value)}</span>
      ),
    },
    ...CATEGORY_COLUMNS.map((key) => ({
      field: key,
      headerName: CATEGORY_HEADERS[key],
      // chip: 2 — every category cell carries the 64px pin/model marker.
      width: columnWidth(CATEGORY_HEADERS[key], "numeric", { filter: true, chip: 2 }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      hide: !isWide,
      cellRenderer: ({ data, value }) => (
        <span>
          <span className="tabular-nums font-mono text-xs font-bold text-text">{value}</span>
          <ScoreMarker isPinned={(data.pinnedCategories || []).includes(key)} />
        </span>
      ),
    })),
    {
      field: "score",
      headerName: "Score",
      width: columnWidth("Score", "numeric", { filter: true }),
      type: "rightAligned",
      filter: "agNumberColumnFilter",
      cellRenderer: ({ value }) => (
        <span className={`inline-flex items-center justify-center w-12 py-0.5 rounded font-mono font-bold text-xs ${scoreColor(value)}`}>{value}</span>
      ),
    },
    {
      colId: "detail",
      headerName: "",
      width: 44,
      sortable: false,
      hide: isWide,
      cellRenderer: ({ data }) => (
        <button
          onClick={() => setDetailTicker(data.ticker)}
          aria-label={`Category detail for ${data.ticker}`}
          className="nav-touch p-1 rounded text-text-3 hover:text-text"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ], [isWide, stocks, removeStock, updateStock]);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Main Score Card</h2>
          <p className="text-[11px] text-text-3 font-mono">Read-only rollup. Review factors and manage score overrides on each category tab. Score ≥ 75 = potential buy.</p>
        </div>
        <Legend />
      </div>
      <KapmanGrid
        rows={rows}
        columnDefs={columnDefs}
        ariaLabel="Main score card"
        getRowId={(params) => params.data.ticker}
        defaultSort={[{ colId: "score", sort: "desc" }]}
        onGridReady={(event) => setApi(event.api)}
      />
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
