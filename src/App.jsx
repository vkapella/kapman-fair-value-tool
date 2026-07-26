import React, { useState, useEffect, useMemo, useRef } from "react";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "./lib/defaultData.js";
import { calcIV, calcPctIV, calcScore, allocationSignals } from "./lib/valuation.js";
import { apiRequest, todayShort, nextNewTicker } from "./lib/api.js";
import Header from "./components/Header.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import StatsBar from "./components/StatsBar.jsx";
import TabBar from "./components/TabBar.jsx";
import ScoreCardTable from "./components/ScoreCardTable.jsx";
import IntrinsicTable from "./components/IntrinsicTable.jsx";
import AllocationTable from "./components/AllocationTable.jsx";
import CategoryGrid from "./components/CategoryGrid.jsx";
import ImportPanel from "./components/ImportPanel.jsx";
import DocsPanel from "./components/DocsPanel.jsx";
import ScoringWorksheet from "./components/ScoringWorksheet.jsx";
import StatePanel from "./components/StatePanel.jsx";
import { CATEGORY_KEYS } from "./lib/rubric.js";

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [factors, setFactorsState] = useState({});
  const [computed, setComputedState] = useState({});
  const [globals, setGlobalsState] = useState(DEFAULT_GLOBALS);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [tab, setTab] = useState("scorecard");
  const [topTab, setTopTab] = useState("main");
  const [sortBy, setSortBy] = useState("score");
  const [sortDir, setSortDir] = useState("desc");
  const [storageStatus, setStorageStatus] = useState("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
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
      setFactorsState(data.factors || {});
      setComputedState(data.computed || {});
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

  // A session should return to the last working view without making a stale
  // browser preference permanent across devices or future sessions.
  useEffect(() => {
    const savedTab = window.sessionStorage.getItem("kapman-main-subtab");
    if (savedTab) setTab(savedTab);
  }, []);

  const selectMainTab = (nextTab) => {
    setTab(nextTab);
    window.sessionStorage.setItem("kapman-main-subtab", nextTab);
  };

  const rows = useMemo(() => stocks.map((s) => {
    // Old saved rows remain usable until the server has refreshed/migrated
    // them. New contract fields always take precedence over legacy ttmEPS.
    const gaapTtmEps = s.gaapTtmEps ?? s.eps?.gaap?.value ?? null;
    const adjustedTtmEps = s.adjustedTtmEps ?? s.eps?.adjusted?.value ?? null;
    const valuationTtmEps = s.valuationTtmEps ?? s.eps?.valuation?.value ?? s.ttmEPS ?? null;
    const valuationEpsBasis = s.valuationEpsBasis || s.eps?.valuation?.basis || "operator";
    const iv = calcIV(valuationTtmEps, s.growth, globals);
    const pctIV = calcPctIV(s.currentPrice, iv);
    const score = calcScore(s);
    const sig = allocationSignals(s, iv, pctIV, score);
    const pe = valuationTtmEps > 0 ? s.currentPrice / valuationTtmEps : null; // negative/absent EPS has no meaningful P/E
    const forwardEps = yahooData[s.ticker]?.forwardEps ?? null;
    const forwardPe = forwardEps > 0 ? s.currentPrice / forwardEps : null;
    const quote = yahooData[s.ticker];
    return { ...s, gaapTtmEps, adjustedTtmEps, valuationTtmEps, valuationEpsBasis, pe, forwardEps, forwardPe, iv, pctIV, score, ...sig };
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
      const result = await apiRequest(`/api/stocks/${encodeURIComponent(current.ticker)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      const saved = result.stock || result;
      setStocks((prev) => prev.map((stock, stockIdx) => (
        stockIdx === idx || stock.ticker === current.ticker ? saved : stock
      )));
      if (result.computed) {
        setComputedState((prev) => ({ ...prev, [saved.ticker]: result.computed }));
      }
      markSaved();
    } catch (error) {
      showSaveError(error.message);
    }
  };

  // patch: { factorKey: value|null }. null clears an override; quant fields
  // take a plain number (or string for sector/industry); judgment fields take
  // the option's numeric index. Server returns the authoritative factors +
  // computed for this ticker plus the possibly-recomputed stock row (an
  // unpinned category's score moves as soon as the underlying factor does).
  const updateFactor = async (ticker, patch) => {
    setStorageStatus("saving");
    try {
      const res = await apiRequest(`/api/factors/${encodeURIComponent(ticker)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setFactorsState((prev) => ({ ...prev, [ticker]: res.factors }));
      setComputedState((prev) => ({ ...prev, [ticker]: res.computed }));
      setStocks((prev) => prev.map((stock) => (stock.ticker === ticker ? res.stock : stock)));
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
      ticker: nextNewTicker(stocks), valuationTtmEps: 1, valuationEpsBasis: "operator", epsPinned: true, growth: 10, currentPrice: 10,
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
      setGlobalsState(saved.globals);
      setStocks(Array.isArray(saved.stocks) ? saved.stocks : stocks);
      setComputedState(saved.computed || {});
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
    setRefreshMsg("Fetching live quotes…");
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
      const payload = await res.json();
      const quoteMap = payload.quotes || {};
      setYahooData(quoteMap);
      const savedStocks = Array.isArray(payload.stocks) ? payload.stocks : [];
      const savedByTicker = new Map(savedStocks.map((stock) => [stock.ticker, stock]));
      setStocks((prev) => prev.map((stock) => savedByTicker.get(stock.ticker) || stock));
      setFactorsState((prev) => ({ ...prev, ...(payload.factors || {}) }));
      setComputedState((prev) => ({ ...prev, ...(payload.computed || {}) }));
      const sourceUnavailable = stocks
        .filter((stock) => {
          const quote = quoteMap[stock.ticker];
          return quote && quote.gaapTtmEps == null && quote.adjustedTtmEps == null;
        })
        .map((stock) => stock.ticker);
      setRefreshMsg(
        sourceUnavailable.length === 0
          ? `Updated ${savedStocks.length}/${stocks.length} rows`
          : `Updated ${savedStocks.length}/${stocks.length} rows — provider EPS unavailable: ${sourceUnavailable.join(", ")}`
      );
    } catch (e) {
      setRefreshMsg(`Refresh failed: ${e.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(""), 5000);
    }
  };

  // Freeze the model's current state server-side (append-only snapshot table)
  // and put the full JSON payload on the clipboard for pasting into the KB.
  const takeSnapshot = async () => {
    setSnapshotting(true);
    setRefreshMsg("Taking snapshot…");
    try {
      const payload = await apiRequest("/api/snapshot", { method: "POST" });
      let copied = false;
      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        copied = true;
      } catch (_) { /* clipboard unavailable — snapshot is still saved */ }
      setRefreshMsg(
        `Snapshot #${payload.runId} saved (${payload.stocks.length} tickers)${copied ? " · JSON copied to clipboard" : " · copy via GET /api/snapshots/" + payload.runId}`
      );
    } catch (e) {
      setRefreshMsg(`Snapshot failed: ${e.message}`);
    } finally {
      setSnapshotting(false);
      setTimeout(() => setRefreshMsg(""), 8000);
    }
  };

  const stats = useMemo(() => ({
    // Rows with no positive EPS have pctIV null -- they are neither cheap nor
    // expensive, so they must not land in either bucket.
    buyZone: rows.filter((r) => r.pctIV != null && r.score >= 75 && r.pctIV < 100).length,
    overvalued: rows.filter((r) => r.pctIV != null && r.pctIV >= 110).length,
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
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const quote = data.quotes?.[ticker];
      setYahooData((prev) => ({ ...prev, [ticker]: { ...(prev[ticker] || {}), ...quote } }));
      const savedStock = data.stocks?.find((stock) => stock.ticker === ticker);
      if (savedStock) {
        setStocks((prev) => prev.map((stock) => (stock.ticker === ticker ? savedStock : stock)));
      }
      setFactorsState((prev) => ({ ...prev, ...(data.factors || {}) }));
      setComputedState((prev) => ({ ...prev, ...(data.computed || {}) }));
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
        <Header
          storageStatus={storageStatus}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          takeSnapshot={takeSnapshot}
          snapshotting={snapshotting}
          refreshing={refreshing}
          dataLoading={dataLoading}
          dataError={dataError}
          refreshPrices={refreshPrices}
          refreshMsg={refreshMsg}
        />

        {showSettings && <SettingsPanel globals={globals} setGlobals={setGlobals} />}

        <StatsBar rowsCount={rows.length} stats={stats} />

        <TabBar topTab={topTab} setTopTab={setTopTab} tab={tab} setTab={selectMainTab} addStock={addStock} dataLoading={dataLoading} dataError={dataError} />

        <main className="max-w-[1500px] mx-auto px-6 py-6">
          {topTab === "main" && dataLoading && <StatePanel title="Loading watchlist" message="Reading stocks and formula variables from the server database." />}
          {topTab === "main" && !dataLoading && dataError && (
            <StatePanel
              title="Unable to load saved data"
              message={`The server database could not be reached: ${dataError}`}
              actionLabel="Retry"
              onAction={loadData}
            />
          )}
          {topTab === "docs" && <DocsPanel />}
          {topTab === "import" && <ImportPanel onImported={loadData} />}
          {!dataLoading && !dataError && topTab === "main" && (
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
              {CATEGORY_KEYS.includes(tab) && (
                <CategoryGrid
                  category={tab}
                  rows={sorted}
                  stocks={stocks}
                  factors={factors}
                  computed={computed}
                  updateStock={updateStock}
                  updateFactor={updateFactor}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  sortToggle={sortToggle}
                />
              )}
            </>
          )}

          {worksheet && (
            <ScoringWorksheet
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
