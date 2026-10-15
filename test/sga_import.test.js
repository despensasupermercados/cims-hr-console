// /api/sga/import and /api/sga against REAL SQLite (node:sqlite): a workbook's two sheets go in as 2-D arrays, the month
// is staged (dry-run), loaded, replaced by a REVISED file, and read back placed on the roster. Synthetic amounts, the real
// layout and ref format. Same harness idea as test/ensure_travel.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__sga_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { apiSgaImport, apiSga };\n", "utf-8");
let apiSgaImport, apiSga;
try { ({ apiSgaImport, apiSga } = await import(TMP.href)); } finally { unlinkSync(TMP); }

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
}
const req = (body) => ({ json: async () => body });
const J = async (r) => JSON.parse(await r.text());

const H = ["", "REF. NO.", "", "ID NUMBER", "NATIONALITY", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "HMO", "REFUND", "BANK CHARGE / COURIER", "AMOUNT"];
const row = (ref, name, vessel, vals) => { const r = new Array(H.length).fill(""); r[1] = ref; r[5] = name; r[6] = name; r[7] = vessel; Object.entries(vals).forEach(([k, v]) => { r[H.indexOf(k)] = v; }); return r; };
const manning = (extra = []) => [
  [], ["", "DATE", ":", "October 01, 2026"], ["", "SGA NO.", ":", "39-A"], H,
  ["", "1. ROYAL VESSELS"],
  row("ANT-2026-09-39-01", "CAAG, HAZIEL", "ANTHEM OF THE SEAS", { "HOME ALLOTMENT": 534.4, "MANNING FEE/ AGENCY FEE": 52, "SOCIAL COSTS": 78.12, "JOINING FEE": 120, "ACCOUNTING FEE": 30, "TRAVEL /PLANEFARE": 614, "HMO": 123.79, "AMOUNT": 1552.31 }),
  row("ANT-2026-09-39-02", "LORONO, ANDREW", "ANTHEM OF THE SEAS", { "HOME ALLOTMENT": 623.79, "MANNING FEE/ AGENCY FEE": 34.67, "SOCIAL COSTS": 78.12, "ACCOUNTING FEE": 30, "HOTEL": 137, "HMO": 111.49, "AMOUNT": 1015.07 }),
  ["", "2. CELEBRITY VESSELS"],
  row("CSU-2026-09-39-01", "TANGONAN, MARA", "CELEBRITY SUMMIT", { "HOME ALLOTMENT": 1169.6, "MANNING FEE/ AGENCY FEE": 65, "SOCIAL COSTS": 79.2, "ACCOUNTING FEE": 30, "MEDICAL": 24.47, "VISA": 5.21, "AMOUNT": 1373.48 }),
  ...extra,
  ["", "OTHERS", "", "", "", "", "Bank Charge - September 2026 SGA", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "15.00", "15.00"],
  ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", String(1552.31 + 1015.07 + 1373.48 + 15 + extra.length * 700)],
];
const training = [
  ["2025", "HOME ALLOTMENT", "TRAVEL/ PLANEFARE", "TRAINING RELATED", "TOTAL"], ["JANUARY", 35573.88, 8709.53, 2072.44, 58998.14], ["TOTAL", "", "", 25780.54, ""], [],
  ["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TOTAL"],
  ["JANUARY", 870.48, 97.07, 51.28, "", "", "", 1018.83], ["SEPTEMBER", 843.94, 228.05, 1374.09, 2109.03, 1399.83, "", 5954.94], ["OCTOBER", "", "", "", "", "", "", " -   "],
  ["TOTAL", 7787.85, 1466.63, 9357.44, 7134.55, 2577.68, "", 28324.15],
];
const CREW = "CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag'),('SC-0043141','Andrew','Lorono'),('SC-0044768','Mara','Tañgonan');";

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("dry-run stages the month: period, SGA no, lines placed on the roster, reconciliation, training months", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  const r = await J(await apiSgaImport(req({ sheets: { "SUMMARY MANNING": manning(), "2026 SUMMARY TRAINREL": training }, name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", dryRun: true }), env, { email: "rita@dg3.com" }));
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.period, { year: 2026, month: 9, source: "name" }, "the month is the file name's, never the ref's 09");
  assert.deepEqual(r.meta, { date: "October 01, 2026", sgaNo: "39-A" });
  assert.equal(r.rows, 3); assert.equal(r.reconciles, true, "lines + OTHERS = TDG's grand total");
  assert.equal(r.byBrand.royal, Math.round((1552.31 + 1015.07) * 100) / 100); assert.equal(r.byCat.air, 614);
  assert.equal(r.trainingMonths, 2); assert.equal(r.training.length, 3, "+ the 2025 summary-only month");
  assert.deepEqual(r.unmatched, [], "TANGONAN matches Tañgonan — accents fold");
  assert.equal(r.prior, null);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 0, "a dry-run writes nothing");
});

test("a workbook without the manning sheet, or without refs, is refused with a reason", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const a = await apiSgaImport(req({ sheets: { "SOA ADV1": [["x"]] }, dryRun: true }), envFor(d), null);
  assert.equal(a.status, 400); assert.equal((await J(a)).error, "no_manning_sheet");
  const b = await apiSgaImport(req({ sheets: { "SUMMARY MANNING": [H, row("", "Nobody", "X", { "AMOUNT": 1 })] }, dryRun: true }), envFor(d), null);
  assert.equal((await J(b)).error, "no_period");
});

test("apply loads the month, a REVISED file replaces it, an older load stays as history, and /api/sga reads the latest", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  const sheets = { "SUMMARY MANNING": manning(), "2026 SUMMARY TRAINREL": training };
  const a = await J(await apiSgaImport(req({ sheets, name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", hash: "h1" }), env, { email: "rita@dg3.com" }));
  assert.equal(a.ok, true); assert.equal(a.applied, 3); assert.equal(a.training, 2); assert.equal(a.replaced, false);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 3);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM training_cost").get().n, 3, "Jan + Sep 2026 by category, Jan 2025 as one figure");
  assert.equal(d.prepare("SELECT total FROM training_cost WHERE year=2026 AND month=9").get().total, 5954.94);
  assert.equal(d.prepare("SELECT summary_only FROM training_cost WHERE year=2025").get().summary_only, 1);
  // the REVISED workbook adds a fourth crew
  const rev = { "SUMMARY MANNING": manning([row("CAP-2026-09-39-01", "SOMEBODY, NEW", "CELEBRITY APEX", { "TRAVEL /PLANEFARE": 700, "AMOUNT": 700 })]), "2026 SUMMARY TRAINREL": training };
  const dry = await J(await apiSgaImport(req({ sheets: rev, name: "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx", dryRun: true }), env, null));
  assert.ok(dry.prior && dry.prior.file_name === "DG3 SGA EXCEL SEPTEMBER'26.xlsx", "the dry-run says the month is already on file");
  assert.deepEqual(dry.unmatched.map((u) => u.crew_name), ["SOMEBODY, NEW"]);
  const b = await J(await apiSgaImport(req({ sheets: rev, name: "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx", hash: "h2" }), env, { email: "rita@dg3.com" }));
  assert.equal(b.replaced, true); assert.equal(b.applied, 4);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 4, "the month was replaced, not appended");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_file").get().n, 2, "both loads stay on sga_file");
  const read = await J(await apiSga(env));
  assert.equal(read.files.length, 2); assert.equal(read.files[0].file_name, "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx");
  assert.equal(read.lines.length, 4);
  const caag = read.lines.find((l) => /CAAG/.test(l.crew_name));
  assert.equal(caag.agency_id, "SC-0045584"); assert.equal(caag.air, 614); assert.equal(caag.hmo, 123.79); assert.equal(caag.brand, "royal"); assert.equal(caag.ref, "ANT-2026-09-39-01");
  assert.equal(read.lines.find((l) => /SOMEBODY/.test(l.crew_name)).agency_id, null);
  assert.equal(read.training.find((t) => t.year === 2026 && t.month === 9).air, 2109.03);
  assert.ok(Array.isArray(read.cols) && read.cols.includes("allotment"));
});

test("training months are replaced one at a time and a NEWER bill's figure stands (an older workbook never wipes the year)", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  // September's workbook: Jan + Sep 2026 by category, 2025 as one figure
  const a = await J(await apiSgaImport(req({ sheets: { "SUMMARY MANNING": manning(), "2026 SUMMARY TRAINREL": training }, name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx" }), env, { email: "r" }));
  assert.equal(a.training_written, 3);
  // February's workbook, loaded AFTER: its TRAINREL has Jan (a different figure) and Feb
  const febTrain = [["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TOTAL"], ["JANUARY", 999, 1, "", "", "", "", 1000], ["FEBRUARY", 870.48, 97.07, 51.28, "", "", "", 1018.83], ["TOTAL", "", "", "", "", "", "", 2018.83]];
  const febRows = [[], ["", "DATE", ":", "15-Oct-26"], ["", "SGA NO.", ":", "32-A"], H, ["", "1. ROYAL VESSELS"],
    row("ANT-2026-09-32-01", "CAAG, HAZIEL", "ANTHEM OF THE SEAS", { "HOME ALLOTMENT": 500, "AMOUNT": 500 }),
    ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "500"]];
  const b = await J(await apiSgaImport(req({ sheets: { "SUMMARY MANNING": febRows, "2026 SUMMARY TRAINREL": febTrain }, name: "DG3 SGA EXCEL FEBRUARY 2026.xlsx" }), env, { email: "r" }));
  assert.deepEqual(b.period, { year: 2026, month: 2, source: "name" }, "the ref's 09 did not make it September");
  assert.equal(b.training_written, 1, "February added; January's figure from the newer (September) bill stands");
  const tr = d.prepare("SELECT month, total FROM training_cost WHERE year=2026 ORDER BY month").all().map((x) => ({ ...x }));
  assert.deepEqual(tr, [{ month: 1, total: 1018.83 }, { month: 2, total: 1018.83 }, { month: 9, total: 5954.94 }], "September's months survived the older file");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=2").get().n, 1); assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=9").get().n, 3, "September's lines untouched");
  // a REVISED September (newer or equal period) replaces September's and January's figures
  const rev = training.map((r) => (r[0] === "SEPTEMBER" ? ["SEPTEMBER", 1, 1, 1, 1, 1, "", 5] : r));
  const c = await J(await apiSgaImport(req({ sheets: { "SUMMARY MANNING": manning(), "2026 SUMMARY TRAINREL": rev }, name: "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx" }), env, { email: "r" }));
  assert.equal(c.training_written, 3);
  assert.equal(d.prepare("SELECT total FROM training_cost WHERE year=2026 AND month=9").get().total, 5);
  assert.equal(d.prepare("SELECT total FROM training_cost WHERE year=2026 AND month=2").get().total, 1018.83, "February's own month, which September's sheet does not name, stays");
});

const SUMMARY_SHEET = [
  ["2025", "HOME ALLOTMENT", "TRAVEL/ PLANEFARE", "MEDICAL", "VISA", "HOTEL", "BANK CHARGE/ COURIER", "TRAINING RELATED", "TOTAL"],
  ["SEPTEMBER", " 48,795.11 ", " 9,583.92 ", " 553.71 ", " 831.61 ", " 223.00 ", " 15.00 ", " 2,356.31 ", " 62,358.66 "], ["TOTAL", "", "", "", "", "", "", "", ""], [],
  ["2026", "HOME ALLOTMENT", "TRAVEL/ PLANEFARE", "MEDICAL", "VISA", "HOTEL", "BANK CHARGE/ COURIER", "TRAINING RELATED2", "SETTLEMENT PAYMENT", "TOTAL"],
  ["AUGUST", " 100.00 ", " 10.00 ", "", "", "", " 15.00 ", " 5.00 ", "", " 130.00 "],
  // crew total 3,955.86 = the fixture's GRAND TOTAL (three lines + the 15.00 bank charge); + training 5,954.94 = 9,910.80
  ["SEPTEMBER", " 3,189.86 ", " 614.00 ", "", "", " 137.00 ", " 15.00 ", " 5,954.94 ", "", " 9,910.80 "],
];

test("the monthly summary sheet loads per month (newer bill wins) and a SUMMARY-ONLY file never touches the month's lines", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  // September's full workbook: lines + the summary sheet
  const a = await J(await apiSgaImport(req({ sheets: { "SUMMARY MANNING": manning(), "2026 SUMMARY TRAINREL": training, "2026 SUMMARY (2)": SUMMARY_SHEET }, name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx" }), env, { email: "r" }));
  assert.equal(a.summary_only, false); assert.equal(a.summary_written, 3, "Sep 2025, Aug 2026, Sep 2026");
  assert.equal(a.summary_agrees, true, "the summary sheet's crew total for September = the manning sheet's GRAND TOTAL");
  const sep = { ...d.prepare("SELECT total, training, crew_total, air, hotel FROM sga_summary WHERE year=2026 AND month=9").get() };
  assert.deepEqual(sep, { total: 9910.8, training: 5954.94, crew_total: 3955.86, air: 614, hotel: 137 });
  // October's workbook arrives through the inbox with the manning sheet CUT: summary only, the same September row revised, October added
  const oct = SUMMARY_SHEET.map((r) => r[0] === "SEPTEMBER" && r.length === 10 ? ["SEPTEMBER", " 3,189.86 ", " 614.00 ", "", "", " 137.00 ", " 15.00 ", " 5,000.00 ", "", " 8,955.86 "] : r).concat([["OCTOBER", " 200.00 ", " 20.00 ", "", "", "", " 15.00 ", " 1.00 ", "", " 236.00 "]]);
  const dry = await J(await apiSgaImport(req({ sheets: { "2026 SUMMARY (2)": oct }, name: "DG3 SGA EXCEL OCTOBER'26.xlsx", dryRun: true }), env, null));
  assert.equal(dry.summaryOnly, true); assert.equal(dry.rows, 0); assert.equal(dry.summaryMonths, 4); assert.deepEqual(dry.period, { year: 2026, month: 10, source: "name" });
  const b = await J(await apiSgaImport(req({ sheets: { "2026 SUMMARY (2)": oct }, name: "DG3 SGA EXCEL OCTOBER'26.xlsx" }), env, { email: "r" }));
  assert.equal(b.summary_only, true); assert.equal(b.applied, 0); assert.equal(b.summary_written, 4, "the newer bill revises every month it carries");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=9").get().n, 3, "September's lines untouched by the summary-only load");
  assert.equal(d.prepare("SELECT training FROM sga_summary WHERE year=2026 AND month=9").get().training, 5000, "October's bill revised September's summary row");
  assert.equal(d.prepare("SELECT crew_total FROM sga_summary WHERE year=2026 AND month=10").get().crew_total, 235);
  // /api/sga: the summary rows ride along, and the summary-only file (rows 0) does not hide September's lines
  const api = await J(await apiSga(env));
  assert.equal(api.summary.length, 4); assert.equal(api.lines.filter((l) => l.month === 9).length, 3);
  assert.equal(api.files.length, 2); assert.equal(api.files.find((f) => f.month === 10).rows, 0);
  // an OLDER bill's summary (August's workbook) does not overwrite what October wrote
  const aug = [["2026", "HOME ALLOTMENT", "TRAVEL/ PLANEFARE", "BANK CHARGE/ COURIER", "TRAINING RELATED2", "TOTAL"], ["AUGUST", " 999.00 ", "", " 15.00 ", " 5.00 ", " 1,019.00 "]];
  const c = await J(await apiSgaImport(req({ sheets: { "2026 SUMMARY (2)": aug }, name: "DG3 SGA EXCEL AUGUST'26.xlsx" }), env, { email: "r" }));
  assert.equal(c.summary_written, 0); assert.equal(d.prepare("SELECT total FROM sga_summary WHERE year=2026 AND month=8").get().total, 130);
});
