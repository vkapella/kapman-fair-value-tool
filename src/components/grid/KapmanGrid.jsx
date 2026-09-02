import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

// The shared grid shell (UI-5). quartz-dark supplies AG Grid's structural CSS;
// the vendored .ag-theme-kapman adapter (kapman-grid.css) points every
// --ag-* param at a token, so a token correction restyles the grid without
// touching either file. Same pairing the Screener ships.

/** Row height comes from the tokens, not a literal: --row-h at pointer widths
 *  and --row-h-touch below, so UI-7's decision stays in one place. AG Grid
 *  virtualises on a JS number, so the token has to be read rather than
 *  inherited through CSS.
 *
 *  The query below MIRRORS kapman-grid.css by hand — the virtualiser's row
 *  height and the CSS min-height have to agree, and nothing enforces that but
 *  this comment. Ruling 57 moved both to (max-width: 1023.98px) so the 768–1024
 *  rail band gets touch rows: a coarse-pointer iPad in that band was measuring
 *  30px here against 44px in Tradelog. If the vendored file's media query moves
 *  again, both matchMedia strings move with it in the same commit. */
function useTokenRowHeight() {
  const read = () => {
    if (typeof window === "undefined") return 30;
    const styles = getComputedStyle(document.documentElement);
    const touch = window.matchMedia("(pointer: coarse) and (max-width: 1023.98px)").matches;
    const raw = styles.getPropertyValue(touch ? "--row-h-touch" : "--row-h").trim();
    return parseInt(raw, 10) || (touch ? 44 : 30);
  };

  const [height, setHeight] = useState(read);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse) and (max-width: 1023.98px)");
    const update = () => setHeight(read());
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return height;
}

export default function KapmanGrid({
  rows,
  columnDefs,
  getRowId,
  defaultSort,
  ariaLabel,
  onGridReady,
  domLayout = "autoHeight",
  // Rows are --row-h by default. A grid whose cells carry provenance under
  // the value — the intrinsic table shows each EPS with its source and
  // timestamp — needs more than one line, so it asks for a multiple of the
  // token rather than a literal height, keeping UI-7's decision upstream of
  // this. Raised with Design: the spec has one row height and no variant for
  // a cell that carries provenance.
  rowLines = 1,
}) {
  const rowHeight = useTokenRowHeight() * rowLines;

  const defaultColDef = useMemo(() => ({
    // Every column carries an explicit width (see each columnDefs entry) and
    // nothing flexes, so dragging a column never triggers a redistribution
    // flash across the others.
    resizable: false,
    sortable: true,
    suppressMovable: false, // column drag-reorder
    filter: false,
    // The width floor measures the longest word, so headers wrap rather than
    // ellipsize — the same two-line headers the hand-rolled tables had.
    wrapHeaderText: true,
    autoHeaderHeight: true,
    cellClass: "km-grid-cell",
    headerClass: "km-grid-header",
  }), []);

  return (
    <div className="ag-theme-quartz-dark ag-theme-kapman" role="region" aria-label={ariaLabel}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        rowHeight={rowHeight}
        domLayout={domLayout}
        animateRows={false}
        suppressCellFocus={false}
        suppressDragLeaveHidesColumns
        stopEditingWhenCellsLoseFocus
        onGridReady={onGridReady}
        onFirstDataRendered={(event) => {
          if (defaultSort) {
            event.api.applyColumnState({ state: defaultSort, defaultState: { sort: null } });
          }
        }}
      />
    </div>
  );
}
