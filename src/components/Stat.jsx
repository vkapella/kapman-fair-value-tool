export default function Stat({ label, value, sub, tone = "zinc" }) {
  const tc = tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : "text-zinc-100";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${tc}`}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{sub}</div>
    </div>
  );
}
