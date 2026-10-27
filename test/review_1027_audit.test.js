// REVIEW OF 27 OCT 2026 — the Printshop Ops Audit (Miguel: "fix code bugs .. logic issue .. gaps"). Every test here FAILED on
// the code before the fix it pins. Real SQLite (node:sqlite), the audit module with fakes for HON and the mailer, as in
// test/audit_request.test.js. Nothing here is money (§1): the audit's grade reaches the Score Card through audit_eval only,
// and this batch files nothing new there — it refuses one way of filing (three ratings alone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { ensureAuditTables } from "../src/audit_store.js";
import { installAuditRequest, ownerEmail, followupBatches, DRAFT_STALE_MIN } from "../src/audit_request.js";
import { installAudit } from "../src/audit_routes.js";
import { AUDIT_SW } from "../src/audit_ui.js";
import { applyOverride } from "../src/override.js";
import { startVisit } from "../src/audit_steps.js";

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
function fakeHon() {
  return {
    ship: async () => ({ ok: true, ship: "Oasis", presses: [{ serial: "S1", model: "C4070", label: "Machine # 1" }], obp: { asOf: "2026-10-13", lines: OBP, intransit: [] } }),
    pattern43: async () => ({ ok: true, version: 5, state: "clean", legend: { state: "clean", head: "NOTHING FOUND", items: [], line: "" }, pages: 1 }),
    managementList: async () => ({ ok: true, version: 4, kind: "machine-list", lifeOver: [], lifeRows: 12, recommendation: null }),
  };
}
const R2 = () => { const m = new Map(); return { put: async (k, b) => { m.set(k, new Uint8Array(b)); }, head: async (k) => (m.has(k) ? { size: m.get(k).length } : null), get: async (k) => (m.has(k) ? { arrayBuffer: async () => m.get(k).buffer, body: m.get(k) } : null) }; };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const html = (b, status = 200) => new Response(b, { status, headers: { "Content-Type": "text/html" } });
const BOARD = { sections: [{ ship: "Oasis", crew: [{ agency_id: "SC-1", name: "John Gorre", current: true, aboard: true, signOn: "2026-06-02" }] }] };
function setup() {
  const { db, DB } = d1();
  const sent = [], ctl = { mail: true }, log = [];
  const env = { DB, TIMECARD_DB: TC, HON: fakeHon(), AUDIT_FILES: R2(), AUDIT_TO: "ray@dg3.com", AUDIT_REQUEST_CC: "rolando@dg3.com", AUDIT_LIVE: "true" };
  const R = installAuditRequest({ json, htmlResponse: html, ensureAudit: ensureAuditTables, applyOverride, logActivity: async (e, who, action, detail) => { log.push([action, detail]); }, rotationSections: async () => BOARD,
    sendViaMailer: async (e, env2) => { if (!ctl.mail) return { ok: false, error: "mailer down" }; sent.push(env2 || e); return { ok: true }; } });
  const call = async (method, path, body, session = { email: "dexter.lawrence@dg3.com" }, headers = {}) => {
    const u = new URL("https://audit.cims.work" + path);
    const req = new Request(u, { method, headers: Object.assign(body instanceof Uint8Array ? {} : { "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    return R.handle(u.pathname, req, env, u, session);
  };
  return { R, env, db, sent, call, ctl, log };
}
async function makeRequest(t) {
  const r = await (await t.call("POST", "/api/audit/request", { ship: "Oasis", sc: "SC-1" })).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  const token = (t.sent[t.sent.length - 1].text.match(/\/audit\/u\/([A-Za-z0-9_-]+)/) || [])[1];
  return { id: r.id, token };
}
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

test("a stuck draft is settled by the sweep: the email went → 'sent' dated by the send; no email → cancelled; cancel accepts a draft", async () => {
  const t = setup();
  // the create's email went, the UPDATE to 'sent' never landed: the row sits as 'draft' with a sent request on the log
  const { id, token } = await makeRequest(t);
  t.db.prepare("UPDATE audit_request SET status='draft', sent_at=NULL, created_at=? WHERE id=?").run(ago(DRAFT_STALE_MIN + 5), id);
  const mailedAt = t.db.prepare("SELECT sent_at FROM audit_send_log WHERE request_id=? AND kind LIKE 'request:%' AND ok=1").get(id).sent_at;
  // the crew's link: a draft is not "Everything is in"
  const c = await (await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "2" } }, null)).json();
  assert.equal(c.error, "closed"); assert.match(c.say, /not open yet/);
  // a second request on the ship waits for it (one person at a time) — the draft holds the ship
  const pv = await (await t.call("GET", "/api/audit/request/preview?ship=Oasis&sc=SC-1")).json();
  assert.equal(pv.open && pv.open.id, id, "the draft counts as the open request");
  const sw = await t.R.sweep(t.env);
  assert.equal(sw.drafts, 1);
  const row = t.db.prepare("SELECT status, sent_at FROM audit_request WHERE id=?").get(id);
  assert.deepEqual({ ...row }, { status: "sent", sent_at: mailedAt }, "promoted to sent, dated by the send that went");
  assert.ok(t.log.some(([a]) => a === "audit_request_draft_sent"));
  // a fresh draft (seconds old) is left alone: the create is still running
  t.db.prepare("UPDATE audit_request SET status='draft', created_at=? WHERE id=?").run(ago(0), id);
  assert.equal((await t.R.sweep(t.env)).drafts, 0);
  t.db.prepare("UPDATE audit_request SET status='sent' WHERE id=?").run(id);
  // a draft whose email never went (no sent row) is cancelled after the same wait
  t.db.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, crew_name, auditor, token_hash, status, test_mode, created_at, due_at) VALUES ('ar_dead','Apex','apex','SC-9','X Y','d@dg3.com','h','draft',0,?,?)").run(ago(DRAFT_STALE_MIN + 1), ago(-600));
  assert.equal((await t.R.sweep(t.env)).drafts, 1);
  assert.equal(t.db.prepare("SELECT status, cancelled_by FROM audit_request WHERE id='ar_dead'").get().cancelled_by, "system: the request email never went");
  // cancel from the app accepts a draft too (it said not_open)
  t.db.prepare("INSERT INTO audit_request (id, ship, normalized_ship, agency_id, crew_name, auditor, token_hash, status, test_mode, created_at, due_at) VALUES ('ar_d2','Apex','apex','SC-9','X Y','d@dg3.com','h2','draft',0,?,?)").run(ago(1), ago(-600));
  const cx = await t.call("POST", "/api/audit/request/cancel", { id: "ar_d2" });
  assert.equal(cx.status, 200);
  assert.equal(t.db.prepare("SELECT status FROM audit_request WHERE id='ar_d2'").get().status, "cancelled");
  assert.equal((await t.call("POST", "/api/audit/request/resend", { id: "ar_d2" })).status, 409, "a cancelled request stays closed");
});

test("a failed re-send does not block the next one for 15 minutes (only a request email that WENT counts)", async () => {
  const t = setup();
  const { id } = await makeRequest(t);
  t.db.prepare("UPDATE audit_send_log SET sent_at=? WHERE request_id=?").run(ago(20), id);
  t.ctl.mail = false;
  const failed = await t.call("POST", "/api/audit/request/resend", { id });
  assert.equal((await failed.json()).ok, false, "the mailer is down");
  t.ctl.mail = true;
  const again = await t.call("POST", "/api/audit/request/resend", { id });
  assert.equal(again.status, 200, "the failed one is no reason to wait: " + again.status);
  assert.equal((await again.json()).ok, true);
  const third = await t.call("POST", "/api/audit/request/resend", { id });
  assert.equal(third.status, 429, "a re-send that went is the reason to wait");
});

test("a follow-up's owner is the WHOLE label: a crew named Ray is no address, and the batch says no_recipient", () => {
  assert.equal(ownerEmail("Ray"), "Ray.Guerra@dg3.com");
  assert.equal(ownerEmail("rita"), "Rita.Berenyi@dg3.com");
  assert.equal(ownerEmail("Ray Santos"), null, "the crew, by his full name — not Ray Guerra");
  assert.equal(ownerEmail("Miguel Reyes"), null);
  assert.equal(ownerEmail("Rolando Abellan"), "Rolando.Abellan@dg3.com", "one of the five by his full name is still him");
  assert.equal(ownerEmail("someone@dg3.com"), "someone@dg3.com");
  const rows = [{ status: "open", due: "2026-10-27", owner: "Ray Santos", text: "x" }, { status: "open", due: "2026-10-27", owner: "Ray", text: "y" }];
  const b = followupBatches(rows, "2026-10-27");
  assert.deepEqual(b.map((x) => [x.owner, x.email, x.due.length]).sort((p, q) => p[0].localeCompare(q[0])), [["Ray", "Ray.Guerra@dg3.com", 1], ["Ray Santos", null, 1]], "two owners, one address");
});

test("the filed and dispatch emails are owed from the filing batch: rows with ok = 0 exist even when the send never ran", async () => {
  const t = setup();
  const { id, token } = await makeRequest(t);
  // documents in, as the crew does it
  for (const kind of ["p43", "mgmt"]) {
    const u = await (await t.call("POST", "/api/audit/u/upload?t=" + token + "&serial=S1&kind=" + kind, new TextEncoder().encode("%PDF-1.4 " + kind), null, { "content-type": "application/pdf", "x-file-name": kind + ".pdf" })).json();
    await t.call("POST", "/api/audit/u/read?t=" + token + "&id=" + u.id, {}, null);
  }
  await t.call("POST", "/api/audit/u/count?t=" + token, { counts: { A1: "2", B2: "5" } }, null);
  assert.equal((await (await t.call("POST", "/api/audit/u/submit?t=" + token, {}, null)).json()).ok, true);
  t.db.prepare("UPDATE audit_request SET complete_at=? WHERE id=?").run(ago(120), id);
  const v = await (await t.call("GET", "/api/audit/visit?id=" + id)).json();
  // a clean visit: what the page's thumbs produce (test/audit_visit.test.js cleanVisit); the crew rated the dispatch
  const vis = startVisit({ machines: v.machines, diff: v.count.diff });
  vis.openedAt = ago(60); vis.hw.machines.S1.p43 = "not_seen";
  for (const x of v.count.extras) vis.inv.repairs[x.id] = "confirmed";
  vis.rt = { inventory: 4, technical: 5, collaterals: 5, why: { inventory: "", technical: "", collaterals: "" } };
  vis.ov.strengths = "Solid break-and-fix."; vis.ov.improve = "Count from the shelf, not the printer.";
  vis.crew.dispatch = 4;
  // the reads sendFiledMails makes BEFORE it logs anything fail once (a D1 hiccup): it used to leave no row at all
  const realPrepare = t.env.DB.prepare;
  let broke = 0;
  t.env.DB.prepare = (sql) => { if (/FROM audit_visit_data WHERE request_id=\?/.test(sql) && !broke) { broke++; const st = realPrepare(sql); st.first = async () => { throw new Error("D1_ERROR: lost"); }; return st; } return realPrepare(sql); };
  const f = await (await t.call("POST", "/api/audit/request/grade", { id, visit: vis })).json();
  t.env.DB.prepare = realPrepare;
  assert.equal(f.ok, true, JSON.stringify(f).slice(0, 300));
  assert.equal(f.mailed, null, "the mail step threw; the filing stands");
  const owed = t.db.prepare("SELECT kind, ok FROM audit_send_log WHERE request_id=? AND kind IN ('filed','dispatch') ORDER BY kind").all(id).map((x) => ({ ...x }));
  assert.deepEqual(owed, [{ kind: "dispatch", ok: 0 }, { kind: "filed", ok: 0 }], "both emails are on the log as owed");
  // the sweep sends them once they are 10 minutes old
  t.db.prepare("UPDATE audit_send_log SET sent_at=? WHERE request_id=? AND ok=0").run(ago(11), id);
  const before = t.sent.length;
  const sw = await t.R.sweep(t.env);
  assert.equal(sw.filedMail, 2, JSON.stringify(sw));
  assert.equal(t.sent.length - before, 2);
  assert.deepEqual(t.db.prepare("SELECT kind, ok FROM audit_send_log WHERE request_id=? AND kind IN ('filed','dispatch') ORDER BY kind").all(id).map((x) => x.ok), [1, 1]);
});

test("open site: the request detail does not name who asked", async () => {
  const t = setup();
  const { id } = await makeRequest(t);
  const open = await (await t.call("GET", "/api/audit/request?id=" + id, undefined, { email: "Dexter.Lawrence@dg3.com", open: true })).json();
  assert.equal(open.auditor, null);
  const signed = await (await t.call("GET", "/api/audit/request?id=" + id)).json();
  assert.equal(signed.auditor, "dexter.lawrence@dg3.com", "signed in, as before");
});

test("ships: a seat with no sign-on takes only a request on ITS hull as this contract's audit, and says the match is by hull", async () => {
  const reqs = [
    { id: "ar_old", ship: "Allure", agency_id: "SC-1", crew_name: "John Gorre", status: "complete", created_at: "2026-02-01T00:00:00Z", sent_at: null, due_at: null, overdue_at: null, complete_at: null, test_mode: 0, grade: 4 },
  ];
  const fakeDb = { prepare: (sql) => { const s = { bind: () => s, all: async () => ({ results: /FROM audit_request r/.test(sql) && /e\.score AS grade/.test(sql) ? reqs : [] }), first: async () => null, run: async () => ({}) }; return s; } };
  const SECTIONS = { sections: [
    { ship: "Oasis", brand: "Royal", crew: [{ agency_id: "SC-1", name: "John Gorre", current: true, aboard: true, signOn: null, signOff: null, contracts: 3 }] },
    { ship: "Allure", brand: "Royal", crew: [{ agency_id: "SC-2", name: "A B", current: true, aboard: true, signOn: null, contracts: 0 }] },
  ] };
  const H = installAudit({ json, htmlResponse: html, ensureAudit: async () => {}, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-27", crewProfile: async () => ({ error: "x" }) });
  const u = new URL("https://audit.cims.work/api/audit/ships");
  const r = await (await H(u.pathname, new Request(u), { DB: fakeDb }, u, { email: "dexter.lawrence@dg3.com" })).json();
  const oasis = r.ships.find((s) => s.ship === "Oasis");
  assert.equal(oasis.aboard[0].audit, null, "John's old Allure audit is not his undated Oasis contract's");
  reqs.push({ id: "ar_here", ship: "Oasis", agency_id: "SC-1", crew_name: "John Gorre", status: "complete", created_at: "2026-09-01T00:00:00Z", test_mode: 0, grade: 5 });
  const r2 = await (await H(u.pathname, new Request(u), { DB: fakeDb }, u, { email: "dexter.lawrence@dg3.com" })).json();
  const a = r2.ships.find((s) => s.ship === "Oasis").aboard[0].audit;
  assert.equal(a && a.id, "ar_here"); assert.equal(a.undated, true, "matched by hull, and said so");
});

test("the service worker never caches the crew's page as the app's shell", () => {
  assert.match(AUDIT_SW, /u\.pathname\.startsWith\("\/audit\/u\/"\)\) return;/);
});
