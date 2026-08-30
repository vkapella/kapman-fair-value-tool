import { useState, useEffect } from "react";

export default function TextCell({ value, onChange, width = "w-20", uppercase = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { setEditing(false); onChange(uppercase ? draft.toUpperCase() : draft); };
  if (editing) {
    return (
      <input autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`${width} bg-surface-3 border border-accent px-1.5 py-1 text-text font-mono text-xs rounded outline-none`} />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`${width} text-left font-mono text-xs px-1.5 py-1 hover:bg-surface-3 rounded transition`}>{value}</button>
  );
}
