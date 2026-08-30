export default function SortHeader({ col, label, sortBy, sortDir, sortToggle, align = "right", className = "" }) {
  const active = sortBy === col;
  return (
    <th className={`px-2 py-2 text-${align} text-[10px] uppercase tracking-wider font-medium text-text-3 hover:text-text cursor-pointer select-none ${className}`} onClick={() => sortToggle(col)}>
      <span className="inline-flex items-center gap-1">{label}{active && <span className="text-accent">{sortDir === "desc" ? "▼" : "▲"}</span>}</span>
    </th>
  );
}
