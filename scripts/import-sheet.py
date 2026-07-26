#!/usr/bin/env python3
"""Sync the app to Brandon's IWB stock sheet (Main Score Card tab).

The sheet is the source of truth for curated inputs the providers cannot
reproduce: TTM EPS (his basis differs from GAAP-derived — QQQ/VOO have no
provider EPS at all, BRK.B is on operating earnings), forward growth %, the
five category scores, and the row's updated date. Imported EPS is pinned
(epsPinned) so a later price refresh never overwrites it.

Usage:
  python3 scripts/import-sheet.py "data/sheets/260726 IWB STOCK SHEET 4.0.xlsx" [--apply]
      [--base-url URL] [--no-add] [--add-min-score N]

Dry-run (default) prints the full diff and writes nothing. --apply performs it.
Stdlib only — no dependencies.
"""
import argparse
import datetime
import json
import sys
import urllib.request
import zipfile
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

UPDATE_FIELDS = ["ttmEPS", "growth", "valuation", "growthScore", "moat", "executionRisk", "economy", "updated"]
# Cash/bond funds carry a score but no EPS; the schema requires ttmEPS, so
# they cannot be imported until a nullable-EPS path exists.
TICKER_ALIASES = {"BRK/B": "BRK.B", "BRK-B": "BRK.B"}


def parse_sheet(path):
    z = zipfile.ZipFile(path)
    shared = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in si.iter(M + "t")) for si in shared]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    target = None
    for s in wb.iter(M + "sheet"):
        if s.get("name") == "Main Score Card":
            target = relmap[s.get(R + "id")]
    if target is None:
        sys.exit("error: workbook has no 'Main Score Card' tab")
    if not target.startswith("xl/"):
        target = "xl/" + target
    ws = ET.fromstring(z.read(target))

    rows = {}
    for c in ws.iter(M + "c"):
        v = c.find(M + "v")
        if v is None:
            continue
        ref = c.get("r")
        i = 0
        while ref[i].isalpha():
            i += 1
        colname, rownum = ref[:i], int(ref[i:])
        if rownum < 11:
            continue
        val = strings[int(v.text)] if c.get("t") == "s" else v.text
        rows.setdefault(rownum, {})[colname] = val

    def num(d, c):
        try:
            return float(d.get(c))
        except (TypeError, ValueError):
            return None

    stocks = {}
    for rownum in sorted(rows):
        d = rows[rownum]
        raw = d.get("A")
        if not isinstance(raw, str) or not raw.strip():
            continue
        ticker = raw.strip().upper()
        ticker = TICKER_ALIASES.get(ticker, ticker)
        if ticker.startswith(("KEY", "STOCK", "*")):
            continue
        eps, score = num(d, "P"), num(d, "H")
        if eps is None and score is None:
            continue  # section header / key rows
        serial = num(d, "N")
        date = (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))) if serial else None
        if ticker in stocks:
            sys.exit(f"error: duplicate ticker {ticker} in sheet — refusing to import")
        stocks[ticker] = {
            "ttmEPS": eps,
            "growth": num(d, "R"),
            "valuation": num(d, "C"),
            "growthScore": num(d, "D"),
            "moat": num(d, "E"),
            "executionRisk": num(d, "F"),
            "economy": num(d, "G"),
            "score": score,
            "price": num(d, "W"),
            "updated": f"{date.month}/{date.day}/{date.year % 100}" if date else None,
            "date": date.isoformat() if date else None,
        }
    return stocks


def api(base, path, method="GET", body=None):
    req = urllib.request.Request(base + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data) as res:
        return json.loads(res.read() or "null")


def calc_pct_iv(stock, price, g):
    iv = stock["ttmEPS"] * (g["peNoGrowth"] + g["g"] * stock["growth"]) * (g["avgYieldAAA"] / g["bondYield"])
    return (price / iv * 100) if iv > 0 else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("xlsx")
    ap.add_argument("--base-url", default="https://kapman-fair-value-tool.fly.dev")
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    ap.add_argument("--no-add", action="store_true", help="only update existing tickers, add nothing")
    ap.add_argument("--add-min-score", type=int, default=75, help="add sheet-only tickers scoring >= this")
    args = ap.parse_args()

    sheet = parse_sheet(args.xlsx)
    data = api(args.base_url, "/api/data")
    app_stocks = {s["ticker"]: s for s in data["stocks"]}
    g = data["globals"]
    if app_stocks and "epsPinned" not in next(iter(app_stocks.values())):
        sys.exit("error: target server does not support epsPinned yet — deploy the current server before importing")
    print(f"sheet: {len(sheet)} tickers | app ({args.base_url}): {len(app_stocks)} tickers | mode: {'APPLY' if args.apply else 'DRY-RUN'}\n")

    # --- updates ---------------------------------------------------------
    updates, untouched = [], []
    for ticker, app in app_stocks.items():
        row = sheet.get(ticker)
        if row is None:
            untouched.append(ticker)
            continue
        patch, changes = {}, []
        for field in UPDATE_FIELDS:
            new = row[field]
            if new is None:
                continue
            old = app.get(field)
            if isinstance(new, float) and isinstance(old, (int, float)):
                if abs(new - old) > 1e-9:
                    patch[field] = new
                    changes.append(f"{field} {old:g}->{new:g}")
            elif new != old:
                patch[field] = new
                changes.append(f"{field} {old}->{new}")
        # Pin only when the sheet actually supplies an EPS (score-only rows
        # like SGOV must not freeze an uncurated provider value). When EPS is
        # in the patch, epsPinned rides along — the server's pin guard rejects
        # bare ttmEPS writes to pinned rows.
        if row["ttmEPS"] is not None and ("ttmEPS" in patch or not app.get("epsPinned")):
            patch["epsPinned"] = True
            if not app.get("epsPinned"):
                changes.append("epsPinned ->true")
        if patch:
            updates.append((ticker, patch, changes, row, app))

    print(f"=== updates ({len(updates)} of {len(app_stocks)} tracked) ===")
    for ticker, patch, changes, row, app in updates:
        price = app["currentPrice"]
        before = calc_pct_iv(app, price, g)
        after_inputs = {"ttmEPS": patch.get("ttmEPS", app["ttmEPS"]), "growth": patch.get("growth", app["growth"])}
        after = calc_pct_iv(after_inputs, price, g)
        print(f"  {ticker:6} %IV {before:6.1f} -> {after:6.1f}   {'; '.join(changes)}")
    if untouched:
        print(f"\napp tickers not in sheet (left alone): {', '.join(sorted(untouched))}")

    # --- adds ------------------------------------------------------------
    adds, skipped = [], []
    if not args.no_add:
        for ticker, row in sheet.items():
            if ticker in app_stocks or (row["score"] or 0) < args.add_min_score:
                continue
            required = ("ttmEPS", "growth", "price", "updated", "valuation", "growthScore", "moat", "executionRisk", "economy")
            missing = [f for f in required if row[f] is None]
            if missing:
                skipped.append(f"{ticker} (score {row['score']:g}, missing {', '.join(missing)})")
                continue
            adds.append((ticker, {
                "ticker": ticker,
                "ttmEPS": row["ttmEPS"],
                "growth": row["growth"],
                "currentPrice": row["price"],
                "updated": row["updated"],
                "valuation": row["valuation"],
                "growthScore": row["growthScore"],
                "moat": row["moat"],
                "executionRisk": row["executionRisk"],
                "economy": row["economy"],
                "epsPinned": True,
            }))
        print(f"\n=== adds (sheet-only, score >= {args.add_min_score}) ===")
        for ticker, body in adds:
            row = sheet[ticker]
            pct = calc_pct_iv(body, body["currentPrice"], g)
            print(f"  {ticker:6} score {row['score']:g}  EPS {body['ttmEPS']:g}  growth {body['growth']:g}%  %IV {pct:.1f}  updated {body['updated']}")
        for s in skipped:
            print(f"  skipped: {s}")

    if not args.apply:
        print("\ndry-run complete — nothing written. Re-run with --apply to import.")
        return

    # --- apply -----------------------------------------------------------
    print("\napplying…")
    errors = []
    for ticker, patch, changes, row, app in updates:
        try:
            api(args.base_url, f"/api/stocks/{ticker}", "PUT", patch)
            print(f"  PUT  {ticker}: ok")
        except Exception as e:
            errors.append(f"{ticker}: {e}")
            print(f"  PUT  {ticker}: FAILED {e}")
    for ticker, body in adds:
        try:
            api(args.base_url, "/api/stocks", "POST", body)
            print(f"  POST {ticker}: ok")
        except Exception as e:
            errors.append(f"{ticker}: {e}")
            print(f"  POST {ticker}: FAILED {e}")

    after = api(args.base_url, "/api/data")
    print(f"\napp now tracks {len(after['stocks'])} tickers")
    if errors:
        sys.exit(f"{len(errors)} failure(s): {errors}")


if __name__ == "__main__":
    main()
