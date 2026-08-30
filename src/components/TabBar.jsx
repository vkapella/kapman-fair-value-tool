import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { MAIN_TABS } from "./tabs.js";

// The three rollup subtabs stay inline below lg:; the five category editors
// spill into the labelled overflow sheet. They are never collapsed into a
// single "Categories" nav item — the sheet heading is presentational and each
// editor keeps its own entry (UI-2).
const INLINE_COUNT = 3;

export default function TabBar({ tab, setTab, addStock, dataLoading, dataError }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!sheetOpen) return;
    const onDown = (event) => {
      if (sheetRef.current && !sheetRef.current.contains(event.target)) setSheetOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setSheetOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const overflow = MAIN_TABS.slice(INLINE_COUNT);
  const activeOverflowTab = overflow.find(({ id }) => id === tab);
  const pick = (id) => { setTab(id); setSheetOpen(false); };

  return (
    <div className="max-w-[1500px] mx-auto px-6 pt-4">
      <div ref={sheetRef} className="relative flex items-center border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {MAIN_TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            onClick={() => pick(id)}
            className={`nav-touch px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] border-b-2 transition items-center gap-1.5 whitespace-nowrap ${
              index < INLINE_COUNT ? "flex" : "hidden lg:flex"
            } ${tab === id ? "border-accent text-accent" : "border-transparent text-text-3 hover:text-text"}`}
          >
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
          <button
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            aria-haspopup="true"
            className={`nav-touch flex lg:hidden px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] border-b-2 transition items-center gap-1.5 whitespace-nowrap ${
              activeOverflowTab ? "border-accent text-accent" : "border-transparent text-text-3 hover:text-text"
            }`}
          >
            {activeOverflowTab ? activeOverflowTab.label : `+${overflow.length}`}
            <ChevronDown className={`w-3 h-3 transition-transform ${sheetOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {topTabAddButton(addStock, dataLoading, dataError)}
        {sheetOpen && (
          <div className="absolute left-0 top-full mt-1.5 z-[71] min-w-56 rounded-lg border border-border bg-surface-2 shadow-lg p-2 lg:hidden">
            {/* Presentational heading, not a nav level. */}
            <div className="km-section-label px-2.5 py-1.5">Categories</div>
            {overflow.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => pick(id)}
                className={`nav-touch w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left text-xs transition ${
                  tab === id ? "text-accent bg-accent-dim" : "text-text-2 hover:text-text hover:bg-surface-3"
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Add Ticker keeps its shipped placement — right-aligned in the strip, only on
// the score-card destination (this component only renders there), disabled on
// dataLoading || dataError. Below 768px the sticky action bar in App.jsx
// takes over (decision 20), so it hides here.
function topTabAddButton(addStock, dataLoading, dataError) {
  return (
    <button
      onClick={addStock}
      disabled={dataLoading || !!dataError}
      className="ml-auto hidden md:flex text-xs text-accent hover:text-accent-soft px-3 py-2 items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus className="w-3.5 h-3.5" /> Add Ticker
    </button>
  );
}
