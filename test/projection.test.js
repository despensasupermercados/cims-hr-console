// projection.js — a drop on the board creates a yellow card with the relief modal's dates (2026-09-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjection, defaultProjectionDates } from "../src/projection.js";
import { saveReliefAssignment, addMonthsISO } from "../src/relief_api.js";

let DatabaseSync = null;
try { ({ DatabaseSync } = await import("node:sqlite")); } catch { /* asserted below */ }

const SCHEMA = `
CREATE TABLE crew (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL UNIQUE, first_name TEXT, last_name TEXT, redacted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE vessel (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, brand TEXT NOT NULL);
CREATE TABLE contract (id TEXT PRIMARY KEY, crew_id TEXT NOT NULL, contract_group_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE assignment (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, vessel_id TEXT, vessel_name TEXT NOT NULL, is_transfer INTEGER NOT NULL DEFAULT 0,
  sign_on TEXT NOT NULL, planned_sign_off TEXT, actual_sign_off TEXT, role TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  on_port_seed TEXT, off_port_seed TEXT, override_on_city TEXT, override_off_city TEXT, succeeds_assignment_id TEXT,
  eccr INTEGER NOT NULL DEFAULT 0, air INTEGER NOT NULL DEFAULT 0, hotel INTEGER NOT NULL DEFAULT 0, on_date_conf INTEGER NOT NULL DEFAULT 0, off_date_conf INTEGER NOT NULL DEFAULT 0,
  instructions_sent_at TEXT, signoff_link_sent_at TEXT, review_invite_sent_at TEXT, end_reason TEXT, readiness TEXT);
INSERT INTO vessel (id,name,brand) VALUES ('ves_adventure','Adventure','Royal Caribbean'), ('ves_quest','Quest','Azamara');
INSERT INTO crew (id,agency_id,first_name,last_name) VALUES ('c1','SC-1','Ana','Alpha'), ('c2','SC-2','Ben','Bravo'), ('c3','SC-3','Hidden','Person');
UPDATE crew SET redacted=1 WHERE id='c3';
`;
function envFor(d) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: d.prepare(sql).all(...args) }),
    first: async () => d.prepare(sql).get(...args) ?? null,
    run: async () => { d.prepare(sql).run(...args); return { success: true }; },
  });
  return { DB: { prepare: (sql) => stmt(sql) } };
}
const TODAY = "2026-09-15";
// The board as boardLegs(env) returns it: the Adventure printer signs off 2026-11-29; Quest's is overdue.
const LEGS = [
  { ship: "Adventure", sc: "SC-9", ours: true, on: "2026-03-28", off: "2026-11-29", is_current: true },
  { ship: "Adventure", sc: "SC-8", ours: true, on: "2025-01-01", off: "2025-08-01", is_current: false },
  { ship: "Quest", sc: "SC-7", ours: true, on: "2026-01-06", off: "2026-07-29", is_current: true },
];
const deps = (legs = LEGS) => ({ boardLegs: async () => legs, save: saveReliefAssignment, addMonths: addMonthsISO });
const db = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); return d; };

test("node:sqlite is available, so everything below actually runs", () => {
  assert.ok(DatabaseSync, "node:sqlite unavailable — the projection path went unverified.");
});

test("dates: the current printer's sign-off if ahead, else today; +6 months, +5 on Azamara", () => {
  const a = defaultProjectionDates({ ship: "Adventure", legs: LEGS, today: TODAY, brand: "Royal Caribbean", addMonths: addMonthsISO });
  assert.deepEqual(a, { signOn: "2026-11-29", signOff: "2027-05-29", follows: true });
  const q = defaultProjectionDates({ ship: "Quest", legs: LEGS, today: TODAY, brand: "Azamara", addMonths: addMonthsISO });
  assert.deepEqual(q, { signOn: "2026-09-15", signOff: "2027-02-15", follows: false }, "an overdue printer does not push the plan into the past");
  const none = defaultProjectionDates({ ship: "Edge", legs: LEGS, today: TODAY, brand: "Celebrity", addMonths: addMonthsISO });
  assert.equal(none.signOn, TODAY);
});

test("a drop creates a reliever assignment (yellow card) with those dates, on the vessel row, for that crew", async () => {
  const d = db();
  const res = await createProjection(envFor(d), { agencyId: "SC-1", ship: "Adventure", today: TODAY }, deps());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.sign_on, "2026-11-29"); assert.equal(res.planned_sign_off, "2027-05-29"); assert.equal(res.follows, true);
  const a = d.prepare("SELECT a.*, k.crew_id FROM assignment a JOIN contract k ON k.id=a.contract_id").get();
  assert.equal(a.crew_id, "c1"); assert.equal(a.vessel_id, "ves_adventure"); assert.equal(a.vessel_name, "Adventure");
  assert.equal(a.role, "reliever"); assert.equal(a.sign_on, "2026-11-29"); assert.equal(a.planned_sign_off, "2027-05-29"); assert.equal(a.actual_sign_off, null);
});

test("refusals: unknown crew, hidden crew, unknown ship, the pool, and the same ship twice (two ships is fine)", async () => {
  const d = db();
  const env = envFor(d);
  assert.equal((await createProjection(env, { agencyId: "SC-404", ship: "Adventure", today: TODAY }, deps())).error, "not_found");
  assert.equal((await createProjection(env, { agencyId: "SC-3", ship: "Adventure", today: TODAY }, deps())).error, "not_found", "a hidden card cannot be planned");
  assert.equal((await createProjection(env, { agencyId: "SC-1", ship: "Titanic", today: TODAY }, deps())).error, "unknown_ship");
  assert.equal((await createProjection(env, { agencyId: "SC-1", ship: "__POOL__", today: TODAY }, deps())).error, "bad_request");
  assert.equal((await createProjection(env, { agencyId: "SC-1", ship: "Adventure", today: TODAY }, deps())).ok, true);
  const dup = await createProjection(env, { agencyId: "SC-1", ship: "Adventure", today: TODAY }, deps());
  assert.equal(dup.error, "already_projected");
  assert.ok(dup.id, "names the existing card so the page can point at it");
  const second = await createProjection(env, { agencyId: "SC-1", ship: "Quest", today: TODAY }, deps());
  assert.equal(second.ok, true, "one crew can be on two ships — a jumper's next hull is a second yellow card");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM assignment").get().n, 2);
});
