// THE MAIL INTAKE (src/mail_intake.js, worker.js intakeMailToInbox; Miguel, 15 Oct 2026: "give me an email where finance
// can send u this"). A real MIME message with a real SheetJS workbook attached, parsed by the real postal-mime, lands in
// sp_inbox and loads through applyInbox on real SQLite; the PDF and the body are ignored; an unknown sender is HELD.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import * as XLSX from "xlsx";
import PostalMime from "postal-mime";
import { bareAddress, isIntakeMail, senderAllowed, pickAttachments, yearFromName, intakeMail, sha256Hex } from "../src/mail_intake.js";
import { sheetsOf, WANT_SGA, WANT_TRAVEL } from "../src/sharepoint_sync.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = new URL("../src/worker.js", import.meta.url);
const TMP = new URL(`../src/__mail_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, readFileSync(SRC, "utf-8") + "\nexport { intakeMailToInbox, applyInbox, apiSharePointStatus, acceptIntakeMail, processStoredMail };\n", "utf-8");
let intakeMailToInbox, applyInbox, apiSharePointStatus, acceptIntakeMail, processStoredMail, worker;
try { ({ intakeMailToInbox, applyInbox, apiSharePointStatus, acceptIntakeMail, processStoredMail, default: worker } = await import(TMP.href)); } finally { unlinkSync(TMP); }

function envFor(d, vars = {}) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } }, EXPORTS: r2Fake(), ...vars };
}
// the EXPORTS bucket as the archive sees it: put / get on a Map
function r2Fake() {
  const store = new Map();
  return { store, async put(key, bytes, opts) { store.set(key, { bytes: bytes.byteLength ?? bytes.length, opts }); }, async get(key) { return store.has(key) ? { body: "bytes" } : null; } };
}
const J = async (r) => JSON.parse(await r.text());

// a bill: the three sheets the console reads, plus noise sheets
function sgaXlsx() {
  const wb = XLSX.utils.book_new();
  const H = ["", "REF. NO.", "", "CREW", "CREW", "VESSELS", "", "", "", "HOME ALLOTMENT", "FINAL PAY", "MANNING FEE/ AGENCY FEE", "SOCIAL COSTS", "JOINING FEE", "ACCOUNTING FEE", "TRANSITION FEE", "TRAVEL /PLANEFARE", "MEDICAL", "MEDICAL REPAT", "VISA", "HOTEL", "AMOUNT"];
  const rows = [[], ["", "DATE", ":", "November 02, 2026"], ["", "SGA NO.", ":", "40-A"], H, ["", "1. ROYAL VESSELS"],
    ["", "ANT-2026-09-40-01", "", "CAAG, HAZIEL", "CAAG, HAZIEL", "", "ANTHEM OF THE SEAS", "", "", 534.4, "", 52, 78.12, 120, 30, "", 614, "", "", "", "", 1428.52],
    ["", "", "", "", "", "", "", "", "GRAND TOTAL", "", "", "", "", "", "", "", "", "", "", "", "", 1428.52]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SGA SUMMARY — noise"]]), "SGA SUMMARY WITH SBP ");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["2026", "HOME ALLOTMENT", "TRAVEL/ PLANEFARE", "BANK CHARGE/ COURIER", "TRAINING RELATED", "TOTAL"], ["OCTOBER", 534.4, 614, 0, 100, 1528.52]]), "2026 SUMMARY (2)");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "SUMMARY MANNING");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["2026", "RENTAL FEE", "UTILITIES", "HOTEL", "PLANEFARE", "OTHER EXPENSES", "BANK CHARGES", "TOTAL"], ["OCTOBER", 50, 20, 10, 10, 10, "", 100]]), "2026 SUMMARY TRAINREL");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
function travelXlsx() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Oct-26", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANSPORT", "", "CREW 1 / ON"], ["", "", "", "", "", "", "", "", "Crew", "AIR", "HOTEL", "MEDICAL", "VISA", "FOOD", "TRANS"], ["Anthem", 614, 0, 0, 0, 0, 0, "", "Caag, Haziel", 614, 0, 0, 0, 0, 0]]), "OCT");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["SUMMARY — ignored"]]), "SUMMARY");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/(.{76})/g, "$1\r\n");
// a real multipart/mixed message as Email Routing hands it over
function mime({ from, to = "sga@cims.work", subject, attachments }) {
  const B = "----=_cims_" + Math.random().toString(36).slice(2);
  let m = `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@tdg>\r\nDate: Mon, 02 Nov 2026 03:11:09 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B}"\r\n\r\n--${B}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nGood day, please find attached the SGA for October.\r\n\r\n`;
  for (const a of attachments) m += `--${B}\r\nContent-Type: ${a.type}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(a.buf)}\r\n\r\n`;
  return m + `--${B}--\r\n`;
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const deps = { parse: (b) => PostalMime.parse(b), XLSX, sheetsOf, wantSga: WANT_SGA, wantTravel: WANT_TRAVEL, now: Date.parse("2026-11-02T03:12:00Z") };
const fakeMessage = (raw, from, to = "sga@cims.work", subject = "SGA") => ({ from, to, raw: new Blob([raw]).stream(), headers: new Map([["subject", subject]]) });

test("node:sqlite is available", () => { assert.ok(DatabaseSync); });

test("addresses, the intake address and the sender list", () => {
  assert.equal(bareAddress("Jodynne Barrientos <Jodynne.Barrientos@TDGcrew.com>"), "jodynne.barrientos@tdgcrew.com");
  assert.equal(isIntakeMail({ to: "SGA@cims.work" }, {}), true, "the default address, case ignored");
  assert.equal(isIntakeMail({ to: "crew-reports@cims.work" }, {}), false, "the intel inbox is not the intake");
  assert.equal(isIntakeMail({ to: "bills@cims.work" }, { MAIL_SGA_TO: "bills@cims.work" }), true);
  assert.equal(senderAllowed("rita.berenyi@dg3.com", {}), true, "dg3.com by default");
  assert.equal(senderAllowed("x@mail.dg3.com", {}), true, "sub-domains of a listed domain");
  assert.equal(senderAllowed("accounting@tdgcrew.com", {}), false, "TDG is not on the default list");
  assert.equal(senderAllowed("accounting@tdgcrew.com", { SGA_MAIL_SENDERS: "dg3.com, tdgcrew.com" }), true);
  assert.equal(senderAllowed("someone@tdgcrew.com", { SGA_MAIL_SENDERS: "dg3.com, accounting@tdgcrew.com" }), false, "an address entry is that address only");
  assert.equal(senderAllowed("notdg3.com@evil.example", {}), false);
  assert.equal(yearFromName("UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx"), 2026);
});

test("pickAttachments takes the SGA and travel workbooks only, REVISED over plain for the same month, PDFs ignored", () => {
  const atts = [
    { filename: "TRAINING RELATED COSTS OCTOBER'26.pdf", mimeType: "application/pdf" },
    { filename: "DG3 SGA EXCEL OCTOBER'26.xlsx", mimeType: XLSX_MIME },
    { filename: "REVISED DG3 SGA EXCEL OCTOBER'26.xlsx", mimeType: XLSX_MIME },
    { filename: "DG3 SGA EXCEL SEPTEMBER'26.xlsx", mimeType: XLSX_MIME },
    { filename: "UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", mimeType: XLSX_MIME },
    { filename: "Budget notes.xlsx", mimeType: XLSX_MIME },
    { filename: "image001.png", mimeType: "image/png" },
  ];
  const { take, ignored } = pickAttachments(atts);
  assert.deepEqual(take.map((t) => [t.att.filename, t.kind, t.year, t.month]).sort(), [
    ["DG3 SGA EXCEL SEPTEMBER'26.xlsx", "sga", 2026, 9], ["REVISED DG3 SGA EXCEL OCTOBER'26.xlsx", "sga", 2026, 10], ["UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", "travel", 2026, null],
  ].sort());
  assert.ok(ignored.includes("TRAINING RELATED COSTS OCTOBER'26.pdf")); assert.ok(ignored.includes("Budget notes.xlsx")); assert.ok(ignored.includes("image001.png"));
  assert.ok(ignored.some((n) => n.startsWith("DG3 SGA EXCEL OCTOBER'26.xlsx (a REVISED")), "the plain October file loses to its REVISED twin");
});

test("intakeMail: a real MIME with the bill attached becomes inbox rows; the PDF and the body are ignored", async () => {
  const raw = mime({ from: "Rita Berenyi <rita.berenyi@dg3.com>", subject: "FW: SGA October 2026", attachments: [
    { name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }, { name: "TRAINING RELATED COSTS OCTOBER'26.pdf", type: "application/pdf", buf: new Uint8Array([37, 80, 68, 70]) }] });
  const r = await intakeMail({}, raw, { from: "rita.berenyi@dg3.com" }, deps);
  assert.equal(r.from, "rita.berenyi@dg3.com"); assert.equal(r.allowed, true); assert.equal(r.subject, "FW: SGA October 2026");
  assert.equal(r.files.length, 1); assert.deepEqual(r.ignored, ["TRAINING RELATED COSTS OCTOBER'26.pdf"]);
  const f = r.files[0];
  assert.equal(f.kind, "sga"); assert.equal(f.year, 2026); assert.equal(f.month, 10); assert.equal(f.status, "pending"); assert.equal(f.hash.length, 64);
  assert.deepEqual([...new Set(f.inbox.map((x) => x.sheet))].sort(), ["2026 SUMMARY (2)", "2026 SUMMARY TRAINREL", "SUMMARY MANNING"], "only the three sheets the console reads");
  assert.ok(f.inbox.every((x) => x.file_parts === f.inbox.length && x.path === "email:rita.berenyi@dg3.com" && x.status === "pending"));
  // the same file from someone not on the list is HELD
  const h = await intakeMail({}, mime({ from: "accounting@tdgcrew.com", subject: "SGA", attachments: [{ name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }] }), {}, deps);
  assert.equal(h.allowed, false); assert.equal(h.files[0].status, "held"); assert.ok(h.files[0].inbox.every((x) => x.status === "held"));
  assert.equal(h.files[0].hash, f.hash, "the same bytes are the same file");
  assert.equal((await sha256Hex(new Uint8Array([1, 2, 3]))).length, 64);
});

const CREW = "CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT); INSERT INTO crew VALUES ('SC-0045584','Haziel','Caag'); CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT);";

test("the Worker: a mail to sga@cims.work loads the month through the inbox at once; the receipt is kept; the status route shows it", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  const raw = mime({ from: "rita.berenyi@dg3.com", subject: "SGA October", attachments: [{ name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }, { name: "UPDATED - Travel Expenses 2026 RCCL & AZAMARA & CELEBRITY.xlsx", type: XLSX_MIME, buf: travelXlsx() }] });
  const r = await intakeMailToInbox(env, fakeMessage(raw, "rita.berenyi@dg3.com"), null /* no ctx: the apply runs inline */);
  assert.equal(r.outcome, "queued"); assert.equal(r.files.length, 2);
  // applied: the bill's month and the travel year are on their tables, through the same apply paths
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE year=2026 AND month=10").get().n, 1);
  assert.equal(d.prepare("SELECT source, rows FROM sga_file WHERE month=10").get().source, "agent");
  assert.equal(d.prepare("SELECT total FROM training_cost WHERE year=2026 AND month=10").get().total, 100);
  assert.equal(d.prepare("SELECT crew_total FROM sga_summary WHERE year=2026 AND month=10").get().crew_total, 1428.52);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM travel_expense WHERE year=2026 AND month=10").get().n, 1);
  assert.deepEqual(d.prepare("SELECT status, COUNT(DISTINCT file_key) f FROM sp_inbox GROUP BY status").all().map((x) => ({ ...x })), [{ status: "ok", f: 2 }]);
  assert.deepEqual(d.prepare("SELECT kind, status FROM sp_sync ORDER BY kind").all().map((x) => ({ ...x })), [{ kind: "sga", status: "ok" }, { kind: "travel", status: "ok" }]);
  const rec = { ...d.prepare("SELECT from_addr, to_addr, allowed, outcome FROM mail_intake").get() };
  assert.deepEqual(rec, { from_addr: "rita.berenyi@dg3.com", to_addr: "sga@cims.work", allowed: 1, outcome: "queued" });
  const st = await J(await apiSharePointStatus(env));
  assert.equal(st.mail.to, "sga@cims.work"); assert.equal(st.mail.recent.length, 1); assert.equal(st.mail.recent[0].files.length, 2); assert.equal(st.inbox.ok, 2);
  // THE ARCHIVE (15 Oct 2026, "I dont wanna lose this"): both originals are in the bucket under their own keys and on sga_source_file
  const src = d.prepare("SELECT hash, name, kind, year, month, bytes, r2_key, bucket, source, by, file_key FROM sga_source_file ORDER BY kind").all().map((x) => ({ ...x }));
  assert.equal(src.length, 2);
  assert.equal(src[0].kind, "sga"); assert.equal(src[0].year, 2026); assert.equal(src[0].month, 10); assert.equal(src[0].source, "email"); assert.equal(src[0].by, "email:rita.berenyi@dg3.com");
  assert.match(src[0].r2_key, /^sga-archive\/sga\/2026\/10\/[0-9a-f]{16}-DG3_SGA_EXCEL_OCTOBER_26\.xlsx$/); assert.equal(src[0].bucket, "cims-hr-exports");
  assert.equal(src[0].file_key, "mail:" + src[0].hash.slice(0, 16) + "@" + src[0].hash.slice(0, 16), "the archive row and the inbox rows share the file's identity");
  assert.equal(src[0].file_key, d.prepare("SELECT file_hash FROM sga_file WHERE month=10").get().file_hash, "and so does the bill on file");
  assert.match(src[1].r2_key, /^sga-archive\/travel\/2026\/[0-9a-f]{16}-UPDATED_-_Travel_Expenses_2026/); assert.ok(src[1].bytes > 1000);
  assert.equal(env.EXPORTS.store.size, 2); assert.equal(env.EXPORTS.store.get(src[0].r2_key).opts.customMetadata.sha256, src[0].hash);
  assert.ok(r.files.every((f) => f.archived === true && !("bytes" in f)), "the receipt says kept and never carries the bytes");
  assert.equal(JSON.parse(d.prepare("SELECT files_json FROM mail_intake").get().files_json)[0].archived, true);
  // the same mail again: same bytes → same key, already loaded → archived and receipted, NOT queued again (the month is not re-applied)
  const r2 = await intakeMailToInbox(env, fakeMessage(raw, "rita.berenyi@dg3.com"), null);
  assert.equal(r2.outcome, "already_loaded"); assert.ok(r2.files.every((f) => f.status === "already_loaded"));
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE year=2026 AND month=10").get().n, 1, "not appended");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_file").get().n, 1, "not re-applied");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sp_inbox WHERE status='pending'").get().n, 0);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM mail_intake").get().n, 2);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_source_file").get().n, 2, "one archive row per file, refreshed not duplicated");
});

test("the archive without a bucket: the row says the bytes were not kept; a row that holds the bytes is never downgraded", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const raw = mime({ from: "rita.berenyi@dg3.com", subject: "SGA October", attachments: [{ name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }] });
  const noBucket = envFor(d, { EXPORTS: undefined });
  const r = await intakeMailToInbox(noBucket, fakeMessage(raw, "rita.berenyi@dg3.com"), null);
  assert.equal(r.outcome, "queued"); assert.equal(r.files[0].archived, false); assert.match(r.files[0].archive_error, /no EXPORTS bucket/);
  const row = { ...d.prepare("SELECT r2_key, note FROM sga_source_file").get() };
  assert.equal(row.r2_key, null); assert.match(row.note, /Bytes not kept: no EXPORTS bucket/);
  // the bucket comes back: the next mail with the same file keeps the bytes and clears the note
  const withBucket = envFor(d);
  const r2 = await intakeMailToInbox(withBucket, fakeMessage(raw, "rita.berenyi@dg3.com"), null);
  assert.equal(r2.outcome, "already_loaded"); assert.equal(r2.files[0].archived, true);
  const row2 = { ...d.prepare("SELECT r2_key, note FROM sga_source_file").get() };
  assert.match(row2.r2_key, /^sga-archive\/sga\/2026\/10\//); assert.equal(row2.note, null);
  // and a later failure to put never downgrades it
  const failing = envFor(d, { EXPORTS: { store: new Map(), async put() { throw new Error("R2 down"); }, async get() { return null; } } });
  const r3 = await intakeMailToInbox(failing, fakeMessage(raw, "rita.berenyi@dg3.com"), null);
  assert.equal(r3.files[0].archived, true, "the bytes already in the bucket count");
  assert.equal({ ...d.prepare("SELECT r2_key FROM sga_source_file").get() }.r2_key, row2.r2_key);
});

test("the Worker: an unknown sender is held and loads nothing; a mail with no workbook is a receipt only", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = envFor(d);
  const raw = mime({ from: "accounting@tdgcrew.com", subject: "SGA October", attachments: [{ name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }] });
  const r = await intakeMailToInbox(env, fakeMessage(raw, "accounting@tdgcrew.com"), null);
  assert.equal(r.outcome, "held");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sp_inbox WHERE status='held'").get().n > 0, true);
  await applyInbox(env);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 0, "held rows are never applied");
  assert.equal(d.prepare("SELECT outcome FROM mail_intake").get().outcome, "held");
  // now Miguel lists TDG: the same mail queues and loads
  const env2 = envFor(d, { SGA_MAIL_SENDERS: "dg3.com, tdgcrew.com" });
  const r2 = await intakeMailToInbox(env2, fakeMessage(raw, "accounting@tdgcrew.com"), null);
  assert.equal(r2.outcome, "queued"); assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE month=10").get().n, 1);
  // a mail without a workbook
  const r3 = await intakeMailToInbox(env2, fakeMessage(mime({ from: "rita.berenyi@dg3.com", subject: "hello", attachments: [{ name: "note.pdf", type: "application/pdf", buf: new Uint8Array([1]) }] }), "rita.berenyi@dg3.com"), null);
  assert.equal(r3.outcome, "no_workbook"); assert.deepEqual(r3.ignored, ["note.pdf"]);
});

test("the email handler routes the intake address to the inbox and everything else to the intel pipeline", () => {
  const src = readFileSync(SRC, "utf-8");
  const h = src.slice(src.indexOf("async email(message, env, ctx)"), src.indexOf("async scheduled(event, env, ctx)"));
  assert.match(h, /if \(isIntakeMail\(message, env\)\) \{ await acceptIntakeMail\(env, message\); return; \}/, "the intake stores the mail and returns before the intel insert");
  assert.ok(!/intakeMailToInbox|PostalMime|sheetsOf|intakeMail\(/.test(h), "the email handler parses nothing (store, then process — 23 Nov 2026)");
  assert.match(h, /INSERT INTO email_inbox/, "the intel path is still there");
  assert.match(src, /const ensureMailIntake = memoEnsure\(/, "the receipt table's DDL is memoized (§12)");
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf-8");
  assert.match(toml, /^MAIL_SGA_TO = "sga@cims\.work"/m);
  // TDG's own domain is on the list since 23 Nov 2026 (Miguel: "add the tdgcm.ph also") — their accounting mails the bill itself
  const senders = /^SGA_MAIL_SENDERS = "([^"]+)"/m.exec(toml);
  assert.ok(senders, "SGA_MAIL_SENDERS is set in wrangler.toml");
  assert.equal(senders[1], "dg3.com, tdgcm.ph");
  const live = { SGA_MAIL_SENDERS: senders[1] };
  assert.equal(senderAllowed("TDGCM | Nympha Alimorong <nympha.alimorong@tdgcm.ph>", live), true, "TDG's accounting feeds the console");
  assert.equal(senderAllowed("Miguel.Sanmartin@dg3.com", live), true, "dg3.com still does");
  assert.equal(senderAllowed("someone@tdgsm.ph", live), false, "a look-alike domain is not tdgcm.ph");
  assert.equal(senderAllowed("accounting@tdgcrew.com", live), false, "nor is the old example domain");
});

// BREADCRUMBS (23 Nov 2026): a killed delivery left nothing to read. One line per stage, sizes and counts only.
test("the intake leaves a line per stage, with sizes and counts and never a name or an address", async () => {
  const lines = [];
  const raw = mime({ from: "Nympha Alimorong <nympha.alimorong@tdgcm.ph>", subject: "TCM DG3 Vessels OCTOBER 2026 SGA", attachments: [{ name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }] });
  const r = await intakeMail({ SGA_MAIL_SENDERS: "dg3.com, tdgcm.ph" }, raw, { from: "nympha.alimorong@tdgcm.ph" }, { ...deps, log: (stage, facts) => lines.push({ stage, ...facts }) });
  assert.equal(r.files[0].status, "pending");
  assert.deepEqual(lines.map((l) => l.stage), ["mime_parse_start", "mime_parse_done", "hash_start", "sheets_start", "sheets_done", "intake_parsed"]);
  assert.ok(lines[0].raw_bytes > 0); assert.equal(lines[1].attachments, 1); assert.ok(lines[1].attachment_bytes > 0);
  assert.ok(lines[4].sheets >= 1 && lines[4].rows >= 1);
  const text = JSON.stringify(lines);
  for (const secret of ["nympha", "tdgcm", "CAAG", "ANTHEM", "OCTOBER", "@"]) assert.ok(!text.includes(secret), "no " + secret + " in the log lines");
  // a log function that throws, or none at all, changes nothing
  const boom = await intakeMail({ SGA_MAIL_SENDERS: "dg3.com, tdgcm.ph" }, raw, { from: "nympha.alimorong@tdgcm.ph" }, { ...deps, log: () => { throw new Error("log down"); } });
  assert.equal(boom.files[0].status, "pending"); assert.equal(boom.files[0].hash, r.files[0].hash);
});
test("Workers Logs are on and the CPU ceiling is 5 minutes (wrangler.toml)", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf-8");
  assert.match(toml, /^\[observability\]\nenabled = true\nhead_sampling_rate = 1$/m);
  assert.match(toml, /^\[limits\]\ncpu_ms = 300_000$/m);
  const src = readFileSync(SRC, "utf-8");
  const fn = src.slice(src.indexOf("async function intakeMailToInbox"), src.indexOf("return { outcome, files: receipt"));
  for (const s of ["received", "tables_ready", "raw_read", "inbox_written", "receipt_written"]) assert.ok(fn.includes('stage("' + s + '"'), "the handler marks " + s);
  assert.match(fn, /log: stage/, "and hands the marker to the parser");
});


// ---- STORE, THEN PROCESS (23 Nov 2026) ----
// The first real bill by email failed 30 of 32 deliveries: an email invocation is killed at about 10 ms of CPU once a short
// burst is spent (Workers Logs: exceededCpu at cpuTimeMs 2010 after "sheets_start", then at cpuTimeMs 10), whatever the
// Worker's CPU limit says. So the handler stores the raw mail and returns; the hourly job parses it.
function bucket() {   // the EXPORTS bucket with the bytes kept: put / head / get
  const store = new Map();
  return { store,
    async put(key, body, opts) { const buf = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer(); store.set(key, { buf, opts }); },
    async head(key) { return store.has(key) ? { size: store.get(key).buf.byteLength } : null; },
    async get(key) { return store.has(key) ? { arrayBuffer: async () => store.get(key).buf, body: "bytes" } : null; } };
}
const bill = (from = "TDGCM | Nympha Alimorong <nympha.alimorong@tdgcm.ph>") => mime({ from, subject: "TCM DG3 Vessels OCTOBER 2026 SGA", attachments: [{ name: "SGA COVER PAGE OCTOBER 2026.pdf", type: "application/pdf", buf: new Uint8Array(4096) }, { name: "DG3 SGA EXCEL OCTOBER'26.xlsx", type: XLSX_MIME, buf: sgaXlsx() }] });
function arriving(raw, { from = "nympha.alimorong@tdgcm.ph", to = "sga@cims.work", id = "<824e7b5d@mail.gmail.com>", subject = "TCM DG3 Vessels OCTOBER 2026 SGA" } = {}) {
  const bytes = new TextEncoder().encode(raw);
  const h = new Map([["subject", subject]]); if (id) h.set("message-id", id);
  return { from, to, raw: new Blob([bytes]).stream(), rawSize: bytes.byteLength, headers: h };
}
const LIVE = { SGA_MAIL_SENDERS: "dg3.com, tdgcm.ph" };
const tables = (d) => d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
const rawRows = (d) => d.prepare("SELECT key, from_addr, to_addr, subject, size, state, attempts, note FROM mail_raw ORDER BY received_at").all().map((r) => ({ ...r }));

test("the email handler stores the mail and returns: nothing is parsed, nothing is loaded", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  const raw = bill();
  await worker.email(arriving(raw), env, { waitUntil() { throw new Error("the handler starts no background work"); } });
  const keys = [...env.EXPORTS.store.keys()];
  assert.equal(keys.length, 1); assert.match(keys[0], /^mail-inbox\/[0-9a-f]{64}\.eml$/);
  assert.equal(new TextDecoder().decode(env.EXPORTS.store.get(keys[0]).buf), raw, "the bytes in the bucket are the mail, to the byte");
  assert.equal(env.EXPORTS.store.get(keys[0]).opts.httpMetadata.contentType, "message/rfc822");
  assert.deepEqual(rawRows(d), [{ key: keys[0], from_addr: "nympha.alimorong@tdgcm.ph", to_addr: "sga@cims.work", subject: "TCM DG3 Vessels OCTOBER 2026 SGA", size: new TextEncoder().encode(raw).byteLength, state: "pending", attempts: 0, note: null }]);
  // not one row of what parsing would have written
  const t = tables(d);
  assert.ok(!t.includes("mail_intake"), "no receipt yet: the mail was not read");
  assert.ok(!t.includes("sp_inbox") || d.prepare("SELECT COUNT(*) n FROM sp_inbox").get().n === 0, "no sheet was read");
  assert.ok(!t.includes("sga_line") || d.prepare("SELECT COUNT(*) n FROM sga_line").get().n === 0, "no line was loaded");
});

test("the same mail delivered again is the same object and the same row; a mail with no Message-ID gets its own", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  const raw = bill();
  await acceptIntakeMail(env, arriving(raw)); await acceptIntakeMail(env, arriving(raw));
  assert.equal(env.EXPORTS.store.size, 1); assert.equal(rawRows(d).length, 1);
  await acceptIntakeMail(env, arriving(raw, { id: null })); await acceptIntakeMail(env, arriving(raw, { id: null }));
  assert.equal(rawRows(d).length, 3, "without a Message-ID nothing says two deliveries are one mail");
  assert.equal(rawRows(d).filter((r) => /^mail-inbox\/noid-/.test(r.key)).length, 2);
});

test("a mail that cannot be kept is refused, so the sender's server keeps it and tries again", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const raw = bill();
  const down = { ...envFor(d, LIVE), EXPORTS: { async put() { throw new Error("R2 down"); }, async head() { return null; } } };
  await assert.rejects(() => worker.email(arriving(raw), down, {}), /R2 down/);
  const lost = { ...envFor(d, LIVE), EXPORTS: { async put() {}, async head() { return null; } } };
  await assert.rejects(() => worker.email(arriving(raw), lost, {}), /could not be read back/);
  const short = { ...envFor(d, LIVE), EXPORTS: { async put() {}, async head() { return { size: 12 }; } } };
  await assert.rejects(() => worker.email(arriving(raw), short, {}), /could not be read back/);
  await assert.rejects(() => worker.email(arriving(raw), { ...envFor(d, LIVE), EXPORTS: undefined }, {}), /no EXPORTS bucket/);
  assert.ok(!tables(d).includes("mail_raw") || rawRows(d).length === 0, "a refused mail leaves no row saying it is here");
});

test("the hourly job reads the stored mail through the one path: the bill loads, the receipt is written, the row is done", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  await worker.email(arriving(bill()), env, {});
  const r = await processStoredMail(env);
  assert.deepEqual(r.read.map((x) => x.outcome), ["queued"]); assert.equal(r.waiting, 0); assert.deepEqual(r.failed, []);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line WHERE year=2026 AND month=10").get().n, 1, "TDG's own mail loads: tdgcm.ph feeds the console");
  const receipt = { ...d.prepare("SELECT from_addr, to_addr, subject, allowed, outcome, ignored_json FROM mail_intake").get() };
  assert.deepEqual(receipt, { from_addr: "nympha.alimorong@tdgcm.ph", to_addr: "sga@cims.work", subject: "TCM DG3 Vessels OCTOBER 2026 SGA", allowed: 1, outcome: "queued", ignored_json: JSON.stringify(["SGA COVER PAGE OCTOBER 2026.pdf"]) });
  assert.deepEqual(rawRows(d).map((x) => [x.state, x.attempts, x.note]), [["done", 1, "queued"]]);
  assert.equal([...env.EXPORTS.store.keys()].filter((k) => k.startsWith("sga-archive/")).length, 1, "the workbook's original is archived as before");
  // a second run has nothing to do, and the same mail delivered again stays done
  const again = await processStoredMail(env);
  assert.deepEqual(again.read, []); assert.equal(d.prepare("SELECT COUNT(*) n FROM mail_intake").get().n, 1);
  await worker.email(arriving(bill()), env, {});
  assert.deepEqual(rawRows(d).map((x) => x.state), ["done"]);
});

test("the sender gate still reads the envelope kept with the stored mail", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  // a dg3.com header handed over by an unlisted envelope: held, as before
  await worker.email(arriving(bill("Rita Berenyi <rita.berenyi@dg3.com>"), { from: "bounce@elsewhere.example", id: "<a@x>" }), env, {});
  const r = await processStoredMail(env);
  assert.deepEqual(r.read.map((x) => x.outcome), ["held"]);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sga_line").get().n, 0);
  assert.equal(d.prepare("SELECT allowed FROM mail_intake").get().allowed, 0);
});

test("a stored mail that cannot be read is tried three times, then parked as failed with its bytes kept; one bad mail does not block the next", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  await worker.email(arriving("this is not a mail at all", { id: "<bad@x>" }), env, {});
  const badKey = rawRows(d)[0].key;
  const realGet = env.EXPORTS.get.bind(env.EXPORTS);
  env.EXPORTS.get = async (k) => (k === badKey ? null : realGet(k));   // the object is not there when the job looks
  for (let i = 1; i <= 2; i++) { const r = await processStoredMail(env); assert.deepEqual(r.read, []); assert.deepEqual(r.failed, []); assert.equal(r.waiting, 1); assert.deepEqual(rawRows(d).map((x) => [x.state, x.attempts]), [["pending", i]]); }
  await worker.email(arriving(bill(), { id: "<good@x>" }), env, {});
  const r3 = await processStoredMail(env);
  assert.deepEqual(r3.failed.map((f) => f.key), [badKey]); assert.match(r3.failed[0].error, /not in the bucket/);
  assert.deepEqual(r3.read.map((x) => x.outcome), ["queued"], "the good mail behind it is read in the same run");
  assert.deepEqual(rawRows(d).map((x) => [x.state, x.attempts]), [["failed", 3], ["done", 1]]);
  assert.ok(env.EXPORTS.store.has(badKey), "the bytes of a failed mail stay in the bucket");
  assert.deepEqual((await processStoredMail(env)).read, [], "a failed mail is not tried a fourth time");
  // the sender's server delivers it again: it is taken again from zero
  await worker.email(arriving("this is not a mail at all", { id: "<bad@x>" }), env, {});
  assert.deepEqual(rawRows(d).map((x) => [x.state, x.attempts]), [["pending", 0], ["done", 1]]);
});

test("a claim whose run died is anyone's again after 15 minutes, and not before", async () => {
  const d = new DatabaseSync(":memory:"); d.exec(CREW);
  const env = { ...envFor(d, LIVE), EXPORTS: bucket() };
  await worker.email(arriving(bill()), env, {});
  const stamp = (msAgo) => new Date(Date.now() - msAgo).toISOString() + "|dead-run";
  d.prepare("UPDATE mail_raw SET state='claimed', claimed_at=?, attempts=1").run(stamp(5 * 60 * 1000));
  assert.deepEqual((await processStoredMail(env)).read, [], "a 5-minute-old claim may still be running");
  assert.deepEqual(rawRows(d).map((x) => x.state), ["claimed"]);
  d.prepare("UPDATE mail_raw SET claimed_at=?").run(stamp(16 * 60 * 1000));
  assert.deepEqual((await processStoredMail(env)).read.map((x) => x.outcome), ["queued"]);
  assert.deepEqual(rawRows(d).map((x) => [x.state, x.attempts]), [["done", 2]]);
});

test("the hourly job reads stored mail first and applies the inbox after it, never both at once", () => {
  const src = readFileSync(SRC, "utf-8");
  const sch = src.slice(src.indexOf("async scheduled(event, env, ctx)"), src.indexOf("/* ----------------------- auth helpers"));
  assert.match(sch, /processStoredMail\(env\)\.catch\([^]*?\)\.then\(function \(\) \{ return applyInbox\(env\); \}\)/);
  assert.equal(sch.split("applyInbox(env)").length - 1, 1, "one applyInbox in the hourly job, after the stored mail");
  const acc = src.slice(src.indexOf("async function acceptIntakeMail"), src.indexOf("async function processStoredMail"));
  assert.ok(!/PostalMime|sheetsOf|intakeMail\(|XLSX\./.test(acc), "accepting a mail parses nothing");
  assert.match(acc, /new FixedLengthStream\(size\)/, "the bytes are piped to the bucket, not read into the Worker, where the runtime can");
});
