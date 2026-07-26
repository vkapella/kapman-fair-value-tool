import { useMemo, useRef, useState } from "react";
import { UploadCloud, AlertTriangle, CheckCircle2, Loader2, FileSpreadsheet } from "lucide-react";
import { apiRequest } from "../lib/api.js";

const FIELD_LABELS = {
  ttmEPS: "TTM EPS",
  growth: "Growth %",
  valuation: "Valuation",
  growthScore: "Growth Score",
  moat: "Moat",
  executionRisk: "Execution Risk",
  economy: "Economy",
  updated: "Updated",
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function fmtVal(field, value) {
  if (value == null) return "—";
  if (field === "updated") return value;
  if (field === "growth") return `${Number(value).toFixed(0)}%`;
  if (field === "ttmEPS") return Number(value).toFixed(2);
  return Number(value).toFixed(0);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
  } catch (_) {
    return iso;
  }
}

async function postWorkbook(file) {
  const buf = await file.arrayBuffer();
  const res = await fetch("/api/import/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Import-Filename": encodeURIComponent(file.name),
    },
    body: buf,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// Turns the operator's current checkbox/radio selections into the payload
// POST /api/import/apply expects. Kept outside the component body since it's
// a pure transform of (preview, selection) -> request body.
function buildApplyPayload(preview, sel) {
  const updateByTicker = new Map();
  const ensureEntry = (ticker) => {
    if (!updateByTicker.has(ticker)) updateByTicker.set(ticker, { ticker, fields: {}, pinEps: false });
    return updateByTicker.get(ticker);
  };

  for (const u of preview.updates) {
    if (!sel.updateChecked[u.ticker]) continue;
    const entry = ensureEntry(u.ticker);
    for (const [field, { new: newValue }] of Object.entries(u.fields)) entry.fields[field] = newValue;
    if (u.willPinEps) entry.pinEps = true;
  }

  const conflictResolutions = [];
  for (const c of preview.conflicts) {
    const key = `${c.ticker}|${c.field}`;
    const choice = sel.conflictChoice[key] || "mine";
    conflictResolutions.push({ ticker: c.ticker, field: c.field, resolution: choice, theirs: c.theirs });
    if (choice === "theirs") {
      const entry = ensureEntry(c.ticker);
      entry.fields[c.field] = c.theirs;
      if (c.field === "ttmEPS") entry.pinEps = true;
    }
  }

  const updates = [...updateByTicker.values()].filter((u) => Object.keys(u.fields).length > 0 || u.pinEps);

  const addTickers = preview.adds
    .filter((a) => sel.addChecked[a.ticker])
    .map((a) => ({
      ticker: a.ticker,
      ttmEPS: a.ttmEPS,
      growth: a.growth,
      currentPrice: a.currentPrice,
      updated: a.updated,
      valuation: a.valuation,
      growthScore: a.growthScore,
      moat: a.moat,
      executionRisk: a.executionRisk,
      economy: a.economy,
    }));

  return { source: preview.source, updates, conflictResolutions, addTickers };
}

function Section({ title, subtitle, count, children }) {
  return (
    <div className="border-t border-zinc-800 first:border-t-0">
      <div className="px-4 py-2.5 flex items-baseline gap-2 bg-zinc-900/40">
        <h3 className="text-xs uppercase tracking-wider font-medium text-zinc-300">{title}</h3>
        {count != null && <span className="text-[10px] font-mono text-zinc-500">({count})</span>}
        {subtitle && <span className="text-[10px] text-zinc-500 font-mono ml-auto">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ImportPanel({ onImported }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const [updateChecked, setUpdateChecked] = useState({});
  const [conflictChoice, setConflictChoice] = useState({});
  const [addChecked, setAddChecked] = useState({});
  const [addFilter, setAddFilter] = useState("");
  const [addSort, setAddSort] = useState("score-desc");

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  async function loadFile(file) {
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    setError(null);
    setPreview(null);
    setApplyResult(null);
    setApplyError(null);
    try {
      const data = await postWorkbook(file);
      setPreview(data);
      setUpdateChecked(Object.fromEntries(data.updates.map((u) => [u.ticker, true])));
      setConflictChoice(Object.fromEntries(data.conflicts.map((c) => [`${c.ticker}|${c.field}`, "mine"])));
      setAddChecked(Object.fromEntries(data.adds.map((a) => [a.ticker, a.preChecked])));
    } catch (err) {
      setError(err.message || "failed to parse workbook");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

  const filteredAdds = useMemo(() => {
    if (!preview) return [];
    let rows = preview.adds;
    if (addFilter.trim()) {
      const q = addFilter.trim().toUpperCase();
      rows = rows.filter((a) => a.ticker.includes(q));
    }
    rows = [...rows];
    if (addSort === "score-desc") rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    else if (addSort === "score-asc") rows.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    else if (addSort === "ticker") rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else if (addSort === "pctiv") rows.sort((a, b) => a.pctIV - b.pctIV);
    return rows;
  }, [preview, addFilter, addSort]);

  const applyPayload = useMemo(() => (preview ? buildApplyPayload(preview, { updateChecked, conflictChoice, addChecked }) : null), [preview, updateChecked, conflictChoice, addChecked]);

  const nothingSelected = !applyPayload || (applyPayload.updates.length === 0 && applyPayload.addTickers.length === 0);

  async function handleApply() {
    if (!preview || !applyPayload) return;
    setApplying(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const result = await apiRequest("/api/import/apply", { method: "POST", body: JSON.stringify(applyPayload) });
      setApplyResult(result);
      onImported?.(result);
    } catch (err) {
      setApplyError(err.message || "apply failed");
    } finally {
      setApplying(false);
    }
  }

  const updatedTickerCount = applyPayload?.updates.length ?? 0;
  const addTickerCount = applyPayload?.addTickers.length ?? 0;

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Sheet Import</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Upload an IWB workbook to review a diff and choose what to apply. Every workbook ticker is reachable here, not just score ≥ 75.</p>
      </div>

      <div className="p-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition ${
            dragActive ? "border-emerald-400 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
          <UploadCloud className="w-6 h-6 mx-auto text-zinc-500 mb-2" />
          <div className="text-sm text-zinc-300">Drop the IWB workbook here, or click to choose a file</div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">.xlsx · Main Score Card tab</div>
          {fileName && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400">
              <FileSpreadsheet className="w-3.5 h-3.5" /> {fileName}
            </div>
          )}
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin" /> parsing workbook…
          </div>
        )}

        {error && (
          <div className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        )}
      </div>

      {preview && (
        <div>
          <div className="px-4 py-2 text-[10px] font-mono text-zinc-500 border-t border-zinc-800">
            {preview.meta.count} tickers in “{preview.meta.tabName}” · source: {preview.source}
          </div>

          {preview.conflicts.length > 0 && (
            <Section title="Conflicts" count={preview.conflicts.length} subtitle="defaults to keep mine">
              <div className="divide-y divide-zinc-900">
                {preview.conflicts.map((c) => {
                  const key = `${c.ticker}|${c.field}`;
                  const choice = conflictChoice[key] || "mine";
                  return (
                    <div key={key} className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-zinc-900/30">
                      <div className="text-xs font-mono text-zinc-300">
                        <span className="text-amber-300 font-semibold">{c.ticker}</span>
                        <span className="text-zinc-500"> · {fieldLabel(c.field)}</span>
                        {"  —  "}
                        <span>you <b className="text-zinc-100">{fmtVal(c.field, c.mine)}</b></span>
                        <span className="text-zinc-500"> · last import </span>
                        <span>{fmtVal(c.field, c.base)}</span>
                        <span className="text-zinc-500"> ({fmtDate(c.baseImportedAt)}) · workbook </span>
                        <span className="text-emerald-300">{fmtVal(c.field, c.theirs)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setConflictChoice((s) => ({ ...s, [key]: "mine" }))}
                          className={`px-2 py-1 rounded text-[10px] uppercase tracking-wide border ${
                            choice === "mine" ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          keep mine
                        </button>
                        <button
                          onClick={() => setConflictChoice((s) => ({ ...s, [key]: "theirs" }))}
                          className={`px-2 py-1 rounded text-[10px] uppercase tracking-wide border ${
                            choice === "theirs" ? "border-amber-400 bg-amber-500/15 text-amber-300" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          take Brandon's
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {preview.updates.length > 0 && (
            <Section title="Clean updates" count={preview.updates.length} subtitle="checked by default">
              <div className="max-h-64 overflow-y-auto divide-y divide-zinc-900">
                {preview.updates.map((u) => (
                  <label key={u.ticker} className="px-4 py-2 flex items-start gap-3 hover:bg-zinc-900/30 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 accent-emerald-500"
                      checked={!!updateChecked[u.ticker]}
                      onChange={(e) => setUpdateChecked((s) => ({ ...s, [u.ticker]: e.target.checked }))}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-zinc-200 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{u.ticker}</span>
                        {Object.entries(u.fields).map(([field, { old, new: nv }]) => (
                          <span key={field} className="text-zinc-500">
                            {fieldLabel(field)}: <span className="text-zinc-400">{fmtVal(field, old)}</span> → <span className="text-emerald-300">{fmtVal(field, nv)}</span>
                          </span>
                        ))}
                        {u.willPinEps && <span className="text-[9px] uppercase tracking-wide text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded px-1 py-0.5">will pin EPS</span>}
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        %IV {u.pctIVBefore.toFixed(1)} → {u.pctIVAfter.toFixed(1)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {preview.adds.length > 0 && (
            <Section title="Adds — workbook tickers not tracked" count={preview.adds.length} subtitle="pre-checked ≥ 75">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-zinc-900">
                <input
                  value={addFilter}
                  onChange={(e) => setAddFilter(e.target.value)}
                  placeholder="filter ticker…"
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 w-32 focus:outline-none focus:border-emerald-500"
                />
                <select
                  value={addSort}
                  onChange={(e) => setAddSort(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="score-desc">sort: score ↓</option>
                  <option value="score-asc">sort: score ↑</option>
                  <option value="pctiv">sort: %IV</option>
                  <option value="ticker">sort: ticker</option>
                </select>
                <span className="ml-auto text-[10px] text-zinc-500 font-mono">
                  {Object.values(addChecked).filter(Boolean).length} selected
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-zinc-900">
                {filteredAdds.map((a) => (
                  <label key={a.ticker} className="px-4 py-2 flex items-center gap-3 hover:bg-zinc-900/30 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={!!addChecked[a.ticker]}
                      onChange={(e) => setAddChecked((s) => ({ ...s, [a.ticker]: e.target.checked }))}
                    />
                    <div className="flex-1 grid grid-cols-5 gap-2 text-xs font-mono">
                      <span className="text-zinc-200 font-semibold">{a.ticker}</span>
                      <span className={`${a.score >= 75 ? "text-emerald-300" : "text-zinc-400"}`}>score {a.score?.toFixed(0) ?? "—"}</span>
                      <span className="text-zinc-500">EPS {fmtVal("ttmEPS", a.ttmEPS)}</span>
                      <span className="text-zinc-500">growth {fmtVal("growth", a.growth)}</span>
                      <span className="text-zinc-500">%IV {a.pctIV.toFixed(1)}</span>
                    </div>
                  </label>
                ))}
                {filteredAdds.length === 0 && <div className="px-4 py-6 text-center text-xs text-zinc-600 font-mono">no tickers match "{addFilter}"</div>}
              </div>
            </Section>
          )}

          {preview.skips.length > 0 && (
            <Section title="Skipped" count={preview.skips.length} subtitle="cannot add — missing required data">
              <div className="max-h-40 overflow-y-auto divide-y divide-zinc-900">
                {preview.skips.map((s) => (
                  <div key={s.ticker} className="px-4 py-1.5 text-xs font-mono text-zinc-500 flex items-center gap-2">
                    <span className="text-zinc-400">{s.ticker}</span>
                    <span>score {s.score?.toFixed(0) ?? "—"}</span>
                    <span className="text-zinc-600">{s.reason}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {preview.updates.length === 0 && preview.conflicts.length === 0 && preview.adds.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-500 font-mono">Workbook matches the app exactly — nothing to import.</div>
          )}

          <div className="border-t border-zinc-800 px-4 py-3 flex items-center gap-3 bg-zinc-900/40">
            <button
              onClick={handleApply}
              disabled={nothingSelected || applying}
              className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-emerald-950 text-xs font-medium transition flex items-center gap-2"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Apply {updatedTickerCount} update{updatedTickerCount === 1 ? "" : "s"} · add {addTickerCount} ticker{addTickerCount === 1 ? "" : "s"}
            </button>
            <span className="text-[10px] text-zinc-500 font-mono">a snapshot of the current model is taken first</span>

            {applyError && (
              <span className="text-xs text-rose-300 font-mono flex items-center gap-1.5 ml-auto">
                <AlertTriangle className="w-3.5 h-3.5" /> {applyError}
              </span>
            )}
          </div>

          {applyResult && (
            <div className="px-4 py-3 border-t border-zinc-800 bg-emerald-500/5">
              <div className="flex items-center gap-2 text-xs text-emerald-300 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                snapshot #{applyResult.snapshotRunId} taken · {applyResult.updated} updated · {applyResult.added} added
              </div>
              {applyResult.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {applyResult.errors.map((e, i) => (
                    <div key={i} className="text-[11px] font-mono text-rose-300">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
