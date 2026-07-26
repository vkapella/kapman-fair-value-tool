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
        className={`${width} bg-zinc-900 border border-emerald-500/60 px-1.5 py-1 text-zinc-100 font-mono text-xs rounded outline-none`} />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`${width} text-left font-mono text-xs px-1.5 py-1 hover:bg-zinc-800/60 rounded transition`}>{value}</button>
  );
}
