import { useState, useEffect } from "react";
import { RUBRIC_DEF, suggestScore } from "../lib/rubric.js";
import { formatFieldValue, valuationRangeHint } from "../lib/format.js";

export default function ScoringWorksheet({ worksheet, onClose, onApply, globals }) {
  const def = RUBRIC_DEF[worksheet.category];
  const [overrides, setOverrides] = useState({});
  const [qualitative, setQualitative] = useState({});

  useEffect(() => {
    const next = {};
    for (const field of def.qualitativeFields) {
      const optionsLength = field.options?.length || 1;
      next[field.key] = Math.floor((optionsLength - 1) / 2);
    }
    setQualitative(next);
    const initialOverrides = {};
    if (worksheet.category === "valuation") {
      initialOverrides.pctIV = worksheet.pctIV != null
        ? Math.round(worksheet.pctIV * 100) / 100
        : "";
    }
    for (const field of def.quantitativeFields) {
      const fetchedValue = field.key === "epsGrowthRate"
        ? worksheet.epsGrowthRate
        : worksheet.fundamentals?.[field.key];
      initialOverrides[field.key] = fetchedValue ?? "";
    }
    setOverrides(initialOverrides);
  }, [worksheet.ticker, worksheet.category]);

  const { suggested, breakdown } = suggestScore(
    worksheet.category,
    { ...(worksheet.fundamentals || {}), epsGrowthRate: worksheet.epsGrowthRate },
    worksheet.pctIV,
    globals,
    { ...overrides, ...qualitative }
  );

  const breakdownByKey = new Map(breakdown.map((entry) => [entry.key, entry]));
  const quantitativeFields = worksheet.category === "valuation"
    ? [
      {
        key: "pctIV",
        label: "% of Intrinsic Value",
        format: "number",
        description: "Current price as a percentage of intrinsic value",
      },
      ...def.quantitativeFields,
    ]
    : def.quantitativeFields;

  return (
    <div
      onClick={onClose}
      style={{ minHeight: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-2xl">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-mono">{worksheet.ticker} · {def.label}</div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-zinc-400">current: {worksheet.currentScore}</div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
          </div>
        </div>

        <div className="px-4 pt-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Quantitative Inputs</div>
        <div className="px-4 pb-4 space-y-2 mt-2">
          {quantitativeFields.map((field) => {
            const entry = breakdownByKey.get(field.key);
            const bandTone = entry?.contribution >= (def.max * 0.16) ? "text-emerald-300" : entry?.contribution >= (def.max * 0.09) ? "text-amber-300" : "text-rose-300";
            return (
              <div key={field.key} className="grid grid-cols-4 gap-2 items-center text-xs">
                <div>
                  <div className="text-zinc-200">{field.label}</div>
                  <div className="text-zinc-500 text-[10px]">{field.description}</div>
                  {worksheet.category === "valuation" && (
                    <div className="text-zinc-600 text-[10px] mt-0.5">{valuationRangeHint(field.key)}</div>
                  )}
                </div>
                <div className="text-zinc-300 font-mono text-xs">{formatFieldValue(field.key === "pctIV" ? worksheet.pctIV : (worksheet.fundamentals?.[field.key] ?? (field.key === "epsGrowthRate" ? worksheet.epsGrowthRate : null)), field.format)}</div>
                <input
                  value={overrides[field.key] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setOverrides((prev) => ({ ...prev, [field.key]: raw === "" ? null : (field.format === "text" ? raw : Number(raw)) }));
                  }}
                  className="w-full bg-zinc-900 border border-zinc-700 px-1.5 py-1 text-right tabular-nums text-zinc-100 font-mono text-xs rounded outline-none"
                />
                <div className={`${bandTone} text-xs`}>{entry?.bandLabel || "—"}</div>
              </div>
            );
          })}
        </div>

        <div className="px-4 pt-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Your Judgment</div>
        <div className="px-4 pb-4 space-y-2 mt-2">
          {def.qualitativeFields.map((field) => (
            <div key={field.key} className="grid grid-cols-2 gap-2 items-center text-xs">
              <div>
                <div className="text-zinc-200">{field.label}</div>
                <div className="text-zinc-500 text-[10px]">{field.description}</div>
              </div>
              <select
                value={qualitative[field.key] ?? 0}
                onChange={(e) => setQualitative((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))}
                className="w-full bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-100 text-xs rounded outline-none"
              >
                {(field.options || []).map((opt, idx) => <option key={opt} value={idx}>{opt}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="px-4 pb-4">
          <div className="text-xs text-zinc-300 mb-1">Suggested score</div>
          <div className="h-2 bg-zinc-800 rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(suggested / def.max) * 100}%` }} /></div>
          <div className="text-xs font-mono mt-1">{suggested} / {def.max}</div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
          <button onClick={() => onApply(worksheet.ticker, worksheet.category, suggested)} className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium">Apply {suggested}</button>
          <button onClick={onClose} className="px-3 py-2 rounded border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-xs">Cancel</button>
        </div>
      </div>
    </div>
  );
}
