import Stat from "./Stat.jsx";

export default function StatsBar({ rowsCount, stats }) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-[1500px] mx-auto px-6 py-4 grid grid-cols-4 gap-6">
        <Stat label="Tracked" value={rowsCount} sub="tickers" />
        <Stat label="Buy Zone" value={stats.buyZone} sub="score≥75 & under Intrinsic Value" tone="emerald" />
        <Stat label="Overvalued" value={stats.overvalued} sub="≥110% of Intrinsic Value" tone="rose" />
        <Stat label="Avg Score" value={stats.avgScore.toFixed(1)} sub="of 100" />
      </div>
    </div>
  );
}
