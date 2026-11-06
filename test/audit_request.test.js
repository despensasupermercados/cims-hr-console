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
import { p43ReadState, mmlReadState, coverFor, p43Assess, shownLife } from "../src/audit_read.js";

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
    managementList: async () => { calls.push(["mml"]); return reads.mml || { ok: true, version: 4, kind: "machine-list", lifeVerified: true, lifeOver: [{ name: "Drum Unit/K (%)", partNo: "A1", pct: 140, resets: 2 }], recommendation: "Recommendation: have this machine looked at. Parts are changed on copy quality, not on a count." }; },
  };
}
const R2 = () => { const m = new Map(); return { m, put: async (k, b) => { m.set(k, new Uint8Array(b)); }, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { arrayBuffer: async () => m.get(k).buffer } : null) }; };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const html = (b, status = 200) => new Response(b, { status, headers: { "Content-Type": "text/html" } });
const BOARD = { sections: [{ ship: "Oasis", crew: [{ agency_id: "SC-1", current: true, aboard: true }] }, { ship: "Apex", crew: [] }] };
function setup({ live = false, reads, board = BOARD } = {}) {
  const { db, DB } = d1();
  const sent = [], ctl = { mail: true, failed: [] }, logs = [];
  const env = { DB, TIMECARD_DB: TC, HON: fakeHon(reads), AUDIT_FILES: R2(), AUDIT_TO: "ray@dg3.com, rolando@dg3.com, miguel@dg3.com", AUDIT_REQUEST_CC: "rolando@dg3.com, ray@dg3.com", AUDIT_LIVE: live ? "true" : undefined };
  const R = installAuditRequest({ json, htmlResponse: html, ensureAudit: ensureAuditTables, applyOverride, logActivity: async (...a) => { logs.push(a); }, rotationSections: async () => board,
    sendViaMailer: async (e, env2) => { if (!ctl.mail) { ctl.failed.push(env2 || e); return { ok: false, error: "mailer down" }; } sent.push(env2 || e); return { ok: true }; } });
  // sendViaMailer(env, envelope): keep the envelope
  R._sent = sent;
  const call = async (method, path, body, session = { email: "dexter.lawrence@dg3.com" }, headers = {}) => {
    const u = new URL("https://audit.cims.work" + path);
    const req = new Request(u, { method, headers: Object.assign(body instanceof Uint8Array ? {} : { "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    return R.handle(u.pathname, req, env, u, session);
  };
  return { R, env, db, sent, call, ctl, logs };
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

// 6 Nov 2026 (Mark John Bornea, Independence: "he clicks the box .. is not able to choose the file"): nothing reached the
// console and nothing said which browser he was in. Each open of the page is kept with the browser it came from, so the next
// "the box does nothing" is read from the log, never guessed. The page's own reads (state, saves) are not logged.
test("each open of the crew's page is logged with its browser; the page's own reads are not", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  t.logs.length = 0;
  const ua = "Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0 Mobile Safari/537.36";
  const pg = await t.call("GET", "/audit/u/" + token, undefined, null, { "user-agent": ua });
  assert.equal(pg.status, 200);
  const open = t.logs.filter((l) => l[2] === "audit_page_open");
  assert.equal(open.length, 1);
  assert.equal(open[0][1], null, "nobody signed in: the crew's link");
  assert.ok(open[0][3].startsWith(id + " "), "the request it was opened for");
  assert.ok(open[0][3].includes("Android 13") && open[0][3].includes("; wv)"), "the browser, as it said itself");
  assert.ok(!/SC-1/.test(open[0][3]), "no crew id: the line never lands in the profile's who-did-what as a person's action");
  await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null, { "user-agent": ua });
  assert.equal(t.logs.filter((l) => l[2] === "audit_page_open").length, 1, "the state read is not an open");
  const bad = await t.call("GET", "/audit/u/" + "x".repeat(20), undefined, null, { "user-agent": ua });
  assert.equal(bad.status, 404);
  assert.equal(t.logs.filter((l) => l[2] === "audit_page_open").length, 1, "a link that is not one logs nothing");
  assert.ok(!/ \| AS/.test(open[0][3]), "no network read, no network written");
  // 6 Nov 2026 (Mimecast's protected viewer opened Mark's link): the network the open came from, as Cloudflare reads the
  // address (AS number and owner), so a viewer is named by its network and not only guessed from its browser
  const u = new URL("https://audit.cims.work/audit/u/" + token);
  const req = new Request(u, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" } });
  Object.defineProperty(req, "cf", { value: { asn: 64512, asOrganization: "Example Isolation Network" } });
  const pg2 = await t.R.handle(u.pathname, req, t.env, u, null);
  assert.equal(pg2.status, 200);
  const last = t.logs.filter((l) => l[2] === "audit_page_open").pop()[3];
  assert.ok(last.startsWith(id + " Mozilla/5.0 (X11; Linux"), last);
  assert.ok(last.endsWith(" | AS64512 Example Isolation Network"), last);
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

test("Dexter's grade: only once the documents are in, never a TEST request, and never three ratings alone (steps_required)", async () => {
  const t = setup();
  const { id } = await makeRequest(t);
  const g = (body) => t.call("POST", "/api/audit/request/grade", Object.assign({ id }, body));
  assert.equal((await g({ inventory: 5, technical: 5, collaterals: 5 })).status, 409, "the gate: no grade before the documents are in");
  t.db.prepare("UPDATE audit_request SET status='complete', complete_at='2026-10-15T08:00:00Z' WHERE id=?").run(id);
  const tr = await g({ inventory: 5, technical: 5, collaterals: 5 });
  assert.equal(tr.status, 409, "a TEST request is a rehearsal: its grade would reach a real Score Card");
  assert.equal((await tr.json()).error, "test_request");
  t.db.prepare("UPDATE audit_request SET test_mode=0 WHERE id=?").run(id);
  // the 15 Oct 2026 screen's three numbers are refused since 27 Oct 2026: the grade is filed with its steps (fileVisit,
  // test/audit_visit.test.js) or not at all — on the open site anyone could POST three numbers onto a real Score Card
  const bare = await g({ inventory: 3, technical: 5, collaterals: 4, overall: "", note: "OBP not updated after the drum change." });
  assert.equal(bare.status, 400); assert.equal((await bare.json()).error, "steps_required");
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM audit_eval").get().n, 0, "nothing filed");
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM audit_visit").get().n, 0);
  const d = await (await t.call("GET", "/api/audit/request?id=" + id)).json();
  assert.equal(d.grade, null); assert.equal(d.status, "complete", "still open for the audit on the ship");
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
  assert.equal((await (await t.call("GET", "/api/audit/request?id=" + r.id, undefined, OPEN)).json()).auditor, null, "who asked is not shown on the open site");
  assert.equal((await t.call("POST", "/api/audit/request/grade", { id: r.id, inventory: 5, technical: 4, collaterals: 5 }, OPEN)).status, 400, "three ratings alone are refused (steps_required)");
  // filed with its steps (the open-site stamp on filed_by is pinned by test/audit_visit.test.js): the rows as fileVisit writes them
  const by = "Dexter.Lawrence@dg3.com (open site, no sign-in)";
  t.db.prepare("INSERT INTO audit_visit (id, request_id, ship, agency_id, auditor, status, opened_at, filed_at) VALUES ('av_1', ?, 'Oasis', 'SC-1', ?, 'filed', '2026-10-15T09:00:00Z', '2026-10-15T09:00:00Z')").run(r.id, by);
  t.db.prepare("INSERT INTO audit_eval (visit_id, request_id, agency_id, ship, r_inventory, r_technical, r_collaterals, r_overall, score, score_from, note, filed_by, filed_at) VALUES ('av_1', ?, 'SC-1', 'Oasis', 5, 4, 5, NULL, 4, 'average', NULL, ?, '2026-10-15T09:00:00Z')").run(r.id, by);
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
  // the briefing, the ask (its load and its send), the request, the audit's steps, the filed report and a Forms survey audit
  assert.equal((src.match(/\}\)\.catch\(function \(e\) \{ if \(S\.view === key\) fail\(e\); \}\)/g) || []).length, 7, "every view's load");
  assert.match(src, /var startBtn = done && !d\.grade && !d\.test && !pend \?/, "Start the audit only on a live request whose documents are in");
  assert.match(src, /var bf = S\.brief\[ship \+ "\|" \+ sc\];/, "the request carries THIS seafarer's contract label");
});

// ONE PERSON AT A TIME PER SHIP (Miguel, 20 Oct 2026: "we do 1 person at the time per ship"). Kevin's request on Pursuit
// (documents in, not graded) means A.J., aboard the same hull, is not asked until Kevin's is filed. One definition of an
// open request (src/audit.js OPEN_REQ_SQL / isOpenRequest) for the create guard, the preview, the briefing and the ships list.
test("one person at a time per ship: another seafarer's open request stops the next; the grade or a cancel frees the ship", async () => {
  const t = setup({ live: true });
  t.db.prepare("INSERT INTO crew VALUES ('SC-2','Aj','Balena','aj@gmail.com')").run();
  const { id } = await makeRequest(t);
  const prev = await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-2")).json();
  assert.deepEqual(prev.shipOpen, { id, crew: "John Gorre", sc: "SC-1" }, "the preview names the seafarer whose request is open");
  assert.equal((await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json()).shipOpen, null, "his own is not 'another'");
  const busy = async () => { const r = await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-2" }); return [r.status, await r.json()]; };
  let [st, b] = await busy();
  assert.equal(st, 409); assert.equal(b.error, "ship_busy"); assert.equal(b.id, id); assert.equal(b.crew, "John Gorre");
  assert.equal(t.sent.length, 1, "nothing was emailed for the second");
  // documents in, not graded: still open
  t.db.prepare("UPDATE audit_request SET status='complete', complete_at='2026-10-20T10:00:00Z' WHERE id=?").run(id);
  [st, b] = await busy(); assert.equal(b.error, "ship_busy", "in and not graded is still open");
  // the same seafarer again: his own request opens, never a second one
  const own = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  assert.equal(own.error, "already_open"); assert.equal(own.id, id);
  // graded: the ship is free
  t.db.prepare("INSERT INTO audit_eval (visit_id, request_id, agency_id, ship, r_inventory, r_technical, r_collaterals, score, score_from, filed_by, filed_at) VALUES ('av_1',?,'SC-1','Oasis',4,4,4,4,'average','dexter','2026-10-20T12:00:00Z')").run(id);
  const next = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-2" })).json();
  assert.equal(next.ok, true, JSON.stringify(next));
  // a cancel frees it too
  await t.call("POST", "/api/audit/request/cancel", { id: next.id });
  assert.equal((await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json()).ok, true);
});

test("one per ship: a TEST request is open while it waits and finished once in (it cannot be graded)", async () => {
  const t = setup();
  t.db.prepare("INSERT INTO crew VALUES ('SC-2','Aj','Balena','aj@gmail.com')").run();
  const { id } = await makeRequest(t);
  assert.equal((await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-2" })).json()).error, "ship_busy");
  t.db.prepare("UPDATE audit_request SET status='complete' WHERE id=?").run(id);
  assert.equal((await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-2" })).json()).ok, true);
});

test("one per ship in the database: two requests waiting on one ship cannot both be written, whoever they are for", () => {
  const db = new DatabaseSync(":memory:");
  for (const s of AUDIT_DDL) db.exec(s);
  const ins = db.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, auditor, status, created_at) VALUES (?, 'Pursuit', 'pursuit', ?, 'dexter', ?, '2026-10-20')");
  ins.run("a", "SC-1", "sent");
  assert.throws(() => ins.run("b", "SC-2", "draft"), /UNIQUE/);
  ins.run("c", "SC-2", "cancelled");
  ins.run("d", "SC-3", "complete");
  db.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, auditor, status, created_at) VALUES ('e', 'Apex', 'apex', 'SC-2', 'dexter', 'sent', '2026-10-20')").run();
});

// Miguel, 20 Oct 2026, Kevin Jugao's Pursuit list read "No part past its rated life": "u didnt read the files correctly".
// The file he re-sent is pages 25–50 of the 52-page Machine Management List: the life % (pages 5 and 7–15) is not in it.
// A machine list whose read carries no life row says so and asks for the whole list; it never reads as a clean machine.
test("a machine list with no life row is not 'no part past its rated life'", async () => {
  const { mmlReadState } = await import("../src/audit_read.js");
  const none = mmlReadState({ ok: true, kind: "machine-list", lifeOver: [], read: { ok: true, lifeItems: [] } });
  assert.equal(none.read_state, "wrong_doc");
  assert.match(none.say, /No parts-life page was found/);
  assert.equal(none.summary.lifeRows, 0);
  const clean = mmlReadState({ ok: true, kind: "machine-list", lifeVerified: true, lifeOver: [], read: { ok: true, lifeItems: [{ name: "Drum Unit/K (%)", pct: 40 }] } });
  assert.equal(clean.read_state, "ok"); assert.equal(clean.say, "Read. No part past its rated life."); assert.equal(clean.summary.lifeRows, 1);
  const over = mmlReadState({ ok: true, kind: "machine-list", lifeVerified: true, lifeOver: [{ name: "Drum Unit/K (%)", pct: 140 }], read: { ok: true, lifeItems: [{ name: "Drum Unit/K (%)", pct: 140 }] } });
  assert.equal(over.say, "Read. 1 part past rated life, for the team.");
  // 6 Nov 2026: a read HON did not verify tells the crew the file is in, never a count of parts or "no part past"
  for (const r of [{ lifeOver: [] }, { lifeOver: [{ name: "Drum Unit/K (%)", pct: 140 }] }]) {
    const u = mmlReadState({ ok: true, kind: "machine-list", ...r, read: { ok: true, lifeItems: [{ name: "Drum Unit/K (%)", pct: 140 }] } });
    assert.equal(u.say, "Read. Thank you."); assert.equal(u.summary.lifeVerified, false);
  }
});

// Miguel, 20 Oct 2026 ("ensure all is wired"): Kevin Jugao's stored management-list read still said "Read. No part past its
// rated life." on the request page's file list. A machine-list read with no life row says "part life not read" there too.
test("the request page never repeats an old read's 'No part past its rated life' when the read carried no life row", async () => {
  const t = setup();
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  const ins = (id, json) => t.db.prepare("INSERT INTO audit_upload (id, request_id, serial, kind, r2_key, filename, content_type, bytes, at, read_state, read_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, r.id, "S1", "mgmt", "k/" + id, "Management_List.pdf", "application/pdf", 10, "2026-10-16T12:23:19Z", "ok", JSON.stringify(json));
  ins("u_old", { say: "Read. No part past its rated life.", summary: { kind: "machine-list", lifeOver: [], version: 4 } });
  const m = (await (await t.call("GET", "/api/audit/request?id=" + r.id)).json()).machines[0];
  assert.equal(m.mgmt.say, "Read, but no parts-life page was found: part life not read.");
  t.db.prepare("UPDATE audit_upload SET superseded_at='2026-10-16T13:00:00Z' WHERE id='u_old'").run();
  ins("u_new", { say: "Read. No part past its rated life.", summary: { kind: "machine-list", lifeRows: 45, lifeOver: [], lifeVerified: true, version: 4 } });
  const m2 = (await (await t.call("GET", "/api/audit/request?id=" + r.id)).json()).machines[0];
  assert.equal(m2.mgmt.say, "Read. No part past its rated life.", "a verified read that carried life rows keeps its own words");
  // 6 Nov 2026: the same read, not verified by HON (every read stored before that day), never repeats its own count
  t.db.prepare("UPDATE audit_upload SET superseded_at='2026-10-16T14:00:00Z' WHERE id='u_new'").run();
  ins("u_newer", { say: "Read. 19 parts past rated life, for the team.", summary: { kind: "machine-list", lifeRows: 63, lifeOver: [{ name: "Developing Unit/M(Distance %)", partNo: "AC57R702", pct: 5114, resets: 0 }], version: 4 } });
  const m3 = (await (await t.call("GET", "/api/audit/request?id=" + r.id)).json()).machines[0];
  assert.equal(m3.mgmt.say, "Read. Thank you.");
});

// R1 (Miguel, 23 Oct 2026: "is not that Rolando needs to approve .. is that you the AI tell the crew the assessment of it"):
// the crew's own page says what the Pattern 43 scan shows the moment it is read. Built from HON's measurement and the DG3
// tech library rule it carries (Kevin Jugao's Pursuit read, 16 Oct 2026, as stored); never "replace", never OBP's numbers.
const PURSUIT_MARK = { head: "LINES ALONG THE FEED IN CYAN", line: "1 line · cyan half tone · green · blue · gray", ink: "cyan", mark: "lines along the feed", detail: "1 line",
  where: "cyan half tone · green · blue · gray", pages: [7, 10, 11, 12], part: "CYAN DRUM OR CHARGING POLE", rule: 4,
  check: { say: "an even line reads as the drum, an uneven one with darker sections as the charging pole; this scan does not settle which", src: "DG3 tech library", href: null } };
test("R1: the crew is told what the Pattern 43 scan shows, in full, from HON's measurement", () => {
  const a = p43Assess({ state: "findings", legend: { items: [PURSUIT_MARK] } }, "Dexter");
  assert.equal(a.head, "1 mark on this press.");
  assert.equal(a.items[0].title, "Lines along the feed in cyan · 1 line");
  assert.deepEqual(a.items[0].lines.map((l) => l[0]), ["Where", "What it means", "Points to", "Check on board"]);
  assert.equal(a.items[0].lines[0][1], "Cyan half tone (page 7) · Green (page 10) · Blue (page 11) · Gray (page 12)");
  assert.match(a.items[0].lines[1][1], /comes from the cyan unit alone/);
  assert.equal(a.items[0].lines[2][1], "The cyan drum or charging pole (DG3 tech library).");
  assert.match(a.items[0].lines[3][1], /^Print page 7 of Pattern 43 again and follow the line along its length: an even line reads as the drum/);
  assert.match(a.after, /Keep printing\. Parts are changed on copy quality/); assert.match(a.after, /Dexter sees the same reading/);
  assert.doesNotMatch(JSON.stringify(a), /\breplace\b/i, "copy quality decides: never 'replace'");
  assert.equal(p43Assess({ state: "clean", legend: { items: [] } }).head, "No marks on any page. Nothing to do for this press.");
  assert.equal(p43Assess({ state: "unreadable" }), null); assert.equal(p43Assess(null), null);
});

test("R1: the crew's state carries the assessment on a read Pattern 43 only, and the page draws it", async () => {
  const t = setup({ reads: { p43: { ok: true, version: 5, state: "findings", legend: { state: "findings", items: [PURSUIT_MARK] } } } });
  const { token } = await makeRequest(t);
  const u = await (await upload(t, token, "S1", "p43")).json();
  let st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.equal(st.machines[0].p43.assess, undefined, "nothing said before the read");
  await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null);
  st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  const a = st.machines[0].p43.assess;
  assert.equal(a.state, "findings"); assert.equal(a.items[0].title, "Lines along the feed in cyan · 1 line"); assert.match(a.after, /Dexter sees the same reading/);
  const pg = await (await t.call("GET", "/audit/u/" + token, undefined, null)).text();
  assert.match(pg, /function assess\(s\)/); assert.match(pg, /\.asx\{/);
});

// 6 Nov 2026, Independence (Mark John Bornea): the documents-in email told Ray, Rolando, Ohji, Jonathan, Miguel and Dexter
// "72 parts past rated life" — six parts on one press at 6,387,753%, "times replaced" in the millions, "(Page)" counts read as
// percentages. Miguel: "is it true these numbers percetages are so high ??", then "yes. all of it". HON's reader marks a read
// it checked (lifeVerified); every other read shows no percentage and is never a clean press. The rows below are Mark's
// Machine 1 read as stored in production (audit_upload au_fe494d42, 6 Nov 2026), a few of its 19.
const MARK_M1 = { ok: true, version: 4, kind: "machine-list", read: { ok: true, lifeItems: new Array(63).fill({ name: "x (%)", pct: 1 }) },
  lifeOver: [{ name: "Developing Unit/M(Distance %)", partNo: "AC57R702", pct: 5114, resets: 0 }, { name: "Developing Unit/Y(Distance %)", partNo: "AC57R702", pct: 1868, resets: 3246254 },
    { name: "Drum/C(Page)", partNo: "AC57R732", pct: 857, resets: 1076861 }],
  recommendation: "Recommendation: have this machine looked at. Parts are changed on copy quality, not on a count." };
test("an unverified Management List read: the crew is told it is in, the team sees 'part life not verified', never a % or a clean press", async () => {
  const t = setup({ reads: { mml: MARK_M1 } });
  const { id, token } = await makeRequest(t);
  for (const kind of ["p43", "mgmt"]) {
    const u = await (await upload(t, token, "S1", kind)).json();
    const r = await (await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null)).json();
    assert.equal(r.read_state, "ok");
    if (kind === "mgmt") assert.equal(r.say, "Read. Thank you.", "the crew is never told a count of parts from an unverified read");
  }
  const st = await (await t.call("GET", "/api/audit/u/state?t=" + token, undefined, null)).json();
  assert.doesNotMatch(JSON.stringify(st), /past rated life|5114|1868/);
  const before = t.sent.length;
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "2", B2: "5" } }, null); // agrees with OBP: nothing else to look at
  assert.equal((await (await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null)).json()).ok, true);
  const mail = t.sent.slice(before).find((m) => m.templateId === "hr.audit.docsin.v1");
  assert.ok(mail, "the documents-in email went");
  const words = mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.doesNotMatch(words, /5114|1868|857%|Developing Unit|Drum\/C/, "no figure from the unverified read");
  assert.doesNotMatch(words, /past rated life/, "no count of parts past rated life");
  assert.doesNotMatch(words, /no part past its rated life/i, "and never a clean press");
  assert.match(words, /part life not verified/i);
  assert.match(words, /did not pass their checks/);
  assert.doesNotMatch(mail.subject, /to look at/, "an unverified read is nothing to look at: nothing was found");
  assert.match(mail.text, /Management List part life not verified/);
  // the visit and the items to confirm say the same
  const v = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  assert.deepEqual(v.machines[0].life, []); assert.equal(v.machines[0].lifeUnverified, true); assert.equal(v.machines[0].lifeRead, null);
  const { beforeVisit } = await import("../src/audit_steps.js");
  const items = beforeVisit({ machines: v.machines });
  assert.ok(items.some((b) => /part life not verified/.test(b.t)));
  assert.ok(!items.some((b) => /past rated life|part life not read/.test(b.t)));
  // a read HON verified shows its rows, as before
  const t2 = setup({ reads: { mml: { ...MARK_M1, lifeVerified: true, lifeOver: [{ name: "Drum Unit/K (%)", partNo: "A1", pct: 140, resets: 2 }] } } });
  const q = await makeRequest(t2);
  for (const kind of ["p43", "mgmt"]) { const u = await (await upload(t2, q.token, "S1", kind)).json(); await t2.call("POST", "/api/audit/u/read?t=" + q.token + "&id=" + u.id, {}, null); }
  const v2 = await (await t2.call("GET", "/api/audit/visit?id=" + q.id)).json();
  assert.equal(v2.machines[0].life[0].pct, 140); assert.equal(v2.machines[0].lifeUnverified, false);
});

// HON's read version 5 (6 Nov 2026): each life figure is read twice, from the life blocks near the front of the list and
// from the Special parts counter, and kept only where the two agree. A list whose figures were compared and did NOT agree
// keeps no row — it is still the right document: "not verified", never "no parts-life page, send it again".
const PAIR = (key, front, counter, ok) => ({ key, front, counter, ok });
const V5_FAILED = { ok: true, version: 5, kind: "machine-list", lifeVerified: false, lifeChecked: false, lifeOver: [],
  lifeCheck: [PAIR("drum/Y", "188 (%)", "183", false), PAIR("drum/M", "63 (%)", "63", true)], read: { ok: true, lifeItems: [] } };
const V5_HELD = { ok: true, version: 5, kind: "machine-list", lifeVerified: false, lifeChecked: true, lifeOver: [],
  lifeCheck: [PAIR("drum/Y", "188 (%)", "188", true)], read: { ok: true, lifeItems: [{ name: "Drum Unit/Y(%)", partNo: "ACE60Y1", pct: 188 }] } };
test("read version 5: a list whose two readings disagreed is the right document, part life not verified", () => {
  const st = mmlReadState(V5_FAILED);
  assert.equal(st.read_state, "ok", "never 'no parts-life page was found'");
  assert.equal(st.say, "Read. Thank you.");
  assert.equal(st.summary.lifeChecks, 2); assert.equal(st.summary.lifeChecked, false);
  assert.deepEqual(st.summary.check[0], ["drum/Y", "188 (%)", "183", false], "the evidence is kept beside the read");
  const shown = shownLife(st.summary);
  assert.equal(shown.lifeUnverified, true); assert.deepEqual(shown.lifeOver, []);
  // a held read (both readings agreed, HON's switch still off) reads the same way here: no %, not verified
  const held = mmlReadState(V5_HELD);
  assert.equal(held.read_state, "ok"); assert.equal(held.summary.lifeChecked, true); assert.equal(shownLife(held.summary).lifeUnverified, true);
  // nothing compared and nothing kept is still "no parts-life page"
  assert.equal(mmlReadState({ ...V5_FAILED, lifeCheck: [] }).read_state, "wrong_doc");
});

// HON's read version 6, the same evening: the life page read twice, two ways; the second side is named `second`
const PAIR6 = (key, front, second, ok) => ({ key, front, second, ok });
const V6_FAILED = { ...V5_FAILED, version: 6, lifeCheck: [PAIR6("developer/K", "237 (%)", "6,353,991", false), PAIR6("belt", "10 (%)", "10", true)] };
test("read version 6: the second side is the life page's copied row, kept as evidence; a v5 pair still reads", () => {
  const st = mmlReadState(V6_FAILED);
  assert.equal(st.read_state, "ok");
  assert.deepEqual(st.summary.check, [["developer/K", "237 (%)", "6,353,991", false], ["belt", "10 (%)", "10", true]]);
  assert.deepEqual(mmlReadState(V5_FAILED).summary.check[0], ["drum/Y", "188 (%)", "183", false], "a v5 answer keeps its counter side");
  // the crew is pointed at the page the reader reads
  assert.match(mmlReadState({ ...V6_FAILED, lifeCheck: [] }).say, /Maintenance counter page/);
});

test("a Management List read before version 6 is read again by the sweep, and only an ok answer replaces it", async () => {
  const t = setup({ reads: { mml: { ...MARK_M1 } } });
  const { token } = await makeRequest(t);
  const ids = {};
  for (const kind of ["p43", "mgmt"]) {
    const u = await (await upload(t, token, "S1", kind)).json(); ids[kind] = u.id;
    await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null);
  }
  const row = () => t.db.prepare("SELECT read_state, read_version, read_json FROM audit_upload WHERE id=?").get(ids.mgmt);
  assert.equal(row().read_version, 4);
  // HON still answers version 4: nothing is replaced and the sweep stops asking for the hour
  const calls0 = t.env.HON.calls.length;
  assert.equal((await t.R.sweep(t.env)).reread, 0);
  assert.equal(t.env.HON.calls.length - calls0, 1, "one try, then it waits for the next hour");
  assert.equal(row().read_version, 4);
  // HON on version 5 is older than the console asks for now: nothing replaced, it waits for the hour
  t.env.HON = fakeHon({ mml: V5_FAILED });
  assert.equal((await t.R.sweep(t.env)).reread, 0);
  assert.equal(row().read_version, 4);
  // HON on version 6, the two readings disagreed: the read is replaced, the crew's state is unchanged, nothing shown
  t.env.HON = fakeHon({ mml: V6_FAILED });
  assert.equal((await t.R.sweep(t.env)).reread, 1);
  const r = row();
  assert.equal(r.read_state, "ok"); assert.equal(r.read_version, 6);
  assert.equal(JSON.parse(r.read_json).summary.lifeChecks, 2);
  assert.equal((await t.R.sweep(t.env)).reread, 0, "read once at version 6, never again");
  // an answer that is not ok never replaces a good read: it is noted and the row is not asked again
  const t2 = setup({ reads: { mml: { ...MARK_M1 } } });
  const q = await makeRequest(t2);
  const u2 = await (await upload(t2, q.token, "S1", "mgmt")).json();
  await t2.call("POST", "/api/audit/u/read?t=" + q.token + "&id=" + u2.id, {}, null);
  t2.env.HON = fakeHon({ mml: { ok: true, version: 6, kind: "settings-list" } });
  await t2.R.sweep(t2.env);
  const r2 = t2.db.prepare("SELECT read_state, read_version, read_json FROM audit_upload WHERE id=?").get(u2.id);
  assert.equal(r2.read_state, "ok", "a good read is never downgraded by a re-read");
  assert.equal(JSON.parse(r2.read_json).reread.read_state, "wrong_doc");
  assert.equal(r2.read_version, 6);
  const mmlCalls = () => t2.env.HON.calls.filter((c) => c[0] === "mml").length;
  const before = mmlCalls();
  await t2.R.sweep(t2.env);
  assert.equal(mmlCalls(), before, "not asked again");
});
