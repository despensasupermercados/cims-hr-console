// SharePoint → console (src/sharepoint_sync.js) against a FAKE Graph and a REAL SheetJS workbook: the plan, the eTag
// rule, REVISED over plain, one failure not stopping the rest, staging refusing, and the sheets reaching the same apply
// paths as drag-and-drop in the same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { syncConfigured, syncAllowed, yearsToScan, pickSgaWorkbook, pickTravelWorkbook, sheetsOf, WANT_SGA, WANT_TRAVEL, planSync, runSync, graphToken, _resetTokenCache, GRAPH } from "../src/sharepoint_sync.js";
import { parseSgaManning, parseSgaTraining, pickSgaSheets } from "../src/sga.js";

const ENV = { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", SP_DRIVE_ID: "drv", SP_SGA_PATH: "1. ACCOUNTING/SGA", SP_TRAVEL_PATH: "1. ACCOUNTING/Travel Expenses Crew" };

// a workbook with the real sheet names and layout, as bytes
function sgaXlsx() {
  const wb = XLSX.utils.book_new();
  const H = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"];
  const rows = [[], ["", "DATE", ":", "October 01, 2026"], ["", "SGA NO.", ":", "39-A"], H, ["", "1. ROYAL VESSELS"],
    ["", "ANT-2026-09-39-01", "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", 534.4, "", 52, 78.12, 120, 30, "", 614, "", "", "", "", 1428.52],
    ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", 1428.52]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SUMMARY MANNING");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TOTAL"], ["SEPTEMBER", 843.94, 228.05, 1374.09, 2109.03, 1399.83, "", 5954.94]]), "2026 SUMMARY TRAINREL");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SOA ADV1 — ignored"]]), "SOA ADV1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
function travelXlsx() {
  const wb = XLSX.utils.book_new();
  const r0 = ["Sep-26", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANSPORT", "", "CREW 1 / ON"];
  const r1 = ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"];
  const r2 = ["Anthem", 614, 0, 0, 0, 0, 0, "", "Caag, Haziel", 614, 0, 0, 0, 0, 0];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([r0, r1, r2]), "SEPT");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SUMMARY — ignored"]]), "SUMMARY");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
const item = (id, name, etag = "e1", folder = false) => ({ id, name, eTag: etag, lastModifiedDateTime: "2026-10-10T00:00:00Z", ...(folder ? { folder: {} } : { file: {} }) });

// A fake Graph: token, the folder listings by path, the content by item id. `fail` = item ids whose download 500s.
function fakeGraph({ listings, content, fail = [] }) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url);
    if (url.includes("login.microsoftonline.com")) return { ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 3600 }) };
    const m = /\/root:\/(.+?):\/children/.exec(url);
    if (m) { const p = decodeURIComponent(m[1]); const v = listings[p]; return v ? { ok: true, status: 200, json: async () => ({ value: v }) } : { ok: false, status: 404 }; }
    const c = /\/items\/([^/]+)\/content/.exec(url);
    if (c) { if (fail.includes(c[1])) return { ok: false, status: 500 }; const buf = content[c[1]]; return buf ? { ok: true, status: 200, arrayBuffer: async () => buf } : { ok: false, status: 404 }; }
    return { ok: false, status: 400 };
  };
  return { fetchImpl, calls };
}
const LISTINGS = {
  "1. ACCOUNTING/SGA/2026": [item("f-approval", "00 For approval", "x", true), item("f-08", "08 August 2026", "x", true), item("f-09", "09 September 2026", "x", true)],
  "1. ACCOUNTING/SGA/2026/08 August 2026": [item("aug-plain", "DG3 SGA EXCEL AUGUST'2026.xlsx", "ea"), item("aug-pdf", "TRAINING RELATED COSTS AUGUST'2026.pdf", "ep")],
  "1. ACCOUNTING/SGA/2026/09 September 2026": [item("sep-plain", "DG3 SGA EXCEL SEPTEMBER'26.xlsx", "e1"), item("sep-rev", "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx", "e2"), item("sep-pdf", "TRAINING RELATED COSTS SEPTEMBER'26.pdf", "e3")],
  "1. ACCOUNTING/Travel Expenses Crew": [item("tr-2026", "UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", "et"), item("tr-2025", "UPDATED - Travel Expenses 2025 RCCL & AZAMARA & CELEBRITY.xlsx", "eu")],
};

test("configured / allowed: every var, and never on staging", () => {
  assert.equal(syncConfigured({}), false);
  assert.equal(syncConfigured(ENV), true);
  assert.equal(syncAllowed(ENV), true);
  assert.equal(syncAllowed({ ...ENV, MAIL_ONLY_TO: "x@dg3.com" }), false, "MAIL_ONLY_TO is the staging marker");
  assert.equal(syncAllowed({ ...ENV, GRAPH_CLIENT_SECRET: "" }), false);
});

test("yearsToScan: this year, and last year until the end of February", () => {
  assert.deepEqual(yearsToScan("2026-10-15"), [2026]);
  assert.deepEqual(yearsToScan("2027-01-20"), [2026, 2027]);
  assert.deepEqual(yearsToScan("2027-03-01"), [2027]);
});

test("the pickers: REVISED beats plain, PDFs never, the right year's travel workbook", () => {
  assert.equal(pickSgaWorkbook(LISTINGS["1. ACCOUNTING/SGA/2026/09 September 2026"]).id, "sep-rev");
  assert.equal(pickSgaWorkbook(LISTINGS["1. ACCOUNTING/SGA/2026/08 August 2026"]).id, "aug-plain");
  assert.equal(pickSgaWorkbook([item("p", "TRAINING RELATED COSTS.pdf")]), null);
  assert.equal(pickTravelWorkbook(LISTINGS["1. ACCOUNTING/Travel Expenses Crew"], 2026).id, "tr-2026");
  assert.equal(pickTravelWorkbook(LISTINGS["1. ACCOUNTING/Travel Expenses Crew"], 2024), null);
});

test("sheetsOf reads a real workbook into the Upload page's shape, only the sheets a parser wants", () => {
  const s = sheetsOf(XLSX, sgaXlsx(), WANT_SGA);
  assert.deepEqual(Object.keys(s).sort(), ["2026 SUMMARY TRAINREL", "SUMMARY MANNING"], "SOA sheets are not read");
  const pick = pickSgaSheets(s);
  const m = parseSgaManning(s[pick.manning]);
  assert.equal(m.records.length, 1); assert.equal(m.records[0].crew_name, "CAAG, HAZIEL"); assert.equal(m.records[0].air, 614); assert.equal(m.records[0].vessel, "ANTHEM OF THE SEAS"); assert.equal(m.grand_total, 1428.52);
  assert.equal(parseSgaTraining(s[pick.training])[0].total, 5954.94);
  const t = sheetsOf(XLSX, travelXlsx(), WANT_TRAVEL);
  assert.deepEqual(Object.keys(t), ["SEPT"]);
});

test("planSync walks the month folders (not '00 For approval') and the travel folder", async () => {
  _resetTokenCache();
  const g = fakeGraph({ listings: LISTINGS, content: {} });
  const tok = await graphToken(ENV, g.fetchImpl, 0);
  assert.equal(tok, "tok");
  const plan = await planSync(ENV, tok, g.fetchImpl, "2026-10-15");
  assert.deepEqual(plan.map((p) => [p.kind, p.item.id, p.year, p.month || null]), [["sga", "aug-plain", 2026, 8], ["sga", "sep-rev", 2026, 9], ["travel", "tr-2026", 2026, null]]);
  assert.equal(plan[1].path, "1. ACCOUNTING/SGA/2026/09 September 2026/REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx");
  assert.ok(!g.calls.some((u) => u.includes("00%20For%20approval")), "a folder that is not a month is never listed");
});

function fakeDb(seenMap = new Map()) {
  const records = [];
  return { records, seen: async () => seenMap, record: async (r) => { records.push(r); } };
}

test("runSync: loads what is new, skips what is on file by eTag, records one failure and carries on", async () => {
  _resetTokenCache();
  const g = fakeGraph({ listings: LISTINGS, content: { "sep-rev": sgaXlsx(), "tr-2026": travelXlsx() }, fail: ["aug-plain"] });
  const db = fakeDb(new Map([["tr-2026", "et"]])); // the travel workbook was loaded with this eTag already
  const applied = [];
  const deps = { fetch: g.fetchImpl, now: Date.UTC(2026, 9, 15), today: "2026-10-15", XLSX, db,
    applySga: async (sheets, meta) => { applied.push(["sga", Object.keys(sheets).sort(), meta]); return { ok: true, applied: 1 }; },
    applyTravel: async (sheets, year, meta) => { applied.push(["travel", year, meta]); return { ok: true, year }; } };
  const r = await runSync(ENV, deps);
  assert.equal(r.ran, true); assert.equal(r.planned, 3); assert.equal(r.skipped, 1, "the travel workbook is unchanged");
  assert.equal(r.loaded.length, 1); assert.equal(r.loaded[0].path.endsWith("REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx"), true);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0].error, /graph_500/); assert.ok(r.errors[0].path.includes("AUGUST"));
  assert.deepEqual(applied.map((a) => a[0]), ["sga"]);
  assert.deepEqual(applied[0][1], ["2026 SUMMARY TRAINREL", "SUMMARY MANNING"]);
  assert.deepEqual(applied[0][2], { name: "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx", hash: "e2", source: "sharepoint", by: "sharepoint-sync", path: "1. ACCOUNTING/SGA/2026/09 September 2026/REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx" });
  assert.deepEqual(db.records.map((x) => [x.item_id, x.status]), [["aug-plain", "error"], ["sep-rev", "ok"]]);
  assert.equal(db.records[1].etag, "e2"); assert.equal(db.records[1].month, 9);
});

test("runSync: a changed travel workbook (new eTag) loads again; an apply that refuses is an error row, not a crash", async () => {
  _resetTokenCache();
  const g = fakeGraph({ listings: LISTINGS, content: { "sep-rev": sgaXlsx(), "aug-plain": sgaXlsx(), "tr-2026": travelXlsx() } });
  const db = fakeDb(new Map([["tr-2026", "OLD"], ["sep-rev", "e2"], ["aug-plain", "ea"]]));
  const deps = { fetch: g.fetchImpl, now: 0, today: "2026-10-15", XLSX, db, applySga: async () => ({ ok: true }), applyTravel: async () => ({ error: "year_required", detail: "no year" }) };
  const r = await runSync(ENV, deps);
  assert.equal(r.skipped, 2); assert.equal(r.loaded.length, 0); assert.deepEqual(r.errors, [{ path: "1. ACCOUNTING/Travel Expenses Crew/UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", error: "year_required", detail: "no year" }]);
  assert.equal(db.records[0].status, "error");
});

test("runSync does nothing without the identity, or on staging", async () => {
  assert.deepEqual((await runSync({}, {})).reason, "not_configured");
  assert.deepEqual((await runSync({ ...ENV, MAIL_ONLY_TO: "x" }, {})).reason, "staging");
});
