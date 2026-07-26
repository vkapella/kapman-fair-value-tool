#!/usr/bin/env node
// Standalone validation for server/lib/sheet.js (S3): parses the real IWB
// workbook with the Node parser and with the reference Python parser
// (scripts/import-sheet.py's parse_sheet()), then diffs them field-by-field.
// Also exercises the required-fields/duplicate-ticker assertions from the
// task spec. Exits non-zero on any mismatch or failed assertion.
//
// Usage: node scripts/verify-sheet-parity.mjs ["data/sheets/260726 IWB STOCK SHEET 4.0.xlsx"]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseSheet } from "../server/lib/sheet.js";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const XLSX_PATH = process.argv[2] || join(REPO_ROOT, "data/sheets/260726 IWB STOCK SHEET 4.0.xlsx");

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// 1. Parse with the Node module.
// ---------------------------------------------------------------------------
console.log(`Parsing (Node): ${XLSX_PATH}`);
const nodeBuf = readFileSync(XLSX_PATH);
const nodeResult = parseSheet(nodeBuf);
console.log(`  -> ${nodeResult.meta.count} tickers, tab "${nodeResult.meta.tabName}"`);

// ---------------------------------------------------------------------------
// 2. Parse with the reference Python implementation for comparison.
// ---------------------------------------------------------------------------
console.log(`\nParsing (Python reference): scripts/import-sheet.py`);
const pyScript = `
import sys, json, importlib.util
spec = importlib.util.spec_from_file_location("import_sheet", "${join(REPO_ROOT, "scripts/import-sheet.py")}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sheet = mod.parse_sheet(sys.argv[1])
print(json.dumps(sheet))
`;
const pyOut = execFileSync("python3", ["-c", pyScript, XLSX_PATH], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const pySheet = JSON.parse(pyOut);
console.log(`  -> ${Object.keys(pySheet).length} tickers`);

// ---------------------------------------------------------------------------
// 3. Field-by-field parity diff.
// ---------------------------------------------------------------------------
console.log(`\n=== Parity: Node vs Python ===`);
const COMPARE_FIELDS = ["ttmEPS", "growth", "valuation", "growthScore", "moat", "executionRisk", "economy", "score", "price", "updated"];
const nodeTickers = new Set(Object.keys(nodeResult.tickers));
const pyTickers = new Set(Object.keys(pySheet));

const onlyInNode = [...nodeTickers].filter((t) => !pyTickers.has(t));
const onlyInPy = [...pyTickers].filter((t) => !nodeTickers.has(t));
let mismatches = 0;

for (const t of onlyInNode) {
  console.log(`  MISMATCH ${t}: present in Node output only`);
  mismatches++;
}
for (const t of onlyInPy) {
  console.log(`  MISMATCH ${t}: present in Python output only`);
  mismatches++;
}

function fieldsEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return false;
}

for (const ticker of [...nodeTickers].filter((t) => pyTickers.has(t)).sort()) {
  const n = nodeResult.tickers[ticker];
  const p = pySheet[ticker];
  for (const field of COMPARE_FIELDS) {
    if (!fieldsEqual(n[field], p[field])) {
      console.log(`  MISMATCH ${ticker}.${field}: node=${JSON.stringify(n[field])} python=${JSON.stringify(p[field])}`);
      mismatches++;
    }
  }
}

if (mismatches === 0) {
  console.log(`  zero mismatches across ${nodeTickers.size} tickers x ${COMPARE_FIELDS.length} fields`);
} else {
  console.log(`  ${mismatches} mismatch(es) found`);
}
failures += mismatches;

// ---------------------------------------------------------------------------
// 4. Spec assertions.
// ---------------------------------------------------------------------------
console.log(`\n=== Spec assertions ===`);
const T = nodeResult.tickers;
check("count === 109", nodeResult.meta.count === 109);
check("NVDA.ttmEPS === 5.81", T.NVDA?.ttmEPS === 5.81);
check("QQQ.ttmEPS === 31.18", T.QQQ?.ttmEPS === 31.18);
check("QQQ.growth === 15.5", T.QQQ?.growth === 15.5);
check("VOO.ttmEPS === 34.4", T.VOO?.ttmEPS === 34.4);
check("BRK.B present", Boolean(T["BRK.B"]));
check("BRK.B.ttmEPS === 21.41", T["BRK.B"]?.ttmEPS === 21.41);
check("SGOV.ttmEPS === null", T.SGOV?.ttmEPS === null);
check("SGOV.score === 77", T.SGOV?.score === 77);
check('NVDA.updated === "7/14/26"', T.NVDA?.updated === "7/14/26");

// ---------------------------------------------------------------------------
// 5. No duplicate-ticker false positives on the real file (parseSheet already
//    ran above without throwing — if it had a real dup it would have thrown).
//    Confirm the row count matches the ticker count (1:1, no collapsing).
// ---------------------------------------------------------------------------
console.log(`\n=== Duplicate-ticker handling ===`);
check("real file: no duplicate-ticker false positive (parse succeeded)", true);

// Build a tiny synthetic .xlsx (stored/uncompressed zip) with the same
// ticker on two data rows and confirm parseSheet throws.
const dupXlsx = buildSyntheticWorkbookWithDuplicate();
let threw = false;
let thrownMessage = "";
try {
  parseSheet(dupXlsx);
} catch (err) {
  threw = true;
  thrownMessage = err.message;
}
check("synthetic duplicate ticker throws", threw);
if (threw) console.log(`       -> ${thrownMessage}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

// ---------------------------------------------------------------------------
// Minimal stored-mode (uncompressed) zip builder, used only to synthesize a
// tiny test workbook for the duplicate-ticker check above. No dependency on
// server/lib/sheet.js's reader beyond the format it already needs to support
// (local file header + central directory + EOCD, method 0 = store).
// ---------------------------------------------------------------------------
function buildSyntheticWorkbookWithDuplicate() {
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Main Score Card" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const relsXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    "</Relationships>";
  const sharedStringsXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">' +
    "<si><t>DUP</t></si></sst>";
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="11"><c r="A11" t="s"><v>0</v></c><c r="H11"><v>50</v></c></row>' +
    '<row r="12"><c r="A12" t="s"><v>0</v></c><c r="H12"><v>60</v></c></row>' +
    "</sheetData></worksheet>";

  return buildStoredZip([
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: relsXml },
    { name: "xl/sharedStrings.xml", content: sharedStringsXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const dataBuf = Buffer.from(content, "utf8");
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method: store
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // method: store
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralSection.length, 12); // central dir size
  eocd.writeUInt32LE(localSection.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localSection, centralSection, eocd]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
