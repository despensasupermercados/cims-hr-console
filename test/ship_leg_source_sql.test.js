// ship_leg_source.js — every query in the board's schedule source, run on REAL SQLite (node:sqlite)
// against the production table shapes.
//
// WHY THIS EXISTS (2026-09-15). PR #112 rewrote fetchOpenAssignments — the yellow-card feed — and
// dropped its `LEFT JOIN vessel v` while still selecting `v.name` / `v.brand`. Every existing test
// of that function used a stub DB that records the SQL string and never parses it, so the suite
// stayed green (728/728) while the FIRST production request to /api/rotation after the deploy
// failed with `D1_ERROR: no such column: v.name` and the Keyman board rendered its toolbar and
// nothing else. board_legs.test.js pins the arity and filters; this file pins that the SQL
// actually executes — the same approach as counter_legs.test.js and roster_export_assignment.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  legsFromCounter, fetchCurrentAssignments, fetchRecentSignoffs, fetchRecordedSignoffs,
  fetchOpenAssignments, boardLegsFromDb, fetchRegistryRows, fetchCounterKeys, fetchContractEdits, fetchVesselBrands,
} from "../src/ship_leg_source.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

// Column sets copied from the production sqlite_master (2026-09-15); only the columns the module
// reads are needed, but the JOIN targets must exist with their real names.
const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT,
  status TEXT, rank_observed TEXT, rank_override TEXT, vessel_observed TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE crew_override (agency_id TEXT PRIMARY KEY, status TEXT, rank_override TEXT, vessel_observed TEXT, retired INTEGER DEFAULT 0);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, brand TEXT NOT NULL, class TEXT, class_tier INTEGER, jr_ps_rule TEXT);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, contract_group_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Active');
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT, vessel_name TEXT NOT NULL,
  is_transfer INTEGER NOT NULL DEFAULT 0, sign_on TEXT NOT NULL, planned_sign_off TEXT, actual_sign_off TEXT,
  role TEXT, succeeds_assignment_id TEXT, on_port_seed TEXT, off_port_seed TEXT, override_on_city TEXT, override_off_city TEXT,
  eccr INTEGER NOT NULL DEFAULT 0, air INTEGER NOT NULL DEFAULT 0, hotel INTEGER NOT NULL DEFAULT 0,
  on_date_conf INTEGER NOT NULL DEFAULT 0, off_date_conf INTEGER NOT NULL DEFAULT 0,
  instructions_sent_at TEXT, signoff_link_sent_at TEXT, review_invite_sent_at TEXT, created_at TEXT, updated_at TEXT,
  deployed_at TEXT, deploy_log_id TEXT);  -- added by ensureRegistrySnapshot / ensureDeployLog (5 Oct 2026): the card stays once sent
CREATE TABLE ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, ship_short TEXT NOT NULL, vessel_id TEXT,
  sc TEXT, crew_id TEXT, ours INTEGER NOT NULL DEFAULT 1, on_date TEXT, off_date TEXT, embark TEXT, disembark TEXT,
  on_conf INTEGER NOT NULL DEFAULT 0, off_conf INTEGER NOT NULL DEFAULT 0, is_current INTEGER NOT NULL DEFAULT 0, source TEXT, updated_at TEXT);
CREATE TABLE keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, imported_at TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT,
  eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, on_conf INTEGER DEFAULT 0, off_conf INTEGER, updated_at TEXT, on_key TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE registry_snapshot (agency_id TEXT PRIMARY KEY, status TEXT, vessel TEXT, run_at TEXT, import_run_id TEXT, name TEXT, raw_status TEXT, embarked_at TEXT, debarked_at TEXT); -- the kept AdvancedQuery (7 Oct 2026: with its schedule columns)
INSERT INTO app_config VALUES ('board_source','ship_leg','2026-07-07');
INSERT INTO vessel (id,name,brand) VALUES ('ves_anthem','Anthem','Royal Caribbean'), ('ves_beyond','Beyond','Celebrity'), ('ves_quest','Quest','Azamara');
INSERT INTO crew (id,agency_id,first_name,last_name,status,rank_observed) VALUES
  ('c1','SC-1','Ana','Alpha','On board','Printer Specialist'),
  ('c2','SC-2','Ben','Bravo','On Vacation','Junior Printer Specialist'),
  ('c3','SC-3','Cy','Charlie','On board','Printer Specialist');
INSERT INTO crew_override (agency_id, rank_override) VALUES ('SC-2','Printer Specialist');
INSERT INTO contract (id,crew_id,contract_group_id) VALUES ('k1','c1','k1'), ('k2','c2','k2'), ('k3','c3','k3');
-- c1: aboard per Rita (started, no sign-off). c2: a future projection with NO vessel_id (name only).
-- c3: ended via the relief board within the trailing window.
INSERT INTO assignment (id,contract_id,vessel_id,vessel_name,sign_on,planned_sign_off,role) VALUES
  ('a1','k1','ves_anthem','Anthem','2026-09-12','2027-02-23','reliever'),
  ('a2','k2',NULL,'Beyond','2026-11-01','2027-05-01','reliever');
INSERT INTO assignment (id,contract_id,vessel_id,vessel_name,sign_on,planned_sign_off,actual_sign_off) VALUES
  ('a3','k3','ves_quest','Quest','2026-03-01','2026-09-01','2026-09-01');
INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off) VALUES ('SC-3','km3','Quest','Onboard',1,'2026-03-01','2026-09-10');
INSERT INTO contract_edit (sc,seq,sign_off,on_key) VALUES ('SC-3',1,'2026-09-01','2026-03-01');
`;
const TODAY = "2026-09-15";

// A D1-shaped handle over node:sqlite: prepare().bind().all()/first() and prepare().all()/first().
function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql) } };
}
const db = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); return d; };

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable — the board's SQL went unverified.");
});

test("every query in ship_leg_source.js executes against the production table shapes", async () => {
  const env = envFor(db());
  await assert.doesNotReject(() => legsFromCounter(env));
  await assert.doesNotReject(() => fetchCurrentAssignments(env, TODAY));
  await assert.doesNotReject(() => fetchRecentSignoffs(env, TODAY));
  await assert.doesNotReject(() => fetchRecordedSignoffs(env));
  await assert.doesNotReject(() => fetchOpenAssignments(env), "the yellow-card feed — this is the query PR #112 broke");
  await assert.doesNotReject(() => fetchRegistryRows(env), "the kept file: the schedule since 7 Oct 2026");
  await assert.doesNotReject(() => fetchCounterKeys(env));
  await assert.doesNotReject(() => fetchContractEdits(env));
  await assert.doesNotReject(() => fetchVesselBrands(env));
  await assert.doesNotReject(() => boardLegsFromDb(env, TODAY));
});

test("fetchOpenAssignments names the ship and brand from the vessel table, and falls back to vessel_name", async () => {
  const rows = await fetchOpenAssignments(envFor(db()));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(byId).sort(), ["a1", "a2"], "open = actual_sign_off IS NULL, started or not; a3 ended");
  assert.equal(byId.a1.ship, "Anthem");
  assert.equal(byId.a1.brand, "Royal Caribbean", "brand comes ONLY from the vessel join — without it every card was brandless");
  assert.equal(byId.a1.sc, "SC-1");
  assert.equal(byId.a1.crew_name, "Ana Alpha");
  assert.equal(byId.a2.ship, "Beyond", "no vessel_id -> the assignment's own vessel_name");
  assert.equal(byId.a2.brand, null);
  assert.equal(byId.a2.rank, "Printer Specialist", "crew_override.rank_override wins over the imported rank");
});

test("the in-force and ended arms still resolve through the vessel table", async () => {
  const env = envFor(db());
  const cur = await fetchCurrentAssignments(env, TODAY);
  assert.deepEqual(cur.map((r) => [r.sc, r.ship, r.brand]), [["SC-1", "Anthem", "Royal Caribbean"]]);
  const ended = await fetchRecentSignoffs(env, TODAY);
  assert.deepEqual(ended.map((r) => [r.sc, r.ship, r.actual_sign_off]), [["SC-3", "Quest", "2026-09-01"]]);
  const rec = await fetchRecordedSignoffs(env);
  assert.equal(rec["SC-3|2026-03-01"], "2026-09-01");
});

test("STATIC GUARD: any assignment query that reads the vessel alias declares the vessel join", () => {
  // Belt and braces for the runtime test above: a new query added to this module without a
  // fixture row would pass the execution test on an empty table shape, but not this.
  const src = readFileSync(new URL("../src/ship_leg_source.js", import.meta.url), "utf8");
  const queries = src.match(/`[^`]*FROM assignment a[^`]*`/g) || [];
  assert.ok(queries.length >= 3, "expected the in-force, ended and open assignment queries");
  for (const q of queries) {
    if (/\bv\.(name|brand)\b/.test(q)) assert.match(q, /LEFT JOIN vessel v ON v\.id = a\.vessel_id/, "selects v.* without joining vessel v:\n" + q);
  }
});

// 5 Oct 2026 review: the edit belongs to a CONTRACT (on_key = the leg's sign-on), never to a position.
// Joining contract_edit by seq handed Rita's recorded sign-off to whatever contract landed on that seq
// after a multi-block Counter renumbered the rows — every live edit sits on seq 1 today.
test("a recorded sign-off follows its contract (on_key) when a multi-block Counter renumbers the rows; a legacy edit without on_key still joins by seq", async () => {
  const d = db();
  // X: edit filed at seq 1 with on_key 2026-03-14 = the current contract. A full Counter then arrives as
  // three blocks: seq 1 = 2023, seq 2 = 2024, seq 3 = 2026-03-14 (current).
  d.exec(`
    INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off) VALUES
      ('SC-X','kmx','Anthem','Onboard',1,'2023-01-10','2023-07-10'),
      ('SC-X','kmx','Anthem','Onboard',2,'2024-09-01','2025-03-01'),
      ('SC-X','kmx','Anthem','Onboard',3,'2026-03-14','2026-09-14');
    INSERT INTO contract_edit (sc,seq,sign_off,on_key,updated_at) VALUES ('SC-X',1,'2026-09-20','2026-03-14','2026-09-12T10:00:00Z');
    -- Y: an edit written before on_key existed: position is all it has
    INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off) VALUES ('SC-Y','kmy','Beyond','Onboard',1,'2026-01-05','2026-07-05');
    INSERT INTO contract_edit (sc,seq,sign_off,on_key,updated_at) VALUES ('SC-Y',1,'2026-07-01',NULL,'2026-06-20T10:00:00Z');
  `);
  const env = envFor(d);
  const rec = await fetchRecordedSignoffs(env);
  assert.equal(rec["SC-X|2026-03-14"], "2026-09-20", "the 20 Sep sign-off sits on the 2026 contract");
  assert.equal(rec["SC-X|2023-01-10"], undefined, "and NOT on the 2023 contract that now occupies seq 1");
  assert.equal(rec["SC-Y|2026-01-05"], "2026-07-01", "legacy edit: by position");
  // the schedule legs carry the same attachment (COUNTER_LEG_SELECT joins the same way)
  const legs = await legsFromCounter(env);
  const x = legs.filter((l) => l.sc === "SC-X").sort((a, b) => (a.on < b.on ? -1 : 1));
  assert.deepEqual(x.map((l) => [l.on, l.is_current]), [["2023-01-10", false], ["2024-09-01", false], ["2026-03-14", true]]);
});

// THE NEWER WRITE WINS (Miguel, 14 Sep 2026) applies to the recorded sign-off too: a Counter stamped
// AFTER Rita's edit reopens the leg (the upload's dry-run listed it under "overrides"); an unstamped
// row (every row today) is older than any edit, so her sign-off stands.
test("a Counter row stamped after the edit reopens the leg; an unstamped row keeps Rita's sign-off; TDG's act_off always counts", async () => {
  const d = db();
  d.exec(`
    INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off,imported_at) VALUES
      ('SC-N','kmn','Anthem','Onboard',1,'2026-04-01','2026-11-15','2026-10-03T09:00:00Z'),   -- newer than the edit
      ('SC-O','kmo','Anthem','Onboard',1,'2026-04-01','2026-11-15',NULL),                      -- the July seed
      ('SC-A','kma','Anthem','Onboard',1,'2026-04-01','2026-11-15','2026-10-03T09:00:00Z');
    UPDATE keyman_contract3 SET act_off='2026-09-30' WHERE sc='SC-A';
    INSERT INTO contract_edit (sc,seq,sign_off,on_key,updated_at) VALUES
      ('SC-N',1,'2026-10-01','2026-04-01','2026-09-20T10:00:00Z'),
      ('SC-O',1,'2026-10-01','2026-04-01','2026-09-20T10:00:00Z'),
      ('SC-A',1,'2026-10-20','2026-04-01','2026-10-04T10:00:00Z');
  `);
  const rec = await fetchRecordedSignoffs(envFor(d));
  assert.equal(rec["SC-N|2026-04-01"], undefined, "the 3 Oct Counter is newer than the 20 Sep edit: the leg is open again, projected 15 Nov");
  assert.equal(rec["SC-O|2026-04-01"], "2026-10-01", "unstamped row: Rita's recorded sign-off stands");
  assert.equal(rec["SC-A|2026-04-01"], "2026-09-30", "TDG's own act_off wins over everything");
});

// Night watch, 15 Nov 2026 (Edward Francis Guazon, Liberty). A Counter contract closed by the sign-off Rita typed and
// confirmed (5 Nov) carried NO sign-off source, while the same date on a file-dated contract reads "rita". The 10 Nov
// AdvancedQuery moved him from On board Liberty straight to Earmarked for Icon (one row per crew, no dates), so his
// Liberty contract came back from the Counter as history with off = 5 Nov and offSource undefined — and the
// end-of-contract survey, which asks only a contract ended by tdg / rita / card, never invited him (due 8 Nov).
test("a Counter contract closed by Rita's recorded sign-off says so (offSource rita), and the crew survey asks it", async () => {
  const d = db();
  d.exec(`
    INSERT INTO vessel (id,name,brand) VALUES ('ves_liberty','Liberty','Royal Caribbean'), ('ves_icon','Icon','Royal Caribbean');
    INSERT INTO crew (id,agency_id,first_name,last_name,status) VALUES ('cg','SC-G','Edward','Guazon','Earmarked');
    INSERT INTO registry_snapshot (agency_id,status,vessel,run_at,name,raw_status) VALUES
      ('SC-G','Earmarked','MV ICON OF THE SEAS','2026-11-10T18:27:46.788Z','Edward Francis Guazon','Earmarked');
    INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off) VALUES ('SC-G',NULL,'Liberty',NULL,1,'2026-02-09','2026-10-31');
    INSERT INTO contract_edit (sc,seq,sign_on,sign_off,ship,off_conf,updated_at,on_key) VALUES
      ('SC-G',1,'2026-02-09','2026-11-05','Liberty',1,'2026-10-10T09:51:29.231Z','2026-02-09');
  `);
  const today = "2026-11-15";
  const legs = await boardLegsFromDb(envFor(d), today);
  const g = legs.filter((l) => l.sc === "SC-G");
  assert.equal(g.length, 1, "his Liberty contract is on the schedule once");
  assert.equal(g[0].off, "2026-11-05", "Rita's recorded sign-off dates it");
  assert.equal(g[0].is_current, false, "and it has passed: the contract ended");
  assert.equal(g[0].offSource, "rita", "the sign-off is Rita's, as it reads on a file-dated contract");
  const { surveyDue } = await import("../src/crew_survey.js");
  const { endedLegs } = await import("../src/crew_survey_send.js");
  assert.deepEqual(surveyDue(legs, today, "2026-10-23").map((l) => l.sc), ["SC-G"], "the survey asks it (3+ days after, within 30)");
  // the report's loop counts every ended contract, the fixture's SC-3 too (Quest, closed by Rita's 1 Sep date, out of the window)
  assert.deepEqual(endedLegs(legs).map((l) => l.sc).sort(), ["SC-3", "SC-G"]);
  // TDG's own actual sign-off on the Counter stays TDG's
  d.exec("UPDATE keyman_contract3 SET act_off='2026-11-04' WHERE sc='SC-G'");
  const t = (await boardLegsFromDb(envFor(d), "2026-11-16")).find((l) => l.sc === "SC-G");
  assert.equal(t.off, "2026-11-04");
  assert.equal(t.offSource, "tdg");
});

// 16 Nov 2026 bug hunt: the contract modal files Rita's sign-off under the FILE's embark date; the Counter's sign-on for the
// same contract can sit a few days from it. Joined to the day, her date never reached the Counter leg.
test("Rita's sign-off keyed on the file's embark reaches the Counter contract within ABSORB_DAYS, never a contract further away", async () => {
  const d = db();
  d.exec(`
    INSERT INTO keyman_contract3 (sc,km,ship,st,seq,sign_on,proj_off) VALUES
      ('SC-G','kmg','Liberty','Onboard',1,'2026-04-05','2026-11-08'),
      ('SC-F','kmf','Liberty','Onboard',1,'2026-04-05','2026-11-08');
    INSERT INTO contract_edit (sc,seq,sign_off,on_key,updated_at) VALUES ('SC-G',2,'2026-11-05','2026-04-03','2026-10-30T10:00:00Z');
    INSERT INTO contract_edit (sc,seq,sign_off,on_key,updated_at) VALUES ('SC-F',2,'2026-11-05','2026-03-20','2026-10-30T10:00:00Z');
  `);
  const rec = await fetchRecordedSignoffs(envFor(d));
  assert.equal(rec["SC-G|2026-04-05"], "2026-11-05", "two days apart: the same contract");
  assert.equal(rec.sources["SC-G|2026-04-05"].offSource, "rita");
  assert.equal(rec["SC-F|2026-04-05"], undefined, "sixteen days apart: another contract's edit");
});
