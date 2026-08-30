export default function SettingsPanel({ globals, setGlobals }) {
  return (
    <div className="border-b border-border bg-surface-2">
      <div className="max-w-[1500px] mx-auto px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.2em] text-text-3 mb-3">Formula Globals</div>
        <div className="grid grid-cols-4 gap-6">
          {[
            { k: "peNoGrowth", label: "P/E (no growth)", help: "Graham's base multiplier (orig. 8.5)" },
            { k: "g", label: "Growth multiplier", help: "Coefficient on growth % (orig. 2)" },
            { k: "avgYieldAAA", label: "Avg AAA Yield", help: "Historical AAA bond yield baseline" },
            { k: "bondYield", label: "Current Bond Yield", help: "Live AAA / 10Y reference yield" },
          ].map(({ k, label, help }) => (
            <div key={k}>
              <label className="text-[11px] uppercase tracking-wider text-text-2">{label}</label>
              <input type="number" step="0.1" value={globals[k]}
                onChange={(e) => setGlobals((g) => ({ ...g, [k]: parseFloat(e.target.value) || 0 }))}
                className="mt-1 w-full bg-surface-3 border border-border-strong px-3 py-2 rounded text-text font-mono text-sm focus:border-accent outline-none" />
              <div className="text-[10px] text-text-3 mt-1">{help}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
