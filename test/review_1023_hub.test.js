// The 23 Oct 2026 review of the Crew Hub, the welcome email and Getaway on the dashboard. Each test fails on the code as
// merged before the review and pins the rule it broke (CLAUDE.md §10k, §10l, §11c).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWelcome, WELCOME_DDL } from "../src/welcome_send.js";
import { installHub, HUB_DDL, hubModel } from "../src/crew_hub_routes.js";
import { currentLeg } from "../src/welcome_context.js";
import { hubPage } from "../src/crew_hub.js";
import { buildOps } from "../src/ops_dashboard.js";

let DatabaseSync;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

function setup(state) {
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, last_name TEXT, rank_observed TEXT, email TEXT, baseline_count INTEGER)");
  d.exec("CREATE TABLE crew_override (agency_id TEXT, email TEXT)");
  d.exec("CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT)");
  d.exec("CREATE TABLE app_setting (k TEXT PRIMARY KEY, v TEXT)");
  d.exec("CREATE TABLE crew_trainer (sc TEXT PRIMARY KEY)");
  d.exec("CREATE TABLE contract_visit (sc TEXT, on_key TEXT, kind TEXT)");
  d.exec("INSERT INTO crew VALUES ('c1','SC-JOE','Joe Art','Eresmas',NULL,'joe@gmail.com',NULL), ('c2','SC-OHJI','Ohji','Miranda',NULL,'ohji@gmail.com',NULL)");
  d.exec("INSERT INTO app_setting VALUES ('welcome_auto_enabled','true'), ('welcome_auto_since','2026-10-19')");
  d.exec("INSERT INTO crew_trainer VALUES ('SC-OHJI')");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null, run: async () => ({ meta: { changes: d.prepare(sql).run(...args).changes } }) });
  const env = { DB: { prepare: (s) => stmt(s), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const mail = [];
  const hub = installHub({ ensure: async (e) => { for (const q of HUB_DDL) await e.DB.prepare(q).run(); }, boardLegs: async () => { if (state.fail) throw new Error("D1 read failed"); return state.legs; }, bonusCount: async () => null, json, today: () => state.today });
  const w = installWelcome({ ensure: async (e) => { for (const q of [...HUB_DDL, ...WELCOME_DDL]) await e.DB.prepare(q).run(); }, boardLegs: async () => state.legs,
    linkFor: (e, sc, who) => hub.linkFor(e, sc, who), contacts: async () => [],
    sendMail: async (e, m) => { mail.push(m); return { ok: true }; }, json, today: () => state.today, origin: () => "https://cims.work" });
  return { d, env, w, hub, mail };
}
const gate = (day) => ({ scheduledTime: Date.parse(day + "T12:00:00Z") }); // 07:00 Miami (EST after 1 Nov)

test("node:sqlite is available", () => assert.ok(DatabaseSync));

test("once per contract when the sign-on moves: Rita's card says 9 Nov, the file embarks him 8 Nov — one welcome", async () => {
  const state = { today: "2026-11-09", legs: [{ sc: "SC-JOE", name: "Joe Art Eresmas", ship: "Getaway", brand: "NCL", on: "2026-11-09", off: "2027-05-23", is_current: true, ours: true, source: "assignment" }] };
  const f = setup(state);
  assert.equal((await f.w.run(f.env, gate("2026-11-09"))).sent.length, 1);
  state.today = "2026-11-10";
  state.legs = [{ sc: "SC-JOE", name: "Joe Art Eresmas", ship: "Getaway", brand: "NCL", on: "2026-11-08", off: "2027-05-23", is_current: true, ours: true, source: "registry", fileAt: "2026-11-10" }];
  const r2 = await f.w.run(f.env, gate("2026-11-10"));
  assert.equal(r2.sent.length, 0); assert.equal(f.mail.length, 1, "one welcome for one contract");
  const dry = await f.w.sendFor(f.env, "SC-JOE", { dry: true });
  assert.ok(dry.sent_before, "the profile's dry run says it went");
});

test("a trainer's trip only Rita's card holds is a training visit: never welcomed", async () => {
  const state = { today: "2026-11-02", legs: [{ sc: "SC-OHJI", name: "Ohji Miranda", ship: "Onward", brand: "Azamara", on: "2026-11-02", off: "2026-11-09", is_current: true, ours: true, source: "assignment" }] };
  const f = setup(state);
  assert.equal((await f.w.run(f.env, gate("2026-11-02"))).sent.length, 0);
  assert.equal(f.mail.length, 0);
  f.d.exec("INSERT INTO contract_visit VALUES ('SC-OHJI','2026-11-02','contract')"); // Rita marked THIS trip a full contract
  assert.equal((await f.w.run(f.env, gate("2026-11-02"))).sent.length, 1);
});

test("a card a later TDG file contradicts is not the crew's contract on the Hub (the file's seat is)", () => {
  const legs = [
    { sc: "SC-9", ship: "Jewel", on: "2026-08-28", off: "2027-03-28", is_current: true, ours: true, source: "registry", fileAt: "2026-10-22" },
    { sc: "SC-9", ship: "Allure", on: "2026-10-20", off: "2027-05-20", is_current: true, ours: true, source: "assignment" }];
  assert.equal(currentLeg(legs, "SC-9").ship, "Jewel");
  // a file dated BEFORE the card's sign-on could not see it: the card still stands
  assert.equal(currentLeg([{ ...legs[0], fileAt: "2026-10-16" }, legs[1]], "SC-9").ship, "Allure");
});

test("the Hub never says '-17 days to go': the sign-off day and past it are said in words", () => {
  const page = (today) => hubPage(hubModel({ crew: { first_name: "Kevin" }, leg: { ship: "Pursuit", on: "2026-03-01", off: "2026-10-16", offSource: "tdg" }, count: null, today }));
  assert.match(page("2026-10-16"), /sign-off today/);
  const past = page("2026-11-02");
  assert.match(past, /past the planned sign-off/);
  assert.doesNotMatch(past, /-\d+ days? to go/);
  assert.match(page("2026-10-15"), /1 day to go/);
});

test("a failed board read is 'could not load', never 'Between contracts' to a seafarer aboard", async () => {
  const state = { today: "2026-10-23", legs: [], fail: true };
  const f = setup(state);
  const link = await f.hub.linkFor(f.env, "SC-JOE", "rita");
  const u = new URL("https://hub.cims.work/hub/" + link.token);
  const res = await f.hub(u.pathname, new Request(u), f.env, u, null);
  assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /Between contracts/);
});

test("a year payroll has not published names that year, not the next", () => {
  const h = hubPage(hubModel({ crew: { first_name: "Kevin" }, leg: null, count: null, today: "2027-01-05" }));
  assert.match(h, /The 2027 dates appear here as soon as payroll publishes them/);
  assert.doesNotMatch(h, /The 2028 dates appear/);
});

test("Getaway before service with nobody planned is not an uncovered ship on the dashboard", () => {
  const ops = buildOps({ today: "2026-10-23", crew: [], sections: [{ ship: "Getaway", brand: "NCL", from: "2026-11-16", crew: [], projections: [] }] });
  const tiles = ops.coverage.brands.flatMap((b) => b.tiles);
  assert.equal(tiles.filter((t) => t.ship === "Getaway").length, 0);
  assert.equal(ops.coverage.tiers.past, 0, "not counted red on the tiles either");
  // from its first day in service, an empty hull is uncovered like any other
  const live = buildOps({ today: "2026-11-16", crew: [], sections: [{ ship: "Getaway", brand: "NCL", from: null, crew: [], projections: [] }] });
  assert.equal(live.coverage.brands.flatMap((b) => b.tiles).filter((t) => t.ship === "Getaway" && t.tier === "past").length, 1);
});
