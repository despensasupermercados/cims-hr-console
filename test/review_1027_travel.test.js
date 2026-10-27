// REVIEW OF 27 OCT 2026 — the Travel tab, TDG's bill and the mail intake (Miguel: "fix code bugs .. logic issue .. gaps").
// Every test here FAILED on the code before the fix it pins. Pure helpers first; then the Worker's apply paths on real
// SQLite (node:sqlite), a real SheetJS workbook and the real postal-mime, the way test/sga_hold.test.js does it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import * as XLSX from "xlsx";
import { sgaPeriodFromName, sgaPeriodFromPath, num as sgaNum } from "../src/sga.js";
import { parseMonthSheet, isTravelSheet, monthNum, TRAVEL_SHEET_RE } from "../src/travel.js";
import { travelClientOf } from "../src/travel_match.js";
import { travelFromDump, dumpToSheets } from "../src/sp_inbox.js";
import { WANT_TRAVEL, sheetsOf, WANT_SGA } from "../src/sharepoint_sync.js";
import { intakeMail } from "../src/mail_intake.js";
import PostalMime from "postal-mime";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__rv1027t_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { ensureTravelImpl, TRAVEL_2025, applySgaWorkbook, sgaStage, syncDeps, apiTravelImport, intakeMailToInbox, applyInbox, archiveSourceFile, apiSga, APP_HTML };\n", "utf-8");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

// ---------------------------------------------------------------- the pure helpers

test("the bill's month is one of TDG's spellings, whole — a word that merely STARTS with a month's letters is no month", () => {
  assert.equal(sgaPeriodFromName("DG3 SGA EXCEL MARTINEZ 2026.xlsx"), null, "MARTINEZ is not March");
  assert.equal(sgaPeriodFromName("DG3 SGA EXCEL NOVO 2026.xlsx"), null, "NOVO is not November");
  // every spelling TDG has used still reads
  for (const [n, m] of [["DG3 SGA EXCEL FEBRUARY 2026.xlsx", 2], ["REVISED DG3 SGA EXCEL JULY'2026.xlsx", 7], ["DG3 SGA EXCEL SEPTEMBER'26.xlsx", 9], ["DG3 SGA EXCEL MARCH'26.xlsx", 3], ["DG3 SGA EXCEL SEPT 2026.xlsx", 9], ["DG3 SGA EXCEL AUG2025.xlsx", 8], ["NOVEMBER_2025 DG3 SGA EXCEL.xlsx", 11]])
    assert.equal((sgaPeriodFromName(n) || {}).month, m, n);
});

test("the month AFTER 'SGA EXCEL' is the bill's when the name carries another date", () => {
  assert.deepEqual(sgaPeriodFromName("FW DG3 SGA EXCEL AUGUST 2026 sent SEP 03 2026.xlsx"), { year: 2026, month: 8, source: "name" });
  assert.deepEqual(sgaPeriodFromName("sent SEP 03 2026 - DG3 SGA EXCEL AUGUST 2026.xlsx"), { year: 2026, month: 8, source: "name" }, "a date typed BEFORE the marker does not win");
});

test("the month folder still says the month when the path ends with the file itself (the sync's `path`)", () => {
  assert.deepEqual(sgaPeriodFromPath("1. ACCOUNTING/SGA/2026/02 February 2026/DG3 SGA EXCEL.xlsx"), { year: 2026, month: 2, source: "path" });
  assert.deepEqual(sgaPeriodFromPath("1. ACCOUNTING/SGA/2026/02 February 2026"), { year: 2026, month: 2, source: "path" }, "the folder alone, as before");
  assert.equal(sgaPeriodFromPath("1. ACCOUNTING/SGA/2026/02 February 2026/receipts/scan.pdf"), null, "a sub-folder is not the month folder");
});

test("Rita's workbook reads an accounting negative as a credit, like TDG's bill ('(138.46)' was +138.46)", () => {
  const r0 = ["", "", "", "", "", "", "", "", "CREW 1 / ON"];
  const r1 = ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"];
  const row = ["Anthem", 0, 0, 0, 0, 0, 0, "", "Caag, Haziel", "1,000.00", "(138.46)", 0, 0, 0, 0];
  const [rec] = parseMonthSheet("SEPT", [r0, r1, row], 2026);
  assert.equal(rec.hotel, -138.46);
  assert.equal(rec.total, 861.54);
  assert.equal(sgaNum("(138.46)"), -138.46, "the one reader, exported from sga.js");
});

test("a month sheet is any spelling of its month — SEP, September, APR — in every reader, not a name from one list", () => {
  for (const n of ["SEP", "September", " Sept ", "APR", "JUN", "JUL", "AUGUST", "CIMS"]) {
    assert.ok(isTravelSheet(n), n + " on the Upload page / the sync");
    assert.ok(WANT_TRAVEL(n), n + " on WANT_TRAVEL");
  }
  assert.ok(!isTravelSheet("SUMMARY") && !isTravelSheet("SUMMARY MANNING") && !WANT_TRAVEL("Sheet1"));
  assert.equal(monthNum("September"), 9);
  // the served page carries the server's own regex, not a thirteen-name list of its own
  assert.ok(W.APP_HTML.includes("var want=new RegExp('" + TRAVEL_SHEET_RE.source + "','i')"), "the page's filter is TRAVEL_SHEET_RE");
  assert.ok(!W.APP_HTML.includes("var want=['JAN','FEB'"), "the old list is gone");
  // the inbox: a dump whose month sheet is named SEP is a complete year, not a missing month
  const dump = ["JAN", "SEP"].map((n) => `=== Sheet: ${n} ===\nCrew\tAIR\n`).join("\n");
  const p = dumpToSheets(dump);
  if (p && p.complete && p.complete.length) {
    const t = travelFromDump({ ...p, missing: 0, cut: null });
    assert.equal(t.ok, true); assert.equal(t.months, 2, "SEP counts as a month sheet");
  }
});

test("a bare Azamara hull name is Azamara's on the Travel tab (it read Royal)", () => {
  assert.equal(travelClientOf("Quest", ""), "azamara");
  assert.equal(travelClientOf("Pursuit", ""), "azamara");
  assert.equal(travelClientOf("Azamara Journey", ""), "azamara");
  assert.equal(travelClientOf("Quantum", ""), "royal", "Quantum stays Royal");
  assert.equal(travelClientOf("Apex", ""), "celebrity");
});

// ---------------------------------------------------------------- the Worker on real SQLite

function envFor(d, { failFirstCount = false, log = [] } = {}) {
  let countFailed = false;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => { log.push(sql); return { results: d.prepare(sql).all(...args) }; },
    first: async () => {
      log.push(sql);
      if (failFirstCount && !countFailed && /SELECT COUNT\(\*\) total/.test(sql)) { countFailed = true; throw new Error("D1_ERROR: internal error"); }
      return d.prepare(sql).get(...args) ?? null;
    },
    run: async () => { log.push(sql); d.prepare(sql).run(...args); return { success: true }; },
  });
  const store = new Map();
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } },
    EXPORTS: { store, async put(k, b, o) { store.set(k, { o }); }, async get(k) { return store.has(k) ? { body: "bytes" } : null; } } };
}
const J = async (r) => JSON.parse(await r.text());
const LIVE = `CREATE TABLE travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, kind TEXT DEFAULT 'crew',
  crew_name TEXT, ship TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, other REAL DEFAULT 0, total REAL);
  CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);
  CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag');`;

test("a COUNT that fails for a moment on a POPULATED travel table never re-seeds 2025 over it", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(LIVE);
  d.exec("INSERT INTO travel_expense (id,year,month,kind,crew_name,ship,total) VALUES ('t1',2025,3,'crew','Caag, Haziel','Anthem',10),('t2',2026,2,'crew','X','Apex',20);");
  const log = [];
  await W.ensureTravelImpl(envFor(d, { failFirstCount: true, log }));
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense").get().n, 2, "the rows stand");
  assert.equal(d.prepare("SELECT ship FROM travel_expense WHERE id='t1'").get().ship, "Anthem", "Rita's re-uploaded 2025 row keeps its ship");
  assert.ok(!log.some((q) => /^\s*DELETE/i.test(q)), "no DELETE on a transient error: " + log.filter((q) => /DELETE|INSERT/i.test(q)).join(" | "));
});

test("a fresh or legacy table is still seeded (the migrate-once path is the missing column / table, not any error)", async () => {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE travel_expense (id TEXT PRIMARY KEY, year INTEGER, month INTEGER, leg TEXT, crew_name TEXT, air REAL, hotel REAL, medical REAL, visa REAL, food REAL, transport REAL, total REAL); CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);");
  d.exec("INSERT INTO travel_expense (id,year,month,total) VALUES ('old1',2025,1,5);");
  await W.ensureTravelImpl(envFor(d));
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense").get().n, W.TRAVEL_2025.length, "the legacy table is migrated and seeded, as before");
});

// October's bill as a staged workbook: `lines` rows of $100 each; TDG's GRAND TOTAL agrees
const H = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"];
const GT = (v) => ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", v];
function sgaBook(lines, extra = {}) {
  const rows = [[], ["", "DATE", ":", "November 02, 2026"], ["", "SGA NO.", ":", "40-A"], H, ["", "1. ROYAL VESSELS"]];
  for (let i = 0; i < lines; i++) rows.push(["", "ANT-2026-09-40-" + String(i + 1).padStart(2, "0"), "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", 60, "", 40, "", "", "", "", "", "", "", "", "", 100]);
  rows.push(GT(lines * 100));
  return { sheets: { "SUMMARY MANNING": rows }, name: "DG3 SGA EXCEL OCTOBER'26.xlsx", hash: "h" + lines, ...extra };
}
const SGA_DDL = "CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT); CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag');";

test("a bill replaces its month in the LAST batch: the new lines go in first, the old ones leave with the file row", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(SGA_DDL);
  const env = envFor(d);
  await W.applySgaWorkbook(env, sgaBook(3), null, "rita", "upload");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 3);
  // the second load dies on its SECOND batch (150 lines → batches of 100): the month must still be whole from the first file
  let batches = 0;
  const dying = { ...env, DB: { ...env.DB, batch: async (st) => { batches++; if (batches === 2) throw new Error("D1_ERROR: lost"); return env.DB.batch(st); } } };
  await assert.rejects(W.applySgaWorkbook(dying, sgaBook(150, { hash: "h150" }), null, "rita", "upload"));
  const files = d.prepare("SELECT id, rows FROM sga_file ORDER BY loaded_at").all();
  assert.equal(files.length, 1, "no file row for the load that died");
  const live = d.prepare("SELECT COUNT(*) n FROM sga_line WHERE file_id=?").get(files[0].id).n;
  assert.equal(live, 3, "the first file's lines are untouched — the DELETE never ran");
  const s = await J(await W.apiSga(env));
  assert.equal(s.lines.length, 3, "/api/sga serves the month from the file on record, never the orphan lines");
  // a load that completes replaces the month, and the older lines are gone
  await W.applySgaWorkbook(env, sgaBook(2, { hash: "h2" }), null, "rita", "upload");
  const s2 = await J(await W.apiSga(env));
  assert.equal(s2.lines.length, 2);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line l JOIN sga_file f ON f.id=l.file_id WHERE f.year=2026 AND f.month=10").get().n, 2, "one file's lines for the month");
});

test("the inbox HOLDS Rita's workbook when it lacks a month the year on file already has; her own Upload says so in the dry-run", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(LIVE);
  d.exec("INSERT INTO travel_expense (id,year,month,kind,crew_name,ship,total,air) VALUES ('t1',2026,8,'crew','Caag, Haziel','Anthem',500,500),('t2',2026,9,'crew','Caag, Haziel','Anthem',300,300);");
  const env = envFor(d);
  const r0 = ["", "", "", "", "", "", "", "", "CREW 1 / ON"], r1 = ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"];
  const sheets = { AUG: [r0, r1, ["Anthem", 0, 0, 0, 0, 0, 0, "", "Caag, Haziel", 400, 0, 0, 0, 0, 0]] };   // the September sheet is gone
  // the inbox path (the mail intake, the agent's rows) holds it
  const held = await W.syncDeps(env).applyTravel(sheets, 2026, { by: "email:x@dg3.com", source: "agent", holdUnreconciled: true });
  assert.deepEqual(held, { held: "months_missing", year: 2026, missing: [9] });
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense WHERE year=2026").get().n, 2, "nothing loaded, September stands");
  // Rita's dry-run names the months this workbook has and the one it would remove
  const dry = await J(await W.apiTravelImport(new Request("https://x/api/travel/import", { method: "POST", body: JSON.stringify({ sheets, year: 2026, dryRun: true }) }), env, { email: "rita@dg3.com" }));
  assert.deepEqual(dry.months, [8]); assert.deepEqual(dry.missing, [9]);
  // a workbook that carries the month (even empty) is not held; the SharePoint sync path (no hold flag) applies as before
  const full = { ...sheets, SEPT: [r0, r1] };
  const ok = await W.syncDeps(env).applyTravel(full, 2026, { by: "email:x@dg3.com", source: "agent", holdUnreconciled: true });
  assert.equal(ok.ok, true); assert.equal(ok.applied, 1);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense WHERE year=2026").get().n, 1, "the year is replaced whole by a whole workbook");
});

// a real workbook + MIME for the mail intake
function sgaXlsx(grand) {
  const wb = XLSX.utils.book_new();
  const rows = [[], ["", "DATE", ":", "November 02, 2026"], ["", "SGA NO.", ":", "40-A"], H, ["", "1. ROYAL VESSELS"],
    ["", "ANT-2026-09-40-01", "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", 534.4, "", 52, 78.12, 120, 30, "", 614, "", "", "", "", 1428.52],
    GT(grand)];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SUMMARY MANNING");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/(.{76})/g, "$1\r\n");
function mime(from, name, buf) {
  const B = "----=_cims_" + Math.random().toString(36).slice(2);
  return `From: ${from}\r\nTo: sga@cims.work\r\nSubject: SGA October\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@tdg>\r\nDate: Mon, 02 Nov 2026 03:11:09 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B}"\r\n\r\n--${B}\r\nContent-Type: text/plain\r\n\r\nSGA attached.\r\n\r\n--${B}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(buf)}\r\n\r\n--${B}--\r\n`;
}
const msg = (raw, from) => ({ from, to: "sga@cims.work", raw: new Blob([raw]).stream(), headers: new Map([["subject", "SGA October"]]) });
const NAME = "DG3 SGA EXCEL OCTOBER'26.xlsx";
const sha = async (buf) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf))).map((b) => b.toString(16).padStart(2, "0")).join("");

test("a bill Rita already loaded on Upload data, then emailed by Finance, is archived and receipted — never applied again", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(SGA_DDL);
  const env = envFor(d);
  const bytes = sgaXlsx(1428.52);
  const hash = await sha(bytes);
  // Rita's Upload: the page sends the sheets and stamps the file's SHA-256 (the page's hash) on sga_file
  const st = await W.sgaStage(env, { sheets: sheetsOf(XLSX, bytes, WANT_SGA), name: NAME, hash });
  await W.applySgaWorkbook(env, { name: NAME, hash }, st, "rita@dg3.com", "upload");
  const before = d.prepare("SELECT id, loaded_at FROM sga_file").all();
  assert.equal(before.length, 1);
  // Finance emails the same workbook
  const r = await W.intakeMailToInbox(env, msg(mime("finance@dg3.com", NAME, bytes), "finance@dg3.com"), null);
  assert.equal(r.outcome, "already_loaded");
  assert.equal(r.files[0].status, "already_loaded");
  assert.deepEqual(d.prepare("SELECT id FROM sga_file").all().map(({ id }) => ({ id })), before.map(({ id }) => ({ id })), "the month is not replaced with itself");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sp_inbox").get().n, 0, "nothing queued");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_source_file WHERE hash=? AND r2_key IS NOT NULL").get(hash).n, 1, "the original is kept");
});

test("the archive never loses a value it already knew: the inbox link survives Rita's re-upload, the kept object survives a re-send", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(SGA_DDL);
  const env = envFor(d);
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  const a = await W.archiveSourceFile(env, bytes, { name: NAME, kind: "sga", year: 2026, month: 10, source: "email", by: "email:f@dg3.com", file_key: "mail:abc@abc" });
  assert.ok(a.kept);
  // Rita's Upload sends no file_key and no month would be a loss too
  await W.archiveSourceFile(env, bytes, { name: NAME, kind: "sga", year: 2026, month: null, source: "upload", by: "rita@dg3.com" });
  let row = d.prepare("SELECT * FROM sga_source_file WHERE hash=?").get(a.hash);
  assert.equal(row.file_key, "mail:abc@abc", "the inbox link is kept");
  assert.equal(row.month, 10, "the month is kept");
  assert.equal(row.by, "rita@dg3.com", "who sent the bytes last is refreshed, as documented");
  assert.equal(row.r2_key, a.r2_key);
  // a re-send whose bucket write fails keeps the object already kept, and no note
  const noR2 = { ...env, EXPORTS: { async put() { throw new Error("R2 down"); }, async get() { return null; } } };
  const b = await W.archiveSourceFile(noR2, bytes, { name: NAME, kind: "sga", year: 2026, month: 10, source: "email", by: "email:f@dg3.com", file_key: "mail:abc@abc" });
  assert.ok(b.kept, "kept by the row already holding the bytes");
  row = d.prepare("SELECT * FROM sga_source_file WHERE hash=?").get(a.hash);
  assert.equal(row.r2_key, a.r2_key); assert.equal(row.note, null);
});

test("a workbook SheetJS cannot open is receipted `unreadable` and its bytes kept; the rest of the mail still loads", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(SGA_DDL);
  const env = envFor(d);
  const good = sgaXlsx(1428.52);
  // a zip header followed by rubbish: SheetJS throws ("Unsupported ZIP encryption"); plain text it would read as one sheet
  const bad = new Uint8Array(64); bad.set([0x50, 0x4b, 0x03, 0x04]); for (let i = 4; i < 64; i++) bad[i] = (i * 37) & 255;
  const B = "----=_cims_x";
  const raw = `From: finance@dg3.com\r\nTo: sga@cims.work\r\nSubject: SGA\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B}"\r\n\r\n--${B}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="DG3 SGA EXCEL SEPTEMBER'26.xlsx"\r\nContent-Disposition: attachment; filename="DG3 SGA EXCEL SEPTEMBER'26.xlsx"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(bad.buffer)}\r\n\r\n--${B}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${NAME}"\r\nContent-Disposition: attachment; filename="${NAME}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(good)}\r\n\r\n--${B}--\r\n`;
  const r = await W.intakeMailToInbox(env, msg(raw, "finance@dg3.com"), null);
  const byName = Object.fromEntries(r.files.map((f) => [f.name, f]));
  assert.equal(byName["DG3 SGA EXCEL SEPTEMBER'26.xlsx"].status, "unreadable");
  assert.ok(byName["DG3 SGA EXCEL SEPTEMBER'26.xlsx"].error, "the receipt says why");
  assert.equal(byName[NAME].status, "pending", "the good workbook is queued");
  assert.equal(r.outcome, "queued");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_source_file WHERE r2_key IS NOT NULL").get().n, 2, "both originals kept");
  assert.equal(d.prepare("SELECT outcome FROM mail_intake").get().outcome, "queued", "a receipt exists — it used to throw before writing one");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 1, "October loaded");
});

test("the sender gate reads the envelope too: a dg3.com header From under an unlisted envelope sender is held", async () => {
  const deps = { parse: (b) => PostalMime.parse(b), XLSX, sheetsOf, wantSga: WANT_SGA, wantTravel: WANT_TRAVEL, now: Date.now() };
  const bytes = sgaXlsx(1428.52);
  const spoof = await intakeMail({}, mime("rita.berenyi@dg3.com", NAME, bytes), { from: "anyone@example.org" }, deps);
  assert.equal(spoof.allowed, false); assert.equal(spoof.files[0].status, "held");
  assert.equal(spoof.envelope, "anyone@example.org", "the receipt names the envelope sender");
  const same = await intakeMail({}, mime("rita.berenyi@dg3.com", NAME, bytes), { from: "rita.berenyi@dg3.com" }, deps);
  assert.equal(same.allowed, true); assert.equal(same.envelope, null);
  const relay = await intakeMail({}, mime("finance@tdgcrew.com", NAME, bytes), { from: "bounce@dg3.com" }, { ...deps });
  assert.equal(relay.allowed, false, "the header's domain is not listed — the envelope alone does not let it in");
  const listed = await intakeMail({ SGA_MAIL_SENDERS: "dg3.com, tdgcrew.com" }, mime("finance@tdgcrew.com", NAME, bytes), { from: "bounce@dg3.com" }, deps);
  assert.equal(listed.allowed, true, "both listed → allowed");
});
