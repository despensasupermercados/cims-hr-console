// The SharePoint INBOX — the automatic route that needs no IT ticket and no Rita (Miguel, 15 Oct 2026: "I dont want rita
// to be dropping items .. I want you to either pick the file and read what u need .. or we need to find a solution").
//
// The Graph identity (src/sharepoint_sync.js) is the clean end state, but it waits on an app registration DG3 IT must
// create. Until then a scheduled Claude session, every morning, reads the SharePoint folders through Miguel's own
// Microsoft 365 connector. That connector cannot hand over the workbook's bytes — it returns the workbook as TEXT (one
// "## Sheet:" block per worksheet, tab-separated cells) under a read budget that CUTS a big workbook short. So the session
// does the one thing it can do safely: it turns that text into the 2-D sheet arrays the Upload page sends, REFUSES any
// sheet the budget cut, and writes the sheets into `sp_inbox` in D1. The Worker's hourly cron (applyInbox) then loads
// them through the SAME two apply paths as drag-and-drop and the Graph sync — sgaStage/applySgaWorkbook,
// applyTravelYear — and records the load on sp_sync (source "agent"). The session never parses TDG's bill and never
// writes a travel or SGA row; the Worker does, from tested code (CLAUDE.md §3).
//
// Measured on the real reads of 15 Oct 2026: TDG's SGA workbook (230 sheets) delivers SUMMARY MANNING and the TRAINREL
// summary whole (they sit early in the book; the budget ran out at sheet 6), the TRAINING line items never. Rita's travel
// workbook delivers JAN–SEPT whole and is cut inside OCT (the SUMMARY sheet alone is ~3,800 lines) — so from October a
// year's workbook cannot come through this route, and this module says so instead of loading nine months as the year.
//
// Pure: no I/O. Pinned by test/sp_inbox.test.js.

// "## Sheet: SUMMARY MANNING — 107 rows × 37 columns (A1:AK107)"   name may carry " [hidden]" and trailing spaces
import { isManningSheet, isSummarySheet } from "./sga.js";
import { monthNum } from "./travel.js";

const SHEET_RE = /^## Sheet: (.+?)\s*(\[hidden\])?\s*—\s*(\d+) rows? × (\d+) columns? \(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/;
const EMPTY_RE = /^\[(\d+) empty rows?\]/;
const TRUNC_RE = /^\[Output truncated/;
const WB_RE = /^Workbook: (\d+) worksheets?/;

// The connector's text dump → { sheets: { name: rows2D }, declared, seen, complete: [names], cut: name|null, truncated,
// missing: n }. A sheet is COMPLETE only when the dump moved past it (its "Formulas:" block or the next "## Sheet:"
// header started) before any truncation notice; the sheet the notice landed in is `cut` and NOT in `sheets`; sheets after
// it are `missing`. Cells stay strings exactly as the dump prints them ("1,428.52 ") — the parsers' num() reads those,
// and this is the shape the 15 Oct loads were verified on.
export function dumpToSheets(text) {
  const out = { sheets: {}, declared: null, seen: [], complete: [], cut: null, truncated: false, missing: 0 };
  let cur = null, rows = null, inFormulas = false;
  const close = (completeNow) => { if (cur && rows) { if (completeNow) { out.sheets[cur] = rows; out.complete.push(cur); } else out.cut = cur; } cur = null; rows = null; inFormulas = false; };
  for (const raw of String(text || "").split("\n")) {
    const ln = raw.replace(/\r$/, "");
    const w = WB_RE.exec(ln); if (w && out.declared == null) { out.declared = +w[1]; continue; }
    const m = SHEET_RE.exec(ln);
    if (m) { close(true); cur = m[1].trim(); rows = []; out.seen.push(cur); continue; }
    if (TRUNC_RE.test(ln)) { out.truncated = true; close(inFormulas); break; }
    if (!cur) continue;
    if (inFormulas) continue;                                  // formula sources are not values
    if (/^Formulas:\s*$/.test(ln)) { inFormulas = true; continue; }
    const e = EMPTY_RE.exec(ln); if (e) { for (let i = 0; i < +e[1]; i++) rows.push([]); continue; }
    rows.push(ln.split("\t"));
  }
  if (!out.truncated) close(true);
  if (out.declared != null) out.missing = Math.max(0, out.declared - out.complete.length - (out.cut ? 1 : 0));
  return out;
}

// What the bill needs from its dump: SUMMARY MANNING whole; the TRAINREL summary when the dump has it whole. The TRAINING
// line items (far down the book) are never expected — the view reads the summary. Returns { ok, reason?, sheets }.
// With the manning sheet cut (the connector's budget ran out — January, April, May 2026 did, three reads each) the dump
// still carries the MONTHLY SUMMARY sheet ("2026 SUMMARY (2)", third in the book): the file loads as SUMMARY ONLY — the
// month's totals and the year-over-year, no per-crew lines — `summaryOnly: true`. Nothing → refused.
export function sgaFromDump(parsed) {
  const names = parsed.complete;
  const manning = names.find((n) => isManningSheet(n));
  const summary = names.find((n) => isSummarySheet(n));
  const tr = names.find((n) => /trainrel/i.test(n));
  if (!manning && !summary) return { ok: false, reason: parsed.cut && isManningSheet(parsed.cut) ? "manning_cut" : "no_manning", detail: parsed.cut ? "the reader stopped inside " + parsed.cut : "no SUMMARY MANNING sheet in the dump", sheets: {} };
  const sheets = {};
  if (manning) sheets[manning] = parsed.sheets[manning];
  if (summary) sheets[summary] = parsed.sheets[summary];
  if (tr) sheets[tr] = parsed.sheets[tr];
  return { ok: true, sheets, manning: manning || null, summary: summary || null, summaryOnly: !manning, training: tr || null,
    manningCut: !manning && parsed.cut && isManningSheet(parsed.cut) ? parsed.cut : null,
    trainingCut: !tr && parsed.cut && /trainrel/i.test(parsed.cut) ? parsed.cut : null };
}

// Rita's workbook: a travel year is REPLACED whole by applyTravelYear, so the dump must carry every month sheet the book
// has, and the CIMS sheet when the book has one. Anything cut or missing → nothing from this file (never nine months as
// the year). `month` of the cut sheet is reported so the run can say "cut inside OCT".
export function travelFromDump(parsed) {
  const isMonth = (n) => !!monthNum(n);   // every spelling travel.js reads (27 Oct 2026: a "SEP" sheet was "missing")
  const isCims = (n) => String(n).trim().toUpperCase() === "CIMS";
  const want = (n) => isMonth(n) || isCims(n);
  if (parsed.cut && want(parsed.cut)) return { ok: false, reason: "sheet_cut", detail: "the reader stopped inside " + parsed.cut.trim(), sheets: {} };
  if (parsed.missing > 0) return { ok: false, reason: "sheets_missing", detail: parsed.missing + " of " + parsed.declared + " sheets never reached the reader" + (parsed.cut ? " (stopped inside " + parsed.cut.trim() + ")" : ""), sheets: {} };
  const sheets = {};
  for (const n of parsed.complete) if (want(n)) sheets[n] = parsed.sheets[n];
  const months = Object.keys(sheets).filter(isMonth).length;
  if (!months) return { ok: false, reason: "no_month_sheets", detail: "no JAN…DEC sheet in the dump", sheets: {} };
  return { ok: true, sheets, months, cims: Object.keys(sheets).some(isCims) };
}

// Cells → the inbox rows. A D1 statement is capped at 100 KB, so a sheet's rows are split into parts of at most `max`
// characters of JSON (the Worker joins the parts back in order). Each row: { sheet, part, parts, file_parts, rows_json } —
// `file_parts` is the file's whole count, so the Worker can tell a file still being written from a complete one even
// when a whole sheet is missing (the session stopped between two sheets).
export function inboxParts(sheets, max = 60000) {
  const out = [];
  for (const [sheet, rows] of Object.entries(sheets)) {
    const chunks = [[]]; let size = 2;
    for (const r of rows) {
      const s = JSON.stringify(r).length + 1;
      if (size + s > max && chunks[chunks.length - 1].length) { chunks.push([]); size = 2; }
      chunks[chunks.length - 1].push(r); size += s;
    }
    chunks.forEach((c, i) => out.push({ sheet, part: i + 1, parts: chunks.length, rows_json: JSON.stringify(c) }));
  }
  for (const p of out) p.file_parts = out.length;
  return out;
}

// The inbox rows of ONE file back into { sheet: rows2D } — null while a part is still missing (the session is still
// writing, or a part failed): the Worker then leaves the file pending for the next hour.
export function assembleInbox(rows) {
  if (!rows.length) return null;
  const want = rows[0].file_parts;
  if (want && new Set(rows.map((r) => r.sheet + "#" + r.part)).size < want) return null;
  const by = {};
  for (const r of rows) { (by[r.sheet] = by[r.sheet] || { parts: r.parts, got: new Map() }).got.set(r.part, r.rows_json); }
  const sheets = {};
  for (const [sheet, s] of Object.entries(by)) {
    const parts = [];
    for (let i = 1; i <= s.parts; i++) { if (!s.got.has(i)) return null; parts.push(...JSON.parse(s.got.get(i))); }
    sheets[sheet] = parts;
  }
  return sheets;
}

// One key per file version: the SharePoint item id + its modified time (the connector gives no eTag). A changed file is a
// new key and loads again; the same file is skipped by the session (sp_sync / sp_inbox already carry the key).
export function inboxFileKey(itemId, modified) {
  return String(itemId || "").trim() + "@" + String(modified || "").trim();
}

// The month folder's name → its number ("09 September" / "09 September 2026" / "07 July 2026"); null for "00 For approval".
export function monthOfFolder(name) {
  const m = /^(0[1-9]|1[0-2])\b/.exec(String(name || "").trim());
  return m ? +m[1] : null;
}

// Which workbook in a month folder (the connector's listing: { name, id, lastModifiedDateTime }) is the month's bill:
// REVISED beats plain, the newest modified wins among equals, never a PDF — the same rule as the Graph sync.
export function pickSgaItem(items) {
  const xl = (items || []).filter((c) => /sga excel/i.test(c.name) && /\.xlsx?$/i.test(c.name));
  if (!xl.length) return null;
  const newest = (a, b) => String(b.lastModifiedDateTime || "").localeCompare(String(a.lastModifiedDateTime || ""));
  const rev = xl.filter((c) => /revised/i.test(c.name)).sort(newest);
  return rev[0] || xl.sort(newest)[0];
}
export function pickTravelItem(items, year) {
  const xl = (items || []).filter((c) => /travel expenses/i.test(c.name) && String(c.name).includes(String(year)) && /\.xlsx?$/i.test(c.name));
  if (!xl.length) return null;
  const newest = (a, b) => String(b.lastModifiedDateTime || "").localeCompare(String(a.lastModifiedDateTime || ""));
  const upd = xl.filter((c) => /updated/i.test(c.name));
  return (upd.length ? upd : xl).sort(newest)[0];
}
