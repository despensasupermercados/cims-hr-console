// The SharePoint INBOX (src/sp_inbox.js, worker.js applyInbox; Miguel, 15 Oct 2026: "I dont want rita to be dropping
// items"). The connector's text dump → sheets, with a sheet the read budget cut REFUSED; the parts a D1 statement can
// carry and their reassembly; and, on real SQLite, the Worker loading an inbox file through the same SGA / travel apply
// paths as drag-and-drop, recording it on sp_sync and marking the inbox rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dumpToSheets, sgaFromDump, travelFromDump, inboxParts, assembleInbox, inboxFileKey, monthOfFolder, pickSgaItem, pickTravelItem } from "../src/sp_inbox.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__inbox_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { applyInbox, apiSharePointStatus };\n", "utf-8");
let applyInbox, apiSharePointStatus;
try { ({ applyInbox, apiSharePointStatus } = await import(TMP.href)); } finally { unlinkSync(TMP); }

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
}
const J = async (r) => JSON.parse(await r.text());

// A dump in the connector's exact shape: the workbook line, "## Sheet:" headers, tab cells, "[n empty rows]", "Formulas:".
const sheetBlock = (name, rows, { hidden = false, formulas = [] } = {}) => [
  `## Sheet: ${name}${hidden ? " [hidden]" : ""} — ${rows.length} rows × ${Math.max(...rows.map((r) => r.length), 1)} columns (A1:Z${rows.length})`,
  ...rows.map((r) => (r.length ? r.join("\t") : "[1 empty row]")),
  ...(formulas.length ? ["Formulas:", ...formulas] : []),
].join("\n");
const MANNING = [
  [], ["", "DATE", ":", "October 01, 2026"], ["", "SGA NO.", ":", "39-A"],
  ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"],
  ["", "1. ROYAL VESSELS"],
  ["", "ANT-2026-09-39-01", "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", "534.40 ", "", "52.00 ", "78.12 ", "120.00 ", "30.00 ", "", "614.00 ", "", "", "", "", "1,428.52 "],
  ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", "1,428.52 "],
];
const TRAINREL = [["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TOTAL"], ["SEPTEMBER", "843.94", "228.05", "1,374.09", "2,109.03", "1,399.83", "", "5,954.94"]];
const sgaDump = (truncAfterManning = false) => [
  "Workbook: 230 worksheets. Cell values are tab-separated rows; \"Formulas\" lists formula cells by source (which can differ from the displayed value).", "",
  sheetBlock("SGA SUMMARY WITH SBP ", [["x"], [], ["y"]], { hidden: true, formulas: ["B21: =+B20+1"] }),
  sheetBlock("2026 SUMMARY TRAINREL", TRAINREL, { hidden: true }),
  sheetBlock("SUMMARY MANNING", MANNING, { formulas: ["V7: =SUM(J7:U7)"] }),
  ...(truncAfterManning ? ["[Output truncated (read budget exhausted) — remaining worksheets not shown. Open the file in OneDrive/SharePoint for the full workbook.]"] : [sheetBlock("Sheet8", [["1"]], { hidden: true })]),
].join("\n");

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("dumpToSheets reads the connector's shape: hidden names, empty-row markers, formula blocks skipped, cells kept as printed", () => {
  const p = dumpToSheets(sgaDump());
  assert.equal(p.declared, 230);
  assert.deepEqual(p.seen, ["SGA SUMMARY WITH SBP", "2026 SUMMARY TRAINREL", "SUMMARY MANNING", "Sheet8"]);
  assert.deepEqual(p.complete, p.seen, "nothing was cut: every sheet seen is complete");
  assert.equal(p.cut, null); assert.equal(p.truncated, false); assert.equal(p.missing, 226);
  assert.deepEqual(p.sheets["SGA SUMMARY WITH SBP"], [["x"], [], ["y"]], "an [1 empty row] marker is an empty row; the formulas are not rows");
  assert.equal(p.sheets["SUMMARY MANNING"].length, MANNING.length);
  assert.equal(p.sheets["SUMMARY MANNING"][5][21], "1,428.52 ", "cells stay strings exactly as the dump prints them");
});

test("a truncation notice ends the dump: the sheet it lands in is CUT and not delivered, the ones before it are complete", () => {
  // cut inside OCT, as the real 2026 travel workbook read of 15 Oct 2026 was
  const dump = ["Workbook: 14 worksheets.", sheetBlock("SUMMARY", [["s"]]), sheetBlock("CIMS", [["c"]]), sheetBlock("JAN", [["Jan-26"], ["Anthem", "1"]]), sheetBlock("SEPT", [["Sep-26"]]),
    "## Sheet: OCT — 51 rows × 29 columns (A1:AC51)", "Oct-26\tAIR", "[Output truncated — 6 more rows in this sheet and any later sheets not shown. Open the file in OneDrive/SharePoint for the full workbook.]", "never read"].join("\n");
  const p = dumpToSheets(dump);
  assert.equal(p.truncated, true); assert.equal(p.cut, "OCT"); assert.equal("OCT" in p.sheets, false);
  assert.deepEqual(p.complete, ["SUMMARY", "CIMS", "JAN", "SEPT"]); assert.equal(p.missing, 14 - 4 - 1);
  const t = travelFromDump(p);
  assert.equal(t.ok, false); assert.equal(t.reason, "sheet_cut"); assert.match(t.detail, /inside OCT/);
  // a notice that lands in a sheet's Formulas block leaves that sheet complete (its values were all printed)
  const p2 = dumpToSheets([sheetBlock("A", [["1"]], { formulas: ["A1: =1"] }), "[Output truncated (read budget exhausted) — remaining worksheets not shown.]"].join("\n"));
  assert.deepEqual(p2.complete, ["A"]); assert.equal(p2.cut, null);
});

test("sgaFromDump wants SUMMARY MANNING whole and takes the TRAINREL summary when it is there; refuses a cut manning sheet", () => {
  const ok = sgaFromDump(dumpToSheets(sgaDump(true)));
  assert.equal(ok.ok, true); assert.equal(ok.manning, "SUMMARY MANNING"); assert.equal(ok.training, "2026 SUMMARY TRAINREL");
  assert.deepEqual(Object.keys(ok.sheets), ["SUMMARY MANNING", "2026 SUMMARY TRAINREL"], "only the two sheets the console reads travel — never the 228 others");
  const cut = sgaFromDump(dumpToSheets(["Workbook: 230 worksheets.", sheetBlock("draft", [["d"]]), "## Sheet: SUMMARY MANNING — 107 rows × 37 columns (A1:AK107)", "\tDATE\t:\tOctober 01, 2026", "[Output truncated — 90 more rows in this sheet and any later sheets not shown.]"].join("\n")));
  assert.equal(cut.ok, false); assert.equal(cut.reason, "manning_cut");
  assert.equal(sgaFromDump(dumpToSheets("Workbook: 3 worksheets.\n" + sheetBlock("Sheet1", [["a"]]))).reason, "no_manning");
  // the manning sheet cut but the monthly summary sheet whole (January, April, May 2026 on 15 Oct 2026): SUMMARY ONLY
  const so = sgaFromDump(dumpToSheets(["Workbook: 230 worksheets.", sheetBlock("2026 SUMMARY (2)", [["2026", "HOME ALLOTMENT", "TOTAL"], ["JANUARY", "1", "1"]]), "## Sheet: SUMMARY MANNING — 107 rows × 37 columns (A1:AK107)", "\tDATE", "[Output truncated (read budget exhausted) — 90 more rows in this sheet and any later sheets not shown.]"].join("\n")));
  assert.equal(so.ok, true); assert.equal(so.summaryOnly, true); assert.equal(so.manningCut, "SUMMARY MANNING"); assert.deepEqual(Object.keys(so.sheets), ["2026 SUMMARY (2)"]);
  assert.equal(ok.summaryOnly, false);
});

test("travelFromDump takes a year only whole: every month sheet and CIMS complete, none missing", () => {
  const months = ["JAN", "FEB", "MAR", "APRIL", "MAY", "JUNE", "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC"];
  const whole = ["Workbook: 14 worksheets.", sheetBlock("SUMMARY", [["s"]]), sheetBlock("CIMS", [["c"]]), ...months.map((m) => sheetBlock(m, [[m]]))].join("\n");
  const t = travelFromDump(dumpToSheets(whole));
  assert.equal(t.ok, true); assert.equal(t.months, 12); assert.equal(t.cims, true);
  assert.equal("SUMMARY" in t.sheets, false, "the SUMMARY sheet is Rita's own arithmetic, never loaded (§10j: it is misaligned)");
  // the same book with DEC never reached (the notice came after NOV's formulas): missing, refused
  const short = ["Workbook: 14 worksheets.", sheetBlock("SUMMARY", [["s"]]), sheetBlock("CIMS", [["c"]]), ...months.slice(0, 11).map((m) => sheetBlock(m, [[m]], { formulas: ["A1: =1"] })), "[Output truncated (read budget exhausted) — remaining worksheets not shown.]"].join("\n");
  const s = travelFromDump(dumpToSheets(short));
  assert.equal(s.ok, false); assert.equal(s.reason, "sheets_missing"); assert.match(s.detail, /1 of 14/);
  // a book that simply has fewer sheets (a young year: JAN–MAR) is whole
  const young = ["Workbook: 5 worksheets.", sheetBlock("SUMMARY", [["s"]]), sheetBlock("CIMS", [["c"]]), ...months.slice(0, 3).map((m) => sheetBlock(m, [[m]]))].join("\n");
  assert.equal(travelFromDump(dumpToSheets(young)).months, 3);
});

test("inboxParts splits a sheet under the statement cap and assembleInbox puts it back; a missing part = not yet", () => {
  const big = { S: Array.from({ length: 400 }, (_, i) => ["row " + i, String(i * 1.5), "x".repeat(40)]) };
  const parts = inboxParts(big, 5000);
  assert.ok(parts.length > 3, "split into several parts");
  assert.ok(parts.every((p) => p.rows_json.length <= 5000 && p.sheet === "S" && p.parts === parts.length));
  assert.deepEqual(parts.map((p) => p.part), parts.map((_, i) => i + 1));
  assert.deepEqual(assembleInbox(parts), big);
  assert.equal(assembleInbox(parts.slice(1)), null, "part 1 missing → the file waits");
  const two = inboxParts({ A: [["1"]], B: [["2"]] });
  assert.equal(two[0].file_parts, 2);
  assert.equal(assembleInbox([two[0]]), null, "a whole sheet missing → the file waits (file_parts says two)");
  assert.deepEqual(assembleInbox(inboxParts({ A: [["1"]], B: [[]] })), { A: [["1"]], B: [[]] });
});

test("file keys, month folders and the pick rules match the Graph sync's", () => {
  assert.equal(inboxFileKey(" 01ABC ", "2026-10-02T03:11:09.000Z"), "01ABC@2026-10-02T03:11:09.000Z");
  assert.equal(monthOfFolder("09 September 2026"), 9); assert.equal(monthOfFolder("07 July 2026"), 7); assert.equal(monthOfFolder("00 For approval"), null); assert.equal(monthOfFolder("Royal Vessels"), null);
  const items = [{ name: "TRAINING RELATED COSTS SEPTEMBER'26.pdf", id: "p" }, { name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", id: "a", lastModifiedDateTime: "2026-10-02" }, { name: "REVISED DG3 SGA EXCEL SEPTEMBER'26.xlsx", id: "b", lastModifiedDateTime: "2026-10-01" }];
  assert.equal(pickSgaItem(items).id, "b", "REVISED beats plain even when older");
  assert.equal(pickSgaItem(items.slice(0, 2)).id, "a"); assert.equal(pickSgaItem([items[0]]), null);
  const tr = [{ name: "Travel Expenses 2026 RCCL.xlsx", id: "old" }, { name: "UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", id: "upd" }, { name: "UPDATED - Travel Expenses 2025 RCCL.xlsx", id: "y25" }];
  assert.equal(pickTravelItem(tr, 2026).id, "upd"); assert.equal(pickTravelItem(tr, 2025).id, "y25"); assert.equal(pickTravelItem(tr, 2024), null);
});

// ---- the Worker side, on real SQLite ----
const CREW = "CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag');";
const LOG = "CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);";
const inboxRow = (d, fileKey, meta, p, status = "pending") => d.prepare("INSERT INTO sp_inbox (id, file_key, kind, year, month, item_id, name, path, modified, sheet, part, parts, file_parts, rows_json, written_by, at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(fileKey + "_" + p.sheet + "_" + p.part, fileKey, meta.kind, meta.year, meta.month ?? null, meta.item_id, meta.name, meta.path, meta.modified, p.sheet, p.part, p.parts, p.file_parts, p.rows_json, "pickup-session", "2026-10-16T05:00:00Z", status);

test("applyInbox loads an SGA file from the inbox through the same path as drag-and-drop, records sp_sync, marks the rows", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW + LOG);
  const env = envFor(d);
  await applyInbox(env); // creates sp_inbox / sp_sync / sga tables on an empty DB, loads nothing
  const sheets = sgaFromDump(dumpToSheets(sgaDump(true))).sheets;
  const meta = { kind: "sga", year: 2026, month: 9, item_id: "01ITEM", name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", path: "1. ACCOUNTING/SGA/2026/09 September 2026", modified: "2026-10-02T03:11:09.000Z" };
  const key = inboxFileKey(meta.item_id, meta.modified);
  for (const p of inboxParts(sheets)) inboxRow(d, key, meta, p);
  const r = await applyInbox(env);
  assert.equal(r.files, 1); assert.equal(r.loaded.length, 1); assert.equal(r.errors.length, 0); assert.equal(r.waiting, 0);
  assert.equal(r.loaded[0].result.ok, true); assert.deepEqual(r.loaded[0].result.period, { year: 2026, month: 9, source: "name" });
  assert.equal(r.loaded[0].result.reconciles, true);
  // the month is on sga_line / sga_file with the agent as the source; the training month is there
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE year=2026 AND month=9").get().n, 1);
  const f = { ...d.prepare("SELECT source, loaded_by, file_name, file_hash, sga_no FROM sga_file").get() };
  assert.deepEqual(f, { source: "agent", loaded_by: "pickup-session", file_name: meta.name, file_hash: key, sga_no: "39-A" });
  assert.equal(d.prepare("SELECT total FROM training_cost WHERE year=2026 AND month=9").get().total, 5954.94);
  // sp_sync carries the load like a Graph load would: item id, the modified time as the etag, status ok
  const s = d.prepare("SELECT item_id, etag, kind, year, month, status FROM sp_sync").all().map((x) => ({ ...x }));
  assert.deepEqual(s, [{ item_id: "01ITEM", etag: meta.modified, kind: "sga", year: 2026, month: 9, status: "ok" }]);
  // the inbox rows are marked, with the result
  const rows = d.prepare("SELECT status, applied_at IS NOT NULL done FROM sp_inbox").all();
  assert.ok(rows.length >= 2 && rows.every((x) => x.status === "ok" && x.done === 1));
  // a second run finds nothing pending; the status route counts the inbox
  const r2 = await applyInbox(env); assert.equal(r2.files, 0);
  const st = await J(await apiSharePointStatus(env));
  assert.equal(st.inbox.ok, 1); assert.equal(st.inbox.pending, 0); assert.equal(st.recent.length, 1);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM data_log WHERE source LIKE 'sga (%' AND source LIKE '%agent%'").get().n, 1, "the load is on data_log, named as the agent's");
});

test("a file still missing a part waits; a travel file loads as the year; a bad file is marked error and the rest proceed", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW + LOG);
  const env = envFor(d);
  await applyInbox(env); // the schema
  // travel: one month sheet in the workbook's layout
  const sept = [["Sep-26", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANSPORT", "", "CREW 1 / ON"], ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"], ["Anthem", "614", "0", "0", "0", "0", "0", "", "Caag, Haziel", "614", "0", "0", "0", "0", "0"]];
  const tmeta = { kind: "travel", year: 2026, item_id: "01TRAV", name: "UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", path: "1. ACCOUNTING/Travel Expenses Crew", modified: "2026-10-14T00:00:00Z" };
  const tkey = inboxFileKey(tmeta.item_id, tmeta.modified);
  for (const p of inboxParts({ SEPT: sept })) inboxRow(d, tkey, tmeta, p);
  // an SGA file with its second part not written yet
  const sheets = sgaFromDump(dumpToSheets(sgaDump(true))).sheets;
  const smeta = { kind: "sga", year: 2026, month: 9, item_id: "01SGA", name: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", path: "p", modified: "2026-10-02T00:00:00Z" };
  const skey = inboxFileKey(smeta.item_id, smeta.modified);
  const parts = inboxParts(sheets, 250); assert.ok(parts.length >= 3);
  for (const p of parts.slice(0, -1)) inboxRow(d, skey, smeta, p);
  // a workbook that is not the bill at all
  const bmeta = { kind: "sga", year: 2026, month: 8, item_id: "01BAD", name: "DG3 SGA EXCEL AUGUST'26.xlsx", path: "p", modified: "2026-09-02T00:00:00Z" };
  const bkey = inboxFileKey(bmeta.item_id, bmeta.modified);
  for (const p of inboxParts({ "SUMMARY MANNING": [["nothing", "here"]] })) inboxRow(d, bkey, bmeta, p);

  const r = await applyInbox(env);
  assert.equal(r.files, 3); assert.equal(r.waiting, 1, "the SGA file with a missing part waits");
  assert.equal(r.loaded.length, 1); assert.equal(r.loaded[0].kind, "travel"); assert.deepEqual(r.loaded[0].result, { ok: true, year: 2026, applied: 1 });
  assert.equal(r.errors.length, 1); assert.equal(r.errors[0].error, "no_header");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense WHERE year=2026").get().n, 1);
  assert.equal(d.prepare("SELECT ship, crew_name, air FROM travel_expense WHERE year=2026").get().ship, "Anthem");
  assert.deepEqual(d.prepare("SELECT file_key, status FROM sp_inbox GROUP BY file_key ORDER BY file_key").all().map((x) => ({ ...x })), [{ file_key: bkey, status: "error" }, { file_key: skey, status: "pending" }, { file_key: tkey, status: "ok" }]);
  assert.deepEqual(d.prepare("SELECT item_id, status FROM sp_sync ORDER BY item_id").all().map((x) => ({ ...x })), [{ item_id: "01BAD", status: "error" }, { item_id: "01TRAV", status: "ok" }]);
  // the missing part arrives: the SGA file loads on the next run
  inboxRow(d, skey, smeta, parts[parts.length - 1]);
  const r2 = await applyInbox(env);
  assert.equal(r2.loaded.length, 1); assert.equal(r2.loaded[0].kind, "sga"); assert.equal(r2.waiting, 0);
  assert.equal(d.prepare("SELECT status FROM sp_inbox WHERE file_key=? GROUP BY status").get(skey).status, "ok");
});

test("the cron calls applyInbox and the pickup script exists and refuses a usage error", async () => {
  const src = readFileSync(SRC, "utf-8");
  const sched = src.slice(src.indexOf("async scheduled(event, env, ctx)"), src.indexOf("/* ----------------------- auth helpers"));
  assert.match(sched, /applyInbox\(env\)/, "the hourly cron must drain the inbox");
  assert.match(src, /const ensureSpInbox = memoEnsure\(/, "the inbox DDL is memoized like every guard (§12)");
  assert.match(src, /if \(p === "\/api\/sharepoint\/inbox\/apply" && request\.method === "POST"\) return apiInboxApply\(env, session\);/);
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/sp_pickup.mjs", import.meta.url)), "--kind", "sga"], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout.trim()).reason, "usage");
});
