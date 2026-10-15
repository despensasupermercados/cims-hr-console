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
const H = installAudit({ json, htmlResponse, ensureAudit: async () => { ensured++; }, rotationSections: async () => SECTIONS, TODAY: () => "2026-10-14",
  crewProfile: async (env, sc) => (sc === "SC-1" ? { crew: { first_name: "John", last_name: "Gorre", email: "j@x.com" }, profile: {
    count: { n: 3, asOf: "2026-10-08", added: 0, position: "Senior PS" },
    contracts: [{ current: true, ship: "Oasis", on: "2026-06-02", off: "2027-01-03", offSource: "projected", days: 134, plannedDays: 215 }],
    people: { feed: [{ at: "2026-09-01", kind: "feedback", role: "inventory", who: "Ray", answers: { mono: 4, note: "ok" } }, { at: "2026-08-01", kind: "feedback", superseded: true, answers: {} }], slots: [] },
    checks: [{ text: "check me" }] } } : { error: "not found" }) });
const S = { email: "dexter.lawrence@dg3.com" };
const call = (url, session = S, env = { DB: fakeDb() }) => { const u = new URL(url); return H(u.pathname, new Request(u), env, u, session); };

test("the shell: audit.cims.work/ and cims.work/audit, behind the login; cims.work/ stays the console", async () => {
  const r = await call("https://audit.cims.work/");
  assert.equal(r.status, 200); assert.match(await r.text(), /<title>Printshop Audit<\/title>/);
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

test("the briefing: what reached the ship this contract, from OBP's received ledger in HON's D1 (Miguel, 16 Oct 2026)", async () => {
  const seen = [];
  const HON_DB = { prepare: (sql) => { const s = { bind: (...a) => { seen.push({ sql, a }); return s; }, all: async () => ({ results: [
    { d: "2026-05-01", c: "Parts", t: "TN619C CYAN TONER", v: 845.1, q: 10, s: "2026-10-15" },
    { d: "2026-07-01", c: "Supplies", t: "20 LBS 8.5 x 11 DG3 PAPER", v: 364.8, q: 10, s: "2026-10-15" },
    { d: "2026-05-20", c: "Parts", t: "DR620 COLOR DRUM", v: 0, q: 1, s: "2026-10-15" },
    { d: "2026-01-01", c: "Parts", t: "TN634K BLACK TONER", v: 999, q: 30, s: "2026-10-15" },
  ] }) }; return s; } };
  const b = await (await call("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1", S, { DB: fakeDb(), HON_DB })).json();
  assert.equal(seen.length, 1, "one read, in the briefing's wave");
  assert.match(seen[0].sql, /^SELECT\b/);
  assert.deepEqual(seen[0].a, ["oasis", "2025-07-11", "2026-10-14"], "OBP's ship name, a lower bound wide enough for any contract, to today");
  assert.equal(b.supply.from, "2026-06-02", "cut to this contract's sign-on");
  assert.deepEqual(b.supply.products.map((p) => [p.key, p.value]), [["paper", 364.8]], "the May toner predates the sign-on; a $0 drum is not shown");
  const none = await (await call("https://audit.cims.work/api/audit/brief?ship=Oasis&sc=SC-1")).json();
  assert.equal(none.supply, null, "no HON binding: no card, never a zero");
});
