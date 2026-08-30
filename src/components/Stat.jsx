export default function Stat({ label, value, sub, tone = "neutral" }) {
  const tc = tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-text";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-text-3">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${tc}`}>{value}</div>
      <div className="text-[10px] text-text-3 mt-0.5 font-mono">{sub}</div>
    </div>
  );
}
