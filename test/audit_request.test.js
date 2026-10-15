// Printshop Audit — PR C (src/audit_request.js), 14 Oct 2026, on REAL SQLite (node:sqlite) so a bad column or a
// misplaced bind fails here, not in production. HON and the mailer are fakes that record what they were asked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AUDIT_DDL, ensureAuditTables } from "../src/audit_store.js";
import { installAuditRequest } from "../src/audit_request.js";
import { applyOverride } from "../src/override.js";
import { auditRequestEmail } from "../src/emails/hr.audit.request.v1.js";
import { docsInEmail } from "../src/emails/hr.audit.docsin.v1.js";
import { overdueEmail } from "../src/emails/hr.audit.overdue.v1.js";
import { p43ReadState, mmlReadState, coverFor } from "../src/audit_read.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE crew (agency_id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT); CREATE TABLE crew_override (agency_id TEXT PRIMARY KEY, email TEXT, first_name TEXT, last_name TEXT)");
  db.prepare("INSERT INTO crew VALUES ('SC-1','John','Gorre','john@gmail.com')").run();
  const mk = (sql) => { const st = { args: [] }; st.bind = (...a) => { st.args = a.map((x) => (x === undefined ? null : x)); return st; };
    st.all = async () => ({ results: db.prepare(sql).all(...st.args) }); st.first = async () => db.prepare(sql).get(...st.args) || null;
    st.run = async () => { const r = db.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; }; return st; };
  return { db, DB: { prepare: mk, batch: async (sts) => { const out = []; for (const s of sts) out.push(await s.run()); return out; } } };
}
const TC = { prepare: () => ({ all: async () => ({ results: [{ ship: "Oasis", email: "oa_printerspecialist@rccl.com", role: "printer_specialist" }, { ship: "Oasis", email: "oa_guest@rccl.com", role: "shipboard_manager" }] }) }) };
const OBP = [{ part_number: "A1", description: "Drum K", category: "Drum", on_hand: 2 }, { part_number: "B2", description: "Toner C", category: "Toner", on_hand: 5 }];
function fakeHon(reads = {}) {
  const calls = [];
  return { calls,
    ship: async (s) => { calls.push(["ship", s]); return { ok: true, ship: "Oasis", presses: [{ serial: "S1", model: "C4070", label: "Machine # 1" }], obp: { asOf: "2026-10-13", lines: OBP, intransit: [{ part_number: "A1", qty: 1 }] } }; },
    pattern43: async () => { calls.push(["p43"]); return reads.p43 || { ok: true, version: 5, state: "clean", legend: { state: "clean", head: "NOTHING FOUND", items: [], line: "white dots, lines and uneven density, all 12 pages" } }; },
    managementList: async () => { calls.push(["mml"]); return reads.mml || { ok: true, version: 4, kind: "machine-list", lifeOver: [{ name: "Drum Unit/K (%)", partNo: "A1", pct: 140, resets: 2 }], recommendation: "Recommendation: have this machine looked at. Parts are changed on copy quality, not on a count." }; },
  };
}
const R2 = () => { const m = new Map(); return { m, put: async (k, b) => { m.set(k, new Uint8Array(b)); }, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { arrayBuffer: async () => m.get(k).buffer } : null) }; };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const html = (b, status = 200) => new Response(b, { status, headers: { "Content-Type": "text/html" } });
const BOARD = { sections: [{ ship: "Oasis", crew: [{ agency_id: "SC-1", current: true, aboard: true }] }, { ship: "Apex", crew: [] }] };
function setup({ live = false, reads, board = BOARD } = {}) {
  const { db, DB } = d1();
  const sent = [], ctl = { mail: true, failed: [] };
  const env = { DB, TIMECARD_DB: TC, HON: fakeHon(reads), AUDIT_FILES: R2(), AUDIT_TO: "ray@dg3.com, rolando@dg3.com, miguel@dg3.com", AUDIT_REQUEST_CC: "rolando@dg3.com, ray@dg3.com", AUDIT_LIVE: live ? "true" : undefined };
  const R = installAuditRequest({ json, htmlResponse: html, ensureAudit: ensureAuditTables, applyOverride, logActivity: async () => {}, rotationSections: async () => board,
    sendViaMailer: async (e, env2) => { if (!ctl.mail) { ctl.failed.push(env2 || e); return { ok: false, error: "mailer down" }; } sent.push(env2 || e); return { ok: true }; } });
  // sendViaMailer(env, envelope): keep the envelope
  R._sent = sent;
  const call = async (method, path, body, session = { email: "dexter.lawrence@dg3.com" }, headers = {}) => {
    const u = new URL("https://audit.cims.work" + path);
    const req = new Request(u, { method, headers: Object.assign(body instanceof Uint8Array ? {} : { "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    return R.handle(u.pathname, req, env, u, session);
  };
  return { R, env, db, sent, call, ctl };
}
async function makeRequest(t) {
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  const mail = t.sent[t.sent.length - 1];
  const token = (mail.text.match(/\/audit\/u\/([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(token, "the email carries the upload address");
  return { id: r.id, token, mail };
}
const upload = (t, token, serial, kind) => t.call("POST", "/api/audit/u/upload?t=" + token + "&serial=" + serial + "&kind=" + kind, new TextEncoder().encode("%PDF-1.4 bundle " + kind), null, { "content-type": "application/pdf", "x-file-name": kind + ".pdf" });

test("the tables: every statement creates on real SQLite", () => {
  const db = new DatabaseSync(":memory:");
  for (const s of AUDIT_DDL) db.exec(s);
});

test("TEST MODE: the request goes to the auditor alone, marked TEST; nothing reaches the ship", async () => {
  const t = setup();
  const prev = await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json();
  assert.equal(prev.live, false); assert.deepEqual(prev.to, ["dexter.lawrence@dg3.com"]); assert.equal(prev.shown, "oa_printerspecialist@rccl.com");
  const { mail } = await makeRequest(t);
  assert.deepEqual(mail.to, ["dexter.lawrence@dg3.com"]); assert.deepEqual(mail.cc, []);
  assert.match(mail.subject, /^\[TEST\]/);
  const row = t.db.prepare("SELECT status, test_mode, token_hash FROM audit_request").get();
  assert.equal(row.status, "sent"); assert.equal(row.test_mode, 1); assert.equal(row.token_hash.length, 64, "only the hash of the token is kept");
  assert.equal((await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).status, 409, "one open request per crew and ship");
});

test("LIVE: ship mailbox shown and sent to, the personal address and Rolando + Ray in copy", async () => {
  const t = setup({ live: true });
  const { mail } = await makeRequest(t);
  assert.deepEqual(mail.to, ["oa_printerspecialist@rccl.com"]);
  assert.deepEqual(mail.cc, ["john@gmail.com", "rolando@dg3.com", "ray@dg3.com"]);
  assert.doesNotMatch(mail.subject, /TEST/);
});

test("no HON = no request (the machines and the OBP list come from it)", async () => {
  const t = setup(); t.env.HON = undefined;
  const r = await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" });
  assert.equal(r.status, 503); assert.equal(t.sent.length, 0);
});

test("the seafarer's state is BLIND: no on-hand quantity anywhere in what he receives", async () => {
  const t = setup();
  const { token } = await makeRequest(t);
  const st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.deepEqual(st.lines.map((l) => l.part_no).sort(), ["A1", "B2"]);
  const raw = JSON.stringify(st);
  assert.doesNotMatch(raw, /on_hand|onHand|intransit/);
  assert.doesNotMatch(raw, /"5"|:5[,}]|:2[,}]/, "OBP's quantities never reach the crew");
  const pg = await t.call("GET", "/audit/u/" + token, undefined, null);
  assert.equal(pg.status, 200); assert.doesNotMatch(await pg.text(), /on_hand/);
});

test("the gate: reads by HON, the count, then complete once and ONE documents-in email", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  const st0 = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.equal(st0.gate.open, false);
  for (const kind of ["p43", "mgmt"]) {
    const u = await (await upload(t, token, "S1", kind)).json(); assert.equal(u.ok, true, JSON.stringify(u));
    const r = await (await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null)).json();
    assert.equal(r.read_state, "ok", kind + " " + JSON.stringify(r));
  }
  let st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.deepEqual(st.gate.missing, ["2 of 2 parts not counted"]);
  const before = t.sent.length;
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "1", B2: "0" } }, null);
  st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  // the last value does NOT close the request (16 Oct 2026): the crew can still correct "1" to "12", then taps Send
  assert.equal(st.status, "sent"); assert.equal(st.gate.open, true); assert.equal(t.sent.length, before, "nothing sent on the last keystroke");
  assert.equal((await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "12" } }, null)).status, 200, "a correction is taken before Send");
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "1" } }, null);
  assert.equal((await (await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null)).json()).ok, true);
  st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.equal(st.status, "complete");
  const docs = t.sent.slice(before);
  assert.equal(docs.length, 1, "the documents-in email goes once");
  assert.equal(docs[0].templateId, "hr.audit.docsin.v1");
  assert.deepEqual(docs[0].to, ["dexter.lawrence@dg3.com"], "test mode: the auditor only");
  assert.match(docs[0].html, /Drum Unit\/K/); assert.match(docs[0].html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), /on board 2 on order 1/); // what OBP holds for the part, beside its %
  assert.match(docs[0].html, /copy reads clean/); assert.doesNotMatch(docs[0].html, /\breplace\b/i);
  assert.match(docs[0].html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), /Toner C[^]*? 5 0 \u22125 /, "the team sees the gap against OBP: part, OBP, counted, off");
  // a second gate check after completion sends nothing more
  await t.R._internal.maybeComplete(t.env, id);
  assert.equal(t.sent.length, before + 1);
  assert.equal((await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "3" } }, null)).status, 409, "a completed request takes no more writes");
});

test("the wrong document is said at the press: the User Management List asks for the MACHINE list and keeps the gate shut", async () => {
  const t = setup({ reads: { mml: { ok: true, kind: "settings-list", lifeOver: [] } } });
  const { token } = await makeRequest(t);
  const u = await (await upload(t, token, "S1", "mgmt")).json();
  const r = await (await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null)).json();
  assert.equal(r.read_state, "wrong_doc"); assert.match(r.say, /MACHINE Management List/);
  const st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.ok(st.gate.missing.includes("Machine # 1 · Management List needs a new file"));
});

test("a machine down needs a reason, and then needs nothing else", async () => {
  const t = setup();
  const { token } = await makeRequest(t);
  const r = await t.call("POST", "/api/audit/u/down?t=" + token, { serial: "S1", down: true, reason: " " }, null);
  assert.equal(r.status, 400);
  await t.call("POST", "/api/audit/u/down?t=" + token, { serial: "S1", down: true, reason: "Fuser error, engineer called" }, null);
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "2", B2: "5" } }, null);
  await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null);
  const st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.equal(st.status, "complete");
});

test("closed links: a cancelled request closes the page; a wrong token is not found", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  await t.call("POST", "/api/audit/request/cancel", { id });
  assert.equal((await t.call("GET", "/audit/u/" + token, undefined, null)).status, 410);
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).status, 410);
  assert.equal((await t.call("GET", "/audit/u/AAAAAAAAAAAAAAAAAAAAAAAA", undefined, null)).status, 404);
  assert.equal((await t.call("GET", "/api/audit/request?id=" + id, undefined, null)).status, 401, "Dexter's routes need the session");
});

test("the sweep: one reminder at 12 h, one overdue note at 24 h, unfinished reads retried", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  const u = await (await upload(t, token, "S1", "p43")).json(); // uploaded, never read (page closed)
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  t.db.prepare("UPDATE audit_request SET sent_at=?, due_at=? WHERE id=?").run(ago(13), new Date(Date.now() + 11 * 3600e3).toISOString(), id);
  t.db.prepare("UPDATE audit_upload SET at=? WHERE id=?").run(ago(1), u.id);
  let n = t.sent.length;
  let o = await t.R.sweep(t.env);
  assert.equal(o.reminded, 1); assert.equal(o.read, 1);
  assert.equal(t.sent.length, n + 1); assert.match(t.sent[n].subject, /Reminder/);
  o = await t.R.sweep(t.env); assert.equal(o.reminded, 0, "the reminder goes once");
  t.db.prepare("UPDATE audit_request SET due_at=? WHERE id=?").run(ago(1), id);
  n = t.sent.length;
  o = await t.R.sweep(t.env); assert.equal(o.overdue, 1);
  assert.equal(t.sent[n].templateId, "hr.audit.overdue.v1"); assert.deepEqual(t.sent[n].to, ["dexter.lawrence@dg3.com"]);
  o = await t.R.sweep(t.env); assert.equal(o.overdue, 0, "overdue goes once per deadline");
});

test("the read mapping: clean / marks / failed / wrong document", () => {
  assert.equal(p43ReadState({ ok: true, state: "findings", legend: { items: [{}, {}] } }).read_state, "ok");
  assert.equal(p43ReadState({ ok: true, state: "failed", legend: { line: "the scan could not be read" } }).read_state, "unreadable");
  assert.equal(p43ReadState(null).read_state, "failed");
  assert.equal(mmlReadState({ ok: false, error: "vision took too long" }).read_state, "failed", "HON's own trouble is retried, never put on the crew");
  assert.equal(mmlReadState({ ok: true, kind: "condition-form" }).read_state, "wrong_doc");
  assert.equal(coverFor("A0XX / B", [{ part_number: "A0XX", on_hand: 3 }], []), "on board 3 · on order 0");
  assert.equal(coverFor("ZZ", [{ part_number: "A0XX", on_hand: 3 }], []), null);
});

test("the emails keep the CIMS standard: letterhead, no rgba or gradient, a button plus the address as plain text, no 'replace'", () => {
  const req = auditRequestEmail({ first: "John", ship: "Oasis", auditor: "Dexter Lawrence", dueAt: "2026-10-15T16:40:00Z", link: "https://audit.cims.work/audit/u/abc", machines: [{}, {}], lines: 47 });
  const docs = docsInEmail({ ship: "Oasis", crew: "John Gorre", auditor: "Dexter", completeAt: "2026-10-15T10:00:00Z", machines: [{ serial: "S1", label: "M1", p43: { state: "findings", legend: { items: [{ head: "LINES ALONG THE FEED IN YELLOW", line: "x", pointsTo: "yellow charging pole" }] } }, mml: { kind: "machine-list", lifeOver: [{ name: "Developer K", partNo: "A1", pct: 237, cover: "on board 0 · on order 0" }], recommendation: "Recommendation: have this machine looked at. Parts are changed on copy quality, not on a count." } }], count: { total: 2, diff: [] } });
  const od = overdueEmail({ ship: "Oasis", crew: "John", dueAt: "2026-10-15T16:40:00Z", missing: [{ say: "Machine # 1 · Pattern 43 not sent" }] });
  for (const m of [req, docs, od]) {
    assert.match(m.html, /CRUISE INDUSTRY MANAGED SERVICES/);
    assert.doesNotMatch(m.html, /rgba\(|gradient/);
    assert.match(m.html, /name="viewport"/);
    assert.ok(m.text && m.subject);
  }
  // a button for one tap, AND the address as plain text outside any link: Mimecast rewrites links, a typed address it cannot
  assert.match(req.html, /<a href="https:\/\/audit\.cims\.work\/audit\/u\/abc"[^>]*>Open my upload page<\/a>/);
  assert.match(req.html.replace(/<a [\s\S]*?<\/a>/g, ""), /audit\.cims\.work\/audit\/u\/abc/, "the address must also stand as plain text");
  assert.match(req.text, /https:\/\/audit\.cims\.work\/audit\/u\/abc/);
  assert.match(req.html, /MACHINE Management List/);
  assert.doesNotMatch(docs.html, /\breplace\b/i); assert.match(docs.html, /copy shows marks above/);
});

test("Dexter's grade: only once the documents are in, a sentence for 3 or below, filed once, carried on the request", async () => {
  const t = setup();
  const { id } = await makeRequest(t);
  const g = (body) => t.call("POST", "/api/audit/request/grade", Object.assign({ id }, body));
  assert.equal((await g({ inventory: 5, technical: 5, collaterals: 5 })).status, 409, "the gate: no grade before the documents are in");
  t.db.prepare("UPDATE audit_request SET status='complete', complete_at='2026-10-15T08:00:00Z' WHERE id=?").run(id);
  const tr = await g({ inventory: 5, technical: 5, collaterals: 5 });
  assert.equal(tr.status, 409, "a TEST request is a rehearsal: its grade would reach a real Score Card");
  assert.equal((await tr.json()).error, "test_request");
  t.db.prepare("UPDATE audit_request SET test_mode=0 WHERE id=?").run(id);
  for (const v of [true, " 5 ", "0x5", [5], 4.5, "6"]) assert.equal((await g({ inventory: v, technical: 5, collaterals: 5 })).status, 400, "not a rating: " + JSON.stringify(v));
  assert.deepEqual((await (await g({ inventory: 2, technical: 5, collaterals: 5, note: {} })).json()).fields, ["note"], "a note is text, never [object Object]");
  const bad = await g({ inventory: 3, technical: 5, collaterals: 5 });
  assert.equal(bad.status, 400); assert.deepEqual((await bad.json()).fields, ["note"]);
  const ok = await (await g({ inventory: 3, technical: 5, collaterals: 4, overall: "", note: "OBP not updated after the drum change." })).json();
  assert.deepEqual(ok, { ok: true, score: 4, from: "average" }, "no Overall: (3+5+4)/3 = 4");
  assert.equal((await g({ inventory: 5, technical: 5, collaterals: 5, overall: 5 })).status, 409, "filed once, never rewritten");
  const row = t.db.prepare("SELECT r_overall, score, score_from, filed_by FROM audit_eval").get();
  assert.deepEqual({ ...row }, { r_overall: null, score: 4, score_from: "average", filed_by: "dexter.lawrence@dg3.com" });
  assert.equal(t.db.prepare("SELECT status FROM audit_visit").get().status, "filed");
  const d = await (await t.call("GET", "/api/audit/request?id=" + id)).json();
  assert.equal(d.grade.score, 4); assert.equal(d.grade.inventory, 3); assert.match(d.grade.note, /drum/);
});

test("open site: a request only to a seafarer aboard THAT ship; no re-send inside 15 minutes; an open-site grade says so; a graded request is not 'open'", async () => {
  const t = setup({ live: true });
  const OPEN = { email: "Dexter.Lawrence@dg3.com", open: true };
  const nope = await t.call("POST", "/api/audit/request", { ship: "Apex", sc: "SC-1" }, OPEN);
  assert.equal(nope.status, 422); assert.equal((await nope.json()).error, "not_aboard");
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" }, OPEN)).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  const again = await t.call("POST", "/api/audit/request/resend", { id: r.id }, OPEN);
  assert.equal(again.status, 429, "each re-send breaks the crew's link and emails the ship again");
  const pv = await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1", undefined, OPEN)).json();
  assert.deepEqual(pv.cc, [], "no personal address on the open site");
  assert.equal((await (await t.call("GET", "/api/audit/request?id=" + r.id, undefined, OPEN)).json()).cc, null);
  t.db.prepare("UPDATE audit_request SET status='complete', complete_at='2026-10-15T08:00:00Z' WHERE id=?").run(r.id);
  assert.equal((await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json()).open.id, r.id, "in, not graded: still open");
  assert.equal((await t.call("POST", "/api/audit/request/grade", { id: r.id, inventory: 5, technical: 4, collaterals: 5 }, OPEN)).status, 200);
  assert.match(t.db.prepare("SELECT filed_by FROM audit_eval").get().filed_by, /open site, no sign-in/);
  assert.equal((await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json()).open, null, "graded: the way is open for the next audit");
});

/* ------------------------- the 16 Oct 2026 review (three reviews, every finding reproduced) ------------------------- */
const fullyIn = async (t, token) => {
  for (const kind of ["p43", "mgmt"]) { const u = await (await upload(t, token, "S1", kind)).json(); await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null); }
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "1", B2: "5" } }, null);
};

test("a first email that fails closes its draft: 'try again' makes a new request instead of being locked out", async () => {
  const t = setup();
  t.ctl.mail = false;
  const r1 = await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" });
  assert.equal(r1.status, 502);
  assert.equal(t.db.prepare("SELECT status FROM audit_request").get().status, "cancelled");
  t.ctl.mail = true;
  const { id } = await makeRequest(t);
  assert.equal(t.db.prepare("SELECT status FROM audit_request WHERE id=?").get(id).status, "sent");
});

test("one open request per crew and ship, even when two taps race past the check", async () => {
  const t = setup();
  await makeRequest(t);
  // the race: a second row inserted straight, past create's SELECT — the unique index refuses it
  assert.throws(() => t.db.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, auditor, status, created_at) SELECT 'ar_x', ship, normalized_ship, agency_id, auditor, 'draft', created_at FROM audit_request").run(), /UNIQUE/);
});

test("the reminder adds a link only once its email went, and the link the crew holds keeps working", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  t.db.prepare("UPDATE audit_request SET sent_at=?, due_at=? WHERE id=?").run(ago(13), new Date(Date.now() + 11 * 3600e3).toISOString(), id);
  t.ctl.mail = false;
  let o = await t.R.sweep(t.env);
  assert.equal(o.reminded, 0);
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).status, 200, "a failed reminder changes nothing");
  t.ctl.mail = true;
  o = await t.R.sweep(t.env);
  assert.equal(o.reminded, 1, "a failed reminder is tried again next hour");
  const fresh = (t.sent[t.sent.length - 1].text.match(/\/audit\/u\/([A-Za-z0-9_-]+)/) || [])[1];
  assert.ok(fresh && fresh !== token);
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).status, 200, "the page open at hour 12 is not cut off");
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + fresh, undefined, null)).status, 200);
  assert.equal((await t.R.sweep(t.env)).reminded, 0, "still one reminder");
});

test("a resend after day 14 sends a link that opens, and a cancel closes every link", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  t.db.prepare("UPDATE audit_request SET sent_at=?, due_at=? WHERE id=?").run(ago(16), ago(15), id); // a full day past the 14, never the same millisecond
  t.db.prepare("UPDATE audit_send_log SET sent_at=?").run(ago(15));
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).status, 410, "the old link has expired");
  const rs = await (await t.call("POST", "/api/audit/request/resend", { id })).json();
  assert.equal(rs.ok, true, JSON.stringify(rs));
  const fresh = (t.sent[t.sent.length - 1].text.match(/\/audit\/u\/([A-Za-z0-9_-]+)/) || [])[1];
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + fresh, undefined, null)).status, 200, "the resent link opens");
  await t.call("POST", "/api/audit/request/cancel", { id });
  assert.equal((await t.call("GET", "/api/audit/u/state?t=" + fresh, undefined, null)).status, 410);
});

test("a read that keeps failing becomes 'send it again' after three tries, and the sweep takes the least-tried first", async () => {
  const t = setup({ reads: { mml: { ok: false, error: "took too long" } } });
  const { token } = await makeRequest(t);
  const u = await (await upload(t, token, "S1", "mgmt")).json();
  const read = async () => (await (await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null)).json()).read_state;
  assert.equal(await read(), "failed"); assert.equal(await read(), "failed");
  assert.equal(await read(), "unreadable");
  const st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.ok(st.gate.missing.includes("Machine # 1 · Management List needs a new file"));
});

test("everything in and nobody taps Send: the sweep sends it after the idle hours, once", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  await fullyIn(t, token);
  const before = t.sent.length;
  assert.equal((await t.R.sweep(t.env)).completed, 0, "not while the crew may still be correcting");
  const ago = new Date(Date.now() - 7 * 3600e3).toISOString();
  for (const tb of ["audit_count", "audit_upload"]) t.db.prepare("UPDATE " + tb + " SET at=?").run(ago);
  t.db.prepare("UPDATE audit_upload SET read_at=?").run(ago);
  assert.equal((await t.R.sweep(t.env)).completed, 1);
  assert.equal(t.db.prepare("SELECT status FROM audit_request WHERE id=?").get(id).status, "complete");
  assert.equal(t.sent.length, before + 1, "one documents-in email");
});

test("Send is refused while something is missing, and says what", async () => {
  const t = setup();
  const { token } = await makeRequest(t);
  const r = await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null);
  assert.equal(r.status, 409); assert.match((await r.json()).say, /Pattern 43 not sent/);
});

test("a documents-in email that did not go is sent again by the sweep, and never twice", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  await fullyIn(t, token);
  t.ctl.mail = false;
  await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null);
  assert.equal(t.db.prepare("SELECT ok FROM audit_send_log WHERE request_id=? AND kind='docsin'").get(id).ok, 0);
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(new Date(Date.now() - 30 * 60000).toISOString(), id);
  t.ctl.mail = true;
  assert.equal((await t.R.sweep(t.env)).docsin, 1);
  assert.equal(t.db.prepare("SELECT ok FROM audit_send_log WHERE request_id=? AND kind='docsin'").get(id).ok, 1);
  assert.equal((await t.R.sweep(t.env)).docsin, 0);
});

test("an overdue note that did not go is tried again next hour", async () => {
  const t = setup();
  const { id } = await makeRequest(t);
  t.db.prepare("UPDATE audit_request SET due_at=? WHERE id=?").run(new Date(Date.now() - 3600e3).toISOString(), id);
  t.ctl.mail = false;
  assert.equal((await t.R.sweep(t.env)).overdue, 0);
  t.ctl.mail = true;
  assert.equal((await t.R.sweep(t.env)).overdue, 1);
  assert.equal((await t.R.sweep(t.env)).overdue, 0);
});

test("no OBP list = no request: the count would be empty and the email would say it agrees", async () => {
  const t = setup();
  t.env.HON = Object.assign({}, t.env.HON, { ship: async () => ({ ok: true, ship: "Oasis", presses: [{ serial: "S1", label: "Machine # 1" }], obp: null }) });
  const r = await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" });
  assert.equal(r.status, 422); assert.equal((await r.json()).error, "no_obp_list");
});

test("a file name beyond Latin-1 arrives URI-encoded and is stored as the crew named it", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  const name = "Dexter’s scan – M1.pdf";
  const r = await (await t.call("POST", "/api/audit/u/upload?t=" + token + "&serial=S1&kind=p43", new TextEncoder().encode("%PDF-1.4 x"), null, { "content-type": "application/pdf", "x-file-name": encodeURIComponent(name) })).json();
  assert.equal(r.ok, true);
  assert.equal(t.db.prepare("SELECT filename FROM audit_upload WHERE request_id=?").get(id).filename, "Dexter_s_scan_M1.pdf", "decoded, then cleaned — never the %E2%80%99 escape");
  // and the page sends it encoded: a raw "’" in setRequestHeader throws in the browser and froze the tile at 0%
  assert.match(readFileSync(new URL("../src/audit_upload_ui.js", import.meta.url), "utf8"), /setRequestHeader\("X-File-Name", encodeURIComponent\(/);
});

test("a finished TEST request is not 'open': the next audit can be asked", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  await fullyIn(t, token);
  await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null);
  assert.equal(t.db.prepare("SELECT status, test_mode FROM audit_request WHERE id=?").get(id).test_mode, 1);
  const prev = await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json();
  assert.equal(prev.open, null);
});

test("OPEN MODE: the preview answers only for a seafarer the board has aboard; an undated TDG seat is aboard", async () => {
  const open = { email: "dexter.lawrence@dg3.com", open: true };
  const t = setup({ board: { sections: [{ ship: "Oasis", crew: [{ agency_id: "SC-1", current: true, aboard: false, signOn: null }] }] } });
  assert.equal((await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1", undefined, open)).status, 200, "No contract dates yet is still aboard");
  assert.equal((await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-9", undefined, open)).status, 422);
});

test("the documents-in email: plain text reads the crew's name as written, and an empty count never 'agrees'", () => {
  const base = { ship: "Oasis", auditor: "Dexter", completeAt: "2026-10-15T10:00:00Z", machines: [{ serial: "S1", label: "M1", p43: null, mml: null }] };
  const a = docsInEmail(Object.assign({ crew: "Ma. O'Neil & Co", count: { total: 2, diff: [] } }, base));
  assert.match(a.text, /Ma\. O'Neil & Co sent/); assert.doesNotMatch(a.text, /&#39;|&amp;/);
  const b = docsInEmail(Object.assign({ crew: "John", count: { total: 0, diff: [] } }, base));
  assert.doesNotMatch(b.html + b.text, /agrees/i); assert.match(b.text, /No OBP list to count against/);
});

test("Dexter's page: a late error never replaces the screen moved on to, and a TEST audit offers no Grade", () => {
  const src = readFileSync(new URL("../src/audit_ui.js", import.meta.url), "utf8");
  assert.equal((src.match(/\}\)\.catch\(function \(e\) \{ if \(S\.view === key\) fail\(e\); \}\)/g) || []).length, 5, "every view's load");
  assert.match(src, /if \(done && !d\.grade && !d\.test\) dock\(/);
  assert.match(src, /var bf = S\.brief\[ship \+ "\|" \+ sc\];/, "the request carries THIS seafarer's contract label");
});
