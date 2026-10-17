// AN EMAILED BILL THAT DOES NOT RECONCILE IS HELD FOR RITA (Miguel, 17 Oct 2026: "Hold it for Rita"). A workbook that arrives
// by itself (sga@cims.work → the inbox) whose lines do not add up to TDG's GRAND TOTAL loads nothing: its inbox rows are
// `unreconciled`, sp_sync says `held`, /api/sga names it (with the gap and the kept original), and the Travel tab's Needs a
// decision carries it until a bill for that month is loaded after it — Rita's Upload (dry-run, the amber chip, Apply).
// Real MIME, the real postal-mime, a real SheetJS workbook, real SQLite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import * as XLSX from "xlsx";
import { sheetsOf, WANT_SGA } from "../src/sharepoint_sync.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__sgahold_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { intakeMailToInbox, applyInbox, apiSga, apiSgaImport };\n", "utf-8");
let intakeMailToInbox, applyInbox, apiSga, apiSgaImport;
try { ({ intakeMailToInbox, applyInbox, apiSga, apiSgaImport } = await import(TMP.href)); } finally { unlinkSync(TMP); }

function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  const store = new Map();
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } },
    EXPORTS: { store, async put(k, b, o) { store.set(k, { o }); }, async get(k) { return store.has(k) ? { body: "bytes" } : null; } } };
}
const J = async (r) => JSON.parse(await r.text());
// October's bill: one line of $1,428.52; TDG's GRAND TOTAL says `grand`
function sgaXlsx(grand) {
  const wb = XLSX.utils.book_new();
  const H = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"];
  const rows = [[], ["", "DATE", ":", "November 02, 2026"], ["", "SGA NO.", ":", "40-A"], H, ["", "1. ROYAL VESSELS"],
    ["", "ANT-2026-09-40-01", "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", 534.4, "", 52, 78.12, 120, 30, "", 614, "", "", "", "", 1428.52],
    ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", grand]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SUMMARY MANNING");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/(.{76})/g, "$1\r\n");
function mime(from, name, buf) {
  const B = "----=_cims_" + Math.random().toString(36).slice(2);
  return `From: ${from}\r\nTo: sga@cims.work\r\nSubject: SGA October\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@tdg>\r\nDate: Mon, 02 Nov 2026 03:11:09 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B}"\r\n\r\n--${B}\r\nContent-Type: text/plain\r\n\r\nSGA attached.\r\n\r\n--${B}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(buf)}\r\n\r\n--${B}--\r\n`;
}
const msg = (raw, from) => ({ from, to: "sga@cims.work", raw: new Blob([raw]).stream(), headers: new Map([["subject", "SGA October"]]) });
const CREW = "CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag'); CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);";
const NAME = "DG3 SGA EXCEL OCTOBER'26.xlsx";

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("an emailed bill whose lines miss TDG's grand total loads nothing, is held and named; Rita's Upload clears it", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  const r = await intakeMailToInbox(env, msg(mime("rita.berenyi@dg3.com", NAME, sgaXlsx(1500)), "rita.berenyi@dg3.com"), null);
  assert.equal(r.outcome, "queued", "the mail itself is accepted (a listed sender)");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 0, "the month's lines are not loaded");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_file").get().n, 0, "no bill on file");
  assert.deepEqual(d.prepare("SELECT DISTINCT status FROM sp_inbox").all().map((x) => x.status), ["unreconciled"]);
  assert.deepEqual(d.prepare("SELECT kind, status FROM sp_sync").all().map((x) => ({ ...x })), [{ kind: "sga", status: "held" }]);
  // /api/sga names it, with the gap and the kept original
  let s = await J(await apiSga(env));
  assert.equal(s.held.length, 1);
  const h = s.held[0];
  assert.deepEqual([h.year, h.month, h.lines_total, h.grand_total, h.gap, h.rows], [2026, 10, 1428.52, 1500, 71.48, 1]);
  assert.equal(h.name, NAME); assert.equal(h.hash.length, 64, "the original is in the bucket: the Travel tab offers it to download");
  // the same mail again is held again — never loaded, never doubled
  await intakeMailToInbox(env, msg(mime("rita.berenyi@dg3.com", NAME, sgaXlsx(1500)), "rita.berenyi@dg3.com"), null);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 0);
  assert.equal((await J(await apiSga(env))).held.length, 1);
  // Rita checks it and loads it by hand on Upload data (the dry-run says it does not reconcile; Apply still loads)
  const sheets = sheetsOf(XLSX, sgaXlsx(1500), WANT_SGA);
  const req = (body) => new Request("https://cims.work/api/sga/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const dry = await J(await apiSgaImport(req({ sheets, name: NAME, dryRun: true }), env, { email: "rita.berenyi@dg3.com" }));
  assert.equal(dry.reconciles, false);
  await new Promise((res) => setTimeout(res, 5));
  const app = await J(await apiSgaImport(req({ sheets, name: NAME }), env, { email: "rita.berenyi@dg3.com" }));
  assert.equal(app.ok, true); assert.equal(app.reconciles, false);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=10").get().n, 1);
  s = await J(await apiSga(env));
  assert.equal(s.held.length, 0, "a bill for that month loaded after the hold: no longer named");
});

test("a bill that reconciles still loads by itself, as before", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  await intakeMailToInbox(env, msg(mime("rita.berenyi@dg3.com", NAME, sgaXlsx(1428.52)), "rita.berenyi@dg3.com"), null);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=10").get().n, 1);
  assert.deepEqual(d.prepare("SELECT DISTINCT status FROM sp_inbox").all().map((x) => x.status), ["ok"]);
  assert.equal((await J(await apiSga(env))).held.length, 0);
  const rep = await applyInbox(env);
  assert.equal(rep.files, 0, "nothing left pending");
});

test("the Travel tab's Needs a decision names a held bill of its year, with the download", () => {
  const src = readFileSync(SRC, "utf-8");
  const i = src.indexOf("function tvDecisions(ctx){");
  const body = src.slice(i, src.indexOf("\nfunction tvInitials(", i));
  assert.match(body, /\(\(SGA&&SGA\.held\)\|\|\[\]\)\.filter\(function\(x\)\{return x\.year===LY;\}\)/);
  assert.match(body, /is held: its lines do not add up/);
  assert.match(body, /\/api\/sga\/file\?hash=/);
  // the hold is the inbox's only: the dormant Graph sync and the Upload page load as before
  const inbox = src.slice(src.indexOf("async function applyInbox("), src.indexOf("// ---- THE MAIL INTAKE"));
  assert.match(inbox, /holdUnreconciled: true/);
  assert.equal((src.match(/holdUnreconciled: true/g) || []).length, 1);
});
