import { useCallback, useMemo, useState } from "react";
import { useGridFilter } from "ag-grid-react";

// A set filter for AG Grid **Community** (UI-5).
//
// The issue asks for "set filter on Signal and judgment columns". AG Grid's
// own agSetColumnFilter is Enterprise, and taking a paid licence for a
// checkbox list is the wrong trade — so this is the Community equivalent: the
// distinct values actually present in the column, each toggleable, with
// select-all/none. Registered through useGridFilter, which is what makes
// doesFilterPass authoritative; declaring it on the colDef does nothing.

const normalize = (value) => (value == null || value === "" ? "—" : String(value));

export default function SetFilter({ model, onModelChange, getValue, api, colDef }) {
  const [version, setVersion] = useState(0);

  const doesFilterPass = useCallback(({ node }) => {
    if (!model?.values?.length) return true;
    return model.values.includes(normalize(getValue(node)));
  }, [model, getValue]);

  useGridFilter({ doesFilterPass });

  // The options are the values in the data, so a judgment nobody has assigned
  // never appears as a dead checkbox.
  const options = useMemo(() => {
    const found = new Set();
    api?.forEachNode((node) => {
      if (node.data) found.add(normalize(getValue(node)));
    });
    return [...found].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    // version forces a recount when the underlying rows change while open
  }, [api, getValue, version]);

  const selected = model?.values ?? null; // null = no filter, everything shows

  const push = (next) => {
    // An empty selection means "no filter", not "match nothing" — a filter
    // that hides every row on its first click reads as broken.
    onModelChange(next.length === 0 || next.length === options.length ? null : { values: next });
    setVersion((v) => v + 1);
  };

  const toggle = (value) => {
    const current = selected ?? options;
    push(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  return (
    <div className="p-2 min-w-40 max-h-64 overflow-y-auto bg-surface-2 text-text-2" role="group" aria-label={`Filter by ${colDef?.headerName || "value"}`}>
      <div className="flex items-center gap-3 pb-1.5 mb-1 border-b border-border-subtle">
        <button type="button" className="text-[10px] uppercase tracking-wider text-accent" onClick={() => push(options)}>All</button>
        <button type="button" className="text-[10px] uppercase tracking-wider text-text-3 hover:text-text" onClick={() => push([])}>None</button>
      </div>
      {options.map((value) => (
        <label key={value} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={selected === null || selected.includes(value)}
            onChange={() => toggle(value)}
          />
          <span className="truncate">{value}</span>
        </label>
      ))}
    </div>
  );
}
