export default function SortHeader({ col, label, sortBy, sortDir, sortToggle, align = "right" }) {
  const active = sortBy === col;
  return (
    <th className={`px-2 py-2 text-${align} text-[10px] uppercase tracking-wider font-medium text-zinc-500 hover:text-zinc-200 cursor-pointer select-none`} onClick={() => sortToggle(col)}>
      <span className="inline-flex items-center gap-1">{label}{active && <span className="text-emerald-400">{sortDir === "desc" ? "▼" : "▲"}</span>}</span>
    </th>
  );
}
