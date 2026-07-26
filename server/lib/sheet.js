// Parses Brandon's "IWB STOCK SHEET 4.0" workbook (Main Score Card tab) from
// an uploaded .xlsx buffer. This is a direct Node port of the row-selection
// and field-extraction rules in scripts/import-sheet.py's parse_sheet() —
// keep the two in sync if the sheet layout ever changes.
//
// No xlsx-parsing dependency: an .xlsx is a zip of small XML parts, and the
// only things we need out of it are cached cell values (shared strings +
// numeric <v> text). A hand-rolled zip reader (zlib's raw inflate) plus a
// few targeted regexes over the worksheet/sharedStrings/workbook XML gets
// us there in well under what a general-purpose xlsx library would pull in,
// and mirrors what the Python stdlib-only version already does with
// zipfile + ElementTree.
import { inflateRawSync } from "node:zlib";

const SHEET_NAME = "Main Score Card";
const FIRST_DATA_ROW = 11;
const TICKER_ALIASES = { "BRK/B": "BRK.B", "BRK-B": "BRK.B" };
const SKIP_PREFIXES = ["KEY", "STOCK", "*"];

// Column -> field mapping, per the sheet layout (see scripts/import-sheet.py).
const COLUMNS = {
  ticker: "A",
  valuation: "C",
  growthScore: "D",
  moat: "E",
  executionRisk: "F",
  economy: "G",
  score: "H",
  date: "N",
  ttmEPS: "P",
  growth: "R",
  price: "W",
};

export function parseSheet(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const zip = openZip(buf);

  for (const required of ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"]) {
    if (!zip.has(required)) {
      throw new Error(`Not a valid .xlsx workbook — missing ${required}`);
    }
  }

  const workbookXml = zip.read("xl/workbook.xml").toString("utf8");
  const relsXml = zip.read("xl/_rels/workbook.xml.rels").toString("utf8");
  const sharedStringsXml = zip.read("xl/sharedStrings.xml").toString("utf8");

  const relId = findSheetRelId(workbookXml, SHEET_NAME);
  if (!relId) {
    throw new Error(`Workbook has no "${SHEET_NAME}" tab`);
  }

  const relMap = parseRelationships(relsXml);
  let target = relMap.get(relId);
  if (!target) {
    throw new Error(`Workbook relationship "${relId}" for the "${SHEET_NAME}" tab has no target`);
  }
  target = target.replace(/^\.?\/?/, "");
  if (!target.startsWith("xl/")) target = `xl/${target}`;

  if (!zip.has(target)) {
    throw new Error(`Worksheet part "${target}" referenced by the "${SHEET_NAME}" tab is missing from the workbook`);
  }

  const strings = parseSharedStrings(sharedStringsXml);
  const worksheetXml = zip.read(target).toString("utf8");
  const rows = parseWorksheetRows(worksheetXml, strings);

  const tickers = {};
  const rowNums = [...rows.keys()].sort((a, b) => a - b);
  for (const rowNum of rowNums) {
    const row = rows.get(rowNum);
    const rawTicker = row[COLUMNS.ticker];
    if (rawTicker == null || String(rawTicker).trim() === "") continue;

    let ticker = String(rawTicker).trim().toUpperCase();
    ticker = TICKER_ALIASES[ticker] || ticker;
    if (SKIP_PREFIXES.some((prefix) => ticker.startsWith(prefix))) continue;

    const eps = toNumber(row[COLUMNS.ttmEPS]);
    const score = toNumber(row[COLUMNS.score]);
    if (eps == null && score == null) continue; // section header / key row

    if (Object.prototype.hasOwnProperty.call(tickers, ticker)) {
      throw new Error(
        `Duplicate ticker "${ticker}" in sheet (rows ${tickers[ticker].row} and ${rowNum}) — refusing to import`
      );
    }

    const serial = toNumber(row[COLUMNS.date]);
    tickers[ticker] = {
      ticker,
      ttmEPS: eps,
      growth: toNumber(row[COLUMNS.growth]),
      valuation: toNumber(row[COLUMNS.valuation]),
      growthScore: toNumber(row[COLUMNS.growthScore]),
      moat: toNumber(row[COLUMNS.moat]),
      executionRisk: toNumber(row[COLUMNS.executionRisk]),
      economy: toNumber(row[COLUMNS.economy]),
      score,
      price: toNumber(row[COLUMNS.price]),
      updated: serial ? excelSerialToMDY(serial) : null, // mirrors Python's `if serial` truthiness (0/None -> null)
      row: rowNum,
    };
  }

  return {
    tickers,
    meta: { count: Object.keys(tickers).length, tabName: SHEET_NAME },
  };
}

// -- field helpers ----------------------------------------------------------

function toNumber(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function excelSerialToMDY(serial) {
  const epochUTC = Date.UTC(1899, 11, 30); // Excel's day-0 epoch
  const ms = epochUTC + Math.trunc(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear() % 100}`;
}

// -- worksheet XML ------------------------------------------------------------

function parseWorksheetRows(xml, strings) {
  const rows = new Map(); // rowNum -> { colLetters: value }
  const cellRegex = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = cellRegex.exec(xml))) {
    const attrs = m[1] !== undefined ? m[1] : m[2];
    const inner = m[3]; // undefined for self-closing (empty) cells
    if (inner === undefined) continue;

    const ref = getAttr(attrs, "r");
    if (!ref) continue;
    const refMatch = ref.match(/^([A-Za-z]+)(\d+)$/);
    if (!refMatch) continue;
    const colName = refMatch[1].toUpperCase();
    const rowNum = parseInt(refMatch[2], 10);
    if (rowNum < FIRST_DATA_ROW) continue;

    const cellType = getAttr(attrs, "t");
    let value = null;
    if (cellType === "inlineStr") {
      const isMatch = inner.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
      value = isMatch ? extractText(isMatch[1]) : null;
    } else {
      const vMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      if (!vMatch) continue; // bare formula with no cached value, or truly empty cell
      const raw = decodeXmlEntities(vMatch[1]);
      if (cellType === "s") {
        const idx = parseInt(raw, 10);
        value = Number.isInteger(idx) ? strings[idx] ?? null : null;
      } else {
        value = raw; // numeric, "str" (formula string result), boolean, etc. — kept as text, parsed later by toNumber
      }
    }
    if (value == null) continue;

    if (!rows.has(rowNum)) rows.set(rowNum, {});
    rows.get(rowNum)[colName] = value;
  }
  return rows;
}

function getAttr(attrsStr, name) {
  const re = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`);
  const m = attrsStr.match(re);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

// -- sharedStrings.xml --------------------------------------------------------

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    strings.push(extractText(m[1] || ""));
  }
  return strings;
}

function extractText(inner) {
  let text = "";
  const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = tRegex.exec(inner))) {
    text += decodeXmlEntities(m[1] || "");
  }
  return text;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&"); // last, so escaped "&amp;lt;" round-trips as "&lt;" not "<"
}

// -- workbook.xml / rels -------------------------------------------------------

function findSheetRelId(xml, sheetName) {
  const sheetRegex = /<sheet\b([^>]*?)\/>|<sheet\b([^>]*?)>[\s\S]*?<\/sheet>/g;
  let m;
  while ((m = sheetRegex.exec(xml))) {
    const attrs = m[1] !== undefined ? m[1] : m[2];
    const name = getAttr(attrs, "name");
    if (name != null && decodeXmlEntities(name) === sheetName) {
      return getAttr(attrs, "r:id");
    }
  }
  return null;
}

function parseRelationships(xml) {
  const map = new Map();
  const relRegex = /<Relationship\b([^>]*?)\/>|<Relationship\b([^>]*?)>[\s\S]*?<\/Relationship>/g;
  let m;
  while ((m = relRegex.exec(xml))) {
    const attrs = m[1] !== undefined ? m[1] : m[2];
    const id = getAttr(attrs, "Id");
    const targetAttr = getAttr(attrs, "Target");
    if (id && targetAttr) map.set(id, targetAttr);
  }
  return map;
}

// -- minimal zip reader --------------------------------------------------------
// Just enough of the ZIP spec to read a handful of named, deflate-or-stored
// entries out of an .xlsx: locate the end-of-central-directory record, walk
// the central directory for name/offset/size, then inflate each entry's
// bytes from its local file header on demand. No zip64 support — no real
// IWB workbook approaches the 4GB/65535-entry thresholds that would need it.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

function openZip(buf) {
  if (buf.length < 22) {
    throw new Error("File is too small to be a valid .xlsx (zip) archive");
  }
  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset < 0) {
    throw new Error("Could not find a zip end-of-central-directory record — this is not a valid .xlsx file");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  if (cdOffset === 0xffffffff || totalEntries === 0xffff) {
    throw new Error("This workbook uses zip64 (very large archive), which is not supported");
  }

  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error("Corrupt or unsupported zip central directory in .xlsx file");
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    has(name) {
      return entries.has(name);
    },
    read(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`Zip entry not found: ${name}`);
      return extractEntry(buf, entry);
    },
  };
}

function findEndOfCentralDirectory(buf) {
  const maxCommentSize = 65535;
  const lowerBound = Math.max(0, buf.length - 22 - maxCommentSize);
  for (let i = buf.length - 22; i >= lowerBound; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function extractEntry(buf, entry) {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error("Corrupt zip local file header in .xlsx file");
  }
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buf.length) {
    throw new Error("Corrupt zip entry: compressed data runs past end of file");
  }
  const compressed = buf.subarray(dataStart, dataEnd);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported zip compression method (${entry.method}) in .xlsx file`);
}
