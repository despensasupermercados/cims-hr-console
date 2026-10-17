// THE 16 OCT 2026 BUG HUNT — the Worker's plumbing (Miguel: "read the code.. find bugs and fix them .. also review the
// logic"). worker.js keeps these private, so the file is copied with an export line (the sp_inbox test's way). Each case
// was reproduced on the old code first; real SQLite where a sequence of writes is the point.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { memoDdl } from "../src/ensure_memo.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC_PATH = new URL("../src/worker.js", import.meta.url);
const SRC = readFileSync(SRC_PATH, "utf-8");
const TMP = new URL(`../src/__bh1016_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, SRC + "\nexport { decodeEmailBody, getCookie, applyInbox, processIntelInbox, ensureRegistrySnapshot, INTEL_MAX_ATTEMPTS, contractCountMap, apiFeedbackCrew, apiFeedbackBoard, FB_DUE_AHEAD, FB_DUE_BEHIND };\n", "utf-8");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

// ---- B1: a forwarded report is cut at the MIME boundary, never at a "--" line of its own text ---------------------------
const MIME = [
  "From: Ray Guerra <ray@dg3.com>", "Subject: Fwd: Marto", 'Content-Type: multipart/mixed; boundary="outer"', "",
  "--outer", 'Content-Type: multipart/alternative; boundary="inner"', "",
  "--inner", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "",
  "Ryan Ta=C3=B1gonan missed the par order twice.", "-- ", "Ray Guerra", "--- Forwarded message ---", "From: ship", "Cost =3D $450 freight.", "",
  "--inner", "Content-Type: text/html; charset=UTF-8", "", "<p>html copy</p>", "--inner--", "--outer--", "",
].join("\r\n");
test("B1: the text/plain part runs to ITS boundary — a signature's '-- ' and a '--- Forwarded' line stay in the body, UTF-8 QP reads as UTF-8", () => {
  const b = W.decodeEmailBody(MIME);
  assert.match(b, /Tañgonan/, "quoted-printable UTF-8 is decoded as UTF-8, not as Latin-1 mojibake");
  assert.match(b, /Ray Guerra/, "the signature after '-- ' used to be where the body was cut");
  assert.match(b, /Forwarded message/); assert.match(b, /Cost = \$450 freight/);
  assert.doesNotMatch(b, /html copy/, "the html alternative is not part of the text");
});
test("B1: a 7bit body is never quoted-printable-decoded ('=1A' in a part number stays)", () => {
  const raw = ["From: a@b", "Content-Type: text/plain", "", "Toner TN=1A used 3=20 of 4.", ""].join("\n");
  assert.equal(W.decodeEmailBody(raw), "Toner TN=1A used 3=20 of 4.");
});

// ---- B4: a cookie the browser mangled must not 500 every request -------------------------------------------------------
test("B4: getCookie returns the raw value when it is not valid percent-encoding, instead of throwing", () => {
  const req = { headers: { get: () => "other=1; sid=abc%E0%A4%A; x=2" } };
  assert.equal(W.getCookie(req, "sid"), "abc%E0%A4%A");
  assert.equal(W.getCookie({ headers: { get: () => "sid=a%20b" } }, "sid"), "a b");
});

// ---- B2: the sign-off dispatchers are built once; the per-module ensure guards run their DDL once per database ----------
test("B2: the fetch handler dispatches through the module-level _autoAck / _autoInstr, not a fresh install per request", () => {
  const handler = SRC.slice(SRC.indexOf("export default {"));
  assert.doesNotMatch(handler, /installAck\(\{/, "installAck is called once, at module level");
  assert.doesNotMatch(handler, /installInstr\(\{/, "installInstr is called once, at module level");
  assert.match(handler, /_autoAck\(p, request, env, url, session\)/); assert.match(handler, /_autoInstr\(p, request, env, url, session\)/);
  for (const fn of ["apiAutoSend", "apiSbmToggle", "apiAsk"]) {
    const i = SRC.indexOf("async function " + fn + "("); assert.ok(i > 0, fn);
    const body = SRC.slice(i, SRC.indexOf("\n}\n", i));
    assert.doesNotMatch(body, /CREATE TABLE/, fn + " runs DDL on every request — use a memoized guard (§12)");
  }
  for (const f of ["sbm.js", "seval.js", "signoff_ack.js", "signoff_instructions.js"]) {
    const s = readFileSync(new URL("../src/" + f, import.meta.url), "utf-8");
    assert.match(s, /memoDdl\(/, f + ": its ensure guard is wrapped (it ran CREATE TABLE on every request)");
  }
});
test("B2: memoDdl runs the guard once per database, retries after a failure, and keeps databases apart", async () => {
  let n = 0;
  const g = memoDdl(async (env) => { n++; if (env.fail) throw new Error("boom"); });
  const a = { DB: {} }, b = { DB: {} };
  await g(a); await g(a); await g(a);
  assert.equal(n, 1, "once per isolate and database");
  await g(b); assert.equal(n, 2, "a second database is its own guard");
  const c = { DB: {}, fail: true };
  await assert.rejects(g(c)); c.fail = false; await g(c); assert.equal(n, 4, "a failed guard is not remembered as done");
});

// ---- B3: a guard whose ALTER fails for a REAL reason is not recorded as applied for ever -------------------------------
function guardDb(alterError) {
  const meta = [];
  const mk = (sql) => ({
    bind: () => mk(sql),
    async run() {
      if (/^ALTER TABLE/.test(sql)) { if (alterError) throw new Error(alterError(sql)); return {}; }
      if (/INSERT OR IGNORE INTO data_meta/.test(sql)) meta.push(sql);
      return {};
    },
    async first() { return null; },
    async all() { return { results: [] }; },
  });
  return { DB: { prepare: mk, async batch(st) { return st.map(() => ({})); } }, meta };
}
test("B3: a guard's ALTER swallows 'duplicate column' and 'no such table' only; any other error fails the guard and records nothing", async () => {
  const ok = guardDb((sql) => (/assignment/.test(sql) ? "no such table: assignment" : "duplicate column name: name"));
  await W.ensureRegistrySnapshot(ok);
  assert.equal(ok.meta.length, 1, "the column is there, or the table is not there yet (its CREATE carries the column): applied");
  const bad = guardDb((sql) => (/assignment/.test(sql) ? "D1_ERROR: storage caused object to be reset" : "duplicate column name: x"));
  await assert.rejects(W.ensureRegistrySnapshot(bad), /D1_ERROR/);
  assert.equal(bad.meta.length, 0, "a guard that did not add its column is NOT written to data_meta (it was, for ever, with the column missing)");
});

// ---- B5 / B6 on real SQLite ----------------------------------------------------------------------------------------------
function envFor(d, extra = {}) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } }, ...extra };
}
const CREW = "CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT, status TEXT, redacted INTEGER DEFAULT 0); INSERT INTO crew VALUES ('SC-1','Ryan','Marto','On board',0);";
const LOG = "CREATE TABLE activity_log (id TEXT PRIMARY KEY, at TEXT, user_id TEXT, action TEXT, detail TEXT); CREATE TABLE data_log (id TEXT PRIMARY KEY, source TEXT, rows INTEGER, note TEXT, at TEXT);";

test("B5: an email the engine returns nothing for is retried, then lands in the human review queue — never released for ever", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:"); d.exec(CREW + LOG);
  let calls = 0;
  const env = envFor(d, { AI: { run: async () => { calls++; return { response: "" }; } } });
  await W.processIntelInbox(env, 10); // the schema
  d.prepare("INSERT INTO email_inbox (id,from_addr,to_addr,subject,raw,received_at,status) VALUES ('em1','ray@dg3.com','crew-reports@cims.work','Marto','From: ray@dg3.com\n\nRyan Marto missed the par order.','2026-10-16T08:00:00Z','new')").run();
  const max = W.INTEL_MAX_ATTEMPTS;
  assert.ok(max >= 2 && max <= 5, "a small, named ceiling");
  for (let i = 1; i < max; i++) {
    await W.processIntelInbox(env, 10);
    assert.equal(d.prepare("SELECT status FROM email_inbox WHERE id='em1'").get().status, "new", "released for the next sweep");
  }
  await W.processIntelInbox(env, 10);
  assert.equal(calls, max, "the engine is asked exactly INTEL_MAX_ATTEMPTS times, then never again for this email");
  const em = d.prepare("SELECT status, attempts FROM email_inbox WHERE id='em1'").get();
  assert.equal(em.status, "processed"); assert.equal(em.attempts, max);
  const ci = d.prepare("SELECT agency_id, status, created_by, summary FROM crew_intel WHERE source_email_id='em1'").get();
  assert.ok(ci, "a card exists for the email");
  assert.equal(ci.status, "pending", "in the human review queue (apiIntelReview lists status='pending')");
  assert.equal(ci.agency_id, null, "the console never picks the crew for it");
  assert.match(ci.summary, /Ryan Marto missed the par order/, "the sender's own words, for a human to read");
  assert.match(ci.summary, new RegExp("could not summarise.*" + max + " attempts", "i"));
  await W.processIntelInbox(env, 10);
  assert.equal(calls, max, "a processed email is not re-read");
});

test("B6: two applyInbox runs on the same pending file load it ONCE (the mail intake applies at once; the hourly cron is the safety net)", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:"); d.exec(CREW + LOG);
  const env = envFor(d);
  await W.applyInbox(env); // the schema
  const ins = d.prepare("INSERT INTO sp_inbox (id, file_key, kind, year, month, item_id, name, path, modified, sheet, part, parts, file_parts, rows_json, written_by, at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("k1_S_1", "k1", "nothing", 2026, 9, "01X", "x.xlsx", "p", "2026-10-02T03:11:09.000Z", "S", 1, 1, 1, "[]", "t", "2026-10-16T05:00:00Z", "pending");
  const [a, b] = await Promise.all([W.applyInbox(env), W.applyInbox(env)]);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sp_sync WHERE item_id='01X'").get().n, 1, "one record of the load, not two");
  assert.equal(a.loaded.length + a.errors.length + b.loaded.length + b.errors.length, 1, "one run took the file; the other saw it claimed");
  assert.equal(d.prepare("SELECT status FROM sp_inbox WHERE id='k1_S_1'").get().status, "error", "the unknown kind is marked (never left 'applying')");
  // a claim an isolate never finished is released after INBOX_STALE_MIN
  ins.run("k2_S_1", "k2", "nothing", 2026, 9, "02X", "y.xlsx", "p", "2026-10-02T03:11:09.000Z", "S", 1, 1, 1, "[]", "t", "2026-10-16T05:00:00Z", "applying");
  d.prepare("UPDATE sp_inbox SET applied_at='2026-10-16T00:00:00Z' WHERE id='k2_S_1'").run();
  const r = await W.applyInbox(env);
  assert.equal(r.files, 1, "the stale claim was released and the file taken");
});

// ---- P2: the count file's "finished since" reads the row's embark too ----------------------------------------------------
test("P2: contractCountMap hands completedSince the WHOLE registry row — an embark after the debark (TDG's row disagreeing with itself) adds nothing", async () => {
  assert.match(SRC, /AS tdg_off, r\.embarked_at AS tdg_on, [^"]*FROM contract_count c/, "the join carries the embark beside the debark");
  assert.doesNotMatch(SRC, /completedSince\([^)]*\.tdg_off,/, "no caller passes the bare debark — the embark guard never fired in production");
  const rows = [{ sc: "SC-1", completed: 3, as_of: "2026-10-08", tdg_off: "2026-10-20", tdg_on: "2026-10-25" }, { sc: "SC-2", completed: 2, as_of: "2026-10-08", tdg_off: "2026-10-12", tdg_on: "2026-04-01" }];
  const env = { DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: rows }), first: async () => rows[0], run: async () => ({}) }) } };
  const m = await W.contractCountMap(env);
  assert.equal(m["SC-1"].added, 0, "Del Rosario's row: debarked Oct 20, embarked Oct 25 — not a contract finished since the count");
  assert.equal(m["SC-2"].added, 1);
});

// ---- P4: months and days have ONE definition (span_md.mdParts) ---------------------------------------------------------
test("P4: the statement PDF and its email read months+days from span_md, not their own arithmetic", async () => {
  for (const f of ["statement.js", "emails/hr.statement.v2.js"]) {
    const s = readFileSync(new URL("../src/" + f, import.meta.url), "utf-8");
    assert.match(s, /from "\.\.?\/(?:\.\.\/)?span_md\.js"/, f + " imports span_md");
    assert.doesNotMatch(s, /Math\.min\(\+a\.slice\(8, 10\)/, f + " carries its own month-end clamp (a fork of mdParts)");
  }
  const { span } = await import("../src/emails/hr.statement.v2.js");
  assert.equal(span("2026-07-31", "2027-03-01"), "7 months 1 day");
  assert.equal(span("2026-10-26", "2026-10-31"), "5 days");
  const { seaTime } = await import("../src/statement.js");
  assert.equal(seaTime([{ on: "2026-07-31", act: "2027-03-01" }], "2027-06-01"), "7 mo 1 d");
});

// ---- S1b (the Score Card read draft, 17 Oct 2026): the Windows pre-fill obeys the same sign-on rule as the automatic read ----
test("S1b: /api/feedback/crew?on= lists an answer from before the sign-on as earlier feedback and keeps it out of the prefill", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT, first_name TEXT, last_name TEXT, status TEXT, redacted INTEGER DEFAULT 0); INSERT INTO crew VALUES ('c1','SC-0038129','Michael Angelo','Resposo','On board',0); CREATE TABLE data_meta (k TEXT PRIMARY KEY, v TEXT);");
  const env = envFor(d);
  const url = (q) => new URL("https://cims.work/api/feedback/crew?" + q);
  let r = await (await W.apiFeedbackCrew(env, url("id=SC-0038129"))).json(); // the guard creates the two tables
  assert.equal(r.ok, true);
  d.prepare("INSERT INTO feedback_request2 (id,crew_id,role,token_hash,status,requested_at) VALUES ('fr1','c1','ray','x','answered','2026-07-20T11:00:00Z')").run();
  d.prepare("INSERT INTO feedback_response2 (id,request_id,crew_id,role,answers_json,submitted_at) VALUES ('fp1','fr1','c1','ray',?,'2026-07-20T11:30:27Z')")
    .run(JSON.stringify({ order: "Yes", rushcause: "Crew ordering failure", ontime: "Always", acc: "Accurate", par: "Maintained", audit: "Yes" }));
  // Resposo's Ray answer of 20 Jul 2026 was given for the Reflection contract (16 Jan -> 17 Jul)
  r = await (await W.apiFeedbackCrew(env, url("id=SC-0038129&on=2026-01-16"))).json();
  assert.equal(r.answers.ray.acc, "Accurate"); assert.equal(r.prefill.sliders.sAcc, 25); assert.equal(r.prefill.gates.audit, true); assert.ok(!r.prefill.gates.rush, "Ray's rush answer is evidence only (17 Oct 2026)"); assert.equal(r.previous.length, 0);
  // the Apex contract (embarked 7 Oct): the same answer is from before its sign-on
  r = await (await W.apiFeedbackCrew(env, url("id=SC-0038129&on=2026-10-07"))).json();
  assert.equal(r.answers.ray, undefined, "not this contract's answer");
  assert.equal(r.prefill.sliders.sAcc, undefined); assert.ok(!r.prefill.gates.audit, "no audit gate from the previous contract");
  assert.equal(r.previous.length, 1); assert.equal(r.previous[0].why, "before_sign_on"); assert.equal(r.previous[0].role, "ray");
  assert.equal(r.on, "2026-10-07");
  // without a sign-on (the Inputs page, the feedback board) the answer is served as before
  r = await (await W.apiFeedbackCrew(env, url("id=SC-0038129"))).json();
  assert.equal(r.prefill.sliders.sAcc, 25); assert.equal(r.previous.length, 0);
});

// ---- The Feedback board's window (Miguel, 17 Oct 2026: "Add the 45/30-day window") -----------------------------------------
test("the Feedback board lists only contracts ending within 45 days or ended within 30, as its heading says", async () => {
  assert.equal(W.FB_DUE_AHEAD, 45); assert.equal(W.FB_DUE_BEHIND, 30);
  const today = "2026-10-17";
  const crew = [["A", "On board", "2026-12-01"], ["B", "On board", "2026-12-02"], ["C", "On board", "2027-05-07"], ["D", "On board", null],
    ["E", "On Vacation", "2026-09-17"], ["F", "On Vacation", "2026-09-16"], ["G", "Reserved", "2026-10-10"], ["H", "Inactive", "2026-10-15"], ["I", "On board", "2026-10-17"]];
  const st = { today, crewRows: crew.map(([id, status]) => ({ id: "c" + id, agency_id: id, first_name: id, last_name: "X", vessel_observed: null, status })),
    fbRoles: () => [{ role: "ray", answered: false, status: "none" }], statusOf: (c) => crew.find((x) => x[0] === c.agency_id)[1],
    legNow: (sc) => { const off = crew.find((x) => x[0] === sc)[2]; return off ? { off, ship: "Apex" } : null; }, shipOf: (v) => v };
  const r = await (await W.apiFeedbackBoard({}, st)).json();
  assert.deepEqual(r.rows.map((x) => x.agency_id).sort(), ["A", "E", "G", "I"], "45 days ahead in, 46 out; 30 days behind in, 31 out; no sign-off out; Inactive out");
  assert.equal(r.count, 4);
  assert.deepEqual(r.rows.map((x) => x.agency_id), ["E", "G", "I", "A"], "ashore first, then by sign-off");
});
