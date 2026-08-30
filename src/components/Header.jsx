import { useEffect, useRef, useState } from "react";
import { Settings, Camera, RefreshCw, Calculator } from "lucide-react";
import { apiRequest } from "../lib/api.js";

const SAVE_STATES = {
  loading: { label: "Loading…", pill: "km-save--loading", dot: "bg-text-2" },
  saving: { label: "Saving…", pill: "km-save--saving", dot: "bg-accent" },
  saved: { label: "✓ Saved", pill: "km-save--saved", dot: "bg-pos" },
  error: { label: "⚠ Save failed", pill: "km-save--failed", dot: "bg-neg" },
};

function VersionChip() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/api/version")
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Version details"
        className="km-version-chip cursor-pointer"
      >
        {info ? `v${info.version}` : "v—"}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 min-w-48 rounded border border-border bg-surface-2 px-3 py-2 text-[11px] font-mono shadow-lg z-30 whitespace-nowrap">
          <div className="flex justify-between gap-4"><span className="text-text-3">Version</span><span className="text-text-2">{info ? info.version : "unavailable"}</span></div>
          <div className="flex justify-between gap-4 mt-1"><span className="text-text-3">SHA</span><span className="text-text-2">{info?.sha ? info.sha.slice(0, 12) : "—"}</span></div>
          {info?.deploymentId && (
            <div className="flex justify-between gap-4 mt-1"><span className="text-text-3">Deployment</span><span className="text-text-2">{info.deploymentId}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const save = SAVE_STATES[storageStatus] || null;
  return (
    <header className="border-b border-border bg-surface-2 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 rounded-md border border-border bg-surface-3 flex items-center justify-center flex-none">
            <Calculator className="w-4 h-4 text-gold" />
            {/* <1024px: save status collapses to a dot beside the mark; the
                text moves to the ⋯ sheet once UI-2 builds it. */}
            {save && (
              <span
                className={`lg:hidden absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full ${save.dot}`}
                title={save.label}
              />
            )}
          </div>
          <div>
            <div className="km-eyebrow">KAPMAN</div>
            <div className="flex items-center gap-2.5">
              <h1 className="km-tool-name text-[15px] font-semibold leading-tight">Fair Value</h1>
              <VersionChip />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          {save && (
            <span className={`km-save hidden lg:inline-flex ${save.pill}`}>{save.label}</span>
          )}
          <button onClick={() => setShowSettings((v) => !v)}
            className="px-3 py-2 rounded border border-border bg-surface-3 hover:border-border-strong text-xs flex items-center gap-2 transition">
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
