import React, { useState, useEffect, useMemo, useRef } from "react";
import { TrendingUp, Plus, Trash2, RefreshCw, Calculator, Target, Settings } from "lucide-react";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "./lib/defaultData.js";
import { RUBRIC_DEF, suggestScore } from "./lib/rubric.js";

const calcIV = (eps, growth, g) => eps * (g.peNoGrowth + g.g * growth) * (g.avgYieldAAA / g.bondYield);
const calcPctIV = (price, iv) => (iv > 0 ? (price / iv) * 100 : 0);
const calcScore = (s) => (s.valuation || 0) + (s.growthScore || 0) + (s.moat || 0) + (s.executionRisk || 0) + (s.economy || 0);

const allocationSignals = (s, iv, pctIV, score) => {
  const buyShares = score >= 75 && pctIV < 110;
  const buySharesPct = !buyShares ? null
    : score >= 80 && pctIV < 95 ? Math.min(5, Math.round((100 - pctIV) / 8))
    : score >= 75 && pctIV < 105 ? 2 : 1;
  const sellPuts = score >= 75 && pctIV < 100;
  const sellPutsNote = sellPuts
    ? pctIV < 85 ? "10% AV | 2yr 10% below"
    : pctIV < 95 ? "5% AV | 2yr 15% below" : "ON RADAR" : "no";
  const buyCalls = score >= 75 && pctIV < 92;
  const buyCallsNote = buyCalls ? (pctIV < 80 ? "3% | 2yr 1% above" : "ON RADAR") : "no";
  return { buyShares, buySharesPct, sellPutsNote, buyCallsNote };
};

const fmtMoney = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ivColor = (pct) =>
  pct < 80 ? "text-emerald-400" : pct < 100 ? "text-emerald-300" : pct < 110 ? "text-amber-300" : "text-rose-400";
const ivBg = (pct) =>
  pct < 80 ? "bg-emerald-500/20 border-emerald-500/40"
  : pct < 100 ? "bg-emerald-500/10 border-emerald-500/30"
  : pct < 110 ? "bg-amber-500/10 border-amber-500/30"
  : "bg-rose-500/10 border-rose-500/30";
const scoreColor = (s) =>
  s >= 80 ? "bg-emerald-500 text-emerald-950"
  : s >= 75 ? "bg-emerald-400 text-emerald-950"
  : s >= 65 ? "bg-amber-400 text-amber-950" : "bg-zinc-600 text-zinc-200";

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function todayShort() {
  return new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

function nextNewTicker(stocks) {
  const existing = new Set(stocks.map((stock) => stock.ticker));
  if (!existing.has("NEW")) return "NEW";
  let index = 2;
  while (existing.has(`NEW${index}`)) index += 1;
  return `NEW${index}`;
}

function NumCell({ value, onChange, decimals = 2, max, suffix = "", width = "w-20" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    setEditing(false);
    let n = parseFloat(draft);
    if (isNaN(n)) n = 0;
    if (max != null) n = Math.min(n, max);
    if (n < 0) n = 0;
    onChange(n);
  };
  if (editing) {
    return (
      <input autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`${width} bg-zinc-900 border border-emerald-500/60 px-1.5 py-1 text-right tabular-nums text-zinc-100 font-mono text-xs rounded outline-none`} />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`${width} text-right tabular-nums font-mono text-xs px-1.5 py-1 hover:bg-zinc-800/60 rounded transition`}>
      {typeof value === "number" ? value.toFixed(decimals) : value}{suffix}
    </button>
  );
}

function TextCell({ value, onChange, width = "w-20", uppercase = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => { setEditing(false); onChange(uppercase ? draft.toUpperCase() : draft); };
  if (editing) {
    return (
      <input autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className={`${width} bg-zinc-900 border border-emerald-500/60 px-1.5 py-1 text-zinc-100 font-mono text-xs rounded outline-none`} />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`${width} text-left font-mono text-xs px-1.5 py-1 hover:bg-zinc-800/60 rounded transition`}>{value}</button>
  );
}

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [globals, setGlobalsState] = useState(DEFAULT_GLOBALS);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState("scorecard");
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [storageStatus, setStorageStatus] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [yahooData, setYahooData] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const [worksheet, setWorksheet] = useState(null);
  const [worksheetLoading, setWorksheetLoading] = useState(null);
  const statusTimer = useRef(null);

  const markSaved = () => {
    setStorageStatus("saved");
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStorageStatus("idle"), 1500);
  };

  const showSaveError = (message) => {
    setStorageStatus("error");
    setRefreshMsg(`Save failed: ${message}`);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setRefreshMsg(""), 5000);
  };

  const loadData = async () => {
    setDataLoading(true);
    setDataError("");
    setStorageStatus("loading");
    try {
      const data = await apiRequest("/api/data");
      setStocks(Array.isArray(data.stocks) ? data.stocks : SEED_STOCKS);
      setGlobalsState({ ...DEFAULT_GLOBALS, ...(data.globals || {}) });
      setStorageStatus("idle");
    } catch (error) {
      setDataError(error.message);
      setStorageStatus("error");
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  const rows = useMemo(() => stocks.map((s) => {
    const iv = calcIV(s.ttmEPS, s.growth, globals);
    const pctIV = calcPctIV(s.currentPrice, iv);
    const score = calcScore(s);
    const sig = allocationSignals(s, iv, pctIV, score);
    const pe = s.ttmEPS > 0 ? s.currentPrice / s.ttmEPS : null;
    const forwardEps = yahooData[s.ticker]?.forwardEps ?? null;
    const forwardPe = forwardEps > 0 ? s.currentPrice / forwardEps : null;
    return { ...s, pe, forwardEps, forwardPe, iv, pctIV, score, ...sig };
  }), [stocks, globals, yahooData]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sortBy, sortDir]);

  const updateStock = async (idx, patch) => {
    const current = stocks[idx];
    if (!current) return;

    setStorageStatus("saving");
    try {
      const saved = await apiRequest(`/api/stocks/${encodeURIComponent(current.ticker)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setStocks((prev) => prev.map((stock, stockIdx) => (
        stockIdx === idx || stock.ticker === current.ticker ? saved : stock
      )));
      markSaved();
    } catch (error) {
      showSaveError(error.message);
    }
  };

  const removeStock = async (idx) => {
    const current = stocks[idx];
    if (!current) return;

    setStorageStatus("saving");
    try {
      await apiRequest(`/api/stocks/${encodeURIComponent(current.ticker)}`, { method: "DELETE" });
      setStocks((prev) => prev.filter((_, stockIdx) => stockIdx !== idx));
      markSaved();
    } catch (error) {
      showSaveError(error.message);
    }
  };

  const addStock = async () => {
    const stock = {
      ticker: nextNewTicker(stocks), ttmEPS: 1, growth: 10, currentPrice: 10,
      updated: todayShort(),
      valuation: 10, growthScore: 10, moat: 10, executionRisk: 5, economy: 15,
    };

    setStorageStatus("saving");
    try {
      const saved = await apiRequest("/api/stocks", {
        method: "POST",
        body: JSON.stringify(stock),
      });
      setStocks((prev) => [...prev, saved]);
      markSaved();
    } catch (error) {
      showSaveError(error.message);
    }
  };

  const setGlobals = async (updater) => {
    const next = typeof updater === "function" ? updater(globals) : updater;
    setGlobalsState(next);
    setStorageStatus("saving");
    try {
      const saved = await apiRequest("/api/globals", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setGlobalsState(saved);
      markSaved();
    } catch (error) {
      showSaveError(error.message);
    }
  };

  const sortToggle = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    setRefreshMsg("Fetching live quotes from Yahoo Finance…");
    try {
      const tickers = stocks.map((s) => s.ticker);
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const quoteMap = await res.json();
      setYahooData(quoteMap);

      const today = todayShort();
      const updates = stocks.map((stock) => {
        const quote = quoteMap[stock.ticker];
        if (!quote) return null;

        const patch = { updated: today };
        const price = quote.currentPrice ?? quote.previousClose;
        if (price != null) patch.currentPrice = price;
        if (quote.trailingEps != null) patch.ttmEPS = quote.trailingEps;
        if (quote.epsGrowthRate != null) patch.growth = quote.epsGrowthRate * 100;

        return Object.keys(patch).length > 1 ? { stock, patch } : null;
      }).filter(Boolean);

      const savedStocks = await Promise.all(
        updates.map(({ stock, patch }) =>
          apiRequest(`/api/stocks/${encodeURIComponent(stock.ticker)}`, {
          method: "PUT",
          body: JSON.stringify(patch),
        }).then((saved) => ({ oldTicker: stock.ticker, saved }))
      )
      );
      const savedByTicker = new Map(
        savedStocks.map(({ oldTicker, saved }) => [oldTicker, saved])
      );
      setStocks((prev) => prev.map((s) => savedByTicker.get(s.ticker) || s));
      setRefreshMsg(
        `Updated ${savedStocks.length}/${stocks.length} rows from Yahoo Finance`
      );
    } catch (e) {
      setRefreshMsg(`Refresh failed: ${e.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(""), 5000);
    }
  };

  const stats = useMemo(() => ({
    buyZone: rows.filter((r) => r.score >= 75 && r.pctIV < 100).length,
    overvalued: rows.filter((r) => r.pctIV >= 110).length,
    avgScore: rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0,
  }), [rows]);


  const handleOpenWorksheet = async (ticker, category) => {
    const row = rows.find((r) => r.ticker === ticker);
    const existing = yahooData[ticker]?.fundamentals;

    if (existing) {
      setWorksheet({
        ticker,
        category,
        fundamentals: existing,
        epsGrowthRate: yahooData[ticker]?.epsGrowthRate ?? null,
        pctIV: row?.pctIV ?? null,
        currentScore: row?.[category] ?? 0,
      });
      return;
    }

    const iconKey = `${ticker}-${category}`;
    setWorksheetLoading(iconKey);
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [ticker] }),
      });
      const data = await res.json();
      const quote = data[ticker];
      setYahooData((prev) => ({ ...prev, [ticker]: { ...(prev[ticker] || {}), ...quote } }));
      setWorksheet({
        ticker,
        category,
        fundamentals: quote?.fundamentals ?? {},
        epsGrowthRate: quote?.epsGrowthRate ?? null,
        pctIV: row?.pctIV ?? null,
        currentScore: row?.[category] ?? 0,
      });
    } catch (e) {
      setRefreshMsg(`Failed to fetch data for ${ticker}: ${e.message}`);
    } finally {
      setWorksheetLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="grid-bg min-h-screen">
        <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
          <div className="max-w-[1500px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-emerald-950" />
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight">Fair Value Evaluator</h1>
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1">v1.0 · Graham Method</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mr-2">
                {storageStatus === "loading" && "Loading…"}
                {storageStatus === "saving" && "Saving…"}
                {storageStatus === "saved" && "✓ Saved"}
                {storageStatus === "error" && "⚠ Save failed"}
              </div>
              <button onClick={() => setShowSettings((v) => !v)}
                className="px-3 py-2 rounded border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-xs flex items-center gap-2 transition">
                <Settings className="w-3.5 h-3.5" /> Settings
              </button>
              <button onClick={refreshPrices} disabled={refreshing || dataLoading || !!dataError}
                className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs flex items-center gap-2 transition disabled:opacity-60 font-medium">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh Prices"}
              </button>
            </div>
          </div>
          {refreshMsg && <div className="max-w-[1500px] mx-auto px-6 pb-3 text-xs text-emerald-300 font-mono">{refreshMsg}</div>}
        </header>

        {showSettings && (
          <div className="border-b border-zinc-800 bg-zinc-900/50">
            <div className="max-w-[1500px] mx-auto px-6 py-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-3">Formula Globals</div>
              <div className="grid grid-cols-4 gap-6">
                {[
                  { k: "peNoGrowth", label: "P/E (no growth)", help: "Graham's base multiplier (orig. 8.5)" },
                  { k: "g", label: "Growth multiplier", help: "Coefficient on growth % (orig. 2)" },
                  { k: "avgYieldAAA", label: "Avg AAA Yield", help: "Historical AAA bond yield baseline" },
                  { k: "bondYield", label: "Current Bond Yield", help: "Live AAA / 10Y reference yield" },
                ].map(({ k, label, help }) => (
                  <div key={k}>
                    <label className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</label>
                    <input type="number" step="0.1" value={globals[k]}
                      onChange={(e) => setGlobals((g) => ({ ...g, [k]: parseFloat(e.target.value) || 0 }))}
                      className="mt-1 w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-zinc-100 font-mono text-sm focus:border-emerald-500 outline-none" />
                    <div className="text-[10px] text-zinc-600 mt-1">{help}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="border-b border-zinc-800 bg-zinc-950">
          <div className="max-w-[1500px] mx-auto px-6 py-4 grid grid-cols-4 gap-6">
            <Stat label="Tracked" value={rows.length} sub="tickers" />
            <Stat label="Buy Zone" value={stats.buyZone} sub="score≥75 & under Intrinsic Value" tone="emerald" />
            <Stat label="Overvalued" value={stats.overvalued} sub="≥110% of Intrinsic Value" tone="rose" />
            <Stat label="Avg Score" value={stats.avgScore.toFixed(1)} sub="of 100" />
          </div>
        </div>

        <div className="max-w-[1500px] mx-auto px-6 pt-6">
          <div className="flex gap-1 border-b border-zinc-800">
            {[
              { id: "scorecard", label: "Main Score Card", icon: Target },
              { id: "intrinsic", label: "Intrinsic Value", icon: Calculator },
              { id: "allocation", label: "Allocation Signals", icon: TrendingUp },
            ].map(({ id, label, icon: Icon }) => (
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

        <main className="max-w-[1500px] mx-auto px-6 py-6">
          {dataLoading && <StatePanel title="Loading watchlist" message="Reading stocks and formula variables from the server database." />}
          {!dataLoading && dataError && (
            <StatePanel
              title="Unable to load saved data"
              message={`The server database could not be reached: ${dataError}`}
              actionLabel="Retry"
              onAction={loadData}
            />
          )}
          {!dataLoading && !dataError && (
            <>
              {tab === "scorecard" && <ScoreCardTable rows={sorted} updateStock={updateStock} removeStock={removeStock} stocks={stocks} sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} onOpenWorksheet={handleOpenWorksheet} worksheetLoading={worksheetLoading} />}
              {tab === "intrinsic" && (
                <IntrinsicTable
                  rows={sorted}
                  updateStock={updateStock}
                  removeStock={removeStock}
                  stocks={stocks}
                  globals={globals}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  sortToggle={sortToggle}
                />
              )}
              {tab === "allocation" && <AllocationTable rows={sorted} sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />}
            </>
          )}

          {worksheet && (
            <RubricWorksheet
              worksheet={worksheet}
              onClose={() => setWorksheet(null)}
              onApply={(ticker, category, score) => {
                const idx = stocks.findIndex((stock) => stock.ticker === ticker);
                if (idx !== -1) updateStock(idx, { [category]: score });
                setWorksheet(null);
              }}
              globals={{ ...globals, epsGrowthRate: worksheet.epsGrowthRate }}
            />
          )}

          <div className="mt-8 text-[10px] text-zinc-600 font-mono leading-relaxed">
            <p>Scoring rubric (max 100): Valuation 20 · Growth 20 · Moat 20 · Execution Risk 10 · Economy 30. Score ≥75 = potential buy.</p>
            <p className="mt-1">Allocation signals are algorithmic defaults. Override per your conviction. Not financial advice.</p>
          </div>
        </main>
      </div>
    </div>
  );
}


function formatFieldValue(value, format) {
  if (value == null || value === "") return "—";
  if (format === "percent" && typeof value === "number") return `${(value * 100).toFixed(2)}%`;
  if (format === "currency" && typeof value === "number") return `$${value.toLocaleString()}`;
  if ((format === "ratio" || format === "number") && typeof value === "number") return value.toFixed(2);
  return String(value);
}

function valuationRangeHint(key) {
  const ranges = {
    pctIV: "<70 | 70–90 | 90–110 | 110–130 | >130",
    trailingPE: "<12 | 12–15 | 15–20 | 20–25 | >25",
    priceToBook: "<1.2 | 1.2–1.5 | 1.5–3 | 3–5 | >5",
    debtToEquity: "<0.5 | 0.5–1.0 | 1.0–1.5 | 1.5–2.0 | >2.0",
    currentRatio: ">2.0 | 1.5–2.0 | 1.0–1.5 | 0.5–1.0 | <0.5",
  };
  return ranges[key] || null;
}

function RubricWorksheet({ worksheet, onClose, onApply, globals }) {
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

function Stat({ label, value, sub, tone = "zinc" }) {
  const tc = tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : "text-zinc-100";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${tc}`}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{sub}</div>
    </div>
  );
}

function StatePanel({ title, message, actionLabel, onAction }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-6 py-10 text-center">
      <div className="font-display text-xl font-bold text-zinc-100">{title}</div>
      <p className="mt-2 text-sm text-zinc-500">{message}</p>
      {actionLabel && (
        <button onClick={onAction}
          className="mt-5 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-medium transition">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function SortHeader({ col, label, sortBy, sortDir, sortToggle, align = "right" }) {
  const active = sortBy === col;
  return (
    <th className={`px-2 py-2 text-${align} text-[10px] uppercase tracking-wider font-medium text-zinc-500 hover:text-zinc-200 cursor-pointer select-none`} onClick={() => sortToggle(col)}>
      <span className="inline-flex items-center gap-1">{label}{active && <span className="text-emerald-400">{sortDir === "desc" ? "▼" : "▲"}</span>}</span>
    </th>
  );
}

function EmptyTableRow({ colSpan, message }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-xs text-zinc-500 font-mono">
        {message}
      </td>
    </tr>
  );
}

function ScoreCardTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle, onOpenWorksheet, worksheetLoading }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Main Score Card</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Each category scored manually. Click any cell to edit. Score ≥ 75 = potential buy.</p>
        </div>
        <Legend />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="valuation" label="Valuation /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="growthScore" label="Growth /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="moat" label="Moat /20" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="executionRisk" label="Exec Risk /10" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="economy" label="Economy /30" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={9} message="No stocks tracked. Add a ticker to start the watchlist." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2"><TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase /></td>
                  <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{r.pctIV.toFixed(2)}%</span></td>
                  <td className="px-2 py-2 text-right"><div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><NumCell value={r.valuation} onChange={(v) => updateStock(idx, { valuation: v })} decimals={0} max={20} width="w-14" /><button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, "valuation"); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet"><span className={worksheetLoading === `${r.ticker}-valuation` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-valuation` ? "↻" : "ⓘ"}</span></button></div></td>
                  <td className="px-2 py-2 text-right"><div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><NumCell value={r.growthScore} onChange={(v) => updateStock(idx, { growthScore: v })} decimals={0} max={20} width="w-14" /><button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, "growthScore"); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet"><span className={worksheetLoading === `${r.ticker}-growthScore` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-growthScore` ? "↻" : "ⓘ"}</span></button></div></td>
                  <td className="px-2 py-2 text-right"><div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><NumCell value={r.moat} onChange={(v) => updateStock(idx, { moat: v })} decimals={0} max={20} width="w-14" /><button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, "moat"); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet"><span className={worksheetLoading === `${r.ticker}-moat` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-moat` ? "↻" : "ⓘ"}</span></button></div></td>
                  <td className="px-2 py-2 text-right"><div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><NumCell value={r.executionRisk} onChange={(v) => updateStock(idx, { executionRisk: v })} decimals={0} max={10} width="w-14" /><button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, "executionRisk"); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet"><span className={worksheetLoading === `${r.ticker}-executionRisk` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-executionRisk` ? "↻" : "ⓘ"}</span></button></div></td>
                  <td className="px-2 py-2 text-right"><div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><NumCell value={r.economy} onChange={(v) => updateStock(idx, { economy: v })} decimals={0} max={30} width="w-14" /><button onClick={(e) => { e.stopPropagation(); onOpenWorksheet(r.ticker, "economy"); }} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 transition text-[10px] leading-none" title="Open scoring worksheet"><span className={worksheetLoading === `${r.ticker}-economy` ? "animate-spin inline-block" : ""}>{worksheetLoading === `${r.ticker}-economy` ? "↻" : "ⓘ"}</span></button></div></td>
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-flex items-center justify-center w-12 py-1 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => removeStock(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IntrinsicTable({ rows, updateStock, removeStock, stocks, globals, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Intrinsic Value Calculation</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Click EPS, Growth, or Price to edit. Intrinsic Value recalculates instantly.</p>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">Intrinsic Value = EPS × (PE_no_growth + g × Growth%) × (Avg_AAA_Yield / Bond_Yield)</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="pe" label="P/E" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="forwardPe" label="Forward P/E" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="ttmEPS" label="Trailing EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="forwardEps" label="Forward EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="growth" label="EPS Growth %" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="iv" label="Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="currentPrice" label="Current Price" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Updated Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={10} message="No stocks tracked. Add a ticker to calculate intrinsic value." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase />
                      <button onClick={() => removeStock(idx)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.pe != null ? r.pe.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.forwardPe != null ? r.forwardPe.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.ttmEPS} onChange={(v) => updateStock(idx, { ttmEPS: v })} decimals={2} width="w-20" /></td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">
                    {r.forwardEps != null ? r.forwardEps.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.growth} onChange={(v) => updateStock(idx, { growth: v })} decimals={0} suffix="%" width="w-16" /></td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">{fmtMoney(r.iv)}</td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.currentPrice} onChange={(v) => updateStock(idx, { currentPrice: v })} decimals={2} width="w-24" /></td>
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${ivBg(r.pctIV)} ${ivColor(r.pctIV)}`}>{r.pctIV.toFixed(2)}%</span>
                  </td>
                  <td className="px-2 py-2 text-zinc-500 font-mono text-xs">
                    <TextCell value={r.updated} onChange={(v) => updateStock(idx, { updated: v })} width="w-16" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllocationTable({ rows, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Allocation Signals</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Algorithmic defaults from Score × % of Intrinsic Value.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Buy Shares</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Sell Puts</th>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Buy Calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={6} message="No stocks tracked. Add a ticker to generate allocation signals." /> : rows.map((r) => (
              <tr key={r.ticker} className="hairline hover:bg-zinc-900/30">
                <td className="px-3 py-2 font-mono font-medium">{r.ticker}</td>
                <td className="px-2 py-2 text-right">
                  <span className={`inline-flex items-center justify-center w-12 py-0.5 rounded font-mono font-bold text-xs ${scoreColor(r.score)}`}>{r.score}</span>
                </td>
                <td className="px-2 py-2 text-right"><span className={`tabular-nums font-mono text-xs ${ivColor(r.pctIV)}`}>{r.pctIV.toFixed(2)}%</span></td>
                <td className="px-3 py-2">
                  {r.buyShares ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>YES {r.buySharesPct}%
                    </span>
                  ) : <span className="text-zinc-600 text-xs font-mono">no</span>}
                </td>
                <td className="px-3 py-2"><SignalText note={r.sellPutsNote} /></td>
                <td className="px-3 py-2"><SignalText note={r.buyCallsNote} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalText({ note }) {
  if (note === "no") return <span className="text-zinc-600 text-xs font-mono">no</span>;
  if (note === "ON RADAR") return <span className="text-amber-300 text-xs font-mono">ON RADAR</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>{note}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span>≥80</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-400"></span>75–79</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-400"></span>65–74</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-600"></span>&lt;65</span>
    </div>
  );
}
