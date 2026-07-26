import { useState, useEffect } from "react";
import { formatFieldValue } from "../../lib/format.js";

// Quantitative factor cell for the category maintenance grids. Unlike
// NumCell (which always writes a plain number to a stock column), this cell
// tracks fetched-vs-manual separately: no override shows the provider value
// dimmed, an override shows bright with a clear (×) affordance, and an empty
// commit clears the override rather than zeroing it out.
export default function FactorCell({ fetched, manual, format, onCommit, width = "w-24" }) {
  const [editing, setEditing] = useState(false);
  const hasOverride = manual != null;
  const effective = hasOverride ? manual : fetched;
  const [draft, setDraft] = useState(effective ?? "");
  useEffect(() => { setDraft(effective ?? ""); }, [effective]);

  const commit = () => {
    setEditing(false);
    const raw = typeof draft === "string" ? draft.trim() : draft;
    if (raw === "" || raw == null) {
      if (hasOverride) onCommit(null);
      return;
    }
    if (format === "text") {
      if (raw !== manual) onCommit(raw);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n !== manual) onCommit(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(effective ?? ""); setEditing(false); }
        }}
        className={`${width} bg-zinc-900 border border-emerald-500/60 px-1.5 py-1 ${format === "text" ? "text-left" : "text-right tabular-nums"} text-zinc-100 font-mono text-xs rounded outline-none`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <button
        onClick={() => setEditing(true)}
        title={hasOverride ? "Manual override — click to edit" : "Fetched from provider — click to set an override"}
        className={`${width} ${format === "text" ? "text-left" : "text-right tabular-nums"} font-mono text-xs px-1.5 py-1 hover:bg-zinc-800/60 rounded transition ${
          hasOverride ? "text-zinc-100" : "text-zinc-500"
        }`}
      >
        {hasOverride && <span className="text-emerald-400 mr-1">●</span>}
        {formatFieldValue(effective, format)}
      </button>
      {hasOverride && (
        <button
          onClick={(e) => { e.stopPropagation(); onCommit(null); }}
          title="Clear override — revert to fetched value"
          className="text-zinc-600 hover:text-rose-400 text-[10px] leading-none px-0.5"
        >
          ×
        </button>
      )}
    </div>
  );
}
