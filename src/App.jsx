import React, { useState, useEffect, useMemo, useRef } from "react";
import { TrendingUp, Plus, Trash2, RefreshCw, Calculator, Target, Settings } from "lucide-react";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "./lib/defaultData.js";

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
    return { ...s, iv, pctIV, score, ...sig };
  }), [stocks, globals]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
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
              <p className="text-xs text-zinc-500 mt-1 ml-11 font-mono">
                IV = EPS × ({globals.peNoGrowth} + {globals.g} × g%) × ({globals.avgYieldAAA} / {globals.bondYield})
              </p>
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
            <Stat label="Buy Zone" value={stats.buyZone} sub="score≥75 & under IV" tone="emerald" />
            <Stat label="Overvalued" value={stats.overvalued} sub="≥110% of IV" tone="rose" />
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
              {tab === "scorecard" && <ScoreCardTable rows={sorted} updateStock={updateStock} removeStock={removeStock} stocks={stocks} sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />}
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
                  yahooData={yahooData}
                />
              )}
              {tab === "allocation" && <AllocationTable rows={sorted} sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />}
            </>
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

function ScoreCardTable({ rows, updateStock, removeStock, stocks, sortBy, sortDir, sortToggle }) {
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
              <SortHeader col="pctIV" label="% of IV" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
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
                  <td className="px-2 py-2 text-right"><NumCell value={r.valuation} onChange={(v) => updateStock(idx, { valuation: v })} decimals={0} max={20} width="w-14" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.growthScore} onChange={(v) => updateStock(idx, { growthScore: v })} decimals={0} max={20} width="w-14" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.moat} onChange={(v) => updateStock(idx, { moat: v })} decimals={0} max={20} width="w-14" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.executionRisk} onChange={(v) => updateStock(idx, { executionRisk: v })} decimals={0} max={10} width="w-14" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.economy} onChange={(v) => updateStock(idx, { economy: v })} decimals={0} max={30} width="w-14" /></td>
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

function IntrinsicTable({ rows, updateStock, removeStock, stocks, globals, sortBy, sortDir, sortToggle, yahooData }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold">Intrinsic Value Calculation</h2>
          <p className="text-[11px] text-zinc-500 font-mono">Click EPS, Growth, or Price to edit. IV recalculates instantly.</p>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">P/E:{globals.peNoGrowth} · g:{globals.g} · AAA:{globals.avgYieldAAA} · Bond:{globals.bondYield}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <th className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-medium text-zinc-500">Updated</th>
              <SortHeader col="ttmEPS" label="TTM EPS" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="growth" label="EPS Growth %" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="iv" label="Intrinsic Value" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="currentPrice" label="Current Price" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of IV" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <EmptyTableRow colSpan={8} message="No stocks tracked. Add a ticker to calculate intrinsic value." /> : rows.map((r) => {
              const idx = stocks.findIndex((s) => s.ticker === r.ticker);
              return (
                <tr key={r.ticker} className="hairline hover:bg-zinc-900/30 group">
                  <td className="px-3 py-2"><TextCell value={r.ticker} onChange={(v) => updateStock(idx, { ticker: v })} width="w-16" uppercase /></td>
                  <td className="px-2 py-2 text-zinc-500 font-mono text-xs"><TextCell value={r.updated} onChange={(v) => updateStock(idx, { updated: v })} width="w-16" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.ttmEPS} onChange={(v) => updateStock(idx, { ttmEPS: v })} decimals={2} width="w-20" /></td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.growth} onChange={(v) => updateStock(idx, { growth: v })} decimals={0} suffix="%" width="w-16" /></td>
                  <td className="px-2 py-2 text-right tabular-nums font-mono text-xs text-zinc-300">{fmtMoney(r.iv)}</td>
                  <td className="px-2 py-2 text-right"><NumCell value={r.currentPrice} onChange={(v) => updateStock(idx, { currentPrice: v })} decimals={2} width="w-24" /></td>
                  <td className="px-2 py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded border tabular-nums font-mono text-xs ${ivBg(r.pctIV)} ${ivColor(r.pctIV)}`}>{r.pctIV.toFixed(2)}%</span>
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
      {Object.values(yahooData).some(Boolean) && (
        <div className="border-t border-zinc-800 px-4 py-4">
          <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 mb-2">
            Yahoo Finance Reference Data (applied on refresh when available)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="hairline">
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-zinc-600">Ticker</th>
                  <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wider text-zinc-600">Company</th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-zinc-600">Current Price</th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-zinc-600">Trailing EPS</th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-zinc-600">Forward EPS</th>
                  <th className="px-2 py-1 text-right text-[10px] uppercase tracking-wider text-zinc-600">EPS Growth %</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(yahooData)
                  .filter(([, v]) => v != null)
                  .map(([ticker, q]) => (
                    <tr key={ticker} className="hairline hover:bg-zinc-900/20">
                      <td className="px-2 py-1 font-medium text-zinc-300">{ticker}</td>
                      <td className="px-2 py-1 text-zinc-500">{q.longName ?? "—"}</td>
                      <td className="px-2 py-1 text-right text-zinc-300">
                        {q.currentPrice != null ? fmtMoney(q.currentPrice) : "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-zinc-300">
                        {q.trailingEps != null ? q.trailingEps.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-zinc-300">
                        {q.forwardEps != null ? q.forwardEps.toFixed(2) : "—"}
                      </td>
                      <td className="px-2 py-1 text-right text-zinc-300">
                        {q.epsGrowthRate != null
                          ? (q.epsGrowthRate * 100).toFixed(1) + "%"
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AllocationTable({ rows, sortBy, sortDir, sortToggle }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="font-display text-lg font-bold">Allocation Signals</h2>
        <p className="text-[11px] text-zinc-500 font-mono">Algorithmic defaults from Score × % of IV.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50">
            <tr className="hairline">
              <SortHeader col="ticker" label="Ticker" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} align="left" />
              <SortHeader col="score" label="Score" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
              <SortHeader col="pctIV" label="% of IV" sortBy={sortBy} sortDir={sortDir} sortToggle={sortToggle} />
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
