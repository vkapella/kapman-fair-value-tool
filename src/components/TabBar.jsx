import { Plus } from "lucide-react";
import { PRIMARY_TABS } from "./tabs.js";

export default function TabBar({ tab, setTab, addStock, dataLoading, dataError }) {
  return (
    <div className="max-w-[1500px] mx-auto px-6 pt-6">
      <div className="flex gap-1 border-b border-zinc-800">
        {PRIMARY_TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-3 text-xs uppercase tracking-[0.15em] border-b-2 transition flex items-center gap-2 ${
              tab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
        <div className="ml-auto flex items-center">
          <button onClick={addStock} disabled={dataLoading || !!dataError}
            className="text-xs text-emerald-300 hover:text-emerald-200 px-3 py-2 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" /> Add Ticker
          </button>
        </div>
      </div>
    </div>
  );
}
