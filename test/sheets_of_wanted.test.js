// ONLY THE WANTED SHEETS ARE PARSED (23 Nov 2026). The first real bill that came by email — TDG's "DG3 SGA EXCEL OCTOBER'2026.xlsx",
// 2.4 MB, forwarded to sga@cims.work on 23 Nov 2026 — was killed on 6 of 7 deliveries: Cloudflare counted "Exceeded CPU Time
// Limits" on the Worker, nothing was written (no receipt, no inbox row, no archived original), and it only got in on a retry
// of the sender's mail server. The workbook is not the four-sheet file the fixtures are: it carries 243 worksheets (every
// ship's statement since SGA No. 1 of July 2023, most of them hidden) and the console reads four. sheetsOf read all 243.
// These tests pin: the wanted set on the real sheet names, that no unwanted sheet is parsed, and that the result is the same
// object a whole-workbook read gives — sheet for sheet, cell for cell.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSXNS from "xlsx";
import { sheetsOf, WANT_SGA, WANT_TRAVEL } from "../src/sharepoint_sync.js";
const XLSX = XLSXNS.default || XLSXNS;

// The real workbook's first sheets, in its order (read off SharePoint, 23 Nov 2026), then statement sheets up to 243.
const REAL_HEAD = ["SGA SUMMARY WITH SBP ", "draft", "2026 SUMMARY (2)", "2026 SUMMARY TRAINREL", "SUMMARY MANNING", "Sheet8", "TRAINING", "SUMMARY MANNIING (2)", "SUMMARY 2",
  "SOA ADV1", "SOA ALR1", "SOA ANT1.", "SOA BRS1 ", "SOA ECH (1.)", "SOA ECH (1.) (2)", "SOA EXP (1)", "SOA FRS1", "SOA GRD1 ", "SOA GRD2."];
const REAL_TAIL = ["1. CREW WAGES WITH SBP", "SGA SUMMARY training)", "FEE CSO", "GOVT LIST DG3 CSO", "4. OTHER CREWING COSTS", "4. TRAINING", "draft schedule", "TEMPLATE SUMMARY SGA", "TEMPLATE SUMMARY SGA (2)", "DEBIT -  CREDIT MEMO", "Sheet1"];
const REAL_WANTED = ["2026 SUMMARY (2)", "2026 SUMMARY TRAINREL", "SUMMARY MANNING", "TRAINING"];
function realNames() {
  const names = REAL_HEAD.slice();
  for (let i = 0; names.length < 243 - REAL_TAIL.length; i++) names.push("SOA S" + String(i).padStart(3, "0"));
  return names.concat(REAL_TAIL);
}
// A workbook shaped like TDG's: every sheet has text, numbers, a formula with a cached value, an empty cell inside the range,
// an error cell and a date serial; each sheet's values are its own, so a mixed-up sheet cannot pass.
function tdgShaped(names = realNames(), bookType = "xlsx") {
  const wb = XLSX.utils.book_new();
  names.forEach((n, k) => {
    const aoa = [[n.trim() + " — STATEMENT", "", "REF. NO.", "AMOUNT"], ["CAAG, HAZIEL", "ANTHEM OF THE SEAS", "CEC 26-10-" + k, 1000 + k + 0.37], ["", null, "second line", -138.46], ["GRAND TOTAL", "", "", 0], [46057, "serial", "", k]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws.D4 = { t: "n", v: 861.91 + k, f: "SUM(D2:D3)" };
    ws.B5 = { t: "e", v: 0x17, w: "#REF!" };
    XLSX.utils.book_append_sheet(wb, ws, n);
  });
  const out = XLSX.write(wb, { type: "array", bookType, compression: true });
  return out instanceof ArrayBuffer ? out : new Uint8Array(out).buffer;
}
// the reader as it was before 23 Nov 2026: the whole workbook, then the wanted sheets
function wholeWorkbook(buf, want) {
  const wb = XLSX.read(buf, { type: "array", raw: true });
  const out = {};
  for (const sn of wb.SheetNames) if (want(String(sn))) out[sn] = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
  return out;
}
// SheetJS with its `read` watched: what each call was asked for, and how many sheets it built
function watched() {
  const calls = [];
  const spy = { ...XLSX, utils: XLSX.utils, read(buf, opts) { const wb = XLSX.read(buf, opts); calls.push({ opts: { ...opts }, built: wb.Sheets ? Object.keys(wb.Sheets).length : 0 }); return wb; } };
  return { spy, calls };
}

test("the wanted set on TDG's real sheet names is the four sheets the console reads, and no look-alike", () => {
  const names = realNames();
  assert.equal(names.length, 243);
  assert.deepEqual(names.filter((n) => WANT_SGA(String(n))), REAL_WANTED);
  for (const n of ["SGA SUMMARY WITH SBP ", "SUMMARY MANNIING (2)", "SUMMARY 2", "SGA SUMMARY training)", "4. TRAINING", "TEMPLATE SUMMARY SGA", "DEBIT -  CREDIT MEMO"]) assert.equal(WANT_SGA(n), false, n + " is not read");
});

test("a 243-sheet bill: only the four wanted sheets are ever parsed", () => {
  const buf = tdgShaped();
  const { spy, calls } = watched();
  const s = sheetsOf(spy, buf, WANT_SGA);
  assert.deepEqual(Object.keys(s), REAL_WANTED);
  assert.equal(calls.length, 2, "one read for the names, one for the wanted sheets");
  assert.equal(calls[0].opts.bookSheets, true); assert.equal(calls[0].built, 0, "the names pass builds no sheet");
  assert.deepEqual(calls[1].opts.sheets, [2, 3, 4, 6], "the wanted sheets by position");
  assert.equal(calls[1].built, 4, "239 sheets are never turned into cells");
  assert.ok(calls.every((c) => c.built <= 4), "no call builds the whole workbook");
});

test("the short read gives the same object as the whole workbook, sheet for sheet and cell for cell", () => {
  const buf = tdgShaped();
  const got = sheetsOf(XLSX, buf, WANT_SGA);
  assert.deepEqual(got, wholeWorkbook(buf, WANT_SGA));
  // each sheet is its own: the cached formula value, the reference and the amount carry the sheet's position
  assert.equal(got["SUMMARY MANNING"][0][0], "SUMMARY MANNING — STATEMENT");
  assert.equal(got["SUMMARY MANNING"][3][3], 861.91 + 4); assert.equal(got["TRAINING"][1][2], "CEC 26-10-6"); assert.equal(got["2026 SUMMARY (2)"][1][3], 1002.37);
  assert.equal(got["TRAINING"][2][0], "", "an empty cell inside the range is still an empty string");
  assert.equal(got["TRAINING"][4][0], 46057, "a date stays TDG's serial");
  // any other filter, the travel one and a single sheet, behaves the same way
  for (const want of [WANT_TRAVEL, (n) => n === "SOA GRD2.", (n) => /^SOA /.test(n), () => true]) assert.deepEqual(sheetsOf(XLSX, buf, want), wholeWorkbook(buf, want));
});

test("two sheets whose names differ only by case are not confused", () => {
  const buf = tdgShaped(["Summary Manning", "SUMMARY MANNING", "summary manning", "SOA X"]);
  const only = (n) => n === "SUMMARY MANNING";
  const { spy, calls } = watched();
  const got = sheetsOf(spy, buf, only);
  assert.deepEqual(Object.keys(got), ["SUMMARY MANNING"]);
  assert.equal(calls[1].built, 1, "the sheet is asked for by position, not by a case-blind name");
  assert.equal(got["SUMMARY MANNING"][1][2], "CEC 26-10-1");
  assert.deepEqual(got, wholeWorkbook(buf, only));
});

test("a workbook with no wanted sheet is not parsed at all", () => {
  const buf = tdgShaped(["SOA ADV1", "SOA ALR1", "draft"]);
  const { spy, calls } = watched();
  assert.deepEqual(sheetsOf(spy, buf, WANT_SGA), {});
  assert.equal(calls.length, 1, "the names pass only"); assert.equal(calls[0].built, 0);
});

test("when the short read cannot be trusted the whole workbook is read: slower, never wrong", () => {
  const buf = tdgShaped(realNames().slice(0, 12));
  const want = WANT_SGA, ref = wholeWorkbook(buf, want);
  // a reader that ignores `sheets` and answers with nothing
  let n = 0;
  const deaf = { ...XLSX, utils: XLSX.utils, read(b, o) { n++; if (o && o.sheets) return { SheetNames: XLSX.read(b, { type: "array", bookSheets: true }).SheetNames, Sheets: {} }; return XLSX.read(b, o); } };
  assert.deepEqual(sheetsOf(deaf, buf, want), ref); assert.equal(n, 3, "names, the short read, then the whole workbook");
  // a reader whose names pass throws
  const noNames = { ...XLSX, utils: XLSX.utils, read(b, o) { if (o && o.bookSheets) throw new Error("no names pass"); return XLSX.read(b, o); } };
  assert.deepEqual(sheetsOf(noNames, buf, want), ref);
  // a reader whose names pass gives no list
  const noList = { ...XLSX, utils: XLSX.utils, read(b, o) { if (o && o.bookSheets) return {}; return XLSX.read(b, o); } };
  assert.deepEqual(sheetsOf(noList, buf, want), ref);
});

test("an old-format .xls bill reads the same as before", () => {
  const buf = tdgShaped(realNames().slice(0, 12), "biff8");
  assert.deepEqual(sheetsOf(XLSX, buf, WANT_SGA), wholeWorkbook(buf, WANT_SGA));
  assert.deepEqual(Object.keys(sheetsOf(XLSX, buf, WANT_SGA)), REAL_WANTED);
});

test("a file that is not a workbook still throws, so the intake receipts it as unreadable", () => {
  assert.throws(() => sheetsOf(XLSX, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]).buffer, WANT_SGA));
});
