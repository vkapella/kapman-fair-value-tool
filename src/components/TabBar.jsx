import { BookOpen, ListPlus, Plus, Target } from "lucide-react";
import { MAIN_TABS } from "./tabs.js";

export default function TabBar({ topTab, setTopTab, tab, setTab, addStock, dataLoading, dataError }) {
  const topTabs = [
    { id: "main", label: "Main Score Card", icon: Target },
    { id: "docs", label: "Docs", icon: BookOpen },
    { id: "import", label: "Ticker Import", icon: ListPlus },
  ];

  return (
    <div className="max-w-[1500px] mx-auto px-6 pt-6">
      <div className="flex items-center gap-1 border-b border-zinc-800 overflow-x-auto">
        {topTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTopTab(id)}
            className={`px-4 py-3 text-xs uppercase tracking-[0.15em] border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
              topTab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        {topTab === "main" && (
          <button onClick={addStock} disabled={dataLoading || !!dataError}
            className="ml-auto text-xs text-emerald-300 hover:text-emerald-200 px-3 py-2 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" /> Add Ticker
          </button>
        )}
      </div>
      {topTab === "main" && (
        <div className="flex items-center gap-1 border-b border-zinc-800 overflow-x-auto" aria-label="Main Score Card sections">
          {MAIN_TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                tab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}>
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
