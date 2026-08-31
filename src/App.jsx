import React, { useState, useEffect, useMemo, useRef } from "react";
import { DEFAULT_GLOBALS, SEED_STOCKS } from "./lib/defaultData.js";
import { calcIV, calcPctIV, calcScore, allocationSignals } from "./lib/valuation.js";
import { apiRequest, todayShort, nextNewTicker } from "./lib/api.js";
import { Plus } from "lucide-react";
import Header from "./components/Header.jsx";
import DestinationNav from "./components/DestinationNav.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import StatsBar from "./components/StatsBar.jsx";
import TabBar from "./components/TabBar.jsx";
import ScoreCardTable from "./components/ScoreCardTable.jsx";
import IntrinsicTable from "./components/IntrinsicTable.jsx";
import AllocationTable from "./components/AllocationTable.jsx";
import CategoryGrid from "./components/CategoryGrid.jsx";
import ImportPanel from "./components/ImportPanel.jsx";
import DocsPanel from "./components/DocsPanel.jsx";
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
  const [showSettings, setShowSettings] = useState(false);
  // Which ticker the single-ticker category editor is showing below 1024px
  // (UI-4). Tapping a category on a score-card row opens that editor here.
  const [selectedTicker, setSelectedTicker] = useState(null);
  const statusTimer = useRef(null);

  // Save status is persistent, not a toast (UI-1): "✓ Saved" holds until the
  // next state change rather than reverting to idle on a timer.
  const markSaved = () => {
    setStorageStatus("saved");
    if (statusTimer.current) clearTimeout(statusTimer.current);
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
  // browser preference permanent across devices or future sessions. Rekeyed
  // to the UI-2 nav: destination and subtab restore independently.
  useEffect(() => {
    const savedDest = window.sessionStorage.getItem("kapman-fv-dest");
    if (savedDest && ["main", "docs", "import"].includes(savedDest)) setTopTab(savedDest);
    const savedTab = window.sessionStorage.getItem("kapman-fv-subtab")
      || window.sessionStorage.getItem("kapman-main-subtab");
    if (savedTab && ["scorecard", "intrinsic", "allocation", ...CATEGORY_KEYS].includes(savedTab)) setTab(savedTab);
  }, []);

  const selectTopTab = (nextDest) => {
    setTopTab(nextDest);
    window.sessionStorage.setItem("kapman-fv-dest", nextDest);
  };

  // Subtab panels stay mounted (hidden, not unmounted), so each editor keeps
  // its container scroll and in-progress cell drafts; the page scroll offset
  // is saved and restored per subtab here.
  const subtabScroll = useRef({});
  const selectMainTab = (nextTab) => {
    subtabScroll.current[tab] = window.scrollY;
    setTab(nextTab);
    window.sessionStorage.setItem("kapman-fv-subtab", nextTab);
    window.requestAnimationFrame(() => window.scrollTo(0, subtabScroll.current[nextTab] ?? 0));
  };

  const rows = useMemo(() => stocks.map((s) => {
    // Old saved rows remain usable until the server has refreshed/migrated
    // them. New contract fields always take precedence over legacy ttmEPS.
    const gaapTtmEps = s.gaapTtmEps ?? s.eps?.gaap?.value ?? null;
    const adjustedTtmEps = s.adjustedTtmEps ?? s.eps?.adjusted?.value ?? null;
    const valuationTtmEps = s.valuationTtmEps ?? s.eps?.valuation?.value ?? s.ttmEPS ?? null;
    const valuationEpsBasis = s.valuationEpsBasis || s.eps?.valuation?.basis || "operator";
    const iv = calcIV(valuationTtmEps, s.growth, globals);
    const suggestedGrowth = s.growthRecommendation?.value ?? null;
    const suggestedIv = suggestedGrowth == null ? null : calcIV(valuationTtmEps, suggestedGrowth, globals);
    const pctIV = calcPctIV(s.currentPrice, iv);
    const score = calcScore(s);
    const sig = allocationSignals(s, iv, pctIV, score);
    return { ...s, gaapTtmEps, adjustedTtmEps, valuationTtmEps, valuationEpsBasis, suggestedGrowth, suggestedIv, iv, pctIV, score, ...sig };
  }), [stocks, globals]);

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
  // take a plain number; judgment fields take
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

  return (
    <div className="min-h-screen bg-bg text-text">
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

        <div className="flex items-stretch">
          <DestinationNav topTab={topTab} setTopTab={selectTopTab} />

          <div className={`flex-1 min-w-0 ${topTab === "main" ? "pb-[calc(var(--tabbar-total)_+_52px)]" : "pb-[var(--tabbar-total)]"} md:pb-0`}>
            <StatsBar rowsCount={rows.length} stats={stats} />

            {topTab === "main" && <TabBar tab={tab} setTab={selectMainTab} addStock={addStock} dataLoading={dataLoading} dataError={dataError} />}

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
                  {/* Panels stay mounted so each subtab keeps its scroll
                      position and in-progress edits when you leave and return. */}
                  <div className={tab === "scorecard" ? "" : "hidden"}>
                    <ScoreCardTable
                      rows={sorted}
                      updateStock={updateStock}
                      removeStock={removeStock}
                      stocks={stocks}
                      onOpenCategory={(ticker, category) => {
                        setSelectedTicker(ticker);
                        selectMainTab(category);
                      }}
                    />
                  </div>
                  <div className={tab === "intrinsic" ? "" : "hidden"}>
                    <IntrinsicTable
                      rows={sorted}
                      updateStock={updateStock}
                      removeStock={removeStock}
                      stocks={stocks}
                    />
                  </div>
                  <div className={tab === "allocation" ? "" : "hidden"}>
                    <AllocationTable rows={sorted} />
                  </div>
                  {CATEGORY_KEYS.map((category) => (
                    <div key={category} className={tab === category ? "" : "hidden"}>
                      <CategoryGrid
                        category={category}
                        rows={sorted}
                        stocks={stocks}
                        factors={factors}
                        computed={computed}
                        updateStock={updateStock}
                        updateFactor={updateFactor}
                        sortBy={sortBy}
                        sortDir={sortDir}
                        sortToggle={sortToggle}
                        selectedTicker={selectedTicker}
                        setSelectedTicker={setSelectedTicker}
                      />
                    </div>
                  ))}
                </>
              )}
              <div className="mt-8 text-[10px] text-text-3 font-mono leading-relaxed">
                <p>Scoring rubric (max 100): Valuation 20 · Growth 20 · Moat 20 · Execution Risk 10 · Economy 30. Score ≥75 = potential buy.</p>
                <p className="mt-1">Allocation signals are algorithmic defaults. Override per your conviction. Not financial advice.</p>
              </div>
            </main>
          </div>
        </div>

        {/* <768: Add Ticker moves to a 52px sticky action bar above the tab
            bar, visible only on the score-card destination (decision 20). */}
        {topTab === "main" && (
          <div
            className="md:hidden fixed inset-x-0 z-30 h-[52px] border-t border-border bg-surface-2 flex items-center px-4"
            style={{
              bottom: "var(--tabbar-total)",
              paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
              paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
            }}
          >
            <button
              onClick={addStock}
              disabled={dataLoading || !!dataError}
              className="w-full h-10 rounded bg-accent text-bg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ticker
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
