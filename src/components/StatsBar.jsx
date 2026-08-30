import Stat from "./Stat.jsx";

export default function StatsBar({ rowsCount, stats }) {
  return (
    <div className="border-b border-border bg-bg">
      {/* Four across from md:; two at phone width, where four columns collide. */}
      <div className="max-w-[1500px] mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <Stat label="Tracked" value={rowsCount} sub="tickers" />
        <Stat label="Buy Zone" value={stats.buyZone} sub="score≥75 & under Intrinsic Value" tone="pos" />
        <Stat label="Overvalued" value={stats.overvalued} sub="≥110% of Intrinsic Value" tone="neg" />
        <Stat label="Avg Score" value={stats.avgScore.toFixed(1)} sub="of 100" />
      </div>
    </div>
  );
}
