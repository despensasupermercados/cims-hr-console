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
  fetchOpenAssignments, boardLegsFromDb,
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
  instructions_sent_at TEXT, signoff_link_sent_at TEXT, review_invite_sent_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE ship_leg (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, ship_short TEXT NOT NULL, vessel_id TEXT,
  sc TEXT, crew_id TEXT, ours INTEGER NOT NULL DEFAULT 1, on_date TEXT, off_date TEXT, embark TEXT, disembark TEXT,
  on_conf INTEGER NOT NULL DEFAULT 0, off_conf INTEGER NOT NULL DEFAULT 0, is_current INTEGER NOT NULL DEFAULT 0, source TEXT, updated_at TEXT);
CREATE TABLE keyman_contract3 (sc TEXT NOT NULL, km TEXT, ship TEXT, st TEXT, seq INTEGER, sign_on TEXT, proj_off TEXT, act_off TEXT, imported_at TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE contract_edit (sc TEXT, seq INTEGER, embark TEXT, disembark TEXT, sign_on TEXT, sign_off TEXT, ship TEXT,
  eccr INTEGER DEFAULT 0, air INTEGER DEFAULT 0, hotel INTEGER DEFAULT 0, on_conf INTEGER DEFAULT 0, off_conf INTEGER, updated_at TEXT, on_key TEXT, PRIMARY KEY (sc, seq));
CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
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
