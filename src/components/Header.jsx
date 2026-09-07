import { useEffect, useRef, useState } from "react";
import { Settings, Camera, RefreshCw, MoreHorizontal } from "lucide-react";
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

  // Absent rather than "unknown" when the endpoint cannot be reached
  // (decision 06).
  if (!info?.version) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Release details"
        title={info.sha}
        // The bound and truncation live in .km-version-chip now (theme
        // 099890c): the primitive owns them for every sibling.
        className="km-version-chip cursor-pointer"
      >
        {info.version}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 min-w-48 rounded border border-border bg-surface-2 px-3 py-2 text-[11px] font-mono shadow-lg z-30 whitespace-nowrap">
          <div className="flex justify-between gap-4"><span className="text-text-3">Commit</span><span className="text-text-2">{info.sha || info.version}</span></div>
          {info.deploymentId && (
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Standalone iOS (display: standalone + black-translucent status bar)
  // draws the page under the clock; the header pads the top inset the same
  // way the tab bar and action bar pad the bottom one (#50).
  return (
    <header
      className="border-b border-border bg-surface-2 backdrop-blur sticky top-0 z-20"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 flex-none">
            {/* The 28px lockup renders the SMALL mark, not the master: the
                same K letterform with less detail, because the master's bull
                and bear collapse into mud at this size (measured;
                kapman-design #10, Vendor SHA cfa549f). Both are vendored from
                kapman-design/theme/assets/ and the sibling apps render the
                same pair. */}
            <img src="/kapman-mark-small.png" alt="" aria-hidden="true" width={28} height={28} className="w-7 h-7 rounded-md" />
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
          {/* Settings and Snapshot fold into the ⋯ sheet below lg:, where the
              full action row does not fit (UI-1). Refresh Prices is the
              primary action and stays out. */}
          <button onClick={() => setShowSettings((v) => !v)}
            className="hidden lg:flex px-3 py-2 rounded border border-border bg-surface-3 hover:border-border-strong text-xs items-center gap-2 transition">
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <button onClick={takeSnapshot} disabled={snapshotting || refreshing || dataLoading || !!dataError}
            title="Freeze today's model state (prices, EPS, scores, IV, signals, fundamentals) to the snapshot log and copy the JSON for the knowledge base"
            className="hidden lg:flex px-3 py-2 rounded border border-accent-border text-accent hover:bg-accent-dim text-xs items-center gap-2 transition disabled:opacity-60 font-medium">
            <Camera className={`w-3.5 h-3.5 ${snapshotting ? "animate-pulse" : ""}`} />
            {snapshotting ? "Snapshotting…" : "Snapshot + Copy JSON"}
          </button>
          <button onClick={refreshPrices} disabled={refreshing || dataLoading || !!dataError}
            aria-label="Refresh Prices"
            className="px-3 py-2 rounded bg-accent hover:brightness-105 text-text-on-fill text-xs flex items-center gap-2 transition disabled:opacity-60 font-medium">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh Prices"}</span>
          </button>
          <div ref={menuRef} className="relative lg:hidden">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="More actions"
              className="nav-touch px-3 py-2 rounded border border-border bg-surface-3 text-text-2 flex items-center"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-[71] min-w-56 rounded-lg border border-border bg-surface-2 shadow-lg p-2">
                {save && (
                  <div className="flex items-center justify-between gap-3 px-2.5 py-2 border-b border-border-subtle mb-1">
                    <span className="km-section-label">Status</span>
                    <span className={`km-save ${save.pill}`}>{save.label}</span>
                  </div>
                )}
                <button
                  onClick={() => { setMenuOpen(false); setShowSettings((v) => !v); }}
                  className="nav-touch w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left text-xs text-text-2 hover:text-text hover:bg-surface-3"
                >
                  <Settings className="w-3.5 h-3.5 shrink-0" /> Settings
                </button>
                <button
                  onClick={() => { setMenuOpen(false); takeSnapshot(); }}
                  disabled={snapshotting || refreshing || dataLoading || !!dataError}
                  className="nav-touch w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left text-xs text-text-2 hover:text-text hover:bg-surface-3 disabled:opacity-50"
                >
                  <Camera className={`w-3.5 h-3.5 shrink-0 ${snapshotting ? "animate-pulse" : ""}`} />
                  {snapshotting ? "Snapshotting…" : "Snapshot + Copy JSON"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {refreshMsg && <div className="max-w-[1500px] mx-auto px-6 pb-3 text-xs text-accent font-mono">{refreshMsg}</div>}
    </header>
  );
}
