// THE CREW HUB (Miguel, 19 Oct 2026: per-crew link, "deploy"): the page, the payroll data, the routes on REAL SQLite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hubPage, hubGonePage, HUB_UPDATED, hubHomePage, HUB_HOST } from "../src/crew_hub.js";
import { PAYROLL, payrollRows, nextPayday } from "../src/payroll.js";
import { installHub, HUB_DDL, hubModel, currentLeg, newHubToken, TOKEN_RX } from "../src/crew_hub_routes.js";
import { EXPENSE_XLSX_B64 } from "../src/hub_assets.js";
import { ladderValue, FLOOR } from "../src/bonus.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

function db() {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT, first_name TEXT, last_name TEXT, baseline_count INTEGER)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  d.exec("INSERT INTO crew VALUES ('c1','SC-1','Archie Joseph','Corpin',2), ('c2','SC-2','<img src=x>','Doe',NULL)");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
  });
  return { d, env: { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } } };
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const LEGS = [
  { sc: "SC-1", ship: "Grandeur of the Seas", brand: "Royal", on: "2026-10-18", off: "2027-05-18", is_current: true, ours: true, source: "registry", offSource: "projected" },
  { sc: "SC-1", ship: "Vision of the Seas", brand: "Royal", on: "2026-01-02", off: "2026-08-01", is_current: false, ours: true },
];
function hub(over = {}) {
  const { d, env } = db();
  const ensure = async (e) => { for (const q of HUB_DDL) await e.DB.prepare(q).run(); };
  const h = installHub({ ensure, boardLegs: async () => LEGS, bonusCount: async (e, sc) => (sc === "SC-1" ? 2 : null), json, today: () => "2026-10-19", ...over });
  return { d, env, h };
}
const req = (path, method = "GET", body) => new Request("https://cims.work" + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const RITA = { email: "Rita.Berenyi@dg3.com" };

test("node:sqlite is available, so the route tests below actually run", () => assert.ok(DatabaseSync));

test("payroll: every published year has twelve months, in order, each paid after its month starts", () => {
  for (const [y, rows] of Object.entries(PAYROLL)) {
    assert.equal(rows.length, 12, y);
    rows.forEach(([m, paid], i) => { assert.equal(+m, i + 1); assert.ok(paid > `${y}-${m}-01`, `${y}-${m} paid ${paid}`); if (i) assert.ok(paid > rows[i - 1][1]); });
  }
  assert.equal(payrollRows(2026).length, 12);
  assert.deepEqual(payrollRows(2031), []);
});

test("payroll: the next payday on or after today, into next year only when it is published", () => {
  assert.deepEqual(nextPayday("2026-10-19"), { year: 2026, m: 10, paid: "2026-11-04", inDays: 16 });
  assert.equal(nextPayday("2026-11-04").inDays, 0);
  assert.equal(nextPayday("2026-12-31"), null, "2027 is not published yet: no date is invented");
  const withNext = { ...PAYROLL, 2027: [["12", "2027-01-06"]] };
  assert.equal(nextPayday("2026-12-31", withNext).paid, "2027-01-06");
});

test("the page: the approved bonus wording, the ladder read from bonus.js, the step times the score", () => {
  const h = hubPage({ first: "Archie", ship: "Grandeur of the Seas", code: "GR", brand: "Royal", on: "2026-10-18", off: "2027-05-18", offSource: "projected", offProjected: true, contractNo: 3, today: "2026-10-19" });
  assert.match(h, /Contract 3 in a row/);
  assert.match(h, /Worth up to <b[^>]*>\$500<\/b>\. The next one, up to \$750\./);
  assert.match(h, /Every contract in a row is worth more/);
  assert.match(h, /Up to \$2,000 a contract\. Nine in a row add up to \$9,000\./);
  assert.match(h, new RegExp(`Score ${FLOOR} or more</b>You are paid the step, times your score\\. A score of 90 on a \\$500 step pays \\$450\\.`));
  assert.match(h, /Evaluation below 3<\/b>No bonus for this contract\. Your count stays where it is\./);
  assert.match(h, /Back to contract 1<\/b>Not finishing the contract, a rush order from a missed order, or a failed inventory audit\./);
  assert.match(h, /A compassionate sign-off does not reset you\./);
  for (let n = 2; n <= 9; n++) assert.ok(h.includes("$" + ladderValue(n).toLocaleString("en-US")), "rung " + n);
  assert.match(h, /Wed 4 Nov/);
  assert.match(h, /Day 2 of 212/);
  assert.match(h, /Sign-off projected\. TDG confirms it later\./);
  assert.match(h, /Updated 19 Oct 2026/);
  assert.equal(HUB_UPDATED, "19 Oct 2026");
  assert.match(h, /noindex/);
});

test("the page never invents: no count -> the ladder only; no contract -> between contracts; names escaped", () => {
  const h = hubPage({ first: "<img src=x>", today: "2026-10-19", contractNo: null });
  assert.doesNotMatch(h, /in a row<\/div>/, "no personal contract number without a known count");
  assert.match(h, /Multi Contract Bonus/);
  assert.match(h, /Between contracts/);
  assert.doesNotMatch(h, /<img src=x>/);
  assert.match(h, /&lt;img src=x&gt;/);
  assert.match(h, /A score of 90 on a \$500 step pays \$450/, "the example uses a generic step");
  assert.match(hubPage({ first: "A", on: "2026-10-18", off: "2026-11-01", offSource: "tdg", ship: "X", today: "2026-10-19" }), /Sign-off confirmed by TDG\./);
  assert.match(hubPage({ first: "A", on: "2026-10-18", off: "2026-11-01", offSource: "rita", ship: "X", today: "2026-10-19" }), /Sign-off planned by Rita\./);
});

test("the model: the running leg only, never a training visit; contract number = consecutive count + 1", () => {
  assert.equal(currentLeg(LEGS, "SC-1").ship, "Grandeur of the Seas");
  assert.equal(currentLeg([{ ...LEGS[0], visit: true }], "SC-1"), null);
  const m = hubModel({ crew: { first_name: "Archie Joseph" }, leg: LEGS[0], count: 2, today: "2026-10-19" });
  assert.equal(m.first, "Archie");
  assert.equal(m.contractNo, 3);
  assert.equal(m.code, "GR");
  assert.equal(hubModel({ crew: { first_name: "X" }, leg: null, count: null, today: "2026-10-19" }).contractNo, null);
});

test("tokens: 192 random bits, URL-safe, never the crew id", () => {
  const a = newHubToken(), b = newHubToken();
  assert.match(a, TOKEN_RX);
  assert.notEqual(a, b);
  assert.equal(a.length, 32);
});

test("routes: a link is made once, opens the crew's page without a session, and stops when revoked", async () => {
  const { d, env, h } = hub();
  assert.equal((await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-1" }), env, new URL("https://cims.work/api/hub/link"), null)).status, 401);
  const r1 = await (await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-1" }), env, new URL("https://cims.work/api/hub/link"), RITA)).json();
  assert.ok(r1.ok && r1.created);
  assert.match(r1.url, /^https:\/\/cims\.work\/hub\/[A-Za-z0-9_-]{32}$/);
  const r2 = await (await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-1" }), env, new URL("https://cims.work/api/hub/link"), RITA)).json();
  assert.equal(r2.url, r1.url, "the same link every time until revoked");
  const path = new URL(r1.url).pathname;
  const page = await h(path, req(path), env, new URL("https://cims.work" + path), null);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("Cache-Control"), "no-store");
  assert.equal(page.headers.get("Referrer-Policy"), "no-referrer");
  const html = await page.text();
  assert.match(html, /Hi Archie\./);
  assert.match(html, /Contract 3 in a row/);
  assert.ok(d.prepare("SELECT last_seen_at FROM crew_hub_link").get().last_seen_at);
  const rv = await (await h("/api/hub/revoke", req("/api/hub/revoke", "POST", { agency_id: "SC-1" }), env, new URL("https://cims.work/api/hub/revoke"), RITA)).json();
  assert.equal(rv.revoked, 1);
  assert.equal((await h(path, req(path), env, new URL("https://cims.work" + path), null)).status, 404);
  const r3 = await (await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-1" }), env, new URL("https://cims.work/api/hub/link"), RITA)).json();
  assert.notEqual(r3.url, r1.url, "after a revoke the next link is a new one");
  assert.deepEqual(d.prepare("SELECT action FROM activity_log ORDER BY rowid").all().map((x) => x.action), ["crew_hub_link", "crew_hub_revoke", "crew_hub_link"]);
});

test("routes: unknown crew, a malformed or unknown token, and HUB_ORIGIN", async () => {
  const { env, h } = hub();
  assert.equal((await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-9" }), env, new URL("https://cims.work/api/hub/link"), RITA)).status, 404);
  assert.equal((await h("/hub/short", req("/hub/short"), env, new URL("https://cims.work/hub/short"), null)).status, 404);
  const t = "/hub/" + newHubToken();
  const gone = await h(t, req(t), env, new URL("https://cims.work" + t), null);
  assert.equal(gone.status, 404);
  assert.equal(await gone.text(), hubGonePage());
  const r = await (await h("/api/hub/link", req("/api/hub/link", "POST", { agency_id: "SC-2" }), { ...env, HUB_ORIGIN: "https://hub.cims.work/" }, new URL("https://cims.work/api/hub/link"), RITA)).json();
  assert.match(r.url, /^https:\/\/hub\.cims\.work\/hub\//);
  const p2 = new URL(r.url).pathname;
  const html = await (await h(p2, req(p2), env, new URL("https://cims.work" + p2), null)).text();
  assert.doesNotMatch(html, /<img src=x>/, "a name from the database is escaped");
  assert.match(html, /Multi Contract Bonus/, "no baseline and no outcome: the ladder only");
});

test("the expense report served is byte for byte the approved v3 file", async () => {
  const { env, h } = hub();
  const res = await h("/hub/expense.xlsx", req("/hub/expense.xlsx"), env, new URL("https://cims.work/hub/expense.xlsx"), null);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Disposition"), /Expense Report Template\.xlsx/);
  const got = Buffer.from(await res.arrayBuffer());
  const want = readFileSync(new URL("../docs/mockups/welcome_20261019/expense_report_v3.xlsx", import.meta.url));
  assert.ok(got.equals(want));
  assert.equal(Buffer.from(EXPENSE_XLSX_B64, "base64").length, want.length);
});

test("wiring: the Worker routes /hub/ before the session gate, reads the count without writing it, and the guard's DDL matches the migration", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /if \(p\.startsWith\("\/hub\/"\) \|\| p\.startsWith\("\/api\/hub\/"\)\) \{ const _w = await _welcome\.handle\(p, request, env, url, session\); if \(_w\) return _w; const _h = await _hub\(p, request, env, url, session\); if \(_h\) return _h; \}/);
  const body = W.slice(W.indexOf("async function hubBonusCount("), W.indexOf("async function crewCount("));
  assert.doesNotMatch(body, /INSERT|UPDATE|DELETE/i, "the hub never writes the bonus count (§1)");
  const mig = readFileSync(new URL("../migrations/0034_crew_hub_link.sql", import.meta.url), "utf8");
  for (const c of ["token", "agency_id", "created_at", "created_by", "revoked_at", "revoked_by", "last_seen_at"]) { assert.match(mig, new RegExp(c)); assert.match(HUB_DDL[0], new RegExp(c)); }
  const R = readFileSync(new URL("../src/crew_hub_routes.js", import.meta.url), "utf8");
  assert.doesNotMatch(R, /bonus_outcome|baseline_count/, "the routes module reads no money table itself");
});

test("hub.cims.work with no link: the hub's landing page, never the console", () => {
  const h = hubHomePage();
  assert.match(h, /Your CIMS Crew Hub/);
  assert.match(h, /welcome-aboard email/);
  assert.match(h, /href="\/hub\/expense\.xlsx"/);
  assert.doesNotMatch(h, /This link is not active/);
  assert.equal(HUB_HOST, "hub.cims.work");
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  const at = W.indexOf('if (url.hostname === HUB_HOST && !p.startsWith("/hub/")) return new Response(hubHomePage()');
  assert.ok(at > 0 && at < W.indexOf('if (p === "/login")'), "the hub host answers before the console's login");
});

test("crew view: the preview is the crew's own page, signed in only, and makes no link", async () => {
  const { d, env, h } = hub();
  const go = (path, sess) => h(path.split("?")[0], req(path), env, new URL("https://cims.work" + path), sess);
  assert.equal((await go("/api/hub/preview?id=SC-1", null)).status, 401);
  const res = await go("/api/hub/preview?id=SC-1", RITA);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Hi Archie\./);
  assert.match(html, /Contract 3 in a row/);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='crew_hub_link'").get().n, 0, "a look writes nothing");
  assert.equal((await go("/api/hub/preview?id=SC-9", RITA)).status, 404);
});

test("crew view: the audit lists each value the page shows with its source", async () => {
  const { env, h } = hub({ countDetail: async () => ({ count: 2, source: "outcome", at: "2026-09-01T10:00:00Z" }),
    contacts: async () => [{ ship: "Grandeur of the Seas", email: "printer.gr@rccl.com", role: "printer_specialist" }] });
  const go = (path, sess) => h(path.split("?")[0], req(path), env, new URL("https://cims.work" + path), sess);
  assert.equal((await go("/api/hub/audit?id=SC-1", null)).status, 401);
  const a = await (await go("/api/hub/audit?id=SC-1", RITA)).json();
  assert.equal(a.name, "Archie Joseph Corpin");
  assert.equal(a.shown.contractNo, 3, "the audit reads the very model the page draws");
  assert.deepEqual([a.contract.ship, a.contract.on, a.contract.offSource], ["Grandeur of the Seas", "2026-10-18", "projected"]);
  assert.deepEqual(a.count, { count: 2, source: "outcome", at: "2026-09-01T10:00:00Z" });
  assert.equal(a.payday.paid, "2026-11-04");
  assert.equal(a.link.live, false);
  assert.equal(a.welcome.shipMailbox, "printer.gr@rccl.com");
  assert.deepEqual(a.welcome.sent, []);
});

test("crew view: one example per case, never invented, and everyone in the picker", async () => {
  const { hubExamples } = await import("../src/crew_hub_routes.js");
  const rows = [{ agency_id: "SC-1", first_name: "Archie", last_name: "Corpin" }, { agency_id: "SC-2", first_name: "Bea", last_name: "Az" },
    { agency_id: "SC-3", first_name: "Cy", last_name: "Home" }, { agency_id: "SC-4", first_name: "Dee", last_name: "Old" }];
  const legs = [
    { sc: "SC-1", ship: "Grandeur of the Seas", brand: "Royal", on: "2026-10-18", off: "2027-05-18", is_current: true },
    { sc: "SC-2", ship: "Azamara Quest", brand: "Azamara", on: "2026-06-01", off: "2026-11-01", is_current: true },
    { sc: "SC-4", ship: "Vision of the Seas", brand: "Royal", on: "2026-04-01", off: "2026-11-01", is_current: true },
  ];
  const r = hubExamples(rows, legs, new Set(["SC-4"]), "2026-10-19");
  assert.equal(r.crew.length, 4);
  const by = Object.fromEntries(r.examples.map((x) => [x.label, x.sc]));
  assert.equal(by["Aboard · contract number"], "SC-4");
  assert.equal(by["Aboard · no count on record"], "SC-1");
  assert.equal(by["Just signed on"], "SC-1");
  assert.equal(by["Azamara"], "SC-2");
  assert.equal(by["Between contracts"], "SC-3");
  assert.equal(hubExamples(rows.slice(0, 1), legs, new Set(), "2026-10-19").examples.some((x) => x.label === "Between contracts"), false, "no such crew = no such example");
});

test("crew view: the Data tab carries it, and the audit and examples read no money table in the routes module", () => {
  const W = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(W, /data-set="crewview">Crew view<\/button>/);
  assert.match(W, /if\(s==='crewview'\)return setCrewView\(\);/);
  assert.match(W, /async function setCrewView\(\)/);
  const body = W.slice(W.indexOf("async function hubBonusCount("), W.indexOf("async function crewCount("));
  assert.doesNotMatch(body, /INSERT|UPDATE|DELETE/i);
});

// Norwegian (the Getaway pilot): its own ordering steps, opened first for a crew on an NCL hull (Miguel, 23 Oct 2026: "we
// need to bring them now because the crew has them"). Royal & Celebrity and Azamara keep theirs, as before.
test("ordering: three tabs; an NCL crew opens on Norwegian's MXP steps, Azamara on Azamara's, everyone else on Royal & Celebrity", () => {
  const page = (brand) => hubPage({ first: "Joe", ship: "Norwegian Getaway", brand, on: "2026-11-09", off: "2026-12-24", offSource: "rita", today: "2026-11-10" });
  const checked = (h) => (h.match(/id="(t\d)" checked/) || [])[1];
  assert.equal(checked(page("NCL")), "t3");
  assert.equal(checked(page("Azamara")), "t2");
  assert.equal(checked(page("Royal")), "t1");
  const h = page("NCL");
  assert.match(h, /<label for="t3">Norwegian<\/label>/);
  assert.match(h, /linen keeper raises the Getaway order in MXP, NCL's own system/);
  assert.match(h, /You keep OBP up to date every day/);
  assert.match(h, /an order closes two days before the storing date/);
  assert.match(h, /#t3:checked~\.p3\{display:block\}|#t3:checked~\.p3\{/);
});
