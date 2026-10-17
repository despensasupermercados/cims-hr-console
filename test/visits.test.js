// A TRAINING VISIT IS A TRIP, NOT A CONTRACT (Miguel, 17 Oct 2026: Jonathan "sometimes he goes to the ship to teach as crew
// and then home [to] support .. same as Ohji"; "Rita ticks 'Training visit'"; a visit gets no instructions email, is never
// the reliever, is not a completed contract, is off the bench and the seats). src/visits.js; each case below failed on the
// code before the rule — the trainer's embark dated the printer's sign-off, his debark added a contract, he sat as a seat.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { isShoreCrew, visitSet, isVisit } from "../src/visits.js";
import { legsFromRegistry } from "../src/ship_leg_source.js";
import { completedSince } from "../src/contract_count.js";
import { benchPool } from "../src/earmark_bench.js";
import { handovers } from "../src/crew_profile.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SRC = readFileSync(new URL("../src/worker.js", import.meta.url), "utf-8");
const TMP = new URL(`../src/__visits_${process.pid}__.mjs`, import.meta.url);
writeFileSync(TMP, SRC + "\nexport { apiContractVisit, contractCountMap };\n");
let W;
try { W = await import(TMP.href); } finally { unlinkSync(TMP); }

const AT = "2026-10-16";
const row = (sc, vessel, embarked_at, o = {}) => ({ sc, status: "On board", raw_status: "On board", vessel, embarked_at, debarked_at: null, run_at: AT, crew_id: "c" + sc, crew_name: "Crew " + sc, first_name: "F" + sc, last_name: "L" + sc, ...o });

test("who is shoreside, and which trip is a visit", () => {
  assert.equal(isShoreCrew({ agency_id: "SC-0038378" }), true, "Ohji Garcia Miranda");
  assert.equal(isShoreCrew({ agency_id: "SC-X", first_name: "Ohji", last_name: "Miranda" }), true, "by name when TDG's id differs");
  assert.equal(isShoreCrew({ agency_id: "SC-0041465", first_name: "Jonathan", last_name: "Alonzo" }), false, "Jonathan sails full contracts too: his trips are ticked one by one");
  const set = visitSet([{ sc: "SC-0041465", on_key: "2026-10-16" }, { sc: "SC-Z", on_key: "bad" }]);
  assert.equal(isVisit(set, "SC-0041465", "2026-10-16"), true);
  assert.equal(isVisit(set, "SC-0041465", "2025-12-06"), false, "his Rhapsody contract is a contract");
  assert.equal(isVisit(set, "SC-Z", "2026-10-16"), false);
});

test("the trainer's embark never dates the printer's sign-off, and his trip is marked a visit", () => {
  // Onward, 7 Sep 2026: Ohji (shoreside) embarked to teach while Mary Vivien Medidas was aboard since 11 Jun. The file's
  // cross-over read his embark as her relief: her sign-off read 7 Sep while he was aboard.
  const onward = legsFromRegistry({ rows: [row("SC-MED", "MV AZAMARA ONWARD", "2026-06-11"), row("SC-0038378", "MV AZAMARA ONWARD", "2026-09-07", { first_name: "Ohji", last_name: "Miranda" })], today: "2026-09-09" });
  const med = onward.find((l) => l.sc === "SC-MED"), ohji = onward.find((l) => l.sc === "SC-0038378");
  assert.notEqual(med.off, "2026-09-07", "a visit is not the relief");
  assert.equal(med.offSource, "projected");
  assert.ok(!med.reliever);
  assert.equal(ohji.visit, true);
  // Pursuit, 16 Oct 2026: Jonathan's trip ticked by Rita; with no other crew joining, Kevin keeps his own sign-off.
  const rows = [row("SC-K", "MV AZAMARA PURSUIT", "2026-05-02"), row("SC-0041465", "MV AZAMARA PURSUIT", "2026-10-16")];
  const before = legsFromRegistry({ rows, today: "2026-10-17" }).find((l) => l.sc === "SC-K");
  assert.equal(before.off, "2026-10-16", "without the tick the trainer is read as the relief (the code before the rule)");
  const pur = legsFromRegistry({ rows, today: "2026-10-17", visits: [{ sc: "SC-0041465", on_key: "2026-10-16" }] });
  assert.equal(pur.find((l) => l.sc === "SC-K").offSource, "projected");
  assert.equal(pur.find((l) => l.sc === "SC-0041465").visit, true);
  // A.J. embarking the same day is still the cross-over: a real reliever is untouched by the rule.
  const withAJ = legsFromRegistry({ rows: rows.concat([row("SC-A", "MV AZAMARA PURSUIT", "2026-10-16")]), today: "2026-10-17", visits: [{ sc: "SC-0041465", on_key: "2026-10-16" }] });
  const k = withAJ.find((l) => l.sc === "SC-K");
  assert.equal(k.off, "2026-10-16");
  assert.equal(k.reliever.sc, "SC-A");
});

test("a visit's debark is not a contract finished since the count", () => {
  assert.equal(completedSince("2026-10-08", { embarked_at: "2026-10-16", debarked_at: "2026-10-24" }, "2026-10-30"), 1, "a contract");
  assert.equal(completedSince("2026-10-08", { embarked_at: "2026-10-16", debarked_at: "2026-10-24", visit: true }, "2026-10-30"), 0, "a training visit");
});

test("the count join reads Rita's tick and the shoreside team on real SQLite", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE contract_count (sc TEXT PRIMARY KEY, km TEXT, completed INTEGER NOT NULL, position TEXT, tab TEXT, as_of TEXT, imported_at TEXT, imported_by TEXT);
    CREATE TABLE registry_snapshot (agency_id TEXT PRIMARY KEY, embarked_at TEXT, debarked_at TEXT);
    CREATE TABLE contract_visit (sc TEXT NOT NULL, on_key TEXT NOT NULL, set_by TEXT, set_at TEXT NOT NULL, PRIMARY KEY (sc, on_key));
    CREATE TABLE crew (agency_id TEXT, first_name TEXT, last_name TEXT);
    INSERT INTO contract_count (sc, completed, as_of) VALUES ('SC-J', 2, '2026-10-08'), ('SC-O', 3, '2026-10-08'), ('SC-C', 4, '2026-10-08');
    INSERT INTO registry_snapshot VALUES ('SC-J', '2026-10-16', '2026-10-24'), ('SC-O', '2026-10-10', '2026-10-15'), ('SC-C', '2026-04-01', '2026-10-12');
    INSERT INTO contract_visit VALUES ('SC-J', '2026-10-16', 'rita', '2026-10-17');
    INSERT INTO crew VALUES ('SC-J', 'Jonathan', 'Alonzo'), ('SC-O', 'Ohji', 'Miranda'), ('SC-C', 'Kevin', 'Jugao');`);
  const env = { DB: { prepare: (sql) => { const st = (a = []) => ({ bind: (...x) => st(x), all: async () => ({ results: d.prepare(sql).all(...a) }), first: async () => d.prepare(sql).get(...a) ?? null }); return st(); } } };
  const m = await W.contractCountMap(env);
  assert.equal(m["SC-J"].added, 0, "Rita ticked the trip a training visit");
  assert.equal(m["SC-O"].added, 0, "the shoreside team's trips are visits");
  assert.equal(m["SC-C"].added, 1, "a contract finished since the count still adds one");
});

test("off the bench while the latest trip is a visit", () => {
  const crew = [{ sc: "SC-J", name: "Jonathan", status: "On Vacation" }, { sc: "SC-P", name: "Printer", status: "On Vacation" }];
  const legs = [
    { sc: "SC-J", ours: true, ship: "Rhapsody", on: "2025-12-06", off: "2026-09-12", is_current: false },
    { sc: "SC-J", ours: true, ship: "Pursuit", on: "2026-10-16", off: "2026-10-24", is_current: false, visit: true },
    { sc: "SC-P", ours: true, ship: "Wonder", on: "2026-03-01", off: "2026-09-30", is_current: false },
  ];
  const pool = benchPool({ crew, legs, today: "2026-11-01" });
  assert.deepEqual(pool.map((x) => x.sc), ["SC-P"]);
  const after = benchPool({ crew, legs: legs.filter((l) => !l.visit), today: "2026-11-01" });
  assert.ok(after.some((x) => x.sc === "SC-J"), "with a contract as the latest trip he is on the bench like anyone");
});

test("the profile never names a visit as who handed over or who takes over", () => {
  const c = { ship: "Pursuit", on: "2026-05-02", off: "2026-10-31" };
  const legs = [{ sc: "SC-J", ship: "Pursuit", on: "2026-10-16", off: "2026-10-24", visit: true }, { sc: "SC-A", ship: "Pursuit", on: "2026-10-16", off: "2027-03-16" }];
  assert.equal(handovers(c, { legs, sc: "SC-K" }).after.sc, "SC-A");
  assert.equal(handovers(c, { legs: legs.slice(0, 1), sc: "SC-K" }).after, null);
  const d = { ship: "Pursuit", on: "2026-11-01" };
  assert.equal(handovers(d, { legs: [{ sc: "SC-J", ship: "Pursuit", on: "2026-10-16", off: "2026-10-24", visit: true }], sc: "SC-N" }).before, null);
});

test("Rita's tick: saved per trip, cleared with false, audited; a bad request writes nothing", async () => {
  assert.ok(DatabaseSync, "node:sqlite");
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE crew (id TEXT, agency_id TEXT, first_name TEXT, last_name TEXT, status TEXT);
    INSERT INTO crew VALUES ('c1','SC-0041465','Jonathan','Alonzo','On board');
    CREATE TABLE agency (id TEXT, code TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE activity_log (id TEXT PRIMARY KEY, user_id TEXT, action TEXT, detail TEXT, at TEXT);
    CREATE TABLE crew_ready (agency_id TEXT PRIMARY KEY);`);
  const stmt = (sql, a = []) => ({ bind: (...x) => stmt(sql, x), all: async () => ({ results: d.prepare(sql).all(...a) }), first: async () => d.prepare(sql).get(...a) ?? null,
    run: async () => { try { d.prepare(sql).run(...a); } catch (e) { if (!/duplicate column|already exists/.test(String(e.message))) throw e; } return { success: true }; } });
  const env = { DB: { prepare: (sql) => stmt(sql), batch: async (st) => { const o = []; for (const x of st) o.push(await x.run()); return o; } } };
  const call = (body) => W.apiContractVisit({ json: async () => body }, env, { email: "rita@dg3.com" });
  let r = await call({ agency_id: "SC-0041465", on_key: "2026-10-16", visit: true });
  assert.equal(r.status, 200);
  assert.deepEqual(d.prepare("SELECT sc, on_key, set_by FROM contract_visit").all().map((x) => ({ ...x })), [{ sc: "SC-0041465", on_key: "2026-10-16", set_by: "rita@dg3.com" }]);
  r = await call({ agency_id: "SC-0041465", on_key: "2026-10-16", visit: "yes" });
  assert.equal(r.status, 400, "the tick is a boolean");
  r = await call({ agency_id: "SC-NOPE", on_key: "2026-10-16", visit: true });
  assert.equal(r.status, 404);
  r = await call({ agency_id: "SC-0041465", on_key: "2026-10-16", visit: false });
  assert.equal(r.status, 200);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM contract_visit").get().n, 0);
  assert.deepEqual(d.prepare("SELECT detail FROM activity_log WHERE action='contract_visit' ORDER BY at").all().map((x) => x.detail), ["SC-0041465 2026-10-16 training visit", "SC-0041465 2026-10-16 cleared"]);
});

test("the board carries visits beside the seats, the page draws and opens them, the schema is on record", () => {
  assert.match(SRC, /const visits = \(promByShip\[ship\] \|\| \[\]\)\.filter\(\(c\) => c\.visit\)/, "visits leave the seats");
  assert.match(SRC, /const crew = \(promByShip\[ship\] \|\| \[\]\)\.filter\(\(c\) => !c\.visit\)/);
  assert.match(SRC, /crew, visits, projections:/, "the section carries them");
  assert.match(SRC, /visits:s\.visits\|\|\[\],history:hist\}/, "drawRotation's clone carries them (the 15 Sep 2026 field-drop trap)");
  assert.match(SRC, /\(s\.crew\|\|\[\]\)\.concat\(s\.visits\|\|\[\]\)\.forEach/, "the contract window opens a visit too");
  assert.match(SRC, /'\+visitRows\+sentRows\+histBlock\+'/, "the ship draws the visit line");
  assert.match(SRC, /ck\('cVisit','TRAINING VISIT',e\.visit\)/, "Rita's tick");
  assert.match(SRC, /"\/api\/crew\/contract-visit" && request\.method === "POST"/);
  assert.match(SRC, /CREATE TABLE IF NOT EXISTS contract_visit/);
  assert.ok(existsSync(new URL("../migrations/0032_contract_visit.sql", import.meta.url)));
  assert.doesNotMatch(SRC, /const SHORE_IDS = new Set/, "one shoreside list (visits.js), not two");
});
