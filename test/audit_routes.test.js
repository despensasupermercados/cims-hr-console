// Printshop Audit — the routes (src/audit_routes.js), 14 Oct 2026: the host switch, the session gate, the ships list
// and the briefing, against fakes. Nothing here sends or writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installAudit } from "../src/audit_routes.js";

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const htmlResponse = (b) => new Response(b, { headers: { "Content-Type": "text/html" } });
const fakeDb = (rows = []) => ({ prepare: () => { const s = { bind: () => s, all: async () => ({ results: rows }), first: async () => null, run: async () => ({}) }; return s; } });
const SECTIONS = { sections: [
  { ship: "Oasis", brand: "Royal", crew: [
    { agency_id: "SC-1", name: "John Gorre", current: true, aboard: true, signOn: "2026-06-02", signOff: "2027-01-03", contracts: 3 },
    { agency_id: "SC-2", name: "Earmark Person", current: false, aboard: false, signOn: "2027-01-01", contracts: 1 },
  ] },
  { ship: "Apex", brand: "Celebrity", crew: [] },
  { ship: "Allure", brand: "Royal", crew: [{ agency_id: "SC-3", name: "A B", current: true, aboard: true, signOn: "2026-09-01", contracts: 0 }] },
] };
let ensured = 0;
const H_PROFILE = async (env, sc) => (sc === "SC-1" ? { crew: { first_name: "John", last_name: "Gorre", email: "j@x.com" }, profile: {
    count: { n: 3, asOf: "2026-10-08", added: 0, position: "Senior PS" },
    contracts: [{ current: true, ship: "Oasis", on: "2026-06-02", off: "2027-01-03", offSource: "projected", days: 134, plannedDays: 215 }],
    people: { feed: [{ at: "2026-09-01", kind: "feedback", role: "inventory", who: "Ray", answers: { mono: 4, note: "ok" } }, { at: "2026-08-01", kind: "feedback", superseded: true, answers: {} }], slots: [] },
    checks: [{ text: "check me" }] } } : { error: "not found" });
const H = installAudit({ json, htmlResponse, ensureAudit: async () => { ensured++; }, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-14", crewProfile: H_PROFILE });
const S = { email: "dexter.lawrence@dg3.com" };
const call = (url, session = S, env = { DB: fakeDb() }) => { const u = new URL(url); return H(u.pathname, new Request(u), env, u, session); };

test("the shell: audit.cims.work/ and cims.work/audit, behind the login; cims.work/ stays the console", async () => {
  const r = await call("https://audit.cims.work/");
  assert.equal(r.status, 200); assert.match(await r.text(), /<title>Printshop Ops Audit<\/title>/);
  assert.equal((await call("https://cims.work/audit")).status, 200);
  assert.equal(await call("https://cims.work/"), null);
  assert.equal(await call("https://cims.work/crew"), null);
  const out = await call("https://audit.cims.work/", null);
  assert.equal(out.status, 302); assert.equal(out.headers.get("Location"), "https://audit.cims.work/login");
  assert.equal(await call("https://audit.cims.work/login", null), null, "the login page is the console's own");
});

test("manifest and service worker are served without a session; the worker may control /", async () => {
  const m = await call("https://audit.cims.work/audit/manifest.webmanifest", null);
  const j = JSON.parse(await m.text());
  assert.equal(j.start_url, "/"); assert.equal(j.display, "standalone");
  assert.equal(JSON.parse(await (await call("https://cims.work/audit/manifest.webmanifest", null)).text()).start_url, "/audit");
  const sw = await call("https://audit.cims.work/audit/sw.js", null);
  assert.equal(sw.headers.get("Service-Worker-Allowed"), "/");
  assert.match(await sw.text(), /startsWith\("\/api\/"\)/, "the service worker never caches the API");
});

test("every /api/audit route needs a session", async () => {
  for (const p of ["health", "ships", "brief?sc=SC-1", "nope"]) assert.equal((await call("https://audit.cims.work/api/audit/" + p, null)).status, 401, p);
  assert.equal((await call("https://audit.cims.work/api/audit/nope")).status, 404);
});

test("ships: who is aboard per the board, earmarks left out, aboard first", async () => {
  const r = await (await call("https://audit.cims.work/api/audit/ships")).json();
  assert.equal(r.auditor, "dexter.lawrence@dg3.com");
  assert.deepEqual(r.ships.map((s) => s.ship), ["Allure", "Oasis", "Apex"]);
  const oasis = r.ships.find((s) => s.ship === "Oasis");
  assert.deepEqual(oasis.aboard.map((c) => c.sc), ["SC-1"]);
  assert.equal(oasis.aboard[0].contract, "3 completed · on contract 4");
  assert.ok(ensured > 0, "the tables are ensured before they are read");
});

test("the briefing: contract label with its source, the live feedback only, never the crew record's To-check rows", async () => {
  const b = await (await call("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1")).json();
  assert.equal(b.crew.name, "John Gorre");
  assert.equal(b.contract.label, "3 completed · on contract 4");
  assert.equal(b.contract.source, "TDG count as of 2026-10-08");
  assert.equal(b.contract.current.day, 134);
  assert.equal(b.feed.length, 1, "a superseded answer is not briefed");
  assert.equal(b.feed[0].text, "Mono clicks 4% (target under 20%). “ok”", "feedback answers read as sentences (audit_plain.js)");
  assert.equal(b.checks, undefined, "HR's housekeeping is not the auditor's (Miguel, 16 Oct 2026)");
  assert.equal((await call("https://audit.cims.work/api/audit/brief?sc=SC-9")).status, 404);
  assert.equal((await call("https://audit.cims.work/api/audit/brief")).status, 400);
});

test("health reports the bindings without touching a secret", async () => {
  const env = { DB: fakeDb(), AUDIT_FILES: { head: async () => null }, TIMECARD_DB: { prepare: () => ({ first: async () => ({ n: 188 }) }) }, AUDIT_TO: "a@x.com, b@x.com", MAILER: {} };
  const h = await (await call("https://audit.cims.work/api/audit/health", S, env)).json();
  assert.equal(h.ok, true); assert.equal(h.r2, "ok"); assert.equal(h.shipContacts, 188); assert.equal(h.recipients, 2);
  assert.deepEqual(h.bindings, { AUDIT_FILES: true, TIMECARD_DB: true, MAILER: true, HON: false });
});

// OPEN MODE (Miguel, 15 Oct 2026: "No login on the audit site"): audit.cims.work answers without a sign-in, as Dexter;
// cims.work/audit and the console do not.
test("open mode: audit.cims.work needs no sign-in, acts as AUDIT_OPEN_AS; nothing else opens", async () => {
  const env = { DB: fakeDb(), AUDIT_OPEN: "true", AUDIT_OPEN_AS: "Dexter.Lawrence@dg3.com" };
  const shell = await call("https://audit.cims.work/", null, env);
  assert.equal(shell.status, 200); assert.equal(shell.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.deepEqual(await (await call("https://audit.cims.work/api/me", null, env)).json(), { email: "Dexter.Lawrence@dg3.com", open: true });
  const ships = await (await call("https://audit.cims.work/api/audit/ships", null, env)).json();
  assert.equal(ships.auditor, "Dexter.Lawrence@dg3.com");
  assert.equal((await call("https://cims.work/audit", null, env)).status, 302, "cims.work/audit keeps its login");
  assert.equal(await call("https://cims.work/api/me", null, env), null, "the console's own routes are never answered here");
  assert.equal((await call("https://audit.cims.work/", null, { DB: fakeDb() })).status, 302, "without the switch, the login is back");
});

test("open mode: the briefing answers only for crew aboard (or already asked); no personal address, reporters by name", async () => {
  const prof = { crew: { first_name: "Any", last_name: "One", email: "private@gmail.com" }, profile: { contracts: [], people: { feed: [
    { at: "2026-10-08", kind: "intel", who: "Ray Guerra <ray.guerra@dg3.com>", text: "• Summary: late order." },
    { at: "2026-10-01", kind: "intel", who: "rolando.abellan@dg3.com", text: "• Summary: drum dirty." }] }, checks: [] } };
  const H2 = installAudit({ json, htmlResponse, ensureAudit: async () => {}, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-14", crewProfile: async () => prof });
  const env = { DB: fakeDb(), AUDIT_OPEN: "true", AUDIT_OPEN_AS: "Dexter.Lawrence@dg3.com" };
  const c = (url, session = null) => { const u = new URL(url); return H2(u.pathname, new Request(u), env, u, session); };
  assert.equal((await c("https://audit.cims.work/api/audit/brief?sc=SC-2")).status, 404, "an earmark, not aboard: not on the open site");
  assert.equal((await c("https://audit.cims.work/api/audit/brief?sc=SC-77")).status, 404, "any id: not on the open site");
  const b = await (await c("https://audit.cims.work/api/audit/brief?sc=SC-3")).json();
  assert.equal(b.crew.email, null, "no personal address on the open site");
  assert.deepEqual(b.feed.map((f) => f.who), ["Ray Guerra", "Rolando Abellan"]);
  const signedIn = await (await c("https://audit.cims.work/api/audit/brief?sc=SC-2", S)).json();
  assert.equal(signedIn.crew.email, "private@gmail.com", "a signed-in user still reads the whole briefing");
});

test("a POST from another site or another *.cims.work app is refused (the shared cookie, CSRF)", async () => {
  const env = { DB: fakeDb() };
  const post = (origin) => { const u = new URL("https://audit.cims.work/api/audit/request/cancel"); return H(u.pathname, new Request(u, { method: "POST", headers: origin ? { Origin: origin } : {}, body: "{}" }), env, u, S); };
  assert.equal((await post("https://hon.cims.work")).status, 403);
  assert.equal((await post("https://evil.example")).status, 403);
  assert.notEqual((await post("https://audit.cims.work")).status, 403, "the audit's own page passes");
});

test("the briefing: rush orders this contract, the portal's misses on this hull from the sign-on (Miguel, 16 Oct 2026)", async () => {
  const seen = [];
  const rushOrders = {
    read: async (env, from, to) => { seen.push([from, to]); return [{ order_ref: "CIMS-1", ship: "Oasis", submitted_at: "2026-09-01T10:00:00Z", miss_reason: "equipment", requester: "John Gorre", subtotal: 50, freight: 90, clearance: 10, grand_total: 150, items: "[]" },
      { order_ref: "CIMS-0", ship: "Oasis", submitted_at: "2026-05-01T10:00:00Z", miss_reason: "vessel", requester: "John Gorre", subtotal: 10, freight: 90, clearance: 10, grand_total: 110, items: "[]" }]; },
    summarize: async (env, rows, args) => { seen.push(args); return (await import("../src/rush_orders.js")).rushSummary(rows, args); },
  };
  const H2 = installAudit({ json, htmlResponse, ensureAudit: async () => {}, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-14", crewProfile: H_PROFILE, rushOrders });
  const u = new URL("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1");
  const b = await (await H2(u.pathname, new Request(u), { DB: fakeDb() }, u, S)).json();
  assert.deepEqual(seen[0], ["2025-07-11", "2026-10-14"], "one read in the briefing's wave, wide enough for any contract");
  assert.deepEqual(seen[1], { sc: "SC-1", ship: "Oasis", from: "2026-06-02", to: "2026-10-14" }, "cut to the contract: sign-on to today while it runs");
  assert.deepEqual(b.rush.orders.map((o) => o.ref), ["CIMS-1"], "May is before the sign-on");
  assert.equal(b.rush.total, 150); assert.equal(b.rush.rush, 100);
  const none = await (await call("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1")).json();
  assert.equal(none.rush, null, "no portal read: no card, never a zero");
});

test("16 Oct 2026 review: an overdue contract's rush window runs to today; a finished TEST audit is not open; the open site never shows who asked", async () => {
  const seen = [];
  const prof = async () => ({ crew: { first_name: "John", last_name: "Gorre" }, profile: { contracts: [{ current: true, ship: "Oasis", on: "2026-03-01", off: "2026-09-30", offSource: "projected" }], people: { feed: [] }, checks: [] } });
  const rushOrders = { read: async () => [], summarize: async (env, rows, args) => { seen.push(args); return null; } };
  const H2 = installAudit({ json, htmlResponse, ensureAudit: async () => {}, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-14", crewProfile: prof, rushOrders });
  const rows = [{ id: "ar_t", ship: "Oasis", status: "complete", test_mode: 1, grade: null, auditor: "miguel.sanmartin@dg3.com", created_at: "2026-10-14T10:00:00Z" }];
  const c = (session, env) => { const u = new URL("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1"); return H2(u.pathname, new Request(u), env || { DB: fakeDb(rows) }, u, session); };
  const b = await (await c(S)).json();
  assert.equal(seen[0].to, "2026-10-14", "past the projected sign-off and still aboard: the misses after it count");
  assert.equal(b.open, null, "a TEST request cannot be graded, so it never holds the crew 'open'");
  const o = await (await c(null, { DB: fakeDb(rows), AUDIT_OPEN: "true", AUDIT_OPEN_AS: "Dexter.Lawrence@dg3.com" })).json();
  assert.equal(o.audits[0].by, null, "who asked is not for anonymous visitors");
});

test("ships: the server says which ship has a request still open (one person at a time per ship, isOpenRequest)", async () => {
  const row = (o) => Object.assign({ id: "ar_1", ship: "Oasis", agency_id: "SC-1", crew_name: "John Gorre", created_at: "2026-10-16T10:00:00Z", test_mode: 0, grade: null }, o);
  const open = async (o) => (await (await call("https://audit.cims.work/api/audit/ships", undefined, { DB: fakeDb([row(o)]) })).json()).ships.find((s) => s.ship === "Oasis").open;
  assert.equal(await open({ status: "sent" }), true);
  assert.equal(await open({ status: "draft" }), true, "the page's old test missed a draft");
  assert.equal(await open({ status: "complete" }), true, "in and not graded");
  assert.equal(await open({ status: "complete", grade: 4 }), false, "graded is finished");
  assert.equal(await open({ status: "complete", test_mode: 1 }), false, "a TEST request in cannot be graded: finished");
});

// Miguel, 20 Oct 2026, on Grandeur reading "Nobody aboard": "this is wrong.. look at the hr console". The landing reads
// the board's three kinds of seat: TDG's On board seat, TDG's Earmarked word for the hull a contract still runs on
// (earmarkedHere, Purnama on Xcel), and Rita's card past its sign-on, green "awaiting the TDG file" (Corpin on Grandeur).
test("ships: aboard as the Keyman board draws it — the awaiting card and the earmarked-here seat count", async () => {
  const board = { sections: [
    { ship: "Grandeur", brand: "Royal", crew: [], projections: [
      { agency_id: "SC-20", name: "Archiegale Corpin", state: "yellow", aboard: true, awaiting: true, signOn: "2026-10-07", signOff: "2027-05-07", contracts: 2 },
      { agency_id: "SC-21", name: "Next Person", state: "yellow", aboard: false, awaiting: false, signOn: "2027-05-07", contracts: 1 },
    ] },
    { ship: "Xcel", brand: "Celebrity", crew: [
      { agency_id: "SC-30", name: "Ida Purnama", current: false, earmarkedHere: true, aboard: true, signOn: "2026-04-21", signOff: "2026-11-21", contracts: 4 },
    ], projections: [] },
    { ship: "Edge", brand: "Celebrity", crew: [
      { agency_id: "SC-40", name: "Gone Ashore", current: false, aboard: true, signOn: "2026-03-01", contracts: 1 },
    ], projections: [] },
  ] };
  const H3 = installAudit({ json, htmlResponse, ensureAudit: async () => {}, rotationSections: async () => board, TODAY: () => "2026-10-20", crewProfile: H_PROFILE });
  const u = new URL("https://audit.cims.work/api/audit/ships");
  const r = await (await H3(u.pathname, new Request(u), { DB: fakeDb() }, u, S)).json();
  const of = (n) => r.ships.find((s) => s.ship === n).aboard.map((c) => c.sc);
  assert.deepEqual(of("Grandeur"), ["SC-20"], "the awaiting card is aboard; the plan after it is not");
  assert.deepEqual(of("Xcel"), ["SC-30"], "TDG's Earmarked word for the hull he is on: aboard");
  assert.deepEqual(of("Edge"), [], "an ashore crew is still nobody aboard");
});

// Miguel, 20 Oct 2026, the briefing's "Audits of Pursuit" read "The 61 Forms audits are not imported yet": "ensure this is
// wire correctly". The card reads the ship's filed audits AND its Forms survey audits, newest first.
test("the briefing's ship audits include the Forms survey's, newest first", async () => {
  const db = { prepare: (sql) => { const s = { bind: () => s, first: async () => null, run: async () => ({}),
    all: async () => ({ results: /FROM audit_forms/.test(sql) ? [{ id: "forms-12", crew_name: "Kevin Jugao", crew_raw: "Kevin", score: 4, audit_date: "2025-06-03" }]
      : /JOIN audit_eval e ON e\.request_id = r\.id WHERE r\.normalized_ship/.test(sql) ? [{ id: "ar_1", crew_name: "John Gorre", score: 5, filed_at: "2026-09-01T10:00:00Z" }] : [] }) }; return s; } };
  const b = await (await call("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1", S, { DB: db })).json();
  assert.deepEqual(b.shipAudits.map((a) => [a.id, a.source || "app", a.score]), [["ar_1", "app", 5], ["forms-12", "forms", 4]]);
  assert.equal(b.shipAudits[1].crew, "Kevin Jugao");
});
