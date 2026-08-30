import { useState, useEffect } from "react";

export default function NumCell({ value, onChange, decimals = 2, max, suffix = "", width = "w-20" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    setEditing(false);
    let n = parseFloat(draft);
    if (isNaN(n)) n = 0;
    if (max != null) n = Math.min(n, max);
    if (n < 0) n = 0;
    // No-op edits must not fire onChange: the EPS cell's handler pins the row
    // and stamps the date, which a click-in/click-out must never do.
    if (typeof value === "number" && n === value) return;
    onChange(n);
  };
  if (editing) {
    return (
      <input autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`${width} bg-surface-3 border border-accent px-1.5 py-1 text-right tabular-nums text-text font-mono text-xs rounded outline-none`} />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`${width} text-right tabular-nums font-mono text-xs px-1.5 py-1 hover:bg-surface-3 rounded transition`}>
      {typeof value === "number" ? value.toFixed(decimals) : value}{suffix}
    </button>
  );
}
