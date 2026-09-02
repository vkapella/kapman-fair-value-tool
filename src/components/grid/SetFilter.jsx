import { useCallback, useEffect, useMemo, useState } from "react";
import { useGridFilter } from "ag-grid-react";

// A set filter for AG Grid **Community** (UI-5).
//
// The issue asks for "set filter on Signal and judgment columns". AG Grid's
// own agSetColumnFilter is Enterprise, and taking a paid licence for a
// checkbox list is the wrong trade — so this is the Community equivalent: the
// distinct values actually present in the column, each toggleable, with
// select-all/none. Registered through useGridFilter, which is what makes
// doesFilterPass authoritative; declaring it on the colDef does nothing.
//
// Owner ruling 58 fixed the meaning of a click, because this panel and
// Tradelog's disagreed about it. Tradelog's semantics are canonical:
//
//   - the panel opens with NOTHING checked, so a check reads as "show me this"
//   - clicking a value ADDS it to the set, it never excludes
//   - the filter COMMITS ON APPLY, never on an individual toggle
//   - Escape reverts the draft to whatever is committed
//
// This panel previously opened all-checked, made a click mean "exclude", and
// committed on every toggle — so the grid re-filtered under the operator's
// cursor while they were still choosing. Persisted filter shapes are
// unchanged: the model is still { values: [...] } or null, so a saved filter
// from before this change still loads.

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

  // What the grid is actually filtering on right now. null = no filter.
  const committed = model?.values ?? null;

  // What the operator has ticked but not yet applied. Starts from the
  // committed set, so reopening a filter shows the selection it is enforcing;
  // with no filter applied that is the empty set, which is ruling 58's
  // "opens with nothing checked".
  const [draft, setDraft] = useState(() => committed ?? []);

  // Re-sync when the committed model changes from outside this panel — the
  // toolbar's clear-all, or a filter restored with the view.
  useEffect(() => {
    setDraft(model?.values ?? []);
  }, [model]);

  // Escape abandons the draft rather than the panel's contents: the operator
  // gets back exactly what the grid is enforcing, with nothing committed.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setDraft(committed ?? []);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [committed]);

  const toggle = (value) => {
    setDraft((current) => (
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    ));
  };

  const apply = () => {
    // An empty selection means "no filter", not "match nothing" — a filter
    // that hides every row reads as broken. Everything selected is the same
    // statement, so both collapse to null and the persisted shape stays small.
    onModelChange(draft.length === 0 || draft.length === options.length ? null : { values: draft });
    setVersion((v) => v + 1);
    api?.hidePopupMenu?.();
  };

  const dirty = (committed ?? []).length !== draft.length
    || draft.some((v) => !(committed ?? []).includes(v));

  return (
    <div className="p-2 min-w-40 max-h-64 overflow-y-auto bg-surface-2 text-text-2" role="group" aria-label={`Filter by ${colDef?.headerName || "value"}`}>
      <div className="flex items-center gap-3 pb-1.5 mb-1 border-b border-border-subtle">
        <button type="button" className="text-[10px] uppercase tracking-wider text-accent" onClick={() => setDraft(options)}>All</button>
        <button type="button" className="text-[10px] uppercase tracking-wider text-text-3 hover:text-text" onClick={() => setDraft([])}>None</button>
      </div>
      {options.map((value) => (
        <label key={value} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent"
            checked={draft.includes(value)}
            onChange={() => toggle(value)}
          />
          <span className="truncate">{value}</span>
        </label>
      ))}
      {/* Commit is explicit (ruling 58). The button carries the state so the
          operator can see there is something uncommitted; Escape discards it. */}
      <div className="flex items-center justify-end pt-1.5 mt-1 border-t border-border-subtle">
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          className="nav-touch px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-accent text-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
