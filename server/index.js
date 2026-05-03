import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const POLYGON_KEY = process.env.POLYGON_API_KEY;

app.use(express.json());

// API: bulk fetch previous-close prices
app.post("/api/prices", async (req, res) => {
  if (!POLYGON_KEY) {
    return res.status(500).json({ error: "POLYGON_API_KEY env var not set on server" });
  }
  const { tickers } = req.body || {};
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "tickers must be a non-empty array" });
  }

  const result = {};
  await Promise.all(
    tickers.map(async (raw) => {
      const t = String(raw).trim().toUpperCase();
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(t)}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
        const r = await fetch(url);
        if (!r.ok) return;
        const d = await r.json();
        if (d.results && d.results[0] && typeof d.results[0].c === "number") {
          result[t] = d.results[0].c;
        }
      } catch (_) { /* skip */ }
    })
  );

  res.json(result);
});

// Serve built frontend
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));

// SPA fallback (anything not /api/* falls through to index.html)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Fair Value Evaluator running on :${PORT}`);
  console.log(`Polygon API key: ${POLYGON_KEY ? "configured ✓" : "NOT SET — refresh will fail"}`);
});
