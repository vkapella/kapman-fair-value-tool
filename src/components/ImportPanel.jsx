import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ListPlus } from "lucide-react";
import { apiRequest } from "../lib/api.js";

function parseTickers(value) {
  return [...new Set(
    value
      .split(/[\s,]+/)
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean)
  )];
}

function formatNumber(value, digits = 2) {
  return value == null ? "—" : Number(value).toFixed(digits);
}

function Section({ title, subtitle, count, children }) {
  return (
    <div className="border-t border-border first:border-t-0">
      <div className="px-4 py-2.5 flex items-baseline gap-2 bg-surface-2">
        <h3 className="text-xs uppercase tracking-wider font-medium text-text">{title}</h3>
        <span className="text-[10px] font-mono text-text-3">({count})</span>
        {subtitle && <span className="text-[10px] text-text-3 font-mono ml-auto">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export default function ImportPanel({ onImported }) {
  const [tickerText, setTickerText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [addChecked, setAddChecked] = useState({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const tickers = useMemo(() => parseTickers(tickerText), [tickerText]);
  const selected = useMemo(
    () => preview?.adds.filter((add) => addChecked[add.ticker]).map((add) => add.ticker) || [],
    [preview, addChecked]
  );

  async function handlePreview() {
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setApplyError(null);
    setApplyResult(null);
    try {
      const data = await apiRequest("/api/import/tickers", {
        method: "POST",
        body: JSON.stringify({ tickers }),
      });
      setPreview(data);
      setAddChecked(Object.fromEntries(data.adds.map((add) => [add.ticker, add.preChecked])));
    } catch (err) {
      setError(err.message || "provider lookup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (selected.length === 0) return;
    setApplying(true);
    setApplyError(null);
    setApplyResult(null);
    try {
      const result = await apiRequest("/api/import/apply", {
        method: "POST",
        body: JSON.stringify({ addTickers: selected }),
      });
      setApplyResult(result);
      await onImported?.(result);
      setPreview((current) => current && ({
        ...current,
        adds: current.adds.filter((add) => !selected.includes(add.ticker)),
        skips: [
          ...current.skips,
          ...selected.map((ticker) => ({ ticker, reason: "added to watchlist" })),
        ],
      }));
      setAddChecked({});
    } catch (err) {
      setApplyError(err.message || "apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-surface">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-display text-lg font-bold">Ticker Import</h2>
        <p className="text-[11px] text-text-3 font-mono">
          Paste symbols to preview provider-backed additions. Existing tickers are skipped; new rows start unpinned.
        </p>
      </div>

      <div className="p-4">
        <label className="block text-[10px] uppercase tracking-wider text-text-3 mb-1.5">
          Tickers — comma, space, or newline separated
        </label>
        <textarea
          value={tickerText}
          onChange={(event) => setTickerText(event.target.value)}
          rows={4}
          placeholder={"AAPL, GOOG, JPM\nAVGO"}
          className="w-full resize-y rounded border border-border-strong bg-surface-3 px-3 py-2 text-sm font-mono text-text placeholder:text-text-3 focus:outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={tickers.length === 0 || loading}
            className="px-4 py-2 rounded bg-accent hover:brightness-105 disabled:bg-surface-3 disabled:text-text-3 disabled:cursor-not-allowed text-bg text-xs font-medium transition flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
            Preview {tickers.length || ""} ticker{tickers.length === 1 ? "" : "s"}
          </button>
          <span className="text-[10px] text-text-3 font-mono">
            Price, GAAP/adjusted EPS, and scoring factors come from Finnhub/Yahoo.
          </span>
        </div>

        {error && (
          <div className="mt-4 rounded border border-neg-border bg-neg-dim px-3 py-2 text-xs text-neg flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        )}
      </div>

      {preview && (
        <div>
          <div className="px-4 py-2 text-[10px] font-mono text-text-3 border-t border-border">
            {preview.meta.requested} requested · {preview.meta.addable} addable · source: {preview.source}
          </div>

          {preview.adds.length > 0 && (
            <Section title="Provider-backed additions" count={preview.adds.length} subtitle="all selected by default">
              <div className="px-4 py-2 flex items-center gap-2 border-b border-border-subtle">
                {[
                  { label: "all", checked: true },
                  { label: "none", checked: false },
                ].map(({ label, checked }) => (
                  <button
                    key={label}
                    onClick={() => setAddChecked(Object.fromEntries(preview.adds.map((add) => [add.ticker, checked])))}
                    className="px-2 py-1 rounded border border-border hover:border-accent-border hover:text-accent text-[10px] font-mono text-text-2 transition"
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-text-3 font-mono">
                  {selected.length} of {preview.adds.length} selected
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border-subtle">
                {preview.adds.map((add) => (
                  <label key={add.ticker} className="px-4 py-2.5 flex items-start gap-3 hover:bg-surface-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 accent-accent"
                      checked={Boolean(addChecked[add.ticker])}
                      onChange={(event) => setAddChecked((current) => ({ ...current, [add.ticker]: event.target.checked }))}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
                        <span className="text-text font-semibold">
                          {add.ticker}
                          {add.longName && <span className="block truncate text-[10px] font-normal text-text-3">{add.longName}</span>}
                        </span>
                        <span className="text-text-3">price ${formatNumber(add.currentPrice)}</span>
                        <span className="text-text-3">Val EPS {formatNumber(add.valuationTtmEps)}</span>
                        <span className="text-text-3">growth {formatNumber(add.growth, 0)}%</span>
                        <span className="text-text-3">%IV {formatNumber(add.pctIV, 1)}</span>
                      </div>
                      <div className="mt-1 text-[10px] font-mono text-warn">{add.notes.join(" · ")}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {preview.skips.length > 0 && (
            <Section title="Skipped" count={preview.skips.length}>
              <div className="max-h-40 overflow-y-auto divide-y divide-border-subtle">
                {preview.skips.map((skip) => (
                  <div key={skip.ticker} className="px-4 py-1.5 text-xs font-mono flex items-center gap-2">
                    <span className="text-text-2">{skip.ticker}</span>
                    <span className="text-text-3">{skip.reason}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {preview.adds.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-text-3 font-mono">No new provider-backed tickers to add.</div>
          )}

          <div className="border-t border-border px-4 py-3 flex items-center gap-3 bg-surface-2">
            <button
              onClick={handleApply}
              disabled={selected.length === 0 || applying}
              className="px-4 py-2 rounded bg-accent hover:brightness-105 disabled:bg-surface-3 disabled:text-text-3 disabled:cursor-not-allowed text-bg text-xs font-medium transition flex items-center gap-2"
            >
              {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add {selected.length} ticker{selected.length === 1 ? "" : "s"}
            </button>
            <span className="text-[10px] text-text-3 font-mono">a snapshot is taken first</span>
            {applyError && (
              <span className="text-xs text-neg font-mono flex items-center gap-1.5 ml-auto">
                <AlertTriangle className="w-3.5 h-3.5" /> {applyError}
              </span>
            )}
          </div>

          {applyResult && (
            <div className="px-4 py-3 border-t border-border bg-pos-dim">
              <div className="flex items-center gap-2 text-xs text-pos font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                snapshot #{applyResult.snapshotRunId} taken · {applyResult.added} added unpinned
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
