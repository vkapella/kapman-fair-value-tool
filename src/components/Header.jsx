import { Settings, Camera, RefreshCw, Calculator } from "lucide-react";

export default function Header({
  storageStatus,
  showSettings,
  setShowSettings,
  takeSnapshot,
  snapshotting,
  refreshing,
  dataLoading,
  dataError,
  refreshPrices,
  refreshMsg,
}) {
  return (
    <header className="border-b border-border bg-surface-2 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-accent flex items-center justify-center">
              <Calculator className="w-4 h-4 text-bg" />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Fair Value Evaluator</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text-3 mt-1">v1.0 · Graham Method</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-wider text-text-3 mr-2">
            {storageStatus === "loading" && "Loading…"}
            {storageStatus === "saving" && "Saving…"}
            {storageStatus === "saved" && "✓ Saved"}
            {storageStatus === "error" && "⚠ Save failed"}
          </div>
          <button onClick={() => setShowSettings((v) => !v)}
            className="px-3 py-2 rounded border border-border hover:border-border-strong hover:bg-surface-3 text-xs flex items-center gap-2 transition">
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <button onClick={takeSnapshot} disabled={snapshotting || refreshing || dataLoading || !!dataError}
            title="Freeze today's model state (prices, EPS, scores, IV, signals, fundamentals) to the snapshot log and copy the JSON for the knowledge base"
            className="px-3 py-2 rounded border border-accent-border text-accent hover:bg-accent-dim text-xs flex items-center gap-2 transition disabled:opacity-60 font-medium">
            <Camera className={`w-3.5 h-3.5 ${snapshotting ? "animate-pulse" : ""}`} />
            {snapshotting ? "Snapshotting…" : "Snapshot + Copy JSON"}
          </button>
          <button onClick={refreshPrices} disabled={refreshing || dataLoading || !!dataError}
            className="px-3 py-2 rounded bg-accent hover:brightness-105 text-bg text-xs flex items-center gap-2 transition disabled:opacity-60 font-medium">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh Prices"}
          </button>
        </div>
      </div>
      {refreshMsg && <div className="max-w-[1500px] mx-auto px-6 pb-3 text-xs text-accent font-mono">{refreshMsg}</div>}
    </header>
  );
}
